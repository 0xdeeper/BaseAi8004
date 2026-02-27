import { Intent, PolicyDecision, DecideInput } from "./types.js";

/**
 * Deterministic risk checks (NO LLM, NO wallet access).
 * Keep this pure and side-effect free.
 */
export function evaluateRisk(
  input: DecideInput,
  intents: Intent[]
): PolicyDecision[] {
  const decisions: PolicyDecision[] = [];

  for (const intent of intents) {
    const reasons: string[] = [];

    // Only Base chain supported for now
    if (intent.chain !== "base") {
      reasons.push("Only Base chain supported in Phase B skeleton.");
    }

    // Slippage sanity checks
    if ("maxSlippageBps" in intent) {
      const bps = (intent as any).maxSlippageBps as number;

      if (bps <= 0) reasons.push("maxSlippageBps must be > 0.");
      if (bps > 100)
        reasons.push("maxSlippageBps too high (>100 bps) for safe default.");
    }

    // Basic numeric string validation
    for (const field of ["amountIn", "amountOut", "maxAmountIn"] as const) {
      const value = (intent as any)[field];

      if (value !== undefined) {
        const s = String(value);

        if (!/^\d+(\.\d+)?$/.test(s)) {
          reasons.push(`${field} must be a numeric string.`);
        }

        if (s === "0" || s === "0.0") {
          reasons.push(`${field} must be > 0.`);
        }
      }
    }

    decisions.push({
      intentId: intent.id,
      approved: reasons.length === 0,
      reasons: reasons.length ? reasons : ["OK"],
      metrics: {
        riskVersion: "v1",
      },
    });
  }

  return decisions;
}
