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
