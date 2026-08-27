/**
 * Family Office — domain rails tests (beneficiary, trust, capital, loan,
 * governance, constitution, identity, documents, lifestyle, philanthropy,
 * education, wealth).
 *
 * Requirements covered: R19 (genealogy ≠ entitlement), R20 (trustee
 * engine), R21 (FIR-018 boundary), R22 (Finance references + handoff
 * composition), R23 (loan terms no-default), R24 (governance
 * mechanics), R25 (constitution effectivity), R26 (document ≠
 * authority), R27 (identity reference-only).
 */

import { describe, expect, it } from "vitest";
import { FamilyError } from "../../../src/lib/family/phase3/errors";
import { validateCapitalInstruction, type FamilyCapitalInstruction } from "../../../src/lib/family/phase3/contracts";
import { buildRatificationRegistry, registerRatification, type FamilyRatificationRecord } from "../../../src/lib/family/office/ratification";
import { resolvePolicy } from "../../../src/lib/family/office/policy";
import { evaluateBeneficiaryEligibility, assertBeneficiaryStatusRecord } from "../../../src/lib/family/office/beneficiary";
import { assertTrustReference, assertTrusteeAppointment, assertTrusteeRemoval, assertTrustClause, evaluateTrusteeEligibility, TRUST_CLAUSE_TYPES } from "../../../src/lib/family/office/trust";
import { assertWealthReference, assertPlanningAssessment, assertObservationIsNotAuthority, assertLifecycleObservation } from "../../../src/lib/family/office/wealth";
import { assertLoanReference, validateProposedLoan, type LoanTermsRule } from "../../../src/lib/family/office/loan";
import { assertCapitalReference, validateCapitalInstructionHandoff } from "../../../src/lib/family/office/capital";
import { evaluateQuorum, evaluateVote, assertFamilyDecision, assertApprovalDecision } from "../../../src/lib/family/office/governance";
import { assertFamilyConstitution, assessAmendmentEffectivity, draftIsNeverEffective, type AmendmentProposal, type AmendmentApproval } from "../../../src/lib/family/office/constitution";
import { assertFamilyRelationship, assertFamilyMember } from "../../../src/lib/family/office/identity";
import { assertFamilyDocumentRef, assertDocumentIsNotAuthority, assertVersionChain } from "../../../src/lib/family/office/documents";
import { assertLifestyleApproval, assertLifestyleRequest } from "../../../src/lib/family/office/lifestyle";
import { assertGiftReference, evaluateCauseEligibility } from "../../../src/lib/family/office/philanthropy";
import { assertEducationFundingReference, evaluateEducationEligibility } from "../../../src/lib/family/office/education";
import { D, TENANT, TENANT_SCOPE, policyDef, ratificationRecord } from "./fixtures";

const AS_OF = D.asOf;

/* ------------------------------------------------------------------ */
/* R19 — genealogy ≠ entitlement                                       */
/* ------------------------------------------------------------------ */
describe("R19 — beneficiary: relationship never confers status", () => {
  it("DESIGNATED status without a ratified basis is refused", () => {
    expect(() =>
      assertBeneficiaryStatusRecord({
        beneficiaryRef: "B-1",
        status: "DESIGNATED",
        statusBasisRef: null,
        period: null,
        tenantId: TENANT,
      }),
    ).toThrowError(/statusBasisRef/);
  });

  it("a DESIGNATED status WITH a ratified basis passes", () => {
    expect(() =>
      assertBeneficiaryStatusRecord({
        beneficiaryRef: "B-1",
        status: "DESIGNATED",
        statusBasisRef: "TRUSTEE-DEC-1",
        period: { effectiveFrom: D.effectiveFrom, effectiveTo: null },
        tenantId: TENANT,
      }),
    ).not.toThrow();
  });

  it("eligibility with no ratified rule → POLICY_DECISION_REQUIRED", () => {
    const outcome = evaluateBeneficiaryEligibility(null, { beneficiaryRef: "B-1", contextKey: "genealogical.child" });
    expect(outcome.state).toBe("POLICY_DECISION_REQUIRED");
    expect((outcome as { reason: string }).reason).toMatch(/not eligibility and not ineligibility/i);
  });

  it("eligibility lookup: a genealogical context is only eligible if the RATIFIED rule says so", () => {
    const rule = { ruleRef: "RULE-1", policyKey: "beneficiary.eligibility", contextMap: { "genealogical.child": "NOT_ELIGIBLE" as const } };
    const no = evaluateBeneficiaryEligibility(rule, { beneficiaryRef: "B-1", contextKey: "genealogical.child" });
    expect(no.state).toBe("RESOLVED");
    if (no.state !== "RESOLVED") return;
    expect(no.value.result).toBe("NOT_ELIGIBLE");
    // A context the rule does not cover is UNRESOLVED — not a default.
    const gap = evaluateBeneficiaryEligibility(rule, { beneficiaryRef: "B-2", contextKey: "adopted.member" });
    expect(gap.state).toBe("POLICY_DECISION_REQUIRED");
  });
});

