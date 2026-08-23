import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import {
  capitalRequests,
  enterpriseEvents,
  governanceBodies,
  resolutions,
  tenants,
  users,
} from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import {
  clearanceForRoles,
  loadGrants,
  permissionsForRoles,
  type Principal,
} from "../../src/lib/authz";
import { verifyAuditChain } from "../../src/lib/audit";
import {
  capitalGovernanceAuthorizations,
  getGovernanceDecisionAuthorization,
} from "../../src/lib/governance-authorization";
import { castVote, decideResolutionClosure } from "../../src/lib/governance-vote-service";
import { resetAuditLedgers } from "../helpers/ledger-reset";

/**
 * GOVERNANCE DECISION AS AN AUTHORIZATION SIGNAL — read-only consumer.
 *
 * Real service, real PostgreSQL. The signal must reflect persisted governance
 * state exactly: only an APPROVED resolution authorises, nothing else does, and
 * the signal must never leak or grant anything.
 */

const BOARD = fixedId(ID_PREFIX.body, "GROUP_BOARD");
const ctx = { traceId: "AUTHZ_SIGNAL_TEST", ipAddress: "127.0.0.1", userAgent: "vitest" };
const CHAIR = "AMANI_BEYU";
const SECRETARY = "GRACE_KILELE";

async function principalFor(userKey: string): Promise<Principal> {
  const [u] = await db.select().from(users).where(eq(users.id, fixedId(ID_PREFIX.user, userKey)));
  if (!u) throw new Error(`seed user ${userKey} missing — run npm run seed`);
  const [t] = await db.select().from(tenants).where(eq(tenants.id, u.primaryTenantId));
  const grants = await loadGrants(u.id, u.primaryTenantId);
  const roles = [...new Set(grants.map((g) => g.code))];
  return {
    userId: u.id,
    partyId: u.partyId,
    email: u.email,
    displayName: u.email,
    tenantId: u.primaryTenantId,
    tenantCode: t.code,
    tenantType: t.type,
    roles,
    permissions: permissionsForRoles(roles),
    clearance: clearanceForRoles(roles),
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "TEST",
    riskScore: 0,
    emergencyPermissions: [],
  };
}

/** A resolution in an arbitrary lifecycle state, for signal testing. */
async function makeResolution(status: string, opts: { classification?: string } = {}) {
  const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, BOARD));
  const id = `RES_SIG_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const now = new Date();
  const terminal = ["APPROVED", "REJECTED", "DEADLOCKED", "DEFERRED"].includes(status);
  const [row] = await db
    .insert(resolutions)
    .values({
      id,
      tenantId: body.tenantId,
      bodyId: BOARD,
      reference: `${body.code}-5555-${Math.floor(Math.random() * 900 + 100)}`,
      title: "Authorization signal probe",
      category: "CAPITAL",
      summary: "Signal probe summary long enough to satisfy the domain contract.",
      rationale: "Signal probe rationale long enough to satisfy the contract.",
      dataBasis: "Probe basis.",
      consequences: "Probe consequences.",
      proposedBy: "CHIEF_GOVERNANCE_OFFICER",
      status: status as never,
      requiredMajority: body.majorityRule,
      classification: (opts.classification ?? "RESTRICTED") as never,
      quorumMet: terminal,
      votesFor: terminal ? 3 : 0,
      votesAgainst: terminal ? 1 : 0,
      decidedByMemberId: terminal ? "GMB_BRD_CEO" : null,
      decisionDate: terminal ? now : null,
      votingOpensAt: new Date(now.getTime() - 3 * 86_400_000),
      votingClosesAt: new Date(now.getTime() - 3600_000),
    })
    .returning();
  return row;
}

/** A capital request optionally linked to a governing resolution. */
async function makeCapitalRequest(resolutionId: string | null, entityId?: string) {
  const id = `CAP_SIG_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const [row] = await db
    .insert(capitalRequests)
    .values({
      id,
      tenantId: "TEN_BEYU_GROUP",
      legalEntityId: entityId ?? "LEN_BEYU_HEALTH_LTD",
      code: `CAP-SIG-${Math.floor(Math.random() * 90000 + 10000)}`,
      title: "Signal probe capital request",
      requestType: "INVESTMENT",
      amount: "250000.00",
      currency: "USD",
      requestedBy: "GROUP_CFO",
      status: "SUBMITTED",
      resolutionId,
    } as never)
    .returning();
  return row;
}

