/**
 * BEYU OS — FAMILY CONSTITUTION & AMENDMENT ENGINE (pure).
 *
 * The BEYU FAMILY CONSTITUTION is the family's governed policy and stewardship
 * framework. It is a POLICY instrument. It sits below the BEYU OS Constitution
 * and below every legal instrument, and it creates no legal authority.
 *
 * ============================ THREE INVARIANTS ============================
 *
 * 1. THE FAMILY CONSTITUTION NEVER OVERRIDES LAW. Any provision that would
 *    override applicable law, a Trust deed, a letter of wishes, corporate
 *    constitutional documents, a shareholder agreement, a fiduciary duty, a
 *    regulatory requirement or a court order is refused outright. The legal
 *    hierarchy always prevails, and this engine enforces that mechanically
 *    rather than by convention.
 * 2. NO AI AMENDMENT. An AI actor may draft, summarise and compare provisions.
 *    It may never propose, review, vote, approve, verify or effect an amendment.
 *    Every stage of the pipeline checks the actor.
 * 3. THE AMENDMENT MECHANISM IS ITSELF GOVERNED. Amending AMENDMENT_PROCEDURE
 *    requires an expressly supplied higher threshold. Where none has been
 *    ratified the engine raises POLICY DECISION REQUIRED and refuses — it does
 *    not fall back to the ordinary threshold, because that would let the
 *    mechanism be weakened by the mechanism it is meant to protect.
 *
 * ============================== WHAT IT IS NOT ==============================
 *
 * Not the BEYU OS Constitution (`constitution_articles`, 12 articles, the
 * highest authority in the policy hierarchy). Not a source of law. Not a
 * substitute for a Trust deed.
 */
import {
  amendmentStageRank,
  assertHumanAuthority,
  assertIsoDate,
  FamilyInstitutionError,
  isPresent,
  isSuperiorInstrument,
  isTrusteeReservedMatter,
  type AmendmentStage,
  type ConstitutionDomain,
  type FamilyActorType,
  type PolicyDecisionRequirement,
  type SuperiorInstrument,
  type VersionStatus,
} from "./model";
import {
  allEligibleHaveVoted,
  calculateQuorum,
  decideResolution,
  tallyBallots,
  type BallotLine,
  type Decision,
  type MajorityRule,
  type QuorumResult,
  type Tally,
} from "@/lib/governance-voting";

export const FAMILY_CONSTITUTION_ENGINE_VERSION = "family-constitution-1.0.0";

/* ------------------------------------------------------------------ */
/* Provisions                                                          */
/* ------------------------------------------------------------------ */

export type ConstitutionProvision = {
  provisionId: string;
  /** Stable clause reference, e.g. "FC-3.2". Survives amendment. */
  clauseRef: string;
  domain: ConstitutionDomain;
  title: string;
  body: string;
  version: string;
  status: VersionStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  /** Governance reference that ratified this version. */
  ratifiedByReference: string;
  /**
   * Instruments this provision expressly yields to. Recording them is not
   * optional: a provision that does not state its subordination cannot be
   * checked against the legal hierarchy.
   */
  subordinateTo: SuperiorInstrument[];
};

export type SupremacyCheck = {
  provisionId: string;
  /** True when the provision is properly subordinate and conflicts with nothing. */
  permitted: boolean;
  /** Any superior instrument the provision attempts to override. */
  overrides: SuperiorInstrument[];
  /** Any Trustee-reserved matter the provision attempts to decide. */
  trusteeMattersClaimed: string[];
  reason: string;
};

/**
 * The supremacy check.
 *
 * `attemptedOverrides` is supplied by the caller from a legal review: this engine
 * cannot read a Trust deed. What it CAN do, and does, is refuse any provision
 * that does not declare subordination to every superior instrument, and any
 * provision that claims a Trustee-reserved matter as a family decision.
 */