/* ------------------------------------------------------------------ */
/* R20 — trustee engine: references + chain, clauses inert             */
/* ------------------------------------------------------------------ */
describe("R20 — trust/trustee engine", () => {
  it("a trust reference requires an explicit jurisdiction and an instrument", () => {
    expect(() => assertTrustReference({ trustRef: "TR-1", legalEntityRef: null, instrumentRefs: ["INST-1"], tenantId: TENANT, jurisdictionRef: "" })).toThrowError(/jurisdiction/i);
    expect(() => assertTrustReference({ trustRef: "TR-1", legalEntityRef: null, instrumentRefs: [], tenantId: TENANT, jurisdictionRef: "TZ" })).toThrowError(/instrument/i);
    expect(() => assertTrustReference({ trustRef: "TR-1", legalEntityRef: "LE-1", instrumentRefs: ["INST-1"], tenantId: TENANT, jurisdictionRef: "TZ" })).not.toThrow();
  });

  it("an appointment without its appointing authority or clause is refused", () => {
    expect(() =>
      assertTrusteeAppointment({
        appointmentRef: "AP-1",
        trusteeRef: "TST-1",
        trustRef: "TR-1",
        appointingAuthorityRef: "",
        instrumentClauseRef: "CL-1",
        period: { effectiveFrom: D.effectiveFrom, effectiveTo: null },
        status: "ACTIVE",
      }),
    ).toThrowError(/appointing authority/i);
  });

  it("a removal without its ratified basis is refused", () => {
    expect(() =>
      assertTrusteeRemoval({
        removalRef: "RM-1",
        trusteeRef: "TST-1",
        trustRef: "TR-1",
        removalBasisRef: "",
        authorityRef: "AUTH-1",
        effectiveFrom: D.effectiveFrom,
        tenantId: TENANT,
      }),
    ).toThrowError(/basis/i);
  });

  it("clause types are structural tags; null legal effect = inert (no effect assumed)", () => {
    expect(() =>
      assertTrustClause({ clauseRef: "CL-1", instrumentRef: "INST-1", clauseType: "SPENDTHRIFT_PROVISION", legalEffectReference: null, version: 1 }),
    ).not.toThrow();
    expect(() => assertTrustClause({ clauseRef: "CL-1", instrumentRef: "INST-1", clauseType: "UNKNOWN_CLAUSE" as never, legalEffectReference: null, version: 1 })).toThrowError();
    expect(TRUST_CLAUSE_TYPES).toContain("NO_CONTEST_PROVISION");
    expect(TRUST_CLAUSE_TYPES).toContain("DISCRETIONARY_DISTRIBUTION_CLAUSE");
  });

  it("trustee eligibility: no rule → POLICY_DECISION_REQUIRED (genealogy never confers it)", () => {
    expect(evaluateTrusteeEligibility(null, "family.member").state).toBe("POLICY_DECISION_REQUIRED");
    const rule = { ruleRef: "RULE-T", policyKey: "trustee.eligibility", contextMap: { "independent.professional": "ELIGIBLE" as const } };
    const ok = evaluateTrusteeEligibility(rule, "independent.professional");
    expect(ok.state).toBe("RESOLVED");
    if (ok.state !== "RESOLVED") return;
    expect(ok.value.result).toBe("ELIGIBLE");
  });
});

