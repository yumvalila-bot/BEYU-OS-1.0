import { describe, expect, it } from "vitest";
import {
  assessDelegation,
  assessEmergencyAuthority,
  assertDecisionAuthorityIsHuman,
  evaluateDecisionGate,
  type DecisionRequest,
} from "../../src/lib/family/decision-gate";
import {
  ALIGNMENT_REFERENCE_DOMAINS,
  evaluateAlignment,
  evaluateAlignmentAcrossHorizons,
  assertWithinNoeliaBoundary,
  horizonFor,
  summariseAssessments,
  type AlignmentReference,
  type DecisionUnderTest,
} from "../../src/lib/family/alignment";
import {
  findInventedPolicies,
  openRequirements,
  policyDecisionRegister,
  raisePolicyDecisionRequirement,
  resolvePolicyDecision,
  summariseRegister,
  STANDING_POLICY_DECISIONS,
} from "../../src/lib/family/policy-decisions";
import type { AlignmentReferenceDomain } from "../../src/lib/family/model";

/**
 * Decision gate, Noelia alignment engine and the policy decision register.
 */

const fullRequest = (over: Partial<DecisionRequest> = {}): DecisionRequest => ({
  decisionId: "FDX_1",
  matter: "Approve a TZS 250m equity participation in an industrial venture.",
  domain: "FAMILY_CAPITAL",
  requestedBy: "CIO",
  actorType: "HUMAN",
  amountMinor: 250_000_000,
  currency: "TZS",
  materialityThresholdMinor: 100_000_000,
  validation: { complete: true, missingFields: [] },
  policyReference: "FIP-2.4",
  authorityReference: "FC-3.2",
  conflictAssessment: { cleared: true, reference: "FCI_12" },
  riskAssessment: { withinAppetite: true, score: 40, reference: "RSK_88" },
  approval: { approvedBy: "FAMILY_COUNCIL", reference: "FC-RES-041" },
  executionReference: "CAP_500",
  recordReference: "GDR_2026_018",
  auditReference: "AUD_900",
  monitoringPlan: "Quarterly performance review by the Family Investment Committee.",
  ...over,
});

describe("the 11-step decision gate", () => {
  it("completes a fully evidenced decision through MONITOR", () => {
    const a = evaluateDecisionGate(fullRequest());
    expect(a.complete).toBe(true);
    expect(a.stepReached).toBe("MONITOR");
    expect(a.blockingStep).toBeNull();
    expect(a.material).toBe(true);
  });

  it("halts at the first failure and never marks a later step PASSED", () => {
    const a = evaluateDecisionGate(fullRequest({ policyReference: null }));
    expect(a.blockingStep).toBe("CHECK_POLICY");
    expect(a.complete).toBe(false);
    expect(a.steps.find((s) => s.step === "CHECK_AUTHORITY")?.state).toBe("NOT_REACHED");
  });

  it("stops an AI actor at CHECK_RISK and records the boundary", () => {
    const a = evaluateDecisionGate(fullRequest({ actorType: "AI" }));
    expect(a.aiBoundaryApplied).toBe(true);
    expect(a.complete).toBe(false);
    expect(a.steps.find((s) => s.step === "CHECK_RISK")?.state).toBe("PASSED");
    expect(a.steps.find((s) => s.step === "APPROVE")?.state).toBe("REQUIRES_HUMAN");
    expect(a.steps.find((s) => s.step === "APPROVE")?.reason).toMatch(/may never approve/);
  });

  it("treats a missing materiality threshold as material and raises a policy decision", () => {
    const a = evaluateDecisionGate(fullRequest({ materialityThresholdMinor: null }));
    expect(a.material).toBe(true);
    expect(a.materialityReason).toMatch(/No materiality threshold has been ratified/);
    expect(a.policyDecisionRequired?.code).toMatch(/^FAM-PD-MATERIALITY/);
  });

  it("finds a decision below the threshold immaterial", () => {
    const a = evaluateDecisionGate(fullRequest({ amountMinor: 1_000 }));
    expect(a.material).toBe(false);
  });

  it("treats a decision with no amount as material", () => {
    const a = evaluateDecisionGate(fullRequest({ amountMinor: null }));
    expect(a.material).toBe(true);
  });

  it("requires an audit record — no material decision without auditability", () => {
    const a = evaluateDecisionGate(fullRequest({ auditReference: null }));
    expect(a.complete).toBe(false);
    expect(a.steps.find((s) => s.step === "AUDIT")?.state).toBe("NOT_REACHED");
  });

  it("refuses an AI actor asked to approve", () => {
    expect(() => assertDecisionAuthorityIsHuman("AI", "approve")).toThrow(/may not approve/);
    expect(() => assertDecisionAuthorityIsHuman("HUMAN", "approve")).not.toThrow();
  });
});

