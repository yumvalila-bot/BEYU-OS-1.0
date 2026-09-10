/**
 * Family Office capital & wealth — the capital allocation workflow (§10), the
 * investment committee (§21) and segregation of duties (§39/§40).
 *
 * The load-bearing claims: Noelia may contribute to analytical steps but can never
 * clear a human-authority one; a missing reference is never approval; a requester
 * cannot approve their own request; and an executor cannot reconcile their own
 * execution.
 */
import { describe, expect, it } from "vitest";
import {
  CAPITAL_ALLOCATION_STEPS,
  COMMITTEE_DECISIONS,
  HUMAN_AUTHORITY_STEPS,
  NOELIA_CONTRIBUTABLE_STEPS,
  assertCommitteeDecisionIsSound,
  assertSegregationOfDuties,
  clearAllocationStep,
  createAllocationCase,
  isFamilyCapitalGovernanceError,
  recordNoeliaContribution,
  validateCommitteeDecision,
  type CapitalAllocationStepCode,
  type CommitteeDecision,
} from "../../../../src/lib/family/office/capital-wealth";
import type { FamilyCapitalGovernanceError } from "../../../../src/lib/family/office/capital-wealth";
import { D, TENANT } from "./fixtures";

function allocation(over: Parameters<typeof createAllocationCase>[0] extends infer P ? Partial<P> : never = {}) {
  return createAllocationCase({
    id: "AL-1",
    tenantId: TENANT,
    capitalRequestRef: "CR-1",
    legalEntityId: "LE-1",
    countryCode: "NG",
    currency: "NGN",
    amountMinor: 50_000_000,
    title: "Test acquisition",
    purpose: "Acquire the asset described in CR-1",
    requesterRef: "U-REQUESTER",
    asOf: D.asOf,
    ...over,
  });
}

function committeeDecision(over: Partial<CommitteeDecision> = {}): CommitteeDecision {
  return {
    id: "CD-1",
    tenantId: TENANT,
    allocationId: "AL-1",
    decision: "APPROVE",
    bodyRef: "FAMILY_COUNCIL",
    members: [
      { memberRef: "U-A", role: "CHAIR", position: "FOR", dissentReason: null },
      { memberRef: "U-B", role: "MEMBER", position: "FOR", dissentReason: null },
      { memberRef: "U-C", role: "MEMBER", position: "FOR", dissentReason: null },
    ],
    quorumMinimum: 3,
    majorityRule: "SIMPLE",
    date: D.asOf,
    reason: "Cash flow, valuation, financing, risk and exit are all evidenced in the papers.",
    conditions: [],
    followUps: [],
    authorityRef: "RES-1",
    decidedByActorType: "HUMAN",
    requesterRef: "U-REQUESTER",
    executorRef: "U-EXECUTOR",
    reconcilerRef: "U-RECONCILER",
    ...over,
  };
}

describe("§10 — the workflow is the sixteen steps in order", () => {
  it("contains every step the requirement names", () => {
    const codes = CAPITAL_ALLOCATION_STEPS.map((s) => s.code);
    for (const required of [
      "CAPITAL_REQUEST",
      "STRATEGIC_FIT",
      "FINANCIAL_MODEL",
      "RISK",
      "LIQUIDITY",
      "LEGAL_REVIEW",
      "TAX_REVIEW",
      "SCENARIO_ANALYSIS",
      "NOELIA_ANALYSIS",
      "GOVERNANCE",
      "APPROVAL",
      "AUTHORIZED_EXECUTION",
      "FINANCE_OS_ACCOUNTING",
      "AUDIT",
      "MONITORING",
      "POST_INVESTMENT_REVIEW",
    ]) {
      expect(codes).toContain(required);
    }
  });

  it("a new case starts at CAPITAL_REQUEST with everything pending", () => {
    const a = allocation();
    expect(a.currentStepIndex).toBe(0);
    expect(a.steps.every((s) => s.status === "PENDING")).toBe(true);
    expect(a.status).toBe("IN_PROGRESS");
  });

  it("a cleared step is never re-opened by clearing it again", () => {
    let a = allocation();
    a = clearAllocationStep({ allocation: a, step: "CAPITAL_REQUEST", actorRef: "U-REQUESTER", actorType: "HUMAN", referenceRef: "CR-1", asOf: D.asOf }).allocation;
    const again = clearAllocationStep({ allocation: a, step: "CAPITAL_REQUEST", actorRef: "U-REQUESTER", actorType: "HUMAN", referenceRef: "CR-1", asOf: D.asOf });
    expect(again.cleared).toBe(false);
    expect(again.reason).toMatch(/new governance act/);
  });

  it("skipping ahead is refused", () => {
    const a = allocation();
    const result = clearAllocationStep({ allocation: a, step: "APPROVAL", actorRef: "U-APPROVER", actorType: "HUMAN", referenceRef: "RES-1", asOf: D.asOf });
    expect(result.cleared).toBe(false);
    expect(result.reason).toMatch(/one step at a time/);
  });
});

