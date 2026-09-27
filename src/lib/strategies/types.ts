import type { Candle } from "../data/types";

export type Side = "long" | "short";

export type Position = {
  side: Side;
  entryIndex: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
};

export type StrategyAction =
  | { type: "enter"; side: Side; stopLoss: number | null; takeProfit: number | null; reason: string }
  | { type: "exit"; reason: string }
  | { type: "update_stop"; stopLoss: number; reason: string }
  | { type: "hold" };

/**
 * `S` is whatever a strategy wants to precompute once over the full
 * candle array in `prepare()` (indicator series, mostly) so `decide()`
 * called at every bar doesn't redo O(n) work and turn a backtest into
 * O(n^2). The backtest engine calls prepare() exactly once per run.
 */
export interface Strategy<P = Record<string, unknown>, S = unknown> {
  key: string;
  name: string;
  description: string;
  defaultParams: P;
  prepare(candles: Candle[], params: P): S;
  minWarmupBars(params: P): number;
  /** Called once per closed bar i (0-based). `position` is null when flat. */
  decide(state: S, candles: Candle[], i: number, params: P, position: Position | null): StrategyAction;
}

/** Highest high / lowest low over the `period` bars strictly BEFORE index i (excludes bar i itself) — the correct window for a breakout comparison, since including today's own high would let today trivially "break" its own high. */
export function priorHighLow(candles: Candle[], i: number, period: number): { high: number; low: number } | null {
  if (i - period < 0) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (let j = i - period; j < i; j++) {
    if (candles[j]!.high > hi) hi = candles[j]!.high;
    if (candles[j]!.low < lo) lo = candles[j]!.low;
  }
  return { high: hi, low: lo };
}
