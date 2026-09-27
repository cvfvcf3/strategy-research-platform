/** (value - rolling mean) / rolling population stddev, over the trailing `period` bars. */
export function zscore(values: number[], period = 20): (number | null)[] {
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j]!;
    const mean = sum / period;
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (values[j]! - mean) ** 2;
    const sd = Math.sqrt(sumSq / period);
    out[i] = sd === 0 ? 0 : (values[i]! - mean) / sd;
  }
  return out;
}
