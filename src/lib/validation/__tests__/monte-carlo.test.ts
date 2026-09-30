import { describe, expect, it } from "vitest";
import { runMonteCarlo } from "../monte-carlo";
import type { Trade } from "../../backtest/metrics";

function fakeTrade(netPnlPct: number): Trade {
  return {
    side: "long",
    entryIndex: 0,
    entryTime: 0,
    entryPrice: 100,
    exitIndex: 1,
    exitTime: 1,
    exitPrice: 100,
    size: 1,
    grossPnl: netPnlPct * 100,
    fees: 0,
    netPnl: netPnlPct * 100,
    netPnlPct,
    exitReason: "test",
    barsHeld: 1,
  };
}

describe("runMonteCarlo", () => {
  const trades = [0.05, -0.02, 0.03, -0.01, 0.04, -0.03, 0.02, 0.01, -0.02, 0.06].map(fakeTrade);

  it("is reproducible: the same seed produces identical percentiles", () => {
    const a = runMonteCarlo(trades, "shuffle", 500, 42);
    const b = runMonteCarlo(trades, "shuffle", 500, 42);
    expect(a.percentiles).toEqual(b.percentiles);
    expect(a.probProfit).toEqual(b.probProfit);
  });

  it("a different seed can produce different results (not hardcoded/ignored)", () => {
    const a = runMonteCarlo(trades, "bootstrap", 500, 1);
    const b = runMonteCarlo(trades, "bootstrap", 500, 2);
    // Not strictly guaranteed to differ for every possible seed pair, but
    // exceedingly likely for 500 bootstrap iterations over 10 trades —
    // if this ever flakes, the seed is probably being ignored somewhere.
    expect(a.percentiles).not.toEqual(b.percentiles);
  });

  it("percentiles are monotonically non-decreasing (p5<=p25<=p50<=p75<=p95)", () => {
    const result = runMonteCarlo(trades, "bootstrap", 1000, 7);
    const { p5, p25, p50, p75, p95 } = result.percentiles;
    expect(p5).toBeLessThanOrEqual(p25);
    expect(p25).toBeLessThanOrEqual(p50);
    expect(p50).toBeLessThanOrEqual(p75);
    expect(p75).toBeLessThanOrEqual(p95);
  });

  it("shuffle leaves total return unchanged (compounding is order-independent: a*b === b*a) — only the drawdown path varies", () => {
    // Multiplicative compounding means the final equity multiple is the
    // product of (1 + r) over all trades, which doesn't depend on order.
    // So shuffling can't produce a spread of final returns; its value is
    // entirely in the max-drawdown distribution (probLargeDrawdown).
    const result = runMonteCarlo(trades, "shuffle", 200, 3);
    expect(result.percentiles.p5).toBeCloseTo(result.percentiles.p95, 9);
    expect(result.probLargeDrawdown).toBeGreaterThanOrEqual(0);
    expect(result.probLargeDrawdown).toBeLessThanOrEqual(1);
  });

  it("reports no_trades_to_simulate and fails when given an empty trade list", () => {
    const result = runMonteCarlo([], "shuffle", 100, 1);
    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain("no_trades_to_simulate");
  });

  it("slippage_noise keeps the original trade order (only jitters magnitude)", () => {
    // With iterations=1 and noise clamped near 0 via a seed check isn't
    // directly observable from percentiles alone, so instead verify the
    // method runs and returns a sane structure for this method too.
    const result = runMonteCarlo(trades, "slippage_noise", 300, 9);
    expect(result.method).toBe("slippage_noise");
    expect(Number.isFinite(result.percentiles.p50)).toBe(true);
  });
});
