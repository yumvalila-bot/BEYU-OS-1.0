/**
 * BEYU OS — FAMILY GOVERNANCE ARCHITECTURE ENGINE (pure).
 *
 * Models the family governance ladder and the ten configurable committees:
 *
 *     FAMILY MEETING → FAMILY ASSEMBLY → FAMILY COUNCIL → GOVERNANCE COMMITTEES
 *                  → FAMILY OFFICE → PROFESSIONAL MANAGEMENT
 *
 * ============================ FOUR INVARIANTS =============================
 *
 * 1. PARTICIPATION IS SIX INDEPENDENT AXES. Attendance, consultation, voting,
 *    ownership, beneficiary status and governance rights are never derived from
 *    one another. `assertParticipationAxesIndependent` refuses any derivation.
 * 2. A FAMILY BODY CANNOT EXERCISE POWERS IT DOES NOT LEGALLY POSSESS. A forum
 *    declares the powers it holds; a reserved matter outside that declaration is
 *    refused, not downgraded.
 * 3. TRUSTEE INDEPENDENCE IS ABSOLUTE. On a Trustee-reserved matter a family
 *    body's output is ADVISORY_ONLY unless a superior instrument validly confers
 *    the power. The Family Office cannot order a Trustee to act.
 * 4. A COMMITTEE WITHOUT A COMPLETE MANDATE DOES NOT EXIST. All ten mandate
 *    elements are required. A partial mandate is reported incomplete rather than
 *    defaulted.
 */
import {
  FAMILY_FORUMS,
  FORUM_TYPES,
  GOVERNANCE_COMMITTEES,
  PARTICIPATION_AXES,
  assertHumanAuthority,
  assertIsoDate,
  absentFields,
  COMMITTEE_MANDATE_ELEMENTS,
  FamilyInstitutionError,
  forumRank,
  isPresent,
  isTrusteeReservedMatter,
  type FamilyActorType,
  type ForumType,
  type GovernanceCommittee,
  type ParticipationAxis,
  type ParticipationGrant,
  type PolicyDecisionRequirement,
} from "./model";

export const INSTITUTION_ENGINE_VERSION = "family-institution-1.0.0";

/* ------------------------------------------------------------------ */
/* Participation axes                                                  */
/* ------------------------------------------------------------------ */

/**
 * Derivations that are structurally forbidden.
 *
 * Each entry reads: the axis on the left may NOT be inferred from the axis on
 * the right. Ownership does not confer governance; attendance does not confer
 * voting; being a beneficiary does not confer ownership; and so on.
 */
export const FORBIDDEN_AXIS_DERIVATIONS: ReadonlyArray<{
  from: ParticipationAxis;
  cannotBeDerivedFrom: ParticipationAxis;
  reason: string;
}> = [
  { from: "VOTING", cannotBeDerivedFrom: "ATTENDANCE", reason: "Attending a forum does not create a vote." },
  { from: "VOTING", cannotBeDerivedFrom: "OWNERSHIP", reason: "Owning does not automatically create a governance vote." },
  { from: "VOTING", cannotBeDerivedFrom: "BENEFICIARY", reason: "Beneficiary status is not a governance right." },
  { from: "GOVERNANCE_RIGHT", cannotBeDerivedFrom: "OWNERSHIP", reason: "Ownership ≠ governance. Professional management must remain available." },
  { from: "GOVERNANCE_RIGHT", cannotBeDerivedFrom: "ATTENDANCE", reason: "Attendance is not governance authority." },
  { from: "OWNERSHIP", cannotBeDerivedFrom: "BENEFICIARY", reason: "A beneficial interest is not ownership of the family line." },
  { from: "OWNERSHIP", cannotBeDerivedFrom: "GOVERNANCE_RIGHT", reason: "Governance authority does not create ownership." },
  { from: "BENEFICIARY", cannotBeDerivedFrom: "OWNERSHIP", reason: "Ownership does not automatically create beneficiary status." },
  { from: "CONSULTATION", cannotBeDerivedFrom: "VOTING", reason: "A voter is not automatically a consultee on every matter, and a consultee is not a voter." },
  { from: "ATTENDANCE", cannotBeDerivedFrom: "GOVERNANCE_RIGHT", reason: "Governance authority does not confer attendance at household-level forums." },
];

