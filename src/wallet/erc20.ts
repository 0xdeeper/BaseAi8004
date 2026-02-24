// src/wallet/erc20.ts
import type { Address, Hex } from "viem";

const ERC20_APPROVE_SELECTOR = "0x095ea7b3" as const;
const ERC20_TRANSFER_SELECTOR = "0xa9059cbb" as const;

function assertAddress(a: string, name: string): asserts a is Address {
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) throw new Error(`${name} must be a valid 0x address`);
}

function pad32(hexNo0x: string): string {
  return hexNo0x.padStart(64, "0");
}

function encodeAddressWord(addr: Address): string {
  // address is 20 bytes => pad left to 32 bytes
  return pad32(addr.toLowerCase().replace(/^0x/, ""));
}

function encodeUint256Word(value: bigint): string {
  if (value < 0n) throw new Error("uint256 must be non-negative");
  return pad32(value.toString(16));
}

/**
 * approve(spender, amount)
 */
export function encodeErc20Approve(spender: Address, amount: bigint): Hex {
  assertAddress(spender, "spender");
  const data =
    ERC20_APPROVE_SELECTOR +
    encodeAddressWord(spender) +
    encodeUint256Word(amount);
  return (`0x${data.replace(/^0x/, "")}`) as Hex;
}

/**
 * transfer(to, amount)
 */
export function encodeErc20Transfer(to: Address, amount: bigint): Hex {
  assertAddress(to, "to");
  const data =
    ERC20_TRANSFER_SELECTOR +
    encodeAddressWord(to) +
    encodeUint256Word(amount);
  return (`0x${data.replace(/^0x/, "")}`) as Hex;
}
