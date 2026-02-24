// src/wallet/selector-call.ts
import type { Hex } from "viem";
import { sendTx } from "./tx.js";
import { getRegisteredContract } from "./registry.js";

function assertSelector4(sel: string) {
  if (!/^0x[0-9a-fA-F]{8}$/.test(sel)) throw new Error("selector must be 4 bytes (0x + 8 hex chars)");
}

function assertHexEven(data: string, name: string) {
  if (!/^0x([0-9a-fA-F]{2})*$/.test(data)) throw new Error(`${name} must be 0x-prefixed hex (even length)`);
}

function strip0x(h: string) {
  return h.startsWith("0x") ? h.slice(2) : h;
}

export async function callRegisteredSelector(opts: {
  contractId: string;
  functionName: string; // must match registry entry
  valueWei: bigint;
  extraDataHex?: Hex;   // encoded args WITHOUT selector, or "0x" if none
}): Promise<{ hash: Hex }> {
  const c = getRegisteredContract(opts.contractId);

  const fn = c.functions.find(f => f.name === opts.functionName);
  if (!fn) throw new Error(`Function not allowed for contract ${c.id}: ${opts.functionName}`);

  assertSelector4(fn.selector);
  const extra = (opts.extraDataHex ?? "0x") as string;
  assertHexEven(extra, "extraDataHex");

  const dataHex = (`0x${strip0x(fn.selector)}${strip0x(extra)}`) as Hex;

  return sendTx({
    chainId: c.chainId,
    to: c.address,
    valueWei: opts.valueWei,
    dataHex,
  });
}
