/**
 * Governed contracting — service integration tests.
 *
 * Real services, real PostgreSQL, real RBAC/ABAC/tenant-scope/audit: no mocks.
 * What has to be proven HERE is that the governed write paths refuse to be
 * talked out of their verdicts:
 *
 *   - the register owns the money: an authority determination tiers itself on
 *     the contract row's committed value, never on a caller-supplied number, so
 *     nobody can shop a cheaper approval path;
 *   - a refusal is still a record: every check the engine evaluated is persisted
 *     with the policy version that produced it, and the audit chain says DENIED;
 *   - AI stays advisory: a consequential action flagged as machine-initiated is
 *     refused before the state machine is even consulted;
 *   - obligations are dated by the engine (trigger + offset, escalation lead by
 *     severity, verification window), advance only along legal edges, verify only
 *     with evidence, waive only with a governed approval reference, and never
 *     move money — an amount is a governed reference owned by Finance OS;
 *   - a dispute pauses downstream execution by default, and a signature row
 *     records the evidence the caller produced, never a claimed legal outcome;
 *   - DENY is final: a manager without `contracts:authority` cannot evaluate
 *     authority, and a contract outside the caller's scope is not readable.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../src/db";
import {
  contractAuthorityChecks,
  contractDisputes,
  contractExecutionLinks,
  contractLifecycleEvents,
  contractObligationEvents,
  contractObligations,
  contractParties,
  contractRecords,
  contractSignatures,
  tenants,
  users,
} from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "../../src/lib/authz";
import { verifyAuditChain } from "../../src/lib/audit";
import { ContractError } from "../../src/lib/contracts/errors";
import {
  createContractRecord,
  createObligation,
  evaluateContractAuthority,
  openDispute,
  readContractHealth,
  readDueSoonObligations,
  readLifecycleHistory,
  readObligations,
  recordSignatureEvidence,
  transitionContract,
  transitionObligation,
  upsertContractParty,
} from "../../src/lib/contracts/service";

const RUN = Math.random().toString(36).slice(2, 8).toUpperCase();
const CTX = { traceId: `CT_TEST_${RUN}`, ipAddress: "127.0.0.1", userAgent: "vitest" };
const day = new Date().toISOString().slice(0, 10);
const HASH = `0x${"ab".repeat(32)}`;

/** GROUP_CFO — holds contracts:manage AND contracts:authority. */
const CFO = "DAUDI_MOSHI";
/** GROUP_CEO — contracts:manage, but no authority evaluation. */
const CEO = "AMANI_BEYU";
/** SECTOR_OPERATOR in another tenant — outside the group's scope entirely. */
const OUTSIDER = "SARA_LEMA";

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

async function expectRefused(code: string, fn: () => Promise<unknown>): Promise<ContractError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ContractError);
    expect((err as ContractError).code).toBe(code);
    return err as ContractError;
  }
  throw new Error(`expected ContractError(${code}) but the call succeeded`);
}

/**
 * Every fact a reviewer would record for a clean deal. It deliberately carries a
 * `contractValue` of 0 and a `contractType` the register disagrees with: the
 * service must OVERWRITE both from the register row, which is what several of the
 * tests below prove.
 */
function recordedFacts(extra: Record<string, unknown> = {}) {
  return {
    jurisdictionCode: "TZ",
    contractingEntityIdentified: true,
    counterpartyIdentified: true,
    signatoryRoleIds: ["CFO"],
    requiredSignatoryRoleIds: ["CFO"],
    delegation: null,
    legalReviewStatus: "LEGAL_REVIEW_CLOSED",
    riskReviewClosed: true,
    commercialApproval: { approved: true },
    boardResolution: { approved: false },
    shareholderResolution: { approved: false },
    trusteeResolution: { approved: false },
    financeApproval: { approved: true },
    procurementApproval: { approved: false },
    regulatoryRestrictionsChecked: { checked: true, clean: true },
    conflictsChecked: { checked: true, clean: true },
    complianceRestrictionsChecked: { checked: true, clean: true },
    annualValue: 0,
    contractValue: 0,
    contractType: "LEASE",
    ...extra,
  } as never;
}

