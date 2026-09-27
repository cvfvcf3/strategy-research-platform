import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { paperEquity, paperTrades } from "../db/schema";
import type { Market, Timeframe } from "../data/types";

export async function getPaperTrades(strategyKey: string, symbol: string, market: Market, timeframe: Timeframe) {
  return db
    .select()
    .from(paperTrades)
    .where(
      and(
        eq(paperTrades.strategyKey, strategyKey),
        eq(paperTrades.symbol, symbol),
        eq(paperTrades.market, market),
        eq(paperTrades.timeframe, timeframe),
      ),
    )
    .orderBy(asc(paperTrades.entryTime));
}

export async function getPaperEquityCurve(strategyKey: string) {
  return db.select().from(paperEquity).where(eq(paperEquity.strategyKey, strategyKey)).orderBy(asc(paperEquity.ts));
}
