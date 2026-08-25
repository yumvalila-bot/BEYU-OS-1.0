import { describe, expect, it } from "vitest";
import {
  assessAccountability,
  assessCommitteeMandate,
  assessConflict,
  assessMeeting,
  assertKnownForumType,
  assertParticipationAxesIndependent,
  normaliseParticipation,
  validateForum,
  FAMILY_MEETING_CONSTRAINTS,
  type CommitteeMandate,
  type ConflictDeclaration,
  type FamilyForum,
  type MeetingRecord,
} from "../../src/lib/family/institution";
import { FamilyInstitutionError } from "../../src/lib/family/model";

/**
 * Family governance architecture — pure, no database.
 */

const council: FamilyForum = {
  forumId: "FFM_COUNCIL",
  code: "FAMILY_COUNCIL",
  name: "BEYU Family Council",
  forumType: "FAMILY_COUNCIL",
  governanceBodyId: "GOV_COUNCIL",
  cadence: "QUARTERLY",
  powers: [
    { power: "FAMILY_STRATEGY", conferredByReference: "FC-2.1" },
    { power: "FAMILY_OFFICE_MANDATE", conferredByReference: "FC-2.4" },
  ],
  decidedMatters: ["FAMILY_STRATEGY", "FAMILY_OFFICE_MANDATE"],
  quorumMinimum: 3,
  majorityRule: "SIMPLE",
};

describe("participation axes", () => {
  it("refuses every forbidden derivation", () => {
    const cases: Array<[string, string]> = [
      ["VOTING", "ATTENDANCE"],
      ["VOTING", "OWNERSHIP"],
      ["GOVERNANCE_RIGHT", "OWNERSHIP"],
      ["OWNERSHIP", "BENEFICIARY"],
      ["BENEFICIARY", "OWNERSHIP"],
    ];
    for (const [grants, derivedFrom] of cases) {
      const result = assertParticipationAxesIndependent([
        { grants: grants as never, derivedFrom: derivedFrom as never },
      ]);
      expect(result.permitted).toBe(false);
      expect(result.refusals.length).toBe(1);
    }
  });

  it("permits an explicit, non-derived grant", () => {
    const result = assertParticipationAxesIndependent([
      { grants: "CONSULTATION", derivedFrom: "ATTENDANCE" },
    ]);
    // CONSULTATION is not in the forbidden table as derived-from ATTENDANCE only
    // where the pair is listed; attendance may enable consultation as a matter of
    // forum logistics, so this pair is permitted.
    expect(result.permitted).toBe(true);
  });

  it("treats an unspecified axis as no right, never inherited", () => {
    const n = normaliseParticipation({ ATTENDANCE: true });
    expect(n.ATTENDANCE).toBe(true);
    expect(n.VOTING).toBe(false);
    expect(n.OWNERSHIP).toBe(false);
    expect(n.BENEFICIARY).toBe(false);
  });
});