/**
 * Refuse a participation model that derives one axis from another.
 *
 * `derivations` is what the caller proposes to infer. Any entry matching a
 * forbidden pair is refused with its reason, so the refusal is auditable rather
 * than a bare error.
 */
export function assertParticipationAxesIndependent(
  derivations: ReadonlyArray<{ grants: ParticipationAxis; derivedFrom: ParticipationAxis }>,
): { permitted: boolean; refusals: string[] } {
  const refusals: string[] = [];
  for (const d of derivations) {
    const rule = FORBIDDEN_AXIS_DERIVATIONS.find(
      (r) => r.from === d.grants && r.cannotBeDerivedFrom === d.derivedFrom,
    );
    if (rule) {
      refusals.push(`${d.grants} may not be derived from ${d.derivedFrom}: ${rule.reason}`);
    } else if (d.grants === d.derivedFrom) {
      refusals.push(`${d.grants} cannot be derived from itself.`);
    }
  }
  return { permitted: refusals.length === 0, refusals };
}

/**
 * Normalise a participation grant so every axis is explicitly present.
 *
 * An unspecified axis is `false`, never "inherited". Silence means no right.
 */
export function normaliseParticipation(grant: ParticipationGrant): Record<ParticipationAxis, boolean> {
  const out = {} as Record<ParticipationAxis, boolean>;
  for (const axis of PARTICIPATION_AXES) out[axis] = grant[axis] === true;
  return out;
}

/* ------------------------------------------------------------------ */
/* Forums                                                              */
/* ------------------------------------------------------------------ */

export type FamilyForum = {
  forumId: string;
  code: string;
  name: string;
  forumType: ForumType;
  /** The governance_bodies row this forum is bound to. Required for family bodies. */
  governanceBodyId: string | null;
  /** ISO cadence description, e.g. "ANNUAL". Configurable — never assumed. */
  cadence: string;
  /**
   * Powers this forum validly holds, with the reference that confers each.
   * A power without a source reference is not held.
   */
  powers: Array<{ power: string; conferredByReference: string }>;
  /** Matters the forum proposes to decide. */
  decidedMatters: string[];
  quorumMinimum: number;
  majorityRule: string;
  /** Committee code when forumType is GOVERNANCE_COMMITTEE. */
  committee?: GovernanceCommittee | null;
};

export type ForumValidation = {
  engineVersion: string;
  forumId: string;
  valid: boolean;
  /** Matters the forum may decide on its own authority. */
  decidable: string[];
  /** Matters on which the forum's output is advisory only. */
  advisoryOnly: string[];
  /** Matters the forum has no standing on at all. */
  refused: string[];
  blockers: string[];
  /** Escalation path from this forum, in order. */
  escalationPath: ForumType[];
  policyDecisionRequired: PolicyDecisionRequirement | null;
};

/**
 * Validate a forum and classify every matter it proposes to decide.
 *
 * `trustInstrumentConfersPower` records whether the Trust instrument and
 * applicable law validly confer a Trustee-reserved power on this family body. It
 * is supplied from a legal review. Where it is absent the matter is advisory —
 * the conservative answer — and a policy decision is raised only when the forum
 * actually claims the power.
 */