async function cleanup() {
  await db.execute(sql`delete from capital_requests where id like 'CAP_SIG_%'`);
  await db.execute(sql`delete from resolution_votes where resolution_id like 'RES_SIG_%'`);
  await db.execute(sql`delete from resolutions where id like 'RES_SIG_%'`);
  await db.execute(sql`delete from idempotency_records`);
}

async function resetLedgers() {
  await resetAuditLedgers();
  await db.execute(
    sql`insert into audit_chain_heads(chain_name,current_hash) values ('AUDIT_LOG', null),('ENTERPRISE_EVENTS', null)
        on conflict(chain_name) do update set current_hash = null, updated_at = now()`,
  );
}

beforeEach(async () => {
  await cleanup();
  await resetLedgers();
});

afterAll(cleanup);

/* ================================================================== *
 * 7–13  Decision provenance: only APPROVED authorises
 * ================================================================== */

describe("authorization signal — decision provenance", () => {
  it("7. an APPROVED resolution produces a valid authorization signal", async () => {
    const r = await makeResolution("APPROVED");
    const cap = await makeCapitalRequest(r.id);
    const signal = await getGovernanceDecisionAuthorization(
      await principalFor(SECRETARY),
      "CAPITAL_REQUEST",
      cap.id,
    );

    expect(signal.authorized).toBe(true);
    expect(signal.decision).toBe("APPROVED");
    expect(signal.resolutionId).toBe(r.id);
    expect(signal.reference).toBe(r.reference);
    expect(signal.governanceBodyCode).toBe("GROUP_BOARD");
    expect(signal.decidedAt).not.toBeNull();
    expect(signal.decidedBy).toBe("GMB_BRD_CEO");
    expect(signal.tenantId).toBe("TEN_BEYU_GROUP");
    expect(signal.entityId).toBe("LEN_BEYU_HEALTH_LTD");
  });

  for (const status of ["REJECTED", "DEADLOCKED", "DEFERRED", "VOTED", "DRAFT", "TABLED"]) {
    it(`8-13. a ${status} resolution does NOT authorise`, async () => {
      const r = await makeResolution(status);
      const cap = await makeCapitalRequest(r.id);
      const signal = await getGovernanceDecisionAuthorization(
        await principalFor(SECRETARY),
        "CAPITAL_REQUEST",
        cap.id,
      );

      expect(signal.authorized).toBe(false);
      expect(signal.decision).toBe(status);
      // The reason names the actual status rather than a generic denial.
      expect(signal.reason).toContain(status);
    });
  }

  it("an object with no linked resolution is not authorised", async () => {
    const cap = await makeCapitalRequest(null);
    const signal = await getGovernanceDecisionAuthorization(
      await principalFor(SECRETARY),
      "CAPITAL_REQUEST",
      cap.id,
    );
    expect(signal.authorized).toBe(false);
    expect(signal.provenance).toBe("NONE");
    expect(signal.resolutionId).toBeNull();
  });
});

/* ================================================================== *
 * 14–16  Tenant, entity and classification security
 * ================================================================== */

