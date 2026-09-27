import type { BacktestMetrics } from "@/lib/backtest/metrics";

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

const ROWS: { key: keyof BacktestMetrics; label: string; fmt: (v: number) => string }[] = [
  { key: "totalReturnPct", label: "Total return", fmt: pct },
  { key: "annualizedReturnPct", label: "Annualized return", fmt: pct },
  { key: "sharpe", label: "Sharpe", fmt: (v) => v.toFixed(2) },
  { key: "sortino", label: "Sortino", fmt: (v) => v.toFixed(2) },
  { key: "calmar", label: "Calmar", fmt: (v) => v.toFixed(2) },
  { key: "maxDrawdownPct", label: "Max drawdown", fmt: pct },
  { key: "winRatePct", label: "Win rate", fmt: pct },
  { key: "profitFactor", label: "Profit factor", fmt: (v) => (Number.isFinite(v) ? v.toFixed(2) : "∞") },
  { key: "tradeCount", label: "Trade count", fmt: (v) => String(v) },
  { key: "exposurePct", label: "Exposure", fmt: pct },
];

export default function MetricsGrid({ metrics, oosMetrics }: { metrics: BacktestMetrics; oosMetrics?: BacktestMetrics }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="pb-2 font-normal">Metric</th>
          <th className="pb-2 font-normal">{oosMetrics ? "In-sample" : "Value"}</th>
          {oosMetrics && <th className="pb-2 font-normal">Out-of-sample</th>}
        </tr>
      </thead>
      <tbody>
        {ROWS.map((row) => (
          <tr key={row.key} className="border-t border-slate-800">
            <td className="py-1.5 text-slate-400">{row.label}</td>
            <td className="py-1.5 font-mono">{row.fmt(metrics[row.key] as number)}</td>
            {oosMetrics && <td className="py-1.5 font-mono text-amber-300">{row.fmt(oosMetrics[row.key] as number)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
