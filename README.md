# Strategy Research Platform (SRP)

A read-only crypto strategy research platform: backtest engine, walk-forward
validation, Monte Carlo simulation, regime analysis, and a paper-trading
simulator, on top of public OKX (primary) / Binance (spot fallback) market
data.

**This application is a read-only research and analytics tool. It does not
execute trades, place orders, or hold exchange API keys, and it never will.**

**Historical signal or strategy accuracy does not guarantee future trading
performance or profitability.** A strategy passing every check in this
platform is evidence of a real historical edge, not a promise about the
future.

## Architecture

```
src/
  app/                 Next.js pages + API routes (see below)
  lib/
    db/                Drizzle schema + client
    data/              OKX/Binance clients, closed-candle enforcement, caching
    indicators/        EMA, SMA, RSI, MACD, ATR, Bollinger, ADX, Donchian,
                       Z-Score, rolling stddev/correlation/beta — all from
                       scratch
    backtest/          Execution engine (single-symbol + pairs), metrics
    validation/        Walk-forward, Monte Carlo, regime analysis
    risk/              Kelly criterion, position sizing, portfolio limits
    strategies/        Donchian Breakout, Mean Reversion, Pairs Trading
    paper-trading/      Live simulator, journal, divergence tracker
    utils/             Logger, errors, admin auth
  scripts/             CLI equivalents of the admin API (download-history,
                       run-backtest, run-walk-forward, run-monte-carlo)
tests/, src/lib/**/__tests__/   Vitest suite
```

## Setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL and ADMIN_SECRET at minimum
npm run db:push        # creates all tables in your Postgres
```

## Development

```bash
npm run dev
```

## The research workflow

1. **Download history** for a symbol/market/timeframe (idempotent — safe
   to re-run, it only ever fills in what's missing):
   ```bash
   npm run download-history -- BTC/USDT spot 4h
   ```
2. **Run a backtest**:
   ```bash
   npm run run-backtest -- donchian_breakout BTC/USDT spot 4h 24
   ```
   This prints the metrics and tells you the backtest's id.
3. **Run walk-forward validation** on that backtest id:
   ```bash
   npm run run-walk-forward -- <backtestId>
   ```
4. **Run Monte Carlo** on the same id:
   ```bash
   npm run run-monte-carlo -- <backtestId> 1000 42
   ```
5. Open the dashboard (`/backtests/<id>`) to see all three together, plus
   the regime breakdown.
6. Only after a strategy clears backtest + walk-forward + Monte Carlo do we
   consider paper trading it — see `advancePaperTrading()` in
   `src/lib/paper-trading/simulator.ts`, driven by a cron hitting a small
   wrapper you add around it (not included as an API route by default,
   since it needs to run on a schedule per strategy/symbol you choose to
   track).

The same steps exist as admin API endpoints (`POST /api/admin/download-history`,
`run-backtest`, `run-walk-forward`, `run-monte-carlo`), each requiring the
`X-Admin-Secret` header, for triggering from the dashboard or an external
scheduler instead of the CLI.

## API endpoints

Public (read-only):
- `GET /api/health`
- `GET /api/symbols`
- `GET /api/candles?symbol=&market=&timeframe=&startTime=&endTime=`
- `GET /api/strategies`, `GET /api/strategies/:id`
- `GET /api/backtests`, `GET /api/backtests/:id`
- `GET /api/walk-forward/:backtestId`
- `GET /api/monte-carlo/:backtestId`
- `GET /api/paper-trading/positions`
- `GET /api/paper-trading/equity?strategyKey=`
- `GET /api/paper-trading/divergence?strategyKey=&symbol=&market=&timeframe=`

Admin (`X-Admin-Secret` header required):
- `POST /api/admin/reload-config`
- `POST /api/admin/download-history`
- `POST /api/admin/run-backtest`
- `POST /api/admin/run-walk-forward`
- `POST /api/admin/run-monte-carlo`

## Anti-repainting / no look-ahead

`src/lib/data/closed-candles.ts` is the only sanctioned way to read candles
into any indicator, backtest, or paper-trading calculation, and the only
writer of the `candles` table. It rejects the currently-forming candle and
anything staler than 2x the timeframe. The backtest engine additionally
fills every entry/exit at the bar *after* the signal (never the same bar's
close), and resolves a same-candle stop-loss+take-profit collision as
stop-loss-first (the conservative assumption — see
`src/lib/backtest/execution.ts`).

## Testing

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

Run all four before trusting a deployment. See `PRODUCTION_CHECKLIST.md`.

## Limitations, stated plainly

- Bybit ("secondary" source in the original spec) is not implemented — only
  OKX (primary) and Binance spot (fallback) are.
- Binance fallback covers spot only; a perp candle fetch that fails on OKX
  has no fallback and will error rather than silently return spot data
  mislabeled as perp.
- OKX's public historical open-interest is a periodic snapshot series
  (`rubik/stat/contracts/open-interest-volume`), not tick-level — treated
  as a coarser signal, not hidden as high-resolution.
- Walk-forward for `pairs_trading` is not implemented (two-leg window
  splitting needs its own runner); single-symbol strategies only.
- Paper trading and the backtest engine are two separate implementations
  of the same execution rules (next-bar-open fills, SL-first, slippage/fees),
  not shared code — this was a pragmatic choice given how differently they're
  driven (one replays an array, the other steps incrementally with
  persisted state). The divergence report exists specifically to catch it
  if they ever quietly drift apart.
- No admin UI for job-queue inspection; `job_queue` rows are written for
  every download/backtest run but there's no dashboard page for them yet —
  query the table directly if you need to debug a stuck run.

## Security

- No exchange API keys anywhere in this codebase, ever.
- No order-placing, cancelling, withdrawal, or transfer code exists — see
  the audit command in `PRODUCTION_CHECKLIST.md`.
- Admin routes require `X-Admin-Secret` (header only, constant-time
  compared) — there is no query-string fallback, since that would end up
  in server access logs.
- Structured JSON logs never include secrets, full request bodies, or PII.

