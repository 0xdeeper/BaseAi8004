import crypto from "node:crypto";
import {
  Intent,
  PolicyDecision,
  ExecutionPlan,
  ExecutionAction,
  SpotSwapExactInAction,
  SpotSwapExactOutAction,
  DecideInput,
} from "./types.js";

/**
 * Deterministic policy:
 * - Converts APPROVED intents into an ExecutionPlan.
 * - Must NOT create raw tx / calldata.
 * - Must NOT call wallet tools.
 */
export function buildExecutionPlans(
  input: DecideInput,
  intents: Intent[],
  riskDecisions: PolicyDecision[]
): ExecutionPlan[] {
  const byIntentId = new Map(
    riskDecisions.map((d) => [d.intentId, d])
  );

  const actions: ExecutionAction[] = [];
  const intentIds: string[] = [];

  for (const intent of intents) {
    const decision = byIntentId.get(intent.id);
    if (!decision || !decision.approved) continue;

    // HARD POLICY DEFAULTS:
    // - Only USDC as input asset
    // - Only spot swaps
    if (intent.type === "SPOT_SWAP_EXACT_IN") {
      if (intent.fromAsset !== "USDC") continue;

      const action: SpotSwapExactInAction = {
        actionId: crypto.randomUUID(),
        type: "SPOT_SWAP_EXACT_IN",
        chain: intent.chain,
        fromAsset: intent.fromAsset,
        toAsset: intent.toAsset,
        amountIn: intent.amountIn,
        minAmountOut: "0", // executor must compute real quote later
        deadlineSeconds: 120,
        maxGasUsd: 2,
      };

      actions.push(action);
      intentIds.push(intent.id);
    }

    if (intent.type === "SPOT_SWAP_EXACT_OUT") {
      if (intent.fromAsset !== "USDC") continue;

      const action: SpotSwapExactOutAction = {
        actionId: crypto.randomUUID(),
        type: "SPOT_SWAP_EXACT_OUT",
        chain: intent.chain,
        fromAsset: intent.fromAsset,
        toAsset: intent.toAsset,
        amountOut: intent.amountOut,
        maxAmountIn: intent.maxAmountIn,
        deadlineSeconds: 120,
        maxGasUsd: 2,
      };

      actions.push(action);
      intentIds.push(intent.id);
    }
  }

  if (actions.length === 0) return [];

  const plan: ExecutionPlan = {
    planId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    chain: "base",
    intentIds,
    actions,
    policyTag: "policy:v1-skeleton",
  };

  return [plan];
}
