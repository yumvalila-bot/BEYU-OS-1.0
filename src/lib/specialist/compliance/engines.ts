/**
 * BEYU OS — Compliance & Obligation engines (Phase 7E).
 *
 * Ten pure functions over governed records. No database, no principal, no authority — the service
 * layer applies those through the Phase 7B platform.
 *
 * FOUR INVARIANTS ENFORCED THROUGHOUT:
 *
 *   1. NO OBLIGATION IS EVER INVENTED. Every obligation reported here came from
 *      `compliance_obligations`. Nothing is inferred from a framework name: "TRA" does not imply a
 *      VAT rate, "GDPR" does not imply a filing deadline.
 *
 *   2. SILENCE IS NEVER COMPLIANCE. An obligation with no assessment has `state: null` and basis
 *      DATA_NOT_AVAILABLE. It is counted in `unassessedCount`, never in a compliant total.
 *
 *   3. EVIDENCE IS NOT THE SAME QUESTION AS COMPLIANCE. A linked document does not satisfy an
 *      obligation, and a missing one does not breach it. The two travel as separate fields.
 *
 *   4. ATTRIBUTION IS REPORTED, NEVER REPAIRED. Where a record claims one tenant but points at an
 *      entity owned by another, that is a GOVERNANCE finding. This module never guesses which
 *      side is right, and never aggregates across the boundary to make a total look tidy.
 */
import { SpecialistError } from "../platform";
import type {
  ComplianceDashboard,
  ComplianceException,
  ComplianceSource,
  ControlCoverage,
  DataQualityCode,
  DataQualityFinding,
  DeadlineAssessment,
  EntityComplianceProfile,
  EvidenceAssessment,
  EvidenceState,
  JurisdictionExposure,
  ObligationRiskView,
  ObligationStatus,
} from "./model";

export const COMPLIANCE_VERSION = "compliance-1.0.0";

/** States for which governed data implies documentary evidence is expected. */
const EVIDENCE_EXPECTED_STATES = new Set([
  "COMPLIANT",
  "PARTIALLY_COMPLIANT",
  "NON_COMPLIANT",
  "REQUIRES_HUMAN_REVIEW",
]);

/** Document authority statuses that mean the evidence cannot be relied on today. */
const WITHDRAWN_AUTHORITY = new Set(["EXPIRED", "SUPERSEDED", "REJECTED"]);

// ---------------------------------------------------------------------------
// Input shapes — mirror the real columns, nothing more.
// ---------------------------------------------------------------------------

export type ObligationRecord = {
  id: string;
  tenantId: string;
  code: string;
  framework: string;
  reference: string;
  title: string;
  obligationType: string;
  jurisdictionCode: string;
  legalEntityId: string | null;
  sectorCode: string | null;
  frequency: string;
  nextDueAt: string | null;
  ownerRole: string | null;
  controlIds: string[];
  status: string;
};

export type AssessmentRecord = {
  id: string;
  tenantId: string;
  obligationId: string;
  period: string;
  state: string;
  evidenceDocumentId: string | null;
  remediationDueAt: string | null;
  humanConfirmed: boolean;
  assessedAt: string;
};

export type DocumentRecord = {
  id: string;
  tenantId: string;
  effectiveDate: string | null;
  authorityStatus: string;
  jurisdictionCode: string | null;
};

export type ControlRecord = {
  id: string;
  tenantId: string;
  code: string;
  frameworks: string[];
  riskId: string | null;
  lastTestedAt: string | null;
  effectiveness: string;
};

