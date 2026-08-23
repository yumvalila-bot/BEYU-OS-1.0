import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { capitalRequests, governanceBodies, resolutions } from "../../src/db/schema";
import { apiGetJson, login, serverAvailable } from "../helpers/http";

/**
 * END-TO-END transport tests for the read-only governance authorization signal.
 *
 * Drives the real running server so authentication, validation, tenant
 * isolation and the non-enumerating 404 are proven by execution.
 */

const available = await serverAvailable();

let governance = ""; // Grace — CGO, governance read, HIGHLY_RESTRICTED clearance
let sectorOperator = ""; // Health ops — different tenant scope
let auditor = ""; // Peter — read-only auditor

const BOARD = "GOV_GROUP_BOARD";
const RUN = Math.random().toString(36).slice(2, 6).toUpperCase();

async function cleanup() {
  await db.execute(sql`delete from capital_requests where id like 'CAP_AH_%'`);
  await db.execute(sql`delete from resolutions where id like 'RES_AH_%'`);
}

async function makeResolution(suffix: string, status: string) {
  const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, BOARD));
  const id = `RES_AH_${RUN}_${suffix}`;
  const now = new Date();
  const terminal = ["APPROVED", "REJECTED", "DEADLOCKED", "DEFERRED"].includes(status);
  await db.insert(resolutions).values({
    id,
    tenantId: body.tenantId,
    bodyId: BOARD,
    reference: `GROUP_BOARD-4444-${RUN}${suffix.slice(0, 2)}`,
    title: "HTTP authorization probe",
    category: "CAPITAL",
    summary: "HTTP probe summary long enough to satisfy the domain contract.",
    rationale: "HTTP probe rationale long enough to satisfy the contract.",
    dataBasis: "Probe basis.",
    consequences: "Probe consequences.",
    proposedBy: "CHIEF_GOVERNANCE_OFFICER",
    status: status as never,
    requiredMajority: body.majorityRule,
    classification: "RESTRICTED",
    quorumMet: terminal,
    votesFor: terminal ? 3 : 0,
    votesAgainst: terminal ? 1 : 0,
    decidedByMemberId: terminal ? "GMB_BRD_CEO" : null,
    decisionDate: terminal ? now : null,
    votingOpensAt: new Date(now.getTime() - 3 * 86_400_000),
    votingClosesAt: new Date(now.getTime() - 3600_000),
  } as never);
  return id;
}

async function makeCapitalRequest(suffix: string, resolutionId: string | null) {
  const id = `CAP_AH_${RUN}_${suffix}`;
  await db.insert(capitalRequests).values({
    id,
    tenantId: "TEN_BEYU_GROUP",
    legalEntityId: "LEN_BEYU_HEALTH_LTD",
    code: `CAP-AH-${RUN}-${suffix}`,
    title: "HTTP probe capital request",
    requestType: "INVESTMENT",
    amount: "250000.00",
    currency: "USD",
    requestedBy: "GROUP_CFO",
    status: "SUBMITTED",
    resolutionId,
  } as never);
  return id;
}

const path = (t: string, id: string) =>
  `/api/v1/governance/authorization?objectType=${encodeURIComponent(t)}&objectId=${encodeURIComponent(id)}`;

beforeAll(async () => {
  if (!available) return;
  await cleanup();
  governance = await login("governance@beyu.os");
  sectorOperator = await login("health.ops@beyu.os");
  auditor = await login("auditor@beyu.os");
}, 240_000);

beforeEach(async () => {
  if (available) await cleanup();
});

afterAll(async () => {
  if (available) await cleanup();
  await pool.end().catch(() => undefined);
});

