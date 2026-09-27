import { describe, expect, it } from "vitest";
import { ema, sma } from "../ma";
import { rsi } from "../rsi";
import { atr } from "../atr";
import { macd } from "../macd";

describe("sma", () => {
  it("computes a simple average over the window", () => {
    const result = sma([1, 2, 3, 4, 5], 3);
    expect(result[1]).toBeNull(); // warmup
    expect(result[2]).toBeCloseTo(2); // (1+2+3)/3
    expect(result[3]).toBeCloseTo(3); // (2+3+4)/3
    expect(result[4]).toBeCloseTo(4); // (3+4+5)/3
  });
});

describe("ema", () => {
  it("seeds with an SMA of the first `period` values, matches hand calc for period=3", () => {
    // values: 1,2,3,4,5 ; period 3 ; k = 2/4 = 0.5
    // seed (index 2) = (1+2+3)/3 = 2
    // index 3: 4*0.5 + 2*0.5 = 3
    // index 4: 5*0.5 + 3*0.5 = 4
    const result = ema([1, 2, 3, 4, 5], 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(2);
    expect(result[3]).toBeCloseTo(3);
    expect(result[4]).toBeCloseTo(4);
  });

  it("null for the whole series when shorter than the period", () => {
    const result = ema([1, 2], 5);
    expect(result.every((v) => v === null)).toBe(true);
  });
});

describe("rsi", () => {
  it("is 100 when every move in the warmup window is a gain", () => {
    const values = Array.from({ length: 20 }, (_, i) => 100 + i); // strictly increasing
    const result = rsi(values, 14);
    expect(result[14]).toBe(100);
  });

  it("is 0 when every move in the warmup window is a loss", () => {
    const values = Array.from({ length: 20 }, (_, i) => 100 - i); // strictly decreasing
    const result = rsi(values, 14);
    expect(result[14]).toBe(0);
  });

  it("is 50 on a perfectly flat series (no gains, no losses)", () => {
    const values = new Array(20).fill(100);
    const result = rsi(values, 14);
    expect(result[14]).toBe(50);
  });

  it("stays within [0,100] on mixed data", () => {
    const values = [100, 102, 101, 105, 103, 108, 107, 110, 106, 112, 111, 115, 113, 118, 120];
    const result = rsi(values, 14);
    const v = result[14];
    expect(v).not.toBeNull();
    expect(v as number).toBeGreaterThanOrEqual(0);
    expect(v as number).toBeLessThanOrEqual(100);
  });
});

describe("atr", () => {
  it("for the first bar (no prior close) true range is just high-low, seeding the first ATR as a plain average", () => {
    const high = [110, 112, 108, 115, 111];
    const low = [100, 105, 100, 106, 104];
    const close = [105, 108, 103, 112, 108];
    const period = 3;
    // TR[0] = 110-100=10; TR[1]=max(112-105,|112-105|,|105-105|)=7; TR[2]=max(108-100,|108-108|,|100-108|)=8
    // ATR seed at index period-1=2: (10+7+8)/3 = 8.333...
    const result = atr(high, low, close, period);
    expect(result[2]).toBeCloseTo(25 / 3, 4);
  });

  it("returns null for every index before the warmup period", () => {
    const high = [1, 2, 3];
    const low = [0.5, 1, 1.5];
    const close = [0.8, 1.5, 2];
    const result = atr(high, low, close, 14);
    expect(result.every((v) => v === null)).toBe(true);
  });
});

describe("macd", () => {
  it("returns null before the slow EMA + signal EMA warmup completes", () => {
    const values = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = macd(values, 12, 26, 9);
    expect(result.every((v) => v === null)).toBe(true); // needs ~35 bars, only have 20
  });

  it("histogram = macd - signal on a computable series", () => {
    const values = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i * 0.2);
    const result = macd(values, 12, 26, 9);
    const lastValid = result.filter((v) => v !== null).pop();
    expect(lastValid).not.toBeUndefined();
    if (lastValid) {
      expect(lastValid.hist).toBeCloseTo(lastValid.macd - lastValid.signal, 6);
    }
  });
});