export function checkSupremacy(
  provision: ConstitutionProvision,
  review: {
    /** Instruments a legal review found the provision would override. */
    attemptedOverrides: SuperiorInstrument[];
    /** Trustee-reserved matters the provision purports to decide. */
    trusteeMattersClaimed: string[];
    /** Whether the Trustees hold independent authority unaffected by this provision. */
    trusteeIndependencePreserved: boolean;
    legalReviewReference: string;
  },
): SupremacyCheck {
  const overrides = [...new Set(review.attemptedOverrides.filter(isSuperiorInstrument))].sort();
  const trusteeMatters = [
    ...new Set(review.trusteeMattersClaimed.filter(isTrusteeReservedMatter)),
  ].sort();

  const undeclaredSubordination = (
    [
      "APPLICABLE_LAW",
      "COURT_ORDER",
      "TRUST_INSTRUMENT",
      "TRUSTEE_FIDUCIARY_DUTY",
      "REGULATORY_REQUIREMENT",
    ] as SuperiorInstrument[]
  ).filter((i) => !provision.subordinateTo.includes(i));

  const problems: string[] = [];
  if (overrides.length > 0) {
    problems.push(`Attempts to override: ${overrides.join(", ")}.`);
  }
  if (trusteeMatters.length > 0) {
    problems.push(
      `Claims Trustee-reserved matters: ${trusteeMatters.join(", ")}. A family body may advise on these; it may not decide them unless the governing instrument and applicable law validly confer the power.`,
    );
  }
  if (!review.trusteeIndependencePreserved) {
    problems.push("Trustee independence is not preserved by this provision.");
  }
  if (undeclaredSubordination.length > 0) {
    problems.push(
      `Does not declare subordination to: ${undeclaredSubordination.join(", ")}. Every family provision must state its subordination to law, court orders, Trust instruments, fiduciary duties and regulatory requirements.`,
    );
  }
  if (!isPresent(review.legalReviewReference)) {
    problems.push("No legal review reference was supplied.");
  }

  return {
    provisionId: provision.provisionId,
    permitted: problems.length === 0,
    overrides,
    trusteeMattersClaimed: trusteeMatters,
    reason:
      problems.length === 0
        ? `Provision ${provision.clauseRef} is subordinate to every superior instrument and claims no reserved matter.`
        : problems.join(" "),
  };
}

/**
 * Effective-dated provision selection.
 *
 * Exactly one ACTIVE version of a clause may be in force at a date. Two is a
 * conflict and is reported, never resolved by picking the later one.
 */
export function provisionsInForce(
  provisions: readonly ConstitutionProvision[],
  asOf: string,
): { inForce: ConstitutionProvision[]; conflicts: string[] } {
  assertIsoDate(asOf, "asOf");
  const inForce = provisions.filter(
    (p) =>
      p.status === "ACTIVE" &&
      p.effectiveFrom <= asOf &&
      (p.effectiveTo === null || p.effectiveTo >= asOf),
  );

  const seen = new Map<string, string[]>();
  for (const p of inForce) {
    const list = seen.get(p.clauseRef) ?? [];
    list.push(p.version);
    seen.set(p.clauseRef, list);
  }
  const conflicts = [...seen.entries()]
    .filter(([, versions]) => versions.length > 1)
    .map(([clause, versions]) => `${clause} has ${versions.length} versions in force: ${versions.sort().join(", ")}`)
    .sort();

  return { inForce: inForce.sort((a, b) => a.clauseRef.localeCompare(b.clauseRef)), conflicts };
}

/* ------------------------------------------------------------------ */
/* Amendment pipeline                                                  */
/* ------------------------------------------------------------------ */

/**
 * The evidence a stage needs before it may be completed.
 *
 * A stage with an unsatisfied requirement is refused. Stages are never skipped,
 * and never completed out of order.
 */
export const AMENDMENT_STAGE_REQUIREMENTS: Record<
  AmendmentStage,
  {
    /** Fields that must be present on the proposal for this stage to run. */
    requiresFields: string[];
    /** Whether the acting party must be human. Always true for stages that confer. */
    humanOnly: boolean;
    description: string;
  }
> = {
  PROPOSED: {
    requiresFields: ["proposal", "rationale", "affectedProvisions", "proposedBy"],
    humanOnly: true,
    description: "A proposal, its rationale, the provisions it affects and an accountable proposer.",
  },
  LEGAL_REVIEW: {
    requiresFields: ["legalReviewReference", "legalReviewer", "supremacyCheck"],
    humanOnly: true,
    description: "A named legal reviewer, a review reference and the supremacy check result.",
  },
  GOVERNANCE_REVIEW: {
    requiresFields: ["governanceReviewReference", "governanceReviewer"],
    humanOnly: true,
    description: "Review by the body holding governance authority over the affected provisions.",
  },
  VOTING: {
    requiresFields: ["votingEligibleMemberIds", "quorumMinimum", "requiredMajority"],
    humanOnly: true,
    description: "A defined electorate, a quorum and a voting threshold.",
  },
  APPROVED: {
    requiresFields: ["ballots"],
    humanOnly: true,
    description: "A ballot outcome that satisfies quorum and the required majority.",
  },
  VERIFIED: {
    requiresFields: ["verifiedBy", "verifiedAt"],
    humanOnly: true,
    description: "Independent verification that the recorded outcome matches the vote.",
  },
  EFFECTIVE: {
    requiresFields: ["effectiveFrom", "newVersion"],
    humanOnly: true,
    description: "An effective date and the new version identifier.",
  },
  RECORDED: {
    requiresFields: ["resolutionReference", "supersedesVersion"],
    humanOnly: true,
    description: "A governance reference and the version superseded, so history is complete.",
  },
};

