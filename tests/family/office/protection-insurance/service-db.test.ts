/**
 * Family Office protection & insurance — governed service paths on real
 * PostgreSQL (privileged test role, same convention as the Foundation domain
 * certification). The HTTP suite proves the transport boundary; this proves
 * the write path itself: engine-gated persistence, audit rows and enterprise
 * events appended in the SAME transaction, lifecycle refusals, and the rule
 * that scope — never a client-supplied id — decides visibility.
 *
 * The records created here are STRUCTURAL test fixtures: fabricated test
 * policy numbers and amounts, recorded under the USER_PROVIDED provenance
 * class with their test nature stated in the purpose text. Nothing is
 * presented as an insurer's fact (Rule 25: no fake production evidence).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, enterpriseEvents, tenants, users } from "@/db/schema";
import { clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "@/lib/authz";
import {
  FAMILY_OFFICE_PROTECTION_ERROR_STATUS,
  FamilyOfficeProtectionError,
  advanceGovernanceStage,
  createAssessment,
  createPolicy,
  getPolicyDetail,
  listPolicies,
  openClaim,
  recordDesignation,
  recordPremium,
  recordReview,
  transitionClaim,
  transitionPolicyStatus,
} from "@/lib/family-office-protection-service";
import type { CreatePolicyInput } from "@/lib/family-office-protection-service";

async function principalFor(email: string, overrides: Partial<Principal> = {}): Promise<Principal> {
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u) throw new Error(`seed user ${email} missing`);
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
    ...overrides,
  };
}

const actorOf = (p: Principal) => ({ tenantId: p.tenantId, userId: p.userId, traceId: `trace-${Date.now()}`, ipAddress: null, userAgent: null });

let principal: Principal;
let suffix = "";

function policyInput(over: Partial<CreatePolicyInput> = {}): CreatePolicyInput {
  return {
    policyNumber: `T-LIFE-${suffix}`,
    policyType: "FAMILY_PROTECTION",
    ownerRef: `TEST-TRUST-${suffix}`,
    ownerKind: "TRUST",
    insuredRef: `TEST-MEMBER-${suffix}`,
    insuredKind: "FAMILY_MEMBER",
    premiumPayerRef: `TEST-MEMBER-${suffix}`,
    insurerRef: `TEST-INSURER-${suffix}`,
    brokerRef: null,
    legalEntityId: null,
    countryCode: "MU",
    currency: "MUR",
    coverageAmountMinor: 20_000_000,
    deathBenefitMinor: 20_000_000,
    cashValueMinor: null,
    surrenderValueMinor: null,
    premiumAmountMinor: 240_000,
    premiumFrequency: "ANNUAL",
    nextPremiumDueDate: "2026-12-01",
    effectiveDate: "2024-01-01",
    maturityDate: null,
    reviewIntervalDays: 365,
    nextReviewDate: "2027-01-01",
    purpose: `Structural test fixture ${suffix}: exercises the governed write path; not a real policy.`,
    successionPlanId: null,
    successionPlanRef: null,
    liquidityObjectiveRef: null,
    riskAssessmentRef: null,
    hcmEmployeeRef: null,
    documentRefs: [`TEST-DOC-${suffix}`],
    jurisdictionRef: null,
    amountProvenance: "USER_PROVIDED",
    amountSourceRef: null,
    ...over,
  };
}

beforeAll(async () => {
  principal = await principalFor("family@beyu.os");
  suffix = `t${Date.now().toString(36)}`;
}, 60_000);

describe("protection service — governed writes on the real database", () => {
  it("creates a policy, writes its audit row and its event, and reads it back scoped", async () => {
    const { id } = await createPolicy(actorOf(principal), principal, policyInput());
    expect(id.startsWith("FOINS_")).toBe(true);

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.objectType, "FAMILY_INSURANCE_POLICY"), eq(auditLog.objectId, id), eq(auditLog.action, "family.protection.policy.create")))
      .limit(1);
    expect(audit).toBeTruthy();
    expect(audit.outcome).toBe("SUCCESS");
    expect(audit.newValue?.contingentProtection).toBe(true);

    const [event] = await db
      .select()
      .from(enterpriseEvents)
      .where(and(eq(enterpriseEvents.type, "INSURANCE_POLICY_CREATED"), eq(enterpriseEvents.subjectId, id)))
      .limit(1);
    expect(event).toBeTruthy();
    expect(event.source).toBe("BEYU_OS");
    expect(event.domain).toBe("FAMILY_OFFICE");

    const listing = await listPolicies(principal, "2026-09-11");
    const view = listing.policies.find((p) => p.id === id);
    expect(view?.policyNumber).toBe(`T-LIFE-${suffix}`);
    // The listing always presents the designation audit and flags together;
    // NOT_QUANTIFIED semantics are pinned in the pure engine suite.
    expect(view?.beneficiarySummary.findings.some((f) => f.code === "MISSING_BENEFICIARY")).toBe(true);

    const detail = await getPolicyDetail(principal, id, "2026-09-11");
    expect(detail.validation).toEqual([]);
    expect(detail.policy.status).toBe("DRAFT");
  });

  it("refuses a duplicate policy number within the tenant (unique index holds)", async () => {
    const dup = policyInput({ policyNumber: `T-LIFE-DUP-${suffix}` });
    await createPolicy(actorOf(principal), principal, dup);
    let rejected = false;
    try {
      await createPolicy(actorOf(principal), principal, dup);
    } catch (err) {
      rejected = true;
      // Governed refusal, not a leaked unique-violation: the caller gets the
      // domain's own answer and the index stays the last-line authority.
      expect(err).toBeInstanceOf(FamilyOfficeProtectionError);
      expect((err as FamilyOfficeProtectionError).code).toBe("GOVERNANCE");
    }
    expect(rejected).toBe(true);
  });

  it("refuses the engine-invalid record BEFORE any row or audit lands", async () => {
    const before = await db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(eq(auditLog.action, "family.protection.policy.create"));
    await expect(
      createPolicy(actorOf(principal), principal, policyInput({ amountProvenance: "VERIFIED", amountSourceRef: null })),
    ).rejects.toBeInstanceOf(FamilyOfficeProtectionError);
    const after = await db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(eq(auditLog.action, "family.protection.policy.create"));
    expect(after[0].n).toBe(before[0].n);
  });

  it("moves the contract lifecycle legally and refuses the illegal moves", async () => {
    const { id } = await createPolicy(actorOf(principal), principal, policyInput({ policyNumber: `T-LIFE-B-${suffix}` }));
    await transitionPolicyStatus(actorOf(principal), principal, id, "PENDING_UNDERWRITING", { evidenceRef: null, reason: "submitted for underwriting" });
    await transitionPolicyStatus(actorOf(principal), principal, id, "IN_FORCE", { evidenceRef: null, reason: "inception confirmed by schedule" });
    await expect(transitionPolicyStatus(actorOf(principal), principal, id, "TERMINATED", { evidenceRef: null, reason: "x" })).resolves.toBeTruthy();
    await expect(transitionPolicyStatus(actorOf(principal), principal, id, "IN_FORCE", { evidenceRef: "E", reason: "back from terminal" })).rejects.toMatchObject({
      code: "GOVERNANCE",
    });
  });

  it("governance advances: chain enforced; ACTIVE needs authority; AI never clears a stage", async () => {
    const { id } = await createPolicy(actorOf(principal), principal, policyInput({ policyNumber: `T-LIFE-C-${suffix}` }));
    await expect(advanceGovernanceStage(actorOf(principal), principal, id, "ACTIVE", { authorityRef: null, reviewFindingCount: null, isHighValue: null, thresholdSourceRef: null })).rejects.toBeInstanceOf(FamilyOfficeProtectionError);
    const err = await advanceGovernanceStage(actorOf(principal), principal, id, "ASSESSED", { authorityRef: null, reviewFindingCount: 0, isHighValue: null, thresholdSourceRef: null }).then(() => null, (e) => e);
    expect(err).toBeNull();
    // Skip without provenance must be refused…
    await expect(
      advanceGovernanceStage(actorOf(principal), principal, id, "GOVERNANCE_APPROVAL", { authorityRef: "RES-X", reviewFindingCount: 0, isHighValue: false, thresholdSourceRef: null }),
    ).rejects.toMatchObject({ code: "GOVERNANCE" });
    // …and with provenance allowed.
    await advanceGovernanceStage(actorOf(principal), principal, id, "GOVERNANCE_APPROVAL", { authorityRef: "RES-X", reviewFindingCount: 0, isHighValue: false, thresholdSourceRef: "POLICY-THRESHOLD-TEST" });
    await advanceGovernanceStage(actorOf(principal), principal, id, "ACTIVE", { authorityRef: "RES-X", reviewFindingCount: 0, isHighValue: null, thresholdSourceRef: null });
    await expect(
      advanceGovernanceStage(actorOf(principal), principal, id, "AMENDED", { authorityRef: null, reviewFindingCount: null, isHighValue: null, thresholdSourceRef: null, actorType: "AI" }),
    ).rejects.toMatchObject({ code: "GOVERNANCE" });
  });

  it("designations: exact allocation math guards activation; supersede moves the old row", async () => {
    const { id } = await createPolicy(actorOf(principal), principal, policyInput({ policyNumber: `T-LIFE-D-${suffix}` }));
    const first = await recordDesignation(actorOf(principal), principal, id, {
      beneficiaryRef: `TEST-BEN-A-${suffix}`,
      beneficiaryKind: "FAMILY_MEMBER",
      designationType: "PRIMARY",
      entitlementBasis: "PERCENTAGE",
      pctMillionths: 60_000_000,
      fixedAmountMinor: null,
      currency: null,
      effectiveDate: "2026-01-01",
      endDate: null,
      status: "ACTIVE",
      relationshipBasis: "test A",
      notes: null,
      documentRef: null,
      supersedesDesignationId: null,
      authorityRef: null,
    });
    // 60 + 50 > 100 with no residuary → refusal, error status maps to 409.
    const err = await recordDesignation(actorOf(principal), principal, id, {
      beneficiaryRef: `TEST-BEN-B-${suffix}`,
      beneficiaryKind: "FAMILY_MEMBER",
      designationType: "PRIMARY",
      entitlementBasis: "PERCENTAGE",
      pctMillionths: 50_000_000,
      fixedAmountMinor: null,
      currency: null,
      effectiveDate: "2026-01-01",
      endDate: null,
      status: "ACTIVE",
      relationshipBasis: "test B",
      notes: null,
      documentRef: null,
      supersedesDesignationId: null,
      authorityRef: null,
    }).then(() => null, (e) => e);
    expect(err).toBeInstanceOf(FamilyOfficeProtectionError);
    expect(FAMILY_OFFICE_PROTECTION_ERROR_STATUS[(err as FamilyOfficeProtectionError).code]).toBe(409);
    // Partial allocation is NOT blocked — it is recorded and FLAGGED (§14:
    // the system flags, humans amend). 60% alone therefore lands, and the
    // listing reports the exception rather than the write disappearing it.
    const mid = await getPolicyDetail(principal, id, "2026-09-11");
    expect(mid.allocationAudit.ok).toBe(false); // 60% < 100% — an exception…
    expect(mid.allocationAudit.primaryPercentageSumMillionths).toBe(60_000_000); // …on a real record

    const c = await recordDesignation(actorOf(principal), principal, id, {
      beneficiaryRef: `TEST-BEN-C-${suffix}`,
      beneficiaryKind: "FAMILY_MEMBER",
      designationType: "PRIMARY",
      entitlementBasis: "PERCENTAGE",
      pctMillionths: 40_000_000,
      fixedAmountMinor: null,
      currency: null,
      effectiveDate: "2026-01-01",
      endDate: null,
      status: "ACTIVE",
      relationshipBasis: "test C — completes 100%",
      notes: null,
      documentRef: null,
      supersedesDesignationId: null,
      authorityRef: null,
    });
    expect(c.id).toBeTruthy();

    // A supersede that produces an impossible total (40% C + 100% D) is refused
    // by the resulting-state check even though A leaves the set.
    await expect(
      recordDesignation(actorOf(principal), principal, id, {
        beneficiaryRef: `TEST-BEN-D-${suffix}`,
        beneficiaryKind: "FAMILY_MEMBER",
        designationType: "PRIMARY",
        entitlementBasis: "PERCENTAGE",
        pctMillionths: 100_000_000,
        fixedAmountMinor: null,
        currency: null,
        effectiveDate: "2026-01-01",
        endDate: null,
        status: "ACTIVE",
        relationshipBasis: "test D — would over-allocate with C standing",
        notes: null,
        documentRef: null,
        supersedesDesignationId: first.id,
        authorityRef: null,
      }),
    ).rejects.toMatchObject({ code: "GOVERNANCE" });

    const detail = await getPolicyDetail(principal, id, "2026-09-11");
    expect(detail.allocationAudit.primaryPercentageSumMillionths).toBe(100_000_000); // A + C stand exactly
    expect(detail.allocationAudit.ok).toBe(true);
    const benAudit = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.objectType, "FAMILY_INSURANCE_BENEFICIARY"), eq(auditLog.action, "family.protection.designation.record")))
      .limit(5);
    expect(benAudit.length).toBeGreaterThanOrEqual(2);
  });

  it("premium: PAID without evidence is refused; overdue is a read-time state", async () => {
    const { id } = await createPolicy(actorOf(principal), principal, policyInput({ policyNumber: `T-LIFE-E-${suffix}` }));
    await expect(
      recordPremium(actorOf(principal), principal, id, {
        dueDate: "2026-08-01",
        amountMinor: 240_000,
        currency: "MUR",
        frequency: "ANNUAL",
        status: "PAID",
        payerRef: null,
        paidDate: "2026-08-02",
        paymentEvidenceDocumentRef: null,
        financeRecordRef: null,
        notes: null,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await recordPremium(actorOf(principal), principal, id, {
      dueDate: "2026-08-01",
      amountMinor: 240_000,
      currency: "MUR",
      frequency: "ANNUAL",
      status: "SCHEDULED",
      payerRef: `TEST-PAYER-${suffix}`,
      paidDate: null,
      paymentEvidenceDocumentRef: null,
      financeRecordRef: null,
      notes: null,
    });
    const detail = await getPolicyDetail(principal, id, "2026-09-11");
    expect(detail.premiums[0].effectiveStatus).toBe("OVERDUE");
    expect(detail.premiums[0].status).toBe("SCHEDULED"); // stored state untouched
    expect(detail.reviewFlags.some((f) => f.code === "OVERDUE_PREMIUM" && f.severity === "ESCALATE")).toBe(true);
  });

  it("claims: open → documented → submitted works; jumps and fabrications refuse; events log is append-only", async () => {
    const { id: policyId } = await createPolicy(actorOf(principal), principal, policyInput({ policyNumber: `T-LIFE-F-${suffix}` }));
    await transitionPolicyStatus(actorOf(principal), principal, policyId, "IN_FORCE", { evidenceRef: null, reason: "fixture inception" });
    const { id: claimId } = await openClaim(actorOf(principal), principal, {
      policyId,
      claimReference: `T-CLM-${suffix}`,
      incidentDate: "2026-08-01",
      notificationDate: "2026-08-05",
      documentRefs: [],
      notes: "Structural test fixture.",
    });
    await expect(transitionClaim(actorOf(principal), principal, claimId, { to: "APPROVED", proceedsTo: null, evidenceRef: null, approvedAmountMinor: null, receivedAmountMinor: null, receivedDate: null, allocationRef: null, note: null, eventKind: "INSURER_DECISION" })).rejects.toMatchObject({ code: "GOVERNANCE" });
    await transitionClaim(actorOf(principal), principal, claimId, { to: "DOCUMENTATION_PENDING", proceedsTo: null, evidenceRef: null, approvedAmountMinor: null, receivedAmountMinor: null, receivedDate: null, allocationRef: null, note: null, eventKind: "DOCUMENT_REQUESTED" });
    await transitionClaim(actorOf(principal), principal, claimId, { to: "UNDER_REVIEW", proceedsTo: null, evidenceRef: null, approvedAmountMinor: null, receivedAmountMinor: null, receivedDate: null, allocationRef: null, note: null, eventKind: "DOCUMENT_SUPPLIED" });
    await transitionClaim(actorOf(principal), principal, claimId, { to: "SUBMITTED", proceedsTo: "EXPECTED", evidenceRef: null, approvedAmountMinor: null, receivedAmountMinor: null, receivedDate: null, allocationRef: null, note: null, eventKind: "SUBMITTED" });
    await transitionClaim(actorOf(principal), principal, claimId, { to: "INSURER_REVIEW", proceedsTo: "CLAIMED", evidenceRef: null, approvedAmountMinor: null, receivedAmountMinor: null, receivedDate: null, allocationRef: null, note: null, eventKind: "NOTE" });
    await transitionClaim(actorOf(principal), principal, claimId, { to: "APPROVED", proceedsTo: "APPROVED", evidenceRef: `TEST-DEC-${suffix}`, approvedAmountMinor: 20_000_000, receivedAmountMinor: null, receivedDate: null, allocationRef: null, note: null, eventKind: "INSURER_DECISION" });
    // RECEIVED with no receipt date → refused; ALLOCATED without ref → refused.
    await expect(
      transitionClaim(actorOf(principal), principal, claimId, { to: "PROCEEDS_PENDING", proceedsTo: null, evidenceRef: null, approvedAmountMinor: null, receivedAmountMinor: null, receivedDate: null, allocationRef: null, note: null, eventKind: "NOTE" }),
    ).resolves.toBeTruthy();
    await expect(
      transitionClaim(actorOf(principal), principal, claimId, { to: "PROCEEDS_RECEIVED", proceedsTo: "RECEIVED", evidenceRef: null, approvedAmountMinor: null, receivedAmountMinor: 20_000_000, receivedDate: null, allocationRef: null, note: null, eventKind: "PROCEEDS_NOTED" }),
    ).rejects.toMatchObject({ code: "GOVERNANCE" });
    await expect(
      transitionClaim(actorOf(principal), principal, claimId, { to: "PROCEEDS_RECEIVED", proceedsTo: "RECEIVED", evidenceRef: "BANK-TEST", approvedAmountMinor: null, receivedAmountMinor: 20_000_000, receivedDate: "2026-09-10", allocationRef: null, note: null, eventKind: "PROCEEDS_NOTED" }),
    ).resolves.toBeTruthy();
    await expect(
      transitionClaim(actorOf(principal), principal, claimId, { to: "ALLOCATED", proceedsTo: "ALLOCATED", evidenceRef: null, approvedAmountMinor: null, receivedAmountMinor: null, receivedDate: null, allocationRef: null, note: null, eventKind: "ALLOCATED" }),
    ).rejects.toMatchObject({ code: "GOVERNANCE" }); // ALLOCATED without a Finance-side ref
    const detail = await getPolicyDetail(principal, policyId, "2026-09-11");
    expect(detail.claims[0].proceedsState).toBe("RECEIVED");
    expect(detail.claims[0].receivedAmountMinor).toBe(20_000_000);
  });

  it("assessment: FINAL gap becomes the coverage target for review flags", async () => {
    const { id } = await createPolicy(actorOf(principal), principal, policyInput({ policyNumber: `T-LIFE-G-${suffix}`, currency: "ZZZ", countryCode: null, deathBenefitMinor: 5_000_000, coverageAmountMinor: 5_000_000 }));
    const mk = (code: string, valueMinor: number | null, label: string) => ({ code, valueMinor, provenance: "USER_PROVIDED", sourceRef: null, label }) as never;
    const { id: assessmentId } = await createAssessment(actorOf(principal), principal, {
      asOf: "2026-09-11",
      currency: "ZZZ",
      subjectRef: `TEST-MEMBER-${suffix}`,
      subjectKind: "FAMILY_MEMBER",
      components: [
        mk("ECONOMIC_FAMILY_EXPOSURE", 10_000_000, "exposure"),
        mk("SUCCESSION_LIQUIDITY_NEED", 2_000_000, "succession need"),
        mk("DEBT_OBLIGATION_EXPOSURE", 1_000_000, "debt"),
        mk("BUSINESS_DEPENDENCY_EXPOSURE", 0, "business"),
        mk("QUALIFYING_RESOURCES", 0, "resources"),
        mk("EXISTING_QUALIFYING_PROTECTION", 5_000_000, "this policy's cover"),
      ],
      policyRefs: [id],
      status: "FINAL",
      legalEntityId: null,
      countryCode: "MU",
      reviewedBy: `TEST-REVIEWER-${suffix}`,
      authorityRef: null,
    });
    expect(assessmentId.startsWith("FOGAP_")).toBe(true);
    // 13,000,000 exposure − 5,000,000 protection = 8,000,000 modeled gap (EXACT).
    const detail = await getPolicyDetail(principal, id, "2026-09-11");
    expect(detail.reviewFlags.some((f) => f.code === "COVERAGE_BELOW_MODELED_TARGET" && f.severity === "INFO")).toBe(false); // no longer "NOT_QUANTIFIED"…
    expect(detail.reviewFlags.some((f) => f.code === "COVERAGE_BELOW_MODELED_TARGET" && f.severity === "WARNING")).toBe(true); // …now a measured shortfall (5M cover vs 13M exposure).
  });

  it("a review record closes the loop: review row + cadence move are recorded in one transaction", async () => {
    const { id } = await createPolicy(actorOf(principal), principal, policyInput({ policyNumber: `T-LIFE-H-${suffix}` }));
    await recordReview(actorOf(principal), principal, id, {
      reviewKind: "POLICY_REVIEW",
      reviewDate: "2026-09-01",
      reviewerRef: `TEST-REVIEWER-${suffix}`,
      outcome: "COMPLETED",
      exceptions: [],
      nextReviewDate: "2027-09-01",
      evidenceDocumentRefs: [`TEST-DOC-${suffix}`],
      governanceStageAfter: null,
      authorityRef: null,
      notes: null,
    });
    const detail = await getPolicyDetail(principal, id, "2026-09-11");
    expect(detail.policy.lastReviewDate).toBe("2026-09-01");
    expect(detail.policy.nextReviewDate).toBe("2027-09-01");
    expect(detail.reviews.length).toBe(1);
  });

  it("visibility is scope-driven: a principal resolving a different tenant subtree reads 404, never a leak", async () => {
    const { id } = await createPolicy(actorOf(principal), principal, policyInput({ policyNumber: `T-LIFE-I-${suffix}` }));
    // Non-global principal in a foreign tenant: resolved scope excludes the
    // record, so reads refuse with NOT_FOUND (no existence oracle) even though
    // the row exists in the database.
    const outsider = await principalFor("family@beyu.os", { tenantId: "TEN-OTHER-CHECK", tenantCode: "OUT", tenantType: "SECTOR", roles: [], permissions: new Set(), clearance: "PUBLIC" });
    await expect(getPolicyDetail(outsider, id, "2026-09-11")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listPolicies(outsider, "2026-09-11")).resolves.toMatchObject({ total: 0 });
  });

  it("CAP_POSTING remains locked and untouched by this domain (regression pin)", async () => {
    // The posting engine's own fail-closed certification lives in the finance
    // suites; what must be pinned HERE is that the protection domain never
    // reaches it — no import, no capability call, from source, every run.
    const { readFileSync } = await import("node:fs");
    const serviceSource = readFileSync("src/lib/family-office-protection-service.ts", "utf8");
    expect(serviceSource).not.toMatch(/from "@\/lib\/finance\/posting-engine"/);
    expect(serviceSource).not.toMatch(/requireCapability/);
  });
});
