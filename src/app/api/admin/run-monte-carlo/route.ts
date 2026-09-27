import { z } from "zod";
import { eq } from "drizzle-orm";
import { checkAdminSecret } from "@/lib/utils/auth";
import { db } from "@/lib/db/client";
import { backtests, monteCarloRuns } from "@/lib/db/schema";
import { runMonteCarlo, type MonteCarloMethod } from "@/lib/validation/monte-carlo";
import type { Trade } from "@/lib/backtest/metrics";
import { log } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  backtestId: z.number().int(),
  methods: z.array(z.enum(["shuffle", "bootstrap", "slippage_noise"])).default(["shuffle", "bootstrap", "slippage_noise"]),
  iterations: z.number().int().min(100).max(5000).default(1000),
  seed: z.number().int().default(42),
});

export async function POST(request: Request) {
  const auth = checkAdminSecret(request);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid body", details: parsed.error.flatten() }, { status: 400 });
  const { backtestId, methods, iterations, seed } = parsed.data;

  const [bt] = await db.select().from(backtests).where(eq(backtests.id, backtestId));
  if (!bt) return Response.json({ error: "backtest not found" }, { status: 404 });
  if (!bt.trades || (bt.trades as Trade[]).length === 0) {
    return Response.json({ error: "backtest has no trades to simulate — is it DONE and non-empty?" }, { status: 409 });
  }

  const trades = bt.trades as Trade[];
  const results = [];
  for (const method of methods as MonteCarloMethod[]) {
    const result = runMonteCarlo(trades, method, iterations, seed);
    const [saved] = await db
      .insert(monteCarloRuns)
      .values({
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
      })
      .returning();
    results.push(saved);
  }

  log.info("monte_carlo_complete", { backtestId, methods, iterations });
  return Response.json({ runs: results });
}
