import { fetchWithRetry } from "./http";
import { MalformedResponseError } from "../utils/errors";
import type { Candle, Market, Timeframe } from "./types";

const BASE = process.env.BINANCE_API_BASE || "https://api.binance.com";

const INTERVAL_MAP: Record<Timeframe, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
  "1w": "1w",
};

export function toBinanceSymbol(symbol: string): string {
  return symbol.replace("/", ""); // "BTC/USDT" -> "BTCUSDT"
}

/**
 * Fallback candle fetch, used only when OKX fails after its own retries.
 * Binance perpetual futures live on a different host (fapi.binance.com)
 * with a different symbol/response shape; that fallback path is not
 * implemented here — a `market: "perp"` request throws rather than
 * silently returning spot data mislabeled as perp.
 */
export async function fetchCandlesPageBinance(
  symbol: string,
  market: Market,
  timeframe: Timeframe,
  opts: { endTime?: number; limit?: number } = {},
): Promise<Candle[]> {
  if (market === "perp") {
    throw new Error("Binance fallback for perpetual futures is not implemented (spot only)");
  }
  const params = new URLSearchParams({
    symbol: toBinanceSymbol(symbol),
    interval: INTERVAL_MAP[timeframe],
    limit: String(opts.limit ?? 1000),
  });
  if (opts.endTime) params.set("endTime", String(opts.endTime));
  const url = `${BASE}/api/v3/klines?${params.toString()}`;

  const body = await fetchWithRetry(url, "binance");
  if (!Array.isArray(body)) {
    throw new MalformedResponseError("binance.klines", "expected an array");
  }

  const now = Date.now();
  const candles: Candle[] = [];
  for (const row of body as unknown[]) {
    if (!Array.isArray(row) || row.length < 7) continue;
    const openTime = Number(row[0]);
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const volume = Number(row[5]);
    const closeTime = Number(row[6]);
    if ([openTime, open, high, low, close, volume, closeTime].some((v) => !Number.isFinite(v))) continue;
    // Binance's last returned kline can be the currently-forming one if
    // no endTime cuts it off cleanly — reject anything not yet closed.
    if (closeTime >= now) continue;
    candles.push({ openTime, closeTime, open, high, low, close, volume });
  }
  return candles.sort((a, b) => a.openTime - b.openTime);
}
