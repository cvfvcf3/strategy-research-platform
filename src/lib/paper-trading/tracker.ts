import type { BacktestMetrics } from "../backtest/metrics";

export type DivergenceReport = {
  paperReturnPct: number;
  backtestReturnPct: number;
  divergencePct: number; // |paper - backtest| / |backtest|, or |paper| if backtest is ~0
  divergesSignificantly: boolean; // > 30% per spec section 15
  paperTradeCount: number;
  backtestTradeCount: number;
};

/**
 * Spec section 15: flag when paper trading's realized return differs
 * from what the backtest would have produced over the identical period
 * by more than 30%. This is diagnostic, not a verdict — a divergence
 * can mean the backtest's fee/slippage assumptions were unrealistic, or
 * that live conditions (actual spread, partial fills the sim doesn't
 * model) are worse than assumed. It does not by itself mean the
 * strategy is broken.
 */
export function computeDivergence(paperMetrics: BacktestMetrics, backtestMetrics: BacktestMetrics): DivergenceReport {
  const paperReturnPct = paperMetrics.totalReturnPct;
  const backtestReturnPct = backtestMetrics.totalReturnPct;
  const denom = Math.abs(backtestReturnPct) > 1e-9 ? Math.abs(backtestReturnPct) : Math.max(Math.abs(paperReturnPct), 1e-9);
  const divergencePct = Math.abs(paperReturnPct - backtestReturnPct) / denom;

  return {
    paperReturnPct,
    backtestReturnPct,
    divergencePct,
    divergesSignificantly: divergencePct > 0.3,
    paperTradeCount: paperMetrics.tradeCount,
    backtestTradeCount: backtestMetrics.tradeCount,
  };
}
