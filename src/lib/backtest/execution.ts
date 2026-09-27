import type { Candle } from "../data/types";
import type { Side } from "../strategies/types";

/** Slippage makes every fill worse for the trader: buys fill higher, sells fill lower. */
export function applySlippage(price: number, side: "buy" | "sell", slippageBps: number): number {
  const factor = slippageBps / 10_000;
  return side === "buy" ? price * (1 + factor) : price * (1 - factor);
}

export function feeAmount(notional: number, feeBps: number): number {
  return notional * (feeBps / 10_000);
}

export type CandleExitCheck =
  | { hit: "stop_loss"; price: number }
  | { hit: "take_profit"; price: number }
  | { hit: "none" };

/**
 * Spec section 9.5-9.6: SL/TP are checked against the NEXT candle's
 * high/low (i.e. the candle after the one the signal fired on — by the
 * time this runs, `candle` already IS that next candle). If both would
 * have been touched within the same candle, we cannot know which
 * happened first from OHLC alone, so we resolve SL first — the
 * conservative assumption, never the favorable one.
 */
export function checkCandleExit(candle: Candle, side: Side, stopLoss: number | null, takeProfit: number | null): CandleExitCheck {
  const slHit = stopLoss !== null && (side === "long" ? candle.low <= stopLoss : candle.high >= stopLoss);
  const tpHit = takeProfit !== null && (side === "long" ? candle.high >= takeProfit : candle.low <= takeProfit);

  if (slHit && tpHit) return { hit: "stop_loss", price: stopLoss! }; // conservative: SL first
  if (slHit) return { hit: "stop_loss", price: stopLoss! };
  if (tpHit) return { hit: "take_profit", price: takeProfit! };
  return { hit: "none" };
}
