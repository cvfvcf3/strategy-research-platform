import { db } from "@/lib/db/client";
import { backtests } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import MetricsGrid from "@/components/MetricsGrid";
import type { BacktestMetrics } from "@/lib/backtest/metrics";

export const dynamic = "force-dynamic";

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  const idList = (ids ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n));

  const rows = idList.length > 0 ? await db.select().from(backtests).where(inArray(backtests.id, idList)) : [];

  return (
    <div>
      <h2 className="mb-2 text-lg font-medium">Compare backtests</h2>
      <p className="mb-4 text-xs text-slate-500">
        Open with <code>/compare?ids=1,2,3</code> — find ids on the overview page.
      </p>
      {rows.length === 0 && <p className="text-sm text-slate-500">No backtests selected.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded border border-slate-800 bg-slate-900/40 p-4">
            <div className="mb-2 font-mono text-sm">
              #{r.id} · {r.strategyKey} · {r.symbol} · {r.timeframe}
            </div>
            {r.metrics ? <MetricsGrid metrics={r.metrics as BacktestMetrics} /> : <p className="text-sm text-slate-500">{r.status}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
