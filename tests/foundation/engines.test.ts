/**
 * Foundation OS — pure engine certification (no database).
 *
 * Pins the deterministic cores: lifecycle state machines, formation triage,
 * deadline computation, escalation ladder, jurisdiction usability, structure
 * simulation and tax evaluation. Every engine fails closed and carries its
 * advisory boundary in-band.
 */
import { describe, expect, it } from "vitest";
import {
  allowedTransitions,
  FOUNDATION_TRANSITIONS,
  GRANT_TRANSITIONS,
  validateAssetTransition,
  validateFormationTransition,
  validateFoundationTransition,
  validateGrantTransition,
  validateProcurementTransition,
  validateSafeguardingTransition,
} from "@/lib/foundation/lifecycle";
import { assessFormation, FORMATION_DISCLAIMER } from "@/lib/foundation/formation";
import {
  addBusinessDaysUtc,
  computeDueDate,
  deadlineHealth,
  daysBetweenUtc,
} from "@/lib/foundation/deadlines";
import {
  ESCALATION_THRESHOLDS,
  evaluateEscalation,
  ladderRole,
} from "@/lib/foundation/escalation";
import {
  evaluateRuleUsability,
  scopeRuleChange,
} from "@/lib/foundation/jurisdiction";
import {
  diffStructures,
  simulateStructureChange,
} from "@/lib/foundation/structure";
import {
  evaluateTaxStatus,
  mayClaimExempt,
  ruleIsFresh,
} from "@/lib/foundation/tax";

describe("lifecycle state machines", () => {
  it("foundation: full happy path PROPOSED → ARCHIVED validates step by step", () => {
    const path = [
      ["PROPOSED", "FORMATION"],
      ["FORMATION", "REGISTRATION_PENDING"],
      ["REGISTRATION_PENDING", "REGISTERED"],
      ["REGISTERED", "ACTIVE"],
      ["ACTIVE", "DISSOLVING"],
      ["DISSOLVING", "DISSOLVED"],
      ["DISSOLVED", "ARCHIVED"],
    ] as const;
    for (const [from, to] of path) {
      const v = validateFoundationTransition(from, to);
      expect(v.ok, `${from} → ${to}`).toBe(true);
    }
  });

  it("foundation: skips and reversals are rejected", () => {
    expect(validateFoundationTransition("PROPOSED", "ACTIVE").ok).toBe(false);
    expect(validateFoundationTransition("ACTIVE", "PROPOSED").ok).toBe(false);
    expect(validateFoundationTransition("DISSOLVED", "ACTIVE").ok).toBe(false);
    expect(validateFoundationTransition("ARCHIVED", "ACTIVE").ok).toBe(false);
    const same = validateFoundationTransition("ACTIVE", "ACTIVE");
    expect(same.ok).toBe(false);
  });

  it("foundation: material transitions require an approval reference", () => {
    for (const [from, to] of [["REGISTERED", "ACTIVE"], ["ACTIVE", "SUSPENDED"], ["SUSPENDED", "ACTIVE"]] as const) {
      const v = validateFoundationTransition(from, to);
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.rule.requiresApprovalRef).toBe(true);
    }
    const dormant = validateFoundationTransition("ACTIVE", "DORMANT");
    expect(dormant.ok).toBe(true);
    if (dormant.ok) expect(dormant.rule.requiresApprovalRef).toBeFalsy();
  });

  it("foundation: unknown statuses are rejected, not coerced", () => {
    expect(validateFoundationTransition("ACTIVE", "BOGUS" as never).ok).toBe(false);
    expect(validateFoundationTransition("BOGUS" as never, "ACTIVE").ok).toBe(false);
  });

  it("grant: forward pipeline is strictly ordered; APPROVAL needs the approve permission", () => {
    const v = validateGrantTransition("OPPORTUNITY", "APPLICATION");
    expect(v.ok).toBe(true);
    const skip = validateGrantTransition("OPPORTUNITY", "APPROVAL");
    expect(skip.ok).toBe(false);
    const approval = validateGrantTransition("CONFLICT_CHECK", "APPROVAL");
    expect(approval.ok).toBe(true);
    if (approval.ok) {
      expect(approval.rule.permission).toBe("foundation:grant.approve");
      expect(approval.rule.requiresApprovalRef).toBe(true);
    }
  });

  it("grant: governed returns exist for rework but never silently past APPLICATION", () => {
    expect(validateGrantTransition("ELIGIBILITY", "APPLICATION").ok).toBe(true);
    expect(validateGrantTransition("APPROVAL", "CONFLICT_CHECK").ok).toBe(true);
    expect(validateGrantTransition("MONITORING", "OPPORTUNITY").ok).toBe(false);
    expect(validateGrantTransition("CLOSEOUT", "APPLICATION").ok).toBe(false);
  });

  it("procurement / asset / formation / safeguarding machines reject illegal jumps", () => {
    expect(validateProcurementTransition("NEED", "PAYMENT").ok).toBe(false);
    expect(validateAssetTransition("ACQUIRE", "DISPOSED").ok).toBe(false);
    expect(validateFormationTransition("INTAKE", "APPROVED").ok).toBe(false);
    expect(validateSafeguardingTransition("REPORTED", "CLOSED").ok).toBe(false);
  });

  it("allowedTransitions exposes the honest outbound set", () => {
    const outs = allowedTransitions(FOUNDATION_TRANSITIONS, "ACTIVE").map((r) => r.to);
    expect(outs).toContain("SUSPENDED");
    expect(outs).not.toContain("PROPOSED");
    expect(allowedTransitions(GRANT_TRANSITIONS, "CLOSEOUT")).toEqual([]);
  });
});

