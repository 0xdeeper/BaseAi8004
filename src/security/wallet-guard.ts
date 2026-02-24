// src/security/wallet-guard.ts
import fs from "node:fs";
import path from "node:path";

export type HexAddress = `0x${string}`;

export type TxIntent = {
  chainId: number;
  from?: HexAddress;
  to?: HexAddress;                // undefined for contract creation
  valueWei?: bigint;              // native token value
  dataHex?: `0x${string}`;        // calldata
};

/**
 * Result of a preflight simulation (eth_call).
 * Keep it deterministic: no LLM text, only structured fields.
 */
export type SimulationResult = {
  ok: boolean;
  reason?: string;
};

export type WalletGuardConfig = {
  // Kill switch
  autonomyEnabled: boolean;

  // Allowlist chains (ex: [8453])
  allowedChainIds: Set<number>;

  // Native spend controls
  maxTxValueWei: bigint;          // hard cap per tx
  maxDailyValueWei: bigint;       // hard cap per day

  // Destination controls
  allowlistedTo?: Set<string>;    // if set, ONLY allow these to addresses
  blocklistedTo?: Set<string>;    // always block these

  // Approval controls (phase 1/2 baseline)
  blockTokenApprovals: boolean;   // blocks ERC20 approve calls unless explicitly allowed (phase 3)

  // Phase 3: USDC policy
  usdc?: {
    tokenAddress: string;             // lowercase
    allowApprovals: boolean;          // ALLOW_USDC_APPROVALS
    allowlistedSpenders?: Set<string>; // lowercase
    maxTxUnits: bigint;               // MAX_USDC_TX (6 decimals units)
    maxDailyUnits: bigint;            // MAX_USDC_DAILY
    maxApprovalUnits: bigint;         // MAX_USDC_APPROVAL
  };

  // Require simulation before sending
  requireSimulation: boolean;

  // Where to store local daily spend ledger
  ledgerFilePath: string;
};

const DEFAULT_LEDGER_FILENAME = "wallet-guard-ledger.json";

/**
 * Backward compatible ledger.
 * Old format: { dayKey, spentWei }
 * New format: { dayKey, spentWei, tokenSpent?: { [tokenAddrLower]: string } }
 */
type Ledger = {
  dayKey: string;                           // YYYY-MM-DD (local)
  spentWei: string;                         // bigint serialized
  tokenSpent?: Record<string, string>;      // per-token daily spent (raw token units)
};

function toLowerAddr(a?: string): string | undefined {
  return a ? a.toLowerCase() : undefined;
}

function assertHexAddress(addr: unknown, name: string): asserts addr is HexAddress {
  if (typeof addr !== "string") throw new Error(`${name} must be a valid 0x address`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) throw new Error(`${name} must be a valid 0x address`);
}

function dayKeyLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function readLedger(filePath: string): Ledger {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const j = JSON.parse(raw) as Ledger;
    if (!j?.dayKey || typeof j.dayKey !== "string") throw new Error("bad ledger dayKey");
    if (!j?.spentWei || typeof j.spentWei !== "string") throw new Error("bad ledger spentWei");
    if (j.tokenSpent && typeof j.tokenSpent !== "object") throw new Error("bad ledger tokenSpent");
    return j;
  } catch {
    return { dayKey: dayKeyLocal(), spentWei: "0", tokenSpent: {} };
  }
}

function writeLedger(filePath: string, ledger: Ledger) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(ledger, null, 2), "utf8");
}

function envBigInt(name: string, fallback: string): bigint {
  const raw = (process.env[name] ?? fallback).trim();
  try {
    return BigInt(raw);
  } catch {
    throw new Error(`${name} must be a valid bigint string (got: ${raw})`);
  }
}

// -------------------------
// ERC20 decoding (minimal)
// -------------------------
const ERC20_APPROVE_SELECTOR = "0x095ea7b3";     // approve(address,uint256)
const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";    // transfer(address,uint256)
const ERC20_TRANSFERFROM_SELECTOR = "0x23b872dd"; // transferFrom(address,address,uint256)

function selectorOf(dataHex?: string): string | undefined {
  if (!dataHex || dataHex.length < 10) return undefined;
  return dataHex.slice(0, 10).toLowerCase();
}

