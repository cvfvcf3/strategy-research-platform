import { z } from "zod";
import { getCandleCoverage, getClosedCandlesFromDb } from "@/lib/data/closed-candles";
import type { Market, Timeframe } from "@/lib/data/types";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  symbol: z.string().min(1),
  market: z.enum(["spot", "perp"]),
  timeframe: z.enum(["1m", "5m", "15m", "1h", "4h", "1d", "1w"]),
  startTime: z.coerce.number().optional(),
  endTime: z.coerce.number().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return Response.json({ error: "invalid query", details: parsed.error.flatten() }, { status: 400 });
  }
  const { symbol, market, timeframe, startTime, endTime } = parsed.data;

  const coverage = await getCandleCoverage(symbol, market as Market, timeframe as Timeframe);
  const start = startTime ?? coverage.earliest ?? 0;
  const end = endTime ?? coverage.latest ?? Date.now();

  const candles = await getClosedCandlesFromDb(symbol, market as Market, timeframe as Timeframe, start, end);
  return Response.json({ symbol, market, timeframe, coverage, count: candles.length, candles });
}
