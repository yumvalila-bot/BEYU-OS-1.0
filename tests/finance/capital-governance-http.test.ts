import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { auditLog, capitalRequests, enterpriseEvents, resolutions } from "../../src/db/schema";
import { apiPost, login, serverAvailable } from "../helpers/http";
import { recordAudit } from "../../src/lib/audit";

/**
 * END-TO-END transport tests for the capital governance authorization mutation.
 *
 * Real running server, real PostgreSQL. Proves authentication, the forgery
 * guard, the governed error taxonomy, DB-backed idempotency and — critically —
 * that a successful transition executes nothing.
 */

const available = await serverAvailable();

let cfo = ""; // Daudi — finance:capital.manage
/**
 * The rate limiter is keyed by principal + capability. Rather than weakening a
 * production security control for the tests, the request-heavy cases run as the
 * CEO, who legitimately also holds finance:capital.manage.
 */
let ceo = "";
let auditor = ""; // Peter — capital read only
let sectorOperator = ""; // different tenant scope

const BOARD = "GOV_GROUP_BOARD";
const RUN = Math.random().toString(36).slice(2, 6).toUpperCase();

async function cleanup() {
  await db.execute(sql`delete from capital_requests where id like 'CAP_CH_%'`);
  await db.execute(sql`delete from resolution_votes where resolution_id like 'RES_CH_%'`);
  await db.execute(sql`delete from resolutions where id like 'RES_CH_%'`);
  await db.execute(sql`delete from idempotency_records`);
}

/**
 * An APPROVED resolution carrying real audit-ledger provenance.
 *
 * Provenance is what distinguishes a governed decision from seeded fixture
 * data, and only a GOVERNED decision may authorise a capital transition. The
 * ledger row is written directly here (rather than by driving five HTTP votes)
 * so the transport suite stays within its rate-limit budget while still
 * exercising a genuinely governed resolution.
 */
async function governedResolution(suffix: string, status = "APPROVED") {
  const id = `RES_CH_${RUN}_${suffix}`;
  const now = new Date();
  const terminal = ["APPROVED", "REJECTED", "DEADLOCKED", "DEFERRED"].includes(status);
  await db.insert(resolutions).values({
    id,
    tenantId: "TEN_BEYU_GROUP",
    bodyId: BOARD,
    reference: `GROUP_BOARD-2222-${RUN}${suffix.slice(0, 2)}`,
    title: "HTTP capital governance probe",
    category: "CAPITAL",
    summary: "HTTP capital probe summary long enough to satisfy the contract.",
    rationale: "HTTP capital probe rationale long enough to satisfy the contract.",
    dataBasis: "Probe basis.",
    consequences: "Probe consequences.",
    proposedBy: "GROUP_CFO",
    status: status as never,
    requiredMajority: "SIMPLE",
    classification: "RESTRICTED",
    quorumMet: terminal,
    votesFor: terminal ? 3 : 0,
    votesAgainst: terminal ? 1 : 0,
    decidedByMemberId: terminal ? "GMB_BRD_CEO" : null,
    decisionDate: terminal ? now : null,
    votingOpensAt: new Date(now.getTime() - 3 * 86_400_000),
    votingClosesAt: new Date(now.getTime() - 3600_000),
  } as never);

  if (terminal) {
    // Ledger provenance written through the real audit kernel, so the hash
    // chain stays valid and the row is indistinguishable from one written by
    // the governed decision transaction.
    await recordAudit({
      tenantId: "TEN_BEYU_GROUP",
      actorUserId: "USR_AMANI_BEYU",
      actorType: "HUMAN",
      action: "governance.resolution.decide",
      objectType: "RESOLUTION",
      objectId: id,
      outcome: "SUCCESS",
      reason: "HTTP probe governed decision",
      authority: "governance:resolution.approve",
    });
  }
  return id;
}

async function makeCapitalRequest(suffix: string, resolutionId: string | null, status = "SUBMITTED") {
  const id = `CAP_CH_${RUN}_${suffix}`;
  await db.insert(capitalRequests).values({
    id,
    tenantId: "TEN_BEYU_GROUP",
    legalEntityId: "LEN_BEYU_HEALTH_LTD",
    code: `CAP-CH-${RUN}-${suffix}`,
    title: "HTTP probe capital request",
    requestType: "INVESTMENT",
    amount: "250000.00",
    currency: "USD",
    requestedBy: "GROUP_CFO",
    status,
    resolutionId,
  } as never);
  return id;
}

const authPath = (id: string) => `/api/v1/finance/capital/${id}/governance-authorization`;

beforeAll(async () => {
  if (!available) return;
  await cleanup();
  cfo = await login("cfo@beyu.os");
  ceo = await login("ceo@beyu.os");
  auditor = await login("auditor@beyu.os");
  sectorOperator = await login("health.ops@beyu.os");
}, 240_000);

