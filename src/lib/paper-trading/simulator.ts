import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { appConfig, paperEquity, paperTrades } from "../db/schema";
import { getLatestClosedCandles } from "../data/closed-candles";
import type { Market, Timeframe } from "../data/types";
import { positionSize, type SizingMethod } from "../risk/position-size";
import { getSingleSymbolStrategy, type SingleSymbolStrategyKey } from "../strategies/registry";
import type { Side } from "../strategies/types";
import { applySlippage, checkCandleExit, feeAmount } from "../backtest/execution";
import { log } from "../utils/logger";

/**
 * Paper trading intentionally re-implements the backtest engine's
 * execution rules (next-bar-open fills, SL-first same-candle
 * resolution, slippage/fees) rather than importing engine.ts directly,
 * because live trading is stepped incrementally (one new closed candle
 * at a time, state persisted between calls) while the backtest replays
 * a whole array in one pass. Keeping the rule-set identical in two
 * places is exactly what the divergence report (tracker.ts) exists to
 * catch if they ever quietly drift apart.
 */

export type PaperConfig = {
  strategyKey: SingleSymbolStrategyKey;
  symbol: string;
  market: Market;
  timeframe: Timeframe;
  params: Record<string, unknown>;
  initialCapital: number;
  sizingMethod: SizingMethod;
  feeBps: number;
  slippageBps: number;
  warmupWindow?: number;
};

type PendingEntry = { side: Side; stopLoss: number | null; takeProfit: number | null; reason: string };
type PendingExit = { reason: string };
type OpenPosition = {
  side: Side;
  entryTime: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  size: number;
  entryFee: number;
};

type PaperState = {
  lastProcessedOpenTime: number | null;
  equity: number;
  position: OpenPosition | null;
  pendingEntry: PendingEntry | null;
  pendingExit: PendingExit | null;
};

function stateKey(c: PaperConfig): string {
  return `paper_state:${c.strategyKey}:${c.symbol}:${c.market}:${c.timeframe}`;
}

async function loadState(c: PaperConfig): Promise<PaperState> {
  const [row] = await db.select().from(appConfig).where(eq(appConfig.key, stateKey(c)));
  if (row) return row.value as PaperState;
  return { lastProcessedOpenTime: null, equity: c.initialCapital, position: null, pendingEntry: null, pendingExit: null };
}

async function saveState(c: PaperConfig, state: PaperState): Promise<void> {
  await db
    .insert(appConfig)
    .values({ key: stateKey(c), value: state, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: state, updatedAt: new Date() } });
}

