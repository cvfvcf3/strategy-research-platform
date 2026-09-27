/** Rolling population standard deviation over `period` bars. */
export function rollingStdDev(values: number[], period = 20): (number | null)[] {
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j]!;
    const mean = sum / period;
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (values[j]! - mean) ** 2;
    out[i] = Math.sqrt(sumSq / period);
  }
  return out;
}

/** Rolling Pearson correlation between two equal-length series over `period` bars. */
export function rollingCorrelation(a: number[], b: number[], period = 30): (number | null)[] {
  const n = Math.min(a.length, b.length);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    let sumA = 0;
    let sumB = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumA += a[j]!;
      sumB += b[j]!;
    }
    const meanA = sumA / period;
    const meanB = sumB / period;
    let cov = 0;
    let varA = 0;
    let varB = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const da = a[j]! - meanA;
      const db = b[j]! - meanB;
      cov += da * db;
      varA += da * da;
      varB += db * db;
    }
    const denom = Math.sqrt(varA * varB);
    out[i] = denom === 0 ? 0 : cov / denom;
  }
  return out;
}

/** Rolling OLS beta of `a` regressed on `b` (i.e. a = alpha + beta*b) over `period` bars. */
export function rollingBeta(a: number[], b: number[], period = 30): (number | null)[] {
  const n = Math.min(a.length, b.length);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    let sumA = 0;
    let sumB = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumA += a[j]!;
      sumB += b[j]!;
    }
    const meanA = sumA / period;
    const meanB = sumB / period;
    let cov = 0;
    let varB = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const da = a[j]! - meanA;
      const db = b[j]! - meanB;
      cov += da * db;
      varB += db * db;
    }
    out[i] = varB === 0 ? 0 : cov / varB;
  }
  return out;
}
