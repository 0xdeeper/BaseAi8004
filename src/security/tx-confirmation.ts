// src/security/tx-confirmation.ts
import * as crypto from "node:crypto";
import type { TxIntent } from "./wallet-guard.js";

export type PreparedTx = {
  token: string;
  expiresAt: number; // epoch ms
  used: boolean;
  digest: string; // sha256 of canonical intent
  intent: TxIntent;
  preview: Record<string, unknown>;
};

const DEFAULT_TTL_MS = Number(process.env.TX_CONFIRM_TTL_MS ?? "180000"); // 3 minutes
const MAX_TTL_MS = 10 * 60 * 1000;

function nowMs() {
  return Date.now();
}

function ttlMs() {
  const t = Number.isFinite(DEFAULT_TTL_MS) ? DEFAULT_TTL_MS : 180000;
  return Math.min(Math.max(t, 30_000), MAX_TTL_MS);
}

// Stable canonicalization so digest is consistent.
function canonicalizeIntent(intent: TxIntent) {
  return {
    chainId: intent.chainId,
    from: intent.from ?? null,
    to: intent.to ?? null,
    valueWei: (intent.valueWei ?? 0n).toString(),
    dataHex: (intent.dataHex ?? "0x").toLowerCase(),
  };
}

export function digestIntent(intent: TxIntent): string {
  const canon = canonicalizeIntent(intent);
  const json = JSON.stringify(canon);
  return crypto.createHash("sha256").update(json).digest("hex");
}

const store = new Map<string, PreparedTx>();

export function createPreparedTx(intent: TxIntent, preview: Record<string, unknown>) {
  const token = crypto.randomUUID();
  const prepared: PreparedTx = {
    token,
    expiresAt: nowMs() + ttlMs(),
    used: false,
    digest: digestIntent(intent),
    intent,
    preview,
  };
  store.set(token, prepared);
  return prepared;
}

export function getPreparedTx(token: string): PreparedTx | undefined {
  const p = store.get(token);
  if (!p) return undefined;

  // TTL eviction
  if (nowMs() > p.expiresAt) {
    store.delete(token);
    return undefined;
  }
  return p;
}

export function markUsed(token: string) {
  const p = store.get(token);
  if (p) {
    p.used = true;
    store.set(token, p);
  }
}

// Optional: periodic cleanup (call on an interval if you want)
export function cleanupExpired() {
  const t = nowMs();
  for (const [k, v] of store) {
    if (t > v.expiresAt) store.delete(k);
  }
}