describe("authorization signal — security", () => {
  it("14. a cross-tenant principal cannot inspect, and cannot confirm existence", async () => {
    const r = await makeResolution("APPROVED");
    const cap = await makeCapitalRequest(r.id);
    const sector = await principalFor("SARA_LEMA");

    const real = await getGovernanceDecisionAuthorization(sector, "CAPITAL_REQUEST", cap.id).catch(
      (e) => e,
    );
    const fake = await getGovernanceDecisionAuthorization(
      sector,
      "CAPITAL_REQUEST",
      "CAP_SIG_DOES_NOT_EXIST",
    ).catch((e) => e);

    // Identical response: no existence oracle across tenants.
    expect(real.code).toBe("NOT_FOUND");
    expect(real.code).toBe(fake.code);
    expect(real.message).toBe(fake.message);
  });

  it("15. an entity-scoped principal cannot inspect an out-of-scope entity", async () => {
    const r = await makeResolution("APPROVED");
    const cap = await makeCapitalRequest(r.id, "LEN_BEYU_HEALTH_LTD");

    const base = await principalFor(SECRETARY);
    const scoped = { ...base, entityScope: ["LEN_BEYU_AGRI_LTD"] };

    await expect(
      getGovernanceDecisionAuthorization(scoped, "CAPITAL_REQUEST", cap.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // The same principal scoped to the right entity succeeds.
    const inScope = { ...base, entityScope: ["LEN_BEYU_HEALTH_LTD"] };
    const ok = await getGovernanceDecisionAuthorization(inScope, "CAPITAL_REQUEST", cap.id);
    expect(ok.authorized).toBe(true);
  });

  it("16. the classification ceiling is enforced", async () => {
    const r = await makeResolution("APPROVED", { classification: "HIGHLY_RESTRICTED" });
    const cap = await makeCapitalRequest(r.id);

    const base = await principalFor(SECRETARY);
    const downgraded = { ...base, clearance: "RESTRICTED" as const };
    await expect(
      getGovernanceDecisionAuthorization(downgraded, "CAPITAL_REQUEST", cap.id),
    ).rejects.toMatchObject({ code: "CLASSIFICATION_DENIED" });

    // Full clearance sees it.
    const ok = await getGovernanceDecisionAuthorization(base, "CAPITAL_REQUEST", cap.id);
    expect(ok.authorized).toBe(true);
  });

  it("the signal never mutates governance state", async () => {
    const r = await makeResolution("APPROVED");
    const cap = await makeCapitalRequest(r.id);
    const before = (await db.select().from(resolutions).where(eq(resolutions.id, r.id)))[0];
    const auditsBefore = (await verifyAuditChain()).records;

    for (let i = 0; i < 3; i++) {
      await getGovernanceDecisionAuthorization(
        await principalFor(SECRETARY),
        "CAPITAL_REQUEST",
        cap.id,
      );
    }

    const after = (await db.select().from(resolutions).where(eq(resolutions.id, r.id)))[0];
    expect(after.status).toBe(before.status);
    expect(after.decisionDate?.toISOString()).toBe(before.decisionDate?.toISOString());
    // A read is not a governed mutation: it adds no audit records.
    expect((await verifyAuditChain()).records).toBe(auditsBefore);
  });
});

/* ================================================================== *
 * 17–21  Provenance
 * ================================================================== */

describe("authorization signal — provenance", () => {
  it("17-21. identifies the resolution, body, time, actor and governed provenance", async () => {
    // Drive a REAL governed decision so provenance comes from the ledger.
    const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, BOARD));
    const id = `RES_SIG_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const now = new Date();
    await db.insert(resolutions).values({
      id,
      tenantId: body.tenantId,
      bodyId: BOARD,
      reference: `${body.code}-5555-${Math.floor(Math.random() * 900 + 100)}`,
      title: "Governed provenance probe",
      category: "CAPITAL",
      summary: "Governed probe summary long enough to satisfy the domain contract.",
      rationale: "Governed probe rationale long enough to satisfy the contract.",
      dataBasis: "Probe basis.",
      consequences: "Probe consequences.",
      proposedBy: "CHIEF_GOVERNANCE_OFFICER",
      status: "TABLED",
      requiredMajority: body.majorityRule,
      classification: "RESTRICTED",
      votingOpensAt: new Date(now.getTime() - 3600_000),
      votingClosesAt: new Date(now.getTime() + 86_400_000),
    } as never);

    for (const [userKey, vote] of [
      [CHAIR, "FOR"],
      ["DAUDI_MOSHI", "FOR"],
      [SECRETARY, "FOR"],
      ["JOHN_MREMA", "AGAINST"],
      ["NEEMA_BEYU", "ABSTAIN"],
    ] as const) {
      await castVote(await principalFor(userKey), { resolutionId: id, vote }, ctx);
    }
    const decision = await decideResolutionClosure(
      await principalFor(CHAIR),
      { resolutionId: id },
      ctx,
    );
    expect(decision.outcome).toBe("APPROVED");

    const cap = await makeCapitalRequest(id);
    const signal = await getGovernanceDecisionAuthorization(
      await principalFor(SECRETARY),
      "CAPITAL_REQUEST",
      cap.id,
    );

    expect(signal.authorized).toBe(true);
    expect(signal.resolutionId).toBe(id); // 17. governing resolution
    expect(signal.governanceBodyId).toBe(BOARD); // 18. deciding body
    expect(signal.governanceBodyCode).toBe("GROUP_BOARD");
    expect(signal.decidedAt).toBe(decision.decisionDate); // 19. decision time
    expect(signal.decidedBy).toBe(decision.decidedByMemberId); // 20. decision actor
    expect(signal.provenance).toBe("GOVERNED"); // 21. tied to the canonical record

    // The signal agrees with the canonical decision event, not a second source.
    const [event] = await db
      .select()
      .from(enterpriseEvents)
      .where(eq(enterpriseEvents.type, "GOVERNANCE_RESOLUTION_DECIDED"));
    const payload = event.payload as Record<string, unknown>;
    expect(payload.outcome).toBe(signal.decision);
    expect(payload.decidedByMemberId).toBe(signal.decidedBy);
  });

  it("distinguishes GOVERNED from seeded REFERENCE_DATA", async () => {
    // Directly inserted (seed-like) resolution: no audit-ledger provenance.
    const seeded = await makeResolution("APPROVED");
    const cap = await makeCapitalRequest(seeded.id);
    const signal = await getGovernanceDecisionAuthorization(
      await principalFor(SECRETARY),
      "CAPITAL_REQUEST",
      cap.id,
    );
    expect(signal.authorized).toBe(true);
    // Authorised, but honestly labelled as not produced by a governed transaction.
    expect(signal.provenance).toBe("REFERENCE_DATA");
  });

  it("a resolution can be inspected directly", async () => {
    const r = await makeResolution("APPROVED");
    const signal = await getGovernanceDecisionAuthorization(
      await principalFor(SECRETARY),
      "RESOLUTION",
      r.id,
    );
    expect(signal.objectType).toBe("RESOLUTION");
    expect(signal.authorized).toBe(true);
    expect(signal.resolutionId).toBe(r.id);
  });
});

/* ================================================================== *
 * 22–25  Integrity
 * ================================================================== */

describe("authorization signal — integrity", () => {
  it("22. a decision is not observable as approved before its transaction commits", async () => {
    const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, BOARD));
    const id = `RES_SIG_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const now = new Date();
    await db.insert(resolutions).values({
      id,
      tenantId: body.tenantId,
      bodyId: BOARD,
      reference: `${body.code}-5555-${Math.floor(Math.random() * 900 + 100)}`,
      title: "Uncommitted decision probe",
      category: "CAPITAL",
      summary: "Uncommitted probe summary long enough to satisfy the contract.",
      rationale: "Uncommitted probe rationale long enough to satisfy the contract.",
      dataBasis: "Probe basis.",
      consequences: "Probe consequences.",
      proposedBy: "CHIEF_GOVERNANCE_OFFICER",
      status: "VOTED",
      requiredMajority: body.majorityRule,
      classification: "RESTRICTED",
      quorumMet: true,
      votesFor: 3,
      votesAgainst: 1,
      votingOpensAt: new Date(now.getTime() - 3 * 86_400_000),
      votingClosesAt: new Date(now.getTime() - 3600_000),
    } as never);
    const cap = await makeCapitalRequest(id);
    const reader = await principalFor(SECRETARY);

    // Open a transaction that decides but does NOT commit. Phase 15 correctly
    // routes calls made *inside* the callback through that transaction, so the
    // external observer must run from the parent async context while the writer
    // is held open.
    let signalUpdated!: () => void;
    let releaseWriter!: () => void;
    const updated = new Promise<void>((resolve) => { signalUpdated = resolve; });
    const holdWriter = new Promise<void>((resolve) => { releaseWriter = resolve; });
    const writer = db
      .transaction(async (tx) => {
        await tx
          .update(resolutions)
          .set({ status: "APPROVED", decisionDate: new Date(), decidedByMemberId: "GMB_BRD_CEO" })
          .where(eq(resolutions.id, id));
        signalUpdated();
        await holdWriter;
        throw new Error("rollback");
      })
      .catch((e) => {
        if (!/rollback/.test(String(e))) throw e;
      });

    await updated;
    try {
      const during = await getGovernanceDecisionAuthorization(reader, "CAPITAL_REQUEST", cap.id);
      expect(during.authorized).toBe(false);
      expect(during.decision).toBe("VOTED");
    } finally {
      releaseWriter();
      await writer;
    }

    // 23. After the rolled-back transaction there is still no authorization.
    const after = await getGovernanceDecisionAuthorization(reader, "CAPITAL_REQUEST", cap.id);
    expect(after.authorized).toBe(false);
    expect(after.decision).toBe("VOTED");
  });

  it("24. a duplicate decision attempt cannot produce a conflicting signal", async () => {
    const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, BOARD));
    const id = `RES_SIG_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const now = new Date();
    await db.insert(resolutions).values({
      id,
      tenantId: body.tenantId,
      bodyId: BOARD,
      reference: `${body.code}-5555-${Math.floor(Math.random() * 900 + 100)}`,
      title: "Duplicate decision probe",
      category: "CAPITAL",
      summary: "Duplicate probe summary long enough to satisfy the contract.",
      rationale: "Duplicate probe rationale long enough to satisfy the contract.",
      dataBasis: "Probe basis.",
      consequences: "Probe consequences.",
      proposedBy: "CHIEF_GOVERNANCE_OFFICER",
      status: "VOTED",
      requiredMajority: body.majorityRule,
      classification: "RESTRICTED",
      quorumMet: true,
      votesFor: 3,
      votesAgainst: 1,
      votingOpensAt: new Date(now.getTime() - 3 * 86_400_000),
      votingClosesAt: new Date(now.getTime() - 3600_000),
    } as never);
    // Real ballots: the outcome is recomputed from these at closure, so a
    // fixture without them would (correctly) defer for want of quorum.
    for (const [member, vote] of [
      ["GMB_BRD_CEO", "FOR"],
      ["GMB_BRD_CFO", "FOR"],
      ["GMB_BRD_CGO", "FOR"],
      ["GMB_BRD_RISK", "AGAINST"],
      ["GMB_BRD_FAM", "ABSTAIN"],
    ] as const) {
      await db.execute(
        sql`insert into resolution_votes (id, resolution_id, member_id, vote)
            values (${`VOT_SIG_${id}_${member}`}, ${id}, ${member}, ${vote})`,
      );
    }

    const cap = await makeCapitalRequest(id);
    const chair = await principalFor(CHAIR);

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => decideResolutionClosure(chair, { resolutionId: id }, ctx)),
    );
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);

    // Exactly one decision event, and the signal matches it unambiguously.
    const events = await db
      .select()
      .from(enterpriseEvents)
      .where(eq(enterpriseEvents.subjectId, id));
    expect(events.filter((e) => e.type === "GOVERNANCE_RESOLUTION_DECIDED").length).toBe(1);

    const signal = await getGovernanceDecisionAuthorization(
      await principalFor(SECRETARY),
      "CAPITAL_REQUEST",
      cap.id,
    );
    expect(signal.authorized).toBe(true);
    expect(signal.decision).toBe("APPROVED");
    expect(signal.decidedBy).toBe("GMB_BRD_CEO");
  });

  it("25. reading the signal leaves the audit chain valid", async () => {
    const r = await makeResolution("APPROVED");
    const cap = await makeCapitalRequest(r.id);
    await getGovernanceDecisionAuthorization(
      await principalFor(SECRETARY),
      "CAPITAL_REQUEST",
      cap.id,
    );
    expect((await verifyAuditChain()).verified).toBe(true);
  });
});

/* ================================================================== *
 * Batch read model
 * ================================================================== */

describe("authorization signal — capital read model", () => {
  /**
   * The batch read model is a FINANCE workbench concern, so it requires
   * `finance:capital.read`. The Chief Governance Officer deliberately does NOT
   * hold that capability — governance custody and capital visibility are
   * separate duties — so these tests use the CFO, who does.
   */
  const CAPITAL_READER = "DAUDI_MOSHI";

  it("returns one authorization per visible capital request", async () => {
    const approved = await makeResolution("APPROVED");
    const rejected = await makeResolution("REJECTED");
    const capA = await makeCapitalRequest(approved.id);
    const capR = await makeCapitalRequest(rejected.id);
    const capNone = await makeCapitalRequest(null);

    const map = await capitalGovernanceAuthorizations(await principalFor(CAPITAL_READER), [
      capA.id,
      capR.id,
      capNone.id,
    ]);

    expect(map.get(capA.id)?.authorized).toBe(true);
    expect(map.get(capR.id)?.authorized).toBe(false);
    expect(map.get(capNone.id)?.authorized).toBe(false);
    expect(map.get(capNone.id)?.provenance).toBe("NONE");
  });

  it("omits capital requests outside the caller's tenant scope", async () => {
    const approved = await makeResolution("APPROVED");
    const cap = await makeCapitalRequest(approved.id);
    const sector = await principalFor("SARA_LEMA");
    const map = await capitalGovernanceAuthorizations(sector, [cap.id]);
    expect(map.has(cap.id)).toBe(false);
  });

  it("omits requests governed by a resolution above the caller's clearance", async () => {
    const secret = await makeResolution("APPROVED", { classification: "HIGHLY_RESTRICTED" });
    const cap = await makeCapitalRequest(secret.id);

    // The CEO holds capital read AND HIGHLY_RESTRICTED clearance.
    const base = await principalFor(CHAIR);
    const downgraded = { ...base, clearance: "RESTRICTED" as const };
    const map = await capitalGovernanceAuthorizations(downgraded, [cap.id]);
    // Omitted rather than reported: the list is not an oracle for classified
    // governance activity.
    expect(map.has(cap.id)).toBe(false);

    expect((await capitalGovernanceAuthorizations(base, [cap.id])).has(cap.id)).toBe(true);
  });

  it("returns nothing to a principal without the capital read capability", async () => {
    const approved = await makeResolution("APPROVED");
    const cap = await makeCapitalRequest(approved.id);
    const base = await principalFor(CAPITAL_READER);
    const stripped = {
      ...base,
      permissions: new Set([...base.permissions].filter((p) => p !== "finance:capital.read")) as typeof base.permissions,
    };
    const map = await capitalGovernanceAuthorizations(stripped, [cap.id]);
    expect(map.size).toBe(0);
  });
});
