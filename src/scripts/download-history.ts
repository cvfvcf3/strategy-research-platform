import "dotenv/config";
import { fetchCandlesPage } from "../lib/data/okx";
import { getCandleCoverage, upsertCandles } from "../lib/data/closed-candles";
import type { Market, Timeframe } from "../lib/data/types";

/**
 * Usage: npm run download-history -- BTC/USDT spot 4h
 * Loops the same paginated backfill the admin API does, but to
 * completion (no per-request page cap), since a local script isn't
 * bound by an HTTP timeout the way a single API call is.
 */
async function main() {
  const [symbol, market, timeframe] = process.argv.slice(2) as [string, Market, Timeframe];
  if (!symbol || !market || !timeframe) {
    console.error("Usage: npm run download-history -- <SYMBOL> <spot|perp> <timeframe>");
    process.exit(1);
  }

  let coverage = await getCandleCoverage(symbol, market, timeframe);
  console.log(`Starting coverage: ${JSON.stringify(coverage)}`);

  let cursor = coverage.earliest ?? undefined;
  let totalWritten = 0;
  let page = 0;

  while (true) {
    const rows = await fetchCandlesPage(symbol, market, timeframe, { after: cursor, limit: 100, historical: true });
    if (rows.length === 0) {
      console.log("Reached the start of available history.");
      break;
    }
    const written = await upsertCandles(symbol, market, timeframe, "okx", rows);
    totalWritten += written;
    cursor = rows[0]!.openTime;
    page++;
    if (page % 10 === 0) {
      console.log(`Page ${page}: ${totalWritten} candles written so far, now at ${new Date(cursor).toISOString()}`);
    }
    await new Promise((r) => setTimeout(r, 250)); // be polite to the public API even beyond the built-in retry/backoff
  }

  coverage = await getCandleCoverage(symbol, market, timeframe);
  console.log(`Done. Final coverage: ${JSON.stringify(coverage)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
