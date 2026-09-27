/**
 * Full Kelly fraction: f* = p - q/b, where p = win rate, q = 1-p,
 * b = avg win / avg loss ratio. Returns 0 (never negative — a negative
 * Kelly means "don't take this bet", not "bet negative size") when the
 * edge is negative or inputs are degenerate.
 */
export function kellyFraction(winRate: number, avgWinLossRatio: number): number {
  if (avgWinLossRatio <= 0 || winRate < 0 || winRate > 1) return 0;
  const p = winRate;
  const q = 1 - p;
  const f = p - q / avgWinLossRatio;
  return Math.max(0, f);
}

export function halfKelly(winRate: number, avgWinLossRatio: number): number {
  return kellyFraction(winRate, avgWinLossRatio) / 2;
}
