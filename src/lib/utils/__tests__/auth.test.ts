import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkAdminSecret } from "../auth";

const ORIGINAL = process.env.ADMIN_SECRET;

function reqWith(secret: string | null): Request {
  const headers = new Headers();
  if (secret !== null) headers.set("x-admin-secret", secret);
  return new Request("http://localhost/api/admin/reload-config", { method: "POST", headers });
}

describe("checkAdminSecret", () => {
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = ORIGINAL;
  });

  it("fails when ADMIN_SECRET is not configured on the server at all", () => {
    delete process.env.ADMIN_SECRET;
    const result = checkAdminSecret(reqWith("anything"));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not configured/);
  });

  it("fails when no header is provided", () => {
    process.env.ADMIN_SECRET = "correct-secret";
    const result = checkAdminSecret(reqWith(null));
    expect(result.ok).toBe(false);
  });

  it("fails when the wrong secret is provided", () => {
    process.env.ADMIN_SECRET = "correct-secret";
    const result = checkAdminSecret(reqWith("wrong-secret"));
    expect(result.ok).toBe(false);
  });

  it("fails when a same-length-but-different secret is provided (not just a length check)", () => {
    process.env.ADMIN_SECRET = "correct-secret";
    const result = checkAdminSecret(reqWith("correct-secreX"));
    expect(result.ok).toBe(false);
  });

  it("succeeds when the exact correct secret is provided", () => {
    process.env.ADMIN_SECRET = "correct-secret";
    const result = checkAdminSecret(reqWith("correct-secret"));
    expect(result.ok).toBe(true);
  });

  it("does not accept the secret via a query string (header-only by design)", () => {
    process.env.ADMIN_SECRET = "correct-secret";
    const req = new Request("http://localhost/api/admin/reload-config?secret=correct-secret", { method: "POST" });
    const result = checkAdminSecret(req);
    expect(result.ok).toBe(false);
  });
});