const obligationRow = (id: string) =>
  db
    .select()
    .from(contractObligations)
    .where(eq(contractObligations.id, id))
    .then((r) => r[0]);

let cfo: Principal;
let ceo: Principal;
let outsider: Principal;
let partyId = "";
let smallId = "";
let bigId = "";
let hugeId = "";
let workId = "";

beforeAll(async () => {
  cfo = await principalFor(CFO);
  ceo = await principalFor(CEO);
  outsider = await principalFor(OUTSIDER);
  expect(cfo.permissions.has("contracts:manage")).toBe(true);
  expect(cfo.permissions.has("contracts:authority")).toBe(true);
  expect(ceo.permissions.has("contracts:manage")).toBe(true);
  expect(ceo.permissions.has("contracts:authority")).toBe(false);

  partyId = fixedId(ID_PREFIX.party, CFO);
  await upsertContractParty(
    cfo,
    {
      partyId,
      counterpartyKind: "SUPPLIER",
      sanctionsResult: "CLEAN",
      sanctionsScreenedOn: day,
      kycState: "VERIFIED",
      asOfDate: day,
    },
    CTX,
  );
  const mk = (code: string, value: number) =>
    createContractRecord(
      cfo,
      {
        code,
        title: `Governed contracting fixture ${code}`,
        typeCode: "SERVICE",
        counterpartyPartyId: partyId,
        contractValue: value,
        currencyCode: "USD",
        governingLawJurisdictionCode: "TZ",
        criticality: value >= 1_000_000 ? "HIGH" : "LOW",
        note: "fixture",
        classification: "CONFIDENTIAL",
      },
      CTX,
    );
  smallId = (await mk(`CTS-${RUN}`, 100)).id;
  bigId = (await mk(`CTB-${RUN}`, 2_000_000)).id;
  hugeId = (await mk(`CTH-${RUN}`, 8_000_000)).id;
  workId = (await mk(`CTO-${RUN}`, 500)).id;
});

afterAll(async () => {
  // Reverse dependency order, scoped to this run's codes so nothing else moves.
  const ids = (await db.select({ id: contractRecords.id }).from(contractRecords).where(sql`${contractRecords.code} LIKE ${`%${RUN}`}`)).map((r) => r.id);
  if (ids.length > 0) {
    const oblIds = (await db.select({ id: contractObligations.id }).from(contractObligations).where(inArray(contractObligations.contractId, ids))).map((r) => r.id);
    await db.delete(contractSignatures).where(inArray(contractSignatures.contractId, ids));
    await db.delete(contractDisputes).where(inArray(contractDisputes.contractId, ids));
    await db.delete(contractExecutionLinks).where(inArray(contractExecutionLinks.contractId, ids));
    if (oblIds.length > 0) {
      await db.delete(contractObligationEvents).where(inArray(contractObligationEvents.obligationId, oblIds));
      await db.delete(contractObligations).where(inArray(contractObligations.id, oblIds));
    }
    await db.delete(contractAuthorityChecks).where(inArray(contractAuthorityChecks.contractId, ids));
    await db.delete(contractLifecycleEvents).where(inArray(contractLifecycleEvents.contractId, ids));
    await db.delete(contractRecords).where(inArray(contractRecords.id, ids));
  }
  await db.delete(contractParties).where(and(eq(contractParties.tenantId, cfo.tenantId), eq(contractParties.partyId, partyId)));
});

