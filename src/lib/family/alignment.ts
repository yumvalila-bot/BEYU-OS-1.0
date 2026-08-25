/**
 * BEYU OS — NOELIA GOVERNANCE ALIGNMENT ENGINE (pure).
 *
 * Continuously evaluates authorised decisions against the reference set — Family
 * Constitution, Trust policy, Family Office mandate, Family Capital policies,
 * Investment Policy, governance resolutions, corporate strategy, legal
 * constraints, risk policies, approved capital allocation, succession objectives
 * and family values — and classifies each as ALIGNED, PARTIALLY_ALIGNED,
 * DEVIATING, MATERIALLY_DEVIATING, UNAUTHORIZED or POLICY_UNKNOWN.
 *
 * ============================ THREE INVARIANTS ============================
 *
 * 1. NOELIA NEVER SILENTLY OVERRIDES. `silentOverride` is `false` in every
 *    result this engine can produce, and there is no parameter that changes it.
 *    A material deviation produces an alert to authorised humans; it never
 *    produces a corrective action.
 * 2. ABSENT POLICY IS NOT ALIGNMENT. A reference domain that has no ratified
 *    policy yields POLICY_UNKNOWN. Treating "we have no policy" as "there is no
 *    deviation" is the single most dangerous default in a governance engine.
 * 3. NOELIA CREATES NO AUTHORITY. The engine's output is a recommendation with
 *    evidence, a severity and an escalation path. `requiredAuthority` names the
 *    human body that must act. Noelia is not on that list.
 *
 * ============================== WHAT IT IS NOT ==============================
 *
 * Not a decision engine and not an enforcement layer. It observes, compares,
 * explains and alerts. Where a decision must be blocked, the block happens in the
 * decision gate, the policy engine or the authority engine — not here.
 */
import {
  ALIGNMENT_REFERENCE_DOMAINS,
  ALIGNMENT_STATUSES,
  DEVIATION_SEVERITIES,
  assertHumanAuthority,
  isPresent,
  type AlignmentReferenceDomain,
  type AlignmentStatus,
  type DeviationSeverity,
  type FamilyActorType,
  type PolicyDecisionRequirement,
  type ReferenceCoverageState,
} from "./model";

export const ALIGNMENT_ENGINE_VERSION = "noelia-alignment-1.0.0";

/**
 * Re-exported so the engine's consumers evaluate against exactly the reference
 * set this engine is defined over, rather than maintaining their own copy that
 * could drift.
 */
export { ALIGNMENT_REFERENCE_DOMAINS };

/**
 * The Noelia governance boundary, restated in code.
 *
 * This is the operative list: an operation on the MAY NOT side is refused by
 * `assertWithinNoeliaBoundary`, and the refusal is thrown rather than returned so
 * that no caller can ignore it.
 */
export const NOELIA_MAY = [
  "analyse",
  "compare",
  "forecast",
  "simulate",
  "identify opportunities",
  "identify risks",
  "detect anomalies",
  "recommend",
  "draft",
  "summarise",
  "alert authorised humans",
  "assist authorised execution",
] as const;

export const NOELIA_MAY_NOT = [
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
] as const;

