import { describe, expect, it } from "vitest";
import {
  assessAmendment,
  checkSupremacy,
  compareProvisionVersions,
  provisionsInForce,
  assertConstitutionWriteIsHuman,
  type AmendmentProposal,
  type ConstitutionProvision,
} from "../../src/lib/family/constitution";
import { FamilyInstitutionError } from "../../src/lib/family/model";

/**
 * Family Constitution and its amendment engine — pure, no database.
 */

const provision = (over: Partial<ConstitutionProvision> = {}): ConstitutionProvision => ({
  provisionId: "FCP_1",
  clauseRef: "FC-3.2",
  domain: "FAMILY_CAPITAL",
  title: "Capital allocation authority",
  body: "Material capital deployments require Family Council approval.",
  version: "1.0.0",
  status: "ACTIVE",
  effectiveFrom: "2025-01-01",
  effectiveTo: null,
  ratifiedByReference: "FC-RES-001",
  subordinateTo: [
    "APPLICABLE_LAW",
    "COURT_ORDER",
    "TRUST_INSTRUMENT",
    "TRUSTEE_FIDUCIARY_DUTY",
    "REGULATORY_REQUIREMENT",
  ],
  ...over,
});

const cleanReview = {
  attemptedOverrides: [],
  trusteeMattersClaimed: [],
  trusteeIndependencePreserved: true,
  legalReviewReference: "LEGAL-2026-014",
};

const proposal = (over: Partial<AmendmentProposal> = {}): AmendmentProposal => ({
  amendmentId: "FCA_1",
  proposal: "Raise the capital approval threshold to TZS 500m.",
  rationale: "Delegation limits have not kept pace with portfolio growth.",
  affectedProvisions: ["FC-3.2"],
  proposedBy: "FAMILY_COUNCIL_CHAIR",
  currentStage: "PROPOSED",
  actorType: "HUMAN",
  amendsAmendmentProcedure: false,
  ...over,
});

describe("legal supremacy", () => {
  it("permits a provision subordinate to every superior instrument", () => {
    const check = checkSupremacy(provision(), cleanReview);
    expect(check.permitted).toBe(true);
    expect(check.overrides).toEqual([]);
  });

  it("refuses a provision that would override a Trust instrument", () => {
    const check = checkSupremacy(provision(), { ...cleanReview, attemptedOverrides: ["TRUST_INSTRUMENT"] });
    expect(check.permitted).toBe(false);
    expect(check.overrides).toContain("TRUST_INSTRUMENT");
  });

  it("refuses a provision claiming a Trustee-reserved matter", () => {
    const check = checkSupremacy(provision(), {
      ...cleanReview,
      trusteeMattersClaimed: ["TRUST_DISTRIBUTION"],
    });
    expect(check.permitted).toBe(false);
    expect(check.trusteeMattersClaimed).toContain("TRUST_DISTRIBUTION");
    expect(check.reason).toMatch(/may advise on these; it may not decide them/);
  });

  it("refuses a provision that does not declare subordination to law", () => {
    const check = checkSupremacy(
      provision({ subordinateTo: ["TRUST_INSTRUMENT", "REGULATORY_REQUIREMENT"] }),
      cleanReview,
    );
    expect(check.permitted).toBe(false);
    expect(check.reason).toMatch(/Does not declare subordination/);
  });

  it("refuses a provision with no legal review reference", () => {
    const check = checkSupremacy(provision(), { ...cleanReview, legalReviewReference: "" });
    expect(check.permitted).toBe(false);
  });
});

describe("provisions in force", () => {
  it("selects the active version at a date", () => {
    const { inForce, conflicts } = provisionsInForce(
      [
        provision({ version: "1.0.0", effectiveFrom: "2025-01-01", effectiveTo: "2025-12-31" }),
        provision({ provisionId: "FCP_2", version: "2.0.0", effectiveFrom: "2026-01-01" }),
      ],
      "2026-06-01",
    );
    expect(inForce.map((p) => p.version)).toEqual(["2.0.0"]);
    expect(conflicts).toEqual([]);
  });

  it("reports two versions in force rather than picking one", () => {
    const { conflicts } = provisionsInForce(
      [provision({ version: "1.0.0" }), provision({ provisionId: "FCP_2", version: "2.0.0" })],
      "2026-06-01",
    );
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]).toMatch(/2 versions in force/);
  });

  it("rejects a malformed asOf", () => {
    expect(() => provisionsInForce([provision()], "01-01-2026")).toThrow(FamilyInstitutionError);
  });
});