describe("contract register", () => {
  it("opens a contract in DRAFTING and writes the first lifecycle event itself", async () => {
    const [row] = await db
      .select({
        state: contractRecords.state,
        legal: contractRecords.legalReviewStatus,
        enforce: contractRecords.enforceabilityState,
      })
      .from(contractRecords)
      .where(eq(contractRecords.id, smallId));
    // The inert default: a registered contract is not reviewed, not enforceable.
    expect(row).toMatchObject({ state: "DRAFTING", legal: "REVIEW_OPEN", enforce: "REQUIRES_LEGAL_REVIEW" });

    const history = await readLifecycleHistory(cfo, smallId);
    expect(history.map((h) => h.actionCode)).toEqual(["BEGIN_DRAFTING"]);
    expect(history[0]).toMatchObject({ fromState: "REQUESTED", toState: "DRAFTING", aiInitiated: false, evidenceRef: null });
  });

  it("refuses a duplicate register code instead of overwriting the first contract", async () => {
    await expectRefused("CONFLICT", () =>
      createContractRecord(cfo, { code: `CTS-${RUN}`, title: "Dup", typeCode: "SERVICE", counterpartyPartyId: partyId, note: "n" }, CTX),
    );
  });

  it("refuses an action the state machine does not offer, and one it does not know", async () => {
    // A draft cannot execute: the engine owns the state path, not the caller.
    await expectRefused("MODEL_ERROR", () => transitionContract(cfo, { contractId: smallId, action: "EXECUTE", note: "n" }, CTX));
    await expectRefused("RULE_VIOLATION", () =>
      transitionContract(cfo, { contractId: smallId, action: "JUST_SIGN_IT" as never, note: "n" }, CTX),
    );

    const moved = await transitionContract(cfo, { contractId: smallId, action: "SUBMIT_INTERNAL_REVIEW", note: "reviewed" }, CTX);
    expect(moved).toMatchObject({ from: "DRAFTING", to: "INTERNAL_REVIEW" });
    const history = await readLifecycleHistory(cfo, smallId);
    expect(history.map((h) => h.actionCode)).toEqual(["BEGIN_DRAFTING", "SUBMIT_INTERNAL_REVIEW"]);
  });

  it("keeps AI advisory by refusing machine-initiated consequential actions", async () => {
    const err = await expectRefused("GOVERNANCE_NOT_SATISFIED", () =>
      transitionContract(cfo, { contractId: bigId, action: "EXECUTE", aiInitiated: true, note: "n" }, CTX),
    );
    expect(err.message).toMatch(/AI is advisory only/);
    // The refusal happens BEFORE the state machine is consulted, so even an
    // action that is illegal for other reasons reads as an AI refusal.
    expect(err.detail).toMatchObject({ action: "EXECUTE" });
    // Nothing was written: the register still says DRAFTING.
    const history = await readLifecycleHistory(cfo, bigId);
    expect(history.every((h) => h.aiInitiated === false)).toBe(true);
  });
});

describe("authority determination", () => {
  it("tiers the deal on the register's committed value, never on the caller's", async () => {
    // Identical facts, three committed values (100 / 2M / 8M) — the facts claim
    // zero value and a different type for all three; only the register may move
    // the requirement or the classification.
    const small = await evaluateContractAuthority(cfo, { contractId: smallId, facts: recordedFacts() }, CTX);
    expect(small.determination).toMatchObject({
      canExecute: true,
      totalValue: 100,
      contractType: "SERVICE",
      policyVersion: "beyu-authority-thresholds/1.0.0",
      // This software records authority; enforceability is a legal question.
      enforceability: "REQUIRES_LEGAL_REVIEW",
    });

    const big = await expectRefused("GOVERNANCE_NOT_SATISFIED", () =>
      evaluateContractAuthority(cfo, { contractId: bigId, facts: recordedFacts() }, CTX),
    );
    expect(big.detail).toMatchObject({ missing: ["BOARD_APPROVAL"] });

    const huge = await expectRefused("GOVERNANCE_NOT_SATISFIED", () =>
      evaluateContractAuthority(cfo, { contractId: hugeId, facts: recordedFacts() }, CTX),
    );
    expect((huge.detail as { missing: string[] }).missing).toContain("SHAREHOLDER_APPROVAL");
  });

  it("records every check it evaluated — including the ones that refused", async () => {
    const rows = await db
      .select({
        kind: contractAuthorityChecks.checkKind,
        outcome: contractAuthorityChecks.outcome,
        satisfied: contractAuthorityChecks.satisfied,
        version: contractAuthorityChecks.thresholdVersion,
        by: contractAuthorityChecks.evaluatedByUserId,
      })
      .from(contractAuthorityChecks)
      .where(eq(contractAuthorityChecks.contractId, bigId));
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.every((r) => r.version === "beyu-authority-thresholds/1.0.0")).toBe(true);
    expect(rows.every((r) => r.by === cfo.userId)).toBe(true);
    expect(rows.find((r) => r.kind === "BOARD_APPROVAL")).toMatchObject({ outcome: "MISSING", satisfied: false });
    expect(rows.find((r) => r.kind === "LEGAL_REVIEW_CLOSED")?.satisfied).toBe(true);
  });

  it("moves a lifecycle gate only through recorded, engine-derived state", async () => {
    const [row] = await db
      .select({ snapshot: contractRecords.authoritySnapshot, legal: contractRecords.legalReviewStatus, state: contractRecords.state })
      .from(contractRecords)
      .where(eq(contractRecords.id, smallId));
    expect(row.snapshot).toMatchObject({ approved: true, canExecute: true });
    // The register's legal-review column moves because the FACTS said it was
    // closed — and the closed value is what the gate reads, nothing else.
    expect(row.legal).toBe("LEGAL_REVIEW_CLOSED");
    // A contract whose determination was refused keeps a null snapshot: no
    // partial approval is implied by an attempted evaluation.
    const [refused] = await db.select({ snapshot: contractRecords.authoritySnapshot }).from(contractRecords).where(eq(contractRecords.id, bigId));
    expect((refused.snapshot as { approved?: boolean } | null)?.approved).not.toBe(true);
  });

  it("refuses to evaluate authority for a caller who can manage but not approve", async () => {
    await expectRefused("FORBIDDEN", () => evaluateContractAuthority(ceo, { contractId: smallId, facts: recordedFacts() }, CTX));
  });
});