export function validateForum(
  forum: FamilyForum,
  review: {
    trustInstrumentConfersPower: boolean;
    instrumentReference: string | null;
    legalReviewReference: string | null;
  },
): ForumValidation {
  const blockers: string[] = [];
  const decidable: string[] = [];
  const advisoryOnly: string[] = [];
  const refused: string[] = [];
  let policyDecisionRequired: PolicyDecisionRequirement | null = null;

  if (!FORUM_TYPES.includes(forum.forumType)) {
    blockers.push(`Unknown forum type ${forum.forumType}.`);
  }
  if (FAMILY_FORUMS.includes(forum.forumType) && !isPresent(forum.governanceBodyId)) {
    blockers.push(
      "A family body must be bound to a governance_bodies row: quorum, majority rule, membership and votes are governed there, not re-implemented here.",
    );
  }
  if (forum.forumType === "GOVERNANCE_COMMITTEE" && !forum.committee) {
    blockers.push("A GOVERNANCE_COMMITTEE forum must name its committee.");
  }
  if (forum.committee && !GOVERNANCE_COMMITTEES.includes(forum.committee)) {
    blockers.push(`${forum.committee} is not a recognised governance committee.`);
  }
  if (!isPresent(forum.cadence)) {
    blockers.push("Cadence is configurable and must be recorded; no default frequency is assumed.");
  }
  if (!(forum.quorumMinimum > 0)) {
    blockers.push("quorumMinimum must be a positive member count.");
  }
  if (!isPresent(forum.majorityRule)) {
    blockers.push("majorityRule must be recorded.");
  }

  const heldPowers = new Set(
    forum.powers.filter((p) => isPresent(p.power) && isPresent(p.conferredByReference)).map((p) => p.power),
  );
  for (const p of forum.powers) {
    if (!isPresent(p.conferredByReference)) {
      blockers.push(`Power "${p.power}" has no conferring reference and is therefore not held.`);
    }
  }

  for (const matter of forum.decidedMatters) {
    if (isTrusteeReservedMatter(matter)) {
      if (review.trustInstrumentConfersPower && isPresent(review.instrumentReference)) {
        decidable.push(matter);
      } else {
        advisoryOnly.push(matter);
        if (!review.legalReviewReference) {
          policyDecisionRequired = {
            code: `FAM-PD-TRUST-POWER-${forum.code}-${matter}`,
            issue: `Whether the Family Constitution or Trust instrument validly confers ${matter} on ${forum.name}.`,
            domain: "FAMILY_GOVERNANCE",
            options: [
              "The Trust instrument confers the power; record the clause and rely on it.",
              "The Family body holds an advisory role only; record that expressly.",
              "Seek a Trust Protector determination under the instrument.",
            ],
            assumptions: ["No legal review reference was supplied for this forum's claimed power."],
            legalImplications:
              "Trustee independence and fiduciary duties are non-delegable unless the instrument and applicable law provide otherwise. Assuming the power would be a breach.",
            taxImplications: "Trustee residence and control can determine Trust tax residence; family control may change it.",
            financialImplications: "Determines who may direct Trust investment and distribution.",
            risk: "Governance failure and potential Trustee liability.",
            decisionAuthority: "Legal counsel in the Trust jurisdiction, with the Trustees and any Trust Protector.",
            status: "OPEN",
            decision: null,
            decisionReference: null,
            effectiveDate: null,
          };
        }
      }
    } else if (heldPowers.has(matter)) {
      decidable.push(matter);
    } else {
      refused.push(matter);
      blockers.push(`${forum.name} does not hold the power "${matter}"; it cannot decide it.`);
    }
  }

  const escalationPath = FORUM_TYPES.filter((t) => forumRank(t) > forumRank(forum.forumType));

  return {
    engineVersion: INSTITUTION_ENGINE_VERSION,
    forumId: forum.forumId,
    valid: blockers.length === 0,
    decidable: decidable.sort(),
    advisoryOnly: advisoryOnly.sort(),
    refused: refused.sort(),
    blockers,
    escalationPath,
    policyDecisionRequired,
  };
}

/**
 * A Family Meeting is a household-level forum. It never overrides formal Family
 * Council, Trustee, corporate or legal authority — this returns that constraint
 * explicitly so no caller has to remember it.
 */
export const FAMILY_MEETING_CONSTRAINTS = [
  "Does not override formal Family Council authority.",
  "Does not override Trustee authority or fiduciary duties.",
  "Does not override corporate authority under constitutional documents.",
  "Does not override legal authority.",
  "Its outputs are communication, values transmission and preparation for governance.",
] as const;

