import { ema } from "./ma";

export type MacdPoint = { macd: number; signal: number; hist: number };

/**
 * MACD line = EMA(fast) - EMA(slow); signal = EMA(signalPeriod) of the
 * MACD line; histogram = macd - signal. Warmup: no value until the slow
 * EMA is seeded AND the signal EMA on top of it is seeded, i.e. roughly
 * `slow + signalPeriod` bars.
 */
export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): (MacdPoint | null)[] {
  const out: (MacdPoint | null)[] = new Array(values.length).fill(null);
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);

  const macdLine: (number | null)[] = values.map((_, i) => {
    const f = emaFast[i];
    const s = emaSlow[i];
    return f !== null && s !== null ? f - s : null;
  });

  const firstValid = macdLine.findIndex((v) => v !== null);
  if (firstValid === -1) return out;

  const macdSeries = macdLine.slice(firstValid).map((v) => v as number);
  const signalSeries = ema(macdSeries, signalPeriod);

  for (let i = 0; i < signalSeries.length; i++) {
    const sig = signalSeries[i];
    if (sig === null) continue;
    const idx = firstValid + i;
    const macdVal = macdLine[idx] as number;
    out[idx] = { macd: macdVal, signal: sig, hist: macdVal - sig };
  }
  return out;
}