describe("forum validation", () => {
  it("accepts a council deciding only the powers it holds", () => {
    const v = validateForum(council, {
      trustInstrumentConfersPower: false,
      instrumentReference: null,
      legalReviewReference: "LEGAL-2026-014",
    });
    expect(v.valid).toBe(true);
    expect(v.decidable).toEqual(["FAMILY_OFFICE_MANDATE", "FAMILY_STRATEGY"]);
    expect(v.advisoryOnly).toEqual([]);
  });

  it("refuses a matter the forum does not hold", () => {
    const v = validateForum(
      { ...council, decidedMatters: ["FAMILY_STRATEGY", "APPOINT_CEO_OF_OPERATING_COMPANY"] },
      { trustInstrumentConfersPower: false, instrumentReference: null, legalReviewReference: "L" },
    );
    expect(v.valid).toBe(false);
    expect(v.refused).toContain("APPOINT_CEO_OF_OPERATING_COMPANY");
  });

  it("treats a Trustee-reserved matter as advisory unless the instrument confers the power", () => {
    // A legal review has settled the question: the power is not conferred, so
    // advisory is the answer and no policy decision is outstanding.
    const advisory = validateForum(
      { ...council, decidedMatters: ["TRUST_DISTRIBUTION"] },
      { trustInstrumentConfersPower: false, instrumentReference: null, legalReviewReference: "L" },
    );
    expect(advisory.advisoryOnly).toContain("TRUST_DISTRIBUTION");
    expect(advisory.decidable).not.toContain("TRUST_DISTRIBUTION");
    expect(advisory.policyDecisionRequired).toBeNull();

    // With no legal review, the forum is claiming a reserved power nobody has
    // confirmed it holds. Advisory is still the conservative answer, but the
    // question is now open and must be recorded.
    const unreviewed = validateForum(
      { ...council, decidedMatters: ["TRUST_DISTRIBUTION"] },
      { trustInstrumentConfersPower: false, instrumentReference: null, legalReviewReference: null },
    );
    expect(unreviewed.advisoryOnly).toContain("TRUST_DISTRIBUTION");
    expect(unreviewed.policyDecisionRequired).not.toBeNull();
    expect(unreviewed.policyDecisionRequired?.domain).toBe("FAMILY_GOVERNANCE");
    expect(unreviewed.policyDecisionRequired?.decision).toBeNull();

    const conferred = validateForum(
      { ...council, decidedMatters: ["TRUST_DISTRIBUTION"] },
      { trustInstrumentConfersPower: true, instrumentReference: "TRUST-2024 cl.12", legalReviewReference: "L" },
    );
    expect(conferred.decidable).toContain("TRUST_DISTRIBUTION");
    expect(conferred.policyDecisionRequired).toBeNull();
  });

  it("refuses a power with no conferring reference", () => {
    const v = validateForum(
      { ...council, powers: [{ power: "FAMILY_STRATEGY", conferredByReference: "" }] },
      { trustInstrumentConfersPower: false, instrumentReference: null, legalReviewReference: "L" },
    );
    expect(v.valid).toBe(false);
    expect(v.blockers.join(" ")).toMatch(/no conferring reference/);
  });

  it("refuses a family body not bound to a governance_bodies row", () => {
    const v = validateForum(
      { ...council, governanceBodyId: null },
      { trustInstrumentConfersPower: false, instrumentReference: null, legalReviewReference: "L" },
    );
    expect(v.valid).toBe(false);
    expect(v.blockers.join(" ")).toMatch(/governance_bodies/);
  });

  it("refuses an assumed meeting cadence", () => {
    const v = validateForum(
      { ...council, cadence: "" },
      { trustInstrumentConfersPower: false, instrumentReference: null, legalReviewReference: "L" },
    );
    expect(v.valid).toBe(false);
    expect(v.blockers.join(" ")).toMatch(/no default frequency is assumed/);
  });

  it("produces a downward escalation path", () => {
    const v = validateForum(council, {
      trustInstrumentConfersPower: false,
      instrumentReference: null,
      legalReviewReference: "L",
    });
    expect(v.escalationPath[0]).toBe("GOVERNANCE_COMMITTEE");
    expect(v.escalationPath).toContain("PROFESSIONAL_MANAGEMENT");
  });

  it("refuses an invented seventh forum type", () => {
    expect(() => assertKnownForumType("FAMILY_SENATE")).toThrow(FamilyInstitutionError);
    expect(() => assertKnownForumType("FAMILY_COUNCIL")).not.toThrow();
  });
});

describe("committee mandates", () => {
  const fullMandate: CommitteeMandate = {
    committee: "FAMILY_LOAN_COMMITTEE",
    mandate: "Assess and recommend family loans.",
    membership: ["M1", "M2", "M3"],
    authority: "Recommendation to Family Council.",
    term: "3 years",
    quorum: 2,
    voting: "Simple majority",
    conflicts: "Declared at each meeting.",
    recusal: "Mandatory on interest.",
    reporting: "Quarterly to Council.",
    escalation: "To Family Council.",
  };

  it("accepts a complete mandate", () => {
    const a = assessCommitteeMandate(fullMandate);
    expect(a.complete).toBe(true);
    expect(a.missing).toEqual([]);
  });

  it("reports every missing element of an incomplete mandate", () => {
    const a = assessCommitteeMandate({ ...fullMandate, conflicts: null, recusal: null, escalation: null });
    expect(a.complete).toBe(false);
    expect(a.missing.sort()).toEqual(["conflicts", "escalation", "recusal"]);
  });

  it("refuses an unrecognised committee", () => {
    const a = assessCommitteeMandate({ ...fullMandate, committee: "PARTY_COMMITTEE" as never });
    expect(a.complete).toBe(false);
    expect(a.missing).toContain("committee");
  });
});

