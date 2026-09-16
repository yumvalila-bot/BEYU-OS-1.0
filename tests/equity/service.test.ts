/**
 * FOUNDER EQUITY / CAP TABLE / ESOP — governed-service integration tests.
 *
 * Real services, real PostgreSQL, real RBAC/ABAC/policy/tenant-scope/audit —
 * no mocks (X10THINK §7–§14, §48, §52, §54).
 *
 * Governing properties under test:
 *   - issuance requires an APPROVED governance resolution in scope (§16);
 *   - vesting activation requires a recorded HUMAN legal-review closure — the
 *     software refuses to fabricate it (§48);
 *   - the vesting runner is one-event-per-milestone and idempotent (§52);
 *   - double-trigger acceleration needs a CONFIRMED CoC AND a CONFIRMED
 *     qualifying termination (§12);
 *   - leaver classification refuses mismatched/arbitrary conditions (§10) and
 *     execution never moves money: finance_record_ref stays null (§22);
 *   - ESOP grants need approval evidence (no evidence = not proven), pool
 *     capacity is enforced, exercise is limited to vested options;
 *   - cap-table snapshots are deterministic and reconstructable (§13);
 *   - dilution scenarios are stored analysis with execution_prohibited (§14);
 *   - DENY is final: wrong permission, wrong tenant and wrong entity scope all
 *     refuse, and the audit chain still verifies afterwards (§55).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import {
  auditLog,
  changeOfControlEvents,
  dilutionScenarios,
  equityPositions,
  esopGrantEvents,
  esopGrants,
  esopPlans,
  governanceBodies,
  leaverCases,
  resolutions,
  shareClasses,
  tenants,
  users,
  vestingEvents,
  vestingSchedules,
} from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "../../src/lib/authz";
import { verifyAuditChain } from "../../src/lib/audit";
import { EquityError } from "../../src/lib/equity/errors";
import {
  activateEsopPlan,
  activateVestingSchedule,
  applyAcceleration,
  approveEsopGrant,
  approveLeaverCase,
  classifyLeaverCase,
  computeCapTableSnapshot,
  confirmChangeOfControl,
  createDilutionScenario,
  createEsopGrant,
  createEsopPlan,
  createShareClass,
  declareChangeOfControl,
  executeLeaverCase,
  exerciseEsopGrant,
  initiateLeaverCase,
  issueEquityPosition,
  readCapTable,
  runGrantVestingTo,
  runVestingTo,
} from "../../src/lib/equity/service";

const HOLDINGS = fixedId(ID_PREFIX.legalEntity, "BEYU_HOLDINGS");
const HEALTH = fixedId(ID_PREFIX.legalEntity, "BEYU_HEALTH_LTD");
const BOARD = fixedId(ID_PREFIX.body, "GROUP_BOARD");
const RUN = Math.random().toString(36).slice(2, 8).toUpperCase();
const ctx = { traceId: `EQ_TEST_${RUN}`, ipAddress: "127.0.0.1", userAgent: "vitest" };

const CFO = "DAUDI_MOSHI"; // GROUP_CFO — full equity authority
const CEO = "AMANI_BEYU"; // GROUP_CEO — leaver.manage + reads, NO cap-table.manage
const SECTOR = "SARA_LEMA"; // SECTOR_OPERATOR in the health tenant — out of scope

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

/** A resolution placed directly in a given state (probe fixture, as in capital-governance). */
async function seededResolution(status: string) {
  const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, BOARD));
  const id = `RES_EQ_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const now = new Date();
  const terminal = ["APPROVED", "REJECTED", "DEADLOCKED", "DEFERRED"].includes(status);
  await db.insert(resolutions).values({
    id,
    tenantId: body.tenantId,
    bodyId: BOARD,
    reference: `${body.code}-4444-${Math.floor(Math.random() * 900 + 100)}`,
    title: "Equity governance probe",
    category: "CAPITAL",
    summary: "Equity governance probe summary long enough for the contract.",
    rationale: "Equity governance probe rationale long enough for the contract.",
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
  } as never);
  return id;
}

async function expectEquityError(code: string, fn: () => Promise<unknown>): Promise<EquityError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(EquityError);
    expect((err as EquityError).code).toBe(code);
    return err as EquityError;
  }
  throw new Error(`expected EquityError(${code}) but the call succeeded`);
}

let cfo: Principal;
let ceo: Principal;
let sector: Principal;
let approvedRes: string;
let tabledRes: string;

// State carried across the sequential lifecycle describes:
let shareClassId: string;
const CLASS_CODE = `ORD-${RUN}`;
let founderPosId: string; // accelerated via double trigger
let founderSchedId: string;
let leaverPosId: string; // forfeited via a good-leaver death case
let leaverSchedId: string;
let planId: string;
let grantId: string;

beforeAll(async () => {
  cfo = await principalFor(CFO);
  ceo = await principalFor(CEO);
  sector = await principalFor(SECTOR);
  approvedRes = await seededResolution("APPROVED");
  tabledRes = await seededResolution("TABLED");
});

/**
 * Leave no residue: every probe row this suite creates is removed (FK order).
 * The audit/event ledgers are append-only and stay untouched — the hash chain
 * remains valid after business-row cleanup.
 */
afterAll(async () => {
  const positions = sql`select id from equity_positions where share_class_id in (select id from share_classes where code = ${CLASS_CODE})`;
  const plans = sql`select id from esop_plans where plan_name like ${`%${RUN}%`}`;
  await db.execute(sql`delete from esop_grant_events where grant_id in (select id from esop_grants where plan_id in (${plans}))`);
  await db.execute(sql`delete from esop_grants where plan_id in (${plans})`);
  await db.execute(sql`delete from esop_plans where id in (${plans})`);
  await db.execute(sql`delete from leaver_cases where position_id in (${positions})`);
  await db.execute(sql`delete from vesting_events where position_id in (${positions})`);
  await db.execute(sql`delete from vesting_schedules where position_id in (${positions})`);
  await db.execute(sql`delete from change_of_control_events where description like ${`%${RUN}%`}`);
  await db.execute(sql`delete from cap_table_snapshots where legal_entity_id = ${HOLDINGS} and as_of_date = '2026-06-01'`);
  await db.execute(sql`delete from dilution_scenarios where name like ${`%${RUN}%`}`);
  await db.execute(sql`delete from equity_positions where id in (${positions})`);
  await db.execute(sql`delete from share_classes where code = ${CLASS_CODE}`);
  await db.execute(sql`delete from resolutions where id like 'RES_EQ_%'`);
});

describe("§13 — share classes and issuance are governance-authorized", () => {
  it("creates a share class (ACTIVE, zero issued)", async () => {
    const sc = await createShareClass(
      cfo,
      { legalEntityId: HOLDINGS, code: CLASS_CODE, name: `Ordinary ${RUN}`, authorizedShares: 10_000_000, votesPerShare: "1" },
      ctx,
    );
    shareClassId = sc.id;
    expect(sc.id.startsWith(ID_PREFIX.shareClass)).toBe(true);
    const [row] = await db.select().from(shareClasses).where(eq(shareClasses.id, sc.id));
    expect(row.status).toBe("ACTIVE");
    expect(row.issuedShares).toBe(0);
  });

  it("refuses a duplicate class code for the entity (CONFLICT)", async () => {
    await expectEquityError("CONFLICT", () =>
      createShareClass(cfo, { legalEntityId: HOLDINGS, code: CLASS_CODE, name: "Dup", authorizedShares: 1 }, ctx),
    );
  });

  it("refuses a negative authorized share count (RULE_VIOLATION)", async () => {
    await expectEquityError("RULE_VIOLATION", () =>
      createShareClass(cfo, { legalEntityId: HOLDINGS, code: `NEG-${RUN}`, name: "Neg", authorizedShares: -5 }, ctx),
    );
  });

  it("DENIES issuance to a principal WITHOUT equity:cap-table.manage (CEO) — DENY is final", async () => {
    expect(ceo.permissions).not.toContain("equity:cap-table.manage");
    await expectEquityError("FORBIDDEN", () =>
      createShareClass(ceo, { legalEntityId: HOLDINGS, code: `CEO-${RUN}`, name: "No", authorizedShares: 1 }, ctx),
    );
  });

  it("DENIES cross-tenant access: a sector operator cannot touch group-tenant capitalization", async () => {
    await expectEquityError("NOT_FOUND", () =>
      createShareClass(sector, { legalEntityId: HOLDINGS, code: `SEC-${RUN}`, name: "No", authorizedShares: 1 }, ctx),
    );
    await expectEquityError("NOT_FOUND", () => readCapTable(sector, { legalEntityId: HOLDINGS }));
  });

  it("DENIES the group CFO on an entity outside the group tenant (cross-tenant ABAC DENY)", async () => {
    // The group CFO's enterprise scope can *see* the entity exists, but ABAC
    // denies capitalization reads on another tenant's entity — DENY is final.
    await expectEquityError("FORBIDDEN", () => readCapTable(cfo, { legalEntityId: HEALTH }));
  });

  it("refuses issuance citing a missing resolution (authority is never client-claimed)", async () => {
    await expectEquityError("NOT_FOUND", () =>
      issueEquityPosition(
        cfo,
        {
          legalEntityId: HOLDINGS, shareClassId, holderType: "FOUNDER", holderName: "Ghost Founder",
          totalShares: 100, effectiveFrom: "2024-01-01", provenance: "probe", resolutionRef: "RES_DOES_NOT_EXIST",
        },
        ctx,
      ),
    );
  });

  it("refuses issuance citing a non-APPROVED resolution (GOVERNANCE_NOT_SATISFIED)", async () => {
    await expectEquityError("GOVERNANCE_NOT_SATISFIED", () =>
      issueEquityPosition(
        cfo,
        {
          legalEntityId: HOLDINGS, shareClassId, holderType: "FOUNDER", holderName: "Ghost Founder",
          totalShares: 100, effectiveFrom: "2024-01-01", provenance: "probe", resolutionRef: tabledRes,
        },
        ctx,
      ),
    );
  });

  it("refuses issuance beyond the authorized capacity of the class", async () => {
    await expectEquityError("RULE_VIOLATION", () =>
      issueEquityPosition(
        cfo,
        {
          legalEntityId: HOLDINGS, shareClassId, holderType: "FOUNDER", holderName: "Whale",
          totalShares: 10_000_001, effectiveFrom: "2024-01-01", provenance: "probe", resolutionRef: approvedRes,
        },
        ctx,
      ),
    );
  });

  it("refuses vesting terms on TREASURY positions", async () => {
    await expectEquityError("RULE_VIOLATION", () =>
      issueEquityPosition(
        cfo,
        {
          legalEntityId: HOLDINGS, shareClassId, holderType: "TREASURY", holderName: "Treasury",
          totalShares: 10, effectiveFrom: "2024-01-01", provenance: "probe", resolutionRef: approvedRes,
          vesting: { vestingMonths: 48, cliffMonths: 12, startDate: "2024-01-01" },
        },
        ctx,
      ),
    );
  });

  it("issues a founder position with the default 48/12/monthly schedule in DRAFT + REQUIRES_LEGAL_REVIEW", async () => {
    const pos = await issueEquityPosition(
      cfo,
      {
        legalEntityId: HOLDINGS,
        shareClassId,
        holderType: "FOUNDER",
        holderPartyId: fixedId(ID_PREFIX.party, "AMANI_BEYU"),
        holderName: "Founder A (probe)",
        totalShares: 1_000_000,
        effectiveFrom: "2024-01-01",
        provenance: `Founders agreement probe ${RUN}`,
        resolutionRef: approvedRes,
        vesting: { vestingMonths: 48, cliffMonths: 12, frequency: "MONTHLY", startDate: "2024-01-01" },
      },
      ctx,
    );
    founderPosId = pos.id;
    founderSchedId = pos.vestingScheduleId!;
    expect(pos.status).toBe("ACTIVE");
    expect(pos.vestedShares).toBe(0);
    expect(pos.unvestedShares).toBe(1_000_000);
    expect(founderSchedId).toBeTruthy();

    const [sched] = await db.select().from(vestingSchedules).where(eq(vestingSchedules.id, founderSchedId));
    expect(sched.status).toBe("DRAFT");
    expect(sched.legalReviewStatus).toBe("REQUIRES_LEGAL_REVIEW");
    expect(sched.accelerationPolicy).toBe("DOUBLE_TRIGGER"); // default, §12
    expect(sched.cliffDate).toBe("2025-01-01");
    expect(sched.endDate).toBe("2028-01-01");

    const [sc] = await db.select().from(shareClasses).where(eq(shareClasses.id, shareClassId));
    expect(sc.issuedShares).toBe(1_000_000);
  });

  it("issues a second founder position (the future leaver case)", async () => {
    const pos = await issueEquityPosition(
      cfo,
      {
        legalEntityId: HOLDINGS,
        shareClassId,
        holderType: "FOUNDER",
        holderPartyId: fixedId(ID_PREFIX.party, "NEEMA_BEYU"),
        holderName: "Founder B (probe)",
        totalShares: 1_000_000,
        effectiveFrom: "2024-01-01",
        provenance: `Founders agreement probe ${RUN}`,
        resolutionRef: approvedRes,
        vesting: { vestingMonths: 48, cliffMonths: 12, frequency: "MONTHLY", startDate: "2024-01-01" },
      },
      ctx,
    );
    leaverPosId = pos.id;
    leaverSchedId = pos.vestingScheduleId!;
    expect(leaverSchedId).toBeTruthy();
  });
});

describe("§9 — vesting activation requires a human legal-review closure; the runner is idempotent", () => {
  it("refuses to run a DRAFT schedule (INVALID_STATE)", async () => {
    await expectEquityError("INVALID_STATE", () => runVestingTo(cfo, { scheduleId: leaverSchedId, asOf: "2025-01-01" }, ctx));
  });

  it("refuses activation when legal review is not closed — software cannot fabricate the closure (§48)", async () => {
    await expectEquityError("LEGAL_REVIEW_REQUIRED", () =>
      activateVestingSchedule(cfo, { scheduleId: founderSchedId, approvedByResolutionId: approvedRes, legalReviewStatus: "PENDING" }, ctx),
    );
    await expectEquityError("LEGAL_REVIEW_REQUIRED", () =>
      activateVestingSchedule(cfo, { scheduleId: founderSchedId, approvedByResolutionId: approvedRes, legalReviewStatus: "AI_APPROVED" }, ctx),
    );
  });

  it("refuses activation citing a non-APPROVED resolution", async () => {
    await expectEquityError("GOVERNANCE_NOT_SATISFIED", () =>
      activateVestingSchedule(cfo, { scheduleId: founderSchedId, approvedByResolutionId: tabledRes, legalReviewStatus: "LEGAL_REVIEW_CLOSED" }, ctx),
    );
  });

  it("DENIES activation to a principal without equity:vesting.manage (CEO)", async () => {
    expect(ceo.permissions).not.toContain("equity:vesting.manage");
    await expectEquityError("FORBIDDEN", () =>
      activateVestingSchedule(ceo, { scheduleId: founderSchedId, approvedByResolutionId: approvedRes, legalReviewStatus: "LEGAL_REVIEW_CLOSED" }, ctx),
    );
  });

  it("activates with closure + APPROVED resolution, then runs nothing before the cliff", async () => {
    const active = await activateVestingSchedule(cfo, { scheduleId: founderSchedId, approvedByResolutionId: approvedRes, legalReviewStatus: "LEGAL_REVIEW_CLOSED" }, ctx);
    expect(active.status).toBe("ACTIVE");

    const before = await runVestingTo(cfo, { scheduleId: founderSchedId, asOf: "2024-11-30" }, ctx);
    expect(before.vestedShares).toBe(0);
    expect(before.milestones).toEqual([]);
  });

  it("refuses to activate twice (INVALID_STATE)", async () => {
    await expectEquityError("INVALID_STATE", () =>
      activateVestingSchedule(cfo, { scheduleId: founderSchedId, approvedByResolutionId: approvedRes, legalReviewStatus: "LEGAL_REVIEW_CLOSED" }, ctx),
    );
  });

  it("runs to the cliff: exactly one ledger event, 250,000 vested, position updated", async () => {
    const run = await runVestingTo(cfo, { scheduleId: founderSchedId, asOf: "2025-01-01" }, ctx);
    expect(run.vestedShares).toBe(250_000);
    expect(run.unvestedShares).toBe(750_000);
    expect(run.milestones).toHaveLength(1);
    expect(run.milestones[0]).toMatchObject({ date: "2025-01-01", vestedShares: 250_000, cumulativeVestedShares: 250_000 });

    const [pos] = await db.select().from(equityPositions).where(eq(equityPositions.id, founderPosId));
    expect(pos.vestedShares).toBe(250_000);
    const events = await db.select().from(vestingEvents).where(eq(vestingEvents.scheduleId, founderSchedId));
    expect(events.filter((e) => e.eventType === "MILESTONE_VESTED")).toHaveLength(1);
  });

  it("is idempotent: a second run to the same date appends NOTHING (§52)", async () => {
    const again = await runVestingTo(cfo, { scheduleId: founderSchedId, asOf: "2025-01-01" }, ctx);
    expect(again.milestones).toEqual([]);
    const events = await db.select().from(vestingEvents).where(
      and(eq(vestingEvents.scheduleId, founderSchedId), eq(vestingEvents.eventType, "MILESTONE_VESTED")),
    );
    expect(events).toHaveLength(1);
  });

  it("runs forward milestone-by-milestone (never a lump): 13 more monthly events to 2026-02-01", async () => {
    const run = await runVestingTo(cfo, { scheduleId: founderSchedId, asOf: "2026-02-01" }, ctx);
    expect(run.milestones).toHaveLength(13);
    expect(run.vestedShares).toBe(Math.floor((1_000_000 * 25) / 48));
    const events = await db.select().from(vestingEvents).where(
      and(eq(vestingEvents.scheduleId, founderSchedId), eq(vestingEvents.eventType, "MILESTONE_VESTED")),
    );
    expect(events).toHaveLength(14);
  });
});

describe("§12 — double-trigger change-of-control acceleration", () => {
  let cocId: string;
  let qtId: string;

  it("declares a change of control (DECLARED, not yet authority)", async () => {
    const coc = await declareChangeOfControl(
      cfo,
      { legalEntityId: HOLDINGS, eventType: "CHANGE_OF_CONTROL", description: `Acquisition probe ${RUN}`, occurredOn: "2026-03-01" },
      ctx,
    );
    cocId = coc.id;
    expect(coc.status).toBe("DECLARED");
  });

  it("refuses a QUALIFYING_TERMINATION that does not link its CoC (double trigger by construction)", async () => {
    await expectEquityError("RULE_VIOLATION", () =>
      declareChangeOfControl(
        cfo,
        { legalEntityId: HOLDINGS, eventType: "QUALIFYING_TERMINATION", description: "Unlinked", occurredOn: "2026-03-15" },
        ctx,
      ),
    );
  });

  it("refuses acceleration while the CoC is only DECLARED (GOVERNANCE_NOT_SATISFIED)", async () => {
    await expectEquityError("GOVERNANCE_NOT_SATISFIED", () =>
      applyAcceleration(cfo, { scheduleId: founderSchedId, changeOfControlId: cocId }, ctx),
    );
  });

  it("refuses CoC confirmation without a human legal-review closure (§48)", async () => {
    await expectEquityError("LEGAL_REVIEW_REQUIRED", () =>
      confirmChangeOfControl(cfo, { eventId: cocId, legalReviewStatus: "PENDING", resolutionRef: approvedRes }, ctx),
    );
  });

  it("confirms the CoC, then still refuses acceleration with NO qualifying termination (double trigger default)", async () => {
    const confirmed = await confirmChangeOfControl(cfo, { eventId: cocId, legalReviewStatus: "LEGAL_REVIEW_CLOSED", resolutionRef: approvedRes }, ctx);
    expect(confirmed.status).toBe("CONFIRMED");
    await expectEquityError("GOVERNANCE_NOT_SATISFIED", () =>
      applyAcceleration(cfo, { scheduleId: founderSchedId, changeOfControlId: cocId }, ctx),
    );
  });

  it("declares + confirms the linked qualifying termination, then accelerates 100% of unvested", async () => {
    const qt = await declareChangeOfControl(
      cfo,
      { legalEntityId: HOLDINGS, eventType: "QUALIFYING_TERMINATION", description: `Founder terminated without cause ${RUN}`, occurredOn: "2026-03-15", linkedEventId: cocId },
      ctx,
    );
    qtId = qt.id;
    await confirmChangeOfControl(cfo, { eventId: qtId, legalReviewStatus: "LEGAL_REVIEW_CLOSED", resolutionRef: approvedRes }, ctx);

    const before = await db.select().from(equityPositions).where(eq(equityPositions.id, founderPosId));
    const out = await applyAcceleration(cfo, { scheduleId: founderSchedId, changeOfControlId: cocId, qualifyingTerminationId: qtId }, ctx);
    expect(out.acceleratedShares).toBe(before[0].unvestedShares);

    const [pos] = await db.select().from(equityPositions).where(eq(equityPositions.id, founderPosId));
    expect(pos.vestedShares).toBe(1_000_000);
    expect(pos.unvestedShares).toBe(0);
    expect(pos.status).toBe("FULLY_VESTED");

    const accelEvents = await db.select().from(vestingEvents).where(
      and(eq(vestingEvents.scheduleId, founderSchedId), eq(vestingEvents.eventType, "ACCELERATION_APPLIED")),
    );
    expect(accelEvents).toHaveLength(1);
    expect(accelEvents[0].changeOfControlId).toBe(cocId);

    const [cocRow] = await db.select().from(changeOfControlEvents).where(eq(changeOfControlEvents.id, cocId));
    expect(cocRow.status).toBe("CONFIRMED");
  });

  it("refuses a second acceleration once the schedule has completed", async () => {
    await expectEquityError("INVALID_STATE", () =>
      applyAcceleration(cfo, { scheduleId: founderSchedId, changeOfControlId: cocId, qualifyingTerminationId: qtId }, ctx),
    );
  });
});

describe("§10 — good/bad leaver lifecycle: no arbitrary forfeiture, no money movement", () => {
  let caseId: string;

  beforeAll(async () => {
    // Bring the leaver position to 250k vested / 750k unvested (post-cliff).
    await activateVestingSchedule(cfo, { scheduleId: leaverSchedId, approvedByResolutionId: approvedRes, legalReviewStatus: "LEGAL_REVIEW_CLOSED" }, ctx);
    await runVestingTo(cfo, { scheduleId: leaverSchedId, asOf: "2025-01-01" }, ctx);
  });

  it("refuses an arbitrary condition code at initiation (MODEL_ERROR / INVALID_CONDITION)", async () => {
    await expectEquityError("MODEL_ERROR", () =>
      initiateLeaverCase(ceo, { positionId: leaverPosId, conditionCode: "FELL_OUT_OF_FAVOUR" }, ctx),
    );
  });

  it("initiates an UNDETERMINED case on a narrow good-leaver condition (DEATH)", async () => {
    // Role separation: the CFO holds equity:leaver.READ but NOT leaver.manage.
    await expectEquityError("FORBIDDEN", () => initiateLeaverCase(cfo, { positionId: leaverPosId, conditionCode: "DEATH" }, ctx));

    const c = await initiateLeaverCase(
      ceo,
      { positionId: leaverPosId, conditionCode: "DEATH", conditionEvidence: { certificateRef: `DOC-${RUN}` }, documentRefs: [`DOC-${RUN}`] },
      ctx,
    );
    caseId = c.id;
    expect(c.status).toBe("INITIATED");
    expect(c.caseType).toBe("UNDETERMINED");
  });

  it("refuses a duplicate open case for the same position (CONFLICT)", async () => {
    await expectEquityError("CONFLICT", () => initiateLeaverCase(ceo, { positionId: leaverPosId, conditionCode: "DISABILITY" }, ctx));
  });

  it("refuses a BAD_LEAVER classification of a GOOD condition (mismatch, §10)", async () => {
    await expectEquityError("MODEL_ERROR", () =>
      classifyLeaverCase(ceo, { caseId, caseType: "BAD_LEAVER", legalReviewStatus: "LEGAL_REVIEW_CLOSED" }, ctx),
    );
  });

  it("refuses classification without a human legal-review closure (§48)", async () => {
    await expectEquityError("LEGAL_REVIEW_REQUIRED", () =>
      classifyLeaverCase(ceo, { caseId, caseType: "GOOD_LEAVER", legalReviewStatus: "PENDING" }, ctx),
    );
  });

  it("classifies GOOD_LEAVER: vested retained, unvested forfeited, REQUIRES_LEGAL_REVIEW recorded", async () => {
    const c = await classifyLeaverCase(ceo, { caseId, caseType: "GOOD_LEAVER", legalReviewStatus: "LEGAL_REVIEW_CLOSED" }, ctx);
    expect(c.status).toBe("CLASSIFIED");
    expect(c.retainedShares).toBe(250_000);
    expect(c.forfeitedShares).toBe(750_000);
    expect(c.repurchaseShares).toBe(0);

    const [row] = await db.select().from(leaverCases).where(eq(leaverCases.id, caseId));
    expect(row.legalReviewStatus).toBe("LEGAL_REVIEW_CLOSED");
    expect(row.treatment).toMatchObject({ vested: "RETAIN", unvested: "FORFEIT" });
  });

  it("refuses execution before governance approval (INVALID_STATE)", async () => {
    await expectEquityError("INVALID_STATE", () => executeLeaverCase(ceo, { caseId }, ctx));
  });

  it("refuses approval citing a non-APPROVED resolution", async () => {
    await expectEquityError("GOVERNANCE_NOT_SATISFIED", () => approveLeaverCase(ceo, { caseId, resolutionRef: tabledRes }, ctx));
  });

  it("approves with an APPROVED resolution and executes: position closed, schedule cancelled, shares cancelled", async () => {
    const approved = await approveLeaverCase(ceo, { caseId, resolutionRef: approvedRes, approvalRef: `BOARD-${RUN}` }, ctx);
    expect(approved.status).toBe("APPROVED");

    const executed = await executeLeaverCase(ceo, { caseId }, ctx);
    expect(executed.status).toBe("EXECUTED");
    expect(executed.forfeitedShares).toBe(750_000);

    const [pos] = await db.select().from(equityPositions).where(eq(equityPositions.id, leaverPosId));
    // GOOD leaver: unvested forfeited, VESTED SHARES RETAINED — the position
    // stays open at 250,000 fully vested (software never strips vested ownership).
    expect(pos.status).toBe("FULLY_VESTED");
    expect(pos.totalShares).toBe(250_000);
    expect(pos.vestedShares).toBe(250_000);
    expect(pos.unvestedShares).toBe(0);
    expect(pos.effectiveTo).toBeNull();

    const [sched] = await db.select().from(vestingSchedules).where(eq(vestingSchedules.id, leaverSchedId));
    expect(sched.status).toBe("CANCELLED");

    const forfeitEvents = await db.select().from(vestingEvents).where(
      and(eq(vestingEvents.scheduleId, leaverSchedId), eq(vestingEvents.eventType, "FORFEITURE")),
    );
    expect(forfeitEvents).toHaveLength(1);

    // The class loses the cancelled shares; execution NEVER moves money:
    const [sc] = await db.select().from(shareClasses).where(eq(shareClasses.id, shareClassId));
    expect(sc.issuedShares).toBe(2_000_000 - 750_000);
    const [caseRow] = await db.select().from(leaverCases).where(eq(leaverCases.id, caseId));
    expect(caseRow.financeRecordRef).toBeNull(); // CAP_POSTING untouched (§22)
    expect(caseRow.paymentStatus).toBe("NOT_DUE"); // no repurchase → nothing payable
  });

  it("refuses a leaver case on a POOL position (RULE_VIOLATION)", async () => {
    const pool = await issueEquityPosition(
      cfo,
      {
        legalEntityId: HOLDINGS, shareClassId, holderType: "ESOP_POOL", holderName: `ESOP reserve ${RUN}`,
        totalShares: 500_000, effectiveFrom: "2025-06-01", provenance: "ESOP pool reserve", resolutionRef: approvedRes,
      },
      ctx,
    );
    await expectEquityError("RULE_VIOLATION", () => initiateLeaverCase(ceo, { positionId: pool.id, conditionCode: "DISABILITY" }, ctx));
  });
});

describe("§11 — ESOP: pool capacity, approval evidence, vesting from the ledger, exercise limits", () => {
  it("creates a plan in DRAFT; refuses grants before activation", async () => {
    const plan = await createEsopPlan(
      cfo,
      {
        legalEntityId: HOLDINGS,
        planName: `BEYU ESOP ${RUN}`,
        jurisdictionCode: "AE",
        poolSharesAuthorized: 500_000,
        defaultVesting: { vestingMonths: 48, cliffMonths: 12, frequency: "MONTHLY" },
      },
      ctx,
    );
    planId = plan.id;
    expect(plan.status).toBe("DRAFT");

    await expectEquityError("INVALID_STATE", () =>
      createEsopGrant(
        cfo,
        { planId, granteePartyId: fixedId(ID_PREFIX.party, "ASHA_NDULU"), shareClassId, optionShares: 1000, exercisePricePerShare: "0.10", currency: "USD", grantDate: "2025-06-01" },
        ctx,
      ),
    );
  });

  it("refuses activation without legal-review closure; activates with closure + APPROVED resolution", async () => {
    await expectEquityError("LEGAL_REVIEW_REQUIRED", () =>
      activateEsopPlan(cfo, { planId, approvedByResolutionId: approvedRes, legalReviewStatus: "PENDING" }, ctx),
    );
    const active = await activateEsopPlan(cfo, { planId, approvedByResolutionId: approvedRes, legalReviewStatus: "LEGAL_REVIEW_CLOSED" }, ctx);
    expect(active.status).toBe("ACTIVE");
  });

  it("refuses a grant that would exceed the authorized pool (RULE_VIOLATION)", async () => {
    await expectEquityError("RULE_VIOLATION", () =>
      createEsopGrant(
        cfo,
        { planId, granteePartyId: fixedId(ID_PREFIX.party, "ASHA_NDULU"), shareClassId, optionShares: 500_001, exercisePricePerShare: "0.10", currency: "USD", grantDate: "2025-06-01" },
        ctx,
      ),
    );
  });

  it("creates a PROPOSED grant and reserves pool capacity", async () => {
    const g = await createEsopGrant(
      cfo,
      {
        planId,
        granteePartyId: fixedId(ID_PREFIX.party, "ASHA_NDULU"),
        shareClassId,
        optionShares: 100_000,
        exercisePricePerShare: "0.10",
        currency: "USD",
        grantDate: "2025-06-01",
      },
      ctx,
    );
    grantId = g.id;
    expect(g.status).toBe("PROPOSED");
    const [plan] = await db.select().from(esopPlans).where(eq(esopPlans.id, planId));
    expect(plan.poolSharesIssued).toBe(100_000);
  });

  it("refuses approval without an approval reference — no evidence, not proven", async () => {
    await expectEquityError("EVIDENCE_REQUIRED", () => approveEsopGrant(cfo, { grantId, approvalRef: "  " }, ctx));
  });

  it("approves the grant with evidence", async () => {
    const approved = await approveEsopGrant(cfo, { grantId, approvalRef: `COMP-${RUN}`, legalReviewStatus: "LEGAL_REVIEW_CLOSED" }, ctx);
    expect(approved.status).toBe("APPROVED");
  });

  it("vests the grant from the plan default terms via the append-only ledger (idempotent)", async () => {
    const run = await runGrantVestingTo(cfo, { grantId, asOf: "2026-06-01" }, ctx); // 12 months → cliff
    expect(run.vestedOptions).toBe(25_000);
    expect(run.milestones).toHaveLength(1);

    const again = await runGrantVestingTo(cfo, { grantId, asOf: "2026-06-01" }, ctx);
    expect(again.milestones).toEqual([]);
    const events = await db.select().from(esopGrantEvents).where(
      and(eq(esopGrantEvents.grantId, grantId), eq(esopGrantEvents.eventType, "VESTING_MILESTONE")),
    );
    expect(events).toHaveLength(1);

    const [grant] = await db.select().from(esopGrants).where(eq(esopGrants.id, grantId));
    expect(grant.status).toBe("ACTIVE");
  });

  it("refuses exercise beyond vested-unexercised options", async () => {
    await expectEquityError("RULE_VIOLATION", () => exerciseEsopGrant(cfo, { grantId, shares: 25_001 }, ctx));
  });

  it("exercises within vested options; proceeds are a governed REFERENCE (no money moved)", async () => {
    const out = await exerciseEsopGrant(cfo, { grantId, shares: 25_000, proceedsRef: `FIN-PROBE-${RUN}` }, ctx);
    expect(out.status).toBe("PARTIALLY_EXERCISED");
    const [grant] = await db.select().from(esopGrants).where(eq(esopGrants.id, grantId));
    expect(grant.exercisedShares).toBe(25_000);

    const exEvents = await db.select().from(esopGrantEvents).where(
      and(eq(esopGrantEvents.grantId, grantId), eq(esopGrantEvents.eventType, "EXERCISED")),
    );
    expect(exEvents).toHaveLength(1);
    expect(exEvents[0].proceedsRef).toBe(`FIN-PROBE-${RUN}`);
  });
});

describe("§13/§14 — deterministic snapshots and dilution analysis that never executes", () => {
  it("reads the live cap table (and DENIES out-of-scope readers)", async () => {
    const cap = await readCapTable(cfo, { legalEntityId: HOLDINGS });
    // founder A fully vested (1,000,000) after acceleration; founder B retains 250,000
    expect(cap.outstandingShares).toBeGreaterThanOrEqual(1_250_000);
    expect(cap.cancelledShares).toBeGreaterThanOrEqual(750_000);
    const ceoCap = await readCapTable(ceo, { legalEntityId: HOLDINGS }); // CEO holds cap-table.read
    expect(ceoCap.outstandingShares).toBe(cap.outstandingShares);
  });

  it("DENIES the whole aggregate before loading payload when a source row exceeds clearance", async () => {
    await db
      .update(shareClasses)
      .set({ classification: "HIGHLY_RESTRICTED" })
      .where(eq(shareClasses.id, shareClassId));
    try {
      await expectEquityError("CLASSIFICATION_DENIED", () =>
        readCapTable(cfo, { legalEntityId: HOLDINGS }),
      );
      await expect(readCapTable(ceo, { legalEntityId: HOLDINGS })).resolves.toMatchObject({
        legalEntityId: HOLDINGS,
      });
    } finally {
      await db
        .update(shareClasses)
        .set({ classification: "RESTRICTED" })
        .where(eq(shareClasses.id, shareClassId));
    }
  });

  it("computes a snapshot that is deterministic and REPLACES (never diverges) on recompute", async () => {
    const one = await computeCapTableSnapshot(cfo, { legalEntityId: HOLDINGS, asOfDate: "2026-06-01" }, ctx);
    const two = await computeCapTableSnapshot(cfo, { legalEntityId: HOLDINGS, asOfDate: "2026-06-01" }, ctx);
    expect(one.computation).toEqual(two.computation);
    expect(one.id).toBe(two.id); // same (tenant, entity, date) → replaced in place, never a divergent second row
    expect(one.computation.cancelledShares).toBeGreaterThanOrEqual(750_000);
  });

  it("stores a dilution scenario as analysis with execution_prohibited = true (§14)", async () => {
    const before = await readCapTable(cfo, { legalEntityId: HOLDINGS });
    const scenario = await createDilutionScenario(
      cfo,
      {
        legalEntityId: HOLDINGS,
        name: `Series A probe ${RUN}`,
        scenarioType: "NEW_FINANCING",
        transactions: [{ type: "NEW_ISSUANCE", toHolder: `INV-${RUN}`, toGroup: "INVESTOR", shares: 500_000 }],
      },
      ctx,
    );
    expect(scenario.status).toBe("DRAFT");
    expect(scenario.result.post.fullyDilutedShares).toBe(scenario.result.pre.fullyDilutedShares + 500_000);

    const [row] = await db.select().from(dilutionScenarios).where(eq(dilutionScenarios.id, scenario.id));
    expect(row.executionProhibited).toBe(true);

    // The scenario NEVER altered actuals:
    const after = await readCapTable(cfo, { legalEntityId: HOLDINGS });
    expect(after.outstandingShares).toBe(before.outstandingShares);
    expect(after.fullyDilutedShares).toBe(before.fullyDilutedShares);
  });
});

describe("§55 — every equity mutation is authenticated, authorized and AUDITED", () => {
  it("wrote audit rows for the lifecycle and the hash chain still verifies", async () => {
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "equity.position.issue"))
      .orderBy(desc(auditLog.id))
      .limit(5);
    expect(audits.length).toBeGreaterThan(0);
    expect(audits.every((a) => a.outcome === "SUCCESS")).toBe(true);

    const chain = await verifyAuditChain();
    expect(chain.verified).toBe(true);
  });
});
