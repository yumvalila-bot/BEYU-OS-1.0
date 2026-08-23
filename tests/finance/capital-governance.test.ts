import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import {
  auditLog,
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
import { castVote, decideResolutionClosure } from "../../src/lib/governance-vote-service";
import { resetAuditLedgers } from "../helpers/ledger-reset";
import {
  CAPITAL_STATUS,
  authorizeCapitalRequestGovernance,
} from "../../src/lib/capital-governance-service";

/**
 * CAPITAL REQUEST GOVERNANCE AUTHORIZATION — the first real downstream consumer.
 *
 * Real services, real PostgreSQL, no mocks.
 *
 * The governing property under test: a capital request may reach
 * GOVERNANCE_AUTHORIZED only when a GOVERNED, APPROVED resolution within the
 * correct tenant and entity reach authorises it — and reaching that state moves
 * no money.
 */

const BOARD = fixedId(ID_PREFIX.body, "GROUP_BOARD"); // entity LEN_BEYU_HOLDINGS
const ctx = { traceId: "CAPGOV_TEST", ipAddress: "127.0.0.1", userAgent: "vitest" };

/** Group CFO: holds finance:capital.manage. */
const CFO = "DAUDI_MOSHI";
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

/** A resolution placed directly in a given state (no ledger provenance). */
async function seededResolution(status: string, opts: { bodyId?: string } = {}) {
  const bodyId = opts.bodyId ?? BOARD;
  const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, bodyId));
  const id = `RES_CG_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const now = new Date();
  const terminal = ["APPROVED", "REJECTED", "DEADLOCKED", "DEFERRED"].includes(status);
  const [row] = await db
    .insert(resolutions)
    .values({
      id,
      tenantId: body.tenantId,
      bodyId,
      reference: `${body.code}-3333-${Math.floor(Math.random() * 900 + 100)}`,
      title: "Capital governance probe",
      category: "CAPITAL",
      summary: "Capital governance probe summary long enough for the contract.",
      rationale: "Capital governance probe rationale long enough for the contract.",
      dataBasis: "Probe basis.",
      consequences: "Probe consequences.",
      proposedBy: "GROUP_CFO",
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
    })
    .returning();
  return row;
}

/**
 * A GENUINELY governed APPROVED resolution: proposed state, real ballots, real
 * closure — so it carries audit-ledger provenance.
 */
async function governedApprovedResolution(bodyId = BOARD) {
  const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, bodyId));
  const id = `RES_CG_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const now = new Date();
  await db.insert(resolutions).values({
    id,
    tenantId: body.tenantId,
    bodyId,
    reference: `${body.code}-3333-${Math.floor(Math.random() * 900 + 100)}`,
    title: "Governed capital authority",
    category: "CAPITAL",
    summary: "Governed capital authority summary long enough for the contract.",
    rationale: "Governed capital authority rationale long enough for the contract.",
    dataBasis: "Probe basis.",
    consequences: "Probe consequences.",
    proposedBy: "GROUP_CFO",
    status: "TABLED",
    requiredMajority: body.majorityRule,
    classification: "RESTRICTED",
    votingOpensAt: new Date(now.getTime() - 3600_000),
    votingClosesAt: new Date(now.getTime() + 86_400_000),
  } as never);

  for (const [userKey, vote] of [
    [CHAIR, "FOR"],
    [CFO, "FOR"],
    [SECRETARY, "FOR"],
    ["JOHN_MREMA", "AGAINST"],
    ["NEEMA_BEYU", "ABSTAIN"],
  ] as const) {
    await castVote(await principalFor(userKey), { resolutionId: id, vote }, ctx);
  }
  const decision = await decideResolutionClosure(await principalFor(CHAIR), { resolutionId: id }, ctx);
  if (decision.outcome !== "APPROVED") throw new Error(`expected APPROVED, got ${decision.outcome}`);
  const [row] = await db.select().from(resolutions).where(eq(resolutions.id, id));
  return row;
}