describe("the amendment pipeline", () => {
  it("stops a proposal at its declared stage", () => {
    const a = assessAmendment(proposal());
    expect(a.stageReached).toBe("PROPOSED");
    expect(a.complete).toBe(false);
    expect(a.refusals).toEqual([]);
    expect(a.stages.find((s) => s.stage === "LEGAL_REVIEW")?.satisfied).toBe(false);
  });

  it("refuses an AI actor at every stage", () => {
    const a = assessAmendment(proposal({ actorType: "AI" }));
    expect(a.aiRefused).toBe(true);
    expect(a.refusals.join(" ")).toMatch(/AI_CANNOT_AMEND_CONSTITUTION/);
    expect(a.complete).toBe(false);
  });

  it("refuses an amendment that fails the supremacy check", () => {
    const a = assessAmendment(
      proposal({
        supremacyCheck: checkSupremacy(provision(), {
          ...cleanReview,
          attemptedOverrides: ["APPLICABLE_LAW"],
        }),
      }),
    );
    expect(a.refusals.join(" ")).toMatch(/LEGAL_SUPREMACY_VIOLATION/);
  });

  it("refuses to amend the amendment procedure without a ratified higher threshold", () => {
    const a = assessAmendment(proposal({ amendsAmendmentProcedure: true }));
    expect(a.refusals.join(" ")).toMatch(/AMENDMENT_PROCEDURE_THRESHOLD_NOT_RATIFIED/);
    expect(a.policyDecisionRequired?.domain).toBe("AMENDMENT_PROCEDURE");
    expect(a.policyDecisionRequired?.decision).toBeNull();
  });

  it("carries a full pipeline through to RECORDED", () => {
    const electorate = ["M1", "M2", "M3", "M4", "M5"];
    const a = assessAmendment(
      proposal({
        currentStage: "RECORDED",
        supremacyCheck: checkSupremacy(provision(), cleanReview),
        legalReviewReference: "LEGAL-2026-014",
        legalReviewer: "External Counsel",
        governanceReviewReference: "FC-REV-009",
        governanceReviewer: "CHIEF_GOVERNANCE_OFFICER",
        votingEligibleMemberIds: electorate,
        recusedMemberIds: [],
        quorumMinimum: 4,
        requiredMajority: "TWO_THIRDS",
        ballots: electorate.map((m) => ({ memberId: m, vote: "FOR" as const })),
        verifiedBy: "INTERNAL_AUDITOR",
        verifiedAt: "2026-02-01",
        effectiveFrom: "2026-03-01",
        newVersion: "1.1.0",
        resolutionReference: "FC-RES-021",
        supersedesVersion: "1.0.0",
      }),
    );

    expect(a.refusals).toEqual([]);
    expect(a.stageReached).toBe("RECORDED");
    expect(a.complete).toBe(true);
    expect(a.ballotDecision?.outcome).toBe("APPROVED");
    expect(a.quorum?.met).toBe(true);
  });

  it("blocks approval when quorum is not met, using the canonical voting engine", () => {
    const electorate = ["M1", "M2", "M3", "M4", "M5"];
    const a = assessAmendment(
      proposal({
        currentStage: "RECORDED",
        supremacyCheck: checkSupremacy(provision(), cleanReview),
        legalReviewReference: "LEGAL-2026-014",
        legalReviewer: "External Counsel",
        governanceReviewReference: "FC-REV-009",
        governanceReviewer: "CHIEF_GOVERNANCE_OFFICER",
        votingEligibleMemberIds: electorate,
        recusedMemberIds: [],
        quorumMinimum: 4,
        requiredMajority: "TWO_THIRDS",
        ballots: [{ memberId: "M1", vote: "FOR" }],
        verifiedBy: "INTERNAL_AUDITOR",
        verifiedAt: "2026-02-01",
        effectiveFrom: "2026-03-01",
        newVersion: "1.1.0",
        resolutionReference: "FC-RES-021",
        supersedesVersion: "1.0.0",
      }),
    );

    expect(a.complete).toBe(false);
    expect(a.quorum?.met).toBe(false);
    expect(a.ballotDecision?.outcome).toBe("PENDING");
  });

  it("blocks approval on a tied vote — no automatic tie-break", () => {
    const electorate = ["M1", "M2", "M3", "M4"];
    const a = assessAmendment(
      proposal({
        currentStage: "RECORDED",
        supremacyCheck: checkSupremacy(provision(), cleanReview),
        legalReviewReference: "LEGAL-2026-014",
        legalReviewer: "External Counsel",
        governanceReviewReference: "FC-REV-009",
        governanceReviewer: "CHIEF_GOVERNANCE_OFFICER",
        votingEligibleMemberIds: electorate,
        recusedMemberIds: [],
        quorumMinimum: 4,
        requiredMajority: "SIMPLE",
        ballots: [
          { memberId: "M1", vote: "FOR" },
          { memberId: "M2", vote: "FOR" },
          { memberId: "M3", vote: "AGAINST" },
          { memberId: "M4", vote: "AGAINST" },
        ],
        verifiedBy: "INTERNAL_AUDITOR",
        verifiedAt: "2026-02-01",
        effectiveFrom: "2026-03-01",
        newVersion: "1.1.0",
        resolutionReference: "FC-RES-021",
        supersedesVersion: "1.0.0",
      }),
    );

    expect(a.complete).toBe(false);
    expect(a.ballotDecision?.outcome).toBe("DEADLOCKED");
  });
});

describe("version comparison", () => {
  it("flags the removal of subordination as the most serious change", () => {
    const comparison = compareProvisionVersions(
      provision(),
      provision({ version: "2.0.0", subordinateTo: ["APPLICABLE_LAW"] }),
    );
    expect(comparison.changeType).toBe("SUBORDINATION");
    expect(comparison.detail.join(" ")).toMatch(/weakens the provision/);
  });

  it("reports a wording-only change", () => {
    const comparison = compareProvisionVersions(provision(), provision({ version: "1.1.0", body: "Changed text." }));
    expect(comparison.changeType).toBe("WORDING");
  });
});

describe("AI authority boundary", () => {
  it.each(["propose", "review", "vote", "approve", "verify", "effect"] as const)(
    "refuses an AI actor asked to %s an amendment",
    (op) => {
      expect(() => assertConstitutionWriteIsHuman("AI", op)).toThrow(FamilyInstitutionError);
    },
  );

  it("permits a human actor", () => {
    expect(() => assertConstitutionWriteIsHuman("HUMAN", "approve")).not.toThrow();
  });
});