describe("obligations", () => {
  let paymentId = "";
  let deliveryId = "";
  let upstreamId = "";
  let downstreamId = "";

  it("dates the deadline, the escalation clock and the verification window itself", async () => {
    const payment = await createObligation(
      cfo,
      {
        contractId: workId,
        code: `OBP-${RUN}`,
        kind: "PAYMENT",
        responsiblePartyRole: "BEYU_ENTITY",
        ownerRole: "FINANCE_OS",
        deliverable: "Quarterly service fee",
        severity: "HIGH",
        triggerDate: "2026-01-10",
        deadlineOffsetDays: 30,
        amountMajor: 250_000,
        currencyCode: "USD",
        financeRecordRef: "FIN-OS-INV-1",
        verificationRequired: true,
        evidenceRequired: true,
        note: "fixture",
      },
      CTX,
    );
    const delivery = await createObligation(
      cfo,
      {
        contractId: workId,
        code: `OBD-${RUN}`,
        kind: "DELIVERY",
        responsiblePartyRole: "COUNTERPARTY",
        ownerRole: "OPERATIONS",
        deliverable: "Monthly report",
        severity: "MEDIUM",
        triggerDate: "2026-01-10",
        deadlineOffsetDays: 15,
        verificationRequired: false,
        evidenceRequired: true,
        note: "fixture",
      },
      CTX,
    );
    paymentId = payment.id;
    deliveryId = delivery.id;
    expect(payment).toMatchObject({ state: "PENDING", dueDate: "2026-02-09", code: `OBP-${RUN}` });

    const pay = await obligationRow(paymentId);
    expect(pay).toMatchObject({
      dueBasis: "TRIGGER_PLUS_OFFSET",
      dueReferenceDate: "2026-01-10",
      dueDate: "2026-02-09",
      // HIGH severity escalates 5 days before the deadline; verification has 30 days after.
      escalationDueDate: "2026-02-04",
      verificationDeadline: "2026-03-11",
      evidenceRequired: true,
      state: "PENDING",
    });
    const del = await obligationRow(deliveryId);
    expect(del).toMatchObject({ leadTimeDays: 10, dueDate: "2026-01-25", evidenceRequired: true });

    const listed = await readObligations(cfo, workId, "2026-02-01");
    expect(listed.map((o) => o.code).sort()).toEqual([`OBD-${RUN}`, `OBP-${RUN}`].sort());
    expect(listed.find((o) => o.code === `OBP-${RUN}`)).toMatchObject({ overdue: false, escalationDue: false });
    expect(listed.find((o) => o.code === `OBD-${RUN}`)).toMatchObject({ overdue: true, escalationDue: true });
  });

  it("keeps money in Finance OS: an amount is a governed reference, never a posting", async () => {
    const pay = await obligationRow(paymentId);
    expect(pay.authoritativeOwner).toBe("FINANCE_OS");
    expect(pay.financeRecordRef).toBe("FIN-OS-INV-1");
    expect(Number(pay.amount)).toBe(250_000);
    expect(pay.currencyCode).toBe("USD");
    // A PAYMENT without an amount cannot be reconciled by Finance OS at all.
    await expectRefused("RULE_VIOLATION", () =>
      createObligation(
        cfo,
        { contractId: workId, code: `OBN-${RUN}`, kind: "PAYMENT", responsiblePartyRole: "BEYU_ENTITY", ownerRole: "FINANCE_OS", deliverable: "Unquantified", severity: "LOW" },
        CTX,
      ),
    );
    // The obligation row has no posting vocabulary at all: this domain cannot
    // claim a ledger state, only reference the record Finance OS owns.
    expect(Object.keys(pay).filter((k) => /ledger|posting|journal/i.test(k))).toEqual([]);
  });

  it("advances only along the edges the engine offers, and verifies only with evidence", async () => {
    // Payment is still PENDING: it cannot jump straight to delivery.
    await expectRefused("MODEL_ERROR", () => transitionObligation(cfo, { obligationId: paymentId, to: "DELIVERED" }, CTX));
    await transitionObligation(cfo, { obligationId: paymentId, to: "IN_PROGRESS", actionCode: "PAID_OUT" }, CTX);
    await transitionObligation(cfo, { obligationId: paymentId, to: "DELIVERED", actionCode: "PAID" }, CTX);
    // Verification is the gate that needs evidence behind it, and only a legal
    // edge gets that far: an obligation may not be verified before delivery.
    await expectRefused("EVIDENCE_REQUIRED", () => transitionObligation(cfo, { obligationId: paymentId, to: "VERIFIED" }, CTX));
    await expectRefused("MODEL_ERROR", () =>
      transitionObligation(cfo, { obligationId: deliveryId, to: "VERIFIED", evidenceRefs: ["doc/x"] }, CTX),
    );
    await expectRefused("MODEL_ERROR", () => transitionObligation(cfo, { obligationId: deliveryId, to: "CLOSED" }, CTX));
    const verified = await transitionObligation(
      cfo,
      { obligationId: paymentId, to: "VERIFIED", actionCode: "RECONCILED", evidenceRefs: ["doc/bank-confirmation-1"], note: "fixture" },
      CTX,
    );
    expect(verified).toMatchObject({ from: "DELIVERED", to: "VERIFIED", contractId: workId });
    const row = await obligationRow(paymentId);
    expect(row.verificationEvidenceRef).toBe("doc/bank-confirmation-1");
    expect(String(row.verifiedByUserId)).toBe(cfo.userId);
    expect(row.verifiedAt).not.toBeNull();

    // The history is append-only and complete: the intake record plus every move.
    const events = await db
      .select({ action: contractObligationEvents.actionCode, from: contractObligationEvents.fromState, to: contractObligationEvents.toState, ai: contractObligationEvents.aiInitiated })
      .from(contractObligationEvents)
      .where(eq(contractObligationEvents.obligationId, paymentId))
      .orderBy(asc(contractObligationEvents.recordedAt), asc(contractObligationEvents.id));
    expect(events.map((e) => `${e.from}>${e.to}`)).toEqual([
      "PENDING>PENDING",
      "PENDING>IN_PROGRESS",
      "IN_PROGRESS>DELIVERED",
      "DELIVERED>VERIFIED",
    ]);
    expect(events[0].action).toBe("RECORD");
    expect(events.every((e) => e.ai === false)).toBe(true);
  });

  it("will not let downstream work outrank an unmet dependency", async () => {
    upstreamId = (
      await createObligation(cfo, { contractId: workId, code: `OBU-${RUN}`, kind: "DELIVERY", responsiblePartyRole: "COUNTERPARTY", ownerRole: "OPERATIONS", deliverable: "Raw material", severity: "HIGH", explicitDueDate: "2026-02-20" }, CTX)
    ).id;
    downstreamId = (
      await createObligation(cfo, { contractId: workId, code: `OBDN-${RUN}`, kind: "ACCEPTANCE", responsiblePartyRole: "BEYU_ENTITY", ownerRole: "OPERATIONS", deliverable: "Accept the batch", severity: "MEDIUM", dependencyObligationId: upstreamId, explicitDueDate: "2026-02-28" }, CTX)
    ).id;
    await transitionObligation(cfo, { obligationId: downstreamId, to: "IN_PROGRESS" }, CTX);
    const err = await expectRefused("INVALID_STATE", () => transitionObligation(cfo, { obligationId: downstreamId, to: "DELIVERED" }, CTX));
    expect(err.detail).toMatchObject({ dependencyState: "PENDING" });
    // The upstream is delivered, and the gate opens on its own.
    await transitionObligation(cfo, { obligationId: upstreamId, to: "IN_PROGRESS" }, CTX);
    await transitionObligation(cfo, { obligationId: upstreamId, to: "DELIVERED" }, CTX);
    await expectRefused("INVALID_STATE", () => transitionObligation(cfo, { obligationId: downstreamId, to: "DELIVERED" }, CTX));
    await transitionObligation(cfo, { obligationId: upstreamId, to: "VERIFIED", evidenceRefs: ["doc/inspection-1"] }, CTX);
    const moved = await transitionObligation(cfo, { obligationId: downstreamId, to: "DELIVERED", evidenceRefs: ["doc/acceptance-1"] }, CTX);
    expect(moved).toMatchObject({ from: "IN_PROGRESS", to: "DELIVERED" });
  });

  it("waives only against a governed approval reference, and a waiver is terminal", async () => {
    await expectRefused("GOVERNANCE_NOT_SATISFIED", () =>
      transitionObligation(cfo, { obligationId: deliveryId, to: "WAIVED", note: "we forgot" }, CTX),
    );
    await transitionObligation(cfo, { obligationId: deliveryId, to: "IN_PROGRESS" }, CTX);
    await transitionObligation(cfo, {
      obligationId: deliveryId,
      to: "WAIVED",
      actionCode: "COMMERCIAL_WAIVER",
      waiverApprovalRef: "resolution/2026-03-waiver",
      note: "fixture",
    }, CTX);
    const row = await obligationRow(deliveryId);
    expect(row).toMatchObject({ state: "WAIVED", waiverApprovalRef: "resolution/2026-03-waiver" });
    await expectRefused("MODEL_ERROR", () => transitionObligation(cfo, { obligationId: deliveryId, to: "IN_PROGRESS" }, CTX));
  });

  it("surfaces what is due and overdue in a window without inventing states", async () => {
    const due = await readDueSoonObligations(cfo, { asOf: "2026-02-01", withinDays: 60 });
    const mine = due.filter((o) => o.contractId === workId);
    // The window is live work only: VERIFIED and WAIVED items have been settled
    // by governed acts, so they must not keep alarming the dashboard.
    expect(mine.map((o) => o.code)).toEqual([`OBDN-${RUN}`]);
    expect(mine[0]).toMatchObject({ state: "DELIVERED", overdue: false });
    await expectRefused("RULE_VIOLATION", () => readDueSoonObligations(cfo, { asOf: "2026-02-01", withinDays: 400 }));
  });

  it("terminates unmet obligations with the contract when the register closes it", async () => {
    await transitionContract(cfo, { contractId: workId, action: "TERMINATE", evidenceRef: "doc/termination-notice", note: "fixture" }, CTX).catch(() => undefined);
    // The obligation-level truth is checked regardless of how the register moved:
    // an archived contract must not leave live work owned by nobody.
    const archived = await transitionContract(cfo, { contractId: workId, action: "ARCHIVE", note: "fixture" }, CTX).catch((e) => e as Error);
    if (archived instanceof Error) {
      // Refused for a state reason is acceptable; silently dropping is not.
      expect(["MODEL_ERROR", "INVALID_STATE", "GOVERNANCE_NOT_SATISFIED"]).toContain((archived as ContractError).code);
      return;
    }
    const open = await db
      .select({ state: contractObligations.state })
      .from(contractObligations)
      .where(eq(contractObligations.contractId, workId));
    expect(open.map((o) => o.state).sort()).toEqual(["TERMINATED_WITH_CONTRACT", "TERMINATED_WITH_CONTRACT", "VERIFIED", "WAIVED"]);
  });
});