describe("formation triage", () => {
  const intake = {
    mission: "Relief and development for drought-affected communities.",
    activities: ["food relief", "water points", "school feeding"],
    beneficiaryScope: "Drought-affected households in Dodoma and Singida.",
    geographicScope: "Tanzania",
    fundingModel: "endowment drawdown plus annual founder contribution",
    initialCapitalMinor: 100000000,
    endowmentTargetMinor: 50000000,
    governanceModel: "independent board",
    jurisdictionCode: "TZ",
    proposedVehicle: "FOUNDATION",
    taxObjectives: ["charitable exemption"],
    donorModel: "single endowment",
    grantmakingModel: "grantmaking to local partners",
    internationalActivities: false,
    expectedWorkforce: 8,
    relatedEntities: [],
  };

  it("recommends the foundation vehicle for endowed grantmaking and always disclaims", () => {
    const a = assessFormation({ ...intake });
    expect(a.disclaimer).toBe(FORMATION_DISCLAIMER);
    expect(a.disclaimer).toMatch(/not legal advice/i);
    const foundation = a.options.find((o) => o.vehicle === "FOUNDATION");
    expect(foundation?.suitability).toBe("RECOMMENDED");
    expect(a.readiness).toBe("READY_FOR_REVIEW");
    expect(a.registrationRoadmap.length).toBeGreaterThan(0);
    expect(a.professionalReviewChecklist.length).toBeGreaterThan(0);
    expect(a.risks.length).toBeGreaterThan(0);
  });

  it("operating programming without endowment does not recommend a pure foundation", () => {
    const a = assessFormation({
      ...intake,
      proposedVehicle: "NGO",
      grantmakingModel: "direct operations",
      endowmentTargetMinor: 0,
    });
    const foundation = a.options.find((o) => o.vehicle === "FOUNDATION");
    expect(foundation?.suitability).not.toBe("RECOMMENDED");
  });
});