export type AmendmentProposal = {
  amendmentId: string;
  /** The full text of the proposed provision(s). */
  proposal: string;
  rationale: string;
  affectedProvisions: string[];
  proposedBy: string;
  currentStage: AmendmentStage;
  actorType: FamilyActorType;

  legalReviewReference?: string | null;
  legalReviewer?: string | null;
  /** Result of `checkSupremacy`. A non-permitted provision can never proceed. */
  supremacyCheck?: SupremacyCheck | null;

  governanceReviewReference?: string | null;
  governanceReviewer?: string | null;

  votingEligibleMemberIds?: string[];
  recusedMemberIds?: string[];
  quorumMinimum?: number;
  requiredMajority?: MajorityRule;
  ballots?: BallotLine[];

  verifiedBy?: string | null;
  verifiedAt?: string | null;

  effectiveFrom?: string | null;
  newVersion?: string | null;
  resolutionReference?: string | null;
  supersedesVersion?: string | null;

  /** True when the amendment touches AMENDMENT_PROCEDURE itself. */
  amendsAmendmentProcedure: boolean;
  /**
   * The higher threshold the Constitution requires to amend its own amendment
   * procedure. Supplied from the ratified instrument — never defaulted.
   */
  amendmentProcedureThreshold?: { majority: MajorityRule; quorumMinimum: number; instrumentReference: string } | null;
};

export type StageAssessment = {
  stage: AmendmentStage;
  satisfied: boolean;
  missingFields: string[];
  reason: string;
};

export type AmendmentAssessment = {
  engineVersion: string;
  amendmentId: string;
  /** The furthest stage the proposal has legitimately reached. */
  stageReached: AmendmentStage;
  /** Every stage, in order, with its assessment. */
  stages: StageAssessment[];
  /** True when every stage through RECORDED is satisfied. */
  complete: boolean;
  /** Hard refusals. Any one of these stops the amendment permanently. */
  refusals: string[];
  /** The ballot arithmetic, once ballots exist. Never derived from a claim. */
  tally: Tally | null;
  quorum: QuorumResult | null;
  /** The constitutional decision, computed by the ONE voting engine. */
  ballotDecision: Decision | null;
  policyDecisionRequired: PolicyDecisionRequirement | null;
  /** True when an AI actor was refused. */
  aiRefused: boolean;
};

function assessStage(
  stage: AmendmentStage,
  proposal: AmendmentProposal,
): StageAssessment {
  const spec = AMENDMENT_STAGE_REQUIREMENTS[stage];
  const missingFields = spec.requiresFields.filter((field) => {
    const value = (proposal as unknown as Record<string, unknown>)[field];
    if (field === "supremacyCheck") return !value || (value as SupremacyCheck).permitted !== true;
    if (field === "quorumMinimum") return typeof value !== "number" || value <= 0;
    return !isPresent(value);
  });

  return {
    stage,
    satisfied: missingFields.length === 0,
    missingFields,
    reason:
      missingFields.length === 0
        ? `${stage}: ${spec.description} — satisfied.`
        : `${stage}: missing or unsatisfied — ${missingFields.join(", ")}.`,
  };
}

/**
 * Assess an amendment against the governed pipeline.
 *
 * This function never mutates anything and never records an amendment. It
 * answers one question: how far has this proposal legitimately got, and what
 * stops it?
 */
