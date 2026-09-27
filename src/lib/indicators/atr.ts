/**
 * Average True Range, Wilder-smoothed. True range for bar i is
 * max(high-low, |high-prevClose|, |low-prevClose|); bar 0 has no
 * previous close so TR = high-low there. First ATR value is the plain
 * average of the first `period` true ranges (Wilder's own seeding).
 */
export function atr(high: number[], low: number[], close: number[], period = 14): (number | null)[] {
  const n = high.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n === 0) return out;

  const tr: number[] = new Array(n);
  tr[0] = high[0]! - low[0]!;
  for (let i = 1; i < n; i++) {
    const a = high[i]! - low[i]!;
    const b = Math.abs(high[i]! - close[i - 1]!);
    const c = Math.abs(low[i]! - close[i - 1]!);
    tr[i] = Math.max(a, b, c);
  }

  if (n <= period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i]!;
  let prevAtr = sum / period;
  out[period - 1] = prevAtr;
  for (let i = period; i < n; i++) {
    prevAtr = (prevAtr * (period - 1) + tr[i]!) / period;
    out[i] = prevAtr;
  }
  return out;
}
