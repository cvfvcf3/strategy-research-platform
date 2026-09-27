export class StaleDataError extends Error {
  constructor(symbol: string, timeframe: string, ageMs: number, maxAgeMs: number) {
    super(`Stale data for ${symbol} ${timeframe}: age ${ageMs}ms exceeds max ${maxAgeMs}ms`);
    this.name = "StaleDataError";
  }
}

export class MalformedResponseError extends Error {
  constructor(source: string, detail: string) {
    super(`Malformed response from ${source}: ${detail}`);
    this.name = "MalformedResponseError";
  }
}

export class RateLimitError extends Error {
  constructor(source: string, retryAfterMs?: number) {
    super(`Rate limited by ${source}${retryAfterMs ? ` (retry after ${retryAfterMs}ms)` : ""}`);
    this.name = "RateLimitError";
  }
}

export class InsufficientDataError extends Error {
  constructor(detail: string) {
    super(`Insufficient data: ${detail}`);
    this.name = "InsufficientDataError";
  }
}

export class ValidationError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "ValidationError";
  }
}
