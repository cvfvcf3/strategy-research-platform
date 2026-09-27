import type { Candle } from "../data/types";
import { runBacktest, type BacktestConfig } from "../backtest/engine";
import { computeMetrics, type BacktestMetrics } from "../backtest/metrics";

export type WalkForwardWindow = {
  isStart: number;
  isEnd: number;
  oosStart: number;
  oosEnd: number;
  isMetrics: BacktestMetrics;
  oosMetrics: BacktestMetrics;
};

export type WalkForwardResult = {
  windows: WalkForwardWindow[];
  aggregateOosMetrics: BacktestMetrics;
  consistencyScore: number; // fraction of OOS windows with positive return
  degradationRatio: number; // aggregate OOS Sharpe / aggregate IS Sharpe
  passed: boolean;
  rejectionReasons: string[];
};

/**
 * Rolls a 2-year in-sample / 6-month out-of-sample window forward by 6
 * months at a time (spec section 10) over candle *timestamps* — not bar
 * counts, so this behaves the same regardless of timeframe.
 */
export function runWalkForward(
  candles: Candle[],
  config: Omit<BacktestConfig, "params"> & { params: Record<string, unknown> },
  isMonths = 24,
  oosMonths = 6,
  rollMonths = 6,
): WalkForwardResult {
  const windows: WalkForwardWindow[] = [];
  if (candles.length === 0) {
    return emptyResult();
  }
  const start = candles[0]!.openTime;
  const end = candles[candles.length - 1]!.openTime;
  const monthMs = 30.44 * 24 * 60 * 60 * 1000;

  let isStart = start;
  while (true) {
    const isEnd = isStart + isMonths * monthMs;
    const oosStart = isEnd;
    const oosEnd = oosStart + oosMonths * monthMs;
    if (oosEnd > end) break;

    const isCandles = candles.filter((c) => c.openTime >= isStart && c.openTime < isEnd);
    const oosCandles = candles.filter((c) => c.openTime >= oosStart && c.openTime < oosEnd);

    if (isCandles.length > 0 && oosCandles.length > 0) {
      const isResult = runBacktest(isCandles, config as BacktestConfig);
      const oosResult = runBacktest(oosCandles, config as BacktestConfig);
      windows.push({ isStart, isEnd, oosStart, oosEnd, isMetrics: isResult.metrics, oosMetrics: oosResult.metrics });
    }

    isStart += rollMonths * monthMs;
  }

  if (windows.length === 0) {
    return emptyResult();
  }

  // Aggregate OOS metrics: stitch each window's OOS equity curve together
  // conceptually by averaging the return-based metrics and summing trade
  // counts, rather than re-running one giant backtest (which would just
  // reproduce the full-sample result and defeat the point of OOS testing).
  const oosSharpes = windows.map((w) => w.oosMetrics.sharpe);
  const isSharpes = windows.map((w) => w.isMetrics.sharpe);
  const aggregateOosMetrics: BacktestMetrics = {
    totalReturnPct: mean(windows.map((w) => w.oosMetrics.totalReturnPct)),
    annualizedReturnPct: mean(windows.map((w) => w.oosMetrics.annualizedReturnPct)),
    maxDrawdownPct: Math.max(...windows.map((w) => w.oosMetrics.maxDrawdownPct)),
    maxDrawdownDurationBars: Math.max(...windows.map((w) => w.oosMetrics.maxDrawdownDurationBars)),
    sharpe: mean(oosSharpes),
    sortino: mean(windows.map((w) => w.oosMetrics.sortino)),
    calmar: mean(windows.map((w) => w.oosMetrics.calmar)),
    winRatePct: mean(windows.map((w) => w.oosMetrics.winRatePct)),
    avgWinPct: mean(windows.map((w) => w.oosMetrics.avgWinPct)),
    avgLossPct: mean(windows.map((w) => w.oosMetrics.avgLossPct)),
    profitFactor: mean(windows.map((w) => w.oosMetrics.profitFactor).filter(Number.isFinite)),
    tradeCount: windows.reduce((s, w) => s + w.oosMetrics.tradeCount, 0),
    avgTradeDurationBars: mean(windows.map((w) => w.oosMetrics.avgTradeDurationBars)),
    exposurePct: mean(windows.map((w) => w.oosMetrics.exposurePct)),
    bestTradePct: Math.max(...windows.map((w) => w.oosMetrics.bestTradePct)),
    worstTradePct: Math.min(...windows.map((w) => w.oosMetrics.worstTradePct)),
  };

  const consistencyScore = windows.filter((w) => w.oosMetrics.totalReturnPct > 0).length / windows.length;
  const meanIsSharpe = mean(isSharpes);
  const degradationRatio = meanIsSharpe !== 0 ? mean(oosSharpes) / meanIsSharpe : 0;

  const rejectionReasons: string[] = [];
  if (aggregateOosMetrics.sharpe < 0.5) rejectionReasons.push(`OOS Sharpe ${aggregateOosMetrics.sharpe.toFixed(2)} < 0.5`);
  if (degradationRatio < 0.5) rejectionReasons.push(`degradation ratio ${degradationRatio.toFixed(2)} < 0.5`);

  return {
    windows,
    aggregateOosMetrics,
    consistencyScore,
    degradationRatio,
    passed: rejectionReasons.length === 0,
    rejectionReasons,
  };
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

function emptyResult(): WalkForwardResult {
  const zero = computeMetrics([], [], 0, 60_000);
  return {
    windows: [],
    aggregateOosMetrics: zero,
    consistencyScore: 0,
    degradationRatio: 0,
    passed: false,
    rejectionReasons: ["insufficient_history_for_any_full_is_oos_window"],
  };
}
