import fs from "node:fs";
import path from "node:path";

export interface PaperLedgerEntry {
  ts: string;
  kind: "FILL" | "REJECT";
  planId: string;
  actionId?: string;

  fromAsset?: string;
  toAsset?: string;
  amountIn?: string;
  amountOut?: string;

  priceUsd?: number;
  note?: string;
}

const LEDGER_PATH = path.join(process.cwd(), ".security", "paper-ledger.jsonl");

export function appendLedger(entry: PaperLedgerEntry): void {
  const line = JSON.stringify(entry) + "\n";
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.appendFileSync(LEDGER_PATH, line, "utf8");
}

export function readLedger(limit = 200): PaperLedgerEntry[] {
  if (!fs.existsSync(LEDGER_PATH)) return [];
  const raw = fs.readFileSync(LEDGER_PATH, "utf8").trim();
  if (!raw) return [];
  const lines = raw.split("\n").slice(-limit);
  return lines.map((l) => JSON.parse(l));
}

export function ledgerPath(): string {
  return LEDGER_PATH;
}
