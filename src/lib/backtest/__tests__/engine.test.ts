import { describe, expect, it } from "vitest";
import { runBacktestWithStrategy } from "../engine";
import type { Candle } from "../../data/types";
import type { Position, Strategy, StrategyAction } from "../../strategies/types";

function makeCandles(closes: number[], barMs = 60_000): Candle[] {
  const now = Date.now();
  return closes.map((c, i) => ({
    openTime: now + i * barMs,
    closeTime: now + i * barMs + barMs - 1,
    open: c,
    high: c + 1,
    low: c - 1,
    close: c,
    volume: 1000,
  }));
}

/** A strategy with fully scripted decisions, indexed by bar — makes the engine's own behavior (fill timing, sizing, P&L) fully predictable by hand rather than emergent from real indicator math. */
function scriptedStrategy(script: Record<number, StrategyAction>): Strategy<Record<string, never>, null> {
  return {
    key: "scripted_test_strategy",
    name: "Scripted",
    description: "test double",
    defaultParams: {},
    prepare: () => null,
    minWarmupBars: () => 0,
    decide: (_state, _candles, i, _params, _position: Position | null) => script[i] ?? { type: "hold" },
  };
}

describe("runBacktestWithStrategy — no look-ahead", () => {
  it("fills the entry at the NEXT bar's open, not the close of the bar the signal fired on", () => {
    // Signal fires at bar 2 (close=100); bar 3 opens at 150. If the
    // engine incorrectly filled at bar 2's own close, entryPrice would
    // be 100; the correct next-bar-open fill is 150.
    const closes = [100, 100, 100, 150, 150, 150, 150, 150];
    const candles = makeCandles(closes);
    const strategy = scriptedStrategy({
      2: { type: "enter", side: "long", stopLoss: 50, takeProfit: null, reason: "enter" },
      5: { type: "exit", reason: "exit" },
    });
    const result = runBacktestWithStrategy(candles, strategy, {
      params: {},
      initialCapital: 10_000,
      sizingMethod: "fixed_fractional",
      feeBps: 0,
      slippageBps: 0,
      market: "spot",
    });
    expect(result.trades.length).toBe(1);
    expect(result.trades[0]!.entryPrice).toBeCloseTo(150, 6);
    expect(result.trades[0]!.entryPrice).not.toBeCloseTo(100, 6);
  });

  it("fills a signal-exit at the NEXT bar's open, not the close of the bar the exit signal fired on", () => {
    const closes = [100, 100, 100, 100, 100, 100, 200, 300];
    const candles = makeCandles(closes);
    const strategy = scriptedStrategy({
      1: { type: "enter", side: "long", stopLoss: null, takeProfit: null, reason: "enter" },
      5: { type: "exit", reason: "exit" }, // bar 5 close=100; bar 6 opens at 200
    });
    const result = runBacktestWithStrategy(candles, strategy, {
      params: {},
      initialCapital: 10_000,
      sizingMethod: "fixed_fractional",
      feeBps: 0,
      slippageBps: 0,
      market: "spot",
      syntheticStopDistancePct: 0.02,
    });
    expect(result.trades.length).toBe(1);
    expect(result.trades[0]!.exitPrice).toBeCloseTo(200, 6); // bar 6's open, not bar 5's close (100) or bar 7's (300)
  });
});

describe("runBacktestWithStrategy — win/loss accounting", () => {
  it("records a winning trade with the expected direction of P&L for a long", () => {
    const closes = [100, 100, 100, 100, 100, 200, 200, 200];
    const candles = makeCandles(closes);
    const strategy = scriptedStrategy({
      1: { type: "enter", side: "long", stopLoss: null, takeProfit: null, reason: "enter" },
      4: { type: "exit", reason: "exit" },
    });
    const result = runBacktestWithStrategy(candles, strategy, {
      params: {},
      initialCapital: 10_000,
      sizingMethod: "fixed_fractional",
      feeBps: 0,
      slippageBps: 0,
      market: "spot",
      syntheticStopDistancePct: 0.02, // no real stop provided, so sizing needs a synthetic distance
    });
    expect(result.trades.length).toBe(1);
    expect(result.trades[0]!.side).toBe("long");
    expect(result.trades[0]!.netPnl).toBeGreaterThan(0); // bought at ~100, price went to 200
  });

  it("records a losing trade with negative P&L for a long that drops", () => {
    const closes = [100, 100, 100, 100, 100, 50, 50, 50];
    const candles = makeCandles(closes);
    const strategy = scriptedStrategy({
      1: { type: "enter", side: "long", stopLoss: null, takeProfit: null, reason: "enter" },
      4: { type: "exit", reason: "exit" },
    });
    const result = runBacktestWithStrategy(candles, strategy, {
      params: {},
      initialCapital: 10_000,
      sizingMethod: "fixed_fractional",
      feeBps: 0,
      slippageBps: 0,
      market: "spot",
      syntheticStopDistancePct: 0.02,
    });
    expect(result.trades.length).toBe(1);
    expect(result.trades[0]!.netPnl).toBeLessThan(0);
  });
});

