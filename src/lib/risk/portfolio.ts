export type OpenPosition = { symbol: string; exposurePct: number; correlationGroup?: string };

export type PortfolioLimits = {
  maxPositions: number;
  maxCorrelatedExposurePct: number;
  dailyLossLimitPct: number;
  weeklyLossLimitPct: number;
  monthlyLossLimitPct: number;
};

// Spec section 13 defaults.
export const DEFAULT_PORTFOLIO_LIMITS: PortfolioLimits = {
  maxPositions: 3,
  maxCorrelatedExposurePct: 0.06,
  dailyLossLimitPct: 0.03,
  weeklyLossLimitPct: 0.07,
  monthlyLossLimitPct: 0.15,
};

export type NewTradeCheck = {
  symbol: string;
  correlationGroup?: string;
  newExposurePct: number;
};

export type RollingPnl = { dailyPct: number; weeklyPct: number; monthlyPct: number };

/**
 * Pure decision function: given the currently open positions, this
 * period's realized P&L, and a proposed new trade, says whether it's
 * allowed and why not if it isn't. Does not itself read or write any
 * state — callers (backtest engine, paper-trading simulator) own that.
 */
export function checkPortfolioLimits(
  openPositions: OpenPosition[],
  rollingPnl: RollingPnl,
  proposed: NewTradeCheck,
  limits: PortfolioLimits = DEFAULT_PORTFOLIO_LIMITS,
): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (openPositions.length >= limits.maxPositions) {
    reasons.push(`max_positions_reached (${openPositions.length}/${limits.maxPositions})`);
  }

  if (proposed.correlationGroup) {
    const correlatedExposure = openPositions
      .filter((p) => p.correlationGroup === proposed.correlationGroup)
      .reduce((sum, p) => sum + p.exposurePct, 0);
    if (correlatedExposure + proposed.newExposurePct > limits.maxCorrelatedExposurePct) {
      reasons.push(
        `correlated_exposure_limit (${(correlatedExposure + proposed.newExposurePct).toFixed(4)} > ${limits.maxCorrelatedExposurePct})`,
      );
    }
  }

  if (rollingPnl.dailyPct <= -limits.dailyLossLimitPct) reasons.push("daily_loss_limit_hit");
  if (rollingPnl.weeklyPct <= -limits.weeklyLossLimitPct) reasons.push("weekly_loss_limit_hit");
  if (rollingPnl.monthlyPct <= -limits.monthlyLossLimitPct) reasons.push("monthly_loss_limit_hit");

  return { allowed: reasons.length === 0, reasons };
}
