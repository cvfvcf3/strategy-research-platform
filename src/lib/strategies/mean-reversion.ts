import type { Candle } from "../data/types";
import { adx, type AdxPoint } from "../indicators/adx";
import { bollinger, type BollingerPoint } from "../indicators/bollinger";
import { rsi } from "../indicators/rsi";
import type { Position, Strategy, StrategyAction } from "./types";

export type MeanReversionParams = {
  rsiPeriod: number;
  bollingerPeriod: number;
  bollingerStd: number;
  adxEntryBelow: number; // only enter when ADX < this (range-bound)
  adxNoTradeAbove: number; // hard floor: never enter above this
  maxHoldBars: number;
};

type MeanReversionState = { rsi: (number | null)[]; bb: (BollingerPoint | null)[]; adx: (AdxPoint | null)[] };

export const meanReversion: Strategy<MeanReversionParams, MeanReversionState> = {
  key: "mean_reversion",
  name: "Mean Reversion",
  description:
    "Long when RSI<30 AND price below the lower Bollinger Band AND ADX<20 (range-bound); short on the " +
    "mirror image (RSI>70, above upper band, ADX<20). No trades while ADX>25 (trending — mean reversion " +
    "strategies get run over in a trend). Exits when RSI crosses back through 50, or after 10 bars, " +
    "whichever comes first.",
  defaultParams: {
    rsiPeriod: 14,
    bollingerPeriod: 20,
    bollingerStd: 2,
    adxEntryBelow: 20,
    adxNoTradeAbove: 25,
    maxHoldBars: 10,
  },

  prepare(candles: Candle[], params: MeanReversionParams): MeanReversionState {
    const high = candles.map((c) => c.high);
    const low = candles.map((c) => c.low);
    const close = candles.map((c) => c.close);
    return {
      rsi: rsi(close, params.rsiPeriod),
      bb: bollinger(close, params.bollingerPeriod, params.bollingerStd),
      adx: adx(high, low, close, 14),
    };
  },

  minWarmupBars(params: MeanReversionParams): number {
    return Math.max(params.rsiPeriod + 1, params.bollingerPeriod, 29);
  },

  decide(state, candles, i, params, position: Position | null): StrategyAction {
    const rsiVal = state.rsi[i];
    const bb = state.bb[i];
    const adxPoint = state.adx[i];
    const close = candles[i]!.close;

    if (!position) {
      if (rsiVal === null || bb === null || adxPoint === null) return { type: "hold" };
      if (adxPoint.adx > params.adxNoTradeAbove) return { type: "hold" }; // spec: no trades ADX > 25

      if (rsiVal < 30 && close < bb.lower && adxPoint.adx < params.adxEntryBelow) {
        return {
          type: "enter",
          side: "long",
          stopLoss: null,
          takeProfit: null,
          reason: `RSI ${rsiVal.toFixed(1)}<30, close below lower BB ${bb.lower.toFixed(4)}, ADX ${adxPoint.adx.toFixed(1)}<20`,
        };
      }
      if (rsiVal > 70 && close > bb.upper && adxPoint.adx < params.adxEntryBelow) {
        return {
          type: "enter",
          side: "short",
          stopLoss: null,
          takeProfit: null,
          reason: `RSI ${rsiVal.toFixed(1)}>70, close above upper BB ${bb.upper.toFixed(4)}, ADX ${adxPoint.adx.toFixed(1)}<20`,
        };
      }
      return { type: "hold" };
    }

    const barsHeld = i - position.entryIndex;
    if (barsHeld >= params.maxHoldBars) {
      return { type: "exit", reason: `max hold of ${params.maxHoldBars} bars reached` };
    }

    const prevRsi = i > 0 ? state.rsi[i - 1] : null;
    if (rsiVal !== null && prevRsi !== null) {
      if (position.side === "long" && prevRsi < 50 && rsiVal >= 50) {
        return { type: "exit", reason: "RSI crossed back above 50" };
      }
      if (position.side === "short" && prevRsi > 50 && rsiVal <= 50) {
        return { type: "exit", reason: "RSI crossed back below 50" };
      }
    }
    return { type: "hold" };
  },
};