/* ------------------------------------------------------------------ */
/* Committees                                                          */
/* ------------------------------------------------------------------ */

export type CommitteeMandate = {
  committee: GovernanceCommittee;
  mandate: string | null;
  membership: string[];
  authority: string | null;
  term: string | null;
  quorum: number | null;
  voting: string | null;
  conflicts: string | null;
  recusal: string | null;
  reporting: string | null;
  escalation: string | null;
};

export type MandateAssessment = {
  engineVersion: string;
  committee: GovernanceCommittee;
  complete: boolean;
  missing: string[];
  reason: string;
};

/** A committee mandate is incomplete unless all ten elements are present. */
export function assessCommitteeMandate(mandate: CommitteeMandate): MandateAssessment {
  const missing = COMMITTEE_MANDATE_ELEMENTS.filter((element) => {
    const value = (mandate as unknown as Record<string, unknown>)[element];
    return !isPresent(value);
  });

  if (!GOVERNANCE_COMMITTEES.includes(mandate.committee)) {
    return {
      engineVersion: INSTITUTION_ENGINE_VERSION,
      committee: mandate.committee,
      complete: false,
      missing: ["committee"],
      reason: `${String(mandate.committee)} is not one of the ${GOVERNANCE_COMMITTEES.length} recognised governance committees.`,
    };
  }

  return {
    engineVersion: INSTITUTION_ENGINE_VERSION,
    committee: mandate.committee,
    complete: missing.length === 0,
    missing,
    reason:
      missing.length === 0
        ? `${mandate.committee} mandate is complete: all ${COMMITTEE_MANDATE_ELEMENTS.length} elements present.`
        : `${mandate.committee} mandate is incomplete: ${missing.join(", ")} missing. A committee without a complete mandate cannot be constituted.`,
  };
}

/* ------------------------------------------------------------------ */
/* Meetings                                                            */
/* ------------------------------------------------------------------ */

export type MeetingRecord = {
  meetingId: string;
  forumId: string;
  heldOn: string;
  convenedBy: string;
  attendees: Array<{ memberId: string; participation: ParticipationGrant }>;
  agenda: string[];
  minutesReference: string | null;
  /** Matters the meeting purported to decide. */
  decisionsAttempted: string[];
  quorumMinimum: number;
};

export type MeetingAssessment = {
  engineVersion: string;
  meetingId: string;
  quorumMet: boolean;
  attendees: number;
  voters: number;
  /** Decisions the meeting may record. */
  recordable: string[];
  /** Decisions refused because the forum lacks the power. */
  refused: string[];
  blockers: string[];
  constraints: readonly string[];
};

/**
 * Assess a family meeting.
 *
 * Voting is counted from members whose ATTENDANCE and VOTING axes are both true —
 * because attendance alone does not create a vote, and a vote without attendance
 * in a household forum is not a meeting decision.
 */