describe("deadline computation", () => {
  it("calendar days, months, years and fixed dates compute deterministically", () => {
    expect(computeDueDate("2026-01-01", { basis: "CALENDAR_DAYS", offset: 90 })).toEqual({
      ok: true,
      dueDate: "2026-04-01",
      approximate: false,
      explanation: "90 calendar days after 2026-01-01",
    });
    const fy = computeDueDate("2026-06-30", { basis: "FISCAL_YEAR_END", offset: 3 });
    expect(fy.ok && fy.ok ? (fy as { dueDate: string }).dueDate : null).toBe("2026-09-30");
    const fixed = computeDueDate("2026-05-01", { basis: "FIXED_DATE", offset: 0, fixedMonthDay: "09-30" });
    expect(fixed.ok).toBe(true);
    if (fixed.ok) expect(fixed.dueDate).toBe("2026-09-30");
    const rolled = computeDueDate("2026-10-01", { basis: "FIXED_DATE", offset: 0, fixedMonthDay: "09-30" });
    expect(rolled.ok).toBe(true);
    if (rolled.ok) expect(rolled.dueDate).toBe("2027-09-30");
  });

  it("business days skip weekends; missing holiday calendar is flagged APPROXIMATE", () => {
    // Friday 2026-09-04 + 1 business day = Monday 2026-09-07.
    expect(addBusinessDaysUtc("2026-09-04", 1, [])).toBe("2026-09-07");
    const approx = computeDueDate("2026-09-04", { basis: "BUSINESS_DAYS", offset: 1 });
    expect(approx.ok).toBe(true);
    if (approx.ok) {
      expect(approx.approximate).toBe(true);
      expect(approx.explanation).toMatch(/APPROXIMATE/);
    }
    const exact = computeDueDate("2026-09-04", { basis: "BUSINESS_DAYS", offset: 1 }, ["2026-09-07"]);
    expect(exact.ok).toBe(true);
    if (exact.ok) {
      expect(exact.approximate).toBe(false);
      expect(exact.dueDate).toBe("2026-09-08");
    }
  });

  it("malformed inputs fail closed, never produce a plausible date", () => {
    expect(computeDueDate("not-a-date", { basis: "CALENDAR_DAYS", offset: 5 }).ok).toBe(false);
    expect(computeDueDate("2026-01-01", { basis: "CALENDAR_DAYS", offset: -1 }).ok).toBe(false);
    expect(computeDueDate("2026-01-01", { basis: "FIXED_DATE", offset: 0 }).ok).toBe(false);
    expect(computeDueDate("2026-01-01", { basis: "BOGUS" as never, offset: 1 }).ok).toBe(false);
  });

  it("deadline health bands are exact", () => {
    expect(deadlineHealth("2026-09-01", "2026-09-08")).toBe("OVERDUE");
    expect(deadlineHealth("2026-09-08", "2026-09-08")).toBe("DUE_TODAY");
    expect(deadlineHealth("2026-09-15", "2026-09-08")).toBe("AT_RISK");
    expect(deadlineHealth("2026-10-08", "2026-09-08")).toBe("ON_TRACK");
    expect(daysBetweenUtc("2026-09-08", "2026-09-08")).toBe(0);
  });
});

describe("escalation ladder", () => {
  it("thresholds escalate with risk; critical overdue day-zero escalates", () => {
    expect(ESCALATION_THRESHOLDS.CRITICAL.overdueDays).toBe(0);
    expect(ESCALATION_THRESHOLDS.LOW.overdueDays).toBe(7);
    const v = evaluateEscalation({ daysOverdue: 0, risk: "CRITICAL", currentLevel: -1, repeatOffence: false });
    expect(v.escalate).toBe(true);
    if (v.escalate) {
      expect(v.level).toBe(0);
      expect(v.fromRole).toBe("RESPONSIBLE_OFFICER");
      expect(v.toRole).toBe(ladderRole(0));
    }
  });

  it("below-threshold lateness does not escalate; repeat offences jump the queue", () => {
    const quiet = evaluateEscalation({ daysOverdue: 2, risk: "LOW", currentLevel: -1, repeatOffence: false });
    expect(quiet.escalate).toBe(false);
    const repeat = evaluateEscalation({ daysOverdue: 0, risk: "LOW", currentLevel: -1, repeatOffence: true });
    expect(repeat.escalate).toBe(true);
  });

  it("escalation never moves backwards and never exceeds the ladder", () => {
    const done = evaluateEscalation({ daysOverdue: 30, risk: "CRITICAL", currentLevel: 99, repeatOffence: false });
    expect(done.escalate).toBe(false);
    expect(() => ladderRole(999)).toThrow();
    expect(() => ladderRole(-2)).toThrow();
    const future = evaluateEscalation({ daysOverdue: -5, risk: "CRITICAL", currentLevel: -1, repeatOffence: false });
    expect(future.escalate).toBe(false);
  });
});

