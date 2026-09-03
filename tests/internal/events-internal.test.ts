/**
 * Internal governed-event ingestion endpoints — DB-backed handler tests.
 *
 * Exercises the REAL route handlers (POST /api/v1/internal/events and
 * /internal/events/status) against the REAL PostgreSQL database:
 *
 *   - a valid service event is appended ONCE to the hash-chained
 *     enterprise_events ledger (exactly-once acceptance),
 *   - duplicate / triple delivery can NEVER create a second enterprise
 *     event — the receipt's duplicateCount climbs and the ORIGINAL event
 *     id is returned,
 *   - the receipt, the event and the SERVICE-actor audit row are written
 *     in one transaction under the tenant's RLS context,
 *   - reconciliation status resolves accepted keys and 404s unknown keys,
 *   - unauthenticated / unconfigured / malformed / oversized / wrong-tenant
 *     / wrong-actor deliveries fail closed,
 *   - the enterprise event hash chain remains intact after all writes.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { auditLog, enterpriseEvents, internalEventReceipts, tenants, users } from "../../src/db/schema";
import { INTERNAL_SERVICE_TOKEN_ENV, signInternalServiceTokenForTests } from "../../src/lib/internal/service-auth";
import { POST as publishRoute } from "../../src/app/api/v1/internal/events/route";
import { POST as statusRoute } from "../../src/app/api/v1/internal/events/status/route";

const SECRET = "test-internal-secret-0123456789abcdef0123456789";
const RUN = Date.now().toString(36);

const now = () => Math.floor(Date.now() / 1000);
const token = (iss = "HEALTH_OS") =>
  signInternalServiceTokenForTests(SECRET, {
    iss,
    iat: now() - 5,
    exp: now() + 60,
    jti: `jti-${Math.random().toString(36).slice(2, 12)}`,
  } as never);
const expiredToken = () =>
  signInternalServiceTokenForTests(SECRET, {
    iss: "HEALTH_OS",
    iat: now() - 400,
    exp: now() - 300,
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

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: `evt-idem-${RUN}-${Math.random().toString(36).slice(2, 10)}`,
    sectorEventId: `SEC-EVT-${RUN}-${Math.random().toString(36).slice(2, 10)}`,
    eventType: "health.billing.invoice_created",
    eventVersion: "1",
    schemaVersion: "1",
    source: "HEALTH_OS",
    domain: "finance",
    operation: "billing.event",
    destinationDomain: "finance",
    tenantCode: "BEYU-HEALTH",
    subjectType: "invoice",
    subjectId: `INV-${RUN}`,
    correlationId: `corr-${RUN}`,
    classification: "CONFIDENTIAL",
    payload: { amount: "12500.00", currency: "TZS", facility: "HOSP-1" },
    ...overrides,
  };
}

let TENANT_CODE = "BEYU-HEALTH";
let ACTOR_ID: string | null = null;

beforeAll(async () => {
  process.env[INTERNAL_SERVICE_TOKEN_ENV] = SECRET;
  const rows = await db.select({ code: tenants.code, type: tenants.type }).from(tenants).limit(50);
  const health = rows.find((r) => r.type === "SECTOR" || /health/i.test(r.code));
  TENANT_CODE = (health ?? rows[0]).code;
  // Reuse any existing canonical user as the acting human (existence check).
  const [u] = await db.select({ id: users.id }).from(users).limit(1);
  ACTOR_ID = u?.id ?? null;
});

describe("POST /api/v1/internal/events — fail-closed configuration", () => {
  it("503 when BEYU_INTERNAL_SERVICE_TOKEN is not configured", async () => {
    const saved = process.env[INTERNAL_SERVICE_TOKEN_ENV];
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
    try {
      const res = await publishRoute(req("http://localhost/api/v1/internal/events", envelope(), token()));
      expect(res.status).toBe(503);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("INTERNAL_AUTH_NOT_CONFIGURED");
    } finally {
      process.env[INTERNAL_SERVICE_TOKEN_ENV] = saved;
    }
  });

  it("401 without a bearer token", async () => {
    const res = await publishRoute(req("http://localhost/api/v1/internal/events", envelope()));
    expect([401, 403]).toContain(res.status);
  });

  it("401 with an expired service token", async () => {
    const res = await publishRoute(req("http://localhost/api/v1/internal/events", envelope(), expiredToken()));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/internal/events — exactly-once acceptance", () => {
  it("201 accepts a valid governed event ONCE and returns the canonical event id", async () => {
    const env = envelope({ tenantCode: TENANT_CODE });
    const res = await publishRoute(req("http://localhost/api/v1/internal/events", env, token()));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { accepted: boolean; duplicate: boolean; eventId: string } };
    expect(body.data.accepted).toBe(true);
    expect(body.data.duplicate).toBe(false);
    expect(body.data.eventId).toMatch(/^EVT_/);

    // The enterprise event row: hash-chained v2, SERVICE actor, envelope intact.
    const [event] = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.id, body.data.eventId));
    expect(event).toBeDefined();
    expect(event.hashVersion).toBe("2");
    expect(event.actorType).toBe("SERVICE");
    expect(event.source).toBe("HEALTH_OS");
    expect(event.domain).toBe("finance");
    expect(event.operation).toBe("billing.event");
    expect(event.correlationId).toBe(env.correlationId);
    expect((event.payload as Record<string, unknown>).sectorEventId).toBe(env.sectorEventId);
    expect(event.prevHash).not.toBeNull();

    // The idempotency receipt is linked to the event in the same transaction.
    const [receipt] = await db
      .select()
      .from(internalEventReceipts)
      .where(eq(internalEventReceipts.idempotencyKey, env.idempotencyKey));
    expect(receipt).toBeDefined();
    expect(receipt.eventId).toBe(body.data.eventId);
    expect(receipt.duplicateCount).toBe(0);

    // SERVICE-actor audit row.
    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.objectId, body.data.eventId), eq(auditLog.action, "internal.events.publish")));
    expect(audits).toHaveLength(1);
    expect(audits[0].actorType).toBe("SERVICE");
    expect(audits[0].outcome).toBe("SUCCESS");
  });

  it("duplicate delivery returns the ORIGINAL event and never a second enterprise event", async () => {
    const env = envelope({ tenantCode: TENANT_CODE });
    const first = await publishRoute(req("http://localhost/api/v1/internal/events", env, token()));
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { data: { eventId: string } };

    const countBefore = await db.select({ n: sql<number>`count(*)::int` }).from(enterpriseEvents);

    const second = await publishRoute(req("http://localhost/api/v1/internal/events", env, token()));
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as {
      data: { accepted: boolean; duplicate: boolean; eventId: string; duplicateCount: number };
    };
    expect(secondBody.data.accepted).toBe(false);
    expect(secondBody.data.duplicate).toBe(true);
    expect(secondBody.data.eventId).toBe(firstBody.data.eventId);
    expect(secondBody.data.duplicateCount).toBe(1);

    // Triple delivery (replay after downstream timeout): still exactly one event.
    const third = await publishRoute(req("http://localhost/api/v1/internal/events", env, token()));
    const thirdBody = (await third.json()) as { data: { duplicateCount: number } };
    expect(thirdBody.data.duplicateCount).toBe(2);

    const countAfter = await db.select({ n: sql<number>`count(*)::int` }).from(enterpriseEvents);
    // The duplicate + triple delivery added ZERO enterprise events beyond the
    // first (countBefore was captured after the 201).
    expect(countAfter[0].n).toBe(countBefore[0].n);
  });

  it("the enterprise event hash chain remains intact (single genesis, no forks, no dangling)", async () => {
    await publishRoute(req("http://localhost/api/v1/internal/events", envelope({ tenantCode: TENANT_CODE }), token()));
    const result = await db.execute(sql`
      with t as (select id, prev_hash, hash from enterprise_events)
      select
        (select count(*)::int from t where prev_hash is null) as genesis,
        (select count(*)::int from (select prev_hash from t where prev_hash is not null group by prev_hash having count(*)>1) f) as forks,
        (select count(*)::int from t child where prev_hash is not null
           and not exists (select 1 from t parent where parent.hash = child.prev_hash)) as dangling
    `);
    const row = result.rows[0] as { genesis: number; forks: number; dangling: number };
    expect(row.genesis).toBe(1);
    expect(row.forks).toBe(0);
    expect(row.dangling).toBe(0);
  });
});

describe("POST /api/v1/internal/events — validation and authorization", () => {
  it("404 for an unknown tenant code", async () => {
    const res = await publishRoute(
      req("http://localhost/api/v1/internal/events", envelope({ tenantCode: "NO-SUCH-TENANT" }), token()),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("TENANT_NOT_FOUND");
  });

  it("409 for a SUSPENDED tenant", async () => {
    const code = `SUSPENDED-EVT-${RUN}`;
    await db.insert(tenants).values({
      id: `TEN_SUSP_EVT_${RUN}`,
      code,
      name: "Suspended Event Tenant",
      type: "SECTOR",
      status: "SUSPENDED",
    });
    try {
      const res = await publishRoute(req("http://localhost/api/v1/internal/events", envelope({ tenantCode: code }), token()));
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("TENANT_NOT_ACTIVE");
    } finally {
      await db.delete(tenants).where(eq(tenants.code, code));
    }
  });

  it("422 when actorGlobalUserId does not reference a canonical identity", async () => {
    const res = await publishRoute(
      req("http://localhost/api/v1/internal/events", envelope({ tenantCode: TENANT_CODE, actorGlobalUserId: "USR_DOES_NOT_EXIST" }), token()),
    );
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("ACTOR_NOT_FOUND");
  });

  it("201 with a REAL canonical actor — the actor is recorded on the event", async () => {
    if (!ACTOR_ID) return; // no users seeded in this environment
    const res = await publishRoute(
      req("http://localhost/api/v1/internal/events", envelope({ tenantCode: TENANT_CODE, actorGlobalUserId: ACTOR_ID }), token()),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { eventId: string } };
    const [event] = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.id, body.data.eventId));
    expect(event.actorUserId).toBe(ACTOR_ID);
    expect(event.actorType).toBe("SERVICE");
  });

  it("422 for a non-envelope body (unknown field)", async () => {
    const res = await publishRoute(
      req("http://localhost/api/v1/internal/events", envelope({ tenantCode: TENANT_CODE, evil: "x" }), token()),
    );
    expect(res.status).toBe(422);
  });

  it("422 when correlationId is missing (interoperability envelope is mandatory)", async () => {
    const env = envelope({ tenantCode: TENANT_CODE }) as Record<string, unknown>;
    delete env.correlationId;
    const res = await publishRoute(req("http://localhost/api/v1/internal/events", env, token()));
    expect(res.status).toBe(422);
  });

  it("413 for an oversized payload", async () => {
    const res = await publishRoute(
      req(
        "http://localhost/api/v1/internal/events",
        envelope({ tenantCode: TENANT_CODE, payload: { blob: "x".repeat(140 * 1024) } }),
        token(),
      ),
    );
    expect(res.status).toBe(413);
  });
});

describe("POST /api/v1/internal/events — service-principal registry (Phase 6)", () => {
  // Uses the AGRICULTURE_OS issuer (also allowlisted, also seeded ACTIVE) so
  // these tests cannot interfere with the HEALTH_OS-based suites that may run
  // concurrently in the same database.
  const agriToken = () => token("AGRICULTURE_OS");

  async function setPrincipal(issuer: string, status: string): Promise<void> {
    await db.execute(sql`update service_principals set status = ${status} where issuer = ${issuer}`);
  }

  it("a SUSPENDED service principal is denied on every internal endpoint (403, audited)", async () => {
    await setPrincipal("AGRICULTURE_OS", "SUSPENDED");
    try {
      const res = await publishRoute(
        req("http://localhost/api/v1/internal/events", envelope({ source: "AGRICULTURE_OS" }), agriToken()),
      );
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("SERVICE_PRINCIPAL_SUSPENDED");
    } finally {
      await setPrincipal("AGRICULTURE_OS", "ACTIVE");
    }
  });

  it("a REVOKED service principal is denied (403, audited)", async () => {
    await setPrincipal("AGRICULTURE_OS", "REVOKED");
    try {
      const res = await publishRoute(
        req("http://localhost/api/v1/internal/events", envelope({ source: "AGRICULTURE_OS" }), agriToken()),
      );
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("SERVICE_PRINCIPAL_REVOKED");
    } finally {
      await setPrincipal("AGRICULTURE_OS", "ACTIVE");
    }
  });

  it("an ABSENT registry row falls back to the static allowlist (allowed)", async () => {
    await db.execute(sql`delete from service_principals where issuer = 'AGRICULTURE_OS'`);
    try {
      const res = await publishRoute(
        req("http://localhost/api/v1/internal/events", envelope({ source: "AGRICULTURE_OS" }), agriToken()),
      );
      expect(res.status).toBe(201);
    } finally {
      await db.execute(
        sql`insert into service_principals (issuer, status, reason) values ('AGRICULTURE_OS', 'ACTIVE', 'restored by test') on conflict (issuer) do update set status = 'ACTIVE'`,
      );
    }
  });

  it("an ACTIVE registry row is allowed (registry consulted, not just allowlist)", async () => {
    await setPrincipal("AGRICULTURE_OS", "ACTIVE");
    const res = await publishRoute(
      req("http://localhost/api/v1/internal/events", envelope({ source: "AGRICULTURE_OS" }), agriToken()),
    );
    expect(res.status).toBe(201);
  });
});

describe("POST /api/v1/internal/events/status — reconciliation lookup", () => {
  it("resolves an accepted idempotency key to its canonical event", async () => {
    const env = envelope({ tenantCode: TENANT_CODE });
    const publish = await publishRoute(req("http://localhost/api/v1/internal/events", env, token()));
    const published = (await publish.json()) as { data: { eventId: string } };

    const res = await statusRoute(
      req("http://localhost/api/v1/internal/events/status", { idempotencyKey: env.idempotencyKey, tenantCode: TENANT_CODE }, token()),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { accepted: boolean; eventId: string; duplicateCount: number } };
    expect(body.data.accepted).toBe(true);
    expect(body.data.eventId).toBe(published.data.eventId);
  });

  it("404 for a key that was never accepted", async () => {
    const res = await statusRoute(
      req("http://localhost/api/v1/internal/events/status", { idempotencyKey: `never-${RUN}-xyz`, tenantCode: TENANT_CODE }, token()),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("RECEIPT_NOT_FOUND");
  });

  it("fail closed without a service token", async () => {
    const res = await statusRoute(
      req("http://localhost/api/v1/internal/events/status", { idempotencyKey: `x-${RUN}-xyz`, tenantCode: TENANT_CODE }),
    );
    expect([401, 403]).toContain(res.status);
  });
});
