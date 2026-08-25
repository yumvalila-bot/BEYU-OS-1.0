/**
 * BEYU OS — DIRECT DESCENDANT & BENEFICIARY ELIGIBILITY ENGINE (pure).
 *
 * Encodes the CANONICAL FAMILY OWNERSHIP POLICY: direct descendants are the
 * eligible class for family ownership, shares, direct family privileges, direct
 * Trust benefits, direct family capital participation and direct succession
 * rights — subject in every case to the governing legal instruments, applicable
 * law, jurisdiction and valid estate/trust arrangements.
 *
 * ============================ THE SPOUSE RULE =============================
 *
 * Marriage does NOT automatically create:
 *   - direct-descendant status
 *   - ownership
 *   - shares
 *   - beneficiary status
 *   - family-line rights
 *   - succession rights
 *   - inheritance of a direct descendant's family-line rights
 *
 * A spouse may receive benefits THROUGH an eligible direct descendant only where
 * authorised. That authorisation is an explicit, recorded, governed act — never a
 * consequence of the marriage.
 *
 * ============================== WHAT IT IS NOT ==============================
 *
 * A positive determination here is a FAMILY POLICY determination. It is not:
 *
 *   - a legal conferral of ownership or shares;
 *   - a Trust determination. Beneficiary status under a Trust belongs to the
 *     Trustees under their instrument and the law. Every DIRECT_TRUST_BENEFIT
 *     determination from this engine is therefore ADVISORY_PENDING_TRUSTEE and
 *     can never be executed as a Trust act;
 *   - an accounting or tax conclusion.
 *
 * It grants nothing, moves nothing and posts nothing.
 */
import {
  assertHumanAuthority,
  FamilyInstitutionError,
  isAffinalRelationship,
  type DescendantStatus,
  type EligibilityDomain,
  type EligibilityResult,
  type FamilyActorType,
  type LineageRelationship,
  type PolicyDecisionRequirement,
} from "./model";
import type { DescendantDetermination } from "./lineage";

export const ELIGIBILITY_ENGINE_VERSION = "family-eligibility-1.0.0";

/** A determination for one (person, domain) pair. */
export type EligibilityDetermination = {
  engineVersion: string;
  memberId: string;
  domain: EligibilityDomain;
  result: EligibilityResult;
  /**
   * A positive result under a Trust domain is advisory to the Trustees. This
   * flag is true whenever the determination cannot itself be executed.
   */
  advisoryOnly: boolean;
  basis: string[];
  blockers: string[];
  /** The authority that must act for a positive determination to become effective. */
  requiredAuthority: string | null;
  policyDecisionRequired: PolicyDecisionRequirement | null;
};

/**
 * Explicit authorisation permitting an affinal person to benefit THROUGH an
 * eligible direct descendant. Without a record like this, the answer is no.
 */
export type ThroughDescendantAuthorisation = {
  /** The eligible direct descendant through whom the benefit flows. */
  viaDescendantMemberId: string;
  /** Governance reference that authorised it (resolution / instrument clause). */
  authorityReference: string;
  /** ISO date from which it is effective. */
  effectiveFrom: string;
  /** ISO date it lapses. Null means it does not lapse by date — it still lapses on the descendant's loss of eligibility. */
  effectiveTo: string | null;
  /** What is authorised. A benefit outside this scope is not authorised. */
  scope: EligibilityDomain[];
};

export type EligibilityInput = {
  memberId: string;
  relationshipToParent: LineageRelationship;
  descendantStatus: DescendantStatus;
  descendantDetermination: DescendantDetermination | null;
  /** Lineage verification state from the registry. */
  lineageVerified: boolean;
  /** Governing-instrument provisions that expressly name this person, if any. */
  instrumentProvisions: Array<{ instrumentReference: string; domain: EligibilityDomain; wording: string }>;
  /** Through-descendant authorisations, for affinal persons only. */
  throughDescendantAuthorisations: ThroughDescendantAuthorisation[];
  /** Ratified treatment of adopted children, when the framework has one. */
  adoptionTreatment?: { treatedAsDirectDescendant: boolean; instrumentReference: string } | null;
  /** ISO date at which the determination is made. */
  asOf: string;
};

/**
 * Domains the Family Office cannot itself confer, whatever the family policy
 * says. A positive determination is advisory to the real authority.
 */