export function assessAmendment(proposal: AmendmentProposal): AmendmentAssessment {
  const refusals: string[] = [];
  let aiRefused = false;
  let policyDecisionRequired: PolicyDecisionRequirement | null = null;

  // --- 1. AI authority. Every stage of the pipeline is human-only. ---------
  const stageSpec = AMENDMENT_STAGE_REQUIREMENTS[proposal.currentStage];
  if (stageSpec.humanOnly && proposal.actorType === "AI") {
    aiRefused = true;
    refusals.push(
      "AI_CANNOT_AMEND_CONSTITUTION: an AI actor may draft, summarise or compare a provision, but may never propose, review, vote, approve, verify or effect an amendment.",
    );
  }

  // --- 2. Legal supremacy. --------------------------------------------------
  if (proposal.supremacyCheck && proposal.supremacyCheck.permitted !== true) {
    refusals.push(`LEGAL_SUPREMACY_VIOLATION: ${proposal.supremacyCheck.reason}`);
  }
  for (const matter of proposal.supremacyCheck?.trusteeMattersClaimed ?? []) {
    refusals.push(
      `TRUSTEE_AUTHORITY_VIOLATION: ${matter} is reserved to the Trustees. A Family Council recommendation on it is advisory unless the governing instrument and applicable law provide otherwise.`,
    );
  }

  // --- 3. The amendment mechanism is itself governed. -----------------------
  if (proposal.amendsAmendmentProcedure && !proposal.amendmentProcedureThreshold) {
    policyDecisionRequired = {
      code: `FAM-PD-AMEND-THRESHOLD-${proposal.amendmentId}`,
      issue:
        "What threshold is required to amend the Family Constitution's own amendment procedure?",
      domain: "AMENDMENT_PROCEDURE",
      options: [
        "Require unanimity of the Family Assembly plus Family Council approval.",
        "Require a two-thirds majority of the Family Assembly with legal review and Trustee notification.",
        "Require the same threshold as any other provision (explicitly rejected as a default here).",
      ],
      assumptions: ["No ratified threshold for self-amendment was supplied."],
      legalImplications:
        "Self-amendment thresholds are a matter for the instrument and applicable law; the engine will not invent one.",
      taxImplications: "None directly.",
      financialImplications:
        "A weakly protected amendment mechanism would allow capital policy to be changed without adequate authority.",
      risk: "Governance failure: the mechanism protecting every other provision would itself be unprotected.",
      decisionAuthority: "Family Assembly on legal advice, by the procedure the current Constitution specifies.",
      status: "OPEN",
      decision: null,
      decisionReference: null,
      effectiveDate: null,
    };
    refusals.push(
      "AMENDMENT_PROCEDURE_THRESHOLD_NOT_RATIFIED: refusing to fall back to the ordinary threshold, because doing so would let the mechanism be weakened by the mechanism it protects.",
    );
  }

  // --- 4. Stage-by-stage assessment. ---------------------------------------
  const stages: StageAssessment[] = [];
  let broke = false;

  for (const stage of [
    "PROPOSED",
    "LEGAL_REVIEW",
    "GOVERNANCE_REVIEW",
    "VOTING",
    "APPROVED",
    "VERIFIED",
    "EFFECTIVE",
    "RECORDED",
  ] as AmendmentStage[]) {
    const assessment = assessStage(stage, proposal);

    // A stage beyond the proposal's declared current stage cannot be assessed
    // as reached, however complete its fields look.
    const beyondDeclared = amendmentStageRank(stage) > amendmentStageRank(proposal.currentStage);
    const satisfied = assessment.satisfied && !beyondDeclared && refusals.length === 0;

    if (!satisfied) broke = true;

    stages.push({
      ...assessment,
      satisfied,
      reason: beyondDeclared
        ? `${stage}: not yet reached — the proposal is declared at ${proposal.currentStage}.`
        : refusals.length > 0 && assessment.satisfied
          ? `${stage}: requirements present, but the amendment is refused upstream.`
          : assessment.reason,
    });
  }

  // --- 5. Ballot arithmetic, computed never claimed. ------------------------
  //
  // The arithmetic is delegated to the ONE constitutional voting engine
  // (`src/lib/governance-voting.ts`). This layer never re-implements quorum or
  // majority rules: two implementations of constitutional arithmetic would
  // eventually disagree, and the disagreement would be invisible.
  let tally: Tally | null = null;
  let quorum: QuorumResult | null = null;
  let ballotDecision: Decision | null = null;

  if (proposal.ballots && proposal.ballots.length > 0 && typeof proposal.quorumMinimum === "number") {
    const eligible = proposal.votingEligibleMemberIds ?? [];
    const recused = proposal.recusedMemberIds ?? [];
    const threshold =
      proposal.amendsAmendmentProcedure && proposal.amendmentProcedureThreshold
        ? {
            majority: proposal.amendmentProcedureThreshold.majority,
            quorumMinimum: proposal.amendmentProcedureThreshold.quorumMinimum,
          }
        : {
            majority: proposal.requiredMajority ?? "SIMPLE",
            quorumMinimum: proposal.quorumMinimum,
          };

    quorum = calculateQuorum(
      { eligibleMemberIds: eligible, recusedMemberIds: recused, quorumMinimum: threshold.quorumMinimum },
      proposal.ballots,
    );
    tally = tallyBallots(proposal.ballots);
    ballotDecision = decideResolution({
      majorityRule: threshold.majority,
      quorum,
      tally,
      // A constitutional amendment has no timed window in this model, so voting
      // concludes when every eligible member has voted. That is the same
      // convention the governance engine uses, applied to a closed electorate.
      votingConcluded: allEligibleHaveVoted(eligible, recused, proposal.ballots),
    });

    if (ballotDecision.outcome !== "APPROVED") {
      const idx = amendmentStageRank("APPROVED");
      stages[idx] = {
        ...stages[idx],
        satisfied: false,
        missingFields: [...new Set([...stages[idx].missingFields, "carrying_vote"])],
        reason: `APPROVED: not carried — ${ballotDecision.explanation}`,
      };
    }
  }

  // `stageReached` and `complete` are computed AFTER the ballot override above,
  // so a proposal whose arithmetic does not carry can never report a stage it
  // has not actually reached. Recomputing here rather than in the loop is the
  // whole point: the ballot outcome is evidence, and evidence outranks the
  // presence of fields.
  let stageReached: AmendmentStage = "PROPOSED";
  let reachedAny = false;
  for (const s of stages) {
    if (!s.satisfied) break;
    stageReached = s.stage;
    reachedAny = true;
  }
  if (!reachedAny) stageReached = "PROPOSED";

  return {
    engineVersion: FAMILY_CONSTITUTION_ENGINE_VERSION,
    amendmentId: proposal.amendmentId,
    stageReached,
    stages,
    complete: refusals.length === 0 && reachedAny && stageReached === "RECORDED",
    refusals,
    tally,
    quorum,
    ballotDecision,
    policyDecisionRequired,
    aiRefused,
  };
}

