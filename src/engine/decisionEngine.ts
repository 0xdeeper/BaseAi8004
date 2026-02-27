import { DecideInput, DecideOutput, Intent } from "./types.js";
import { evaluateRisk } from "./risk.js";
import { buildExecutionPlans } from "./policy.js";
import crypto from "node:crypto";

/**
 * Strategy stub.
 * IMPORTANT:
 * - Returns Intents only.
 * - Never produces transactions.
 */
function strategyStub(input: DecideInput): Intent[] {
  const usdcBal = input.portfolio.balances["USDC"] ?? "0";

  // simple string-to-number parse for skeleton only
  const usdc = Number(usdcBal);

  // Safe default
  if (!Number.isFinite(usdc) || usdc < 5) {
    return [
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        type: "NOOP",
        chain: input.snapshot.chain,
        rationale: "USDC balance < 5 or invalid balance; no trade.",
        confidence: 0,
      },
    ];
  }

  // Paper-mode friendly micro-intent: swap 1 USDC -> ETH
  return [
    {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      type: "SPOT_SWAP_EXACT_IN",
      chain: input.snapshot.chain,
      fromAsset: "USDC",
      toAsset: "ETH",
      amountIn: "1",
      maxSlippageBps: 50,
      rationale: "Skeleton paper strategy: micro swap for pipeline test.",
      confidence: 0.1,
    },
  ];
}

/**
 * Main decision entrypoint:
 * 1) Strategy produces intents
 * 2) Deterministic risk evaluation
 * 3) Deterministic policy builds execution plans (non-executing)
 */
export function decide(input: DecideInput): DecideOutput {
  const intents = strategyStub(input);
  const policyDecisions = evaluateRisk(input, intents);
  const executionPlans = buildExecutionPlans(
    input,
    intents,
    policyDecisions
  );

  return {
    intents,
    policyDecisions,
    executionPlans,
  };
}