/* ------------------------------------------------------------------ */
/* R21 — FIR-018: financial state refused                              */
/* ------------------------------------------------------------------ */
describe("R21 — the FIR-018 finance boundary is machine-enforced", () => {
  it("a wealth record without a Finance reference is refused", () => {
    expect(() =>
      assertWealthReference({ wealthRef: "W-1", financeWealthRef: "", partyRef: "P-1", legalEntityRef: null, tenantId: TENANT }),
    ).toThrowError(FamilyError);
  });

  it("a wealth record carrying financial state is refused (FIR-018)", () => {
    const bad = { wealthRef: "W-1", financeWealthRef: "FIN-1", partyRef: "P-1", legalEntityRef: null, tenantId: TENANT, balance: 1000 } as never;
    try {
      assertWealthReference(bad);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FamilyError);
      expect((e as FamilyError).code).toBe("FINANCE_BOUNDARY_VIOLATION");
      expect((e as FamilyError).message).toMatch(/balance/i);
    }
  });

  it("a loan reference without a Finance loan reference is refused", () => {
    expect(() =>
      assertLoanReference({ loanRef: "L-1", financeLoanRef: "", borrowerRef: "P-1", lenderRef: "LE-1", tenantId: TENANT }),
    ).toThrowError(FamilyError);
  });

  it("an advisory planning assessment only becomes a record through human acceptance", () => {
    expect(() =>
      assertPlanningAssessment({
        assessmentRef: "PA-1",
        planningRef: "PE-1",
        advisoryOutputRef: "ADV-1",
        reviewedBy: null,
        summary: "advisory",
        status: "ACCEPTED",
        assessedAt: "2026-03-01",
        tenantId: TENANT,
      }),
    ).toThrowError(/human reviewer/i);
    expect(() =>
      assertPlanningAssessment({
        assessmentRef: "PA-1",
        planningRef: "PE-1",
        advisoryOutputRef: "ADV-1",
        reviewedBy: "user-reviewer",
        summary: "advisory",
        status: "ACCEPTED",
        assessedAt: "2026-03-01",
        tenantId: TENANT,
      }),
    ).not.toThrow();
  });

  it("a lifecycle observation is evidence and changes nothing by itself", () => {
    const obs = { observationRef: "OBS-1", partyRef: "P-1", eventType: "BIRTH" as const, observedAt: "2026-03-01", evidenceRef: "DOC-OBS-1", tenantId: TENANT };
    expect(() => assertLifecycleObservation(obs)).not.toThrow();
    expect(assertObservationIsNotAuthority(obs)).toEqual({ changesAuthority: false, changesEntitlement: false, changesBeneficiaryStatus: false });
    expect(() => assertLifecycleObservation({ ...obs, evidenceRef: "" })).toThrowError();
  });
});

/* ------------------------------------------------------------------ */
/* R22 — capital/loan compose the canonical Finance handoff            */
/* ------------------------------------------------------------------ */
function capitalInstruction(overrides: Partial<FamilyCapitalInstruction> = {}): FamilyCapitalInstruction {
  return {
    id: "CI-1",
    tenantId: TENANT,
    institutionScopeRef: null,
    purpose: "Fixture purpose (no value).",
    requesterPartyId: "P-1",
    targetLegalEntityId: "LE-1",
    policyRefs: [{ policyId: "capital.approval", policyVersion: "1" }],
    resolutionRefs: [{ kind: "RESOLUTION", referenceId: "RES-1" }],
    evidenceRefs: [],
    actor: { actorType: "HUMAN", actorUserId: "user-1" },
    jurisdictionRef: null,
    assessment: null,
    submittedPayload: null,
    financeRequestId: null,
    familyStatus: "DRAFT",
    createdAt: "2026-03-01",
    ...overrides,
  };
}