describe("jurisdiction engine", () => {
  const rule = {
    id: "R1",
    code: "TZ-NGO-RET",
    jurisdictionId: "J1",
    countryCode: "TZ",
    authority: "NGO Registrar",
    source: "NGO Act s.31",
    ruleVersion: "2024-01",
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
    supersededBy: null,
    verificationDate: "2026-01-15",
    status: "EFFECTIVE",
  };

  it("an effective, cited, verified rule is usable", () => {
    const u = evaluateRuleUsability(rule, "2026-09-08");
    expect(u.usable).toBe(true);
  });

  it("superseded, expired, future and uncited rules are unusable", () => {
    expect(evaluateRuleUsability({ ...rule, supersededBy: "R2" }, "2026-09-08").usable).toBe(false);
    expect(evaluateRuleUsability({ ...rule, status: "RETIRED" }, "2026-09-08").usable).toBe(false);
    expect(evaluateRuleUsability({ ...rule, effectiveTo: "2025-01-01" }, "2026-09-08").usable).toBe(false);
    expect(evaluateRuleUsability({ ...rule, effectiveFrom: "2027-01-01" }, "2026-09-08").usable).toBe(false);
    expect(evaluateRuleUsability({ ...rule, authority: "" }, "2026-09-08").usable).toBe(false);
  });

  it("unverified rules carry a warning, not a silent pass", () => {
    const u = evaluateRuleUsability({ ...rule, verificationDate: null }, "2026-09-08");
    expect(u.usable).toBe(true);
    if (u.usable) expect(u.warnings.length).toBeGreaterThan(0);
  });

  it("rule changes scope their blast radius; deadline keys force recalculation", () => {
    const same = scopeRuleChange({ a: 1 }, { a: 1 });
    expect(same.requiresObligationReview).toBe(false);
    expect(same.requiresDeadlineRecalculation).toBe(false);
    const changed = scopeRuleChange({ offset: 30 }, { offset: 60 });
    expect(changed.requiresObligationReview).toBe(true);
    expect(changed.requiresDeadlineRecalculation).toBe(true);
    expect(changed.requiresNotification).toBe(true);
    const cosmetic = scopeRuleChange({ note: "a" }, { note: "b" });
    expect(cosmetic.requiresObligationReview).toBe(true);
    expect(cosmetic.requiresDeadlineRecalculation).toBe(false);
  });
});