const ADVISORY_DOMAINS: ReadonlySet<EligibilityDomain> = new Set<EligibilityDomain>([
  "DIRECT_TRUST_BENEFIT",
  "SHARES",
  "DIRECT_SUCCESSION_RIGHT",
]);

const REQUIRED_AUTHORITY: Record<EligibilityDomain, string> = {
  FAMILY_OWNERSHIP:
    "Family Council resolution, executed through the relevant holding company's constitutional documents and share register.",
  SHARES:
    "The issuing company's board and share register, under its constitutional documents and any shareholder agreement.",
  DIRECT_FAMILY_PRIVILEGES:
    "Family Council resolution under the Family Constitution, subject to the Family Office mandate.",
  DIRECT_TRUST_BENEFIT:
    "The Trustees, exercising their discretion under the Trust instrument and applicable law. Advisory only from the Family Office.",
  DIRECT_CAPITAL_PARTICIPATION:
    "Family Investment / Capital Committee recommendation and Family Council approval, then Finance OS execution.",
  DIRECT_SUCCESSION_RIGHT:
    "The governing instrument and applicable law; a Family Council recommendation is advisory.",
};

function inWindow(auth: ThroughDescendantAuthorisation, asOf: string): boolean {
  return auth.effectiveFrom <= asOf && (auth.effectiveTo === null || auth.effectiveTo >= asOf);
}

/**
 * Evaluate one (person, domain) pair.
 *
 * Evaluation order is fixed and the first hard refusal wins, so the reason
 * reported is always the strongest reason available rather than the first one
 * encountered by chance.
 */