describe("§24 / FIR-017 — Noelia may contribute but never clear a human-authority step", () => {
  /**
   * Clear every step before `target` with a HUMAN actor, so `target` becomes the
   * current step. The AI-authority check only applies to the step actually being
   * cleared, which is correct: refusing to clear a step that is not current would
   * report the wrong reason.
   */
  function walkTo(target: CapitalAllocationStepCode) {
    const codes = CAPITAL_ALLOCATION_STEPS.map((s) => s.code);
    const stop = codes.indexOf(target);
    let a = allocation();
    for (let i = 0; i < stop; i++) {
      const step = codes[i]!;
      a = clearAllocationStep({
        allocation: a,
        step,
        actorRef: "U-HUMAN",
        actorType: "HUMAN",
        referenceRef: `REF-${step}`,
        asOf: D.asOf,
      }).allocation;
    }
    return a;
  }

  it("an AI actor clearing a human-authority step throws rather than returning false", () => {
    /**
     * A return value could be ignored. A throw cannot. An AI actor reaching a
     * governance step is a hard failure, not a declined suggestion.
     */
    for (const step of HUMAN_AUTHORITY_STEPS) {
      const a = walkTo(step);
      try {
        clearAllocationStep({ allocation: a, step, actorRef: "NOELIA", actorType: "AI", referenceRef: "AI-1", asOf: D.asOf });
        expect.unreachable(`${step} should have refused an AI actor`);
      } catch (e) {
        /**
         * The refusal is the capital domain's OWN error type. It is deliberately
         * not the Phase 3A FamilyError: that layer is dormant and unratified, and
         * the architecture guard forbids production-surface code from depending
         * on it.
         */
        expect(isFamilyCapitalGovernanceError(e)).toBe(true);
        expect((e as FamilyCapitalGovernanceError).code).toBe("AI_AUTHORITY_DENIED");
        expect((e as FamilyCapitalGovernanceError).message).toMatch(/human with authority/i);
      }
    }
  });

  it("the AI check fires before the reference check, so the reason is the authority one", () => {
    /**
     * Ordering matters for diagnosis. An AI actor hitting LEGAL_REVIEW without a
     * reference must be told "a human must do this", not "supply a reference" —
     * the second message would invite it to retry with one.
     */
    const a = walkTo("LEGAL_REVIEW");
    try {
      clearAllocationStep({ allocation: a, step: "LEGAL_REVIEW", actorRef: "NOELIA", actorType: "AI", referenceRef: null, asOf: D.asOf });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as FamilyCapitalGovernanceError).message).toMatch(/human with authority/i);
      expect((e as FamilyCapitalGovernanceError).message).not.toMatch(/requires legalReviewRef/);
    }
  });

  it("a Noelia contribution never clears the step it is recorded against", () => {
    const a = allocation();
    const before = a.steps.find((s) => s.step === "NOELIA_ANALYSIS")?.status;
    const result = recordNoeliaContribution({ allocation: a, step: "NOELIA_ANALYSIS", contributionRef: "NOELIA-ANALYSIS-1", asOf: D.asOf });
    expect(result.recorded).toBe(true);
    expect(result.allocation.steps.find((s) => s.step === "NOELIA_ANALYSIS")?.status).toBe(before);
    expect(result.reason).toMatch(/never a clearance/);
  });

  it("Noelia may not record a contribution against a governance step at all", () => {
    const a = allocation();
    for (const step of ["GOVERNANCE", "APPROVAL", "AUTHORIZED_EXECUTION", "AUDIT"] as const) {
      const result = recordNoeliaContribution({ allocation: a, step, contributionRef: "NOELIA-1", asOf: D.asOf });
      expect(result.recorded, `${step} should refuse a Noelia contribution`).toBe(false);
      expect(result.reason).toMatch(/would imply a clearance that did not happen/);
    }
  });

  it("the contributable and human-authority step sets do not overlap", () => {
    /**
     * If a step were both, "Noelia may contribute here" and "a human must clear
     * here" would describe the same gate, and the distinction would be cosmetic.
     */
    for (const step of NOELIA_CONTRIBUTABLE_STEPS) {
      expect(HUMAN_AUTHORITY_STEPS).not.toContain(step);
    }
  });
});

