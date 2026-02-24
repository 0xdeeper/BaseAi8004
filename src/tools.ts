/**
 * MCP Tools Definition (Hardened)
 *
 * Wallet sending is implemented via src/wallet/tx.ts, which enforces:
 * - WALLET_AUTONOMY_ENABLED kill switch
 * - chain allowlist
 * - simulation-before-send (if enabled)
 * - per-tx + daily spend caps
 * - approval blocking (if enabled)
 *
 * tools.ts must ONLY validate inputs and call the wallet module (or safe wrappers).
 */

import { generateResponse } from "./agent.js";
import { sendNative, sendTx } from "./wallet/tx.js";
import { listRegistry } from "./wallet/registry.js";
import { callRegisteredSelector } from "./wallet/selector-call.js";
import { encodeErc20Approve, encodeErc20Transfer } from "./wallet/erc20.js";
import { getNativeBalance, getErc20Balance } from "./wallet/balance.js";

import type { Address, Hex } from "viem";

// =========================
// Chain / Policy
// =========================
const DEFAULT_CHAIN_ID = Number(process.env.DEFAULT_CHAIN_ID ?? "84532"); // Base Sepolia
if (!Number.isInteger(DEFAULT_CHAIN_ID) || DEFAULT_CHAIN_ID <= 0) {
  throw new Error("DEFAULT_CHAIN_ID must be a positive integer");
}

// =========================
// Limits / Policy
// =========================
const MAX_CHAT_MESSAGE_CHARS = Number(process.env.MAX_CHAT_MESSAGE_CHARS ?? "8000");
if (!Number.isFinite(MAX_CHAT_MESSAGE_CHARS) || MAX_CHAT_MESSAGE_CHARS <= 0) {
  throw new Error("MAX_CHAT_MESSAGE_CHARS must be a positive number");
}

// Prevent BigInt parsing DoS from absurdly long strings
const MAX_WEI_DECIMAL_CHARS = Number(process.env.MAX_WEI_DECIMAL_CHARS ?? "80");
if (!Number.isFinite(MAX_WEI_DECIMAL_CHARS) || MAX_WEI_DECIMAL_CHARS <= 0) {
  throw new Error("MAX_WEI_DECIMAL_CHARS must be a positive number");
}

// Prevent calldata DoS
const MAX_DATAHEX_CHARS = Number(process.env.MAX_DATAHEX_CHARS ?? "6000"); // ~3KB calldata
if (!Number.isFinite(MAX_DATAHEX_CHARS) || MAX_DATAHEX_CHARS <= 0) {
  throw new Error("MAX_DATAHEX_CHARS must be a positive number");
}

function assertPlainObject(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function assertOnlyKeys(obj: Record<string, unknown>, allowed: string[], name: string) {
  const allowedSet = new Set(allowed);
  for (const k of Object.keys(obj)) {
    if (!allowedSet.has(k)) throw new Error(`${name} has unknown field: ${k}`);
  }
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
}

function assertOptionalString(value: unknown, name: string): asserts value is string | undefined {
  if (value === undefined) return;
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
}

function assertMaxLen(s: string, max: number, name: string) {
  if (s.length > max) throw new Error(`${name} too long (max ${max} chars)`);
}

function assertHexAddress(addr: string, name: string): asserts addr is Address {
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) throw new Error(`${name} must be a valid 0x address`);
}

function assertWeiString(v: string, name: string) {
  if (!/^[0-9]+$/.test(v)) throw new Error(`${name} must be a decimal integer string`);
  if (v.length > MAX_WEI_DECIMAL_CHARS) {
    throw new Error(`${name} too long (max ${MAX_WEI_DECIMAL_CHARS} digits)`);
  }
}

function parseWei(v: string, name: string): bigint {
  try {
    const b = BigInt(v);
    if (b < 0n) throw new Error("negative");
    return b;
  } catch {
    throw new Error(`${name} must be parseable as bigint`);
  }
}

function assertDataHex(v: string, name: string): asserts v is Hex {
  if (!/^0x([0-9a-fA-F]{2})*$/.test(v)) throw new Error(`${name} must be 0x-prefixed hex (even length)`);
  assertMaxLen(v, MAX_DATAHEX_CHARS, name);
}

function getUsdcTokenAddressFromEnv(): Address {
  const v = (process.env.USDC_TOKEN_ADDRESS ?? "").trim();
  if (!v) throw new Error("USDC_TOKEN_ADDRESS must be set");
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error("USDC_TOKEN_ADDRESS must be a valid 0x address");
  return v as Address;
}

function getWalletAddressFromEnv(): Address {
  const v = (process.env.WALLET_ADDRESS ?? "").trim();
  if (!v) throw new Error("WALLET_ADDRESS must be set");
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error("WALLET_ADDRESS must be a valid 0x address");
  return v as Address;
}

