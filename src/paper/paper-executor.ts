import crypto from "node:crypto";
import { ExecutionPlan, ExecutionAction } from "../engine/types.js";
import { appendLedger } from "./paper-ledger.js";

export interface PaperExecutionReport {
  runId: string;
  ts: string;
  planId: string;
  fills: number;
  rejects: number;
  notes: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function getUsdPrice(pricesUsd: Record<string, number>, symbol: string): number | null {
  const px = pricesUsd[symbol];
  return typeof px === "number" && isFinite(px) && px > 0 ? px : null;
}

/**
 * Paper-exec a plan using snapshot prices.
 * - No chain interaction
 * - No wallet interaction
 * - Deterministic, auditable
 */
export function paperExecutePlan(
  plan: ExecutionPlan,
  snapshotPricesUsd: Record<string, number>
): PaperExecutionReport {
  const runId = crypto.randomUUID();
  const ts = nowIso();

  let fills = 0;
  let rejects = 0;
  const notes: string[] = [];

  for (const action of plan.actions) {
    const r = paperExecuteAction(plan.planId, action, snapshotPricesUsd);
    if (r === "FILL") fills++;
    else rejects++;
  }

  notes.push("paper ledger append-only");
  return { runId, ts, planId: plan.planId, fills, rejects, notes };
}

function paperExecuteAction(
  planId: string,
  action: ExecutionAction,
  pricesUsd: Record<string, number>
): "FILL" | "REJECT" {
  const ts = nowIso();

  if (action.chain !== "base") {
    appendLedger({
      ts,
      kind: "REJECT",
      planId,
      actionId: action.actionId,
      note: "chain not supported",
    });
    return "REJECT";
  }

  switch (action.type) {
    case "SPOT_SWAP_EXACT_IN": {
      const fromPx = getUsdPrice(pricesUsd, action.fromAsset);
      const toPx = getUsdPrice(pricesUsd, action.toAsset);

      if (!fromPx || !toPx) {
        appendLedger({
          ts,
          kind: "REJECT",
          planId,
          actionId: action.actionId,
          note: "missing price",
        });
        return "REJECT";
      }

      appendLedger({
        ts,
        kind: "FILL",
        planId,
        actionId: action.actionId,
        fromAsset: action.fromAsset,
        toAsset: action.toAsset,
        amountIn: action.amountIn,
        amountOut: "VIRTUAL",
        priceUsd: toPx,
        note: "paper fill using snapshot pricing",
      });

      return "FILL";
    }

    case "SPOT_SWAP_EXACT_OUT": {
      const fromPx = getUsdPrice(pricesUsd, action.fromAsset);
      const toPx = getUsdPrice(pricesUsd, action.toAsset);

      if (!fromPx || !toPx) {
        appendLedger({
          ts,
          kind: "REJECT",
          planId,
          actionId: action.actionId,
          note: "missing price",
        });
        return "REJECT";
      }

      appendLedger({
        ts,
        kind: "FILL",
        planId,
        actionId: action.actionId,
        fromAsset: action.fromAsset,
        toAsset: action.toAsset,
        amountIn: "VIRTUAL",
        amountOut: action.amountOut,
        priceUsd: toPx,
        note: "paper fill using snapshot pricing",
      });

      return "FILL";
    }

    default: {
  appendLedger({
    ts,
    kind: "REJECT",
    planId,
    actionId: (action as any).actionId,
    note: `unsupported action type: ${(action as any).type}`,
  });

  return "REJECT";
  }
  }
}
