import type { Trade } from "../backtest/metrics";

export type MonteCarloMethod = "shuffle" | "bootstrap" | "slippage_noise";

export type MonteCarloResult = {
  method: MonteCarloMethod;
  iterations: number;
  seed: number;
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  probProfit: number;
  probLargeDrawdown: number; // P(maxDD > 20%)
  worstCase: number; // 0th-percentile-ish total return across all runs
  passed: boolean;
  rejectionReasons: string[];
};

/** Deterministic PRNG (mulberry32) — same seed always produces the same sequence, so results are reproducible (spec: "same data + same strategy = same result"). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWith(arr: number[], rand: () => number): number[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Simulates compounding a sequence of per-trade returns and reports total return + max drawdown for that one path. */
function simulatePath(returns: number[]): { totalReturn: number; maxDrawdown: number } {
  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  for (const r of returns) {
    equity *= 1 + r;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return { totalReturn: equity - 1, maxDrawdown: maxDd };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx]!;
}

export function runMonteCarlo(
  trades: Trade[],
  method: MonteCarloMethod,
  iterations = 1000,
  seed = 42,
): MonteCarloResult {
  const rand = mulberry32(seed);
  const baseReturns = trades.map((t) => t.netPnlPct);

  if (baseReturns.length === 0) {
    return {
      method,
      iterations,
      seed,
      percentiles: { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 },
      probProfit: 0,
      probLargeDrawdown: 0,
      worstCase: 0,
      passed: false,
      rejectionReasons: ["no_trades_to_simulate"],
    };
  }

  const totalReturns: number[] = [];
  const maxDrawdowns: number[] = [];

  for (let iter = 0; iter < iterations; iter++) {
    let path: number[];
    if (method === "shuffle") {
      path = shuffleWith(baseReturns, rand);
    } else if (method === "bootstrap") {
      path = Array.from({ length: baseReturns.length }, () => baseReturns[Math.floor(rand() * baseReturns.length)]!);
    } else {
      // slippage_noise: keep original order, jitter each return by up to +/-20%
      // of its own magnitude — stress-tests sensitivity to the slippage
      // assumption without also reordering trades (that's what "shuffle" is for).
      path = baseReturns.map((r) => r * (1 + (rand() * 2 - 1) * 0.2));
    }
    const { totalReturn, maxDrawdown } = simulatePath(path);
    totalReturns.push(totalReturn);
    maxDrawdowns.push(maxDrawdown);
  }

  totalReturns.sort((a, b) => a - b);
  const percentiles = {
    p5: percentile(totalReturns, 0.05),
    p25: percentile(totalReturns, 0.25),
    p50: percentile(totalReturns, 0.5),
    p75: percentile(totalReturns, 0.75),
    p95: percentile(totalReturns, 0.95),
  };
  const probProfit = totalReturns.filter((r) => r > 0).length / totalReturns.length;
  const probLargeDrawdown = maxDrawdowns.filter((d) => d > 0.2).length / maxDrawdowns.length;
  const worstCase = totalReturns[0]!;

  const rejectionReasons: string[] = [];
  // Spec section 11: reject if 5th percentile is negative AND P(DD>30%) > 30%.
  // (probLargeDrawdown here is DD>20%; DD>30% is checked separately below.)
  const probDdOver30 = maxDrawdowns.filter((d) => d > 0.3).length / maxDrawdowns.length;
  if (percentiles.p5 < 0 && probDdOver30 > 0.3) {
    rejectionReasons.push(`5th percentile return ${(percentiles.p5 * 100).toFixed(1)}% is negative AND P(DD>30%) ${(probDdOver30 * 100).toFixed(1)}% > 30%`);
  }

  return {
    method,
    iterations,
    seed,
    percentiles,
    probProfit,
    probLargeDrawdown,
    worstCase,
    passed: rejectionReasons.length === 0,
    rejectionReasons,
  };
}