export async function advancePaperTrading(config: PaperConfig): Promise<{ processedBars: number; newTrades: number }> {
  const strategy = getSingleSymbolStrategy(config.strategyKey);
  const params = { ...strategy.defaultParams, ...config.params };
  const warmupWindow = config.warmupWindow ?? Math.max(300, strategy.minWarmupBars(params) + 50);

  const candles = await getLatestClosedCandles(config.symbol, config.market, config.timeframe, warmupWindow);
  const state = await loadState(config);

  const startIdx = state.lastProcessedOpenTime === null ? strategy.minWarmupBars(params) : candles.findIndex((c) => c.openTime > state.lastProcessedOpenTime!);

  if (startIdx === -1 || startIdx >= candles.length) {
    return { processedBars: 0, newTrades: 0 }; // nothing new since last check
  }

  const stratState = strategy.prepare(candles, params);
  let { equity, position, pendingEntry, pendingExit } = state;
  let newTrades = 0;

  for (let i = startIdx; i < candles.length; i++) {
    const candle = candles[i]!;

    if (pendingExit && position) {
      const exitPrice = applySlippage(candle.open, position.side === "long" ? "sell" : "buy", config.slippageBps);
      equity += await closeAndRecord(config, position, exitPrice, candle.closeTime, pendingExit.reason, config.feeBps);
      position = null;
      pendingExit = null;
      newTrades++;
    }

    if (pendingEntry && !position) {
      const fillPrice = applySlippage(candle.open, pendingEntry.side === "long" ? "buy" : "sell", config.slippageBps);
      const sizingStop =
        pendingEntry.stopLoss ?? (pendingEntry.side === "long" ? fillPrice * 0.98 : fillPrice * 1.02);
      const size = positionSize({ method: config.sizingMethod, equity, entryPrice: fillPrice, stopLossPrice: sizingStop });
      if (size > 0) {
        const entryFee = feeAmount(size * fillPrice, config.feeBps);
        equity -= entryFee;
        position = {
          side: pendingEntry.side,
          entryTime: candle.closeTime,
          entryPrice: fillPrice,
          stopLoss: pendingEntry.stopLoss,
          takeProfit: pendingEntry.takeProfit,
          size,
          entryFee,
        };
        await db.insert(paperTrades).values({
          strategyKey: config.strategyKey,
          symbol: config.symbol,
          market: config.market,
          timeframe: config.timeframe,
          params,
          side: position.side,
          entryTime: position.entryTime,
          entryPrice: position.entryPrice,
          size: position.size,
          stopLoss: position.stopLoss,
          takeProfit: position.takeProfit,
          status: "OPEN",
        });
      }
      pendingEntry = null;
    }

    if (position) {
      const exitCheck = checkCandleExit(candle, position.side, position.stopLoss, position.takeProfit);
      if (exitCheck.hit !== "none") {
        const exitPrice = applySlippage(exitCheck.price, position.side === "long" ? "sell" : "buy", config.slippageBps);
        equity += await closeAndRecord(config, position, exitPrice, candle.closeTime, exitCheck.hit, config.feeBps);
        position = null;
        newTrades++;
      }
    }

    if (position) {
      const action = strategy.decide(stratState, candles, i, params, {
        side: position.side,
        entryIndex: i, // not used for live trailing-stop math, which only reads candles[i]/state[i]
        entryPrice: position.entryPrice,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit,
      });
      if (action.type === "update_stop") position.stopLoss = action.stopLoss;
      else if (action.type === "exit") pendingExit = { reason: action.reason };
    }

    if (!position && !pendingEntry) {
      const action = strategy.decide(stratState, candles, i, params, null);
      if (action.type === "enter") {
        pendingEntry = { side: action.side, stopLoss: action.stopLoss, takeProfit: action.takeProfit, reason: action.reason };
      }
    }

    await db.insert(paperEquity).values({ strategyKey: config.strategyKey, ts: candle.closeTime, equity }).onConflictDoNothing();
  }

  const newState: PaperState = {
    lastProcessedOpenTime: candles[candles.length - 1]!.openTime,
    equity,
    position,
    pendingEntry,
    pendingExit,
  };
  await saveState(config, newState);
  log.info("paper_trading_advanced", { strategyKey: config.strategyKey, symbol: config.symbol, processedBars: candles.length - startIdx, newTrades });

  return { processedBars: candles.length - startIdx, newTrades };
}

async function closeAndRecord(
  config: PaperConfig,
  position: OpenPosition,
  exitPrice: number,
  exitTime: number,
  exitReason: string,
  feeBps: number,
): Promise<number> {
  const grossPnl =
    position.side === "long" ? (exitPrice - position.entryPrice) * position.size : (position.entryPrice - exitPrice) * position.size;
  const exitFee = feeAmount(position.size * exitPrice, feeBps);
  const netPnl = grossPnl - exitFee - position.entryFee;
  const notional = position.entryPrice * position.size;

  // Precisely scoped: this strategy+symbol+market+timeframe can only have
  // one OPEN row at a time (the simulator never opens a second position
  // while one is open), and entryTime pins it to exactly this trade —
  // a loose WHERE here would silently close a different symbol's trade.
  await db
    .update(paperTrades)
    .set({
      exitTime,
      exitPrice,
      pnl: netPnl,
      pnlPct: notional > 0 ? netPnl / notional : 0,
      status: "CLOSED",
      exitReason,
    })
    .where(
      and(
        eq(paperTrades.strategyKey, config.strategyKey),
        eq(paperTrades.symbol, config.symbol),
        eq(paperTrades.market, config.market),
        eq(paperTrades.timeframe, config.timeframe),
        eq(paperTrades.status, "OPEN"),
        eq(paperTrades.entryTime, position.entryTime),
      ),
    );

  return netPnl;
}