describe("R22 — capital instruction handoff composes the canonical contract", () => {
  const def = policyDef("capital.approval", "FAMILY_CAPITAL", { delegable: "BOOLEAN" });

  it("the contract alone refuses an AI actor and financial state", () => {
    const ai = capitalInstruction({ actor: { actorType: "AI", actorUserId: "noelia" } as never });
    const check = validateCapitalInstruction(ai);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.violations.some((v) => v.code === "HUMAN_ACTOR_REQUIRED")).toBe(true);
    const withBalance = { ...capitalInstruction(), balance: 500 } as never;
    const check2 = validateCapitalInstruction(withBalance);
    expect(check2.ok).toBe(false);
    if (check2.ok) return;
    expect(check2.violations.some((v) => v.code === "FINANCE_BOUNDARY_VIOLATION")).toBe(true);
  });

  it("an instruction citing an UNRESOLVED policy is POLICY_DECISION_REQUIRED", () => {
    const registry = buildRatificationRegistry([def], [], []);
    const outcome = validateCapitalInstructionHandoff(registry.policies, capitalInstruction(), AS_OF);
    expect(outcome.state).toBe("POLICY_DECISION_REQUIRED");
  });

  it("an instruction citing a RESOLVED policy passes the composition", () => {
    const rec = ratificationRecord("RES-CAP", "capital.approval", 1, [{ key: "delegable", kind: "BOOLEAN", value: true }]);
    const { registry } = registerRatification(buildRatificationRegistry([def], [], []), rec, TENANT_SCOPE, AS_OF);
    const outcome = validateCapitalInstructionHandoff(registry.policies, capitalInstruction(), AS_OF);
    expect(outcome.state).toBe("RESOLVED");
  });

  it("a capital reference without a Finance reference is refused", () => {
    expect(() =>
      assertCapitalReference({ capitalRef: "C-1", financeReference: "", tenantId: TENANT, legalEntityId: null, purpose: "x" }),
    ).toThrowError(FamilyError);
  });
});

/* ------------------------------------------------------------------ */
/* R23 — loan terms: no default, ever                                  */
/* ------------------------------------------------------------------ */
const LOAN_RULE: LoanTermsRule = {
  ruleRef: "RULE-LOAN",
  policyKey: "loan.terms",
  interestRateMin: 0.02,
  interestRateMax: 0.05,
  termDaysMin: 90,
  termDaysMax: 365,
  eligibleContexts: ["family.member"],
  securityRef: null,
};

