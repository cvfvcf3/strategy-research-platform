import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { backtests, monteCarloRuns, walkForwardRuns } from "@/lib/db/schema";
import StatusBadge from "@/components/StatusBadge";
import MetricsGrid from "@/components/MetricsGrid";
import EquityCurveChart from "@/components/EquityCurveChart";
import type { BacktestMetrics } from "@/lib/backtest/metrics";
import type { RegimeBreakdown } from "@/lib/validation/regime";

export const dynamic = "force-dynamic";

export default async function BacktestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const backtestId = Number(id);
  if (!Number.isInteger(backtestId)) notFound();

  const [bt] = await db.select().from(backtests).where(eq(backtests.id, backtestId));
  if (!bt) notFound();

  const [wf] = await db.select().from(walkForwardRuns).where(eq(walkForwardRuns.backtestId, backtestId)).orderBy(desc(walkForwardRuns.createdAt)).limit(1);
  const mc = await db.select().from(monteCarloRuns).where(eq(monteCarloRuns.backtestId, backtestId)).orderBy(desc(monteCarloRuns.createdAt));

  const metrics = bt.metrics as BacktestMetrics | null;
  const equityCurve = (bt.equityCurve as { t: number; equity: number }[] | null) ?? [];
  const regimeBreakdown = bt.regimeBreakdown as RegimeBreakdown | null;
  const rejectionReasons = (bt.rejectionReasons as string[] | null) ?? [];
  const displayStatus = bt.status === "DONE" ? (rejectionReasons.length ? "REJECTED" : "PASS") : bt.status;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">
            {bt.strategyKey} · {bt.symbol} · {bt.market} · {bt.timeframe}
          </h2>
          <div className="text-xs text-slate-500">
            {new Date(bt.startTime).toISOString().slice(0, 10)} → {new Date(bt.endTime).toISOString().slice(0, 10)}
          </div>
        </div>
        <StatusBadge status={displayStatus} />
      </div>

      {bt.status === "FAILED" && <p className="rounded border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-300">{bt.errorMessage}</p>}

      {rejectionReasons.length > 0 && (
        <div className="mb-4 rounded border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-300">
          <div className="font-medium">Rejected:</div>
          <ul className="ml-4 list-disc">{rejectionReasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}

      {metrics && (
        <>
          <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
            <EquityCurveChart data={equityCurve} />
          </div>
          <div className="mt-4 rounded border border-slate-800 bg-slate-900/40 p-4">
            <MetricsGrid metrics={metrics} oosMetrics={wf?.aggregateOosMetrics as BacktestMetrics | undefined} />
          </div>
        </>
      )}

      {wf && (
        <div className="mt-4 rounded border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">Walk-forward validation ({(wf.windows as unknown[]).length} windows)</h3>
            <StatusBadge status={wf.passed ? "PASS" : "REJECTED"} />
          </div>
          <div className="text-sm text-slate-400">
            Consistency score: {(wf.consistencyScore * 100).toFixed(0)}% · Degradation ratio: {wf.degradationRatio.toFixed(2)}
          </div>
          {(wf.rejectionReasons as string[] | null)?.length ? (
            <ul className="mt-2 ml-4 list-disc text-sm text-rose-300">{(wf.rejectionReasons as string[]).map((r) => <li key={r}>{r}</li>)}</ul>
          ) : null}
        </div>
      )}

      {mc.length > 0 && (
        <div className="mt-4 rounded border border-slate-800 bg-slate-900/40 p-4">
          <h3 className="mb-2 text-sm font-medium">Monte Carlo</h3>
          <p className="mb-2 text-xs text-slate-500">
            Assumes trades are draws from one stable distribution — walk-forward is what tests whether that holds over time.
            &quot;shuffle&quot; only reorders trades, and compounding is order-independent, so its return percentiles are all identical by construction: read its P(DD&gt;20%) instead.
            &quot;slippage_noise&quot; jitters each trade by +/-20% at random, which averages out — it is not a cost-stress test (re-run the backtest with higher feeBps/slippageBps for that).
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-1 font-normal">Method</th>
                <th className="pb-1 font-normal">P5</th>
                <th className="pb-1 font-normal">P25</th>
                <th className="pb-1 font-normal">P50</th>
                <th className="pb-1 font-normal">P75</th>
                <th className="pb-1 font-normal">P95</th>
                <th className="pb-1 font-normal">P(profit)</th>
                <th className="pb-1 font-normal">P(DD&gt;20%)</th>
                <th className="pb-1 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {mc.map((run) => {
                const p = run.percentiles as { p5: number; p25: number; p50: number; p75: number; p95: number };
                return (
                  <tr key={run.id} className="border-t border-slate-800 font-mono">
                    <td className="py-1.5">{run.method}</td>
                    <td className="py-1.5">{(p.p5 * 100).toFixed(1)}%</td>
                    <td className="py-1.5">{(p.p25 * 100).toFixed(1)}%</td>
                    <td className="py-1.5">{(p.p50 * 100).toFixed(1)}%</td>
                    <td className="py-1.5">{(p.p75 * 100).toFixed(1)}%</td>
                    <td className="py-1.5">{(p.p95 * 100).toFixed(1)}%</td>
                    <td className="py-1.5">{(run.probProfit * 100).toFixed(0)}%</td>
                    <td className="py-1.5">{(run.probLargeDrawdown * 100).toFixed(0)}%</td>
                    <td className="py-1.5"><StatusBadge status={run.passed ? "PASS" : "REJECTED"} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {regimeBreakdown && Object.keys(regimeBreakdown).length > 0 && (
        <div className="mt-4 rounded border border-slate-800 bg-slate-900/40 p-4">
          <h3 className="mb-2 text-sm font-medium">Performance by regime</h3>
          <div className="text-xs text-slate-500 mb-2">
            Returns compound each trade's P&L as a fraction of account equity. Per-regime Sharpe is intentionally not shown (a per-trade series can't be annualized like a per-bar one). Regimes with only a handful of trades are noise — read the Trades column first.
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-1 font-normal">Regime</th>
                <th className="pb-1 font-normal">Trades</th>
                <th className="pb-1 font-normal">Return</th>
                <th className="pb-1 font-normal">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(regimeBreakdown).map(([regime, m]) =>
                m ? (
                  <tr key={regime} className="border-t border-slate-800 font-mono">
                    <td className="py-1.5">{regime}</td>
                    <td className="py-1.5">{m.tradeCountInRegime}</td>
                    <td className="py-1.5">{(m.totalReturnPct * 100).toFixed(1)}%</td>
                    <td className="py-1.5">{(m.winRatePct * 100).toFixed(0)}%</td>
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
