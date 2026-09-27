import type { Candle } from "../data/types";
import { adx, type AdxPoint } from "../indicators/adx";
import { atr } from "../indicators/atr";
import { priorHighLow, type Position, type Strategy, type StrategyAction } from "./types";

export type DonchianParams = {
  donchianPeriod: number;
  adxEntryThreshold: number;
  adxNoTradeThreshold: number;
  atrPeriod: number;
  atrTrailingMultiplier: number;
};

type DonchianState = { adx: (AdxPoint | null)[]; atr: (number | null)[] };

export const donchianBreakout: Strategy<DonchianParams, DonchianState> = {
  key: "donchian_breakout",
  name: "Donchian Breakout",
  description:
    "Enters long on a close above the prior 20-bar high (short on a close below the prior 20-bar low), " +
    "filtered to ADX > 25 so breakouts are only taken in a trending market. No trades while ADX < 20 " +
    "(range-bound). Exits on a 2x-ATR trailing stop.",
  defaultParams: {
    donchianPeriod: 20,
    adxEntryThreshold: 25,
    adxNoTradeThreshold: 20,
    atrPeriod: 14,
    atrTrailingMultiplier: 2,
  },

  prepare(candles: Candle[], params: DonchianParams): DonchianState {
    const high = candles.map((c) => c.high);
    const low = candles.map((c) => c.low);
    const close = candles.map((c) => c.close);
    return {
      adx: adx(high, low, close, 14),
      atr: atr(high, low, close, params.atrPeriod),
    };
  },

  minWarmupBars(params: DonchianParams): number {
    return Math.max(params.donchianPeriod, params.atrPeriod, 29); // ADX(14) needs ~29 bars
  },

  decide(state, candles, i, params, position: Position | null): StrategyAction {
    const adxPoint = state.adx[i];
    const atrVal = state.atr[i];
    const close = candles[i]!.close;

    if (!position) {
      if (adxPoint === null || atrVal === null) return { type: "hold" };
      // Spec: "No trades ADX < 20" — a hard floor independent of the
      // (higher) entry threshold below.
      if (adxPoint.adx < params.adxNoTradeThreshold) return { type: "hold" };

      const window = priorHighLow(candles, i, params.donchianPeriod);
      if (!window) return { type: "hold" };

      if (close > window.high && adxPoint.adx > params.adxEntryThreshold) {
        return {
          type: "enter",
          side: "long",
          stopLoss: close - params.atrTrailingMultiplier * atrVal,
          takeProfit: null,
          reason: `close ${close.toFixed(4)} broke prior ${params.donchianPeriod}-bar high ${window.high.toFixed(4)}, ADX ${adxPoint.adx.toFixed(1)}`,
        };
      }
      if (close < window.low && adxPoint.adx > params.adxEntryThreshold) {
        return {
          type: "enter",
          side: "short",
          stopLoss: close + params.atrTrailingMultiplier * atrVal,
          takeProfit: null,
          reason: `close ${close.toFixed(4)} broke prior ${params.donchianPeriod}-bar low ${window.low.toFixed(4)}, ADX ${adxPoint.adx.toFixed(1)}`,
        };
      }
      return { type: "hold" };
    }

    // In position: trail the stop, never loosen it.
    if (atrVal === null) return { type: "hold" };
    if (position.side === "long") {
      const newStop = close - params.atrTrailingMultiplier * atrVal;
      if (position.stopLoss === null || newStop > position.stopLoss) {
        return { type: "update_stop", stopLoss: newStop, reason: "trailing stop raised" };
      }
    } else {
      const newStop = close + params.atrTrailingMultiplier * atrVal;
      if (position.stopLoss === null || newStop < position.stopLoss) {
        return { type: "update_stop", stopLoss: newStop, reason: "trailing stop lowered" };
      }
    }
    return { type: "hold" };
  },
};