function formatEth(wei: bigint): string {
  // avoid floating precision; return string with 18 decimals trimmed
  const s = wei.toString().padStart(19, "0");
  const whole = s.slice(0, -18);
  const frac = s.slice(-18).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

function formatUsdc(units: bigint): string {
  // USDC 6 decimals
  const s = units.toString().padStart(7, "0");
  const whole = s.slice(0, -6);
  const frac = s.slice(-6).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const tools = [
  {
    name: "chat",
    description: "Have a conversation with the AI agent",
    inputSchema: {
      type: "object" as const,
      properties: {
        message: { type: "string", description: "The message to send to the agent" },
      },
      required: ["message"],
      additionalProperties: false,
    },
  },
  {
    name: "echo",
    description: "Echo back the input message (for testing)",
    inputSchema: {
      type: "object" as const,
      properties: {
        message: { type: "string", description: "The message to echo" },
      },
      required: ["message"],
      additionalProperties: false,
    },
  },
  {
    name: "get_time",
    description: "Get the current time",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },

  // ---- balances (own-wallet only) ----
  {
    name: "get_my_native_balance",
    description: "Get native ETH balance for WALLET_ADDRESS on Base Sepolia (read-only)",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "get_my_usdc_balance",
    description: "Get USDC balance for WALLET_ADDRESS on Base Sepolia (read-only)",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },

  // ---- wallet send ----
  {
    name: "wallet_send_native",
    description:
      "Send native token (ETH) on Base Sepolia. Requires wei. Disabled unless WALLET_AUTONOMY_ENABLED=true.",
    inputSchema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Recipient address (0x...)" },
        valueWei: { type: "string", description: "Amount in wei (decimal integer string)" },
      },
      required: ["to", "valueWei"],
      additionalProperties: false,
    },
  },
  {
    name: "wallet_send_tx",
    description:
      "Send a guarded transaction (contract call or native transfer) on Base Sepolia. Disabled unless WALLET_AUTONOMY_ENABLED=true. Approvals may be blocked by policy.",
    inputSchema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Target address (contract or EOA)" },
        valueWei: {
          type: "string",
          description: "Amount in wei (decimal integer string). Use '0' for most contract calls.",
        },
        dataHex: { type: "string", description: "Calldata hex (0x...); use '0x' for native send" },
      },
      required: ["to", "valueWei", "dataHex"],
      additionalProperties: false,
    },
  },

  // ---- registry ----
  {
    name: "registry_list",
    description: "List registered contracts and allowed functions",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "contract_call_selector",
    description: "Call an allowlisted contract function by hardcoded selector from the registry (guarded).",
    inputSchema: {
      type: "object" as const,
      properties: {
        contractId: { type: "string", description: "Registry contract id" },
        functionName: { type: "string", description: "Allowed function name from registry entry" },
        valueWei: { type: "string", description: "Wei value (decimal string), usually '0'" },
        extraDataHex: { type: "string", description: "Encoded args WITHOUT selector (0x...), usually '0x'" },
      },
      required: ["contractId", "functionName", "valueWei"],
      additionalProperties: false,
    },
  },

  // ---- USDC tools (deterministic calldata; still guarded by wallet-guard) ----
  {
    name: "usdc_approve_spender",
    description:
      "Approve a spender to spend USDC (Base Sepolia). Guarded: spender must be allowlisted if ALLOW_USDC_APPROVALS=true, approval capped.",
    inputSchema: {
      type: "object" as const,
      properties: {
        spender: { type: "string", description: "Spender address (0x...)" },
        amountUnits: { type: "string", description: "USDC amount in base units (6 decimals), decimal string" },
      },
      required: ["spender", "amountUnits"],
      additionalProperties: false,
    },
  },
  {
    name: "usdc_transfer",
    description: "Transfer USDC (Base Sepolia). Guarded by USDC tx + daily caps (in wallet-guard).",
    inputSchema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Recipient address (0x...)" },
        amountUnits: { type: "string", description: "USDC amount in base units (6 decimals), decimal string" },
      },
      required: ["to", "amountUnits"],
      additionalProperties: false,
    },
  },
] as const;

// ============================================================================
// Tool Implementations
// ============================================================================