describe("runBacktestWithStrategy — fees and slippage reduce net P&L", () => {
  it("a round trip with fees/slippage nets less than the same round trip with none", () => {
    const closes = [100, 100, 100, 100, 100, 200, 200, 200];
    const candles = makeCandles(closes);
    const strategy = scriptedStrategy({
      1: { type: "enter", side: "long", stopLoss: null, takeProfit: null, reason: "enter" },
      4: { type: "exit", reason: "exit" },
    });
    const free = runBacktestWithStrategy(candles, strategy, {
      params: {}, initialCapital: 10_000, sizingMethod: "fixed_fractional", feeBps: 0, slippageBps: 0, market: "spot", syntheticStopDistancePct: 0.02,
    });
    const costly = runBacktestWithStrategy(candles, strategy, {
      params: {}, initialCapital: 10_000, sizingMethod: "fixed_fractional", feeBps: 20, slippageBps: 20, market: "spot", syntheticStopDistancePct: 0.02,
    });
    expect(costly.trades[0]!.netPnl).toBeLessThan(free.trades[0]!.netPnl);
  });
});

describe("runBacktestWithStrategy — position sizing respects risk-per-trade", () => {
  it("a tighter stop (smaller risk distance) produces a larger position size than a wider stop, for the same risk budget", () => {
    const closes = [100, 100, 100, 100, 100, 100, 100, 100];
    const candles = makeCandles(closes);

    const tightStop = scriptedStrategy({
      1: { type: "enter", side: "long", stopLoss: 99, takeProfit: null, reason: "enter" },
      5: { type: "exit", reason: "exit" },
    });
    const wideStop = scriptedStrategy({
      1: { type: "enter", side: "long", stopLoss: 80, takeProfit: null, reason: "enter" },
      5: { type: "exit", reason: "exit" },
    });

    const resultTight = runBacktestWithStrategy(candles, tightStop, {
      params: {}, initialCapital: 10_000, sizingMethod: "fixed_fractional", feeBps: 0, slippageBps: 0, market: "spot",
    });
    const resultWide = runBacktestWithStrategy(candles, wideStop, {
      params: {}, initialCapital: 10_000, sizingMethod: "fixed_fractional", feeBps: 0, slippageBps: 0, market: "spot",
    });

    // riskDollars (1% of 10,000 = 100) / stopDistance = size.
    // tightStop: stopDistance=1 -> size=100. wideStop: stopDistance=20 -> size=5.
    expect(resultTight.trades[0]!.size).toBeCloseTo(100, 4);
    expect(resultWide.trades[0]!.size).toBeCloseTo(5, 4);
    expect(resultTight.trades[0]!.size).toBeGreaterThan(resultWide.trades[0]!.size);
  });

  it("caps position notional at equity * maxLeverage (default 1, no leverage) even if the risk formula would ask for more", () => {
    const closes = [100, 100, 100, 100, 100, 100];
    const candles = makeCandles(closes);
    // An extremely tight stop would imply a huge size from the risk
    // formula (100/0.01 = 10,000 units at $100 = $1,000,000 notional on
    // $10,000 equity) — the leverage cap must clamp this back down.
    const strategy = scriptedStrategy({
      1: { type: "enter", side: "long", stopLoss: 99.99, takeProfit: null, reason: "enter" },
      3: { type: "exit", reason: "exit" },
    });
    const result = runBacktestWithStrategy(candles, strategy, {
      params: {}, initialCapital: 10_000, sizingMethod: "fixed_fractional", feeBps: 0, slippageBps: 0, market: "spot",
    });
    const notional = result.trades[0]!.size * result.trades[0]!.entryPrice;
    expect(notional).toBeLessThanOrEqual(10_000 * 1.0001); // maxLeverage defaults to 1
  });
});

describe("runBacktestWithStrategy — per-trade return basis", () => {
  it("netPnlPct is a fraction of ACCOUNT equity at entry, not of the trade's notional", () => {
    // Stop 20 below entry -> size = (1% of 10,000) / 20 = 5 units, i.e. only
    // $500 notional on a $10,000 account. Price doubles 100 -> 200, so the
    // trade makes $500 = 5% of account equity (but 100% of its own notional).
    const closes = [100, 100, 100, 100, 100, 200, 200, 200];
    const candles = makeCandles(closes);
    const strategy = scriptedStrategy({
      1: { type: "enter", side: "long", stopLoss: 80, takeProfit: null, reason: "enter" },
      4: { type: "exit", reason: "exit" },
    });
    const result = runBacktestWithStrategy(candles, strategy, {
      params: {}, initialCapital: 10_000, sizingMethod: "fixed_fractional", feeBps: 0, slippageBps: 0, market: "spot",
    });
    expect(result.trades[0]!.netPnl).toBeCloseTo(500, 4);
    expect(result.trades[0]!.netPnlPct).toBeCloseTo(0.05, 6);
  });
});