function looksLikeErc20Call(dataHex?: string): boolean {
  const s = selectorOf(dataHex);
  return (
    s === ERC20_APPROVE_SELECTOR ||
    s === ERC20_TRANSFER_SELECTOR ||
    s === ERC20_TRANSFERFROM_SELECTOR
  );
}

function readWord(hex: string, wordIndex: number): string {
  // hex is WITHOUT 0x
  const start = wordIndex * 64;
  const end = start + 64;
  if (hex.length < end) throw new Error("calldata too short");
  return hex.slice(start, end);
}

function wordToAddress(word64: string): string {
  // last 40 hex chars
  const a = word64.slice(24).toLowerCase();
  return `0x${a}`;
}

function wordToUint(word64: string): bigint {
  return BigInt(`0x${word64}`);
}

type DecodedErc20 =
  | { kind: "approve"; spender: string; amount: bigint }
  | { kind: "transfer"; to: string; amount: bigint }
  | { kind: "transferFrom"; from: string; to: string; amount: bigint };

function decodeErc20(dataHex: string): DecodedErc20 | undefined {
  const sig = selectorOf(dataHex);
  if (!sig) return undefined;

  const body = dataHex.slice(10); // strip selector (8 hex chars) + 0x
  const hex = body.startsWith("0x") ? body.slice(2) : body; // in case
  // But dataHex is "0x" + selector + args; after slice(10) we already removed "0x" + selector.
  // So here `hex` should already be args-only.
  const argsHex = body; // already args only, no 0x prefix

  const args = argsHex.toLowerCase();
  // Ensure even-length and multiple of 64 for our minimal decoding assumptions
  if (!/^[0-9a-f]*$/.test(args) || args.length % 2 !== 0) throw new Error("invalid calldata hex");

  if (sig === ERC20_APPROVE_SELECTOR) {
    const spender = wordToAddress(readWord(args, 0));
    const amount = wordToUint(readWord(args, 1));
    return { kind: "approve", spender, amount };
  }
  if (sig === ERC20_TRANSFER_SELECTOR) {
    const to = wordToAddress(readWord(args, 0));
    const amount = wordToUint(readWord(args, 1));
    return { kind: "transfer", to, amount };
  }
  if (sig === ERC20_TRANSFERFROM_SELECTOR) {
    const from = wordToAddress(readWord(args, 0));
    const to = wordToAddress(readWord(args, 1));
    const amount = wordToUint(readWord(args, 2));
    return { kind: "transferFrom", from, to, amount };
  }
  return undefined;
}