export async function handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  assertPlainObject(args, "args");

  switch (name) {
    case "chat": {
      assertOnlyKeys(args, ["message"], "chat args");
      assertString(args.message, "message");
      assertMaxLen(args.message, MAX_CHAT_MESSAGE_CHARS, "message");
      const response = await generateResponse(args.message);
      return { response };
    }

    case "echo": {
      assertOnlyKeys(args, ["message"], "echo args");
      assertString(args.message, "message");
      assertMaxLen(args.message, MAX_CHAT_MESSAGE_CHARS, "message");
      return { echoed: args.message };
    }

    case "get_time": {
      assertOnlyKeys(args, [], "get_time args");
      return { time: new Date().toISOString() };
    }

    // ---- balances (own wallet only) ----
    case "get_my_native_balance": {
      assertOnlyKeys(args, [], "get_my_native_balance args");
      const addr = getWalletAddressFromEnv();
      const bal = await getNativeBalance(addr, DEFAULT_CHAIN_ID);
      return {
        chainId: DEFAULT_CHAIN_ID,
        address: addr,
        wei: bal.toString(),
        eth: formatEth(bal),
      };
    }

    case "get_my_usdc_balance": {
      assertOnlyKeys(args, [], "get_my_usdc_balance args");
      const addr = getWalletAddressFromEnv();
      const usdc = getUsdcTokenAddressFromEnv();
      const bal = await getErc20Balance(usdc, addr, DEFAULT_CHAIN_ID);
      return {
        chainId: DEFAULT_CHAIN_ID,
        address: addr,
        token: usdc,
        units: bal.toString(),
        usdc: formatUsdc(bal),
      };
    }

    // ---- wallet send ----
    case "wallet_send_native": {
      assertOnlyKeys(args, ["to", "valueWei"], "wallet_send_native args");

      assertString(args.to, "to");
      assertHexAddress(args.to, "to");

      assertString(args.valueWei, "valueWei");
      assertWeiString(args.valueWei, "valueWei");
      const valueWei = parseWei(args.valueWei, "valueWei");

      const { hash } = await sendNative(args.to, valueWei, DEFAULT_CHAIN_ID);
      return { hash };
    }

    case "wallet_send_tx": {
      assertOnlyKeys(args, ["to", "valueWei", "dataHex"], "wallet_send_tx args");

      assertString(args.to, "to");
      assertHexAddress(args.to, "to");

      assertString(args.valueWei, "valueWei");
      assertWeiString(args.valueWei, "valueWei");
      const valueWei = parseWei(args.valueWei, "valueWei");

      assertString(args.dataHex, "dataHex");
      assertDataHex(args.dataHex, "dataHex");

      const { hash } = await sendTx({
        chainId: DEFAULT_CHAIN_ID,
        to: args.to,
        valueWei,
        dataHex: args.dataHex,
      });

      return { hash };
    }

    // ---- registry ----
    case "registry_list": {
      assertOnlyKeys(args, [], "registry_list args");
      return { registry: listRegistry() };
    }

    case "contract_call_selector": {
      assertOnlyKeys(args, ["contractId", "functionName", "valueWei", "extraDataHex"], "contract_call_selector args");

      assertString(args.contractId, "contractId");
      assertString(args.functionName, "functionName");

      assertString(args.valueWei, "valueWei");
      assertWeiString(args.valueWei, "valueWei");
      const valueWei = parseWei(args.valueWei, "valueWei");

      assertOptionalString(args.extraDataHex, "extraDataHex");
      const extraDataHex = (args.extraDataHex ?? "0x") as string;
      assertDataHex(extraDataHex, "extraDataHex");

      const { hash } = await callRegisteredSelector({
        contractId: args.contractId,
        functionName: args.functionName,
        valueWei,
        extraDataHex: extraDataHex as Hex,
      });

      return { hash };
    }

    // ---- USDC ----
    case "usdc_approve_spender": {
      assertOnlyKeys(args, ["spender", "amountUnits"], "usdc_approve_spender args");

      assertString(args.spender, "spender");
      assertHexAddress(args.spender, "spender");

      assertString(args.amountUnits, "amountUnits");
      assertWeiString(args.amountUnits, "amountUnits");
      const amountUnits = parseWei(args.amountUnits, "amountUnits");

      const usdcToken = getUsdcTokenAddressFromEnv();
      const dataHex = encodeErc20Approve(args.spender, amountUnits);

      const { hash } = await sendTx({
        chainId: DEFAULT_CHAIN_ID,
        to: usdcToken,
        valueWei: 0n,
        dataHex,
      });

      return { hash };
    }

    case "usdc_transfer": {
      assertOnlyKeys(args, ["to", "amountUnits"], "usdc_transfer args");

      assertString(args.to, "to");
      assertHexAddress(args.to, "to");

      assertString(args.amountUnits, "amountUnits");
      assertWeiString(args.amountUnits, "amountUnits");
      const amountUnits = parseWei(args.amountUnits, "amountUnits");

      const usdcToken = getUsdcTokenAddressFromEnv();
      const dataHex = encodeErc20Transfer(args.to, amountUnits);

      const { hash } = await sendTx({
        chainId: DEFAULT_CHAIN_ID,
        to: usdcToken,
        valueWei: 0n,
        dataHex,
      });

      return { hash };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