describe("R23 — loan terms are never a default", () => {
  it("no ratified terms → POLICY_DECISION_REQUIRED (no 0%, no standard term)", () => {
    const outcome = validateProposedLoan(null, {
      proposedLoanRef: "PL-1",
      borrowerRef: "P-1",
      borrowerContextKey: "family.member",
      proposedInterestRate: 0,
      proposedTermDays: 30,
      securityRef: null,
      tenantId: TENANT,
    });
    expect(outcome.state).toBe("POLICY_DECISION_REQUIRED");
    expect((outcome as { reason: string }).reason).toMatch(/never a default/i);
  });

  it("a borrower the rule does not cover is DENIED (absence of coverage is not coverage)", () => {
    const outcome = validateProposedLoan(LOAN_RULE, {
      proposedLoanRef: "PL-1",
      borrowerRef: "P-1",
      borrowerContextKey: "outsider",
      proposedInterestRate: 0.03,
      proposedTermDays: 180,
      securityRef: null,
      tenantId: TENANT,
    });
    expect(outcome.state).toBe("DENIED");
  });

  it("a rate outside the ratified bounds is DENIED with the exact bound named", () => {
    const outcome = validateProposedLoan(LOAN_RULE, {
      proposedLoanRef: "PL-1",
      borrowerRef: "P-1",
      borrowerContextKey: "family.member",
      proposedInterestRate: 0.15,
      proposedTermDays: 180,
      securityRef: null,
      tenantId: TENANT,
    });
    expect(outcome.state).toBe("DENIED");
    expect((outcome as { reason: string }).reason).toMatch(/\[0\.02, 0\.05\]/);
  });

  it("a term outside the ratified bounds is DENIED", () => {
    const outcome = validateProposedLoan(LOAN_RULE, {
      proposedLoanRef: "PL-1",
      borrowerRef: "P-1",
      borrowerContextKey: "family.member",
      proposedInterestRate: 0.03,
      proposedTermDays: 10,
      securityRef: null,
      tenantId: TENANT,
    });
    expect(outcome.state).toBe("DENIED");
  });

  it("terms within the ratified bounds → RESOLVED (hand off to Finance; the office never creates the loan)", () => {
    const outcome = validateProposedLoan(LOAN_RULE, {
      proposedLoanRef: "PL-1",
      borrowerRef: "P-1",
      borrowerContextKey: "family.member",
      proposedInterestRate: 0.03,
      proposedTermDays: 180,
      securityRef: null,
      tenantId: TENANT,
    });
    expect(outcome.state).toBe("RESOLVED");
    if (outcome.state !== "RESOLVED") return;
    expect(outcome.value.financeHandoffRequired).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* R24 — governance mechanics are policy-configured                    */
/* ------------------------------------------------------------------ */
describe("R24 — governance: quorum/vote evaluate RATED values only", () => {
  const qdef = policyDef("governance.quorum", "FAMILY_GOVERNANCE", { quorum: "NUMBER" });
  const vdef = policyDef("governance.approvalThreshold", "FAMILY_GOVERNANCE", { approvalThreshold: "NUMBER" });

  it("quorum without a ratified value → POLICY_DECISION_REQUIRED (no 0.66, nothing)", () => {
    const registry = buildRatificationRegistry([qdef], [], []);
    const outcome = evaluateQuorum(registry.policies, "governance.quorum", 2, AS_OF);
    expect(outcome.state).toBe("POLICY_DECISION_REQUIRED");
  });

  it("quorum with a ratified value evaluates arithmetic on the RATED number", () => {
    const rec = ratificationRecord("RES-Q", "governance.quorum", 1, [{ key: "quorum", kind: "NUMBER", value: 3 }]);
    const { registry } = registerRatification(buildRatificationRegistry([qdef], [], []), rec, TENANT_SCOPE, AS_OF);
    expect(evaluateQuorum(registry.policies, "governance.quorum", 3, AS_OF)).toEqual({ state: "RESOLVED", value: { met: true, required: 3, present: 3 } });
    expect(evaluateQuorum(registry.policies, "governance.quorum", 2, AS_OF)).toEqual({ state: "RESOLVED", value: { met: false, required: 3, present: 2 } });
  });

  it("an unrecorded vote has no result", () => {
    const registry = buildRatificationRegistry([vdef], [], []);
    const outcome = evaluateVote(registry.policies, "governance.approvalThreshold", { votingEventRef: "VE-1", decisionRef: "DEC-1", voterRefs: [], recordedOutcome: null, heldAt: null }, AS_OF);
    expect(outcome.state).toBe("DENIED");
  });

  it("a vote without a ratified threshold → POLICY_DECISION_REQUIRED", () => {
    const registry = buildRatificationRegistry([vdef], [], []);
    const outcome = evaluateVote(
      registry.policies,
      "governance.approvalThreshold",
      { votingEventRef: "VE-1", decisionRef: "DEC-1", voterRefs: ["u1", "u2"], recordedOutcome: { for: 2, against: 0, abstain: 0 }, heldAt: "2026-03-01" },
      AS_OF,
    );
    expect(outcome.state).toBe("POLICY_DECISION_REQUIRED");
  });

  it("a vote against a ratified threshold computes the outcome", () => {
    const rec = ratificationRecord("RES-V", "governance.approvalThreshold", 1, [{ key: "approvalThreshold", kind: "NUMBER", value: 0.5 }]);
    const { registry } = registerRatification(buildRatificationRegistry([vdef], [], []), rec, TENANT_SCOPE, AS_OF);
    const outcome = evaluateVote(
      registry.policies,
      "governance.approvalThreshold",
      { votingEventRef: "VE-1", decisionRef: "DEC-1", voterRefs: ["u1", "u2", "u3"], recordedOutcome: { for: 2, against: 1, abstain: 0 }, heldAt: "2026-03-01" },
      AS_OF,
    );
    expect(outcome.state).toBe("RESOLVED");
    if (outcome.state !== "RESOLVED") return;
    expect(outcome.value.passed).toBe(true);
    expect(outcome.value.threshold).toBe(0.5);
  });

  it("an APPROVED decision without its authority reference is refused", () => {
    expect(() =>
      assertFamilyDecision({
        decisionRef: "DEC-1",
        bodyRef: "BODY-1",
        matter: "fixture",
        policyRefs: [],
        evidenceRefs: [],
        status: "APPROVED",
        authorityRef: null,
        createdAt: "2026-03-01",
        tenantId: TENANT,
      }),
    ).toThrowError(/authority reference/i);
  });

  it("an AI actor cannot record an approval", () => {
    expect(() =>
      assertApprovalDecision({
        approvalRef: "APR-1",
        requestId: "AR-1",
        approverUserId: "NOELIA",
        decision: "APPROVED",
        authorityRef: "RES-1",
        decidedAt: "2026-03-01",
        tenantId: TENANT,
      }),
    ).toThrowError(FamilyError);
  });
});

/* ------------------------------------------------------------------ */
/* R25 — constitution: existence is not effect                         */
/* ------------------------------------------------------------------ */
describe("R25 — constitution effectivity requires the full ratified chain", () => {
  it("a DRAFT version is never effective, however complete", () => {
    const c = {
      constitutionRef: "CON-1",
      documentRef: "DOC-CON",
      documentChecksum: "sha256:x",
      version: 2,
      status: "DRAFT" as const,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      supersededByRef: null,
      ratificationDecisionId: "RES-CLAIM",
      scopeTenantId: TENANT,
      jurisdictionRef: "TZ",
    };
    expect(draftIsNeverEffective(c).effective).toBe(false);
    expect(() => assertFamilyConstitution({ ...c, status: "ACTIVE", ratificationDecisionId: null })).toThrowError(/existence is not effect/i);
  });

  it("an amendment is effective only via the registered, active, in-period ratification", () => {
    const adef = policyDef("constitution.amendment.v2", "FAMILY_GOVERNANCE", { amendmentScope: "REFERENCE" });
    const proposal: AmendmentProposal = { proposalRef: "AM-1", constitutionRef: "CON-1", clauseRefs: ["CL-1"], proposedBy: "user-1", stage: "APPROVED", createdAt: "2026-01-10", effective: false };
    const approval: AmendmentApproval = { approvalRef: "AMAP-1", proposalRef: "AM-1", ratificationDecisionId: "RES-AM-1", approvedAt: "2026-01-15" };

    // No registered ratification → inert.
    const empty = buildRatificationRegistry([adef], [], []);
    const none = assessAmendmentEffectivity(empty, proposal, approval, AS_OF);
    expect(none.effective).toBe(false);
    expect(none.reason).toMatch(/not in the registry/i);

    // Registered and in force → effective.
    const rec = ratificationRecord("RES-AM-1", "constitution.amendment.v2", 2, [{ key: "amendmentScope", kind: "REFERENCE", value: "CON-1" }]);
    const { registry } = registerRatification(empty, rec, TENANT_SCOPE, AS_OF);
    const ok = assessAmendmentEffectivity(registry, proposal, approval, AS_OF);
    expect(ok.effective).toBe(true);
    expect(ok.resultingVersion).toBe(2);
  });

  it("a revoked ratification makes the amendment inert again", () => {
    const adef = policyDef("constitution.amendment.v3", "FAMILY_GOVERNANCE", { amendmentScope: "REFERENCE" });
    const empty = buildRatificationRegistry([adef], [], []);
    const rec = ratificationRecord("RES-AM-2", "constitution.amendment.v3", 3, [{ key: "amendmentScope", kind: "REFERENCE", value: "CON-1" }]);
    const { registry: withRec } = registerRatification(empty, rec, TENANT_SCOPE, AS_OF);
    // Build a registry whose record is REVOKED (deterministic construction).
    const records = new Map<string, FamilyRatificationRecord>();
    for (const [k, r] of withRec.records) {
      records.set(k, k === "RES-AM-2" ? { ...r, status: "REVOKED" as const } : r);
    }
    const revokedRegistry = { ...withRec, records };
    const proposal: AmendmentProposal = { proposalRef: "AM-2", constitutionRef: "CON-1", clauseRefs: [], proposedBy: "user-1", stage: "APPROVED", createdAt: "2026-01-10", effective: false };
    const approval: AmendmentApproval = { approvalRef: "AMAP-2", proposalRef: "AM-2", ratificationDecisionId: "RES-AM-2", approvedAt: "2026-01-15" };
    const outcome = assessAmendmentEffectivity(revokedRegistry, proposal, approval, AS_OF);
    expect(outcome.effective).toBe(false);
    expect(outcome.reason).toMatch(/revoked/i);
  });
});

/* ------------------------------------------------------------------ */
/* R26 — document ≠ authority                                          */
/* ------------------------------------------------------------------ */
describe("R26 — documents and instruments never carry authority", () => {
  it("a document reference without its checksum is refused (evidence is checksum-bound)", () => {
    expect(() =>
      assertFamilyDocumentRef({
        documentRef: "DOC-1",
        checksum: "",
        version: 1,
        period: null,
        jurisdictionRef: null,
        classification: "CONFIDENTIAL",
      }),
    ).toThrowError(/checksum/i);
  });

  it("an authority-conferring field on a document/instrument is refused", () => {
    expect(() => assertDocumentIsNotAuthority({ documentRef: "DOC-1", confersAuthority: true }, "instrument")).toThrowError(/document ≠ authority/i);
    expect(assertDocumentIsNotAuthority({ documentRef: "DOC-1" }, "instrument")).toEqual([]);
  });

  it("a superseded version must name its successor", () => {
    expect(() => assertVersionChain(2, null, "SUPERSEDED")).toThrowError(/successor/i);
    expect(() => assertVersionChain(2, "DOC-3", "SUPERSEDED")).not.toThrow();
    expect(() => assertVersionChain(0, null, "ACTIVE")).toThrowError(/positive integer/i);
  });
});

/* ------------------------------------------------------------------ */
/* R27 — identity is reference-only                                    */
/* ------------------------------------------------------------------ */
describe("R27 — identity rails are references, never rights", () => {
  it("a member reference requires canonical identity fields", () => {
    expect(() =>
      assertFamilyMember({
        memberRef: "M-1",
        globalUserId: "",
        partyRef: "P-1",
        legalEntityRef: null,
        scope: TENANT_SCOPE,
        countryCode: "TZ",
        participation: null,
      }),
    ).toThrowError(/globalUserId/i);
    expect(() =>
      assertFamilyMember({
        memberRef: "M-1",
        globalUserId: "GU-1",
        partyRef: "P-1",
        legalEntityRef: null,
        scope: TENANT_SCOPE,
        countryCode: "TZ",
        participation: null,
      }),
    ).not.toThrow();
  });

  it("a relationship edge uses the closed lineage vocabulary and never self-loops", () => {
    expect(() =>
      assertFamilyRelationship({
        relationshipRef: "R-1",
        fromMemberRef: "M-1",
        toMemberRef: "M-1",
        relationshipType: "BIRTH_DESCENDANT",
        evidenceRef: null,
        legalEffectReference: null,
        tenantId: TENANT,
      }),
    ).toThrowError(/self/i);
    expect(() =>
      assertFamilyRelationship({
        relationshipRef: "R-1",
        fromMemberRef: "M-1",
        toMemberRef: "M-2",
        relationshipType: "MYSTICAL_BOND" as never,
        evidenceRef: null,
        legalEffectReference: null,
        tenantId: TENANT,
      }),
    ).toThrowError(/lineage vocabulary/i);
    expect(() =>
      assertFamilyRelationship({
        relationshipRef: "R-1",
        fromMemberRef: "M-1",
        toMemberRef: "M-2",
        relationshipType: "BIRTH_DESCENDANT",
        evidenceRef: null,
        legalEffectReference: null,
        tenantId: TENANT,
      }),
    ).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* remaining domain rails (lifestyle, philanthropy, education)         */
/* ------------------------------------------------------------------ */
describe("lifestyle — approvals are human and referenced", () => {
  it("an AI lifestyle approval is refused", () => {
    expect(() =>
      assertLifestyleApproval({
        approvalRef: "LA-1",
        requestRef: "LR-1",
        approverUserId: "noelia",
        decision: "APPROVED",
        authorityRef: "RES-1",
        decidedAt: "2026-03-01",
        tenantId: TENANT,
      }),
    ).toThrowError(FamilyError);
  });

  it("a fulfilled request without its approval reference is refused", () => {
    expect(() =>
      assertLifestyleRequest({
        requestRef: "LR-1",
        partyRef: "P-1",
        category: "TRAVEL",
        purpose: "fixture",
        requestedBy: "user-1",
        requestedAt: "2026-03-01",
        status: "FULFILLED",
        approvalRef: null,
        financeReference: null,
        tenantId: TENANT,
      }),
    ).toThrowError(/approval reference/i);
  });
});

describe("philanthropy — no cause is permitted by default", () => {
  it("no ratified distribution rule → POLICY_DECISION_REQUIRED", () => {
    expect(evaluateCauseEligibility(null, "education.local").state).toBe("POLICY_DECISION_REQUIRED");
  });

  it("an unmapped cause is unresolved, not permitted", () => {
    const rule = { ruleRef: "RULE-P", policyKey: "philanthropy.distribution", contextMap: { "health.local": "PERMITTED" as const } };
    expect(evaluateCauseEligibility(rule, "gaming.outsidedomestic").state).toBe("POLICY_DECISION_REQUIRED");
    expect(evaluateCauseEligibility(rule, "health.local").state).toBe("RESOLVED");
  });

  it("a gift without its Finance outflow reference is refused (FIR-018)", () => {
    expect(() =>
      assertGiftReference({
        giftRef: "G-1",
        vehicleRef: "V-1",
        financeGiftRef: "",
        recipientRef: "REC-1",
        causeContextKey: "health.local",
        authorityRef: "RES-1",
        evidenceRefs: [],
        effectiveFrom: "2026-03-01",
        tenantId: TENANT,
      }),
    ).toThrowError(FamilyError);
  });
});

describe("education — funding is reference + ratified policy + human authority", () => {
  it("education funding without its ratified policy reference is refused", () => {
    expect(() =>
      assertEducationFundingReference({
        fundingRef: "EF-1",
        engagementRef: "EE-1",
        financeFundingRef: "FIN-EF-1",
        authorityRef: "RES-1",
        policyRef: "",
        effectiveFrom: "2026-03-01",
        tenantId: TENANT,
      }),
    ).toThrowError(/policy/i);
  });

  it("education eligibility: no rule → POLICY_DECISION_REQUIRED (relationship ≠ entitlement)", () => {
    expect(evaluateEducationEligibility(null, "child.member").state).toBe("POLICY_DECISION_REQUIRED");
  });
});

describe("resolvePolicy sanity (registry shared by domains)", () => {
  it("an unratified policy never resolves (spot check used by multiple domains)", () => {
    const def = policyDef("test.spot", "FAMILY_INSTITUTION", { x: "STRING" });
    const registry = buildRatificationRegistry([def], [], []);
    expect(resolvePolicy(registry.policies, "test.spot", AS_OF).state).toBe("POLICY_DECISION_REQUIRED");
  });
});
