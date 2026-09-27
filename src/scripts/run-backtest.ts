import "dotenv/config";
import { db } from "../lib/db/client";
import { backtests } from "../lib/db/schema";
import { getClosedCandlesFromDb } from "../lib/data/closed-candles";
import { isSingleSymbolStrategy } from "../lib/strategies/registry";
import { runBacktest } from "../lib/backtest/engine";
import type { Market, Timeframe } from "../lib/data/types";

/** Usage: npm run run-backtest -- donchian_breakout BTC/USDT spot 4h 24 */
async function main() {
  const [strategyKey, symbol, market, timeframe, monthsArg] = process.argv.slice(2);
  if (!strategyKey || !symbol || !market || !timeframe) {
    console.error("Usage: npm run run-backtest -- <strategyKey> <SYMBOL> <spot|perp> <timeframe> [lookbackMonths=24]");
    process.exit(1);
  }
  if (!isSingleSymbolStrategy(strategyKey)) {
    console.error(`Unknown or unsupported (non-single-symbol) strategy: ${strategyKey}`);
    process.exit(1);
  }
  const months = Number(monthsArg ?? 24);
  const endTime = Date.now();
  const startTime = endTime - months * 30.44 * 24 * 60 * 60 * 1000;

  const candles = await getClosedCandlesFromDb(symbol, market as Market, timeframe as Timeframe, startTime, endTime);
  if (candles.length === 0) {
    console.error("No candle data found. Run download-history first.");
    process.exit(1);
  }

  const result = runBacktest(candles, {
    strategyKey,
    params: {},
    initialCapital: 10_000,
    sizingMethod: "fixed_fractional",
    feeBps: 5,
    slippageBps: 5,
    market: market as Market,
  });

  const [row] = await db
    .insert(backtests)
    .values({
      strategyKey,
      symbol,
      market,
      timeframe,
      startTime,
      endTime,
      params: {},
      initialCapital: 10_000,
      sizingMethod: "fixed_fractional",
      feeBps: 5,
      slippageBps: 5,
      status: "DONE",
      metrics: result.metrics,
      equityCurve: result.equityCurve,
      trades: result.trades,
      rejectionReasons: result.rejectionReasons,
      completedAt: new Date(),
    })
    .returning();

  console.log(`Saved as backtest #${row!.id}`);
  console.log(JSON.stringify(result.metrics, null, 2));
  if (result.rejectionReasons.length > 0) {
    console.log("REJECTED:", result.rejectionReasons.join("; "));
  } else {
    console.log("PASSED initial screening.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