// -------------------------
// Config loader
// -------------------------
export function loadWalletGuardConfigFromEnv(opts?: { projectRoot?: string }): WalletGuardConfig {
  const projectRoot = opts?.projectRoot ?? process.cwd();

  const autonomyEnabled = process.env.WALLET_AUTONOMY_ENABLED === "true";

  const allowedChainIds = new Set<number>(
    (process.env.ALLOWED_CHAIN_IDS ?? "8453")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => Number(s))
      .filter(n => Number.isFinite(n))
  );

  const maxTxValueWei = envBigInt("MAX_TX_VALUE_WEI", "0");
  const maxDailyValueWei = envBigInt("MAX_DAILY_VALUE_WEI", "0");

  const allowlistedToEnv = (process.env.ALLOWLISTED_TO ?? "").trim();
  const allowlistedTo =
    allowlistedToEnv.length > 0
      ? new Set(allowlistedToEnv.split(",").map(s => s.trim().toLowerCase()).filter(Boolean))
      : undefined;

  const blocklistedToEnv = (process.env.BLOCKLISTED_TO ?? "").trim();
  const blocklistedTo =
    blocklistedToEnv.length > 0
      ? new Set(blocklistedToEnv.split(",").map(s => s.trim().toLowerCase()).filter(Boolean))
      : undefined;

  const blockTokenApprovals = (process.env.BLOCK_TOKEN_APPROVALS ?? "true") === "true";
  const requireSimulation = (process.env.REQUIRE_SIMULATION ?? "true") === "true";

  const ledgerFilePath =
    process.env.WALLET_GUARD_LEDGER_PATH ?? path.join(projectRoot, ".security", DEFAULT_LEDGER_FILENAME);

  // Phase 3 USDC
  const usdcAddr = (process.env.USDC_TOKEN_ADDRESS ?? "").trim().toLowerCase();
  const allowUsdcApprovals = (process.env.ALLOW_USDC_APPROVALS ?? "false") === "true";

  let usdc: WalletGuardConfig["usdc"] | undefined = undefined;
  if (usdcAddr) {
    assertHexAddress(usdcAddr, "USDC_TOKEN_ADDRESS");

    const spenderEnv = (process.env.ALLOWLISTED_SPENDERS ?? "").trim();
    const allowlistedSpenders =
      spenderEnv.length > 0
        ? new Set(spenderEnv.split(",").map(s => s.trim().toLowerCase()).filter(Boolean))
        : undefined;

    const maxTxUnits = envBigInt("MAX_USDC_TX", "0");
    const maxDailyUnits = envBigInt("MAX_USDC_DAILY", "0");
    const maxApprovalUnits = envBigInt("MAX_USDC_APPROVAL", "0");

    usdc = {
      tokenAddress: usdcAddr,
      allowApprovals: allowUsdcApprovals,
      allowlistedSpenders,
      maxTxUnits,
      maxDailyUnits,
      maxApprovalUnits,
    };

    // If enabling approvals, require allowlisted spenders and caps
    if (allowUsdcApprovals) {
      if (!allowlistedSpenders || allowlistedSpenders.size === 0) {
        throw new Error("ALLOWLISTED_SPENDERS must be set when ALLOW_USDC_APPROVALS=true");
      }
      if (maxApprovalUnits <= 0n) throw new Error("MAX_USDC_APPROVAL must be > 0 when ALLOW_USDC_APPROVALS=true");
    }
    // If USDC tracking is configured, require token caps when autonomy enabled
    if (autonomyEnabled) {
      if (maxTxUnits <= 0n) throw new Error("MAX_USDC_TX must be > 0 when USDC_TOKEN_ADDRESS is set and autonomy is enabled");
      if (maxDailyUnits <= 0n) throw new Error("MAX_USDC_DAILY must be > 0 when USDC_TOKEN_ADDRESS is set and autonomy is enabled");
    }
  }

  // Safety defaults: if autonomy is on, caps must be > 0.
  if (autonomyEnabled) {
    if (maxTxValueWei <= 0n) throw new Error("MAX_TX_VALUE_WEI must be > 0 when autonomy is enabled");
    if (maxDailyValueWei <= 0n) throw new Error("MAX_DAILY_VALUE_WEI must be > 0 when autonomy is enabled");
    if (allowedChainIds.size === 0) throw new Error("ALLOWED_CHAIN_IDS must not be empty");
  }

  return {
    autonomyEnabled,
    allowedChainIds,
    maxTxValueWei,
    maxDailyValueWei,
    allowlistedTo,
    blocklistedTo,
    blockTokenApprovals,
    usdc,
    requireSimulation,
    ledgerFilePath,
  };
}

export type PreflightOptions = {
  simulate?: (tx: TxIntent) => Promise<SimulationResult>;
};

