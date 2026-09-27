import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { backtests, monteCarloRuns } from "../lib/db/schema";
import { runMonteCarlo, type MonteCarloMethod } from "../lib/validation/monte-carlo";
import type { Trade } from "../lib/backtest/metrics";

/** Usage: npm run run-monte-carlo -- <backtestId> [iterations=1000] [seed=42] */
async function main() {
  const backtestId = Number(process.argv[2]);
  const iterations = Number(process.argv[3] ?? 1000);
  const seed = Number(process.argv[4] ?? 42);
  if (!Number.isInteger(backtestId)) {
    console.error("Usage: npm run run-monte-carlo -- <backtestId> [iterations] [seed]");
    process.exit(1);
  }
  const [bt] = await db.select().from(backtests).where(eq(backtests.id, backtestId));
  if (!bt || !bt.trades) {
    console.error("Backtest not found or has no trades");
    process.exit(1);
  }

  const trades = bt.trades as Trade[];
  for (const method of ["shuffle", "bootstrap", "slippage_noise"] as MonteCarloMethod[]) {
    const result = runMonteCarlo(trades, method, iterations, seed);
    await db.insert(monteCarloRuns).values({
      backtestId,
      method: result.method,
      iterations: result.iterations,
      seed: result.seed,
      percentiles: result.percentiles,
      probProfit: result.probProfit,
      probLargeDrawdown: result.probLargeDrawdown,
      worstCase: result.worstCase,
      passed: result.passed,
      rejectionReasons: result.rejectionReasons,
    });
    console.log(`[${method}] P5=${(result.percentiles.p5 * 100).toFixed(1)}% P50=${(result.percentiles.p50 * 100).toFixed(1)}% P(profit)=${(result.probProfit * 100).toFixed(0)}% passed=${result.passed}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
