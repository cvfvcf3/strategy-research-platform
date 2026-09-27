import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  timestamp,
  boolean,
  jsonb,
  bigint,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Read-only research platform schema. Nothing here stores exchange API
 * keys, order IDs, or anything that would let this app touch a real
 * trading account — see PRODUCTION_CHECKLIST.md for the security audit.
 */

// ---------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------

export const symbols = pgTable("symbols", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(), // "BTC/USDT"
  market: text("market").notNull(), // "spot" | "perp"
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("symbols_symbol_market_uniq").on(t.symbol, t.market),
}));

// ---------------------------------------------------------------------
// Market data (only CLOSED candles are ever written here — see
// src/lib/data/closed-candles.ts, the single writer for this table)
// ---------------------------------------------------------------------

export const candles = pgTable("candles", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  market: text("market").notNull(), // "spot" | "perp"
  timeframe: text("timeframe").notNull(), // "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w"
  openTime: bigint("open_time", { mode: "number" }).notNull(), // ms epoch, candle open
  closeTime: bigint("close_time", { mode: "number" }).notNull(), // ms epoch, candle close
  open: doublePrecision("open").notNull(),
  high: doublePrecision("high").notNull(),
  low: doublePrecision("low").notNull(),
  close: doublePrecision("close").notNull(),
  volume: doublePrecision("volume").notNull(),
  source: text("source").notNull(), // "okx" | "binance" | "bybit"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("candles_symbol_tf_open_uniq").on(t.symbol, t.market, t.timeframe, t.openTime),
  bySymbolTf: index("candles_symbol_tf_idx").on(t.symbol, t.market, t.timeframe, t.openTime),
}));

export const fundingRates = pgTable("funding_rates", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  fundingTime: bigint("funding_time", { mode: "number" }).notNull(),
  rate: doublePrecision("rate").notNull(),
  source: text("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("funding_symbol_time_uniq").on(t.symbol, t.fundingTime),
}));

export const openInterest = pgTable("open_interest", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  ts: bigint("ts", { mode: "number" }).notNull(),
  oi: doublePrecision("oi").notNull(),
  oiCcy: doublePrecision("oi_ccy"),
  source: text("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("oi_symbol_ts_uniq").on(t.symbol, t.ts),
}));

// ---------------------------------------------------------------------
// Strategy research
// ---------------------------------------------------------------------

export const strategies = pgTable("strategies", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // "donchian_breakout" | "mean_reversion" | "pairs_trading"
  name: text("name").notNull(),
  description: text("description").notNull(),
  paramsSchema: jsonb("params_schema").notNull(), // documents accepted params, for the UI form
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const backtests = pgTable("backtests", {
  id: serial("id").primaryKey(),
  strategyKey: text("strategy_key").notNull(),
  symbol: text("symbol").notNull(),
  market: text("market").notNull(),
  timeframe: text("timeframe").notNull(),
  startTime: bigint("start_time", { mode: "number" }).notNull(),
  endTime: bigint("end_time", { mode: "number" }).notNull(),
  params: jsonb("params").notNull(),
  initialCapital: doublePrecision("initial_capital").notNull(),
  sizingMethod: text("sizing_method").notNull(), // "fixed_fractional" | "half_kelly" | "vol_adjusted"
  feeBps: doublePrecision("fee_bps").notNull(),
  slippageBps: doublePrecision("slippage_bps").notNull(),
  status: text("status").notNull().default("PENDING"), // PENDING | RUNNING | DONE | REJECTED | FAILED
  rejectionReasons: jsonb("rejection_reasons"), // string[] | null
  metrics: jsonb("metrics"), // BacktestMetrics | null, filled when DONE
  equityCurve: jsonb("equity_curve"), // {t:number,equity:number}[] | null
  trades: jsonb("trades"), // Trade[] | null
  regimeBreakdown: jsonb("regime_breakdown"), // per-regime metrics | null
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  byStrategy: index("backtests_strategy_idx").on(t.strategyKey, t.createdAt),
  byStatus: index("backtests_status_idx").on(t.status),
}));