// -------------------------
// Preflight check
// -------------------------
export async function walletPreflightCheck(
  cfg: WalletGuardConfig,
  tx: TxIntent,
  opts?: PreflightOptions
): Promise<void> {
  // Kill switch
  if (!cfg.autonomyEnabled) {
    throw new Error("Wallet autonomy disabled (WALLET_AUTONOMY_ENABLED=false)");
  }

  // Chain allowlist
  if (!cfg.allowedChainIds.has(tx.chainId)) {
    throw new Error(`ChainId not allowed: ${tx.chainId}`);
  }

  // Validate addresses if present
  if (tx.from) assertHexAddress(tx.from, "from");
  if (tx.to) assertHexAddress(tx.to, "to");

  const toLower = toLowerAddr(tx.to);

  // Blocklist/allowlist destinations
  if (toLower && cfg.blocklistedTo?.has(toLower)) {
    throw new Error(`Destination is blocklisted: ${tx.to}`);
  }
  if (cfg.allowlistedTo && toLower) {
    if (!cfg.allowlistedTo.has(toLower)) {
      throw new Error(`Destination not in allowlist: ${tx.to}`);
    }
  }
  if (cfg.allowlistedTo && !toLower) {
    throw new Error("Contract creation tx blocked (no 'to' address)");
  }

  // Per-tx native value cap
  const valueWei = tx.valueWei ?? 0n;
  if (valueWei < 0n) throw new Error("Invalid tx value");
  if (valueWei > cfg.maxTxValueWei) {
    throw new Error(`Tx value exceeds maxTxValueWei: ${valueWei} > ${cfg.maxTxValueWei}`);
  }

  // Phase 3: ERC20 decoding & policy checks (USDC only)
  // Note: ERC20 calls happen on the token contract. So tx.to must equal token address.
  const decoded = tx.dataHex && looksLikeErc20Call(tx.dataHex) ? decodeErc20(tx.dataHex) : undefined;

  // Default approval blocking, but allow USDC approvals under strict rules if configured.
  if (cfg.blockTokenApprovals && decoded?.kind === "approve") {
    const tokenTo = toLower; // token contract address (lower)
    const usdc = cfg.usdc;

    const isUsdc = !!(usdc && tokenTo && tokenTo === usdc.tokenAddress);
    if (!isUsdc || !usdc?.allowApprovals) {
      throw new Error("Token approval transactions are blocked by policy");
    }

    // If allowing USDC approvals: spender must be allowlisted, approval amount capped
    const spenderLower = decoded.spender.toLowerCase();
    if (!usdc.allowlistedSpenders?.has(spenderLower)) {
      throw new Error(`Approval spender not allowlisted: ${decoded.spender}`);
    }
    if (decoded.amount < 0n) throw new Error("Invalid approval amount");
    if (decoded.amount > usdc.maxApprovalUnits) {
      throw new Error(`USDC approval exceeds max: ${decoded.amount} > ${usdc.maxApprovalUnits}`);
    }
  }

  // If this is a USDC transfer/transferFrom, enforce per-tx token caps
  if (decoded && (decoded.kind === "transfer" || decoded.kind === "transferFrom")) {
    const tokenTo = toLower;
    const usdc = cfg.usdc;

    const isUsdc = !!(usdc && tokenTo && tokenTo === usdc.tokenAddress);
    if (!isUsdc) {
      // For now: only support token caps for configured USDC token.
      throw new Error("ERC20 transfer blocked: only configured USDC token is allowed in Phase 3");
    }

    const amount = decoded.amount;
    if (amount < 0n) throw new Error("Invalid token transfer amount");
    if (amount > usdc.maxTxUnits) {
      throw new Error(`USDC transfer exceeds max per tx: ${amount} > ${usdc.maxTxUnits}`);
    }
  }

  // Require simulation
  if (cfg.requireSimulation) {
    const sim = opts?.simulate;
    if (!sim) throw new Error("Simulation required but no simulator provided");
    const result = await sim(tx);
    if (!result.ok) throw new Error(`Simulation failed: ${result.reason ?? "unknown"}`);
  }

  // Daily spend caps (native + USDC)
  const ledger = readLedger(cfg.ledgerFilePath);
  const today = dayKeyLocal();

  let spentWei = BigInt(ledger.spentWei);
  let tokenSpent: Record<string, string> = ledger.tokenSpent ?? {};

  if (ledger.dayKey !== today) {
    spentWei = 0n;
    tokenSpent = {};
  }

  // Native daily cap
  const nextSpentWei = spentWei + valueWei;
  if (nextSpentWei > cfg.maxDailyValueWei) {
    throw new Error(`Daily spend cap exceeded: ${nextSpentWei} > ${cfg.maxDailyValueWei}`);
  }

  // USDC daily cap (only if decoded transfer or approval? we count transfer amounts only)
  if (cfg.usdc && decoded && (decoded.kind === "transfer" || decoded.kind === "transferFrom")) {
    const usdcAddr = cfg.usdc.tokenAddress;
    const prev = BigInt(tokenSpent[usdcAddr] ?? "0");
    const next = prev + decoded.amount;

    if (next > cfg.usdc.maxDailyUnits) {
      throw new Error(`USDC daily cap exceeded: ${next} > ${cfg.usdc.maxDailyUnits}`);
    }
    tokenSpent[usdcAddr] = next.toString();
  }

  // Commit ledger (fail-closed)
  writeLedger(cfg.ledgerFilePath, { dayKey: today, spentWei: nextSpentWei.toString(), tokenSpent });
}
