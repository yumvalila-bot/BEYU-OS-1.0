/**
 * Internal identity federation endpoints — DB-backed handler tests.
 *
 * Exercises the REAL route handlers (POST /api/v1/internal/identity/register
 * and /lookup) against the REAL PostgreSQL database:
 *
 *   - register provisions a canonical party+user idempotently (link-once is
 *     sector-side, but the canonical side must never duplicate),
 *   - issuer/sector mismatch is refused (a sector cannot provision for
 *     another sector),
 *   - unauthenticated / invalid / disabled-config calls fail closed,
 *   - lookup resolves by email and by GlobalUserId, 404 otherwise,
 *   - every call writes a SERVICE-actor audit row.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "../../src/db";
import { auditLog, parties, users, tenants } from "../../src/db/schema";
import { INTERNAL_SERVICE_TOKEN_ENV, signInternalServiceTokenForTests } from "../../src/lib/internal/service-auth";
import { POST as registerRoute } from "../../src/app/api/v1/internal/identity/register/route";
import { POST as lookupRoute } from "../../src/app/api/v1/internal/identity/lookup/route";

const SECRET = "test-internal-secret-0123456789abcdef0123456789";
const RUN = Date.now().toString(36);
const EMAIL = `fed-${RUN}@beyu.test`;
const EMAIL2 = `fed2-${RUN}@beyu.test`;

const now = () => Math.floor(Date.now() / 1000);
const token = (iss = "HEALTH_OS") =>
  signInternalServiceTokenForTests(SECRET, {
    iss,
    iat: now() - 5,
    exp: now() + 60,
    jti: `jti-${Math.random().toString(36).slice(2, 12)}`,
  } as never);

function req(url: string, body: unknown, tok?: string): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(tok ? { authorization: `Bearer ${tok}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function healthTenantCode(): Promise<string> {
  // Prefer a real HEALTH sector tenant; fall back to any ACTIVE tenant.
  const rows = await db.select({ code: tenants.code, type: tenants.type }).from(tenants).limit(50);
  const health = rows.find((r) => r.type === "SECTOR" || /health/i.test(r.code));
  return (health ?? rows[0]).code;
}

let TENANT_CODE = "BEYU-HEALTH";

beforeAll(async () => {
  process.env[INTERNAL_SERVICE_TOKEN_ENV] = SECRET;
  TENANT_CODE = await healthTenantCode();
});

afterAll(async () => {
  delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
  // Clean the canonical identities created by this run (users first — FK).
  for (const email of [EMAIL, EMAIL2]) {
    const rows = await db.select({ id: users.id, partyId: users.partyId }).from(users).where(eq(users.email, email));
    for (const u of rows) {
      await db.delete(users).where(eq(users.id, u.id));
      await db.delete(parties).where(eq(parties.id, u.partyId));
    }
  }
});

describe("POST /api/v1/internal/identity/register", () => {
  it("fail closed: 503 when BEYU_INTERNAL_SERVICE_TOKEN is not configured", async () => {
    const saved = process.env[INTERNAL_SERVICE_TOKEN_ENV];
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
    try {
      const res = await registerRoute(
        req("http://localhost/api/v1/internal/identity/register", { email: EMAIL2, displayName: "X", tenantCode: TENANT_CODE, sector: "HEALTH_OS", sectorUserId: "s-1" }, token()),
      );
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("INTERNAL_AUTH_NOT_CONFIGURED");
    } finally {
      process.env[INTERNAL_SERVICE_TOKEN_ENV] = saved;
    }
  });

  it("401 without a bearer token", async () => {
    const res = await registerRoute(
      req("http://localhost/api/v1/internal/identity/register", { email: EMAIL2, displayName: "X", tenantCode: TENANT_CODE, sector: "HEALTH_OS", sectorUserId: "s-1" }),
    );
    expect(res.status).toBe(401);
  });

  it("401 with a tampered token", async () => {
    const tok = token().split(".");
    tok[1] = Buffer.from(JSON.stringify({ iss: "BEYU_OS", aud: "BEYU_OS", sub: "service:BEYU_OS", iat: now(), exp: now() + 60, jti: "x".repeat(10) })).toString("base64url");
    const res = await registerRoute(
      req("http://localhost/api/v1/internal/identity/register", { email: EMAIL2, displayName: "X", tenantCode: TENANT_CODE, sector: "HEALTH_OS", sectorUserId: "s-1" }, tok.join(".")),
    );
    expect(res.status).toBe(401);
  });

  it("422 for an unknown body field (strict schema)", async () => {
    const res = await registerRoute(
      req("http://localhost/api/v1/internal/identity/register", { email: EMAIL2, displayName: "X", tenantCode: TENANT_CODE, sector: "HEALTH_OS", sectorUserId: "s-1", role: "chancellor" }, token()),
    );
    expect(res.status).toBe(422);
  });

  it("403 when the token issuer provisions for a different sector", async () => {
    const res = await registerRoute(
      req("http://localhost/api/v1/internal/identity/register", { email: EMAIL2, displayName: "X", tenantCode: TENANT_CODE, sector: "FINANCE_OS", sectorUserId: "s-1" }, token("HEALTH_OS")),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("ISSUER_SECTOR_MISMATCH");
  });

  it("404 for a tenant code that does not exist", async () => {
    const res = await registerRoute(
      req("http://localhost/api/v1/internal/identity/register", { email: EMAIL2, displayName: "X", tenantCode: "NO-SUCH-TENANT", sector: "HEALTH_OS", sectorUserId: "s-1" }, token()),
    );
    expect(res.status).toBe(404);
  });

  it("provisions a canonical identity (201) and is idempotent on repeat (200, same GlobalUserId)", async () => {
    const payload = { email: EMAIL, displayName: "Federation Test User", tenantCode: TENANT_CODE, sector: "HEALTH_OS", sectorUserId: `health-${RUN}` };
    const res1 = await registerRoute(req("http://localhost/api/v1/internal/identity/register", payload, token()));
    expect(res1.status).toBe(201);
    const body1 = (await res1.json()) as { data: { globalUserId: string; partyId: string; created: boolean; status: string; email: string } };
    expect(body1.data.created).toBe(true);
    expect(body1.data.globalUserId).toMatch(/^USR_/);
    expect(body1.data.partyId).toMatch(/^PTY_/);
    expect(body1.data.status).toBe("ACTIVE");
    expect(body1.data.email).toBe(EMAIL.toLowerCase());

    // Canonical rows really exist.
    const [row] = await db.select().from(users).where(eq(users.id, body1.data.globalUserId));
    expect(row).toBeDefined();
    expect(row.email).toBe(EMAIL.toLowerCase());
    expect(row.isServiceAccount).toBe(false);
    // The canonical account has no usable interactive credential: hash of a
    // random secret, flagged must-change, never disclosed.
    expect(row.passwordAlgo).toBe("sha256-random");
    expect(row.passwordMustChange).toBe(true);

    // Idempotent repeat: same GlobalUserId, created=false.
    const res2 = await registerRoute(req("http://localhost/api/v1/internal/identity/register", payload, token()));
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { data: { globalUserId: string; created: boolean } };
    expect(body2.data.globalUserId).toBe(body1.data.globalUserId);
    expect(body2.data.created).toBe(false);

    // SERVICE-actor audit rows exist for both calls.
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.objectId, body1.data.globalUserId));
    expect(audits.length).toBeGreaterThanOrEqual(2);
    expect(audits.every((a) => a.actorType === "SERVICE")).toBe(true);
    expect(audits.some((a) => a.action === "internal.identity.register" && a.outcome === "SUCCESS")).toBe(true);
  });
});

describe("POST /api/v1/internal/identity/lookup", () => {
  it("resolves by email", async () => {
    const res = await lookupRoute(
      req("http://localhost/api/v1/internal/identity/lookup", { email: EMAIL }, token()),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { globalUserId: string; status: string; tenantCode: string } };
    expect(body.data.globalUserId).toMatch(/^USR_/);
    expect(body.data.status).toBe("ACTIVE");
    expect(body.data.tenantCode).toBe(TENANT_CODE);
  });

  it("resolves by globalUserId", async () => {
    const [u] = await db.select().from(users).where(eq(users.email, EMAIL.toLowerCase()));
    expect(u).toBeDefined();
    const res = await lookupRoute(
      req("http://localhost/api/v1/internal/identity/lookup", { globalUserId: u.id }, token()),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { globalUserId: string; email: string } };
    expect(body.data.globalUserId).toBe(u.id);
    expect(body.data.email).toBe(EMAIL.toLowerCase());
  });

  it("404 for an unknown identity (by email and by id)", async () => {
    const r1 = await lookupRoute(
      req("http://localhost/api/v1/internal/identity/lookup", { email: `nobody-${RUN}@beyu.test` }, token()),
    );
    expect(r1.status).toBe(404);
    const r2 = await lookupRoute(
      req("http://localhost/api/v1/internal/identity/lookup", { globalUserId: "USR_DOESNOTEXIST12345" }, token()),
    );
    expect(r2.status).toBe(404);
  });

  it("422 when both or neither of email/globalUserId is provided", async () => {
    const r1 = await lookupRoute(
      req("http://localhost/api/v1/internal/identity/lookup", { email: EMAIL, globalUserId: "USR_X" }, token()),
    );
    expect(r1.status).toBe(422);
    const r2 = await lookupRoute(
      req("http://localhost/api/v1/internal/identity/lookup", {}, token()),
    );
    expect(r2.status).toBe(422);
  });

  it("401 without a token", async () => {
    const res = await lookupRoute(
      req("http://localhost/api/v1/internal/identity/lookup", { email: EMAIL }),
    );
    expect(res.status).toBe(401);
  });

  it("propagates canonical revocation: lookup returns SUSPENDED after the canonical status changes", async () => {
    // Register a fresh canonical identity.
    const email = `revoked-${RUN}@beyu.test`;
    const res = await registerRoute(
      req("http://localhost/api/v1/internal/identity/register", { email, displayName: "Revocation Test", tenantCode: TENANT_CODE, sector: "HEALTH_OS", sectorUserId: `health-rev-${RUN}` }, token()),
    );
    expect(res.status).toBe(201);
    const { globalUserId } = ((await res.json()) as { data: { globalUserId: string } }).data;
    // BEYU operator action: suspend the canonical identity.
    await db.update(users).set({ status: "SUSPENDED" }).where(eq(users.id, globalUserId));
    const look = await lookupRoute(
      req("http://localhost/api/v1/internal/identity/lookup", { globalUserId }, token()),
    );
    expect(look.status).toBe(200);
    const body = (await look.json()) as { data: { status: string; partyStatus: string } };
    expect(body.data.status).toBe("SUSPENDED"); // the authoritative revocation signal
    // Cleanup (users first — FK to parties).
    const [u] = await db.select({ partyId: users.partyId }).from(users).where(eq(users.id, globalUserId));
    await db.delete(users).where(eq(users.id, globalUserId));
    await db.delete(parties).where(eq(parties.id, u.partyId));
  });

  it("register refuses a SUSPENDED tenant (TENANT_NOT_ACTIVE)", async () => {
    const code = `SUSPENDED-${RUN}`;
    // Create a dedicated suspended tenant for this test.
    await db.insert(tenants).values({ id: `TEN_SUSPENDED_${RUN}`, code, name: "Suspended Tenant", type: "SECTOR", status: "SUSPENDED" });
    try {
      const res = await registerRoute(
        req("http://localhost/api/v1/internal/identity/register", { email: `susp-${RUN}@beyu.test`, displayName: "X", tenantCode: code, sector: "HEALTH_OS", sectorUserId: "s-1" }, token()),
      );
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("TENANT_NOT_ACTIVE");
    } finally {
      await db.delete(tenants).where(eq(tenants.code, code));
    }
  });

  it("writes a SERVICE-actor audit row for a successful lookup", async () => {
    await lookupRoute(req("http://localhost/api/v1/internal/identity/lookup", { email: EMAIL }, token()));
    const audits = await db
      .select()
      .from(auditLog)
      .where(like(auditLog.action, "internal.identity.lookup"));
    expect(audits.some((a) => a.actorType === "SERVICE" && a.outcome === "SUCCESS")).toBe(true);
  });
});
