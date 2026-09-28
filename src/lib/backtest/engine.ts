import type { Candle, FundingPoint, Market } from "../data/types";
import { positionSize, type SizingMethod } from "../risk/position-size";
import { getSingleSymbolStrategy, type SingleSymbolStrategyKey } from "../strategies/registry";
import type { Position, Side, Strategy } from "../strategies/types";
import { applySlippage, checkCandleExit, feeAmount } from "./execution";
import { checkRejection, computeMetrics, type BacktestMetrics, type EquityPoint, type Trade } from "./metrics";

export type BacktestConfig = {
  strategyKey: SingleSymbolStrategyKey;
  params: Record<string, unknown>;
  initialCapital: number;
  sizingMethod: SizingMethod;
  feeBps: number;
  slippageBps: number;
  market: Market;
  /** Position notional is capped at equity * maxLeverage. Default 1 = no leverage (spec 9.8). */
  maxLeverage?: number;
  riskPerTradePct?: number;
  /**
   * When a strategy doesn't emit a stop loss (mean reversion has none),
   * position sizing still needs *some* risk distance to size against.
   * This synthetic distance is used ONLY for sizing math — it never
   * becomes an actual exit condition, so it can't silently turn a
   * signal-exit strategy into a stop-loss strategy.
   */
  syntheticStopDistancePct?: number;
  /** Perp only: sorted ascending by fundingTime. Omit for spot backtests. */
  fundingRates?: FundingPoint[];
};

export type BacktestResult = {
  equityCurve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
  rejectionReasons: string[];
};

type PendingEntry = { side: Side; stopLoss: number | null; takeProfit: number | null; reason: string };
type PendingExit = { reason: string };

type PositionWithSize = Position & { size: number; entryFee: number; entryTime: number };

/** Public entry point: resolves `config.strategyKey` from the registry, then delegates to the testable core below. */
export function runBacktest(candles: Candle[], config: BacktestConfig): BacktestResult {
  return runBacktestWithStrategy(candles, getSingleSymbolStrategy(config.strategyKey), config);
}

/**
 * The actual engine loop, taking a Strategy object directly rather than
 * a registry key. Exported specifically so tests can pass a small
 * hand-written fake strategy with fully predictable decide() output —
 * verifying the engine's own mechanics (fill timing, SL-first,
 * slippage, sizing) shouldn't depend on correctly hand-predicting a
 * real strategy's emergent entry/exit points from raw price data.
 */
