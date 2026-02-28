import type { TaskWorker } from "../types.js";

import type { DecideInput, AssetSymbol } from "../../engine/types.js";
import { strategyStub } from "../../engine/decisionEngine.js";
import { evaluateRisk } from "../../engine/risk.js";
import { buildExecutionPlans } from "../../engine/policy.js";

import { paperExecutePlan } from "../../paper/paper-executor.js";

export const strategyTickWorker: TaskWorker = async (_payload, ctx) => {
  // Deterministic snapshot (paper mode). Replace later with your real snapshot feed.
  const pricesUsd: Record<AssetSymbol, number> = {
    USDC: 1.0,
    ETH: 3000.0,
  };

  const nowIso = new Date(ctx.nowMs).toISOString();

  const input: DecideInput = {
    snapshot: {
      asOf: nowIso,
      chain: "base",
      pricesUsd,
      notes: ["task-runner synthetic snapshot (paper mode)"],
    },
    portfolio: {
      asOf: nowIso,
      chain: "base",
      // For first wiring, keep deterministic.
      // Next step: read real paper portfolio state here.
      balances: {
        USDC: "10",
        ETH: "0",
      },
      openPositions: [],
    },
  };

  // 1) Strategy → intents
  const intents = strategyStub(input);
  if (intents.length === 0) return;

  // 2) Risk → decisions
  const riskDecisions = evaluateRisk(input, intents);
  if (riskDecisions.length === 0) return;

  // 3) Policy → execution plans
  const plans = buildExecutionPlans(input, intents, riskDecisions);
  if (plans.length === 0) return;

  // 4) Paper execution (deterministic, no wallet, no chain)
  for (const plan of plans) {
    const report = paperExecutePlan(plan, pricesUsd);
    console.log(
      `[task-runner] STRATEGY_TICK planId=${report.planId} fills=${report.fills} rejects=${report.rejects}`
    );
  }
};
