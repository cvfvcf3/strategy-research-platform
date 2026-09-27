import { sma } from "./ma";

export type BollingerPoint = { middle: number; upper: number; lower: number };

/** Middle = SMA(period); bands = middle +/- (numStd * population stddev over the same window). */
export function bollinger(values: number[], period = 20, numStd = 2): (BollingerPoint | null)[] {
  const out: (BollingerPoint | null)[] = new Array(values.length).fill(null);
  const mid = sma(values, period);
  for (let i = period - 1; i < values.length; i++) {
    const m = mid[i];
    if (m === null) continue;
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (values[j]! - m) ** 2;
    const sd = Math.sqrt(sumSq / period);
    out[i] = { middle: m, upper: m + numStd * sd, lower: m - numStd * sd };
  }
  return out;
}
