export const DEFAULT_LOCK_TTL_MS = 30_000; // 30s (safe for early phase)
export const DEFAULT_POLL_INTERVAL_MS = 1_000; // 1s
export const DEFAULT_MAX_CLAIMS_PER_TICK = 1;

export function getEnvInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function getEnvBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}
