import { describe, expect, it } from "vitest";
import { priorHighLow } from "../types";
import { pairsTrading, DEFAULT_PAIRS_PARAMS } from "../pairs-trading";
import { donchianBreakout } from "../donchian-breakout";
import { meanReversion } from "../mean-reversion";
import type { Candle } from "../../data/types";

function candle(high: number, low: number): Candle {
  return { openTime: 0, closeTime: 1, open: (high + low) / 2, high, low, close: (high + low) / 2, volume: 1 };
}

describe("priorHighLow", () => {
  it("excludes the current bar i itself from the window (a breakout must beat PRIOR bars, not itself)", () => {
    const candles = [candle(10, 5), candle(12, 6), candle(20, 15)]; // bar 2 has the highest high by far
    const window = priorHighLow(candles, 2, 2);
    expect(window).toEqual({ high: 12, low: 5 }); // only bars 0,1 — bar 2's own 20/15 excluded
  });

  it("returns null when there isn't enough history for the requested period", () => {
    const candles = [candle(10, 5), candle(12, 6)];
    expect(priorHighLow(candles, 1, 5)).toBeNull();
  });
});

describe("pairsTrading.decide — hand-constructed state", () => {
  const params = DEFAULT_PAIRS_PARAMS; // entryZ=2, exitZ=0.5, stopZ=3, minCorrelation=0.7

  function stateAt(z: number, corr: number) {
    return { spread: [0, 0], zscore: [null, z], correlation: [null, corr], beta: [null, 1] };
  }

  it("does not enter when correlation is below minCorrelation, even with an extreme z-score", () => {
    const action = pairsTrading.decide(stateAt(3, 0.5), 1, params, null);
    expect(action.type).toBe("hold");
  });

  it("enters short_a_long_b when z-score exceeds +entryZ with sufficient correlation", () => {
    const action = pairsTrading.decide(stateAt(2.5, 0.8), 1, params, null);
    expect(action).toEqual(expect.objectContaining({ type: "enter", direction: "short_a_long_b" }));
  });

  it("enters long_a_short_b when z-score is below -entryZ with sufficient correlation", () => {
    const action = pairsTrading.decide(stateAt(-2.5, 0.8), 1, params, null);
    expect(action).toEqual(expect.objectContaining({ type: "enter", direction: "long_a_short_b" }));
  });

  it("does not enter when |z-score| is between exitZ and entryZ (no edge)", () => {
    const action = pairsTrading.decide(stateAt(1.0, 0.9), 1, params, null);
    expect(action.type).toBe("hold");
  });

  it("exits an open position when |z-score| reverts below exitZ", () => {
    const action = pairsTrading.decide(stateAt(0.3, 0.9), 1, params, "short_a_long_b");
    expect(action.type).toBe("exit");
  });

  it("exits (stop) when |z-score| blows past stopZ — divergence, not convergence", () => {
    const action = pairsTrading.decide(stateAt(3.5, 0.9), 1, params, "short_a_long_b");
    expect(action.type).toBe("exit");
    expect(action.type === "exit" && action.reason).toMatch(/diverging/);
  });

  it("holds an open position while |z-score| is between exitZ and stopZ (still waiting to converge)", () => {
    const action = pairsTrading.decide(stateAt(2.0, 0.9), 1, params, "short_a_long_b");
    expect(action.type).toBe("hold");
  });
});

describe("donchianBreakout / meanReversion — degrade to hold rather than guessing on insufficient data", () => {
  it("donchianBreakout holds when ADX/ATR aren't warmed up yet", () => {
    const state = { adx: [null], atr: [null] };
    const candles = [candle(10, 5)];
    const action = donchianBreakout.decide(state, candles, 0, donchianBreakout.defaultParams, null);
    expect(action.type).toBe("hold");
  });

  it("meanReversion holds when RSI/Bollinger/ADX aren't warmed up yet", () => {
    const state = { rsi: [null], bb: [null], adx: [null] };
    const candles = [candle(10, 5)];
    const action = meanReversion.decide(state, candles, 0, meanReversion.defaultParams, null);
    expect(action.type).toBe("hold");
  });
});
