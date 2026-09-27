import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Strategy Research Platform",
  description: "Read-only crypto strategy backtesting and paper trading",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0b0f14] text-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <header className="mb-6 border-b border-slate-800 pb-4">
            <h1 className="text-xl font-semibold">
              Strategy Research Platform <span className="text-amber-400">SRP</span>
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              READ-ONLY · NEVER EXECUTES TRADES · Backtest before live · Historical accuracy does not guarantee future performance
            </p>
            <nav className="mt-3 flex gap-4 text-sm text-slate-400">
              <a href="/" className="hover:text-slate-100">Overview</a>
              <a href="/strategies" className="hover:text-slate-100">Strategies</a>
              <a href="/paper-trading" className="hover:text-slate-100">Paper Trading</a>
              <a href="/compare" className="hover:text-slate-100">Compare</a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
