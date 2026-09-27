import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { backtests } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 50));
  const rows = await db
    .select({
      id: backtests.id,
      strategyKey: backtests.strategyKey,
      symbol: backtests.symbol,
      market: backtests.market,
      timeframe: backtests.timeframe,
      status: backtests.status,
      metrics: backtests.metrics,
      rejectionReasons: backtests.rejectionReasons,
      createdAt: backtests.createdAt,
      completedAt: backtests.completedAt,
    })
    .from(backtests)
    .orderBy(desc(backtests.createdAt))
    .limit(limit);
  return Response.json({ backtests: rows });
}