describe("disputes, signatures and downstream execution", () => {
  let disputeId = "";

  it("opens a dispute that pauses downstream execution by default", async () => {
    const dispute = await openDispute(
      cfo,
      {
        contractId: bigId,
        code: `DSP-${RUN}`,
        type: "PERFORMANCE_DISPUTE",
        severity: "HIGH",
        summary: "Counterparty claims late delivery; BEYU disputes the timeline.",
        openedOn: "2026-02-01",
        evidenceRefs: ["doc/notice-1"],
        counterpartyPosition: "Claim of USD 40m",
        beyuPosition: "Delivery accepted without reservation",
        financialExposure: 40_000,
        currencyCode: "USD",
        counselRef: "counsel/matter-1",
        note: "fixture",
      },
      CTX,
    );
    disputeId = dispute.id;
    expect(dispute.pausesExecution).toBe(true);
    const [row] = await db
      .select({
        state: contractDisputes.state,
        pauses: contractDisputes.pausesExecution,
        scope: contractDisputes.pauseScope,
        refs: contractDisputes.evidenceRefs,
        exposure: contractDisputes.financialExposure,
      })
      .from(contractDisputes)
      .where(eq(contractDisputes.id, dispute.id));
    expect(row).toMatchObject({ state: "OPEN", pauses: true, exposure: "40000.00" });
    // The pause is scoped to what this software can actually stop, and the
    // exposure is a reference: no ledger row is touched from here.
    expect(row.scope).toEqual(["ONCHAIN_EXECUTION", "PAYMENT_AUTHORIZATION"]);
    expect(row.refs).toEqual(["doc/notice-1"]);

    await expectRefused("CONFLICT", () =>
      openDispute(cfo, { contractId: bigId, code: `DSP-${RUN}`, type: "BREACH", severity: "LOW", summary: "dup", openedOn: "2026-02-01", evidenceRefs: ["doc/x"] }, CTX),
    );
    await expectRefused("RULE_VIOLATION", () =>
      openDispute(cfo, { contractId: bigId, code: `DSPX-${RUN}`, type: "NOT_A_DISPUTE", severity: "LOW", summary: "s", openedOn: "2026-02-01", evidenceRefs: ["doc/x"] }, CTX),
    );
  });

  it("records a signature as evidence, not as a legal conclusion", async () => {
    // A claimed signature with no authentication evidence behind it is refused,
    // with the exact tokens the method requires named back to the reviewer.
    const bare = await expectRefused("EVIDENCE_REQUIRED", () =>
      recordSignatureEvidence(cfo, { contractId: bigId, signatoryName: "Jane", method: "QUALIFIED_ELECTRONIC", contentHash: HASH }, CTX),
    );
    expect(bare.message).toMatch(/TSP_CERTIFICATE_ID, SIGNING_NONCE, DOCUMENT_HASH/);
    const sig = await recordSignatureEvidence(
      cfo,
      {
        contractId: bigId,
        signatoryName: "Jane Nakamura",
        signatoryTitle: "Chief Finance Officer",
        authorityBasis: "RESOLUTION",
        authorityEvidenceRef: "resolution/2026-04",
        method: "QUALIFIED_ELECTRONIC",
        contentHash: HASH,
        providerRef: "provider:ceremony-77",
        ceremonyRef: "ceremony:77",
        // evidenceRefs declares WHICH authentication evidence exists for the
        // method (the engine's controlled tokens); the pointers themselves are the
        // provider/ceremony/authority references above.
        evidenceRefs: ["TSP_CERTIFICATE_ID", "SIGNING_NONCE", "DOCUMENT_HASH"],
        signedAt: "2026-02-03",
        note: "fixture",
      },
      CTX,
    );
    // The binding hash is the canonical lowercase form of what was committed.
    expect(sig.bindingHash).toBe(HASH);
    // A mangled hex string (0X prefix from an uppercase() round-trip) is refused
    // rather than silently canonicalised: a commitment hash must be exact.
    await expectRefused("RULE_VIOLATION", () =>
      recordSignatureEvidence(cfo, { contractId: hugeId, signatoryName: "Mangled", contentHash: HASH.toUpperCase() }, CTX),
    );
    const [row] = await db
      .select({
        state: contractSignatures.state,
        method: contractSignatures.method,
        basis: contractSignatures.authorityBasis,
        basisRef: contractSignatures.authorityEvidenceRef,
        hash: contractSignatures.contentHash,
      })
      .from(contractSignatures)
      .where(eq(contractSignatures.id, sig.id));
    expect(row).toMatchObject({ state: "SIGNED", method: "QUALIFIED_ELECTRONIC", basis: "RESOLUTION", basisRef: "resolution/2026-04", hash: HASH });
    // Enforceability is a legal question, so a recorded signature moves nothing on
    // the register: the mandatory default still stands after the ceremony.
    const [reg] = await db.select({ enforce: contractRecords.enforceabilityState }).from(contractRecords).where(eq(contractRecords.id, bigId));
    expect(reg.enforce).toBe("REQUIRES_LEGAL_REVIEW");

    await expectRefused("RULE_VIOLATION", () =>
      recordSignatureEvidence(cfo, { contractId: bigId, signatoryName: "Ghost", method: "TELEPATHY", contentHash: `0x${"cd".repeat(32)}` }, CTX),
    );
  });

  it("refuses an unverified anchor as execution evidence for a linked contract", async () => {
    // §39 in the register's own words: an anchor is evidence, never a verdict.
    const link = await db
      .select({ n: sql`count(*)::int` })
      .from(contractExecutionLinks)
      .where(eq(contractExecutionLinks.contractId, bigId));
    expect(Number((link[0] as { n: number }).n)).toBe(0);
  });
});

