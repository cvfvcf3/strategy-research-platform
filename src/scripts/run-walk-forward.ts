import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { backtests, walkForwardRuns } from "../lib/db/schema";
import { getClosedCandlesFromDb } from "../lib/data/closed-candles";
import { runWalkForward } from "../lib/validation/walk-forward";
import type { Market, Timeframe } from "../lib/data/types";
import type { BacktestConfig } from "../lib/backtest/engine";

/** Usage: npm run run-walk-forward -- <backtestId> */
async function main() {
  const backtestId = Number(process.argv[2]);
  if (!Number.isInteger(backtestId)) {
    console.error("Usage: npm run run-walk-forward -- <backtestId>");
    process.exit(1);
  }
  const [bt] = await db.select().from(backtests).where(eq(backtests.id, backtestId));
  if (!bt) {
    console.error("Backtest not found");
    process.exit(1);
  }
  if (bt.strategyKey === "pairs_trading") {
    console.error("Walk-forward for pairs_trading is not implemented.");
    process.exit(1);
  }

  const candles = await getClosedCandlesFromDb(bt.symbol, bt.market as Market, bt.timeframe as Timeframe, bt.startTime, bt.endTime);
  const result = runWalkForward(candles, {
    strategyKey: bt.strategyKey as BacktestConfig["strategyKey"],
    params: bt.params as Record<string, unknown>,
    initialCapital: bt.initialCapital,
    sizingMethod: bt.sizingMethod as BacktestConfig["sizingMethod"],
    feeBps: bt.feeBps,
    slippageBps: bt.slippageBps,
    market: bt.market as Market,
  });

  const [row] = await db
    .insert(walkForwardRuns)
    .values({
      backtestId,
      windows: result.windows,
      aggregateOosMetrics: result.aggregateOosMetrics,
      consistencyScore: result.consistencyScore,
      degradationRatio: result.degradationRatio,
      passed: result.passed,
      rejectionReasons: result.rejectionReasons,
    })
    .returning();

  console.log(`Saved walk-forward run #${row!.id}: ${result.windows.length} windows, passed=${result.passed}`);
  console.log(JSON.stringify({ consistencyScore: result.consistencyScore, degradationRatio: result.degradationRatio, rejectionReasons: result.rejectionReasons }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
