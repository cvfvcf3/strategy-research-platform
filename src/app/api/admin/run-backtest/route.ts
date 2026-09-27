import { z } from "zod";
import { eq } from "drizzle-orm";
import { checkAdminSecret } from "@/lib/utils/auth";
import { db } from "@/lib/db/client";
import { backtests } from "@/lib/db/schema";
import { getClosedCandlesFromDb } from "@/lib/data/closed-candles";
import { isSingleSymbolStrategy } from "@/lib/strategies/registry";
import { runBacktest } from "@/lib/backtest/engine";
import { runPairsBacktest } from "@/lib/backtest/pairs-engine";
import { checkRejection } from "@/lib/backtest/metrics";
import { classifyTrendRegime, classifyVolRegime, breakdownByRegime } from "@/lib/validation/regime";
import { log } from "@/lib/utils/logger";
import type { Market, Timeframe } from "@/lib/data/types";
import type { PairsParams } from "@/lib/strategies/pairs-trading";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  strategyKey: z.string().min(1),
  symbol: z.string().min(1),
  symbolB: z.string().min(1).optional(), // required for pairs_trading
  market: z.enum(["spot", "perp"]),
  timeframe: z.enum(["1m", "5m", "15m", "1h", "4h", "1d", "1w"]),
  startTime: z.number(),
  endTime: z.number(),
  params: z.record(z.string(), z.unknown()).default({}),
  initialCapital: z.number().positive().default(10_000),
  sizingMethod: z.enum(["fixed_fractional", "half_kelly", "vol_adjusted"]).default("fixed_fractional"),
  feeBps: z.number().min(0).default(5), // 0.05%
  slippageBps: z.number().min(0).default(5), // 0.05%
});

export async function POST(request: Request) {
  const auth = checkAdminSecret(request);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid body", details: parsed.error.flatten() }, { status: 400 });
  const cfg = parsed.data;

  const [row] = await db
    .insert(backtests)
    .values({
      strategyKey: cfg.strategyKey,
      symbol: cfg.symbol,
      market: cfg.market,
      timeframe: cfg.timeframe,
      startTime: cfg.startTime,
      endTime: cfg.endTime,
      params: cfg.params,
      initialCapital: cfg.initialCapital,
      sizingMethod: cfg.sizingMethod,
      feeBps: cfg.feeBps,
      slippageBps: cfg.slippageBps,
      status: "RUNNING",
    })
    .returning();

  try {
    if (cfg.strategyKey === "pairs_trading") {
      if (!cfg.symbolB) throw new Error("symbolB is required for pairs_trading");
      const candlesA = await getClosedCandlesFromDb(cfg.symbol, cfg.market as Market, cfg.timeframe as Timeframe, cfg.startTime, cfg.endTime);
      const candlesB = await getClosedCandlesFromDb(cfg.symbolB, cfg.market as Market, cfg.timeframe as Timeframe, cfg.startTime, cfg.endTime);
      if (candlesA.length === 0 || candlesB.length === 0) {
        throw new Error(`no candle data for ${cfg.symbol} and/or ${cfg.symbolB} in this range — run /api/admin/download-history first`);
      }
      const result = runPairsBacktest(candlesA, candlesB, {
        params: cfg.params as Partial<PairsParams>,
        initialCapital: cfg.initialCapital,
        feeBps: cfg.feeBps,
        slippageBps: cfg.slippageBps,
      });
      const rejectionReasons = checkRejection(result.metrics);
      await db
        .update(backtests)
        .set({
          status: "DONE",
          metrics: result.metrics,
          equityCurve: result.equityCurve,
          trades: result.trades,
          rejectionReasons,
          completedAt: new Date(),
        })
        .where(eq(backtests.id, row!.id));
      log.info("backtest_complete", { id: row!.id, strategyKey: cfg.strategyKey, tradeCount: result.trades.length });
      return Response.json({ id: row!.id, metrics: result.metrics, rejectionReasons });
    }

    if (!isSingleSymbolStrategy(cfg.strategyKey)) {
      throw new Error(`unknown strategy: ${cfg.strategyKey}`);
    }

    const candles = await getClosedCandlesFromDb(cfg.symbol, cfg.market as Market, cfg.timeframe as Timeframe, cfg.startTime, cfg.endTime);
    if (candles.length === 0) {
      throw new Error(`no candle data for ${cfg.symbol} in this range — run /api/admin/download-history first`);
    }

    const result = runBacktest(candles, {
      strategyKey: cfg.strategyKey,
      params: cfg.params,
      initialCapital: cfg.initialCapital,
      sizingMethod: cfg.sizingMethod,
      feeBps: cfg.feeBps,
      slippageBps: cfg.slippageBps,
      market: cfg.market as Market,
    });

    const barMs = candles.length >= 2 ? candles[1]!.openTime - candles[0]!.openTime : 60_000;
    const trendRegimes = classifyTrendRegime(candles);
    const volRegimes = classifyVolRegime(candles);
    const regimeBreakdown = breakdownByRegime(candles, result.trades, trendRegimes, volRegimes, barMs);

    await db
      .update(backtests)
      .set({
        status: "DONE",
        metrics: result.metrics,
        equityCurve: result.equityCurve,
        trades: result.trades,
        rejectionReasons: result.rejectionReasons,
        regimeBreakdown,
        completedAt: new Date(),
      })
      .where(eq(backtests.id, row!.id));

    log.info("backtest_complete", { id: row!.id, strategyKey: cfg.strategyKey, tradeCount: result.trades.length, rejected: result.rejectionReasons.length > 0 });
    return Response.json({ id: row!.id, metrics: result.metrics, rejectionReasons: result.rejectionReasons, regimeBreakdown });
  } catch (err) {
    await db
      .update(backtests)
      .set({ status: "FAILED", errorMessage: String(err), completedAt: new Date() })
      .where(eq(backtests.id, row!.id));
    log.error("backtest_failed", { id: row!.id, error: String(err) });
    return Response.json({ error: String(err) }, { status: 502 });
  }
}