export function assessMeeting(meeting: MeetingRecord, forum: FamilyForum): MeetingAssessment {
  assertIsoDate(meeting.heldOn, "meeting heldOn");
  const blockers: string[] = [];

  if (!isPresent(meeting.minutesReference)) {
    blockers.push("No minutes reference: a meeting without minutes cannot evidence its decisions.");
  }
  if (meeting.agenda.length === 0) {
    blockers.push("No agenda recorded.");
  }

  const normalised = meeting.attendees.map((a) => ({ ...a, participation: normaliseParticipation(a.participation) }));
  const attendees = normalised.filter((a) => a.participation.ATTENDANCE).length;
  const voters = normalised.filter((a) => a.participation.ATTENDANCE && a.participation.VOTING).length;

  const forumCheck = validateForum(forum, {
    trustInstrumentConfersPower: false,
    instrumentReference: null,
    legalReviewReference: "MEETING_ASSESSMENT",
  });

  const refused = meeting.decisionsAttempted.filter(
    (d) => !forumCheck.decidable.includes(d),
  );
  const recordable = meeting.decisionsAttempted.filter((d) => forumCheck.decidable.includes(d));

  if (refused.length > 0) {
    blockers.push(
      `${forum.name} may not decide: ${refused.join(", ")}. ${
        forum.forumType === "FAMILY_MEETING"
          ? "A Family Meeting does not override formal Family Council, Trustee, corporate or legal authority."
          : "The forum does not hold these powers."
      }`,
    );
  }

  const quorumMet = meeting.quorumMinimum > 0 && attendees >= meeting.quorumMinimum;
  if (!quorumMet) {
    blockers.push(
      `Quorum not met: ${attendees} attended, ${meeting.quorumMinimum} required (${voters} held a voting axis).`,
    );
  }

  return {
    engineVersion: INSTITUTION_ENGINE_VERSION,
    meetingId: meeting.meetingId,
    quorumMet,
    attendees,
    voters,
    recordable: recordable.sort(),
    refused: refused.sort(),
    blockers,
    constraints: forum.forumType === "FAMILY_MEETING" ? FAMILY_MEETING_CONSTRAINTS : [],
  };
}

/* ------------------------------------------------------------------ */
/* Family Office accountability                                        */
/* ------------------------------------------------------------------ */

/**
 * The Family Office professional structure. Functions may be internal or
 * external; what matters is that each has an accountable owner and a mandate.
 */
export const FAMILY_OFFICE_FUNCTIONS = [
  "FAMILY_OFFICE_CEO",
  "CHIEF_INVESTMENT_OFFICER",
  "FINANCE_LEADERSHIP",
  "LEGAL",
  "TAX",
  "RISK",
  "COMPLIANCE",
  "TRUST_PROFESSIONALS",
  "INVESTMENT_PROFESSIONALS",
  "PHILANTHROPY_PROFESSIONALS",
  "EDUCATION_PROFESSIONALS",
  "OPERATIONS",
  "TECHNOLOGY",
  "SECURITY",
] as const;
export type FamilyOfficeFunction = (typeof FAMILY_OFFICE_FUNCTIONS)[number];

export type AccountabilityRecord = {
  fn: FamilyOfficeFunction;
  deliveryModel: "INTERNAL" | "EXTERNAL";
  mandate: string | null;
  budgetReference: string | null;
  kpis: string[];
  accountableTo: string | null;
  appointedByReference: string | null;
};

export type AccountabilityAssessment = {
  engineVersion: string;
  fn: FamilyOfficeFunction;
  accountable: boolean;
  missing: string[];
  reason: string;
};

/**
 * Family Office leadership is accountable to the governance framework.
 *
 * A function with no mandate, no accountable body or no appointing reference is
 * not accountable, whatever its title. The Family Council may exercise only
 * authority validly assigned to it, so `accountableTo` must name a body that
 * exists in the ladder.
 */
export function assessAccountability(record: AccountabilityRecord): AccountabilityAssessment {
  const missing = absentFields({
    mandate: record.mandate,
    budgetReference: record.budgetReference,
    accountableTo: record.accountableTo,
    appointedByReference: record.appointedByReference,
  });
  if (record.kpis.length === 0) missing.push("kpis");

  return {
    engineVersion: INSTITUTION_ENGINE_VERSION,
    fn: record.fn,
    accountable: missing.length === 0,
    missing,
    reason:
      missing.length === 0
        ? `${record.fn} (${record.deliveryModel}) is accountable: mandate, budget, KPIs, reporting line and appointment reference all recorded.`
        : `${record.fn} (${record.deliveryModel}) is not accountable — missing: ${missing.join(", ")}.`,
  };
}

/* ------------------------------------------------------------------ */
/* Conflict of interest                                                */
/* ------------------------------------------------------------------ */