describe("family meetings", () => {
  const meeting = (over: Partial<MeetingRecord> = {}): MeetingRecord => ({
    meetingId: "FMT_1",
    forumId: "FFM_MEETING",
    heldOn: "2026-03-01",
    convenedBy: "HOUSEHOLD_HEAD",
    attendees: [
      { memberId: "M1", participation: { ATTENDANCE: true, VOTING: true } },
      { memberId: "M2", participation: { ATTENDANCE: true, VOTING: true } },
      { memberId: "M3", participation: { ATTENDANCE: true } },
    ],
    agenda: ["Financial literacy", "Youth development"],
    minutesReference: "DOC_MIN_1",
    decisionsAttempted: [],
    quorumMinimum: 2,
    ...over,
  });

  const familyMeeting: FamilyForum = {
    forumId: "FFM_MEETING",
    code: "FAMILY_MEETING",
    name: "BEYU Family Meeting",
    forumType: "FAMILY_MEETING",
    governanceBodyId: "GOV_MEETING",
    cadence: "MONTHLY",
    powers: [{ power: "FINANCIAL_LITERACY_PROGRAMME", conferredByReference: "FC-6.1" }],
    decidedMatters: ["FINANCIAL_LITERACY_PROGRAMME"],
    quorumMinimum: 2,
    majorityRule: "SIMPLE",
  };

  it("counts attendance and voting separately", () => {
    const a = assessMeeting(meeting(), familyMeeting);
    expect(a.attendees).toBe(3);
    expect(a.voters).toBe(2);
    expect(a.quorumMet).toBe(true);
  });

  it("refuses a meeting decision the forum has no power over", () => {
    const a = assessMeeting(meeting({ decisionsAttempted: ["APPROVE_FAMILY_LOAN"] }), familyMeeting);
    expect(a.refused).toContain("APPROVE_FAMILY_LOAN");
    expect(a.blockers.join(" ")).toMatch(/does not override formal Family Council/);
  });

  it("records a decision within the forum's power", () => {
    const a = assessMeeting(
      meeting({ decisionsAttempted: ["FINANCIAL_LITERACY_PROGRAMME"] }),
      familyMeeting,
    );
    expect(a.recordable).toContain("FINANCIAL_LITERACY_PROGRAMME");
  });

  it("states the Family Meeting constraints", () => {
    expect(FAMILY_MEETING_CONSTRAINTS.join(" ")).toMatch(/Does not override Trustee authority/);
  });

  it("requires minutes", () => {
    const a = assessMeeting(meeting({ minutesReference: null }), familyMeeting);
    expect(a.blockers.join(" ")).toMatch(/without minutes/);
  });
});

describe("Family Office accountability", () => {
  it("accepts a fully accountable function", () => {
    const a = assessAccountability({
      fn: "FAMILY_OFFICE_CEO",
      deliveryModel: "INTERNAL",
      mandate: "Execute the Family Office mandate.",
      budgetReference: "FC-BUD-2026",
      kpis: ["Cost ratio", "Service levels"],
      accountableTo: "FAMILY_COUNCIL",
      appointedByReference: "FC-RES-003",
    });
    expect(a.accountable).toBe(true);
  });

  it("refuses a function with no reporting line or KPIs", () => {
    const a = assessAccountability({
      fn: "CHIEF_INVESTMENT_OFFICER",
      deliveryModel: "EXTERNAL",
      mandate: "Manage the portfolio.",
      budgetReference: null,
      kpis: [],
      accountableTo: null,
      appointedByReference: "FC-RES-004",
    });
    expect(a.accountable).toBe(false);
    expect(a.missing.sort()).toEqual(["accountableTo", "budgetReference", "kpis"]);
  });
});

describe("conflict of interest workflow", () => {
  const declaration: ConflictDeclaration = {
    conflictId: "FCI_1",
    category: "FAMILY_LOAN_CONFLICT" as const,
    declaredBy: "COUNCIL_MEMBER_2",
    relatedPartyId: "FAM_G2B",
    matterDescription: "Loan to a sibling's venture.",
    stepsCompleted: ["DISCLOSE", "FLAG", "RECUSE", "INDEPENDENT_REVIEW", "APPROVE", "RECORD", "AUDIT"],
    recused: true,
    independentReviewer: "AUDIT_COMMITTEE_CHAIR",
    actorType: "HUMAN",
  };

  it("clears a conflict that completed the whole workflow", () => {
    const a = assessConflict({ ...declaration, stepsCompleted: [...declaration.stepsCompleted] });
    expect(a.cleared).toBe(true);
    expect(a.nextStep).toBeNull();
  });

  it("blocks approval where the interested party has not recused", () => {
    const a = assessConflict({ ...declaration, recused: false });
    expect(a.cleared).toBe(false);
    expect(a.blockers.join(" ")).toMatch(/has not recused/);
  });

  it("refuses a self-review", () => {
    const a = assessConflict({ ...declaration, independentReviewer: "COUNCIL_MEMBER_2" });
    expect(a.cleared).toBe(false);
    expect(a.blockers.join(" ")).toMatch(/not an independent review/);
  });

  it("reports the next outstanding step", () => {
    const a = assessConflict({ ...declaration, stepsCompleted: ["DISCLOSE", "FLAG"] });
    expect(a.nextStep).toBe("RECUSE");
    expect(a.missingSteps).toContain("AUDIT");
  });
});
