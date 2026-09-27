const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const configuredLevel = (process.env.LOG_LEVEL as Level) || "info";
const threshold = LEVELS[configuredLevel] ?? LEVELS.info;

/**
 * Structured JSON logging (spec section 21). Every call site is
 * responsible for not passing secrets in `fields` — this module does not
 * attempt to redact, since pattern-based redaction gives false confidence.
 * grep the codebase for `log.` calls during review instead.
 */
function emit(level: Level, event: string, fields: Record<string, unknown> = {}) {
  if (LEVELS[level] < threshold) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  const out = level === "error" || level === "warn" ? console.error : console.log;
  out(JSON.stringify(line));
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => emit("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => emit("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit("error", event, fields),
};
