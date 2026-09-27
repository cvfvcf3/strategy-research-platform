import { fetchWithRetry } from "./http";
import { MalformedResponseError } from "../utils/errors";
import type { Candle, FundingPoint, Market, OpenInterestPoint, Timeframe } from "./types";

const BASE = process.env.OKX_API_BASE || "https://www.okx.com";

// OKX only exposes public trading/order endpoints under /api/v5/trade — we
// never import anything from that path. Only market/, public/, and rubik/
// (historical stats) are used below.

const BAR_MAP: Record<Timeframe, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1H",
  "4h": "4H",
  "1d": "1Dutc",
  "1w": "1Wutc",
};

export function toInstId(symbol: string, market: Market): string {
  const pair = symbol.replace("/", "-"); // "BTC/USDT" -> "BTC-USDT"
  return market === "perp" ? `${pair}-SWAP` : pair;
}

type OkxEnvelope<T> = { code: string; msg: string; data: T };

function assertOkxEnvelope<T>(body: unknown, source: string): OkxEnvelope<T> {
  if (
    typeof body !== "object" ||
    body === null ||
    !("code" in body) ||
    !("data" in body) ||
    !Array.isArray((body as { data: unknown }).data)
  ) {
    throw new MalformedResponseError(source, "expected {code, data:[]} envelope");
  }
  const env = body as OkxEnvelope<T>;
  if (env.code !== "0") {
    throw new MalformedResponseError(source, `code=${env.code} msg=${env.msg}`);
  }
  return env;
}

/**
 * One page (<=100) of candles, most-recent-first as OKX returns them.
 * `before`/`after` are OKX's pagination cursors (ms timestamps); pass
 * `after` to page further back in history (OKX: "after" means "records
 * earlier than this ts" for the history-candles endpoint).
 */
export async function fetchCandlesPage(
  symbol: string,
  market: Market,
  timeframe: Timeframe,
  opts: { after?: number; limit?: number; historical?: boolean } = {},
): Promise<Candle[]> {
  const instId = toInstId(symbol, market);
  const bar = BAR_MAP[timeframe];
  const limit = opts.limit ?? 100;
  const path = opts.historical ? "/api/v5/market/history-candles" : "/api/v5/market/candles";
  const params = new URLSearchParams({ instId, bar, limit: String(limit) });
  if (opts.after) params.set("after", String(opts.after));
  const url = `${BASE}${path}?${params.toString()}`;

  const body = await fetchWithRetry(url, "okx");
  const env = assertOkxEnvelope<string[][]>(body, "okx.candles");

  const candles: Candle[] = [];
  for (const row of env.data) {
    // OKX row: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
    if (!Array.isArray(row) || row.length < 6) continue;
    const openTime = Number(row[0]);
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const volume = Number(row[5]);
    if ([openTime, open, high, low, close, volume].some((v) => !Number.isFinite(v))) continue;
    // confirm=="1" means the candle is closed. Reject anything still
    // forming — this is the data layer's half of the no-look-ahead
    // guarantee; getClosedCandles() in closed-candles.ts is the other.
    const confirm = row[8];
    if (confirm !== undefined && confirm !== "1") continue;
    candles.push({
      openTime,
      closeTime: openTime + timeframeMsFor(timeframe) - 1,
      open,
      high,
      low,
      close,
      volume,
    });
  }
  // OKX returns newest-first; normalize to oldest-first.
  return candles.sort((a, b) => a.openTime - b.openTime);
}

export async function fetchFundingHistoryPage(
  symbol: string,
  opts: { after?: number; limit?: number } = {},
): Promise<FundingPoint[]> {
  const instId = toInstId(symbol, "perp");
  const params = new URLSearchParams({ instId, limit: String(opts.limit ?? 100) });
  if (opts.after) params.set("after", String(opts.after));
  const url = `${BASE}/api/v5/public/funding-rate-history?${params.toString()}`;
  const body = await fetchWithRetry(url, "okx");
  const env = assertOkxEnvelope<Record<string, string>[]>(body, "okx.funding");

  const out: FundingPoint[] = [];
  for (const row of env.data) {
    const fundingTime = Number(row.fundingTime);
    const rate = Number(row.realizedRate ?? row.fundingRate);
    if (!Number.isFinite(fundingTime) || !Number.isFinite(rate)) continue;
    out.push({ fundingTime, rate });
  }
  return out.sort((a, b) => a.fundingTime - b.fundingTime);
}

/**
 * Historical open-interest+volume series via OKX's public rubik stats
 * endpoint. This is a coarser signal than live OI (daily/periodic
 * snapshots, not tick-level), which is the best public history OKX
 * exposes — documented here rather than silently treated as high-res.
 */
export async function fetchOpenInterestHistoryPage(
  ccy: string,
  period: "5m" | "1H" | "1D" = "1H",
): Promise<OpenInterestPoint[]> {
  const params = new URLSearchParams({ ccy, period });
  const url = `${BASE}/api/v5/rubik/stat/contracts/open-interest-volume?${params.toString()}`;
  const body = await fetchWithRetry(url, "okx");
  const env = assertOkxEnvelope<string[][]>(body, "okx.open_interest");

  const out: OpenInterestPoint[] = [];
  for (const row of env.data) {
    // row: [ts, oi (contracts), oiCcy (quote-currency value), vol, volCcy]
    if (!Array.isArray(row) || row.length < 3) continue;
    const ts = Number(row[0]);
    const oi = Number(row[1]);
    const oiCcy = Number(row[2]);
    if (!Number.isFinite(ts) || !Number.isFinite(oi)) continue;
    out.push({ ts, oi, oiCcy: Number.isFinite(oiCcy) ? oiCcy : null });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

function timeframeMsFor(tf: Timeframe): number {
  const MS: Record<Timeframe, number> = {
    "1m": 60_000,
    "5m": 5 * 60_000,
    "15m": 15 * 60_000,
    "1h": 60 * 60_000,
    "4h": 4 * 60 * 60_000,
    "1d": 24 * 60 * 60_000,
    "1w": 7 * 24 * 60 * 60_000,
  };
  return MS[tf];
}