describe("structure simulation", () => {
  const before = {
    nodes: [{ id: "F1", kind: "FOUNDATION", label: "BEYU Foundation", jurisdiction: "TZ" }],
    edges: [],
  } as const;
  const after = {
    nodes: [
      { id: "F1", kind: "FOUNDATION", label: "BEYU Foundation", jurisdiction: "TZ" },
      { id: "T1", kind: "TRUST", label: "Endowment Trust", jurisdiction: "KE" },
    ],
    edges: [{ from: "F1", to: "T1", relation: "FUNDS" }],
  } as const;

  it("diffs nodes and edges honestly", () => {
    const d = diffStructures(
      { nodes: [...before.nodes], edges: [...before.edges] },
      { nodes: [...after.nodes], edges: [...after.edges] },
    );
    expect(d.addedNodes.map((n) => n.id)).toEqual(["T1"]);
    expect(d.removedNodes).toEqual([]);
    expect(d.addedEdges).toHaveLength(1);
    expect(d.removedEdges).toEqual([]);
  });

  it("simulation flags legal, governance and tax review for new cross-border vehicles", () => {
    const s = simulateStructureChange(
      "What if we endow via a Kenyan trust?",
      { nodes: [...before.nodes], edges: [...before.edges] },
      { nodes: [...after.nodes], edges: [...after.edges] },
    );
    expect(s.question).toContain("Kenyan trust");
    const dims = s.impacts.map((i) => i.dimension);
    expect(dims).toContain("LEGAL");
    expect(dims).toContain("GOVERNANCE");
    expect(dims).toContain("TAX");
    expect(s.requiredApprovals.length).toBeGreaterThan(0);
  });
});

describe("tax intelligence", () => {
  const freshRule = {
    id: "TR1",
    authority: "Tanzania Revenue Authority",
    source: "Income Tax Act s.64",
    ruleVersion: "2024-01",
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
    verificationDate: "2026-06-01",
    status: "EFFECTIVE",
  };

  it("fresh rules pass; expired, stale and uncited rules fail with reasons", () => {
    expect(ruleIsFresh(freshRule, "2026-09-08").fresh).toBe(true);
    expect(ruleIsFresh({ ...freshRule, effectiveTo: "2025-12-31" }, "2026-09-08").fresh).toBe(false);
    expect(ruleIsFresh({ ...freshRule, verificationDate: "2024-01-01" }, "2026-09-08").fresh).toBe(false);
    expect(ruleIsFresh({ ...freshRule, verificationDate: null }, "2026-09-08").fresh).toBe(false);
    expect(ruleIsFresh({ ...freshRule, source: "" }, "2026-09-08").fresh).toBe(false);
  });

  it("no rule, or a disqualifier, fails closed to professional review", () => {
    const none = evaluateTaxStatus({ rule: null, evidenceRefs: [], disqualifiers: [], assumptions: [], todayIso: "2026-09-08" });
    expect(none.status).toBe("REQUIRES_PROFESSIONAL_REVIEW");
    expect(none.professionalReviewRequired).toBe(true);
    const dq = evaluateTaxStatus({ rule: freshRule, evidenceRefs: ["CERT-1"], disqualifiers: ["UBI above threshold"], assumptions: [], todayIso: "2026-09-08" });
    expect(dq.status).toBe("NOT_ELIGIBLE");
    expect(dq.professionalReviewRequired).toBe(true);
  });

  it("CONFIRMED requires fresh rule + evidence + zero assumptions", () => {
    const noEvidence = evaluateTaxStatus({ rule: freshRule, evidenceRefs: [], disqualifiers: [], assumptions: [], todayIso: "2026-09-08" });
    expect(noEvidence.status).toBe("UNDER_REVIEW");
    const withAssumption = evaluateTaxStatus({ rule: freshRule, evidenceRefs: ["CERT-1"], disqualifiers: [], assumptions: ["pending ruling"], todayIso: "2026-09-08" });
    expect(withAssumption.status).toBe("POTENTIALLY_ELIGIBLE");
    const confirmed = evaluateTaxStatus({ rule: freshRule, evidenceRefs: ["CERT-1"], disqualifiers: [], assumptions: [], todayIso: "2026-09-08" });
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.professionalReviewRequired).toBe(false);
  });

  it("the words 'tax exempt' are gated on CONFIRMED only", () => {
    expect(mayClaimExempt("CONFIRMED")).toBe(true);
    expect(mayClaimExempt("UNDER_REVIEW")).toBe(false);
    expect(mayClaimExempt("POTENTIALLY_ELIGIBLE")).toBe(false);
    expect(mayClaimExempt("REQUIRES_PROFESSIONAL_REVIEW")).toBe(false);
  });
});
