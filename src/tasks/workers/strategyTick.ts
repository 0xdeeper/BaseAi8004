import type { TaskWorker } from "../types.js";

import type { DecideInput, AssetSymbol } from "../../engine/types.js";
import { strategyStub } from "../../engine/decisionEngine.js";
import { evaluateRisk } from "../../engine/risk.js";
import { buildExecutionPlans } from "../../engine/policy.js";

import { paperExecutePlan } from "../../paper/paper-executor.js";
import { derivePaperPortfolio } from "../../paper/paper-portfolio.js";

export const strategyTickWorker: TaskWorker = async (_payload, ctx) => {
  const pricesUsd: Record<AssetSymbol, number> = {
    USDC: 1.0,
    ETH: 3000.0,
  };

  const nowIso = new Date(ctx.nowMs).toISOString();

  // ✅ Portfolio derived from paper ledger (removes hardcoded balances)
  const portfolio = derivePaperPortfolio({ chain: "base" });

  const input: DecideInput = {
    snapshot: {
      asOf: nowIso,
      chain: "base",
      pricesUsd,
      notes: ["task-runner synthetic snapshot (paper mode)"],
    },
    portfolio,
  };

  const intents = strategyStub(input);
  if (intents.length === 0) return;

  const riskDecisions = evaluateRisk(input, intents);
  if (riskDecisions.length === 0) return;

  const plans = buildExecutionPlans(input, intents, riskDecisions);
  if (plans.length === 0) return;

  for (const plan of plans) {
    const report = paperExecutePlan(plan, pricesUsd);
    console.log(
      `[task-runner] STRATEGY_TICK planId=${report.planId} fills=${report.fills} rejects=${report.rejects}`
    );
  }
};
