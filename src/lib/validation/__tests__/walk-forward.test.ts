import { describe, expect, it } from "vitest";
import { runWalkForward } from "../walk-forward";
import type { Candle } from "../../data/types";

function makeDailyCandles(days: number): Candle[] {
  const dayMs = 24 * 60 * 60 * 1000;
  const start = Date.parse("2020-01-01T00:00:00Z");
  const out: Candle[] = [];
  let price = 100;
  for (let i = 0; i < days; i++) {
    price *= 1 + Math.sin(i / 10) * 0.01; // gentle oscillation, enough structure for indicators to compute
    const openTime = start + i * dayMs;
    out.push({ openTime, closeTime: openTime + dayMs - 1, open: price, high: price * 1.01, low: price * 0.99, close: price, volume: 1000 });
  }
  return out;
}

describe("runWalkForward — windowing mechanics", () => {
  const candles = makeDailyCandles(500); // ~16 months of daily bars

  const baseConfig = {
    strategyKey: "donchian_breakout" as const,
    params: {},
    initialCapital: 10_000,
    sizingMethod: "fixed_fractional" as const,
    feeBps: 5,
    slippageBps: 5,
    market: "spot" as const,
  };

  it("produces at least one window when there's enough history for isMonths+oosMonths", () => {
    const result = runWalkForward(candles, baseConfig, 6, 2, 2);
    expect(result.windows.length).toBeGreaterThan(0);
  });

  it("each window's OOS period starts exactly where its IS period ends (no gap, no overlap)", () => {
    const result = runWalkForward(candles, baseConfig, 6, 2, 2);
    for (const w of result.windows) {
      expect(w.oosStart).toBe(w.isEnd);
      expect(w.oosEnd).toBeGreaterThan(w.oosStart);
    }
  });

  it("successive windows roll forward by rollMonths, not by the full IS+OOS span (i.e. they overlap in IS coverage, which is the point of walk-forward)", () => {
    const rollMonths = 2;
    const monthMs = 30.44 * 24 * 60 * 60 * 1000;
    const result = runWalkForward(candles, baseConfig, 6, 2, rollMonths);
    for (let i = 1; i < result.windows.length; i++) {
      const delta = result.windows[i]!.isStart - result.windows[i - 1]!.isStart;
      expect(delta).toBeCloseTo(rollMonths * monthMs, -3); // within ~ms rounding
    }
  });

  it("aggregateOosMetrics.tradeCount equals the sum of each window's OOS trade count", () => {
    const result = runWalkForward(candles, baseConfig, 6, 2, 2);
    const expectedSum = result.windows.reduce((s, w) => s + w.oosMetrics.tradeCount, 0);
    expect(result.aggregateOosMetrics.tradeCount).toBe(expectedSum);
  });

  it("returns an explicit empty-history rejection rather than throwing when there isn't enough data for even one window", () => {
    const shortCandles = makeDailyCandles(30); // far too short for a 6mo+2mo window
    const result = runWalkForward(shortCandles, baseConfig, 6, 2, 2);
    expect(result.windows.length).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain("insufficient_history_for_any_full_is_oos_window");
  });
});
