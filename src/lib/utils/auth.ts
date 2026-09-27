import { timingSafeEqual } from "crypto";

/**
 * Constant-time comparison so a wrong-length or wrong-content secret
 * doesn't leak timing information. Header only (X-Admin-Secret) —
 * deliberately no query-string fallback, since query strings end up in
 * server access logs and browser history.
 */
export function checkAdminSecret(request: Request): { ok: boolean; reason?: string } {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) {
    return { ok: false, reason: "ADMIN_SECRET is not configured on the server" };
  }
  const provided = request.headers.get("x-admin-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false, reason: "invalid secret" };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: "invalid secret" };
  return { ok: true };
}