describe("emergency authority", () => {
  const emergency = {
    emergencyId: "FEM_1",
    declaredBy: "FAMILY_OFFICE_CEO",
    declaration: "Immediate liquidity call following a counterparty failure.",
    authorisedBy: "FAMILY_COUNCIL_CHAIR",
    authorisedScope: "Up to TZS 50m from the liquidity reserve.",
    expiresAt: "2026-04-15",
    ratificationDeadline: "2026-05-01",
    ratifiedByReference: null,
    actorType: "HUMAN" as const,
  };

  it("accepts a time-limited emergency with a ratification deadline", () => {
    const a = assessEmergencyAuthority(emergency, "2026-04-10");
    expect(a.valid).toBe(true);
    expect(a.retrospectiveRatificationRequired).toBe(true);
  });

  it("refuses emergency authority with no expiry", () => {
    const a = assessEmergencyAuthority({ ...emergency, expiresAt: null }, "2026-04-10");
    expect(a.valid).toBe(false);
  });

  it("flags an overdue ratification", () => {
    const a = assessEmergencyAuthority(emergency, "2026-06-01");
    expect(a.overdue).toBe(true);
    expect(a.blockers.join(" ")).toMatch(/must be reported to the governing body/);
  });

  it("refuses an AI actor declaring an emergency", () => {
    const a = assessEmergencyAuthority({ ...emergency, actorType: "AI" }, "2026-04-10");
    expect(a.valid).toBe(false);
  });
});

