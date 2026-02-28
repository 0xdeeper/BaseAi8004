import fs from "node:fs";
import path from "node:path";
import type { PortfolioState, AssetSymbol, ChainName } from "../engine/types.js";

type Balances = Record<AssetSymbol, string>;

function getSecurityPath(file: string): string {
  return path.resolve(process.cwd(), ".security", file);
}

function parseJsonLines(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// Simple decimal-string subtract for small values (good enough for paper demo).
function subDecimalStr(a: string, b: string): string {
  const av = Number(a);
  const bv = Number(b);
  const out = av - bv;
  // keep it stable
  return out.toFixed(6).replace(/\.?0+$/, "");
}

function addDecimalStr(a: string, b: string): string {
  const av = Number(a);
  const bv = Number(b);
  const out = av + bv;
  return out.toFixed(6).replace(/\.?0+$/, "");
}

function getInitialBalances(): Balances {
  // Set this in .env if you want:
  // PAPER_INIT_BALANCES_JSON='{"USDC":"10","ETH":"0"}'
  const env = process.env.PAPER_INIT_BALANCES_JSON;
  if (env) {
    try {
      const obj = JSON.parse(env) as Balances;
      return obj;
    } catch {
      // fall through
    }
  }
  return { USDC: "10", ETH: "0" };
}

export function derivePaperPortfolio(opts?: { chain?: ChainName }): PortfolioState {
  const chain = opts?.chain ?? "base";
  const nowIso = new Date().toISOString();

  const balances: Balances = { ...getInitialBalances() };

  const ledgerPath = getSecurityPath("paper-ledger.jsonl");
  const rows = parseJsonLines(ledgerPath);

  for (const r of rows) {
    if (r.kind !== "FILL") continue;

    // We can confidently decrement amountIn for EXACT_IN swaps.
    // amountOut is "VIRTUAL" in your paper executor currently, so we do NOT credit toAsset yet.
    if (typeof r.fromAsset === "string" && typeof r.amountIn === "string") {
      const from = r.fromAsset as AssetSymbol;
      const cur = balances[from] ?? "0";
      balances[from] = subDecimalStr(cur, r.amountIn);
    }

    // Future enhancement: once paper executor computes amountOut numerically,
    // we can credit r.toAsset by amountOut.
  }

  return {
    asOf: nowIso,
    chain,
    balances,
    openPositions: [],
  };
}
