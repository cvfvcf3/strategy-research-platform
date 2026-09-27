import { z } from "zod";
import { eq } from "drizzle-orm";
import { checkAdminSecret } from "@/lib/utils/auth";
import { db } from "@/lib/db/client";
import { jobQueue } from "@/lib/db/schema";
import { fetchCandlesPage } from "@/lib/data/okx";
import { getCandleCoverage, upsertCandles } from "@/lib/data/closed-candles";
import { log } from "@/lib/utils/logger";
import type { Market, Timeframe } from "@/lib/data/types";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  symbol: z.string().min(1),
  market: z.enum(["spot", "perp"]),
  timeframe: z.enum(["1m", "5m", "15m", "1h", "4h", "1d", "1w"]),
  maxPages: z.number().int().min(1).max(200).default(20),
});

/**
 * Downloads one batch (default 20 pages of ~100 candles = ~2000 candles)
 * per call, walking backward from the current earliest stored candle.
 * A single HTTP call can't safely backfill 5+ years without risking a
 * proxy/client timeout, so this is designed to be called repeatedly
 * (the response tells the caller whether to call again) — see
 * src/scripts/download-history.ts for the loop that does that.
 */
export async function POST(request: Request) {
  const auth = checkAdminSecret(request);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid body", details: parsed.error.flatten() }, { status: 400 });
  const { symbol, market, timeframe, maxPages } = parsed.data;

  const [job] = await db
    .insert(jobQueue)
    .values({ jobType: "download_history", payload: parsed.data, status: "RUNNING", startedAt: new Date() })
    .returning();

  try {
    const coverage = await getCandleCoverage(symbol, market as Market, timeframe as Timeframe);
    let cursor = coverage.earliest ?? undefined;
    let pagesDownloaded = 0;
    let candlesWritten = 0;
    let reachedStart = false;

    for (let page = 0; page < maxPages; page++) {
      const rows = await fetchCandlesPage(symbol, market as Market, timeframe as Timeframe, {
        after: cursor,
        limit: 100,
        historical: true,
      });
      if (rows.length === 0) {
        reachedStart = true;
        break;
      }
      candlesWritten += await upsertCandles(symbol, market as Market, timeframe as Timeframe, "okx", rows);
      pagesDownloaded++;
      cursor = rows[0]!.openTime; // oldest candle in this (ascending-sorted) page — go further back next iteration
    }

    await db
      .update(jobQueue)
      .set({ status: "DONE", completedAt: new Date() })
      .where(eq(jobQueue.id, job!.id));

    log.info("download_history_batch_complete", { symbol, market, timeframe, pagesDownloaded, candlesWritten, reachedStart });
    return Response.json({ pagesDownloaded, candlesWritten, reachedFullHistory: reachedStart, done: reachedStart });
  } catch (err) {
    await db
      .update(jobQueue)
      .set({ status: "FAILED", lastError: String(err), completedAt: new Date() })
      .where(eq(jobQueue.id, job!.id));
    log.error("download_history_failed", { symbol, market, timeframe, error: String(err) });
    return Response.json({ error: String(err) }, { status: 502 });
  }
}
