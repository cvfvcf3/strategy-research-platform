export type AdxPoint = { adx: number; plusDi: number; minusDi: number };

/**
 * Wilder's ADX. Directional movement (+DM/-DM) and true range are each
 * Wilder-smoothed over `period`, DI's are derived from those smoothed
 * sums, DX = 100*|+DI - -DI|/(+DI + -DI), and ADX is DX itself
 * Wilder-smoothed over `period` (seeded with a plain average of the
 * first `period` DX values). Needs roughly 2*period bars before the
 * first ADX value — this is the standard double-smoothing warmup, not
 * a bug.
 */
export function adx(high: number[], low: number[], close: number[], period = 14): (AdxPoint | null)[] {
  const n = high.length;
  const out: (AdxPoint | null)[] = new Array(n).fill(null);
  if (n < period * 2 + 1) return out;

  const plusDm: number[] = new Array(n).fill(0);
  const minusDm: number[] = new Array(n).fill(0);
  const tr: number[] = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const upMove = high[i]! - high[i - 1]!;
    const downMove = low[i - 1]! - low[i]!;
    plusDm[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = Math.max(
      high[i]! - low[i]!,
      Math.abs(high[i]! - close[i - 1]!),
      Math.abs(low[i]! - close[i - 1]!),
    );
  }

  // Wilder-smooth each series, seeded with a plain sum over the first period
  // (indices 1..period, since index 0 has no true range / directional move).
  let smTr = sumRange(tr, 1, period);
  let smPlusDm = sumRange(plusDm, 1, period);
  let smMinusDm = sumRange(minusDm, 1, period);

  const dx: (number | null)[] = new Array(n).fill(null);
  // DI values recorded at the exact same point DX is computed, so the
  // output object below is never a separate, potentially-diverging
  // recomputation — it's literally what fed into DX.
  const plusDiSeries: (number | null)[] = new Array(n).fill(null);
  const minusDiSeries: (number | null)[] = new Array(n).fill(null);

  for (let i = period + 1; i < n; i++) {
    smTr = smTr - smTr / period + tr[i]!;
    smPlusDm = smPlusDm - smPlusDm / period + plusDm[i]!;
    smMinusDm = smMinusDm - smMinusDm / period + minusDm[i]!;

    const plusDi = smTr === 0 ? 0 : (100 * smPlusDm) / smTr;
    const minusDi = smTr === 0 ? 0 : (100 * smMinusDm) / smTr;
    plusDiSeries[i] = plusDi;
    minusDiSeries[i] = minusDi;
    const diSum = plusDi + minusDi;
    dx[i] = diSum === 0 ? 0 : (100 * Math.abs(plusDi - minusDi)) / diSum;
  }

  const firstDx = dx.findIndex((v) => v !== null);
  if (firstDx === -1) return out;
  const adxStart = firstDx + period - 1;
  if (adxStart >= n) return out;

  let adxVal = avgRange(dx, firstDx, firstDx + period);
  out[adxStart] = { adx: adxVal, plusDi: plusDiSeries[adxStart]!, minusDi: minusDiSeries[adxStart]! };

  for (let i = adxStart + 1; i < n; i++) {
    const d = dx[i];
    if (d === null) continue;
    adxVal = (adxVal * (period - 1) + d) / period;
    out[i] = { adx: adxVal, plusDi: plusDiSeries[i]!, minusDi: minusDiSeries[i]! };
  }
  return out;
}

function sumRange(arr: number[], start: number, count: number): number {
  let s = 0;
  for (let i = start; i < start + count; i++) s += arr[i] ?? 0;
  return s;
}

function avgRange(arr: (number | null)[], start: number, endExclusive: number): number {
  let s = 0;
  let c = 0;
  for (let i = start; i < endExclusive; i++) {
    const v = arr[i];
    if (v !== null) {
      s += v;
      c++;
    }
  }
  return c === 0 ? 0 : s / c;
}