export function evaluateEligibility(
  domain: EligibilityDomain,
  input: EligibilityInput,
): EligibilityDetermination {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.asOf)) {
    throw new FamilyInstitutionError(
      "RULE_VIOLATION",
      `asOf must be an ISO date (YYYY-MM-DD); received "${input.asOf}".`,
    );
  }

  const basis: string[] = [];
  const blockers: string[] = [];
  let policyDecisionRequired: PolicyDecisionRequirement | null = null;

  const base = {
    engineVersion: ELIGIBILITY_ENGINE_VERSION,
    memberId: input.memberId,
    domain,
    advisoryOnly: ADVISORY_DOMAINS.has(domain),
    requiredAuthority: REQUIRED_AUTHORITY[domain],
  };

  // --- 1. An express instrument provision is the strongest evidence. -------
  const express = input.instrumentProvisions.filter(
    (p) => p.domain === domain && p.instrumentReference.trim().length > 0 && p.wording.trim().length > 0,
  );

  // --- 2. Affinity: the spouse rule. ---------------------------------------
  if (isAffinalRelationship(input.relationshipToParent)) {
    basis.push(
      `${input.relationshipToParent} is an affinity relationship. Marriage does not automatically create direct-descendant status, ownership, shares, beneficiary status, family-line rights, succession rights, or inheritance of a direct descendant's family-line rights.`,
    );

    if (express.length > 0) {
      basis.push(
        `An express instrument provision names this person for ${domain}: ${express
          .map((p) => `${p.instrumentReference} ("${p.wording}")`)
          .join("; ")}.`,
        "Expressly governed spousal participation is permitted; it is granted by the instrument, not by the marriage.",
      );
      return {
        ...base,
        result: "ELIGIBLE",
        basis,
        blockers: [],
        policyDecisionRequired: null,
      };
    }

    const authorised = input.throughDescendantAuthorisations.filter(
      (a) => a.scope.includes(domain) && inWindow(a, input.asOf),
    );
    if (authorised.length > 0) {
      basis.push(
        ...authorised.map(
          (a) =>
            `A governed authorisation permits benefit THROUGH ${a.viaDescendantMemberId} under ${a.authorityReference}, effective ${a.effectiveFrom}${a.effectiveTo ? ` to ${a.effectiveTo}` : ""}.`,
        ),
        "The benefit flows through an eligible direct descendant. It is not a family-line right of the spouse and does not survive the descendant's loss of eligibility.",
      );
      return {
        ...base,
        result: "ELIGIBLE",
        basis,
        blockers: ["BENEFIT_IS_DERIVATIVE_NOT_INHERENT"],
        policyDecisionRequired: null,
      };
    }

    blockers.push("NO_EXPRESS_INSTRUMENT_PROVISION");
    blockers.push("NO_THROUGH_DESCENDANT_AUTHORISATION");
    basis.push(
      "No instrument provision names this person for the domain, and no governed through-descendant authorisation is in force.",
    );
    return { ...base, result: "NOT_ELIGIBLE", basis, blockers, policyDecisionRequired: null };
  }

  // --- 3. Descent status. ---------------------------------------------------
  if (input.descendantStatus === "DIRECT_DESCENDANT") {
    basis.push("The member is a verified direct descendant of the family line.");
  } else if (input.descendantStatus === "ADOPTION_UNCONFIRMED") {
    blockers.push("ADOPTION_TREATMENT_NOT_RATIFIED");
    policyDecisionRequired = input.descendantDetermination?.policyDecisionRequired ?? null;
    basis.push(
      "An adoption in the descent chain is not covered by a ratified treatment, so the family-line class is unresolved.",
    );
    if (express.length > 0) {
      basis.push(
        `However, an express instrument provision names this person for ${domain}, which resolves eligibility for this domain without resolving the general class.`,
      );
      return { ...base, result: "ELIGIBLE", basis, blockers: [], policyDecisionRequired: null };
    }
    return { ...base, result: "INDETERMINATE", basis, blockers, policyDecisionRequired };
  } else if (input.descendantStatus === "NON_DESCENDANT") {
    if (express.length > 0) {
      basis.push(
        `Not a direct descendant, but an express instrument provision names this person for ${domain}: ${express
          .map((p) => p.instrumentReference)
          .join(", ")}.`,
        "Eligibility here is granted by the instrument, not by the direct-descendant principle.",
      );
      return { ...base, result: "ELIGIBLE", basis, blockers: [], policyDecisionRequired: null };
    }
    basis.push(
      "The member is not a direct descendant. The direct-descendant principle excludes them from this domain absent an express instrument provision.",
    );
    blockers.push("NOT_A_DIRECT_DESCENDANT");
    return { ...base, result: "NOT_ELIGIBLE", basis, blockers, policyDecisionRequired: null };
  } else {
    // INDETERMINATE
    blockers.push("LINEAGE_INDETERMINATE");
    policyDecisionRequired = input.descendantDetermination?.policyDecisionRequired ?? null;
    basis.push(
      "Direct-descendant status could not be determined, so the eligible class cannot be established.",
      ...(input.descendantDetermination?.blockers ?? []),
    );
    return { ...base, result: "INDETERMINATE", basis, blockers, policyDecisionRequired };
  }

  // --- 4. Verification precondition. ---------------------------------------
  if (!input.lineageVerified) {
    blockers.push("LINEAGE_NOT_VERIFIED");
    basis.push("Eligibility requires verified lineage; the registry records this lineage as unverified.");
    return { ...base, result: "INDETERMINATE", basis, blockers, policyDecisionRequired };
  }
  basis.push("Lineage is recorded as VERIFIED in the family line registry.");

  // --- 5. A positive determination still executes elsewhere. ---------------
  basis.push(
    `A positive determination is a family-policy determination. Effect requires: ${REQUIRED_AUTHORITY[domain]}`,
  );
  if (ADVISORY_DOMAINS.has(domain)) {
    basis.push(
      "This domain is advisory from the Family Office: the Family Office cannot confer it, and a Trust matter remains with the Trustees under their fiduciary duties.",
    );
  }

  return { ...base, result: "ELIGIBLE", basis, blockers: [], policyDecisionRequired };
}

/* ------------------------------------------------------------------ */
/* Refusals this engine must never perform                             */
/* ------------------------------------------------------------------ */

/**
 * Refuse any attempt to confer eligibility from a source that cannot confer it.
 *
 * These are the specific conflations the institution mandate forbids: family
 * status becoming operational authority, spousal status becoming descent, a
 * credential becoming an ownership right, and an AI recommendation becoming a
 * decision.
 */
export const FORBIDDEN_CONFERMENT_SOURCES = [
  "MARRIAGE",
  "FAMILY_NAME",
  "EMPLOYMENT_IN_FAMILY_BUSINESS",
  "EDUCATIONAL_CERTIFICATE",
  "PROFESSIONAL_LICENSE",
  "RESIDENCE_IN_FAMILY_PROPERTY",
  "PARTICIPATION_IN_FAMILY_EVENTS",
  "AI_RECOMMENDATION",
  "LONG_STANDING_PRACTICE",
] as const;
export type ForbiddenConfermentSource = (typeof FORBIDDEN_CONFERMENT_SOURCES)[number];

