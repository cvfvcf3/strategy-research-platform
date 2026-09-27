# Data Dictionary

## `symbols`
| column | type | notes |
|---|---|---|
| symbol | text | e.g. `"BTC/USDT"` |
| market | text | `"spot"` \| `"perp"` |
| active | boolean | |

## `candles`
The only table indicator/backtest code reads from. Written exclusively by
`src/lib/data/closed-candles.ts`.

| column | type | notes |
|---|---|---|
| symbol, market, timeframe | text | composite key with openTime |
| openTime, closeTime | bigint (ms epoch) | closeTime is always in the past — no forming candle is ever stored |
| open, high, low, close, volume | double precision | |
| source | text | `"okx"` \| `"binance"` \| `"bybit"` (bybit unused, see README limitations) |

Unique on (symbol, market, timeframe, openTime) — re-downloading is a no-op
for candles already stored.

## `funding_rates`, `open_interest`
Perp-only context data. `open_interest` is OKX's periodic rubik-stats series
(not tick-level — see README).

## `strategies`
Static metadata mirroring the code registry (`src/lib/strategies/registry.ts`)
— not the runtime source of truth, the code is.

## `backtests`
One row per backtest run. `equityCurve` and `trades` are the full JSON
arrays (not summarized) so the dashboard/API can reconstruct anything
without re-running the backtest. `regimeBreakdown` is filled only for
single-symbol strategies (see `src/lib/validation/regime.ts`).

`status`: `PENDING` → `RUNNING` → `DONE` | `FAILED`. A `DONE` row with a
non-empty `rejectionReasons` array means it failed the spec's rejection
thresholds (Sharpe, max drawdown, trade count, profit factor, win rate) —
it still ran successfully, it just didn't pass.

## `walk_forward_runs`, `monte_carlo_runs`
One row per validation run, referencing a `backtests.id`. A backtest can
have multiple Monte Carlo rows (one per method: shuffle/bootstrap/
slippage_noise) and (in principle) multiple walk-forward rows if re-run
with different window parameters — the API/dashboard always show the most
recent.

## `paper_trades`, `paper_equity`
Simulated fills only — no real order ever exists upstream of these rows.
`paper_trades.status`: `OPEN` | `CLOSED`. Exactly one `OPEN` row can exist
per (strategyKey, symbol, market, timeframe) at a time, enforced by
`src/lib/paper-trading/simulator.ts`'s own logic (not a DB constraint).

## `app_config`
Key-value store. Keys in active use:
- `runtime_config` — risk/fee/slippage defaults set via
  `POST /api/admin/reload-config`
- `paper_state:{strategyKey}:{symbol}:{market}:{timeframe}` — the paper
  simulator's persisted position/pending-order/last-processed-bar state,
  so it survives restarts

## `job_queue`
Durable record of every download/backtest run (`jobType`, `status`,
`attempts`, `lastError`). Not currently used for actual distributed job
claiming (`run-backtest` etc. execute synchronously within the request) —
it's here as an audit trail and as the foundation for a real worker queue
if this ever needs to scale beyond one Railway instance running things
synchronously.