export const walkForwardRuns = pgTable("walk_forward_runs", {
  id: serial("id").primaryKey(),
  backtestId: integer("backtest_id").notNull().references(() => backtests.id),
  windows: jsonb("windows").notNull(), // WalkForwardWindow[]
  aggregateOosMetrics: jsonb("aggregate_oos_metrics").notNull(),
  consistencyScore: doublePrecision("consistency_score").notNull(),
  degradationRatio: doublePrecision("degradation_ratio").notNull(),
  passed: boolean("passed").notNull(),
  rejectionReasons: jsonb("rejection_reasons"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byBacktest: index("wf_backtest_idx").on(t.backtestId),
}));

export const monteCarloRuns = pgTable("monte_carlo_runs", {
  id: serial("id").primaryKey(),
  backtestId: integer("backtest_id").notNull().references(() => backtests.id),
  method: text("method").notNull(), // "shuffle" | "bootstrap" | "slippage_noise"
  iterations: integer("iterations").notNull(),
  seed: integer("seed").notNull(), // stored for reproducibility
  percentiles: jsonb("percentiles").notNull(), // {p5,p25,p50,p75,p95}
  probProfit: doublePrecision("prob_profit").notNull(),
  probLargeDrawdown: doublePrecision("prob_large_drawdown").notNull(), // P(maxDD > 20%)
  worstCase: doublePrecision("worst_case").notNull(),
  passed: boolean("passed").notNull(),
  rejectionReasons: jsonb("rejection_reasons"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byBacktest: index("mc_backtest_idx").on(t.backtestId),
}));

// ---------------------------------------------------------------------
// Paper trading (simulated fills on live closed candles — still
// read-only with respect to any real exchange account)
// ---------------------------------------------------------------------

export const paperTrades = pgTable("paper_trades", {
  id: serial("id").primaryKey(),
  strategyKey: text("strategy_key").notNull(),
  symbol: text("symbol").notNull(),
  market: text("market").notNull(),
  timeframe: text("timeframe").notNull(),
  params: jsonb("params").notNull(),
  side: text("side").notNull(), // "long" | "short"
  entryTime: bigint("entry_time", { mode: "number" }).notNull(),
  entryPrice: doublePrecision("entry_price").notNull(),
  exitTime: bigint("exit_time", { mode: "number" }),
  exitPrice: doublePrecision("exit_price"),
  size: doublePrecision("size").notNull(),
  stopLoss: doublePrecision("stop_loss"),
  takeProfit: doublePrecision("take_profit"),
  pnl: doublePrecision("pnl"),
  pnlPct: doublePrecision("pnl_pct"),
  status: text("status").notNull().default("OPEN"), // OPEN | CLOSED
  exitReason: text("exit_reason"), // "signal" | "stop_loss" | "take_profit" | "trailing_stop"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byStrategy: index("paper_trades_strategy_idx").on(t.strategyKey, t.symbol, t.status),
}));

export const paperEquity = pgTable("paper_equity", {
  id: serial("id").primaryKey(),
  strategyKey: text("strategy_key").notNull(),
  ts: bigint("ts", { mode: "number" }).notNull(),
  equity: doublePrecision("equity").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("paper_equity_strategy_ts_uniq").on(t.strategyKey, t.ts),
}));

// ---------------------------------------------------------------------
// Platform plumbing
// ---------------------------------------------------------------------

export const appConfig = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// A minimal Postgres-backed job queue (spec section 3: "no Redis unless
// necessary" — a single-writer research platform doesn't need one).
// Claimed via `UPDATE ... SET status='RUNNING' WHERE id = (SELECT id
// FROM job_queue WHERE status='PENDING' ... FOR UPDATE SKIP LOCKED)`,
// which is safe across multiple instances without an advisory lock.
export const jobQueue = pgTable("job_queue", {
  id: serial("id").primaryKey(),
  jobType: text("job_type").notNull(), // "download_history" | "run_backtest" | "run_walk_forward" | "run_monte_carlo"
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("PENDING"), // PENDING | RUNNING | DONE | FAILED
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  byStatus: index("job_queue_status_idx").on(t.status, t.createdAt),
}));
