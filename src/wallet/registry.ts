// src/wallet/registry.ts
import type { Address } from "viem";

export type ContractKind = "nft" | "quest" | "dex" | "other";

export type AllowedFunction = {
  name: string;           // human label
  selector: `0x${string}`; // 4-byte selector, e.g. 0x1249c58b
};

export type RegisteredContract = {
  id: string;             // stable key like "coolcats_mint"
  kind: ContractKind;
  chainId: number;        // Base = 8453
  address: Address;
  functions: AllowedFunction[];
  notes?: string;
};

/**
 * Start empty. Add contracts here when you know them.
 * This file is intentionally code (not env) so it’s reviewable + versioned.
 */
export const REGISTRY: RegisteredContract[] = [
  // Example template (remove once you add real ones):
  // {
  //   id: "example_nft",
  //   kind: "nft",
  //   chainId: 8453,
  //   address: "0x0000000000000000000000000000000000000000",
  //   functions: [{ name: "mint()", selector: "0x1249c58b" }],
  //   notes: "Replace with real contract + selector"
  // },
];

export function getRegisteredContract(id: string): RegisteredContract {
  const c = REGISTRY.find(x => x.id === id);
  if (!c) throw new Error(`Unknown contract id: ${id}`);
  return c;
}

export function listRegistry() {
  return REGISTRY.map(c => ({
    id: c.id,
    kind: c.kind,
    chainId: c.chainId,
    address: c.address,
    functions: c.functions.map(f => ({ name: f.name, selector: f.selector })),
    notes: c.notes ?? "",
  }));
}
