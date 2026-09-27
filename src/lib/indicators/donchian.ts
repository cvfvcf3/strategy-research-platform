export type DonchianPoint = { upper: number; lower: number; middle: number };

/** Upper = highest high over `period` bars (inclusive of current); lower = lowest low; middle = average of the two. */
export function donchian(high: number[], low: number[], period = 20): (DonchianPoint | null)[] {
  const n = high.length;
  const out: (DonchianPoint | null)[] = new Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (high[j]! > hi) hi = high[j]!;
      if (low[j]! < lo) lo = low[j]!;
    }
    out[i] = { upper: hi, lower: lo, middle: (hi + lo) / 2 };
  }
  return out;
}
