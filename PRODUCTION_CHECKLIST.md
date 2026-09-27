# Production Checklist

## Database
- [ ] PostgreSQL provisioned (separate from any other project's database)
- [ ] `DATABASE_URL` set
- [ ] `npm run db:push` run successfully (or `db:generate`+`db:migrate` for
      tracked migrations)
- [ ] Backups configured on the Postgres provider

## Secrets
- [ ] `ADMIN_SECRET` set to a long random value (`openssl rand -hex 32`)
      and never committed to git
- [ ] `.env` is in `.gitignore` (already is — verify before your first
      commit)
- [ ] No exchange API keys exist anywhere in this repo (there is nowhere
      to put one — this is intentional)

## Testing (run all four locally/CI before deploying)
```bash
npm run typecheck
npm test
npm run lint
npm run build
```
Do not deploy on a "probably fine" basis — actually run these and see them
pass. If any test in `src/lib/backtest/__tests__/engine.test.ts` fails,
that's the no-look-ahead/fees/sizing guarantee itself failing; fix it
before trusting any backtest result from this app.

## API smoke test (after deploying)
- [ ] `GET /api/health` → `{"status":"ok","database":"ok"}`
- [ ] `GET /api/symbols` → 10 symbols, spot+perp
- [ ] `GET /api/strategies` → 3 strategies listed
- [ ] `POST /api/admin/download-history` with `X-Admin-Secret` → downloads
      a batch of candles for one symbol
- [ ] `GET /api/candles?...` for that symbol → non-empty `candles` array
- [ ] `POST /api/admin/run-backtest` → returns metrics + a backtest id
- [ ] `GET /backtests/<id>` in the browser → renders equity curve + metrics

## Security
- [ ] `POST /api/admin/*` without `X-Admin-Secret` header → 401
- [ ] `POST /api/admin/*` with the wrong secret → 401
- [ ] `POST /api/admin/*` with the correct secret → 200/success
- [ ] Re-run the read-only audit grep from `PROJECT_SPEC.md` — no matches
- [ ] No secrets appear in `npm run build` output or server logs

## Operations
- [ ] `job_queue` table has rows after a download/backtest run (durability
      log working)
- [ ] Paper trading state survives a redeploy (check
      `app_config` for a `paper_state:...` row, if you've started paper
      trading anything)
- [ ] `ENABLE_BACKGROUND_JOBS` left at `0` unless you've built and tested a
      background loop for your deployment target (see README — this repo
      does not ship one by default, since paper trading here is driven by
      whatever schedule you set up around `advancePaperTrading()`)

## Documentation
- [ ] README.md reflects reality (limitations section especially — update
      it the moment any of those limitations get fixed)
- [ ] STRATEGY_GUIDE.md, DATA_DICTIONARY.md, PROJECT_SPEC.md present

## Final gate
Do not present a backtest result to yourself or anyone else as "this
strategy works" based on the initial backtest metrics alone. The whole
point of this platform is: backtest → walk-forward → Monte Carlo, and only
a strategy that clears all three, ideally followed by a period of paper
trading with a divergence report that stays under 30%, has any claim to a
real edge — and even then, historical accuracy does not guarantee future
performance.
