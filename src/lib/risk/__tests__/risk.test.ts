import { describe, expect, it } from "vitest";
import { halfKelly, kellyFraction } from "../kelly";
import { positionSize } from "../position-size";

describe("kellyFraction", () => {
  it("matches the textbook formula f* = p - q/b", () => {
    // p=0.6, b=2 -> f* = 0.6 - 0.4/2 = 0.6 - 0.2 = 0.4
    expect(kellyFraction(0.6, 2)).toBeCloseTo(0.4, 6);
  });
  it("is 0 (never negative) when the edge is negative", () => {
    // p=0.3, b=1 -> f* = 0.3 - 0.7/1 = -0.4 -> clamped to 0
    expect(kellyFraction(0.3, 1)).toBe(0);
  });
  it("is 0 for a degenerate avgWinLossRatio", () => {
    expect(kellyFraction(0.6, 0)).toBe(0);
    expect(kellyFraction(0.6, -1)).toBe(0);
  });
});

describe("halfKelly", () => {
  it("is exactly half of the full Kelly fraction", () => {
    expect(halfKelly(0.6, 2)).toBeCloseTo(0.2, 6);
  });
});

describe("positionSize", () => {
  it("fixed_fractional: risks exactly riskPerTradePct of equity divided by stop distance", () => {
    const size = positionSize(
      { method: "fixed_fractional", equity: 10_000, entryPrice: 100, stopLossPrice: 95 },
      0.01,
    );
    // risk$ = 100; stopDistance = 5; size = 20
    expect(size).toBeCloseTo(20, 6);
  });

  it("returns 0 for a zero stop distance (entry == stop)", () => {
    const size = positionSize({ method: "fixed_fractional", equity: 10_000, entryPrice: 100, stopLossPrice: 100 });
    expect(size).toBe(0);
  });

  it("half_kelly falls back to the fixed-fractional budget when no trade history is given", () => {
    const withHistory = positionSize(
      { method: "half_kelly", equity: 10_000, entryPrice: 100, stopLossPrice: 95, winRate: 0.6, avgWinLossRatio: 2 },
      0.01,
      0.02,
    );
    const withoutHistory = positionSize(
      { method: "half_kelly", equity: 10_000, entryPrice: 100, stopLossPrice: 95 },
      0.01,
      0.02,
    );
    expect(withoutHistory).toBeCloseTo(20, 6); // same as the fixed_fractional case above
    expect(withHistory).not.toBeCloseTo(withoutHistory, 6);
  });

  it("half_kelly never exceeds the kellyCapPct risk budget even with a very strong edge", () => {
    // p=0.95, b=10 -> full Kelly = 0.95 - 0.05/10 = 0.945; half = 0.4725,
    // way above a 2% cap.
    const size = positionSize(
      { method: "half_kelly", equity: 10_000, entryPrice: 100, stopLossPrice: 95, winRate: 0.95, avgWinLossRatio: 10 },
      0.01,
      0.02,
    );
    const maxPossibleSize = (10_000 * 0.02) / 5; // capped risk% * equity / stopDistance
    expect(size).toBeCloseTo(maxPossibleSize, 6);
  });

  it("vol_adjusted widens size in a calmer-than-reference market but never past 3x the base budget", () => {
    const calm = positionSize(
      { method: "vol_adjusted", equity: 10_000, entryPrice: 100, stopLossPrice: 95, atr: 0.1 }, // atr as 0.1% of price, well under the 1% reference
      0.01,
    );
    const base = positionSize({ method: "fixed_fractional", equity: 10_000, entryPrice: 100, stopLossPrice: 95 }, 0.01);
    expect(calm).toBeGreaterThan(base);
    expect(calm).toBeLessThanOrEqual(base * 3 + 1e-9);
  });
});