export function assertNoAutomaticConferment(
  claimedSource: string,
  domain: EligibilityDomain,
): void {
  if ((FORBIDDEN_CONFERMENT_SOURCES as readonly string[]).includes(claimedSource)) {
    throw new FamilyInstitutionError(
      "AUTOMATIC_CONFERMENT_REFUSED",
      `${claimedSource} cannot confer eligibility for ${domain}. Eligibility arises only from the direct-descendant principle as governed, or from an express instrument provision.`,
      { claimedSource, domain },
    );
  }
}

/**
 * Refuse a claim that a spouse inherits a direct descendant's family-line rights.
 *
 * This is separate from the eligibility evaluation because it must be refused
 * even when the evaluation is never run — for example when a distribution record
 * is being written directly.
 */
export function assertNoSpousalInheritanceOfFamilyLineRights(input: {
  spouseMemberId: string;
  descendantMemberId: string;
  claimedRights: string[];
}): void {
  const FAMILY_LINE_RIGHTS = [
    "FAMILY_LINE_MEMBERSHIP",
    "DIRECT_DESCENDANT_STATUS",
    "OWNERSHIP",
    "SHARES",
    "BENEFICIARY_STATUS",
    "SUCCESSION_RIGHT",
    "VOTING_RIGHT_IN_FAMILY_ASSEMBLY",
  ];
  const claimed = input.claimedRights.filter((r) => FAMILY_LINE_RIGHTS.includes(r));
  if (claimed.length > 0) {
    throw new FamilyInstitutionError(
      "AUTOMATIC_CONFERMENT_REFUSED",
      `A spouse cannot inherit a direct descendant's BEYU family-line rights merely because of marriage. Refused: ${claimed.join(", ")}.`,
      { ...input, refused: claimed },
    );
  }
}

/** Eligibility may never be written by an AI actor. */
export function assertEligibilityWriteIsHuman(actorType: FamilyActorType, operation: string): void {
  assertHumanAuthority(actorType, operation);
}

/* ------------------------------------------------------------------ */
/* Batch evaluation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Evaluate every domain for one person, in the canonical order.
 *
 * Returned in a fixed order so two runs over the same inputs produce identical
 * output — eligibility determinations are evidence and must be replayable.
 */
export function evaluateAllDomains(
  input: EligibilityInput,
  domains: readonly EligibilityDomain[] = [
    "FAMILY_OWNERSHIP",
    "SHARES",
    "DIRECT_FAMILY_PRIVILEGES",
    "DIRECT_TRUST_BENEFIT",
    "DIRECT_CAPITAL_PARTICIPATION",
    "DIRECT_SUCCESSION_RIGHT",
  ],
): EligibilityDetermination[] {
  return domains.map((d) => evaluateEligibility(d, input));
}

/**
 * Roll-up used by reporting. Counts only — never exposes identities, because an
 * eligibility summary is HIGHLY_RESTRICTED data even in aggregate form when the
 * cohort is small.
 */
export function summariseDeterminations(determinations: readonly EligibilityDetermination[]): {
  engineVersion: string;
  byDomain: Record<string, { eligible: number; notEligible: number; indeterminate: number }>;
  policyDecisionsRequired: number;
  advisoryOnly: number;
} {
  const byDomain: Record<string, { eligible: number; notEligible: number; indeterminate: number }> = {};
  let policyDecisionsRequired = 0;
  let advisoryOnly = 0;

  for (const d of determinations) {
    const bucket = (byDomain[d.domain] ??= { eligible: 0, notEligible: 0, indeterminate: 0 });
    if (d.result === "ELIGIBLE") bucket.eligible += 1;
    else if (d.result === "NOT_ELIGIBLE") bucket.notEligible += 1;
    else bucket.indeterminate += 1;
    if (d.policyDecisionRequired) policyDecisionsRequired += 1;
    if (d.advisoryOnly) advisoryOnly += 1;
  }

  return {
    engineVersion: ELIGIBILITY_ENGINE_VERSION,
    byDomain,
    policyDecisionsRequired,
    advisoryOnly,
  };
}