/**
 * Refuse an AI actor attempting any mutating constitutional operation.
 *
 * Provided separately from `assessAmendment` so a service layer can refuse at
 * the boundary before it ever constructs a proposal.
 */
export function assertConstitutionWriteIsHuman(
  actorType: FamilyActorType,
  operation: "propose" | "review" | "vote" | "approve" | "verify" | "effect",
): void {
  assertHumanAuthority(actorType, `${operation} a Family Constitution amendment`);
}

/**
 * Compare two versions of a clause for reporting.
 *
 * Reports the textual difference and the governance references, and classifies
 * the change. It does not decide whether the change is acceptable — that is the
 * pipeline's job.
 */
export function compareProvisionVersions(
  previous: ConstitutionProvision,
  proposed: ConstitutionProvision,
): {
  clauseRef: string;
  changeType: "WORDING" | "SCOPE" | "SUBORDINATION" | "VERSION_ONLY" | "NONE";
  bodyChanged: boolean;
  domainChanged: boolean;
  subordinationChanged: boolean;
  detail: string[];
} {
  const bodyChanged = previous.body.trim() !== proposed.body.trim();
  const domainChanged = previous.domain !== proposed.domain;
  const removed = previous.subordinateTo.filter((s) => !proposed.subordinateTo.includes(s));
  const added = proposed.subordinateTo.filter((s) => !previous.subordinateTo.includes(s));
  const subordinationChanged = removed.length > 0 || added.length > 0;

  const detail: string[] = [];
  if (bodyChanged) detail.push("Provision text differs.");
  if (domainChanged) detail.push(`Domain changed from ${previous.domain} to ${proposed.domain}.`);
  if (removed.length > 0) {
    detail.push(`Subordination REMOVED for: ${removed.join(", ")}. This weakens the provision and requires legal review.`);
  }
  if (added.length > 0) detail.push(`Subordination added for: ${added.join(", ")}.`);

  const changeType: "WORDING" | "SCOPE" | "SUBORDINATION" | "VERSION_ONLY" | "NONE" =
    removed.length > 0
      ? "SUBORDINATION"
      : domainChanged
        ? "SCOPE"
        : bodyChanged
          ? "WORDING"
          : previous.version !== proposed.version
            ? "VERSION_ONLY"
            : "NONE";

  return { clauseRef: proposed.clauseRef, changeType, bodyChanged, domainChanged, subordinationChanged, detail };
}