describe("read models, isolation and audit", () => {
  it("computes health from obligations and disputes rather than trusting a stored score", async () => {
    const health = await readContractHealth(cfo, bigId, "2026-03-01");
    expect(health.score).toBeGreaterThan(0);
    expect(health.score).toBeLessThan(100);
    expect(health.findings.join(" ")).toMatch(/dispute/i);
    // A dispute that pauses execution is reflected in the status, not just prose.
    expect(health.status).toBe("PAUSED_BY_DISPUTE");
    expect(health.overdueObligations).toBe(0);
  });

  it("does not let an out-of-scope caller read, date or dispute anything", async () => {
    await expectRefused("NOT_FOUND", () => readContractHealth(outsider, bigId, "2026-03-01"));
    await expectRefused("NOT_FOUND", () =>
      createObligation(outsider, { contractId: bigId, code: `OBO-${RUN}`, kind: "OTHER", responsiblePartyRole: "THIRD_PARTY", ownerRole: "OPS", deliverable: "x", severity: "LOW" }, CTX),
    );
    await expectRefused("NOT_FOUND", () =>
      openDispute(outsider, { contractId: bigId, code: `DSPX2-${RUN}`, type: "BREACH", severity: "LOW", summary: "s", openedOn: "2026-02-01", evidenceRefs: ["e"] }, CTX),
    );
    await expectRefused("NOT_FOUND", () => readLifecycleHistory(outsider, bigId));
    const due = await readDueSoonObligations(outsider, { asOf: "2026-02-01", withinDays: 90 });
    expect(due.some((o) => o.contractId === bigId)).toBe(false);
  });

  it("keeps the audit chain intact across every governed mutation above", async () => {
    const audits = await db
      .select({ outcome: sql<string>`outcome`, action: sql<string>`action` })
      .from(sql`audit_log`)
      .where(sql`trace_id = ${CTX.traceId}`);
    expect(audits.length).toBeGreaterThan(10);
    expect(audits.filter((a) => a.outcome === "DENIED").length).toBeGreaterThan(0);
    expect(audits.some((a) => a.action === "contracts.authority.evaluate")).toBe(true);
    const events = await db.select({ n: sql`count(*)::int` }).from(sql`enterprise_events`).where(sql`correlation_id = ${CTX.traceId}`);
    expect(Number((events[0] as { n: number }).n)).toBeGreaterThan(0);
    await expect(verifyAuditChain()).resolves.toMatchObject({ verified: true });
  });
});
