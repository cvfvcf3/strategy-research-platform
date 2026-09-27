# Strategy Guide

Every strategy here follows the same contract (`src/lib/strategies/types.ts`):
`prepare()` precomputes indicator series once over the whole candle array,
`decide()` is called once per closed bar and returns `enter` / `exit` /
`update_stop` / `hold`. The engine (`src/lib/backtest/engine.ts`) is the only
thing that turns a `decide()` result into an actual fill — it always fills
at the *next* bar's open, never the bar the signal fired on.

## Donchian Breakout (`donchian_breakout`)

**Entry**: close breaks above the prior 20-bar high (long) or below the
prior 20-bar low (short) — "prior" excludes the current bar, so a bar can't
trivially break its own high. Filtered to ADX > 25 (a real trend, not
noise).

**No trade**: ADX < 20 (explicit hard floor, independent of the ADX>25
entry filter).

**Exit**: 2x-ATR trailing stop, tightened every bar the position survives
(never loosened).

**Known failure mode**: whipsaws in a market that's choppy but briefly
spikes ADX above 25 without a sustained trend — the regime breakdown on
each backtest result shows whether performance concentrates in `bull`/`bear`
(trending) regimes as expected, or leaks into `range`, which would flag
exactly this.

## Mean Reversion (`mean_reversion`)

**Entry**: long when RSI<30 AND price below the lower Bollinger Band(20,2)
AND ADX<20 (a real range, not weak momentum). Short is the mirror image
(RSI>70, above upper band, ADX<20).

**No trade**: ADX>25 (a trending market will run over a mean-reversion bet).

**Exit**: RSI crosses back through 50, or 10 bars held, whichever first.
No stop-loss — this strategy is signal-exit only. Position *sizing* still
needs a risk distance to size against, so the backtest engine uses a
synthetic 2%-of-price distance for sizing math only; this never becomes an
actual stop condition (see `BacktestConfig.syntheticStopDistancePct`).

**Known failure mode**: a range that breaks into a trend right after entry
— since there's no stop, the position rides the RSI-crosses-50 or 10-bar
exit regardless of how far price has moved against it. The Monte Carlo
`worstCase` and `p5` percentile on any backtest of this strategy are the
place to look for how bad that gets.

## Pairs Trading (`pairs_trading`)

Market-neutral: spread = log(priceA) − beta·log(priceB), beta from a
rolling 30-bar OLS regression of A on B. Enters when the spread's rolling
z-score exceeds ±2 (a bet it reverts to its own recent mean), requires
rolling correlation > 0.7 to open. Exits at |z|<0.5 (reverted) or
force-exits at |z|>3 — that stop is on *divergence*, not a profit target;
it means the historical relationship between the two assets broke down.

Suggested pairs (`src/lib/strategies/registry.ts`): BTC/ETH, SOL/AVAX,
MATIC/LINK — chosen for plausible sector/beta correlation, not verified
in advance to actually clear the 0.7 correlation threshold at any given
time; the strategy itself checks that live before entering.

Run via `POST /api/admin/run-backtest` with both `symbol` (leg A) and
`symbolB` (leg B) — the single-symbol CLI script and walk-forward runner
don't support pairs yet (see README limitations).

## Adding a new strategy

Implement the `Strategy<P, S>` interface in a new file under
`src/lib/strategies/`, register it in `registry.ts`'s
`SINGLE_SYMBOL_STRATEGIES` (or build a parallel path like
`pairs-trading.ts` if it needs more than one symbol), and it's immediately
backtestable through the existing engine, walk-forward, and Monte Carlo
code with no changes needed there.
