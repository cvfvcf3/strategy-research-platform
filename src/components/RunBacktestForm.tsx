"use client";

import { useState } from "react";

const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT", "DOGE/USDT", "AVAX/USDT", "MATIC/USDT", "LINK/USDT"];

export default function RunBacktestForm({ strategyKey, isPairs }: { strategyKey: string; isPairs: boolean }) {
  const [adminSecret, setAdminSecret] = useState("");
  const [symbol, setSymbol] = useState(SYMBOLS[0]!);
  const [symbolB, setSymbolB] = useState(SYMBOLS[1]!);
  const [market, setMarket] = useState<"spot" | "perp">("spot");
  const [timeframe, setTimeframe] = useState("4h");
  const [months, setMonths] = useState(24);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setResult(null);
    try {
      const endTime = Date.now();
      const startTime = endTime - months * 30.44 * 24 * 60 * 60 * 1000;
      const res = await fetch("/api/admin/run-backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
        body: JSON.stringify({
          strategyKey,
          symbol,
          ...(isPairs ? { symbolB } : {}),
          market,
          timeframe,
          startTime,
          endTime,
          params: {},
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult(`Error: ${data.error ?? res.statusText}`);
      } else {
        setResult(`Backtest #${data.id} complete. ${window.location.origin}/backtests/${data.id}`);
      }
    } catch (err) {
      setResult(`Error: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-3 text-sm font-medium">Run a backtest</div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="flex flex-col gap-1">
          Admin secret
          <input type="password" value={adminSecret} onChange={(e) => setAdminSecret(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          {isPairs ? "Symbol A" : "Symbol"}
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1">
            {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        {isPairs && (
          <label className="flex flex-col gap-1">
            Symbol B
            <select value={symbolB} onChange={(e) => setSymbolB(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1">
              {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          Market
          <select value={market} onChange={(e) => setMarket(e.target.value as "spot" | "perp")} className="rounded border border-slate-700 bg-slate-950 px-2 py-1">
            <option value="spot">spot</option>
            <option value="perp">perp</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Timeframe
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1">
            {["1h", "4h", "1d"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Lookback (months)
          <input type="number" value={months} onChange={(e) => setMonths(Number(e.target.value))} className="rounded border border-slate-700 bg-slate-950 px-2 py-1" />
        </label>
      </div>
      <button
        onClick={submit}
        disabled={busy || !adminSecret}
        className="mt-3 rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40"
      >
        {busy ? "Running..." : "Run backtest"}
      </button>
      {result && <div className="mt-2 text-xs text-slate-400">{result}</div>}
      <div className="mt-2 text-xs text-slate-600">
        Needs historical candles downloaded first (<code>POST /api/admin/download-history</code>) for this symbol/market/timeframe.
      </div>
    </div>
  );
}