export function assertWithinNoeliaBoundary(operation: string): void {
  if ((NOELIA_MAY_NOT as readonly string[]).includes(operation)) {
    throw new Error(
      `NOELIA_BOUNDARY_VIOLATION: Noelia may not ${operation}. ` +
        `Noelia operates through identity, permissions, governance, data boundaries, audit and human accountability.`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Reference set                                                       */
/* ------------------------------------------------------------------ */

export type AlignmentReference = {
  domain: AlignmentReferenceDomain;
  coverage: ReferenceCoverageState;
  /** The ratified policy, instrument or resolution reference. Null when not covered. */
  reference: string | null;
  /** What the reference requires, in terms the comparison can use. */
  requirement: string | null;
};

export type DecisionUnderTest = {
  decisionId: string;
  /** PROPOSED decisions are evaluated before execution; ACTUAL after. */
  state: "PROPOSED" | "ACTUAL";
  title: string;
  domain: string;
  affectedEntityId: string | null;
  /** Capital affected in minor units, where applicable. */
  affectedCapitalMinor: number | null;
  currency: string | null;
  /** The authority under which the decision was or would be taken. */
  authorityReference: string | null;
  /** Who took or proposes to take it. */
  actorReference: string;
  /** The actor's type. A decision attributed to an AI actor is UNAUTHORIZED by definition. */
  actorType: FamilyActorType;
  /** What the decision actually does, per the decision record. */
  substance: string;
};

export type ReferenceFinding = {
  domain: AlignmentReferenceDomain;
  coverage: ReferenceCoverageState;
  /** ALIGNED | DEVIATING | UNKNOWN for this single reference. */
  finding: "ALIGNED" | "DEVIATING" | "UNKNOWN" | "NOT_APPLICABLE";
  /** What the reference requires. */
  requirement: string | null;
  /** How the decision departs from it, when it does. */
  deviation: string | null;
  /** 0–100. Higher is a larger departure. Never a probability. */
  deviationMagnitude: number;
  evidence: string;
};

export type AlignmentAssessment = {
  engineVersion: string;
  decisionId: string;
  status: AlignmentStatus;
  severity: DeviationSeverity;
  findings: ReferenceFinding[];
  /** Domains with no ratified policy. Non-empty forces POLICY_UNKNOWN. */
  uncoveredDomains: AlignmentReferenceDomain[];
  /** Domains where the decision departs from the reference. */
  deviatingDomains: AlignmentReferenceDomain[];
  /** Plain-language explanation, in order of severity. */
  explanation: string[];
  recommendation: string;
  /** The human body that must act. Never Noelia. */
  requiredAuthority: string;
  escalationPath: string[];
  /** Always false. Noelia never silently overrides a decision. */
  silentOverride: false;
  /** True when an alert to authorised humans is required. */
  alertRequired: boolean;
  policyDecisionRequired: PolicyDecisionRequirement | null;
  /** The decision, restated. Included so the record is self-contained. */
  decision: string;
};

/**
 * Evaluate one decision against the reference set.
 *
 * `deviationMagnitude` is supplied by the caller's domain analysis: this engine
 * does not measure deviation itself, because "how far is this from policy" is a
 * domain judgement (a 5% allocation drift and a 5% breach of a Trust clause are
 * not the same distance). What this engine does is combine those magnitudes
 * deterministically and refuse to report alignment it cannot evidence.
 */
export function evaluateAlignment(
  decision: DecisionUnderTest,
  references: readonly AlignmentReference[],
  deviationMagnitudes: Partial<Record<AlignmentReferenceDomain, number>>,
): AlignmentAssessment {
  const supplied = new Map(references.map((r) => [r.domain, r]));
  const findings: ReferenceFinding[] = [];
  const uncoveredDomains: AlignmentReferenceDomain[] = [];
  const deviatingDomains: AlignmentReferenceDomain[] = [];
  const explanation: string[] = [];
  let policyDecisionRequired: PolicyDecisionRequirement | null = null;

  for (const domain of ALIGNMENT_REFERENCE_DOMAINS) {
    const reference = supplied.get(domain);

    if (!reference || reference.coverage === "MISSING" || reference.coverage === "NOT_RATIFIED") {
      uncoveredDomains.push(domain);
      findings.push({
        domain,
        coverage: reference?.coverage ?? "MISSING",
        finding: "UNKNOWN",
        requirement: null,
        deviation: null,
        deviationMagnitude: 0,
        evidence: reference
          ? `No ratified policy for ${domain} (${reference.coverage}).`
          : `${domain} was not supplied in the reference set.`,
      });
      continue;
    }

    if (reference.coverage === "NOT_APPLICABLE") {
      findings.push({
        domain,
        coverage: "NOT_APPLICABLE",
        finding: "NOT_APPLICABLE",
        requirement: reference.requirement,
        deviation: null,
        deviationMagnitude: 0,
        evidence: `${domain} does not apply to this decision.`,
      });
      continue;
    }

    const magnitude = deviationMagnitudes[domain];
    if (typeof magnitude !== "number" || !Number.isFinite(magnitude) || magnitude < 0 || magnitude > 100) {
      uncoveredDomains.push(domain);
      findings.push({
        domain,
        coverage: "COVERED",
        finding: "UNKNOWN",
        requirement: reference.requirement,
        deviation: null,
        deviationMagnitude: 0,
        evidence: `Policy ${reference.reference} is ratified, but no deviation magnitude was supplied for ${domain}. Alignment cannot be asserted without a measurement.`,
      });
      continue;
    }

    const deviating = magnitude > 0;
    if (deviating) deviatingDomains.push(domain);

    findings.push({
      domain,
      coverage: "COVERED",
      finding: deviating ? "DEVIATING" : "ALIGNED",
      requirement: reference.requirement,
      deviation: deviating ? `Departs from ${reference.reference} with magnitude ${magnitude}/100.` : null,
      deviationMagnitude: magnitude,
      evidence: deviating
        ? `${reference.reference} requires: ${reference.requirement ?? "(requirement not stated)"}. Measured departure ${magnitude}/100.`
        : `${reference.reference} requires: ${reference.requirement ?? "(requirement not stated)"}. No departure measured.`,
    });
  }

  // --- severity -----------------------------------------------------------
  const maxMagnitude = findings.reduce((m, f) => Math.max(m, f.deviationMagnitude), 0);
  const severity: DeviationSeverity =
    maxMagnitude >= 75 ? "CRITICAL" : maxMagnitude >= 50 ? "HIGH" : maxMagnitude >= 25 ? "MEDIUM" : maxMagnitude > 0 ? "LOW" : "NONE";

  // --- status -------------------------------------------------------------
  //
  // Order matters. UNAUTHORIZED outranks POLICY_UNKNOWN, which outranks
  // deviation: a decision nobody authorised is not "policy unclear", and a
  // decision made by an AI actor is unauthorized whatever the policy says.
  let status: AlignmentStatus;

  if (decision.actorType === "AI") {
    status = "UNAUTHORIZED";
    explanation.push(
      "The decision is attributed to an AI actor. Noelia may recommend; a decision requires an accountable human with authority. This is UNAUTHORIZED regardless of policy alignment.",
    );
  } else if (!isPresent(decision.authorityReference)) {
    status = "UNAUTHORIZED";
    explanation.push("No authority reference supports this decision. Governance determines authority; it is never assumed.");
  } else if (uncoveredDomains.length > 0) {
    status = "POLICY_UNKNOWN";
    explanation.push(
      `No ratified policy for: ${uncoveredDomains.join(", ")}. Alignment cannot be asserted against policy that does not exist, and absence of policy is not absence of deviation.`,
    );
    policyDecisionRequired = {
      code: `FAM-PD-ALIGNMENT-${decision.decisionId}`,
      issue: `Ratify policy for the reference domain(s) with no coverage: ${uncoveredDomains.join(", ")}.`,
      domain: "INSTITUTION",
      options: [
        "Ratify a policy for each uncovered domain.",
        "Record the domain as NOT_APPLICABLE with a documented rationale.",
        "Defer the decision until policy exists.",
      ],
      assumptions: ["The decision was evaluated against a reference set with gaps."],
      legalImplications: "Some uncovered domains (legal constraints, Trust policy) cannot lawfully be left uncovered.",
      taxImplications: "Uncovered tax policy means the decision's tax character is unknown.",
      financialImplications: "Deviation cannot be measured, so capital may be deployed outside mandate undetected.",
      risk: "Silent policy drift is the failure mode this engine exists to prevent.",
      decisionAuthority: "The body owning each domain, on legal advice where law is involved.",
      status: "OPEN",
      decision: null,
      decisionReference: null,
      effectiveDate: null,
    };
  } else if (severity === "CRITICAL" || severity === "HIGH") {
    status = "MATERIALLY_DEVIATING";
  } else if (deviatingDomains.length > 0) {
    // A low-magnitude departure on a single domain is DEVIATING; departures
    // across several domains are materially deviating even when each is small,
    // because cumulative drift is how mandate erosion happens.
    status = deviatingDomains.length >= 3 ? "MATERIALLY_DEVIATING" : "DEVIATING";
  } else if (findings.some((f) => f.finding === "NOT_APPLICABLE") && findings.every((f) => f.finding !== "ALIGNED")) {
    status = "POLICY_UNKNOWN";
  } else {
    const alignedCount = findings.filter((f) => f.finding === "ALIGNED").length;
    const applicable = findings.filter((f) => f.finding !== "NOT_APPLICABLE").length;
    status = alignedCount === applicable ? "ALIGNED" : "PARTIALLY_ALIGNED";
  }

  // --- explanation, ordered by severity ------------------------------------
  const ordered = [...findings]
    .filter((f) => f.finding === "DEVIATING" || f.finding === "UNKNOWN")
    .sort((a, b) => b.deviationMagnitude - a.deviationMagnitude);
  for (const f of ordered) {
    explanation.push(`${f.domain}: ${f.evidence}`);
  }
  if (deviatingDomains.length >= 3 && maxMagnitude < 50) {
    explanation.push(
      `Escalated to MATERIALLY_DEVIATING on cumulative drift: ${deviatingDomains.length} reference domains each depart by a small amount ` +
        `(largest ${maxMagnitude}/100). No single departure is material on its own, but mandate erosion is the accumulation of small ones.`,
    );
  }
  if (status === "ALIGNED") {
    explanation.push(
      `The decision aligns with all ${findings.filter((f) => f.finding === "ALIGNED").length} applicable reference domains.`,
    );
  }

  const alertRequired =
    status === "MATERIALLY_DEVIATING" || status === "UNAUTHORIZED" || severity === "CRITICAL" || severity === "HIGH";

  return {
    engineVersion: ALIGNMENT_ENGINE_VERSION,
    decisionId: decision.decisionId,
    status,
    severity,
    findings,
    uncoveredDomains,
    deviatingDomains,
    explanation,
    recommendation:
      status === "ALIGNED"
        ? "No action required. Record the alignment assessment with the decision."
        : status === "POLICY_UNKNOWN"
          ? "Do not proceed on an assumption of alignment. Ratify or scope the missing policy, then re-evaluate."
          : status === "UNAUTHORIZED"
            ? "Refer to the body holding the authority. Noelia cannot authorise, and must not execute."
            : `Escalate the ${severity.toLowerCase()} deviation to the required authority before ${decision.state === "PROPOSED" ? "execution" : "any further action"}. Noelia does not override the decision.`,
    requiredAuthority: REQUIRED_AUTHORITY_BY_STATUS[status],
    escalationPath: [
      "Family Office executive responsible for the domain",
      "Relevant governance committee",
      "Family Council",
      ...(status === "UNAUTHORIZED" || deviatingDomains.includes("TRUST_POLICY")
        ? ["Trustees (for any Trust consequence)"]
        : []),
      "Trust Protector (only where the instrument grants the power)",
    ],
    silentOverride: false,
    alertRequired,
    policyDecisionRequired,
    decision: `${decision.title} (${decision.domain}) — ${decision.substance}`,
  };
}

const REQUIRED_AUTHORITY_BY_STATUS: Record<AlignmentStatus, string> = {
  ALIGNED: "None. The decision proceeds under its existing authority.",
  PARTIALLY_ALIGNED: "The Family Office executive accountable for the domain, recorded against the decision.",
  DEVIATING: "The relevant governance committee, with the deviation recorded.",
  MATERIALLY_DEVIATING: "Family Council, on the recommendation of the relevant committee.",
  UNAUTHORIZED: "The body that validly holds the authority. Noelia cannot supply it.",
  POLICY_UNKNOWN: "The body owning the uncovered domain, on legal advice where law is involved.",
};

/* ------------------------------------------------------------------ */
/* Long-horizon alignment                                              */
/* ------------------------------------------------------------------ */

/**
 * The institutional horizons.
 *
 * Horizons are INTELLIGENCE METADATA, never authority levels. A 100-year horizon
 * confers no additional authority over a 90-day one; every recommendation remains
 * subject to the full governance boundary regardless of horizon. This mirrors
 * `NOELIA_HORIZONS` in constants.ts and is restated here so a horizon cannot be
 * passed to this engine as a stringly-typed escape hatch.
 */
export const INSTITUTION_HORIZONS = [
  { code: "HORIZON_1", label: "Immediate", yearsFrom: 0, yearsTo: 1 },
  { code: "HORIZON_2", label: "1–5 years", yearsFrom: 1, yearsTo: 5 },
  { code: "HORIZON_3", label: "5–10 years", yearsFrom: 5, yearsTo: 10 },
  { code: "HORIZON_4", label: "10–25 years", yearsFrom: 10, yearsTo: 25 },
  { code: "HORIZON_5", label: "25–50 years", yearsFrom: 25, yearsTo: 50 },
  { code: "HORIZON_6", label: "50–100+ years", yearsFrom: 50, yearsTo: 100 },
] as const;
export type InstitutionHorizonCode = (typeof INSTITUTION_HORIZONS)[number]["code"];

export function horizonFor(years: number): InstitutionHorizonCode {
  const found = INSTITUTION_HORIZONS.find((h) => years >= h.yearsFrom && years <= h.yearsTo);
  return found?.code ?? "HORIZON_6";
}

/**
 * Evaluate a decision across every horizon.
 *
 * A decision that is aligned at one year and materially deviating at fifty is
 * reported as materially deviating: the institution plans over 100+ years, and a
 * short-horizon pass is not a long-horizon pass.
 */
export function evaluateAlignmentAcrossHorizons(
  decision: DecisionUnderTest,
  perHorizon: Record<InstitutionHorizonCode, AlignmentAssessment>,
): {
  engineVersion: string;
  decisionId: string;
  worstStatus: AlignmentStatus;
  worstSeverity: DeviationSeverity;
  byHorizon: Array<{ horizon: InstitutionHorizonCode; label: string; status: AlignmentStatus; severity: DeviationSeverity }>;
  explanation: string;
} {
  const statusRank = (s: AlignmentStatus): number => ALIGNMENT_STATUSES.indexOf(s);
  const severityRank = (s: DeviationSeverity): number => DEVIATION_SEVERITIES.indexOf(s);

  const byHorizon = INSTITUTION_HORIZONS.map((h) => {
    const a = perHorizon[h.code];
    return {
      horizon: h.code,
      label: h.label,
      status: a?.status ?? "POLICY_UNKNOWN",
      severity: a?.severity ?? "NONE",
    };
  });

  const worst = byHorizon.reduce(
    (acc, h) =>
      statusRank(h.status) > statusRank(acc.status) ||
      (statusRank(h.status) === statusRank(acc.status) && severityRank(h.severity) > severityRank(acc.severity))
        ? h
        : acc,
    byHorizon[0],
  );

  return {
    engineVersion: ALIGNMENT_ENGINE_VERSION,
    decisionId: decision.decisionId,
    worstStatus: worst.status,
    worstSeverity: worst.severity,
    byHorizon,
    explanation:
      worst.status === "ALIGNED"
        ? `Aligned across all ${byHorizon.length} horizons from immediate to 100+ years.`
        : `Worst alignment is ${worst.status} (${worst.severity}) at ${worst.label}. A short-horizon pass is not a long-horizon pass; the institution plans over 100+ years.`,
  };
}

/* ------------------------------------------------------------------ */
/* Refusals                                                            */
/* ------------------------------------------------------------------ */

/** Noelia may never write a governance record or exercise authority. */
export function assertAlignmentWriteIsHuman(actorType: FamilyActorType, operation: string): void {
  assertHumanAuthority(actorType, operation);
}

/**
 * Aggregate alignment for reporting.
 *
 * Counts only. Decision identities are omitted from the roll-up because an
 * alignment summary at family scale identifies individuals.
 */
export function summariseAssessments(assessments: readonly AlignmentAssessment[]): {
  engineVersion: string;
  count: number;
  byStatus: Record<AlignmentStatus, number>;
  bySeverity: Record<DeviationSeverity, number>;
  alertsRequired: number;
  policyDecisionsRequired: number;
  uncoveredDomainCounts: Record<string, number>;
} {
  const byStatus = Object.fromEntries(ALIGNMENT_STATUSES.map((s) => [s, 0])) as Record<AlignmentStatus, number>;
  const bySeverity = Object.fromEntries(DEVIATION_SEVERITIES.map((s) => [s, 0])) as Record<DeviationSeverity, number>;
  const uncoveredDomainCounts: Record<string, number> = {};
  let alertsRequired = 0;
  let policyDecisionsRequired = 0;

  for (const a of assessments) {
    byStatus[a.status] += 1;
    bySeverity[a.severity] += 1;
    if (a.alertRequired) alertsRequired += 1;
    if (a.policyDecisionRequired) policyDecisionsRequired += 1;
    for (const d of a.uncoveredDomains) uncoveredDomainCounts[d] = (uncoveredDomainCounts[d] ?? 0) + 1;
  }

  return {
    engineVersion: ALIGNMENT_ENGINE_VERSION,
    count: assessments.length,
    byStatus,
    bySeverity,
    alertsRequired,
    policyDecisionsRequired,
    uncoveredDomainCounts,
  };
}