async function makeCapitalRequest(
  resolutionId: string | null,
  opts: { status?: string; entityId?: string; tenantId?: string; amount?: string } = {},
) {
  const id = `CAP_CG_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const [row] = await db
    .insert(capitalRequests)
    .values({
      id,
      tenantId: opts.tenantId ?? "TEN_BEYU_GROUP",
      legalEntityId: opts.entityId ?? "LEN_BEYU_HEALTH_LTD",
      code: `CAP-CG-${Math.floor(Math.random() * 900000 + 100000)}`,
      title: "Capital governance probe request",
      requestType: "INVESTMENT",
      amount: opts.amount ?? "250000.00",
      currency: "USD",
      requestedBy: "GROUP_CFO",
      status: opts.status ?? CAPITAL_STATUS.SUBMITTED,
      resolutionId,
    } as never)
    .returning();
  return row;
}

async function cleanup() {
  await db.execute(sql`delete from capital_requests where id like 'CAP_CG_%'`);
  await db.execute(sql`delete from resolution_votes where resolution_id like 'RES_CG_%'`);
  await db.execute(sql`delete from resolutions where id like 'RES_CG_%'`);
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
 * §12  Governance state matrix
 * ================================================================== */

describe("capital governance — state matrix", () => {
  for (const status of ["DRAFT", "TABLED", "VOTED", "REJECTED", "DEADLOCKED", "DEFERRED"]) {
    it(`a ${status} resolution cannot authorize a capital request`, async () => {
      const r = await seededResolution(status);
      const cap = await makeCapitalRequest(r.id);

      await expect(
        authorizeCapitalRequestGovernance(
          await principalFor(CFO),
          { capitalRequestId: cap.id },
          ctx,
        ),
      ).rejects.toMatchObject({ code: "GOVERNANCE_NOT_SATISFIED" });

      const [after] = await db.select().from(capitalRequests).where(eq(capitalRequests.id, cap.id));
      expect(after.status).toBe(CAPITAL_STATUS.SUBMITTED);
    });
  }

  it("a capital request with NO linked resolution cannot be authorized", async () => {
    const cap = await makeCapitalRequest(null);
    await expect(
      authorizeCapitalRequestGovernance(await principalFor(CFO), { capitalRequestId: cap.id }, ctx),
    ).rejects.toMatchObject({ code: "GOVERNANCE_NOT_SATISFIED" });
  });

  it("a seeded APPROVED resolution (REFERENCE_DATA) cannot authorize a real transition", async () => {
    // Approved, but with no audit-ledger provenance: unaudited fixture data must
    // never be able to move the enterprise.
    const r = await seededResolution("APPROVED");
    const cap = await makeCapitalRequest(r.id);

    await expect(
      authorizeCapitalRequestGovernance(await principalFor(CFO), { capitalRequestId: cap.id }, ctx),
    ).rejects.toMatchObject({ code: "GOVERNANCE_NOT_SATISFIED" });

    const [after] = await db.select().from(capitalRequests).where(eq(capitalRequests.id, cap.id));
    expect(after.status).toBe(CAPITAL_STATUS.SUBMITTED);
  });

  it("a GOVERNED APPROVED resolution authorizes the capital request", async () => {
    const r = await governedApprovedResolution();
    const cap = await makeCapitalRequest(r.id);

    const result = await authorizeCapitalRequestGovernance(
      await principalFor(CFO),
      { capitalRequestId: cap.id },
      ctx,
    );

    expect(result.status).toBe(CAPITAL_STATUS.GOVERNANCE_AUTHORIZED);
    expect(result.previousStatus).toBe(CAPITAL_STATUS.SUBMITTED);
    expect(result.resolutionId).toBe(r.id);
    expect(result.decision).toBe("APPROVED");
    expect(result.executed).toBe(false);

    const [after] = await db.select().from(capitalRequests).where(eq(capitalRequests.id, cap.id));
    expect(after.status).toBe(CAPITAL_STATUS.GOVERNANCE_AUTHORIZED);
  });

  it("a resolution linked to a DIFFERENT capital request does not authorize this one", async () => {
    const r = await governedApprovedResolution();
    const governed = await makeCapitalRequest(r.id);
    const unlinked = await makeCapitalRequest(null);

    await expect(
      authorizeCapitalRequestGovernance(
        await principalFor(CFO),
        { capitalRequestId: unlinked.id },
        ctx,
      ),
    ).rejects.toMatchObject({ code: "GOVERNANCE_NOT_SATISFIED" });

    // The genuinely linked one still works.
    const ok = await authorizeCapitalRequestGovernance(
      await principalFor(CFO),
      { capitalRequestId: governed.id },
      ctx,
    );
    expect(ok.status).toBe(CAPITAL_STATUS.GOVERNANCE_AUTHORIZED);
  });
});

/* ================================================================== *
 * §6  Linkage integrity — tenant and entity reach
 * ================================================================== */

describe("capital governance — linkage integrity", () => {
  it("authorizes across entities when the governing body is an ancestor", async () => {
    // GROUP_BOARD governs LEN_BEYU_HOLDINGS; the capital sits at
    // LEN_BEYU_HEALTH_LTD (Health -> TZ Holding -> Holdings). Cross-entity
    // governance is the canonical model, so this must succeed.
    const r = await governedApprovedResolution();
    const cap = await makeCapitalRequest(r.id, { entityId: "LEN_BEYU_HEALTH_LTD" });
    const result = await authorizeCapitalRequestGovernance(
      await principalFor(CFO),
      { capitalRequestId: cap.id },
      ctx,
    );
    expect(result.status).toBe(CAPITAL_STATUS.GOVERNANCE_AUTHORIZED);
  });

  it("refuses when the governing body has no authority over the entity", async () => {
    // The Tax Governance Committee governs LEN_BEYU_TZ_HOLDING. The BEYU
    // Foundation is a separate root entity, not beneath it.
    const [tax] = await db
      .select()
      .from(governanceBodies)
      .where(eq(governanceBodies.code, "TAX_GOVERNANCE_COMMITTEE"));
    expect(tax.legalEntityId).toBe("LEN_BEYU_TZ_HOLDING");

    // Build an APPROVED resolution for that body with ledger provenance by
    // deciding a GROUP_BOARD resolution, then repointing the body: the
    // provenance stays, only the governing entity changes.
    const r = await governedApprovedResolution();
    await db.update(resolutions).set({ bodyId: tax.id }).where(eq(resolutions.id, r.id));

    const cap = await makeCapitalRequest(r.id, { entityId: "LEN_BEYU_FOUNDATION_ORG" });
    await expect(
      authorizeCapitalRequestGovernance(await principalFor(CFO), { capitalRequestId: cap.id }, ctx),
    ).rejects.toMatchObject({ code: "GOVERNANCE_NOT_SATISFIED" });

    const [after] = await db.select().from(capitalRequests).where(eq(capitalRequests.id, cap.id));
    expect(after.status).toBe(CAPITAL_STATUS.SUBMITTED);
  });

  it("a cross-tenant caller cannot authorize, and cannot confirm existence", async () => {
    const r = await governedApprovedResolution();
    const cap = await makeCapitalRequest(r.id);

    const sector = await principalFor("SARA_LEMA");
    const real = await authorizeCapitalRequestGovernance(
      sector,
      { capitalRequestId: cap.id },
      ctx,
    ).catch((e) => e);
    const fake = await authorizeCapitalRequestGovernance(
      sector,
      { capitalRequestId: "CAP_CG_NOT_REAL" },
      ctx,
    ).catch((e) => e);

    expect(real.code).toBe(fake.code);
    expect(real.message).toBe(fake.message);

    const [after] = await db.select().from(capitalRequests).where(eq(capitalRequests.id, cap.id));
    expect(after.status).toBe(CAPITAL_STATUS.SUBMITTED);
  });

  it("an entity-scoped principal cannot authorize an out-of-scope entity", async () => {
    const r = await governedApprovedResolution();
    const cap = await makeCapitalRequest(r.id, { entityId: "LEN_BEYU_HEALTH_LTD" });

    const base = await principalFor(CFO);
    const scoped = { ...base, entityScope: ["LEN_BEYU_AGRI_LTD"] };
    await expect(
      authorizeCapitalRequestGovernance(scoped, { capitalRequestId: cap.id }, ctx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Correctly scoped, the same principal succeeds.
    const inScope = { ...base, entityScope: ["LEN_BEYU_HEALTH_LTD"] };
    const ok = await authorizeCapitalRequestGovernance(inScope, { capitalRequestId: cap.id }, ctx);
    expect(ok.status).toBe(CAPITAL_STATUS.GOVERNANCE_AUTHORIZED);
  });
});

/* ================================================================== *
 * §15  Security and state safety
 * ================================================================== */

describe("capital governance — authorization and state safety", () => {
  it("refuses a principal without finance:capital.manage", async () => {
    const r = await governedApprovedResolution();
    const cap = await makeCapitalRequest(r.id);

    // The auditor may read capital but not manage it.
    const auditor = await principalFor("PETER_OKELLO");
    expect(auditor.permissions.has("finance:capital.manage" as never)).toBe(false);

    await expect(
      authorizeCapitalRequestGovernance(auditor, { capitalRequestId: cap.id }, ctx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const [after] = await db.select().from(capitalRequests).where(eq(capitalRequests.id, cap.id));
    expect(after.status).toBe(CAPITAL_STATUS.SUBMITTED);
  });

  it("refuses to authorize twice", async () => {
    const r = await governedApprovedResolution();
    const cap = await makeCapitalRequest(r.id);
    const cfo = await principalFor(CFO);

    await authorizeCapitalRequestGovernance(cfo, { capitalRequestId: cap.id }, ctx);
    await expect(
      authorizeCapitalRequestGovernance(cfo, { capitalRequestId: cap.id }, ctx),
    ).rejects.toMatchObject({ code: "ALREADY_DECIDED" });

    // Exactly one event and one audit record exist.
    expect(
      (
        await db
          .select()
          .from(enterpriseEvents)
          .where(eq(enterpriseEvents.type, "CAPITAL_REQUEST_GOVERNANCE_AUTHORIZED"))
      ).length,
    ).toBe(1);
  });

  for (const status of ["DRAFT", "APPROVED", "REJECTED", "FUNDED"]) {
    it(`refuses to authorize a ${status} capital request`, async () => {
      const r = await governedApprovedResolution();
      const cap = await makeCapitalRequest(r.id, { status });
      await expect(
        authorizeCapitalRequestGovernance(
          await principalFor(CFO),
          { capitalRequestId: cap.id },
          ctx,
        ),
      ).rejects.toMatchObject({ code: "INVALID_CAPITAL_STATE" });

      const [after] = await db.select().from(capitalRequests).where(eq(capitalRequests.id, cap.id));
      expect(after.status).toBe(status);
    });
  }

  it("authorizes an UNDER_REVIEW request as well as a SUBMITTED one", async () => {
    const r = await governedApprovedResolution();
    const cap = await makeCapitalRequest(r.id, { status: CAPITAL_STATUS.UNDER_REVIEW });
    const result = await authorizeCapitalRequestGovernance(
      await principalFor(CFO),
      { capitalRequestId: cap.id },
      ctx,
    );
    expect(result.previousStatus).toBe(CAPITAL_STATUS.UNDER_REVIEW);
    expect(result.status).toBe(CAPITAL_STATUS.GOVERNANCE_AUTHORIZED);
  });
});

/* ================================================================== *
 * §9  Atomicity, §17 no execution
 * ================================================================== */

describe("capital governance — atomicity, audit and non-execution", () => {
  it("persists the status, audit record and durable event together", async () => {
    const r = await governedApprovedResolution();
    const cap = await makeCapitalRequest(r.id);
    const result = await authorizeCapitalRequestGovernance(
      await principalFor(CFO),
      { capitalRequestId: cap.id, note: "Board authority confirmed." },
      ctx,
    );

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.objectId, cap.id),
          eq(auditLog.action, "finance.capital.governance_authorize"),
        ),
      );
    expect(entry.outcome).toBe("SUCCESS");
    expect((entry.oldValue as Record<string, unknown>).status).toBe(CAPITAL_STATUS.SUBMITTED);
    expect((entry.newValue as Record<string, unknown>).status).toBe(
      CAPITAL_STATUS.GOVERNANCE_AUTHORIZED,
    );
    // The governing resolution is recorded as the approval reference.
    expect(entry.approvalRef).toBe(r.id);
    expect((entry.newValue as Record<string, unknown>).executed).toBe(false);
    expect((entry.newValue as Record<string, unknown>).note).toBe("Board authority confirmed.");

    const [event] = await db
      .select()
      .from(enterpriseEvents)
      .where(eq(enterpriseEvents.type, "CAPITAL_REQUEST_GOVERNANCE_AUTHORIZED"));
    const payload = event.payload as Record<string, unknown>;
    expect(event.subjectId).toBe(cap.id);
    expect(payload.resolutionId).toBe(r.id);
    expect(payload.status).toBe(CAPITAL_STATUS.GOVERNANCE_AUTHORIZED);
    expect(payload.executed).toBe(false);
    expect(payload.decidedBy).toBe(result.decidedBy);

    expect((await verifyAuditChain()).verified).toBe(true);
  });

  it("rolls back the status, audit and event when event persistence fails", async () => {
    const r = await governedApprovedResolution();
    const cap = await makeCapitalRequest(r.id);

    const before = {
      status: (await db.select().from(capitalRequests).where(eq(capitalRequests.id, cap.id)))[0].status,
      audits: (await verifyAuditChain()).records,
      events: (await db.select().from(enterpriseEvents)).length,
      resolution: (await db.select().from(resolutions).where(eq(resolutions.id, r.id)))[0],
    };

    await db.execute(sql`
      create or replace function beyu_test_block_capital_event() returns trigger as $$
      begin
        if new.type = 'CAPITAL_REQUEST_GOVERNANCE_AUTHORIZED' then
          raise exception 'injected capital event persistence failure';
        end if;
        return new;
      end;
      $$ language plpgsql;
      create trigger beyu_test_block_capital_event
        before insert on enterprise_events
        for each row execute function beyu_test_block_capital_event();
    `);

    try {
      await expect(
        authorizeCapitalRequestGovernance(
          await principalFor(CFO),
          { capitalRequestId: cap.id },
          ctx,
        ),
      ).rejects.toThrow(/enterprise_events|injected capital event persistence failure/);
    } finally {
      await db.execute(sql`drop trigger if exists beyu_test_block_capital_event on enterprise_events`);
      await db.execute(sql`drop function if exists beyu_test_block_capital_event()`);
    }

    const after = {
      status: (await db.select().from(capitalRequests).where(eq(capitalRequests.id, cap.id)))[0].status,
      audits: (await verifyAuditChain()).records,
      events: (await db.select().from(enterpriseEvents)).length,
      resolution: (await db.select().from(resolutions).where(eq(resolutions.id, r.id)))[0],
    };

    // Nothing moved.
    expect(after.status).toBe(before.status);
    expect(after.status).toBe(CAPITAL_STATUS.SUBMITTED);
    expect(after.audits).toBe(before.audits);
    expect(after.events).toBe(before.events);
    // The governance resolution is untouched by a failed downstream consumer.
    expect(after.resolution.status).toBe(before.resolution.status);
    expect(after.resolution.decisionDate?.toISOString()).toBe(
      before.resolution.decisionDate?.toISOString(),
    );
    expect((await verifyAuditChain()).verified).toBe(true);

    // Still authorizable afterwards: no partial state was left behind.
    const retry = await authorizeCapitalRequestGovernance(
      await principalFor(CFO),
      { capitalRequestId: cap.id },
      ctx,
    );
    expect(retry.status).toBe(CAPITAL_STATUS.GOVERNANCE_AUTHORIZED);
  });

  it("concurrent authorization attempts produce exactly one transition", async () => {
    const r = await governedApprovedResolution();
    const cap = await makeCapitalRequest(r.id);
    const cfo = await principalFor(CFO);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        authorizeCapitalRequestGovernance(cfo, { capitalRequestId: cap.id }, ctx),
      ),
    );
    expect(results.filter((x) => x.status === "fulfilled").length).toBe(1);

    expect(
      (
        await db
          .select()
          .from(enterpriseEvents)
          .where(eq(enterpriseEvents.type, "CAPITAL_REQUEST_GOVERNANCE_AUTHORIZED"))
      ).length,
    ).toBe(1);
    const audits = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.objectId, cap.id),
          eq(auditLog.action, "finance.capital.governance_authorize"),
        ),
      );
    expect(audits.filter((a) => a.outcome === "SUCCESS").length).toBe(1);
    expect((await verifyAuditChain()).verified).toBe(true);
  });

  it("§17 executes NOTHING: no ledger, journal, treasury or balance effect", async () => {
    const ledgerBefore = await db.execute<{ n: number }>(
      sql`select count(*)::int n from journal_entries`,
    );
    const treasuryBefore = await db.execute<{ n: number; total: string | null }>(
      sql`select count(*)::int n, coalesce(sum(base_currency_balance),0)::text total from treasury_positions`,
    );

    const r = await governedApprovedResolution();
    const cap = await makeCapitalRequest(r.id, { amount: "1800000.00" });
    const result = await authorizeCapitalRequestGovernance(
      await principalFor(CFO),
      { capitalRequestId: cap.id },
      ctx,
    );
    expect(result.status).toBe(CAPITAL_STATUS.GOVERNANCE_AUTHORIZED);
    expect(result.executed).toBe(false);

    const ledgerAfter = await db.execute<{ n: number }>(
      sql`select count(*)::int n from journal_entries`,
    );
    const treasuryAfter = await db.execute<{ n: number; total: string | null }>(
      sql`select count(*)::int n, coalesce(sum(base_currency_balance),0)::text total from treasury_positions`,
    );

    // No journal entry was posted.
    expect(ledgerAfter.rows[0].n).toBe(ledgerBefore.rows[0].n);
    // No treasury position was created and no balance changed.
    expect(treasuryAfter.rows[0].n).toBe(treasuryBefore.rows[0].n);
    expect(treasuryAfter.rows[0].total).toBe(treasuryBefore.rows[0].total);

    // The request is NOT approved, NOT funded, and carries no decision date.
    const [after] = await db.select().from(capitalRequests).where(eq(capitalRequests.id, cap.id));
    expect(after.status).not.toBe(CAPITAL_STATUS.APPROVED);
    expect(after.status).not.toBe(CAPITAL_STATUS.FUNDED);
    expect(after.decisionDate).toBeNull();

    // The only event emitted is the governance-prerequisite event.
    const events = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, cap.id));
    expect(events.map((e) => e.type)).toEqual(["CAPITAL_REQUEST_GOVERNANCE_AUTHORIZED"]);
  });

  it("does not mutate the governing resolution", async () => {
    const r = await governedApprovedResolution();
    const before = (await db.select().from(resolutions).where(eq(resolutions.id, r.id)))[0];
    const cap = await makeCapitalRequest(r.id);

    await authorizeCapitalRequestGovernance(await principalFor(CFO), { capitalRequestId: cap.id }, ctx);

    const after = (await db.select().from(resolutions).where(eq(resolutions.id, r.id)))[0];
    expect(after.status).toBe(before.status);
    expect(after.decidedByMemberId).toBe(before.decidedByMemberId);
    expect(after.decisionDate?.toISOString()).toBe(before.decisionDate?.toISOString());
    expect(after.votesFor).toBe(before.votesFor);
  });
});