export type RiskRecord = {
  id: string;
  tenantId: string;
  code: string;
  category: string;
  legalEntityId: string | null;
  residualLikelihood: number;
  residualImpact: number;
  appetiteThreshold: number;
  status: string;
  escalated: boolean;
  nextReviewAt: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string, label: string): void {
  if (!ISO_DATE.test(value)) {
    throw new SpecialistError("RULE_VIOLATION", `${label} must be an ISO date (YYYY-MM-DD).`);
  }
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function finding(
  code: DataQualityCode,
  severity: DataQualityFinding["severity"],
  subjectType: ComplianceSource["type"],
  subjectId: string,
  detail: string,
): DataQualityFinding {
  return { code, severity, subjectType, subjectId, detail, advisoryOnly: true };
}

// ===========================================================================
// 1. OBLIGATION STATUS
// ===========================================================================

/**
 * The compliance view of one obligation at a stated date.
 *
 * `entityOwners` maps legal entity id -> owning tenant id. Supplying it enables attribution
 * checking; omitting it means attribution is simply not asserted (rather than assumed correct).
 */
export function obligationStatus(
  obligation: ObligationRecord,
  assessments: AssessmentRecord[],
  documents: DocumentRecord[],
  options: { asOf: string; entityOwners?: Record<string, string>; staleAssessmentDays?: number },
): ObligationStatus {
  assertIsoDate(options.asOf, "asOf");
  const findings: DataQualityFinding[] = [];

  // Latest assessment for this obligation, by assessedAt then id for determinism.
  const own = assessments
    .filter((a) => a.obligationId === obligation.id)
    .sort((a, b) => (a.assessedAt === b.assessedAt ? a.id.localeCompare(b.id) : a.assessedAt.localeCompare(b.assessedAt)));
  const latest = own.length > 0 ? own[own.length - 1] : null;

  if (own.length > 1) {
    const periods = own.map((a) => a.period);
    if (new Set(periods).size !== periods.length) {
      findings.push(
        finding(
          "DUPLICATE_ASSESSMENT",
          "WARNING",
          "COMPLIANCE_OBLIGATION",
          obligation.id,
          `Obligation has ${own.length} assessments with a repeated period; the latest is reported but the duplication is unresolved.`,
        ),
      );
    }
  }

  if (!latest) {
    findings.push(
      finding(
        "NO_ASSESSMENT",
        "WARNING",
        "COMPLIANCE_OBLIGATION",
        obligation.id,
        "No compliance assessment exists. This is NOT evidence of compliance.",
      ),
    );
  }

  // --- Structural data quality on the obligation itself ---
  if (!obligation.ownerRole || obligation.ownerRole.trim() === "") {
    findings.push(finding("MISSING_OWNER", "WARNING", "COMPLIANCE_OBLIGATION", obligation.id, "No responsible owner role is recorded."));
  }
  if (!obligation.jurisdictionCode || obligation.jurisdictionCode.trim() === "") {
    findings.push(finding("MISSING_JURISDICTION", "WARNING", "COMPLIANCE_OBLIGATION", obligation.id, "No jurisdiction is recorded."));
  }
  if (!obligation.nextDueAt) {
    findings.push(finding("MISSING_DUE_DATE", "INFO", "COMPLIANCE_OBLIGATION", obligation.id, "No next due date is recorded; deadline monitoring is not possible."));
  }
  if (obligation.controlIds.length === 0) {
    findings.push(finding("NO_CONTROL_COVERAGE", "INFO", "COMPLIANCE_OBLIGATION", obligation.id, "No controls are linked to this obligation."));
  }

  // --- Attribution: reported, never repaired ---
  if (obligation.legalEntityId && options.entityOwners) {
    const owner = options.entityOwners[obligation.legalEntityId];
    if (!owner) {
      findings.push(
        finding("ORPHANED_ENTITY_REFERENCE", "GOVERNANCE", "COMPLIANCE_OBLIGATION", obligation.id,
          `Legal entity ${obligation.legalEntityId} does not exist; ownership cannot be established.`),
      );
    } else if (owner !== obligation.tenantId) {
      findings.push(
        finding("TENANT_ENTITY_ATTRIBUTION_MISMATCH", "GOVERNANCE", "COMPLIANCE_OBLIGATION", obligation.id,
          `Obligation is recorded under tenant ${obligation.tenantId} but legal entity ${obligation.legalEntityId} is owned by ${owner}. ` +
          "Which attribution is correct is a governance question; it is not resolved here."),
      );
    }
  }

  // --- Staleness ---
  if (latest && options.staleAssessmentDays !== undefined) {
    const assessedDate = latest.assessedAt.slice(0, 10);
    if (ISO_DATE.test(assessedDate)) {
      const age = daysBetween(assessedDate, options.asOf);
      if (age > options.staleAssessmentDays) {
        findings.push(finding("STALE_ASSESSMENT", "WARNING", "COMPLIANCE_ASSESSMENT", latest.id, `Latest assessment is ${age} day(s) old.`));
      }
      if (age < 0) {
        findings.push(finding("FUTURE_DATED_RECORD", "WARNING", "COMPLIANCE_ASSESSMENT", latest.id, "Assessment is dated in the future."));
      }
    }
  }

  // --- Remediation overdue is a status inconsistency worth surfacing ---
  if (latest?.remediationDueAt && ISO_DATE.test(latest.remediationDueAt) && latest.remediationDueAt < options.asOf) {
    findings.push(finding("INCONSISTENT_STATUS", "WARNING", "COMPLIANCE_ASSESSMENT", latest.id,
      `Remediation was due ${latest.remediationDueAt}, before the assessment date under review.`));
  }

  const evidence = evaluateEvidence(latest, documents, options.asOf);
  if (evidence.state === "MISSING") {
    findings.push(finding("EVIDENCE_MISSING", "WARNING", "COMPLIANCE_ASSESSMENT", latest?.id ?? obligation.id, evidence.reason));
  }
  if (evidence.state === "EXPIRED") {
    findings.push(finding("EVIDENCE_EXPIRED", "WARNING", "DOCUMENT", evidence.documentId ?? "UNKNOWN", evidence.reason));
  }
  if (latest?.evidenceDocumentId && !documents.some((d) => d.id === latest.evidenceDocumentId)) {
    findings.push(finding("ORPHANED_EVIDENCE_REFERENCE", "GOVERNANCE", "COMPLIANCE_ASSESSMENT", latest.id,
      `Assessment references document ${latest.evidenceDocumentId}, which does not exist or is out of scope.`));
  }

  const deadline = evaluateDeadline(obligation, options.asOf);

  return {
    obligationId: obligation.id,
    code: obligation.code,
    title: obligation.title,
    framework: obligation.framework,
    reference: obligation.reference,
    jurisdictionCode: obligation.jurisdictionCode,
    tenantId: obligation.tenantId,
    legalEntityId: obligation.legalEntityId,
    ownerRole: obligation.ownerRole,
    frequency: obligation.frequency,
    lifecycleStatus: obligation.status,
    state: latest?.state ?? null,
    stateBasis: latest ? "OBSERVED" : "DATA_NOT_AVAILABLE",
    assessmentId: latest?.id ?? null,
    assessmentPeriod: latest?.period ?? null,
    humanConfirmed: latest?.humanConfirmed ?? null,
    evidence,
    deadline,
    controlIds: obligation.controlIds,
    findings,
    explanation: [
      latest
        ? `Assessment ${latest.id} for period ${latest.period} records state ${latest.state}. This state is read from the governed register, not computed here.`
        : "No assessment exists for this obligation. Its compliance state is DATA_NOT_AVAILABLE — which is not the same as compliant.",
      `Evidence: ${evidence.state}. ${evidence.reason}`,
      `Deadline: ${deadline.state}. ${deadline.reason}`,
      "No legal interpretation of this obligation is offered. The obligation text and its consequences are governed elsewhere.",
    ],
  };
}

/** Evidence state derived strictly from linked-document facts. */
function evaluateEvidence(
  assessment: AssessmentRecord | null,
  documents: DocumentRecord[],
  asOf: string,
): EvidenceAssessment {
  if (!assessment) {
    return {
      state: "UNKNOWN",
      documentId: null,
      documentEffectiveDate: null,
      documentAuthorityStatus: null,
      basis: "DATA_NOT_AVAILABLE",
      reason: "No assessment exists, so no evidence expectation has been established.",
    };
  }

  const expected = EVIDENCE_EXPECTED_STATES.has(assessment.state);

  if (!assessment.evidenceDocumentId) {
    return {
      state: expected ? "MISSING" : "REQUIRED",
      documentId: null,
      documentEffectiveDate: null,
      documentAuthorityStatus: null,
      basis: "OBSERVED",
      reason: expected
        ? `Assessment state ${assessment.state} implies documentary evidence, but no document is linked. Absence of evidence is not evidence of breach, nor of compliance.`
        : `Assessment state ${assessment.state} does not itself establish an evidence expectation.`,
    };
  }

  const doc = documents.find((d) => d.id === assessment.evidenceDocumentId);
  if (!doc) {
    return {
      state: "MISSING",
      documentId: assessment.evidenceDocumentId,
      documentEffectiveDate: null,
      documentAuthorityStatus: null,
      basis: "OBSERVED",
      reason: `Linked document ${assessment.evidenceDocumentId} was not found in scope; the link cannot be relied on.`,
    };
  }

  if (WITHDRAWN_AUTHORITY.has(doc.authorityStatus)) {
    return {
      state: "EXPIRED",
      documentId: doc.id,
      documentEffectiveDate: doc.effectiveDate,
      documentAuthorityStatus: doc.authorityStatus,
      basis: "OBSERVED",
      reason: `Document ${doc.id} has authority status ${doc.authorityStatus} and cannot serve as current evidence.`,
    };
  }

  if (doc.effectiveDate && ISO_DATE.test(doc.effectiveDate) && doc.effectiveDate > asOf) {
    return {
      state: "EXPIRED",
      documentId: doc.id,
      documentEffectiveDate: doc.effectiveDate,
      documentAuthorityStatus: doc.authorityStatus,
      basis: "OBSERVED",
      reason: `Document ${doc.id} is not effective until ${doc.effectiveDate}, after the date under review (${asOf}).`,
    };
  }

  if (doc.authorityStatus === "UNDER_REVIEW") {
    return {
      state: "UNDER_REVIEW",
      documentId: doc.id,
      documentEffectiveDate: doc.effectiveDate,
      documentAuthorityStatus: doc.authorityStatus,
      basis: "OBSERVED",
      reason: `Document ${doc.id} is still under review and has not been accepted as authoritative.`,
    };
  }

  // A present, effective, authoritative document. VERIFIED additionally requires a human to have
  // confirmed the assessment — the system does not verify evidence on its own say-so.
  return {
    state: assessment.humanConfirmed ? "VERIFIED" : "PRESENT",
    documentId: doc.id,
    documentEffectiveDate: doc.effectiveDate,
    documentAuthorityStatus: doc.authorityStatus,
    basis: "OBSERVED",
    reason: assessment.humanConfirmed
      ? `Document ${doc.id} is effective and authoritative, and the assessment was confirmed by a human.`
      : `Document ${doc.id} is effective and authoritative, but the assessment is not human-confirmed. Presence of a document does not by itself satisfy the obligation.`,
  };
}

/** Deadline position. A future obligation is never overdue. */
function evaluateDeadline(obligation: ObligationRecord, asOf: string): DeadlineAssessment {
  if (!obligation.nextDueAt) {
    return {
      state: "NO_DUE_DATE",
      dueDate: null,
      daysRemaining: null,
      basis: "DATA_NOT_AVAILABLE",
      reason: "No due date is recorded, so no deadline conclusion is possible. This is not 'on time'.",
    };
  }
  if (!ISO_DATE.test(obligation.nextDueAt)) {
    return {
      state: "NO_DUE_DATE",
      dueDate: obligation.nextDueAt,
      daysRemaining: null,
      basis: "DATA_NOT_AVAILABLE",
      reason: `Due date '${obligation.nextDueAt}' is not a valid date.`,
    };
  }

  const remaining = daysBetween(asOf, obligation.nextDueAt);
  const state = remaining > 0 ? "FUTURE" : remaining === 0 ? "DUE_TODAY" : "OVERDUE";
  return {
    state,
    dueDate: obligation.nextDueAt,
    daysRemaining: remaining,
    basis: "DERIVED",
    reason:
      state === "FUTURE"
        ? `Due ${obligation.nextDueAt}, ${remaining} day(s) after the date under review. A future obligation is not overdue.`
        : state === "DUE_TODAY"
          ? `Due today (${obligation.nextDueAt}).`
          : `Due ${obligation.nextDueAt}, ${Math.abs(remaining)} day(s) before the date under review.`,
  };
}

// ===========================================================================
// 2 & 3. DEADLINE VIEWS
// ===========================================================================

export function upcomingDeadlines(
  statuses: ObligationStatus[],
  options: { asOf: string; withinDays: number },
): { items: ObligationStatus[]; basis: "DERIVED" | "DATA_NOT_AVAILABLE"; explanation: string[] } {
  assertIsoDate(options.asOf, "asOf");
  if (!Number.isInteger(options.withinDays) || options.withinDays < 0) {
    throw new SpecialistError("RULE_VIOLATION", "withinDays must be a non-negative integer.");
  }
  if (statuses.length === 0) {
    return {
      items: [],
      basis: "DATA_NOT_AVAILABLE",
      explanation: ["No obligations in scope, so no deadline conclusion can be drawn."],
    };
  }

  const items = statuses
    .filter(
      (s) =>
        (s.deadline.state === "FUTURE" || s.deadline.state === "DUE_TODAY") &&
        s.deadline.daysRemaining !== null &&
        s.deadline.daysRemaining <= options.withinDays,
    )
    .sort((a, b) => (a.deadline.daysRemaining ?? 0) - (b.deadline.daysRemaining ?? 0));

  const noDueDate = statuses.filter((s) => s.deadline.state === "NO_DUE_DATE").length;
  return {
    items,
    basis: "DERIVED",
    explanation: [
      `${items.length} obligation(s) fall due within ${options.withinDays} day(s) of ${options.asOf}.`,
      noDueDate > 0
        ? `${noDueDate} obligation(s) have no due date and are excluded — they are unmonitorable, not compliant.`
        : "All obligations in scope carry a due date.",
    ],
  };
}

export function overdueObligations(
  statuses: ObligationStatus[],
  options: { asOf: string },
): { items: ObligationStatus[]; basis: "DERIVED" | "DATA_NOT_AVAILABLE"; explanation: string[] } {
  assertIsoDate(options.asOf, "asOf");
  if (statuses.length === 0) {
    return { items: [], basis: "DATA_NOT_AVAILABLE", explanation: ["No obligations in scope."] };
  }
  const items = statuses
    .filter((s) => s.deadline.state === "OVERDUE")
    .sort((a, b) => (a.deadline.daysRemaining ?? 0) - (b.deadline.daysRemaining ?? 0));
  return {
    items,
    basis: "DERIVED",
    explanation: [
      `${items.length} obligation(s) are past their recorded due date at ${options.asOf}.`,
      "Being past a recorded due date is a register fact. Whether it constitutes a breach is a legal question this module does not answer.",
    ],
  };
}

// ===========================================================================
// 4. EVIDENCE COMPLETENESS
// ===========================================================================

export function evidenceCompleteness(statuses: ObligationStatus[]): {
  counts: Record<EvidenceState, number>;
  total: number;
  /** Null when nothing is in scope — never 0% presented as a measured result. */
  verifiedPercent: string | null;
  basis: "DERIVED" | "DATA_NOT_AVAILABLE";
  explanation: string[];
} {
  const counts: Record<EvidenceState, number> = {
    UNKNOWN: 0, REQUIRED: 0, MISSING: 0, PRESENT: 0, UNDER_REVIEW: 0, VERIFIED: 0, EXPIRED: 0,
  };
  for (const s of statuses) counts[s.evidence.state] += 1;

  if (statuses.length === 0) {
    return {
      counts,
      total: 0,
      verifiedPercent: null,
      basis: "DATA_NOT_AVAILABLE",
      explanation: ["No obligations in scope; evidence completeness is undefined, not 0%."],
    };
  }

  return {
    counts,
    total: statuses.length,
    verifiedPercent: ((counts.VERIFIED / statuses.length) * 100).toFixed(2),
    basis: "DERIVED",
    explanation: [
      `${counts.VERIFIED} of ${statuses.length} obligation(s) have human-confirmed, effective evidence.`,
      "Evidence completeness measures documentation, not compliance. A verified document does not by itself satisfy an obligation.",
    ],
  };
}

// ===========================================================================
// 5. CONTROL COVERAGE
// ===========================================================================

export function controlCoverage(
  subject: { id: string; type: "OBLIGATION" | "FRAMEWORK"; controlIds: string[]; framework?: string },
  controls: ControlRecord[],
  options: { asOf: string; staleTestDays?: number },
): ControlCoverage {
  const findings: DataQualityFinding[] = [];

  // Controls linked explicitly by id, plus those declaring the framework.
  const byId = controls.filter((c) => subject.controlIds.includes(c.id));
  const byFramework = subject.framework
    ? controls.filter((c) => c.frameworks.includes(subject.framework!) && !subject.controlIds.includes(c.id))
    : [];
  const linked = [...byId, ...byFramework];

  for (const missingId of subject.controlIds.filter((id) => !controls.some((c) => c.id === id))) {
    findings.push(finding("ORPHANED_RISK_REFERENCE", "GOVERNANCE", "CONTROL", missingId,
      `Control ${missingId} is referenced but does not exist in scope.`));
  }

  if (linked.length === 0) {
    findings.push(finding("NO_CONTROL_COVERAGE", "WARNING",
      subject.type === "OBLIGATION" ? "COMPLIANCE_OBLIGATION" : "CONTROL", subject.id,
      "No controls are linked, so control coverage cannot be measured."));
    return {
      subject: subject.id,
      subjectType: subject.type,
      controlIds: [],
      controlCodes: [],
      effectiveCount: 0,
      partiallyEffectiveCount: 0,
      ineffectiveOrUnknownCount: 0,
      coverageBasis: "DATA_NOT_AVAILABLE",
      untestedControlIds: [],
      findings,
      explanation: [
        "No linked controls. Coverage is DATA_NOT_AVAILABLE — reporting 0% would imply a measured absence of control rather than an absence of information.",
      ],
    };
  }

  const untested: string[] = [];
  for (const c of linked) {
    if (!c.lastTestedAt) {
      untested.push(c.id);
      findings.push(finding("STALE_ASSESSMENT", "INFO", "CONTROL", c.id, `Control ${c.code} has never been tested.`));
    } else if (options.staleTestDays !== undefined && ISO_DATE.test(c.lastTestedAt)) {
      const age = daysBetween(c.lastTestedAt, options.asOf);
      if (age > options.staleTestDays) {
        untested.push(c.id);
        findings.push(finding("STALE_ASSESSMENT", "WARNING", "CONTROL", c.id, `Control ${c.code} was last tested ${age} day(s) ago.`));
      }
      if (age < 0) {
        findings.push(finding("FUTURE_DATED_RECORD", "WARNING", "CONTROL", c.id, `Control ${c.code} has a future test date.`));
      }
    }
  }

  const effectiveCount = linked.filter((c) => c.effectiveness === "EFFECTIVE").length;
  const partiallyEffectiveCount = linked.filter((c) => c.effectiveness === "PARTIALLY_EFFECTIVE").length;

  return {
    subject: subject.id,
    subjectType: subject.type,
    controlIds: linked.map((c) => c.id),
    controlCodes: linked.map((c) => c.code),
    effectiveCount,
    partiallyEffectiveCount,
    ineffectiveOrUnknownCount: linked.length - effectiveCount - partiallyEffectiveCount,
    coverageBasis: "DERIVED",
    untestedControlIds: untested,
    findings,
    explanation: [
      `${linked.length} control(s) linked: ${effectiveCount} effective, ${partiallyEffectiveCount} partially effective, ${linked.length - effectiveCount - partiallyEffectiveCount} ineffective or unknown.`,
      "Control effectiveness is read from the control register as recorded by its owner. This module does not test controls.",
    ],
  };
}

// ===========================================================================
// 6. OBLIGATION RISK — consumes the EXISTING register only
// ===========================================================================

export function obligationRisk(
  risks: RiskRecord[],
  controls: ControlRecord[],
  options: { asOf: string; entityOwners?: Record<string, string> },
): { items: ObligationRiskView[]; basis: "OBSERVED" | "DATA_NOT_AVAILABLE"; explanation: string[] } {
  if (risks.length === 0) {
    return {
      items: [],
      basis: "DATA_NOT_AVAILABLE",
      explanation: ["No risks in scope. This module reads the existing enterprise risk register and creates no second register."],
    };
  }

  const items = risks.map((r) => {
    const findings: DataQualityFinding[] = [];
    if (r.legalEntityId && options.entityOwners) {
      const owner = options.entityOwners[r.legalEntityId];
      if (!owner) {
        findings.push(finding("ORPHANED_ENTITY_REFERENCE", "GOVERNANCE", "RISK", r.id, `Risk references legal entity ${r.legalEntityId}, which does not exist.`));
      } else if (owner !== r.tenantId) {
        findings.push(finding("TENANT_ENTITY_ATTRIBUTION_MISMATCH", "GOVERNANCE", "RISK", r.id,
          `Risk is recorded under tenant ${r.tenantId} but legal entity ${r.legalEntityId} is owned by ${owner}.`));
      }
    }
    if (r.nextReviewAt && ISO_DATE.test(r.nextReviewAt) && r.nextReviewAt < options.asOf) {
      findings.push(finding("STALE_ASSESSMENT", "WARNING", "RISK", r.id, `Risk review was due ${r.nextReviewAt}.`));
    }

    const residualScore = r.residualLikelihood * r.residualImpact;
    const linkedControlIds = controls.filter((c) => c.riskId === r.id).map((c) => c.id);
    if (linkedControlIds.length === 0) {
      findings.push(finding("NO_CONTROL_COVERAGE", "INFO", "RISK", r.id, `Risk ${r.code} has no linked controls.`));
    }

    return {
      riskId: r.id,
      code: r.code,
      category: r.category,
      status: r.status,
      escalated: r.escalated,
      residualLikelihood: r.residualLikelihood,
      residualImpact: r.residualImpact,
      residualScore,
      appetiteThreshold: r.appetiteThreshold,
      aboveAppetite: residualScore > r.appetiteThreshold,
      linkedControlIds,
      findings,
      explanation: [
        `Residual ${r.residualLikelihood} x ${r.residualImpact} = ${residualScore} against the register's own appetite threshold ${r.appetiteThreshold}.`,
        "Both the residual scores and the appetite threshold are read from the existing risk register. This module supplies neither.",
      ],
    } satisfies ObligationRiskView;
  });

  return {
    items,
    basis: "OBSERVED",
    explanation: [
      `${items.length} risk(s) read from the existing register; ${items.filter((i) => i.aboveAppetite).length} above their own recorded appetite.`,
      "Analytical only. Exceeding appetite triggers no action here.",
    ],
  };
}

// ===========================================================================
// 7. EXCEPTION DETECTION
// ===========================================================================

export function exceptionDetection(
  statuses: ObligationStatus[],
  assessments: AssessmentRecord[],
  options: { asOf: string },
): { items: ComplianceException[]; basis: "DERIVED" | "DATA_NOT_AVAILABLE"; explanation: string[] } {
  assertIsoDate(options.asOf, "asOf");
  if (statuses.length === 0) {
    return { items: [], basis: "DATA_NOT_AVAILABLE", explanation: ["No obligations in scope."] };
  }

  const items: ComplianceException[] = [];
  const src = (s: ObligationStatus): ComplianceSource[] => [
    { type: "COMPLIANCE_OBLIGATION", id: s.obligationId, basis: "OBSERVED" },
    ...(s.assessmentId ? [{ type: "COMPLIANCE_ASSESSMENT" as const, id: s.assessmentId, basis: "OBSERVED" as const }] : []),
  ];

  for (const s of statuses) {
    if (s.deadline.state === "OVERDUE") {
      items.push({ code: "OVERDUE_OBLIGATION", obligationId: s.obligationId, obligationCode: s.code,
        detail: `Past recorded due date ${s.deadline.dueDate} by ${Math.abs(s.deadline.daysRemaining ?? 0)} day(s).`, advisoryOnly: true, sources: src(s) });
    }
    if (s.state === "NON_COMPLIANT") {
      items.push({ code: "NON_COMPLIANT_ASSESSMENT", obligationId: s.obligationId, obligationCode: s.code,
        detail: "The governed assessment records NON_COMPLIANT.", advisoryOnly: true, sources: src(s) });
    }
    if (s.state === null) {
      items.push({ code: "UNASSESSED_OBLIGATION", obligationId: s.obligationId, obligationCode: s.code,
        detail: "No assessment exists. Unassessed is not compliant.", advisoryOnly: true, sources: src(s) });
    }
    if (s.state === "REQUIRES_HUMAN_REVIEW" || s.humanConfirmed === false) {
      items.push({ code: "AWAITING_HUMAN_REVIEW", obligationId: s.obligationId, obligationCode: s.code,
        detail: "The assessment awaits human confirmation.", advisoryOnly: true, sources: src(s) });
    }
    if (s.evidence.state === "MISSING") {
      items.push({ code: "EVIDENCE_MISSING", obligationId: s.obligationId, obligationCode: s.code,
        detail: s.evidence.reason, advisoryOnly: true, sources: src(s) });
    }
    if (s.evidence.state === "EXPIRED") {
      items.push({ code: "EVIDENCE_EXPIRED", obligationId: s.obligationId, obligationCode: s.code,
        detail: s.evidence.reason, advisoryOnly: true, sources: src(s) });
    }
    if (s.controlIds.length === 0) {
      items.push({ code: "NO_CONTROL_COVERAGE", obligationId: s.obligationId, obligationCode: s.code,
        detail: "No controls are linked to this obligation.", advisoryOnly: true, sources: src(s) });
    }

    const a = assessments.find((x) => x.id === s.assessmentId);
    if (a?.remediationDueAt && ISO_DATE.test(a.remediationDueAt) && a.remediationDueAt < options.asOf) {
      items.push({ code: "REMEDIATION_OVERDUE", obligationId: s.obligationId, obligationCode: s.code,
        detail: `Remediation was due ${a.remediationDueAt}.`, advisoryOnly: true, sources: src(s) });
    }
  }

  return {
    items,
    basis: "DERIVED",
    explanation: [
      `${items.length} exception(s) across ${statuses.length} obligation(s).`,
      "Every exception is advisory. None authorises enforcement, filing, payment or any other action.",
    ],
  };
}

// ===========================================================================
// 8. JURISDICTION EXPOSURE
// ===========================================================================

export function jurisdictionExposure(statuses: ObligationStatus[]): {
  items: JurisdictionExposure[];
  basis: "DERIVED" | "DATA_NOT_AVAILABLE";
  explanation: string[];
} {
  if (statuses.length === 0) {
    return { items: [], basis: "DATA_NOT_AVAILABLE", explanation: ["No obligations in scope."] };
  }

  const byJurisdiction = new Map<string, ObligationStatus[]>();
  for (const s of statuses) {
    const key = s.jurisdictionCode || "UNSPECIFIED";
    byJurisdiction.set(key, [...(byJurisdiction.get(key) ?? []), s]);
  }

  const items = [...byJurisdiction.entries()]
    .map(([jurisdictionCode, group]) => ({
      jurisdictionCode,
      obligationCount: group.length,
      overdueCount: group.filter((s) => s.deadline.state === "OVERDUE").length,
      unassessedCount: group.filter((s) => s.state === null).length,
      nonCompliantCount: group.filter((s) => s.state === "NON_COMPLIANT").length,
      evidenceMissingCount: group.filter((s) => s.evidence.state === "MISSING").length,
      frameworks: [...new Set(group.map((s) => s.framework))].sort(),
      basis: "DERIVED" as const,
    }))
    .sort((a, b) => b.obligationCount - a.obligationCount || a.jurisdictionCode.localeCompare(b.jurisdictionCode));

  return {
    items,
    basis: "DERIVED",
    explanation: [
      `${items.length} jurisdiction(s) represented across ${statuses.length} obligation(s).`,
      "Counts reflect what the register contains. Absence of a jurisdiction here does not mean no obligations exist there.",
    ],
  };
}

// ===========================================================================
// 9. ENTITY COMPLIANCE PROFILE
// ===========================================================================

export function entityComplianceProfile(
  statuses: ObligationStatus[],
  options: { claimedTenantId: string; entityOwners: Record<string, string> },
): { items: EntityComplianceProfile[]; basis: "DERIVED" | "DATA_NOT_AVAILABLE"; explanation: string[] } {
  if (statuses.length === 0) {
    return { items: [], basis: "DATA_NOT_AVAILABLE", explanation: ["No obligations in scope."] };
  }

  const byEntity = new Map<string, ObligationStatus[]>();
  for (const s of statuses) {
    const key = s.legalEntityId ?? "__NO_ENTITY__";
    byEntity.set(key, [...(byEntity.get(key) ?? []), s]);
  }

  const items = [...byEntity.entries()].map(([key, group]) => {
    const legalEntityId = key === "__NO_ENTITY__" ? null : key;
    const owningTenantId = legalEntityId ? (options.entityOwners[legalEntityId] ?? null) : null;
    const consistent = legalEntityId === null ? true : owningTenantId === options.claimedTenantId;

    const statusCounts: Record<string, number> = {};
    for (const s of group) {
      const label = s.state ?? "UNASSESSED";
      statusCounts[label] = (statusCounts[label] ?? 0) + 1;
    }

    const findings: DataQualityFinding[] = [];
    if (legalEntityId && !owningTenantId) {
      findings.push(finding("ORPHANED_ENTITY_REFERENCE", "GOVERNANCE", "LEGAL_ENTITY", legalEntityId,
        `Entity ${legalEntityId} does not exist; ${group.length} obligation(s) reference it.`));
    } else if (!consistent && legalEntityId) {
      findings.push(finding("TENANT_ENTITY_ATTRIBUTION_MISMATCH", "GOVERNANCE", "LEGAL_ENTITY", legalEntityId,
        `${group.length} obligation(s) claim tenant ${options.claimedTenantId} but entity ${legalEntityId} is owned by ${owningTenantId}.`));
    }

    return {
      legalEntityId,
      owningTenantId,
      claimedTenantId: options.claimedTenantId,
      attributionConsistent: consistent,
      obligationCount: group.length,
      statuses: statusCounts,
      findings,
      basis: "DERIVED" as const,
      explanation: [
        `${group.length} obligation(s) attributed to ${legalEntityId ?? "no entity"}.`,
        consistent
          ? "Tenant attribution is consistent with recorded entity ownership."
          : `ATTRIBUTION INCONSISTENT: claimed ${options.claimedTenantId}, entity owned by ${owningTenantId ?? "nobody"}. Reported, not corrected.`,
      ],
    } satisfies EntityComplianceProfile;
  })
  .sort((a, b) => (a.legalEntityId ?? "").localeCompare(b.legalEntityId ?? ""));

  return {
    items,
    basis: "DERIVED",
    explanation: [
      `${items.length} entity grouping(s); ${items.filter((i) => !i.attributionConsistent).length} with inconsistent attribution.`,
      "Ownership is never inferred or corrected. Divergence is escalated as a governance finding.",
    ],
  };
}

// ===========================================================================
// 10. COMPLIANCE DASHBOARD
// ===========================================================================

export function complianceDashboard(
  statuses: ObligationStatus[],
  options: {
    asOf: string;
    tenantId: string;
    legalEntityId: string | null;
    dueWithinDays: number;
    authorityDependencies?: string[];
  },
): ComplianceDashboard {
  assertIsoDate(options.asOf, "asOf");

  const stateCounts: Record<string, number> = {};
  const evidenceStateCounts: Record<EvidenceState, number> = {
    UNKNOWN: 0, REQUIRED: 0, MISSING: 0, PRESENT: 0, UNDER_REVIEW: 0, VERIFIED: 0, EXPIRED: 0,
  };
  for (const s of statuses) {
    if (s.state) stateCounts[s.state] = (stateCounts[s.state] ?? 0) + 1;
    evidenceStateCounts[s.evidence.state] += 1;
  }

  const findings = statuses.flatMap((s) => s.findings);

  return {
    asOf: options.asOf,
    tenantId: options.tenantId,
    legalEntityId: options.legalEntityId,
    obligationCount: statuses.length,
    stateCounts,
    unassessedCount: statuses.filter((s) => s.state === null).length,
    overdueCount: statuses.filter((s) => s.deadline.state === "OVERDUE").length,
    dueWithinWindowCount: statuses.filter(
      (s) => (s.deadline.state === "FUTURE" || s.deadline.state === "DUE_TODAY") &&
        (s.deadline.daysRemaining ?? Number.MAX_SAFE_INTEGER) <= options.dueWithinDays,
    ).length,
    evidenceStateCounts,
    jurisdictions: jurisdictionExposure(statuses).items,
    findings,
    authorityDependencies: options.authorityDependencies ?? [],
    basis: statuses.length === 0 ? "DATA_NOT_AVAILABLE" : "DERIVED",
    explanation: [
      statuses.length === 0
        ? "No obligations in scope. An empty dashboard is an absence of data, not a clean compliance record."
        : `${statuses.length} obligation(s): ${statuses.filter((s) => s.state === null).length} unassessed, ${statuses.filter((s) => s.deadline.state === "OVERDUE").length} past due date.`,
      `${findings.filter((f) => f.severity === "GOVERNANCE").length} governance finding(s) requiring a human decision.`,
      "Unassessed obligations are reported separately and are never counted as compliant.",
      "No legal or tax conclusion is expressed anywhere in this dashboard.",
    ],
  };
}
