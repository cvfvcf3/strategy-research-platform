# Project Spec — implementation notes

This documents where the implementation is a direct translation of the
master prompt, and where a pragmatic decision was made and why.

## Direct translations
- 5 core indicator families (trend/momentum/volatility/donchian/zscore),
  all hand-written (no TA-Lib), each with warmup handled via `null` rather
  than 0 or NaN (so "not yet computable" is never confused with "computed
  as zero").
- Execution rules: signal on closed-candle close, fill on next bar's open,
  SL-first on same-candle SL+TP overlap, fees+slippage per side, no
  leverage unless `maxLeverage` configured above 1, no partial fills.
- Rejection thresholds exactly as specified (Sharpe<1.0, maxDD>20%,
  trades<100, profit factor<1.2, win rate<40%) in
  `src/lib/backtest/metrics.ts`.
- Walk-forward: 2yr IS / 6mo OOS / 6mo roll, rejecting on OOS Sharpe<0.5 OR
  degradation ratio<0.5.
- Monte Carlo: shuffle / bootstrap / slippage-noise(±20%), 1000 iterations
  default, rejecting when p5<0 AND P(DD>30%)>30%.
- Portfolio limits: max 3 positions, 6% correlated exposure cap, 3%/7%/15%
  daily/weekly/monthly loss limits — implemented as a pure decision
  function (`checkPortfolioLimits`) rather than baked into the engine, so
  it can be applied by whatever orchestrates multiple concurrent
  strategies (not built into this repo, since the spec's paper-trading
  simulator here tracks one strategy/symbol at a time).

## Pragmatic deviations (and why)

**Job queue is a durability log, not a distributed worker pool.**
`job_queue` rows are written for every admin-triggered run, but
`run-backtest`/`download-history`/etc. execute synchronously within the
HTTP request rather than being claimed by a separate worker process. A
single-operator research platform on one Railway instance doesn't need
`SELECT ... FOR UPDATE SKIP LOCKED` worker claiming yet; the table and
column shape are ready for it if this ever needs to run distributed.

**`download-history`'s admin API endpoint caps itself at N pages per
call** (default 20, ~2000 candles) rather than looping until full history
is downloaded, specifically to avoid a multi-minute HTTP request behind a
proxy that might time it out. The CLI script (`npm run download-history`)
has no such cap — for a real 5-year backfill, use the CLI, not repeated
API calls.

**Paper trading and the backtest engine are separately implemented**, not
sharing the core loop, because paper trading is stepped incrementally
(new closed candles arrive over time, position state persisted between
calls) while the backtest replays a full array in one pass. Keeping the
same *rules* (not the same code) in two places is exactly what the
divergence report is for.

**No Bybit support**, despite being named "secondary" in section 3 — OKX
(primary) and Binance (spot-only fallback) are implemented; Bybit is
explicitly documented as unavailable rather than stubbed out with fake
data.

**No perp fallback via Binance.** Binance's perpetual futures API lives on
a different host with a different response shape from its spot API; a
`market: "perp"` candle fetch that fails on OKX throws rather than
silently substituting spot data mislabeled as perp.

**Open interest history is OKX's rubik/stat periodic-snapshot endpoint**,
not tick-level OI. This is the best public historical OI OKX exposes —
documented as a coarser signal rather than presented as high-resolution.

**Regime analysis is two orthogonal classifications** (trend: bull/bear/
range; volatility: high/low/normal), not five mutually-exclusive buckets,
since a bar can genuinely be both "bull" and "high_vol" simultaneously.
Backtest trades are bucketed into whichever regime was active at their
*entry* bar for the performance breakdown.

**Walk-forward doesn't support `pairs_trading`.** Splitting a two-leg
backtest into rolling IS/OOS windows needs its own runner (both legs' data
sliced consistently) that wasn't built in this pass — the admin API and
CLI both return an explicit "not implemented" error for it rather than
silently running something wrong.

## Read-only guarantee — audit command

```bash
grep -RniE "createOrder|cancelOrder|placeOrder|withdraw|transfer\(|api/v5/trade|apiKey|secretKey|passphrase" src
```

Expected result: no matches except the single explanatory comment in
`src/lib/data/okx.ts` stating that the trade endpoint is deliberately never
used.