export const CONFLICT_CATEGORIES = [
  "FAMILY_CONFLICT",
  "ADVISER_CONFLICT",
  "TRUSTEE_CONFLICT",
  "INVESTMENT_CONFLICT",
  "RELATED_PARTY_TRANSACTION",
  "PROCUREMENT_CONFLICT",
  "FAMILY_LOAN_CONFLICT",
  "BUSINESS_CONFLICT",
] as const;
export type ConflictCategory = (typeof CONFLICT_CATEGORIES)[number];

export const CONFLICT_WORKFLOW = [
  "DISCLOSE",
  "FLAG",
  "RECUSE",
  "INDEPENDENT_REVIEW",
  "APPROVE",
  "RECORD",
  "AUDIT",
] as const;
export type ConflictWorkflowStep = (typeof CONFLICT_WORKFLOW)[number];

export type ConflictDeclaration = {
  conflictId: string;
  category: ConflictCategory;
  declaredBy: string;
  relatedPartyId: string | null;
  matterDescription: string;
  stepsCompleted: ConflictWorkflowStep[];
  recused: boolean;
  independentReviewer: string | null;
  actorType: FamilyActorType;
};

export type ConflictAssessment = {
  engineVersion: string;
  conflictId: string;
  cleared: boolean;
  nextStep: ConflictWorkflowStep | null;
  missingSteps: ConflictWorkflowStep[];
  blockers: string[];
};

/**
 * Conflict workflow: DISCLOSE → FLAG → RECUSE → INDEPENDENT REVIEW → APPROVE →
 * RECORD → AUDIT. Steps are enforced in order and none is optional.
 *
 * A recusal that has not happened blocks approval; an approval without an
 * independent reviewer does not clear the conflict.
 */
export function assessConflict(declaration: ConflictDeclaration): ConflictAssessment {
  const blockers: string[] = [];
  const completed = new Set(declaration.stepsCompleted);

  if (!isPresent(declaration.matterDescription)) blockers.push("No matter description recorded.");
  if (!completed.has("DISCLOSE")) blockers.push("The conflict has not been disclosed.");
  if (!completed.has("FLAG")) blockers.push("The conflict has not been flagged.");
  if (!declaration.recused) {
    blockers.push("The interested party has not recused; approval is not available.");
  }
  if (!completed.has("INDEPENDENT_REVIEW") || !isPresent(declaration.independentReviewer)) {
    blockers.push("No independent review by a named reviewer.");
  }
  if (declaration.independentReviewer === declaration.declaredBy) {
    blockers.push("The independent reviewer is the declarant. That is not an independent review.");
  }
  if (!completed.has("APPROVE")) blockers.push("No approval recorded.");
  if (!completed.has("RECORD")) blockers.push("The decision has not been recorded.");
  if (!completed.has("AUDIT")) blockers.push("No audit record.");

  const missingSteps = CONFLICT_WORKFLOW.filter((s) => !completed.has(s));
  const nextStep = missingSteps[0] ?? null;

  return {
    engineVersion: INSTITUTION_ENGINE_VERSION,
    conflictId: declaration.conflictId,
    cleared: blockers.length === 0,
    nextStep,
    missingSteps,
    blockers,
  };
}

/* ------------------------------------------------------------------ */
/* Refusals                                                            */
/* ------------------------------------------------------------------ */

/** Governance records may never be written by an AI actor. */
export function assertGovernanceWriteIsHuman(actorType: FamilyActorType, operation: string): void {
  assertHumanAuthority(actorType, operation);
}

/**
 * Refuse a governance body that is not in the ladder.
 *
 * Prevents a caller from inventing a seventh forum with whatever powers it
 * likes — the specific failure mode the fixed ladder exists to prevent.
 */
export function assertKnownForumType(forumType: string): asserts forumType is ForumType {
  if (!FORUM_TYPES.includes(forumType as ForumType)) {
    throw new FamilyInstitutionError(
      "RULE_VIOLATION",
      `${forumType} is not a recognised family governance forum. The ladder is fixed: ${FORUM_TYPES.join(" → ")}.`,
      { forumType },
    );
  }
}