describe("§42 — a missing reference is never treated as approval", () => {
  it("a step that requires a reference cannot be cleared without one", () => {
    let a = allocation();
    /** Walk the first two steps to reach LEGAL_REVIEW. */
    a = clearAllocationStep({ allocation: a, step: "CAPITAL_REQUEST", actorRef: "U-REQUESTER", actorType: "HUMAN", referenceRef: "CR-1", asOf: D.asOf }).allocation;
    a = clearAllocationStep({ allocation: a, step: "STRATEGIC_FIT", actorRef: "U-DIRECTOR", actorType: "HUMAN", referenceRef: "SF-1", asOf: D.asOf }).allocation;
    const result = clearAllocationStep({ allocation: a, step: "FINANCIAL_MODEL", actorRef: "U-ANALYST", actorType: "HUMAN", referenceRef: "FM-1", asOf: D.asOf });
    expect(result.cleared).toBe(true);
    const legal = clearAllocationStep({ allocation: result.allocation, step: "RISK", actorRef: "U-RISK", actorType: "HUMAN", referenceRef: "R-1", asOf: D.asOf });
    expect(legal.cleared).toBe(true);
    const noRef = clearAllocationStep({ allocation: legal.allocation, step: "LIQUIDITY", actorRef: "U-TREASURY", actorType: "HUMAN", referenceRef: null, asOf: D.asOf });
    /** LIQUIDITY does not require a reference, so it clears — the point is the next gate. */
    expect(noRef.cleared).toBe(true);
    /**
     * A missing required reference throws rather than declining quietly. Missing
     * authority is not approval, and the caller must not be able to read a
     * returned `cleared: false` as "try again with the same inputs".
     */
    try {
      clearAllocationStep({ allocation: noRef.allocation, step: "LEGAL_REVIEW", actorRef: "U-LEGAL", actorType: "HUMAN", referenceRef: null, asOf: D.asOf });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(isFamilyCapitalGovernanceError(e)).toBe(true);
      expect((e as FamilyCapitalGovernanceError).code).toBe("AUTHORITY_UNPROVEN");
      expect((e as FamilyCapitalGovernanceError).message).toMatch(/never treated as approval/);
    }
  });
});

describe("§39/§40 — segregation of duties is four distinct parties", () => {
  it("four distinct parties are permitted", () => {
    const check = assertSegregationOfDuties({
      role: "APPROVER",
      actorRef: "U-APPROVER",
      requesterRef: "U-REQUESTER",
      executorRef: "U-EXECUTOR",
      reconcilerRef: "U-RECONCILER",
      waivedByPolicy: false,
      policyRef: null,
    });
    expect(check.permitted).toBe(true);
    expect(check.overlaps).toHaveLength(0);
  });

  it("a requester approving their own request is refused", () => {
    const check = assertSegregationOfDuties({
      role: "APPROVER",
      actorRef: "U-REQUESTER",
      requesterRef: "U-REQUESTER",
      executorRef: "U-EXECUTOR",
      reconcilerRef: "U-RECONCILER",
      waivedByPolicy: false,
      policyRef: null,
    });
    expect(check.permitted).toBe(false);
    expect(check.overlaps[0]).toMatchObject({ dutyA: "REQUESTER", dutyB: "APPROVER" });
  });

  it("an executor reconciling their own execution is refused", () => {
    const check = assertSegregationOfDuties({
      role: "APPROVER",
      actorRef: "U-APPROVER",
      requesterRef: "U-REQUESTER",
      executorRef: "U-SAME",
      reconcilerRef: "U-SAME",
      waivedByPolicy: false,
      policyRef: null,
    });
    expect(check.permitted).toBe(false);
    expect(check.overlaps.some((o) => o.dutyA === "EXECUTOR" && o.dutyB === "RECONCILER")).toBe(true);
  });

  it("an undocumented waiver is not a waiver", () => {
    /**
     * `waivedByPolicy: true` with no policy reference is a claim, not an
     * authorisation. Accepting it would let any overlap be excused by asserting
     * that a policy exists.
     */
    const check = assertSegregationOfDuties({
      role: "APPROVER",
      actorRef: "U-REQUESTER",
      requesterRef: "U-REQUESTER",
      executorRef: null,
      reconcilerRef: null,
      waivedByPolicy: true,
      policyRef: null,
    });
    expect(check.permitted).toBe(false);
  });

  it("a documented waiver permits the overlap and records which policy did it", () => {
    const check = assertSegregationOfDuties({
      role: "APPROVER",
      actorRef: "U-REQUESTER",
      requesterRef: "U-REQUESTER",
      executorRef: null,
      reconcilerRef: null,
      waivedByPolicy: true,
      policyRef: "POL-SEGREGATION-EXEMPTION",
    });
    expect(check.permitted).toBe(true);
    expect(check.policyRef).toBe("POL-SEGREGATION-EXEMPTION");
    /** The overlap is still reported. A permitted overlap is not an invisible one. */
    expect(check.overlaps.length).toBeGreaterThan(0);
  });
});

