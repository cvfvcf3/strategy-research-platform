export type Trade = {
  side: "long" | "short";
  entryIndex: number;
  entryTime: number;
  entryPrice: number;
  exitIndex: number;
  exitTime: number;
  exitPrice: number;
  size: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  netPnlPct: number; // net P&L as a fraction of equity at entry
  exitReason: string;
  barsHeld: number;
};

export type EquityPoint = { t: number; equity: number };

export type BacktestMetrics = {
  totalReturnPct: number;
  annualizedReturnPct: number;
  maxDrawdownPct: number;
  maxDrawdownDurationBars: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  winRatePct: number;
  avgWinPct: number;
  avgLossPct: number;
  profitFactor: number;
  tradeCount: number;
  avgTradeDurationBars: number;
  exposurePct: number; // fraction of bars spent in a position
  bestTradePct: number;
  worstTradePct: number;
};

/**
 * Computes every metric from the equity curve + trade list only — never
 * re-touches raw candle data, so this function can't accidentally
 * introduce look-ahead (it only sees what the engine already decided).
 */
export function computeMetrics(equityCurve: EquityPoint[], trades: Trade[], barsTotal: number, barMs: number): BacktestMetrics {
  if (equityCurve.length < 2) {
    return zeroMetrics();
  }

  const initial = equityCurve[0]!.equity;
  const final = equityCurve[equityCurve.length - 1]!.equity;
  const totalReturnPct = initial > 0 ? (final - initial) / initial : 0;

  const totalMs = equityCurve[equityCurve.length - 1]!.t - equityCurve[0]!.t;
  const years = totalMs / (365.25 * 24 * 60 * 60 * 1000);
  const annualizedReturnPct = years > 0 && initial > 0 ? Math.pow(final / initial, 1 / years) - 1 : 0;

  // Max drawdown + longest drawdown duration (in bars) from the equity curve.
  let peak = equityCurve[0]!.equity;
  let peakIdx = 0;
  let maxDd = 0;
  let maxDdDurationBars = 0;
  for (let i = 0; i < equityCurve.length; i++) {
    const e = equityCurve[i]!.equity;
    if (e > peak) {
      peak = e;
      peakIdx = i;
    }
    const dd = peak > 0 ? (peak - e) / peak : 0;
    if (dd > maxDd) maxDd = dd;
    maxDdDurationBars = Math.max(maxDdDurationBars, i - peakIdx);
  }

  // Per-bar returns for Sharpe/Sortino, annualized using the actual bar interval.
  const barsPerYear = (365.25 * 24 * 60 * 60 * 1000) / barMs;
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1]!.equity;
    const cur = equityCurve[i]!.equity;
    returns.push(prev > 0 ? (cur - prev) / prev : 0);
  }
  const meanReturn = mean(returns);
  const stdReturn = stdDev(returns, meanReturn);
  const sharpe = stdReturn > 0 ? (meanReturn / stdReturn) * Math.sqrt(barsPerYear) : 0;

  const downside = returns.filter((r) => r < 0);
  const downsideStd = stdDev(downside, 0); // Sortino conventionally uses deviation from 0 (MAR), not the downside mean
  const sortino = downsideStd > 0 ? (meanReturn / downsideStd) * Math.sqrt(barsPerYear) : 0;

  const calmar = maxDd > 0 ? annualizedReturnPct / maxDd : 0;

  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl <= 0);
  const winRatePct = trades.length > 0 ? wins.length / trades.length : 0;
  const avgWinPct = wins.length > 0 ? mean(wins.map((t) => t.netPnlPct)) : 0;
  const avgLossPct = losses.length > 0 ? mean(losses.map((t) => t.netPnlPct)) : 0;
  const grossProfit = wins.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  const avgTradeDurationBars = trades.length > 0 ? mean(trades.map((t) => t.barsHeld)) : 0;
  const barsInPosition = trades.reduce((s, t) => s + t.barsHeld, 0);
  const exposurePct = barsTotal > 0 ? barsInPosition / barsTotal : 0;

  const pnlPcts = trades.map((t) => t.netPnlPct);
  const bestTradePct = pnlPcts.length > 0 ? Math.max(...pnlPcts) : 0;
  const worstTradePct = pnlPcts.length > 0 ? Math.min(...pnlPcts) : 0;

  return {
    totalReturnPct,
    annualizedReturnPct,
    maxDrawdownPct: maxDd,
    maxDrawdownDurationBars: maxDdDurationBars,
    sharpe,
    sortino,
    calmar,
    winRatePct,
    avgWinPct,
    avgLossPct,
    profitFactor,
    tradeCount: trades.length,
    avgTradeDurationBars,
    exposurePct,
    bestTradePct,
    worstTradePct,
  };
}

function zeroMetrics(): BacktestMetrics {
  return {
    totalReturnPct: 0,
    annualizedReturnPct: 0,
    maxDrawdownPct: 0,
    maxDrawdownDurationBars: 0,
    sharpe: 0,
    sortino: 0,
    calmar: 0,
    winRatePct: 0,
    avgWinPct: 0,
    avgLossPct: 0,
    profitFactor: 0,
    tradeCount: 0,
    avgTradeDurationBars: 0,
    exposurePct: 0,
    bestTradePct: 0,
    worstTradePct: 0,
  };
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stdDev(xs: number[], meanVal: number): number {
  if (xs.length === 0) return 0;
  const variance = xs.reduce((s, x) => s + (x - meanVal) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

// Rejection thresholds, spec section 9.
export const REJECTION_THRESHOLDS = {
  minSharpe: 1.0,
  maxDrawdownPct: 0.2,
  minTrades: 100,
  minProfitFactor: 1.2,
  minWinRatePct: 0.4,
};

export function checkRejection(m: BacktestMetrics): string[] {
  const reasons: string[] = [];
  if (m.sharpe < REJECTION_THRESHOLDS.minSharpe) reasons.push(`sharpe ${m.sharpe.toFixed(2)} < ${REJECTION_THRESHOLDS.minSharpe}`);
  if (m.maxDrawdownPct > REJECTION_THRESHOLDS.maxDrawdownPct) reasons.push(`max_drawdown ${(m.maxDrawdownPct * 100).toFixed(1)}% > ${REJECTION_THRESHOLDS.maxDrawdownPct * 100}%`);
  if (m.tradeCount < REJECTION_THRESHOLDS.minTrades) reasons.push(`trade_count ${m.tradeCount} < ${REJECTION_THRESHOLDS.minTrades}`);
  if (m.profitFactor < REJECTION_THRESHOLDS.minProfitFactor) reasons.push(`profit_factor ${m.profitFactor.toFixed(2)} < ${REJECTION_THRESHOLDS.minProfitFactor}`);
  if (m.winRatePct < REJECTION_THRESHOLDS.minWinRatePct) reasons.push(`win_rate ${(m.winRatePct * 100).toFixed(1)}% < ${REJECTION_THRESHOLDS.minWinRatePct * 100}%`);
  return reasons;
}
