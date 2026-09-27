import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { backtests } from "@/lib/db/schema";
import StatusBadge from "@/components/StatusBadge";
import type { BacktestMetrics } from "@/lib/backtest/metrics";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
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
    })
    .from(backtests)
    .orderBy(desc(backtests.createdAt))
    .limit(50);

  return (
    <div>
      <h2 className="mb-4 text-lg font-medium">Recent backtests</h2>
      {rows.length === 0 && (
        <p className="text-sm text-slate-500">
          No backtests yet. Download some history (<code>POST /api/admin/download-history</code>) then run one
          (<code>POST /api/admin/run-backtest</code>).
        </p>
      )}
      <div className="space-y-2">
        {rows.map((r) => {
          const m = r.metrics as BacktestMetrics | null;
          const displayStatus = r.status === "DONE" ? ((r.rejectionReasons as string[] | null)?.length ? "REJECTED" : "PASS") : r.status;
          return (
            <a
              key={r.id}
              href={`/backtests/${r.id}`}
              className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/40 px-4 py-3 hover:border-slate-700"
            >
              <div>
                <div className="font-mono text-sm">
                  {r.strategyKey} · {r.symbol} · {r.market} · {r.timeframe}
                </div>
                <div className="text-xs text-slate-500">{new Date(r.createdAt).toISOString()}</div>
              </div>
              <div className="flex items-center gap-4">
                {m && (
                  <div className="text-right text-xs text-slate-400">
                    <div>Sharpe {m.sharpe.toFixed(2)}</div>
                    <div>Return {(m.totalReturnPct * 100).toFixed(1)}%</div>
                  </div>
                )}
                <StatusBadge status={displayStatus} />
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
