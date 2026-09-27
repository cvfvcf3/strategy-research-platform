import type { Candle } from "../data/types";
import { adx } from "../indicators/adx";
import { atr } from "../indicators/atr";
import { ema } from "../indicators/ma";
import { computeMetrics, type BacktestMetrics, type Trade } from "../backtest/metrics";

export type TrendRegime = "bull" | "bear" | "range";
export type VolRegime = "high_vol" | "low_vol" | "normal_vol";

/** Spec section 12: Bull (ADX>25, price>EMA200), Bear (ADX>25, price<EMA200), Range (ADX<20). Bars with 20<=ADX<=25 and price either side are left unclassified (neither strongly trending nor clearly ranging). */
export function classifyTrendRegime(candles: Candle[]): (TrendRegime | null)[] {
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const close = candles.map((c) => c.close);
  const adxSeries = adx(high, low, close, 14);
  const ema200 = ema(close, 200);

  return candles.map((c, i) => {
    const a = adxSeries[i];
    const e = ema200[i];
    if (a === null || e === null) return null;
    if (a.adx > 25) return c.close > e ? "bull" : "bear";
    if (a.adx < 20) return "range";
    return null;
  });
}

/** High vol: ATR > 2x its own 100-bar average. Low vol: ATR < 0.5x. */
export function classifyVolRegime(candles: Candle[], lookback = 100): (VolRegime | null)[] {
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const close = candles.map((c) => c.close);
  const atrSeries = atr(high, low, close, 14);

  return candles.map((_, i) => {
    const cur = atrSeries[i];
    if (cur === null) return null;
    const windowStart = Math.max(0, i - lookback + 1);
    let sum = 0;
    let count = 0;
    for (let j = windowStart; j <= i; j++) {
      const v = atrSeries[j];
      if (v !== null) {
        sum += v;
        count++;
      }
    }
    if (count === 0) return null;
    const avg = sum / count;
    if (avg === 0) return null;
    if (cur > 2 * avg) return "high_vol";
    if (cur < 0.5 * avg) return "low_vol";
    return "normal_vol";
  });
}

export type RegimeBreakdown = Partial<Record<TrendRegime | VolRegime, BacktestMetrics & { tradeCountInRegime: number }>>;

/**
 * Buckets trades by the regime in effect at each trade's ENTRY bar (not
 * exit — a trade's classification is fixed by the conditions it was
 * opened under) and computes metrics per bucket. A regime with very few
 * trades gets flagged by its low tradeCountInRegime rather than hidden,
 * so "this only works in bull markets" is visible rather than diluted
 * into the aggregate.
 */
export function breakdownByRegime(
  candles: Candle[],
  trades: Trade[],
  trendRegimes: (TrendRegime | null)[],
  volRegimes: (VolRegime | null)[],
  barMs: number,
): RegimeBreakdown {
  const buckets: Record<string, Trade[]> = {
    bull: [],
    bear: [],
    range: [],
    high_vol: [],
    low_vol: [],
    normal_vol: [],
  };

  for (const trade of trades) {
    const trend = trendRegimes[trade.entryIndex];
    const vol = volRegimes[trade.entryIndex];
    if (trend) buckets[trend]!.push(trade);
    if (vol) buckets[vol]!.push(trade);
  }

  const out: RegimeBreakdown = {};
  for (const [regime, regimeTrades] of Object.entries(buckets)) {
    if (regimeTrades.length === 0) continue;
    // A synthetic equity curve of just this regime's trades, compounded
    // in the order they occurred, to get regime-specific drawdown/Sharpe.
    let equity = 1;
    const curve = [{ t: 0, equity }];
    for (const t of regimeTrades) {
      equity *= 1 + t.netPnlPct;
      curve.push({ t: t.exitTime, equity });
    }
    const metrics = computeMetrics(curve, regimeTrades, regimeTrades.length, barMs);
    out[regime as TrendRegime | VolRegime] = { ...metrics, tradeCountInRegime: regimeTrades.length };
  }
  return out;
}
