import { db } from "@/lib/db/client";
import { paperTrades } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import StatusBadge from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function PaperTradingPage() {
  const open = await db.select().from(paperTrades).where(eq(paperTrades.status, "OPEN"));

  return (
    <div>
      <h2 className="mb-2 text-lg font-medium">Paper trading — open positions</h2>
      <p className="mb-4 text-xs text-slate-500">
        Simulated fills on live closed candles, same execution rules as the backtest engine. No real order is ever placed.
      </p>
      {open.length === 0 ? (
        <p className="text-sm text-slate-500">No open paper positions right now.</p>
      ) : (
        <div className="space-y-2">
          {open.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/40 px-4 py-3">
              <div className="font-mono text-sm">
                {p.strategyKey} · {p.symbol} · {p.timeframe}
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className={p.side === "long" ? "text-emerald-400" : "text-rose-400"}>{p.side.toUpperCase()}</span>
                <span>entry {p.entryPrice}</span>
                {p.stopLoss && <span className="text-rose-300">SL {p.stopLoss}</span>}
                <StatusBadge status={p.status} />
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-slate-600">
        Divergence report: <code>GET /api/paper-trading/divergence?strategyKey=...&amp;symbol=...&amp;market=...&amp;timeframe=...</code>
      </p>
    </div>
  );
}
