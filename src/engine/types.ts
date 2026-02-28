 /**
 * Trading Decision Engine types (safe-by-default).
 * IMPORTANT:
 * - Strategy produces Intent only (no tx, no calldata).
 * - Deterministic policy converts Intent -> ExecutionPlan.
 * - ExecutionPlan is NOT a transaction.
 */

export type IsoDateString = string;
export type ChainName = "base";
export type AssetSymbol = string;

export interface MarketSnapshot {
  asOf: IsoDateString;
  chain: ChainName;
  pricesUsd: Record<AssetSymbol, number>;
  fundingRateBps?: Record<string, number>;
  notes?: string[];
}

export interface PortfolioState {
  asOf: IsoDateString;
  chain: ChainName;
  balances: Record<AssetSymbol, string>;
  openPositions?: Array<{
    venue: string;
    symbol: string;
    size: string;
    entryPriceUsd?: number;
  }>;
}

export type IntentType = "SPOT_SWAP_EXACT_IN" | "SPOT_SWAP_EXACT_OUT" | "NOOP";

export interface BaseIntent {
  id: string;
  createdAt: IsoDateString;
  type: IntentType;
  chain: ChainName;
  rationale?: string;
  confidence?: number;
}

export interface SpotSwapExactInIntent extends BaseIntent {
  type: "SPOT_SWAP_EXACT_IN";
  fromAsset: AssetSymbol;
  toAsset: AssetSymbol;
  amountIn: string;
  maxSlippageBps: number;
}

export interface SpotSwapExactOutIntent extends BaseIntent {
  type: "SPOT_SWAP_EXACT_OUT";
  fromAsset: AssetSymbol;
  toAsset: AssetSymbol;
  amountOut: string;
  maxAmountIn: string;
  maxSlippageBps: number;
}

export interface NoopIntent extends BaseIntent {
  type: "NOOP";
}

export type Intent = SpotSwapExactInIntent | SpotSwapExactOutIntent | NoopIntent;

export interface PolicyDecision {
  intentId: string;
  approved: boolean;
  reasons: string[];
  metrics?: Record<string, number | string | boolean>;
}

export type ExecutionActionType = "SPOT_SWAP_EXACT_IN" | "SPOT_SWAP_EXACT_OUT";

export interface ExecutionActionBase {
  actionId: string;
  type: ExecutionActionType;
  chain: ChainName;
  deadlineSeconds: number;
  maxGasUsd?: number;
}

export interface SpotSwapExactInAction extends ExecutionActionBase {
  type: "SPOT_SWAP_EXACT_IN";
  fromAsset: AssetSymbol;
  toAsset: AssetSymbol;
  amountIn: string;
  minAmountOut: string;
  venueHint?: string;
}

export interface SpotSwapExactOutAction extends ExecutionActionBase {
  type: "SPOT_SWAP_EXACT_OUT";
  fromAsset: AssetSymbol;
  toAsset: AssetSymbol;
  amountOut: string;
  maxAmountIn: string;
  venueHint?: string;
}

export type ExecutionAction = SpotSwapExactInAction | SpotSwapExactOutAction;

export interface ExecutionPlan {
  planId: string;
  createdAt: IsoDateString;
  chain: ChainName;
  intentIds: string[];
  actions: ExecutionAction[];
  policyTag: string;
}

export interface DecideInput {
  snapshot: MarketSnapshot;
  portfolio: PortfolioState;
}

export interface DecideOutput {
  intents: Intent[];
  policyDecisions: PolicyDecision[];
  executionPlans: ExecutionPlan[];
}