describe("§21 — the committee decision is validated against its own rules", () => {
  it("a quorate, majority decision validates clean", () => {
    expect(validateCommitteeDecision(committeeDecision())).toHaveLength(0);
  });

  it("a decision below quorum is void and is refused", () => {
    const findings = validateCommitteeDecision(
      committeeDecision({
        members: [{ memberRef: "U-A", role: "CHAIR", position: "FOR", dissentReason: null }],
        quorumMinimum: 3,
      }),
    );
    expect(findings.some((f) => /quorum/i.test(f))).toBe(true);
  });

  it("a majority that does not exist is refused", () => {
    const findings = validateCommitteeDecision(
      committeeDecision({
        members: [
          { memberRef: "U-A", role: "CHAIR", position: "FOR", dissentReason: null },
          { memberRef: "U-B", role: "MEMBER", position: "AGAINST", dissentReason: "Valuation is unsupported." },
          { memberRef: "U-C", role: "MEMBER", position: "AGAINST", dissentReason: "Financing cost exceeds return." },
        ],
      }),
    );
    expect(findings.some((f) => /majority/i.test(f))).toBe(true);
  });

  it("unanimity is enforced where the rule requires it", () => {
    const findings = validateCommitteeDecision(
      committeeDecision({
        majorityRule: "UNANIMOUS",
        members: [
          { memberRef: "U-A", role: "CHAIR", position: "FOR", dissentReason: null },
          { memberRef: "U-B", role: "MEMBER", position: "ABSTAIN", dissentReason: null },
          { memberRef: "U-C", role: "MEMBER", position: "FOR", dissentReason: null },
        ],
      }),
    );
    expect(findings.some((f) => /majority/i.test(f))).toBe(true);
  });

  it("an ABSENT member does not count toward quorum", () => {
    const findings = validateCommitteeDecision(
      committeeDecision({
        quorumMinimum: 3,
        members: [
          { memberRef: "U-A", role: "CHAIR", position: "FOR", dissentReason: null },
          { memberRef: "U-B", role: "MEMBER", position: "FOR", dissentReason: null },
          { memberRef: "U-C", role: "MEMBER", position: "ABSENT", dissentReason: null },
        ],
      }),
    );
    expect(findings.some((f) => /quorum/i.test(f))).toBe(true);
  });

  it("a dissent with no recorded reason is refused", () => {
    /**
     * Counting an AGAINST vote without recording why throws away the only
     * information that vote carries.
     */
    const findings = validateCommitteeDecision(
      committeeDecision({
        members: [
          { memberRef: "U-A", role: "CHAIR", position: "FOR", dissentReason: null },
          { memberRef: "U-B", role: "MEMBER", position: "FOR", dissentReason: null },
          { memberRef: "U-C", role: "MEMBER", position: "AGAINST", dissentReason: null },
        ],
      }),
    );
    expect(findings.some((f) => /dissent/i.test(f))).toBe(true);
  });

  it("a conditional approval that names no conditions is refused", () => {
    const findings = validateCommitteeDecision(committeeDecision({ decision: "APPROVE_WITH_CONDITIONS", conditions: [] }));
    expect(findings.some((f) => /condition/i.test(f))).toBe(true);
  });

  it("assertCommitteeDecisionIsSound throws on an invalid decision", () => {
    expect(() => assertCommitteeDecisionIsSound(committeeDecision({ quorumMinimum: 99 }))).toThrow();
    expect(() => assertCommitteeDecisionIsSound(committeeDecision())).not.toThrow();
  });

  it("the decision catalogue is the five codes the governance engine recognises", () => {
    expect(COMMITTEE_DECISIONS.map((d) => d.code)).toEqual([
      "APPROVE",
      "APPROVE_WITH_CONDITIONS",
      "REJECT",
      "DEFER",
      "REQUEST_INFORMATION",
    ]);
  });
});
