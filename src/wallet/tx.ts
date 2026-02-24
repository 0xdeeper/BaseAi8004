import { createPublicClient, createWalletClient, http, type Hex, type Address, isAddress, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import {
  loadWalletGuardConfigFromEnv,
  walletPreflightCheck,
  type TxIntent,
  type SimulationResult,
} from "../security/wallet-guard.js";

/**
 * Strictly defined transaction request (native send or contract call).
 * This is the only place in the runtime that is allowed to sign/send.
 */
export type SendTxRequest = {
  chainId: number;        // e.g., 8453
  to: Address;
  valueWei: bigint;
  dataHex?: Hex;          // optional calldata
};

/** ---------------------------
 *  Section: validators
 *  --------------------------*/
function assertHexPrivateKey(pk: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error("PRIVATE_KEY must be 0x + 64 hex chars");
}

function assertSendTxRequest(req: SendTxRequest) {
  if (!Number.isInteger(req.chainId) || req.chainId <= 0) {
    throw new Error(`Invalid chainId: ${req.chainId}`);
  }
  if (!isAddress(req.to)) throw new Error(`Invalid 'to' address: ${String(req.to)}`);
  if (typeof req.valueWei !== "bigint" || req.valueWei < 0n) {
    throw new Error(`Invalid valueWei: ${String(req.valueWei)}`);
  }
  const data = (req.dataHex ?? "0x") as Hex;
  if (!isHex(data)) throw new Error(`Invalid dataHex (must be hex): ${String(req.dataHex)}`);
}

function viemErr(e: unknown): string {
  const anyE = e as any;
  return anyE?.shortMessage || anyE?.details || anyE?.message || String(e);
}

/** ---------------------------
 *  Section: RPC + chain
 *  --------------------------*/
function getRpcUrl(): string {
  const url = (process.env.RPC_URL || "https://mainnet.base.org").trim();
  return url;
}

function getChainById(chainId: number) {
  if (chainId !== 8453) throw new Error(`Unsupported chainId in runtime: ${chainId}`);
  return base;
}

function getAccountFromEnv() {
  const pk = (process.env.PRIVATE_KEY || "").trim();
  if (!pk) throw new Error("PRIVATE_KEY missing");
  assertHexPrivateKey(pk);
  return privateKeyToAccount(pk as Hex);
}

/** ---------------------------
 *  Section: simulation
 *  - fail-closed on any error
 *  - uses BOTH estimateGas + call
 *  --------------------------*/
async function simulateTx(req: SendTxRequest, from: Address): Promise<SimulationResult> {
  const chain = getChainById(req.chainId);
  const rpcUrl = getRpcUrl();

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const data = (req.dataHex ?? "0x") as Hex;

  try {
    await publicClient.estimateGas({
      account: from,
      to: req.to,
      data,
      value: req.valueWei,
    });

    await publicClient.call({
      account: from,
      to: req.to,
      data,
      value: req.valueWei,
    });

    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, reason: viemErr(e) };
  }
}

/**
 * Send transaction (guarded).
 * - Enforces WALLET_AUTONOMY_ENABLED, chain allowlist, caps, approval blocking
 * - Requires simulation before send (if REQUIRE_SIMULATION=true)
 */
export async function sendTx(req: SendTxRequest): Promise<{ hash: Hex }> {
  // (1) Validate request first (fail fast)
  assertSendTxRequest(req);

  // (2) Load config and fail-closed BEFORE touching PRIVATE_KEY
  const cfg = loadWalletGuardConfigFromEnv();

  // Defense-in-depth early exits (guard will also enforce)
  if (!cfg.autonomyEnabled) {
    throw new Error("Wallet autonomy disabled (WALLET_AUTONOMY_ENABLED=false)");
  }
  if (!cfg.allowedChainIds.has(req.chainId)) {
    throw new Error(`ChainId not allowed: ${req.chainId}`);
  }

  // (3) Now load account
  const account = getAccountFromEnv();

  // (4) Resolve chain + rpc
  const chain = getChainById(req.chainId);
  const rpcUrl = getRpcUrl();

  // (5) Build intent for guard
  const intent: TxIntent = {
    chainId: req.chainId,
    from: account.address as `0x${string}`,
    to: req.to as `0x${string}`,
    valueWei: req.valueWei,
    dataHex: (req.dataHex ?? "0x") as `0x${string}`,
  };

  // (6) Guard must run BEFORE signing/sending
  await walletPreflightCheck(cfg, intent, {
    simulate: async (tx) => {
      // Fail-closed if guard passed a malformed intent somehow
      if (!tx.to) return { ok: false, reason: "Simulation missing 'to' address" };
      if (!isAddress(tx.to as any)) return { ok: false, reason: "Simulation got invalid 'to' address" };

      return simulateTx(
        {
          chainId: tx.chainId,
          to: tx.to as Address,
          valueWei: tx.valueWei ?? 0n,
          dataHex: (tx.dataHex ?? "0x") as Hex,
        },
        account.address
      );
    },
  });

  // (7) If guard passes, send
  const walletClient = createWalletClient({
    chain,
    transport: http(rpcUrl),
    account,
  });

  const hash = await walletClient.sendTransaction({
    to: req.to,
    value: req.valueWei,
    data: (req.dataHex ?? "0x") as Hex,
  });

  return { hash };
}

/**
 * Convenience: native send only (no calldata).
 */
export async function sendNative(to: Address, valueWei: bigint, chainId = 8453) {
  return sendTx({ chainId, to, valueWei, dataHex: "0x" });
}
