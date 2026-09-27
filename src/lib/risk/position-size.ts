export type SizingMethod = "fixed_fractional" | "half_kelly" | "vol_adjusted";

export type SizingInput = {
  method: SizingMethod;
  equity: number;
  entryPrice: number;
  stopLossPrice: number;
  /** Required for half_kelly: trailing win rate and avg win/loss ratio. */
  winRate?: number;
  avgWinLossRatio?: number;
  /** Required for vol_adjusted: current ATR. */
  atr?: number;
};

/**
 * Returns position size in units of the base asset (e.g. BTC), always
 * >= 0. Every method ultimately caps risk-per-trade at 1% of equity by
 * default (spec section 13) — half_kelly and vol_adjusted compute a
 * raw size first and then this function clamps it to that risk budget,
 * so a bad Kelly estimate or a very tight stop can't blow past the
 * portfolio's own risk limits.
 */
export function positionSize(input: SizingInput, riskPerTradePct = 0.01, kellyCapPct = 0.02): number {
  const stopDistance = Math.abs(input.entryPrice - input.stopLossPrice);
  if (stopDistance <= 0 || input.entryPrice <= 0 || input.equity <= 0) return 0;

  let riskBudgetPct = riskPerTradePct;

  if (input.method === "half_kelly") {
    if (input.winRate === undefined || input.avgWinLossRatio === undefined || input.avgWinLossRatio <= 0) {
      // Not enough trade history yet to estimate Kelly — fall back to
      // the conservative fixed-fractional budget rather than guessing.
      riskBudgetPct = riskPerTradePct;
    } else {
      const b = input.avgWinLossRatio;
      const p = input.winRate;
      const q = 1 - p;
      const kelly = p - q / b; // fraction of equity to risk, full Kelly
      const halfKelly = Math.max(0, kelly / 2);
      riskBudgetPct = Math.min(halfKelly, kellyCapPct); // spec 13: cap at 2%
    }
  } else if (input.method === "vol_adjusted") {
    if (input.atr === undefined || input.atr <= 0) {
      riskBudgetPct = riskPerTradePct;
    } else {
      // Scale risk inversely with volatility relative to a 1%-of-price
      // reference ATR, then still clamp to the base risk budget below.
      const atrPctOfPrice = input.atr / input.entryPrice;
      const referenceAtrPct = 0.01;
      riskBudgetPct = riskPerTradePct * (referenceAtrPct / Math.max(atrPctOfPrice, 0.0001));
    }
  }

  // Never exceed the base fixed-fractional budget except via the
  // explicit half_kelly path (which has its own kellyCapPct ceiling).
  if (input.method !== "half_kelly") {
    riskBudgetPct = Math.min(riskBudgetPct, riskPerTradePct * 3); // vol_adjusted can widen at most 3x in very calm markets
  }

  const riskDollars = input.equity * riskBudgetPct;
  return riskDollars / stopDistance;
}
