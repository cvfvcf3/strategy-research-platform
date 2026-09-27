import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { candles as candlesTable } from "../db/schema";
import { fetchCandlesPage } from "./okx";
import { fetchCandlesPageBinance } from "./binance";
import { StaleDataError } from "../utils/errors";
import { log } from "../utils/logger";
import { CACHE_TTL_MS, TIMEFRAME_MS, type Candle, type Market, type Timeframe } from "./types";

/**
 * This file is the ONLY place allowed to write to the `candles` table,
 * and `getClosedCandles*` below are the ONLY sanctioned ways to read
 * candles into an indicator, backtest, or paper-trading calculation.
 * Every other module must go through here — never query `candlesTable`
 * directly and never call okx.ts/binance.ts candle fetchers directly
 * from strategy or backtest code. This is what makes "only closed
 * candles, never look-ahead" an enforceable invariant instead of a
 * convention someone can forget in one call site.
 */

// ---------------------------------------------------------------------
// Historical (DB-backed) reads — used by the backtest engine
// ---------------------------------------------------------------------

export async function getClosedCandlesFromDb(
  symbol: string,
  market: Market,
  timeframe: Timeframe,
  startTime: number,
  endTime: number,
): Promise<Candle[]> {
  const rows = await db
    .select()
    .from(candlesTable)
    .where(
      and(
        eq(candlesTable.symbol, symbol),
        eq(candlesTable.market, market),
        eq(candlesTable.timeframe, timeframe),
        gte(candlesTable.openTime, startTime),
        lte(candlesTable.openTime, endTime),
      ),
    )
    .orderBy(asc(candlesTable.openTime));

  return rows.map((r) => ({
    openTime: r.openTime,
    closeTime: r.closeTime,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
  }));
}

/** Idempotent bulk upsert — safe to re-run over overlapping ranges. */
export async function upsertCandles(
  symbol: string,
  market: Market,
  timeframe: Timeframe,
  source: "okx" | "binance" | "bybit",
  rows: Candle[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const values = rows.map((c) => ({
    symbol,
    market,
    timeframe,
    openTime: c.openTime,
    closeTime: c.closeTime,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
    source,
  }));
  // Chunk to keep parameter counts sane on very large backfills.
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < values.length; i += CHUNK) {
    const chunk = values.slice(i, i + CHUNK);
    await db
      .insert(candlesTable)
      .values(chunk)
      .onConflictDoNothing({ target: [candlesTable.symbol, candlesTable.market, candlesTable.timeframe, candlesTable.openTime] });
    written += chunk.length;
  }
  return written;
}

export async function getCandleCoverage(
  symbol: string,
  market: Market,
  timeframe: Timeframe,
): Promise<{ earliest: number | null; latest: number | null; count: number }> {
  const [row] = await db
    .select({
      earliest: sql<number | null>`min(${candlesTable.openTime})`,
      latest: sql<number | null>`max(${candlesTable.openTime})`,
      count: sql<number>`count(*)`,
    })
    .from(candlesTable)
    .where(and(eq(candlesTable.symbol, symbol), eq(candlesTable.market, market), eq(candlesTable.timeframe, timeframe)));
  return {
    earliest: row?.earliest ?? null,
    latest: row?.latest ?? null,
    count: Number(row?.count ?? 0),
  };
}

// ---------------------------------------------------------------------
// Live reads — used by paper trading. Fetches OKX directly (with a
// Binance spot fallback), never trusts the currently-forming candle,
// and rejects data that's older than the timeframe's staleness budget.
// ---------------------------------------------------------------------

export async function getLatestClosedCandles(
  symbol: string,
  market: Market,
  timeframe: Timeframe,
  count: number,
): Promise<Candle[]> {
  let raw: Candle[];
  try {
    raw = await fetchCandlesPage(symbol, market, timeframe, { limit: Math.min(count + 2, 100) });
  } catch (err) {
    log.warn("okx_candles_failed_falling_back", { symbol, market, timeframe, error: String(err) });
    if (market !== "spot") throw err; // no perp fallback — see binance.ts
    raw = await fetchCandlesPageBinance(symbol, market, timeframe, { limit: Math.min(count + 2, 1000) });
  }

  const now = Date.now();
  const closed = raw.filter((c) => c.closeTime < now);

  if (closed.length === 0) {
    throw new StaleDataError(symbol, timeframe, Infinity, CACHE_TTL_MS[timeframe]);
  }
  const newest = closed[closed.length - 1]!;
  const age = now - newest.closeTime;
  const maxAge = 2 * TIMEFRAME_MS[timeframe]; // spec 7.6: stale if > 2x timeframe
  if (age > maxAge) {
    throw new StaleDataError(symbol, timeframe, age, maxAge);
  }

  return closed.slice(-count);
}