describe("delegated authority", () => {
  const delegation = {
    delegationId: "FDL_1",
    fromRole: "FAMILY_OFFICE_PRINCIPAL",
    toRole: "FAMILY_OFFICE_CEO",
    scope: ["FAMILY_LENDING_CAPITAL"],
    ceilingMinor: 50_000_000,
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    subDelegationPermitted: false,
    delegable: false,
  };

  it("accepts a bounded delegation", () => {
    expect(assessDelegation(delegation, "2026-06-01").valid).toBe(true);
  });

  it("refuses an unbounded delegation", () => {
    const a = assessDelegation({ ...delegation, ceilingMinor: null }, "2026-06-01");
    expect(a.valid).toBe(false);
    expect(a.blockers.join(" ")).toMatch(/transfer of authority, not a delegation/);
  });

  it("refuses a delegation with no end date", () => {
    expect(assessDelegation({ ...delegation, effectiveTo: null }, "2026-06-01").valid).toBe(false);
  });

  it("refuses an expired delegation", () => {
    expect(assessDelegation(delegation, "2027-06-01").valid).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Noelia alignment                                                    */
/* ------------------------------------------------------------------ */

const allReferences = (
  over: Partial<Record<AlignmentReferenceDomain, Partial<AlignmentReference>>> = {},
): AlignmentReference[] =>
  ALIGNMENT_REFERENCE_DOMAINS.map((domain) => ({
    domain,
    coverage: "COVERED",
    reference: `REF-${domain}`,
    requirement: `Requirement for ${domain}.`,
    ...over[domain],
  }));

const decision = (over: Partial<DecisionUnderTest> = {}): DecisionUnderTest => ({
  decisionId: "FDX_1",
  state: "PROPOSED",
  title: "Equity participation in an industrial venture",
  domain: "FAMILY_CAPITAL",
  affectedEntityId: "LEN_HOLDINGS",
  affectedCapitalMinor: 250_000_000,
  currency: "TZS",
  authorityReference: "FC-3.2",
  actorReference: "FAMILY_COUNCIL",
  actorType: "HUMAN",
  substance: "Deploy TZS 250m from Opportunity Capital.",
  ...over,
});

const zeroMagnitudes = (): Record<AlignmentReferenceDomain, number> =>
  Object.fromEntries(ALIGNMENT_REFERENCE_DOMAINS.map((d) => [d, 0])) as Record<AlignmentReferenceDomain, number>;

describe("Noelia governance alignment", () => {
  it("reports ALIGNED only when every applicable reference is covered and undisputed", () => {
    const a = evaluateAlignment(decision(), allReferences(), zeroMagnitudes());
    expect(a.status).toBe("ALIGNED");
    expect(a.severity).toBe("NONE");
    expect(a.silentOverride).toBe(false);
    expect(a.alertRequired).toBe(false);
  });

  it("returns POLICY_UNKNOWN, never ALIGNED, when a reference has no ratified policy", () => {
    const refs = allReferences({ INVESTMENT_POLICY: { coverage: "NOT_RATIFIED", reference: null } });
    const a = evaluateAlignment(decision(), refs, zeroMagnitudes());
    expect(a.status).toBe("POLICY_UNKNOWN");
    expect(a.uncoveredDomains).toContain("INVESTMENT_POLICY");
    expect(a.policyDecisionRequired).not.toBeNull();
  });

  it("returns POLICY_UNKNOWN when a reference domain is omitted entirely", () => {
    const refs = allReferences().filter((r) => r.domain !== "FAMILY_VALUES");
    const a = evaluateAlignment(decision(), refs, zeroMagnitudes());
    expect(a.status).toBe("POLICY_UNKNOWN");
    expect(a.uncoveredDomains).toContain("FAMILY_VALUES");
  });

  it("returns POLICY_UNKNOWN when no deviation magnitude was measured", () => {
    const { RISK_POLICY: _omitted, ...magnitudes } = zeroMagnitudes();
    const a = evaluateAlignment(decision(), allReferences(), magnitudes);
    expect(a.status).toBe("POLICY_UNKNOWN");
    expect(a.findings.find((f) => f.domain === "RISK_POLICY")?.finding).toBe("UNKNOWN");
  });

  it("classifies a high-magnitude departure as MATERIALLY_DEVIATING and requires an alert", () => {
    const magnitudes = { ...zeroMagnitudes(), INVESTMENT_POLICY: 80 };
    const a = evaluateAlignment(decision(), allReferences(), magnitudes);
    expect(a.status).toBe("MATERIALLY_DEVIATING");
    expect(a.severity).toBe("CRITICAL");
    expect(a.alertRequired).toBe(true);
    expect(a.deviatingDomains).toContain("INVESTMENT_POLICY");
    expect(a.recommendation).toMatch(/does not override the decision/);
  });

  it("treats cumulative small deviations across domains as materially deviating", () => {
    const magnitudes = { ...zeroMagnitudes(), FAMILY_VALUES: 10, RISK_POLICY: 10, FAMILY_CAPITAL_POLICY: 10 };
    const a = evaluateAlignment(decision(), allReferences(), magnitudes);
    expect(a.status).toBe("MATERIALLY_DEVIATING");
    expect(a.explanation.join(" ")).toMatch(/Cumulative|cumulative|deviation/i);
  });

  it("classifies a low-magnitude single departure as DEVIATING", () => {
    const a = evaluateAlignment(decision(), allReferences(), { ...zeroMagnitudes(), FAMILY_VALUES: 10 });
    expect(a.status).toBe("DEVIATING");
    expect(a.severity).toBe("LOW");
  });

  it("returns UNAUTHORIZED for a decision attributed to an AI actor, whatever the policy", () => {
    const a = evaluateAlignment(
      decision({ actorType: "AI", actorReference: "NOELIA" }),
      allReferences(),
      zeroMagnitudes(),
    );
    expect(a.status).toBe("UNAUTHORIZED");
    expect(a.explanation.join(" ")).toMatch(/requires an accountable human/);
  });

  it("returns UNAUTHORIZED for a decision with no authority reference", () => {
    const a = evaluateAlignment(decision({ authorityReference: null }), allReferences(), zeroMagnitudes());
    expect(a.status).toBe("UNAUTHORIZED");
  });

  it("never silently overrides, in any status", () => {
    const statuses = [
      evaluateAlignment(decision(), allReferences(), zeroMagnitudes()),
      evaluateAlignment(decision(), allReferences(), { ...zeroMagnitudes(), RISK_POLICY: 90 }),
      evaluateAlignment(decision({ actorType: "AI" }), allReferences(), zeroMagnitudes()),
      evaluateAlignment(decision(), allReferences({ LEGAL_CONSTRAINTS: { coverage: "MISSING", reference: null } }), zeroMagnitudes()),
    ];
    for (const s of statuses) expect(s.silentOverride).toBe(false);
  });

  it("names a human authority for every status and never Noelia", () => {
    const a = evaluateAlignment(decision(), allReferences(), { ...zeroMagnitudes(), RISK_POLICY: 90 });
    expect(a.requiredAuthority).toMatch(/Family Council/);
    expect(a.requiredAuthority).not.toMatch(/Noelia/);
    expect(a.escalationPath.join(" ")).not.toMatch(/Noelia/);
  });

  it("adds the Trustees to the escalation path when Trust policy deviates", () => {
    const a = evaluateAlignment(decision(), allReferences(), { ...zeroMagnitudes(), TRUST_POLICY: 90 });
    expect(a.escalationPath.join(" ")).toMatch(/Trustees/);
  });
});

describe("Noelia boundary", () => {
  it.each([
    "amend the Family Constitution",
    "alter Trust instruments",
    "appoint or remove Trustees",
    "determine beneficiaries",
    "override Trustees",
    "override the Family Council",
    "override legal authority",
    "approve material capital",
    "disburse material capital",
    "bypass RBAC",
    "bypass ABAC",
    "bypass audit",
    "hide decisions",
    "create legal authority",
    "invent policy",
  ])("refuses Noelia asked to %s", (operation) => {
    expect(() => assertWithinNoeliaBoundary(operation)).toThrow(/NOELIA_BOUNDARY_VIOLATION/);
  });

  it.each(["analyse", "compare", "forecast", "simulate", "recommend", "draft", "summarise"])(
    "permits Noelia to %s",
    (operation) => {
      expect(() => assertWithinNoeliaBoundary(operation)).not.toThrow();
    },
  );
});

describe("long-horizon alignment", () => {
  it("maps years to horizons", () => {
    expect(horizonFor(0)).toBe("HORIZON_1");
    expect(horizonFor(3)).toBe("HORIZON_2");
    expect(horizonFor(7)).toBe("HORIZON_3");
    expect(horizonFor(20)).toBe("HORIZON_4");
    expect(horizonFor(40)).toBe("HORIZON_5");
    expect(horizonFor(90)).toBe("HORIZON_6");
  });

  it("reports the worst alignment across horizons, not the best", () => {
    const aligned = evaluateAlignment(decision(), allReferences(), zeroMagnitudes());
    const deviating = evaluateAlignment(decision(), allReferences(), { ...zeroMagnitudes(), SUCCESSION_OBJECTIVES: 80 });

    const perHorizon = {
      HORIZON_1: aligned,
      HORIZON_2: aligned,
      HORIZON_3: aligned,
      HORIZON_4: aligned,
      HORIZON_5: deviating,
      HORIZON_6: aligned,
    } as never;

    const result = evaluateAlignmentAcrossHorizons(decision(), perHorizon);
    expect(result.worstStatus).toBe("MATERIALLY_DEVIATING");
    expect(result.explanation).toMatch(/short-horizon pass is not a long-horizon pass/);
    expect(result.byHorizon.length).toBe(6);
  });
});

describe("alignment reporting", () => {
  it("aggregates without exposing decision identities", () => {
    const summary = summariseAssessments([
      evaluateAlignment(decision(), allReferences(), zeroMagnitudes()),
      evaluateAlignment(decision(), allReferences(), { ...zeroMagnitudes(), RISK_POLICY: 90 }),
    ]);
    expect(summary.count).toBe(2);
    expect(summary.byStatus.ALIGNED).toBe(1);
    expect(summary.byStatus.MATERIALLY_DEVIATING).toBe(1);
    expect(summary.alertsRequired).toBe(1);
    expect(JSON.stringify(summary)).not.toContain("FDX_1");
  });
});

/* ------------------------------------------------------------------ */
/* Policy decision register                                            */
/* ------------------------------------------------------------------ */

describe("policy decision register", () => {
  it("seeds every standing requirement as OPEN with no decision", () => {
    expect(STANDING_POLICY_DECISIONS.length).toBeGreaterThanOrEqual(10);
    for (const r of STANDING_POLICY_DECISIONS) {
      expect(r.status).toBe("OPEN");
      expect(r.decision).toBeNull();
      expect(r.decisionReference).toBeNull();
      expect(r.options.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("refuses to raise a requirement with fewer than two options", () => {
    expect(() =>
      raisePolicyDecisionRequirement({
        code: "FAM-PD-TEST",
        issue: "A question with one answer.",
        domain: "INSTITUTION",
        options: ["The only option"],
        assumptions: [],
        legalImplications: "x",
        taxImplications: "x",
        financialImplications: "x",
        risk: "x",
        decisionAuthority: "Family Council",
      }),
    ).toThrow(/A single option is a decision, not a question/);
  });

  it("refuses to resolve a requirement by an AI actor", () => {
    const requirement = STANDING_POLICY_DECISIONS[0];
    expect(() =>
      resolvePolicyDecision(requirement, {
        actorType: "AI",
        decisionMaker: "NOELIA",
        decision: "Adopt option 1.",
        decisionReference: "FC-RES-099",
        effectiveDate: "2026-06-01",
      }),
    ).toThrow(/may not resolve policy decision/);
  });

  it("refuses a resolution with no governance reference", () => {
    const requirement = STANDING_POLICY_DECISIONS[0];
    expect(() =>
      resolvePolicyDecision(requirement, {
        actorType: "HUMAN",
        decisionMaker: "FAMILY_COUNCIL",
        decision: "Adopt option 1.",
        decisionReference: "",
        effectiveDate: "2026-06-01",
      }),
    ).toThrow(/No governance reference/);
  });

  it("resolves a requirement when a human authority supplies the full trail", () => {
    const requirement = STANDING_POLICY_DECISIONS[0];
    const resolved = resolvePolicyDecision(requirement, {
      actorType: "HUMAN",
      decisionMaker: "FAMILY_COUNCIL",
      decision: "Adopt the candidate standard as the institutional minimum.",
      decisionReference: "FC-RES-060",
      effectiveDate: "2026-07-01",
    });
    expect(resolved.status).toBe("DECIDED");
    expect(resolved.decision).toMatch(/candidate standard/);
    expect(resolved.effectiveDate).toBe("2026-07-01");
  });

  it("refuses to edit a decision that is already decided", () => {
    const requirement = STANDING_POLICY_DECISIONS[0];
    const resolved = resolvePolicyDecision(requirement, {
      actorType: "HUMAN",
      decisionMaker: "FAMILY_COUNCIL",
      decision: "Adopt option 1.",
      decisionReference: "FC-RES-060",
      effectiveDate: "2026-07-01",
    });
    expect(() =>
      resolvePolicyDecision(resolved, {
        actorType: "HUMAN",
        decisionMaker: "FAMILY_COUNCIL",
        decision: "Actually, option 2.",
        decisionReference: "FC-RES-061",
        effectiveDate: "2026-08-01",
      }),
    ).toThrow(/never edited/);
  });

  it("detects an invented policy — a decision recorded without its authority trail", () => {
    const invented = { ...STANDING_POLICY_DECISIONS[0], status: "DECIDED" as const, decisionReference: null };
    expect(findInventedPolicies([invented]).length).toBe(1);
    expect(findInventedPolicies(STANDING_POLICY_DECISIONS).length).toBe(0);
  });

  it("merges live records over standing ones and summarises", () => {
    const live = [{ ...STANDING_POLICY_DECISIONS[0], status: "IN_REVIEW" as const }];
    const register = policyDecisionRegister(live);
    expect(register.find((r) => r.code === "FAM-PD-001")?.status).toBe("IN_REVIEW");

    const summary = summariseRegister(register);
    expect(summary.total).toBe(STANDING_POLICY_DECISIONS.length);
    expect(openRequirements(register).length).toBe(STANDING_POLICY_DECISIONS.length);
    expect(summary.byStatus.IN_REVIEW).toBe(1);
  });
});