export function runBacktestWithStrategy<P, S>(
  candles: Candle[],
  strategy: Strategy<P, S>,
  config: Omit<BacktestConfig, "strategyKey" | "params"> & { params: Partial<P> },
): BacktestResult {
  const params = { ...strategy.defaultParams, ...config.params } as P;
  const state = strategy.prepare(candles, params);
  const warmup = strategy.minWarmupBars(params);

  const maxLeverage = config.maxLeverage ?? 1;
  const riskPerTradePct = config.riskPerTradePct ?? 0.01;
  const syntheticStopPct = config.syntheticStopDistancePct ?? 0.02;

  let equity = config.initialCapital;
  let position: PositionWithSize | null = null;
  let pendingEntry: PendingEntry | null = null;
  let pendingExit: PendingExit | null = null;
  let fundingIdx = 0;

  const trades: Trade[] = [];
  const equityCurve: EquityPoint[] = [];

  for (let i = warmup; i < candles.length; i++) {
    const candle = candles[i]!;

    // 1) Fill a signal-exit queued from the previous bar, at this bar's open.
    if (pendingExit && position) {
      const exitPriceRaw = candle.open;
      const exitPrice = applySlippage(exitPriceRaw, position.side === "long" ? "sell" : "buy", config.slippageBps);
      closeTrade(position, exitPrice, candle.closeTime, i, pendingExit.reason, config.feeBps, trades, (delta) => (equity += delta));
      position = null;
      pendingExit = null;
    }

    // 2) Fill a signal-entry queued from the previous bar, at this bar's open.
    if (pendingEntry && !position) {
      const rawFill = candle.open;
      const fillPrice = applySlippage(rawFill, pendingEntry.side === "long" ? "buy" : "sell", config.slippageBps);
      const sizingStop =
        pendingEntry.stopLoss ??
        (pendingEntry.side === "long" ? fillPrice * (1 - syntheticStopPct) : fillPrice * (1 + syntheticStopPct));
      let size = positionSize(
        { method: config.sizingMethod, equity, entryPrice: fillPrice, stopLossPrice: sizingStop },
        riskPerTradePct,
      );
      const notionalCap = equity * maxLeverage;
      const maxSize = notionalCap / fillPrice;
      if (size > maxSize) size = maxSize;
      if (size > 0) {
        const entryFee = feeAmount(size * fillPrice, config.feeBps);
        equity -= entryFee;
        position = {
          side: pendingEntry.side,
          entryIndex: i,
          entryPrice: fillPrice,
          stopLoss: pendingEntry.stopLoss,
          takeProfit: pendingEntry.takeProfit,
          size,
          entryFee,
          entryTime: candle.closeTime,
        };
      }
      pendingEntry = null;
    }

    // 3) Perp funding accrual while in position (spec 9.9). Longs pay
    // positive funding, shorts receive it (and vice versa for negative).
    if (position && config.market === "perp" && config.fundingRates) {
      while (fundingIdx < config.fundingRates.length && config.fundingRates[fundingIdx]!.fundingTime <= candle.closeTime) {
        const f = config.fundingRates[fundingIdx]!;
        if (f.fundingTime > position.entryIndex && f.fundingTime >= candles[position.entryIndex]!.closeTime) {
          const notional = position.size * candle.close;
          const cost = position.side === "long" ? notional * f.rate : -notional * f.rate;
          equity -= cost;
        }
        fundingIdx++;
      }
    }

    // 4) SL/TP check against this bar's range (spec 9.5-9.6, SL-first on overlap).
    if (position) {
      const exitCheck = checkCandleExit(candle, position.side, position.stopLoss, position.takeProfit);
      if (exitCheck.hit !== "none") {
        const exitPrice = applySlippage(exitCheck.price, position.side === "long" ? "sell" : "buy", config.slippageBps);
        closeTrade(position, exitPrice, candle.closeTime, i, exitCheck.hit, config.feeBps, trades, (delta) => (equity += delta));
        position = null;
      }
    }

    // 5) Ask the strategy what to do with a still-open position (trail stop / signal exit).
    if (position) {
      const action = strategy.decide(state, candles, i, params, position);
      if (action.type === "update_stop") {
        position.stopLoss = action.stopLoss;
      } else if (action.type === "exit") {
        pendingExit = { reason: action.reason };
      }
    }

    // 6) If flat, ask the strategy for a new entry (fills next bar, step 2).
    if (!position && !pendingEntry) {
      const action = strategy.decide(state, candles, i, params, null);
      if (action.type === "enter") {
        pendingEntry = { side: action.side, stopLoss: action.stopLoss, takeProfit: action.takeProfit, reason: action.reason };
      }
    }

    // 7) Mark-to-market equity point for the curve (unrealized P&L on any open position).
    const unrealized = position
      ? position.side === "long"
        ? (candle.close - position.entryPrice) * position.size
        : (position.entryPrice - candle.close) * position.size
      : 0;
    equityCurve.push({ t: candle.closeTime, equity: equity + unrealized });
  }

  const barMs = candles.length >= 2 ? candles[1]!.openTime - candles[0]!.openTime : 60_000;
  const metrics = computeMetrics(equityCurve, trades, candles.length - warmup, barMs);
  const rejectionReasons = checkRejection(metrics);

  return { equityCurve, trades, metrics, rejectionReasons };
}

function closeTrade(
  position: PositionWithSize,
  exitPrice: number,
  exitTime: number,
  exitIndex: number,
  exitReason: string,
  feeBps: number,
  trades: Trade[],
  applyEquityDelta: (delta: number) => void,
): void {
  const grossPnl =
    position.side === "long" ? (exitPrice - position.entryPrice) * position.size : (position.entryPrice - exitPrice) * position.size;
  const exitFee = feeAmount(position.size * exitPrice, feeBps);
  const netPnl = grossPnl - exitFee;
  applyEquityDelta(netPnl);

  const equityAtEntry = position.entryPrice * position.size; // notional basis for pct, not total account equity
  trades.push({
    side: position.side,
    entryIndex: position.entryIndex,
    entryTime: position.entryTime,
    entryPrice: position.entryPrice,
    exitIndex,
    exitTime,
    exitPrice,
    size: position.size,
    grossPnl,
    fees: position.entryFee + exitFee,
    netPnl: netPnl - position.entryFee,
    netPnlPct: equityAtEntry > 0 ? (netPnl - position.entryFee) / equityAtEntry : 0,
    exitReason,
    barsHeld: exitIndex - position.entryIndex,
  });
}