describe.skipIf(!available)("governance authorization signal over HTTP", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const r = await makeResolution("UNAUTH", "APPROVED");
    const cap = await makeCapitalRequest("UNAUTH", r);
    const res = await apiGetJson(path("CAPITAL_REQUEST", cap));
    expect(res.status).toBe(401);
  });

  it("returns an authorization signal for a governed capital request", async () => {
    const r = await makeResolution("OK1", "APPROVED");
    const cap = await makeCapitalRequest("OK1", r);

    const res = await apiGetJson(path("CAPITAL_REQUEST", cap), { cookie: governance });
    expect(res.status).toBe(200);

    const data = (res.body as { data: Record<string, unknown> }).data;
    expect(data.authorized).toBe(true);
    expect(data.decision).toBe("APPROVED");
    expect(data.resolutionId).toBe(r);
    expect(data.governanceBodyCode).toBe("GROUP_BOARD");
    expect(data.decidedAt).not.toBeNull();
    expect(data.decidedBy).toBe("GMB_BRD_CEO");
  });

  it("reports NOT authorized for a rejected resolution", async () => {
    const r = await makeResolution("REJ1", "REJECTED");
    const cap = await makeCapitalRequest("REJ1", r);

    const res = await apiGetJson(path("CAPITAL_REQUEST", cap), { cookie: governance });
    expect(res.status).toBe(200);
    const data = (res.body as { data: Record<string, unknown> }).data;
    expect(data.authorized).toBe(false);
    expect(data.decision).toBe("REJECTED");
  });

  it("reports NOT authorized while the resolution is only VOTED", async () => {
    const r = await makeResolution("VOT1", "VOTED");
    const cap = await makeCapitalRequest("VOT1", r);

    const res = await apiGetJson(path("CAPITAL_REQUEST", cap), { cookie: governance });
    expect(res.status).toBe(200);
    const data = (res.body as { data: Record<string, unknown> }).data;
    expect(data.authorized).toBe(false);
    expect(data.decision).toBe("VOTED");
  });

  it("gives an out-of-scope caller no existence oracle", async () => {
    // Every seeded governance reader belongs to the group tenant, so a
    // cross-tenant caller is stopped by RBAC before scoping. The property that
    // must hold either way: a real object and a fabricated one are
    // indistinguishable to a caller who may not see them.
    const r = await makeResolution("XT1", "APPROVED");
    const cap = await makeCapitalRequest("XT1", r);

    const real = await apiGetJson(path("CAPITAL_REQUEST", cap), { cookie: sectorOperator });
    const fake = await apiGetJson(path("CAPITAL_REQUEST", "CAP_AH_NOT_REAL"), {
      cookie: sectorOperator,
    });

    expect(real.status).toBe(fake.status);
    expect([403, 404]).toContain(real.status);
    const strip = (b: unknown) => {
      const e = (b as { error?: { code?: string; message?: string } }).error;
      return { code: e?.code, message: e?.message };
    };
    expect(strip(real.body)).toEqual(strip(fake.body));
  });

  it("returns the same 404 for an in-tenant caller on a non-existent object", async () => {
    const missing = await apiGetJson(path("CAPITAL_REQUEST", "CAP_AH_NOT_REAL"), {
      cookie: governance,
    });
    expect(missing.status).toBe(404);
    expect((missing.body as { error?: { code?: string } })?.error?.code).toBe("NOT_FOUND");
  });

  it("rejects a missing parameter with 422", async () => {
    const res = await apiGetJson("/api/v1/governance/authorization", { cookie: governance });
    expect(res.status).toBe(422);
    expect((res.body as { error?: { code?: string } })?.error?.code).toBe("VALIDATION_FAILED");
  });

  it("rejects an unknown objectType with 422", async () => {
    const res = await apiGetJson(path("SECRET_TABLE", "anything"), { cookie: governance });
    expect(res.status).toBe(422);
    expect((res.body as { error?: { code?: string } })?.error?.code).toBe("VALIDATION_FAILED");
  });

  it("denies a principal without the governance read capability", async () => {
    const r = await makeResolution("NOCAP", "APPROVED");
    const cap = await makeCapitalRequest("NOCAP", r);
    // health.ops holds no governance:resolution.read capability.
    const res = await apiGetJson(path("CAPITAL_REQUEST", cap), { cookie: sectorOperator });
    expect([403, 404]).toContain(res.status);
  });

  it("permits a read-only auditor to inspect governance authorization", async () => {
    const r = await makeResolution("AUD1", "APPROVED");
    const cap = await makeCapitalRequest("AUD1", r);
    const res = await apiGetJson(path("CAPITAL_REQUEST", cap), { cookie: auditor });
    expect(res.status).toBe(200);
    expect((res.body as { data: Record<string, unknown> }).data.authorized).toBe(true);
  });

  it("mutates nothing: repeated reads leave the resolution untouched", async () => {
    const r = await makeResolution("IMMUT", "APPROVED");
    const cap = await makeCapitalRequest("IMMUT", r);
    const [before] = await db.select().from(resolutions).where(eq(resolutions.id, r));

    for (let i = 0; i < 3; i++) {
      const res = await apiGetJson(path("CAPITAL_REQUEST", cap), { cookie: governance });
      expect(res.status).toBe(200);
    }

    const [after] = await db.select().from(resolutions).where(eq(resolutions.id, r));
    expect(after.status).toBe(before.status);
    expect(after.decisionDate?.toISOString()).toBe(before.decisionDate?.toISOString());
    expect(after.decidedByMemberId).toBe(before.decidedByMemberId);

    // The capital request itself is untouched: this endpoint cannot approve it.
    const [capRow] = await db.select().from(capitalRequests).where(eq(capitalRequests.id, cap));
    expect(capRow.status).toBe("SUBMITTED");
  });

  it("inspects a resolution directly", async () => {
    const r = await makeResolution("DIRECT", "APPROVED");
    const res = await apiGetJson(path("RESOLUTION", r), { cookie: governance });
    expect(res.status).toBe(200);
    const data = (res.body as { data: Record<string, unknown> }).data;
    expect(data.objectType).toBe("RESOLUTION");
    expect(data.authorized).toBe(true);
  });
});
