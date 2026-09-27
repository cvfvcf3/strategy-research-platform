export type Market = "spot" | "perp";
export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w";
export type Source = "okx" | "binance" | "bybit";

export type Candle = {
  openTime: number; // ms epoch
  closeTime: number; // ms epoch
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type FundingPoint = { fundingTime: number; rate: number };
export type OpenInterestPoint = { ts: number; oi: number; oiCcy: number | null };

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
  "1w": 7 * 24 * 60 * 60_000,
};

// Cache TTLs per spec section 7.2
export const CACHE_TTL_MS: Record<Timeframe, number> = {
  "1m": 30_000,
  "5m": 60_000,
  "15m": 5 * 60_000,
  "1h": 15 * 60_000,
  "4h": 60 * 60_000,
  "1d": 6 * 60 * 60_000,
  "1w": 12 * 60 * 60_000,
};