beforeEach(async () => {
  if (available) await cleanup();
});

afterAll(async () => {
  if (available) await cleanup();
  await pool.end().catch(() => undefined);
});

describe.skipIf(!available)("capital governance authorization over HTTP", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const r = await governedResolution("UNAUTH");
    const cap = await makeCapitalRequest("UNAUTH", r);

    const res = await apiPost(authPath(cap), {});
    expect(res.status).toBe(401);

    const [row] = await db.select().from(capitalRequests).where(eq(capitalRequests.id, cap));
    expect(row.status).toBe("SUBMITTED");
  });

  it("transitions a governed capital request to GOVERNANCE_AUTHORIZED", async () => {
    const r = await governedResolution("OK1");
    const cap = await makeCapitalRequest("OK1", r);

    const res = await apiPost(authPath(cap), {}, { cookie: cfo });
    expect(res.status).toBe(200);

    const data = (res.body as { data: Record<string, unknown> }).data;
    expect(data.status).toBe("GOVERNANCE_AUTHORIZED");
    expect(data.resolutionId).toBe(r);
    expect(data.decision).toBe("APPROVED");
    expect(data.executed).toBe(false);

    // Verified in the database, not just in the response.
    const [row] = await db.select().from(capitalRequests).where(eq(capitalRequests.id, cap));
    expect(row.status).toBe("GOVERNANCE_AUTHORIZED");

    const audits = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.objectId, cap), eq(auditLog.action, "finance.capital.governance_authorize")),
      );
    expect(audits.filter((a) => a.outcome === "SUCCESS").length).toBe(1);

    const events = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, cap));
    expect(events.map((e) => e.type)).toEqual(["CAPITAL_REQUEST_GOVERNANCE_AUTHORIZED"]);
  });

  it("denies a principal without finance:capital.manage with 403", async () => {
    const r = await governedResolution("NOCAP");
    const cap = await makeCapitalRequest("NOCAP", r);

    const res = await apiPost(authPath(cap), {}, { cookie: auditor });
    expect(res.status).toBe(403);

    const [row] = await db.select().from(capitalRequests).where(eq(capitalRequests.id, cap));
    expect(row.status).toBe("SUBMITTED");
  });

  it("gives a cross-tenant caller no existence oracle", async () => {
    const r = await governedResolution("XT");
    const cap = await makeCapitalRequest("XT", r);

    const real = await apiPost(authPath(cap), {}, { cookie: sectorOperator });
    const fake = await apiPost(authPath("CAP_CH_NOT_REAL"), {}, { cookie: sectorOperator });

    expect(real.status).toBe(fake.status);
    expect([403, 404]).toContain(real.status);
    const strip = (b: unknown) => {
      const e = (b as { error?: { code?: string; message?: string } }).error;
      return { code: e?.code, message: e?.message };
    };
    expect(strip(real.body)).toEqual(strip(fake.body));

    const [row] = await db.select().from(capitalRequests).where(eq(capitalRequests.id, cap));
    expect(row.status).toBe("SUBMITTED");
  });

  it("returns 422 GOVERNANCE_NOT_SATISFIED when the resolution is not approved", async () => {
    const r = await governedResolution("VOTED1", "VOTED");
    const cap = await makeCapitalRequest("VOTED1", r);

    const res = await apiPost(authPath(cap), {}, { cookie: cfo });
    expect(res.status).toBe(422);
    expect((res.body as { error?: { code?: string } })?.error?.code).toBe("GOVERNANCE_NOT_SATISFIED");

    const [row] = await db.select().from(capitalRequests).where(eq(capitalRequests.id, cap));
    expect(row.status).toBe("SUBMITTED");
  });

  it("returns 422 GOVERNANCE_NOT_SATISFIED when no resolution is linked", async () => {
    const cap = await makeCapitalRequest("NOLINK", null);
    const res = await apiPost(authPath(cap), {}, { cookie: cfo });
    expect(res.status).toBe(422);
    expect((res.body as { error?: { code?: string } })?.error?.code).toBe("GOVERNANCE_NOT_SATISFIED");
  });

  it("returns 409 ALREADY_DECIDED when already authorized", async () => {
    const r = await governedResolution("TWICE");
    const cap = await makeCapitalRequest("TWICE", r);

    const first = await apiPost(authPath(cap), {}, { cookie: cfo });
    expect(first.status).toBe(200);

    const second = await apiPost(authPath(cap), {}, { cookie: cfo });
    expect(second.status).toBe(409);
    expect((second.body as { error?: { code?: string } })?.error?.code).toBe("ALREADY_DECIDED");

    // Still exactly one event.
    const events = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, cap));
    expect(events.length).toBe(1);
  });

  it("returns 422 INVALID_CAPITAL_STATE for a FUNDED request", async () => {
    const r = await governedResolution("FUNDED");
    const cap = await makeCapitalRequest("FUNDED", r, "FUNDED");

    const res = await apiPost(authPath(cap), {}, { cookie: cfo });
    expect(res.status).toBe(422);
    expect((res.body as { error?: { code?: string } })?.error?.code).toBe("INVALID_CAPITAL_STATE");
  });

  it("returns 404 for a non-existent capital request", async () => {
    const res = await apiPost(authPath("CAP_CH_MISSING"), {}, { cookie: cfo });
    expect(res.status).toBe(404);
  });

  it("rejects forged governance fields with 422", async () => {
    const r = await governedResolution("FORGE", "VOTED"); // NOT approved
    const cap = await makeCapitalRequest("FORGE", r);

    for (const forged of [
      { authorized: true },
      { status: "GOVERNANCE_AUTHORIZED" },
      { governanceAuthorized: true },
      { decision: "APPROVED" },
      { resolutionStatus: "APPROVED" },
      { provenance: "GOVERNED" },
      { executed: true },
    ]) {
      const res = await apiPost(authPath(cap), forged, { cookie: ceo });
      expect(res.status).toBe(422);
      expect((res.body as { error?: { code?: string } })?.error?.code).toBe(
        "SERVER_CONTROLLED_FIELD",
      );
    }

    const [row] = await db.select().from(capitalRequests).where(eq(capitalRequests.id, cap));
    expect(row.status).toBe("SUBMITTED");
  });

  it("rejects an unknown field with 422", async () => {
    const r = await governedResolution("STRICT");
    const cap = await makeCapitalRequest("STRICT", r);
    const res = await apiPost(authPath(cap), { wildcard: true }, { cookie: ceo });
    expect(res.status).toBe(422);
  });

  it("replays an identical request without transitioning twice", async () => {
    const r = await governedResolution("IDEM1");
    const cap = await makeCapitalRequest("IDEM1", r);
    const key = `capgov-replay-${Date.now()}`;

    const first = await apiPost(authPath(cap), {}, { cookie: ceo, idempotencyKey: key });
    const second = await apiPost(authPath(cap), {}, { cookie: ceo, idempotencyKey: key });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers.get("idempotent-replay")).toBe("true");
    expect((second.body as { data: Record<string, unknown> }).data.status).toBe(
      (first.body as { data: Record<string, unknown> }).data.status,
    );

    const events = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, cap));
    expect(events.length).toBe(1);
    const audits = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.objectId, cap), eq(auditLog.action, "finance.capital.governance_authorize")),
      );
    expect(audits.filter((a) => a.outcome === "SUCCESS").length).toBe(1);
  });

  it("rejects the same key with a different payload with 409", async () => {
    const r = await governedResolution("IDEM2");
    const cap = await makeCapitalRequest("IDEM2", r);
    const key = `capgov-mismatch-${Date.now()}`;

    const first = await apiPost(authPath(cap), { note: "First note." }, { cookie: ceo, idempotencyKey: key });
    expect(first.status).toBe(200);

    const second = await apiPost(
      authPath(cap),
      { note: "Different note." },
      { cookie: ceo, idempotencyKey: key },
    );
    expect(second.status).toBe(409);
    expect((second.body as { error?: { code?: string } })?.error?.code).toBe(
      "IDEMPOTENCY_KEY_REUSED",
    );
  });

  it("§17 executes nothing over HTTP: no ledger, treasury or balance effect", async () => {
    const ledgerBefore = await db.execute<{ n: number }>(
      sql`select count(*)::int n from journal_entries`,
    );
    const treasuryBefore = await db.execute<{ total: string }>(
      sql`select coalesce(sum(base_currency_balance),0)::text total from treasury_positions`,
    );

    const r = await governedResolution("NOEXEC");
    const cap = await makeCapitalRequest("NOEXEC", r);
    const res = await apiPost(authPath(cap), {}, { cookie: ceo });
    expect(res.status).toBe(200);

    const ledgerAfter = await db.execute<{ n: number }>(
      sql`select count(*)::int n from journal_entries`,
    );
    const treasuryAfter = await db.execute<{ total: string }>(
      sql`select coalesce(sum(base_currency_balance),0)::text total from treasury_positions`,
    );

    expect(ledgerAfter.rows[0].n).toBe(ledgerBefore.rows[0].n);
    expect(treasuryAfter.rows[0].total).toBe(treasuryBefore.rows[0].total);

    const [row] = await db.select().from(capitalRequests).where(eq(capitalRequests.id, cap));
    expect(row.status).toBe("GOVERNANCE_AUTHORIZED");
    expect(row.status).not.toBe("FUNDED");
    expect(row.decisionDate).toBeNull();
  });
});
