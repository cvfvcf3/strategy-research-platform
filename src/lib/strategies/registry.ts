import { donchianBreakout } from "./donchian-breakout";
import { meanReversion } from "./mean-reversion";
import { pairsTrading } from "./pairs-trading";

/** Single-symbol strategies runnable through the standard backtest engine. */
export const SINGLE_SYMBOL_STRATEGIES = {
  donchian_breakout: donchianBreakout,
  mean_reversion: meanReversion,
} as const;

export type SingleSymbolStrategyKey = keyof typeof SINGLE_SYMBOL_STRATEGIES;

/** Two-symbol strategies, run through the separate pairs-backtest path. */
export const PAIRS_STRATEGIES = {
  pairs_trading: pairsTrading,
} as const;

export const SUGGESTED_PAIRS: { a: string; b: string }[] = [
  { a: "BTC/USDT", b: "ETH/USDT" },
  { a: "SOL/USDT", b: "AVAX/USDT" },
  { a: "MATIC/USDT", b: "LINK/USDT" },
];

export function isSingleSymbolStrategy(key: string): key is SingleSymbolStrategyKey {
  return key in SINGLE_SYMBOL_STRATEGIES;
}

/**
 * Every strategy in the registry has a different `Strategy<P, S>`
 * instantiation (different params/state shapes), so a lookup typed as
 * `Record<string, Strategy<SpecificP, SpecificS>>` is unsound — the
 * compiler is right to reject that cast (this is exactly the error that
 * surfaced once the build actually reached the type-checking stage).
 * For call sites that only need the shared, non-generic metadata
 * (key/name/description/defaultParams — never `.prepare()`/`.decide()`),
 * this narrower type is honest about what's actually being read.
 */
export type StrategyMeta = {
  key: string;
  name: string;
  description: string;
  defaultParams: Record<string, unknown>;
  kind: "single_symbol" | "pairs";
};

export function getStrategyMeta(key: string): StrategyMeta | null {
  if (key in SINGLE_SYMBOL_STRATEGIES) {
    const s = SINGLE_SYMBOL_STRATEGIES[key as SingleSymbolStrategyKey];
    return { key: s.key, name: s.name, description: s.description, defaultParams: s.defaultParams, kind: "single_symbol" };
  }
  if (key in PAIRS_STRATEGIES) {
    const s = PAIRS_STRATEGIES[key as keyof typeof PAIRS_STRATEGIES];
    return { key: s.key, name: s.name, description: s.description, defaultParams: s.defaultParams, kind: "pairs" };
  }
  return null;
}
