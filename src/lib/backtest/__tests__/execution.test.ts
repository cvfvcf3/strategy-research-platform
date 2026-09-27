import { describe, expect, it } from "vitest";
import { applySlippage, checkCandleExit, feeAmount } from "../execution";
import type { Candle } from "../../data/types";

describe("applySlippage", () => {
  it("makes a buy fill higher than the quoted price", () => {
    expect(applySlippage(100, "buy", 5)).toBeCloseTo(100.05, 6); // 5 bps = 0.05%
  });
  it("makes a sell fill lower than the quoted price", () => {
    expect(applySlippage(100, "sell", 5)).toBeCloseTo(99.95, 6);
  });
  it("is a no-op at 0 bps", () => {
    expect(applySlippage(100, "buy", 0)).toBe(100);
  });
});

describe("feeAmount", () => {
  it("computes basis-points fee on notional", () => {
    expect(feeAmount(10_000, 5)).toBeCloseTo(5, 6); // 0.05% of 10,000
  });
});

function candle(high: number, low: number): Candle {
  return { openTime: 0, closeTime: 1, open: (high + low) / 2, high, low, close: (high + low) / 2, volume: 1 };
}

describe("checkCandleExit", () => {
  it("long: hits stop loss when low touches it", () => {
    const result = checkCandleExit(candle(105, 94), "long", 95, 110);
    expect(result).toEqual({ hit: "stop_loss", price: 95 });
  });

  it("long: hits take profit when high touches it", () => {
    const result = checkCandleExit(candle(111, 100), "long", 95, 110);
    expect(result).toEqual({ hit: "take_profit", price: 110 });
  });

  it("long: resolves SL-first (conservative) when both are touched in the same candle", () => {
    const result = checkCandleExit(candle(115, 90), "long", 95, 110);
    expect(result).toEqual({ hit: "stop_loss", price: 95 });
  });

  it("long: neither touched -> no exit", () => {
    const result = checkCandleExit(candle(105, 100), "long", 95, 110);
    expect(result).toEqual({ hit: "none" });
  });

  it("short: hits stop loss when high touches it (stop is above entry)", () => {
    const result = checkCandleExit(candle(111, 90), "short", 110, 95);
    expect(result).toEqual({ hit: "stop_loss", price: 110 });
  });

  it("short: hits take profit when low touches it (target is below entry)", () => {
    const result = checkCandleExit(candle(105, 94), "short", 110, 95);
    expect(result).toEqual({ hit: "take_profit", price: 95 });
  });

  it("short: resolves SL-first when both touched in the same candle", () => {
    const result = checkCandleExit(candle(115, 90), "short", 110, 95);
    expect(result).toEqual({ hit: "stop_loss", price: 110 });
  });

  it("null stopLoss/takeProfit never trigger", () => {
    expect(checkCandleExit(candle(200, 1), "long", null, null)).toEqual({ hit: "none" });
  });
});
