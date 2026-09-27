import { RateLimitError } from "../utils/errors";
import { log } from "../utils/logger";

const BACKOFF_MS = [1_000, 3_000, 9_000, 27_000]; // spec section 7.3

/**
 * GET with retry+backoff. 429 → backoff and retry (up to the schedule
 * above). Transient 5xx → same. Any other non-OK status throws
 * immediately (a 4xx other than 429 means the request itself is wrong;
 * retrying won't help and would just hammer the API).
 */
export async function fetchWithRetry(url: string, source: string, timeoutMs = 10_000): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (res.status === 429) {
        lastErr = new RateLimitError(source);
        if (attempt < BACKOFF_MS.length) {
          log.warn("http_429_retry", { source, url, attempt, waitMs: BACKOFF_MS[attempt] });
          await sleep(BACKOFF_MS[attempt]!);
          continue;
        }
        throw lastErr;
      }
      if (res.status >= 500) {
        lastErr = new Error(`${source} returned HTTP ${res.status}`);
        if (attempt < BACKOFF_MS.length) {
          log.warn("http_5xx_retry", { source, url, status: res.status, attempt, waitMs: BACKOFF_MS[attempt] });
          await sleep(BACKOFF_MS[attempt]!);
          continue;
        }
        throw lastErr;
      }
      if (!res.ok) {
        throw new Error(`${source} returned HTTP ${res.status}: ${await safeText(res)}`);
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      if (attempt >= BACKOFF_MS.length) {
        log.error("http_failed", { source, url, error: String(err) });
        throw err;
      }
      lastErr = err;
      await sleep(BACKOFF_MS[attempt]!);
    }
  }
  throw lastErr ?? new Error(`${source} request failed with no further detail`);
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "<unreadable body>";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
