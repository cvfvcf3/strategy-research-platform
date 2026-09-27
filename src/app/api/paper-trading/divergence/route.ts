import { z } from "zod";
import { desc, eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { backtests } from "@/lib/db/schema";
import { getPaperEquityCurve, getPaperTrades } from "@/lib/paper-trading/journal";
import { computeMetrics, type Trade as BacktestTrade } from "@/lib/backtest/metrics";
import { computeDivergence } from "@/lib/paper-trading/tracker";
import type { Market, Timeframe } from "@/lib/data/types";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  strategyKey: z.string().min(1),
  symbol: z.string().min(1),
  market: z.enum(["spot", "perp"]),
  timeframe: z.enum(["1m", "5m", "15m", "1h", "4h", "1d", "1w"]),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return Response.json({ error: "invalid query", details: parsed.error.flatten() }, { status: 400 });
  const { strategyKey, symbol, market, timeframe } = parsed.data;

  const [latestBacktest] = await db
    .select()
    .from(backtests)
    .where(
      and(
        eq(backtests.strategyKey, strategyKey),
        eq(backtests.symbol, symbol),
        eq(backtests.market, market),
        eq(backtests.timeframe, timeframe),
        eq(backtests.status, "DONE"),
      ),
    )
    .orderBy(desc(backtests.createdAt))
    .limit(1);

  if (!latestBacktest || !latestBacktest.metrics) {
    return Response.json({ error: "no completed backtest found for this strategy/symbol/market/timeframe to compare against" }, { status: 404 });
  }

  const paperTradesRows = await getPaperTrades(strategyKey, symbol, market as Market, timeframe as Timeframe);
  const equityRows = await getPaperEquityCurve(strategyKey);

  if (equityRows.length < 2) {
    return Response.json({ error: "not enough paper-trading equity history yet to compute a divergence report" }, { status: 409 });
  }

  const barMs = 60_000; // paper equity points are per-processed-bar, not fixed-interval; used only for Sharpe annualization here
  const closedTrades: BacktestTrade[] = paperTradesRows
    .filter((t) => t.status === "CLOSED" && t.exitTime !== null && t.exitPrice !== null && t.pnl !== null)
    .map((t) => ({
      side: t.side as "long" | "short",
      entryIndex: 0,
      entryTime: t.entryTime,
      entryPrice: t.entryPrice,
      exitIndex: 0,
      exitTime: t.exitTime!,
      exitPrice: t.exitPrice!,
      size: t.size,
      grossPnl: t.pnl!,
      fees: 0,
      netPnl: t.pnl!,
      netPnlPct: t.pnlPct ?? 0,
      exitReason: t.exitReason ?? "unknown",
      barsHeld: 0,
    }));

  const paperMetrics = computeMetrics(
    equityRows.map((r) => ({ t: r.ts, equity: r.equity })),
    closedTrades,
    equityRows.length,
    barMs,
  );

  const report = computeDivergence(paperMetrics, latestBacktest.metrics as ReturnType<typeof computeMetrics>);
  return Response.json({ backtestId: latestBacktest.id, paperMetrics, backtestMetrics: latestBacktest.metrics, report });
}
