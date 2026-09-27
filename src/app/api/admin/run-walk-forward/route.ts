import { z } from "zod";
import { eq } from "drizzle-orm";
import { checkAdminSecret } from "@/lib/utils/auth";
import { db } from "@/lib/db/client";
import { backtests, walkForwardRuns } from "@/lib/db/schema";
import { getClosedCandlesFromDb } from "@/lib/data/closed-candles";
import { runWalkForward } from "@/lib/validation/walk-forward";
import { log } from "@/lib/utils/logger";
import type { Market, Timeframe } from "@/lib/data/types";
import type { SingleSymbolStrategyKey } from "@/lib/strategies/registry";
import type { SizingMethod } from "@/lib/risk/position-size";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  backtestId: z.number().int(),
  isMonths: z.number().int().positive().default(24),
  oosMonths: z.number().int().positive().default(6),
  rollMonths: z.number().int().positive().default(6),
});

export async function POST(request: Request) {
  const auth = checkAdminSecret(request);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid body", details: parsed.error.flatten() }, { status: 400 });
  const { backtestId, isMonths, oosMonths, rollMonths } = parsed.data;

  const [bt] = await db.select().from(backtests).where(eq(backtests.id, backtestId));
  if (!bt) return Response.json({ error: "backtest not found" }, { status: 404 });
  if (bt.strategyKey === "pairs_trading") {
    return Response.json({ error: "walk-forward for pairs_trading is not implemented (two-leg windowing needs its own runner)" }, { status: 501 });
  }

  try {
    const candles = await getClosedCandlesFromDb(bt.symbol, bt.market as Market, bt.timeframe as Timeframe, bt.startTime, bt.endTime);
    if (candles.length === 0) throw new Error("no candle data available for this backtest's symbol/range");

    const result = runWalkForward(
      candles,
      {
        strategyKey: bt.strategyKey as SingleSymbolStrategyKey,
        params: bt.params as Record<string, unknown>,
        initialCapital: bt.initialCapital,
        sizingMethod: bt.sizingMethod as SizingMethod,
        feeBps: bt.feeBps,
        slippageBps: bt.slippageBps,
        market: bt.market as Market,
      },
      isMonths,
      oosMonths,
      rollMonths,
    );

    const [saved] = await db
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

    log.info("walk_forward_complete", { backtestId, windows: result.windows.length, passed: result.passed });
    return Response.json(saved);
  } catch (err) {
    log.error("walk_forward_failed", { backtestId, error: String(err) });
    return Response.json({ error: String(err) }, { status: 502 });
  }
}
