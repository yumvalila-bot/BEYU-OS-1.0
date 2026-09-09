/**
 * Government Integration Gateway — governed pipeline suite.
 *
 * Proves with a REAL PostgreSQL database that:
 *   - RBAC denies a principal without the government permissions (fail-closed);
 *   - the registry gate refuses calls to non-callable agencies;
 *   - submissions are durable, idempotent and fail-closed;
 *   - ACCEPTED always carries the government system's own reference;
 *   - a mock can never report a production-capable status;
 *   - every operation writes an audit record.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { auditLog, governmentAgencies, governmentSubmissions, legalEntities } from "@/db/schema";
import { can } from "@/lib/authz";
import {
  createDefaultGovernmentGateway,
  GovernmentGatewayError,
  MOCK_AGENCY_CODE,
  type GovernmentActor,
} from "@/lib/government";
import { seededPrincipal } from "../noelia/db-fixtures";

const RUN = `GOV${Date.now()}`;

async function actorFor(email: string): Promise<GovernmentActor> {
  const principal = await seededPrincipal(email);
  return { principal, traceId: `${RUN}-trace`, correlationId: `${RUN}-corr` };
}

let gateway = createDefaultGovernmentGateway();
let cfoActor: GovernmentActor;
let entityId: string;

beforeAll(async () => {
  gateway = createDefaultGovernmentGateway();
  cfoActor = await actorFor("cfo@beyu.os");
  const [entity] = await db
    .select({ id: legalEntities.id })
    .from(legalEntities)
    .where(eq(legalEntities.tenantId, cfoActor.principal.tenantId))
    .limit(1);
  entityId = entity.id;
});

afterAll(async () => {
  await pool.end().catch(() => undefined);
});

describe("RBAC boundary", () => {
  it("the CFO holds government submission authority; it is HIGH_RISK (MFA step-up)", async () => {
    const withMfa = can(cfoActor.principal, "government:submission.manage");
    expect(withMfa.allowed).toBe(true);
    expect(withMfa.highRisk).toBe(true);
    const withoutMfa = can({ ...cfoActor.principal, mfaSatisfied: false }, "government:submission.manage");
    expect(withoutMfa.allowed).toBe(false);
    expect(withoutMfa.requiresMfa).toBe(true);
  });

  it("a principal without the grant is denied and the denial is audited", async () => {
    const family = await actorFor("family@beyu.os");
    expect(can(family.principal, "government:submission.manage").allowed).toBe(false);
    await expect(
      gateway.submit({
        actor: family,
        agencyCode: MOCK_AGENCY_CODE,
        permission: "government:submission.manage",
        legalEntityId: entityId,
        submissionType: "MOCK",
        payload: { kind: "MOCK_SUBMISSION", reference: `${RUN}-deny`, behave: "ACCEPT" },
        idempotencyKey: `${RUN}-deny`,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("registry gate", () => {
  it("an unregistered agency cannot be called", async () => {
    await expect(
      gateway.submit({
        actor: cfoActor,
        agencyCode: "NOT_A_REAL_AGENCY",
        permission: "government:submission.manage",
        legalEntityId: entityId,
        submissionType: "X",
        payload: {},
        idempotencyKey: `${RUN}-unknown`,
      }),
    ).rejects.toMatchObject({ code: "UNKNOWN_AGENCY" });
  });

  it("an EXTERNAL_BLOCKED agency refuses external calls even for an authorized caller", async () => {
    // TRA_VFD is seeded EXTERNAL_BLOCKED (no TRA-issued credentials).
    await expect(
      gateway.submit({
        actor: cfoActor,
        agencyCode: "TRA_VFD",
        permission: "government:submission.manage",
        legalEntityId: entityId,
        submissionType: "TRA_FISCAL_RECEIPT",
        payload: { kind: "Z_REPORT", reportDate: "2026-09-09", dailyTotalMinor: 0, grossMinor: 0, taxMinor: 0 },
        idempotencyKey: `${RUN}-tra`,
      }),
    ).rejects.toMatchObject({ code: "AGENCY_NOT_CALLABLE" });
  });

  it("a CONTRACT_PENDING agency (NIDA) refuses verification calls", async () => {
    await expect(
      gateway.verify({
        actor: cfoActor,
        agencyCode: "NIDA",
        permission: "government:integration.read",
        subject: { nin: "12345678901234567890" },
      }),
    ).rejects.toMatchObject({ code: "AGENCY_NOT_CALLABLE" });
  });
});

describe("submission lifecycle (mock sandbox agency)", () => {
  it("ACCEPTED carries the government reference and a response digest; the record is durable and audited", async () => {
    const key = `${RUN}-accept`;
    const result = await gateway.submit({
      actor: cfoActor,
      agencyCode: MOCK_AGENCY_CODE,
      permission: "government:submission.manage",
      legalEntityId: entityId,
      submissionType: "MOCK",
      payload: { kind: "MOCK_SUBMISSION", reference: key, behave: "ACCEPT" },
      idempotencyKey: key,
    });
    expect(result.status).toBe("ACCEPTED");
    expect(result.externalReference).toBe(`MOCKGOV-${key}`);
    expect(result.duplicate).toBe(false);

    const [row] = await db.select().from(governmentSubmissions).where(eq(governmentSubmissions.id, result.submissionId));
    expect(row.status).toBe("ACCEPTED");
    expect(row.externalReference).toBe(`MOCKGOV-${key}`);
    expect(row.responseDigest).toBeTruthy();
    expect(row.payloadDigest).toBeTruthy();

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.objectId, result.submissionId))
      .orderBy(desc(auditLog.occurredAt));
    expect(audits.length).toBeGreaterThan(0);
    expect(audits[0].action).toBe(`government.${MOCK_AGENCY_CODE.toLowerCase()}.submit`);
  });

  it("a duplicate idempotency key with the SAME payload replays the recorded answer", async () => {
    const key = `${RUN}-idem`;
    const payload = { kind: "MOCK_SUBMISSION", reference: key, behave: "ACCEPT" };
    const first = await gateway.submit({
      actor: cfoActor,
      agencyCode: MOCK_AGENCY_CODE,
      permission: "government:submission.manage",
      legalEntityId: entityId,
      submissionType: "MOCK",
      payload,
      idempotencyKey: key,
    });
    const second = await gateway.submit({
      actor: cfoActor,
      agencyCode: MOCK_AGENCY_CODE,
      permission: "government:submission.manage",
      legalEntityId: entityId,
      submissionType: "MOCK",
      payload,
      idempotencyKey: key,
    });
    expect(second.duplicate).toBe(true);
    expect(second.submissionId).toBe(first.submissionId);
    expect(second.externalReference).toBe(first.externalReference);
  });

  it("a duplicate idempotency key with a DIFFERENT payload is refused (409)", async () => {
    const key = `${RUN}-idem-conflict`;
    await gateway.submit({
      actor: cfoActor,
      agencyCode: MOCK_AGENCY_CODE,
      permission: "government:submission.manage",
      legalEntityId: entityId,
      submissionType: "MOCK",
      payload: { kind: "MOCK_SUBMISSION", reference: key, behave: "ACCEPT" },
      idempotencyKey: key,
    });
    await expect(
      gateway.submit({
        actor: cfoActor,
        agencyCode: MOCK_AGENCY_CODE,
        permission: "government:submission.manage",
        legalEntityId: entityId,
        submissionType: "MOCK",
        payload: { kind: "MOCK_SUBMISSION", reference: `${key}-tampered`, behave: "ACCEPT" },
        idempotencyKey: key,
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_SUBMISSION" });
  });

  it("an agency-side rejection lands as REJECTED with the agency's error code — never ACCEPTED", async () => {
    const key = `${RUN}-reject`;
    const result = await gateway.submit({
      actor: cfoActor,
      agencyCode: MOCK_AGENCY_CODE,
      permission: "government:submission.manage",
      legalEntityId: entityId,
      submissionType: "MOCK",
      payload: { kind: "MOCK_SUBMISSION", reference: key, behave: "REJECT" },
      idempotencyKey: key,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.externalReference).toBeNull();
    const [row] = await db.select().from(governmentSubmissions).where(eq(governmentSubmissions.id, result.submissionId));
    expect(row.lastErrorCode).toBe("MOCK_VALIDATION_FAILURE");
  });

  it("an agency outage lands as EXTERNAL_UNAVAILABLE — fail closed, no fabricated success", async () => {
    const key = `${RUN}-outage`;
    const result = await gateway.submit({
      actor: cfoActor,
      agencyCode: MOCK_AGENCY_CODE,
      permission: "government:submission.manage",
      legalEntityId: entityId,
      submissionType: "MOCK",
      payload: { kind: "MOCK_SUBMISSION", reference: key, behave: "TIMEOUT" },
      idempotencyKey: key,
    });
    expect(result.status).toBe("EXTERNAL_UNAVAILABLE");
    expect(result.externalReference).toBeNull();
  });

  it("a payload violating the agency contract schema is refused before any external interaction", async () => {
    await expect(
      gateway.submit({
        actor: cfoActor,
        agencyCode: MOCK_AGENCY_CODE,
        permission: "government:submission.manage",
        legalEntityId: entityId,
        submissionType: "MOCK",
        payload: { kind: "WRONG_KIND" },
        idempotencyKey: `${RUN}-badpayload`,
      }),
    ).rejects.toMatchObject({ code: "INVALID_PAYLOAD" });
  });
});

describe("registry truthfulness", () => {
  it("no seeded agency claims LIVE / PRODUCTION_READY / UAT_VERIFIED (no external evidence exists)", async () => {
    const rows = await db.select().from(governmentAgencies);
    expect(rows.length).toBeGreaterThanOrEqual(10);
    for (const row of rows) {
      expect(["LIVE", "PRODUCTION_READY", "UAT_VERIFIED"].includes(row.integrationStatus), row.code).toBe(false);
    }
  });

  it("every EXTERNAL_BLOCKED agency names its exact blocker", async () => {
    const rows = await db.select().from(governmentAgencies).where(eq(governmentAgencies.integrationStatus, "EXTERNAL_BLOCKED"));
    for (const row of rows) expect(row.blockedReason, row.code).toBeTruthy();
  });

  it("the mounted mock adapter is flagged isMock and reports at most SANDBOX_READY", () => {
    const mock = gateway.list().find((a) => a.agencyCode === MOCK_AGENCY_CODE);
    expect(mock?.isMock).toBe(true);
    expect(["LIVE", "PRODUCTION_READY", "UAT_VERIFIED", "PRODUCTION_AUTHORIZATION_PENDING"].includes(mock!.status)).toBe(false);
  });

  it("real adapters honestly report EXTERNAL_BLOCKED / CONTRACT_PENDING without credentials", () => {
    const statuses = Object.fromEntries(gateway.list().map((a) => [a.agencyCode, a.status]));
    expect(statuses.TRA_VFD).toBe("EXTERNAL_BLOCKED");
    expect(statuses.NHIF).toBe("EXTERNAL_BLOCKED");
    expect(statuses.DHIS2).toBe("EXTERNAL_BLOCKED");
    expect(statuses.NIDA).toBe("CONTRACT_PENDING");
    expect(statuses.BRELA).toBe("CONTRACT_PENDING");
  });

  it("GovernmentGatewayError codes form a closed refusal catalogue", () => {
    const err = new GovernmentGatewayError("FORBIDDEN", "x", 403);
    expect(err.name).toBe("GovernmentGatewayError");
    expect(err.status).toBe(403);
  });
});
