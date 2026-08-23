/**
 * BEYU OS — Compliance & Obligation Intelligence governed service (Phase 7E).
 *
 * Every operation runs through the Phase 7B specialist platform. No bespoke RBAC, tenant
 * isolation, entity scoping, audit or capability logic lives here — duplicating the platform
 * would create a second security boundary free to drift from the first.
 *
 * READ-ONLY BY CONSTRUCTION. SELECT statements only. This module defines no tables, writes no
 * obligation, no assessment, no document, no control and no risk. The canonical registers remain
 * `compliance_obligations`, `compliance_assessments`, `documents`, `controls` and `risks`.
 *
 * TENANT SCOPING IS APPLIED IN SQL, NOT AFTERWARDS. Post-filtering would still have pulled other
 * tenants' compliance records into memory, and a leak that depends on application code remembering
 * to filter is a leak waiting to happen.
 *
 * ON THE ATTRIBUTION DEFECT. The seeded register attributes obligations to TEN_BEYU_GROUP while
 * pointing at legal entities owned by other tenants. This service deliberately does NOT follow
 * entity ownership when scoping: it scopes by the tenant the record claims, and reports the
 * divergence as a governance finding. Following ownership instead would silently "fix" the data
 * and destroy the evidence that something is wrong.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  complianceAssessments,
  complianceObligations,
  controls,
  documents,
  legalEntities,
  risks,
} from "@/db/schema";
import { SpecialistError, runSpecialist, type SpecialistContext, type SpecialistResult } from "../platform";
import {
  COMPLIANCE_VERSION,
  complianceDashboard,
  controlCoverage,
  entityComplianceProfile,
  evidenceCompleteness,
  exceptionDetection,
  jurisdictionExposure,
  obligationRisk,
  obligationStatus,
  overdueObligations,
  upcomingDeadlines,
  type AssessmentRecord,
  type ControlRecord,
  type DocumentRecord,
  type ObligationRecord,
  type RiskRecord,
} from "./engines";
import type {
  ComplianceDashboard,
  ComplianceException,
  ControlCoverage,
  EntityComplianceProfile,
  EvidenceState,
  JurisdictionExposure,
  ObligationRiskView,
  ObligationStatus,
} from "./model";

const MAX_ROWS = 5000;

/** Normalises a Drizzle date/timestamp column to an ISO date string, or null. */
function isoDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return null;
}

function isoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return "";
}

async function loadObligations(
  tenantId: string,
  legalEntityId: string | null,
): Promise<ObligationRecord[]> {
  const conditions = [eq(complianceObligations.tenantId, tenantId)];
  if (legalEntityId) conditions.push(eq(complianceObligations.legalEntityId, legalEntityId));

  const rows = await db
    .select()
    .from(complianceObligations)
    .where(and(...conditions))
    .limit(MAX_ROWS);

  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    code: r.code,
    framework: r.framework,
    reference: r.reference,
    title: r.title,
    obligationType: r.obligationType,
    jurisdictionCode: r.jurisdictionCode,
    legalEntityId: r.legalEntityId,
    sectorCode: r.sectorCode,
    frequency: r.frequency,
    nextDueAt: isoDate(r.nextDueAt),
    ownerRole: r.ownerRole,
    controlIds: Array.isArray(r.controlIds) ? r.controlIds : [],
    status: r.status,
  }));
}

async function loadAssessments(tenantId: string, obligationIds: string[]): Promise<AssessmentRecord[]> {
  if (obligationIds.length === 0) return [];
  const rows = await db
    .select()
    .from(complianceAssessments)
    .where(
      and(
        eq(complianceAssessments.tenantId, tenantId),
        inArray(complianceAssessments.obligationId, obligationIds),
      ),
    )
    .limit(MAX_ROWS);

  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    obligationId: r.obligationId,
    period: r.period,
    state: r.state,
    evidenceDocumentId: r.evidenceDocumentId,
    remediationDueAt: isoDate(r.remediationDueAt),
    humanConfirmed: r.humanConfirmed,
    assessedAt: isoTimestamp(r.assessedAt),
  }));
}

async function loadDocuments(tenantId: string): Promise<DocumentRecord[]> {
  const rows = await db
    .select({
      id: documents.id,
      tenantId: documents.tenantId,
      effectiveDate: documents.effectiveDate,
      authorityStatus: documents.authorityStatus,
      jurisdictionCode: documents.jurisdictionCode,
    })
    .from(documents)
    .where(eq(documents.tenantId, tenantId))
    .limit(MAX_ROWS);

  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    effectiveDate: isoDate(r.effectiveDate),
    authorityStatus: r.authorityStatus,
    jurisdictionCode: r.jurisdictionCode,
  }));
}

async function loadControls(tenantId: string): Promise<ControlRecord[]> {
  const rows = await db.select().from(controls).where(eq(controls.tenantId, tenantId)).limit(MAX_ROWS);
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    code: r.code,
    frameworks: Array.isArray(r.frameworks) ? r.frameworks : [],
    riskId: r.riskId,
    lastTestedAt: isoDate(r.lastTestedAt),
    effectiveness: r.effectiveness,
  }));
}

async function loadRisks(tenantId: string, legalEntityId: string | null): Promise<RiskRecord[]> {
  const conditions = [eq(risks.tenantId, tenantId)];
  if (legalEntityId) conditions.push(eq(risks.legalEntityId, legalEntityId));
  const rows = await db.select().from(risks).where(and(...conditions)).limit(MAX_ROWS);
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    code: r.code,
    category: r.category,
    legalEntityId: r.legalEntityId,
    residualLikelihood: r.residualLikelihood,
    residualImpact: r.residualImpact,
    appetiteThreshold: r.appetiteThreshold,
    status: r.status,
    escalated: r.escalated,
    nextReviewAt: isoDate(r.nextReviewAt),
  }));
}

/**
 * Entity ownership map, used ONLY to detect attribution divergence — never to widen scope.
 * Loaded globally on purpose: detecting that an entity belongs to another tenant requires knowing
 * about that other tenant. No obligation data crosses the boundary as a result.
 */
async function loadEntityOwners(): Promise<Record<string, string>> {
  const rows = await db.select({ id: legalEntities.id, tenantId: legalEntities.tenantId }).from(legalEntities);
  return Object.fromEntries(rows.map((e) => [e.id, e.tenantId]));
}

function assertAsOf(asOf: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error("asOf must be an ISO date (YYYY-MM-DD).");
  }
}

/** Assembles obligation statuses for the validated scope. Shared by most operations. */
async function buildStatuses(
  tenantId: string,
  legalEntityId: string | null,
  asOf: string,
  staleAssessmentDays?: number,
): Promise<{
  statuses: ObligationStatus[];
  obligations: ObligationRecord[];
  assessments: AssessmentRecord[];
  documents: DocumentRecord[];
  entityOwners: Record<string, string>;
}> {
  const obligations = await loadObligations(tenantId, legalEntityId);
  const assessments = await loadAssessments(tenantId, obligations.map((o) => o.id));
  const docs = await loadDocuments(tenantId);
  const entityOwners = await loadEntityOwners();

  const statuses = obligations
    .map((o) => obligationStatus(o, assessments, docs, { asOf, entityOwners, staleAssessmentDays }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return { statuses, obligations, assessments, documents: docs, entityOwners };
}

type Options = { asOf?: string; staleAssessmentDays?: number };

/**
 * Full compliance dashboard for the validated scope.
 *
 * Declares no capability: it reads governed registers and writes nothing, so gating it would
 * suppress compliance visibility without protecting anything. Every capability that could turn a
 * finding into an action is registered LOCKED and is not reachable from this module.
 */
export async function assessCompliance(
  context: SpecialistContext,
  options: Options & { dueWithinDays?: number } = {},
): Promise<SpecialistResult<ComplianceDashboard>> {
  return runSpecialist<ComplianceDashboard>(
    {
      specialist: "COMPLIANCE",
      operation: "ASSESS_COMPLIANCE",
      kind: "ANALYSIS",
      permission: "compliance:obligation.read",
      version: COMPLIANCE_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);

      const { statuses } = await buildStatuses(
        scope.tenantId,
        scope.legalEntityId,
        asOf,
        options.staleAssessmentDays,
      );

      const dashboard = complianceDashboard(statuses, {
        asOf,
        tenantId: scope.tenantId,
        legalEntityId: scope.legalEntityId,
        dueWithinDays: options.dueWithinDays ?? 30,
      });

      return {
        data: dashboard,
        explanation: [
          ...dashboard.explanation,
          "Compliance states are read from the governed assessment register; none is computed or inferred here.",
        ],
        provenance: {
          sources: statuses.flatMap((s) => [
            { type: "COMPLIANCE_OBLIGATION", id: s.obligationId },
            ...(s.assessmentId ? [{ type: "COMPLIANCE_ASSESSMENT", id: s.assessmentId }] : []),
          ]),
          assumptions: [
            "Obligation effective windows are not represented in the schema; only lifecycle status and due date are available.",
          ],
          blockedBy: [],
        },
      };
    },
  );
}

/** Per-obligation detail for the validated scope. */
export async function readObligations(
  context: SpecialistContext,
  options: Options = {},
): Promise<SpecialistResult<{ items: ObligationStatus[] }>> {
  return runSpecialist<{ items: ObligationStatus[] }>(
    {
      specialist: "COMPLIANCE",
      operation: "READ_OBLIGATIONS",
      kind: "READ",
      permission: "compliance:obligation.read",
      version: COMPLIANCE_VERSION,
      riskClass: "LOW",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);
      const { statuses } = await buildStatuses(scope.tenantId, scope.legalEntityId, asOf, options.staleAssessmentDays);
      return {
        data: { items: statuses },
        explanation: [
          `${statuses.length} obligation(s) in scope.`,
          "Obligations are reported exactly as recorded. None is created, amended or interpreted.",
        ],
        provenance: {
          sources: statuses.map((s) => ({ type: "COMPLIANCE_OBLIGATION", id: s.obligationId })),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/** Deadline monitoring: upcoming and overdue, separated. */
export async function monitorDeadlines(
  context: SpecialistContext,
  options: Options & { withinDays?: number } = {},
): Promise<
  SpecialistResult<{
    upcoming: ObligationStatus[];
    overdue: ObligationStatus[];
    noDueDate: ObligationStatus[];
    explanation: string[];
  }>
> {
  return runSpecialist(
    {
      specialist: "COMPLIANCE",
      operation: "MONITOR_DEADLINES",
      kind: "ANALYSIS",
      permission: "compliance:obligation.read",
      version: COMPLIANCE_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);
      const { statuses } = await buildStatuses(scope.tenantId, scope.legalEntityId, asOf);

      const up = upcomingDeadlines(statuses, { asOf, withinDays: options.withinDays ?? 30 });
      const over = overdueObligations(statuses, { asOf });
      const noDueDate = statuses.filter((s) => s.deadline.state === "NO_DUE_DATE");

      return {
        data: {
          upcoming: up.items,
          overdue: over.items,
          noDueDate,
          explanation: [...up.explanation, ...over.explanation],
        },
        explanation: [
          ...up.explanation,
          ...over.explanation,
          "A future obligation is never reported as overdue, and an obligation without a due date is never reported as on time.",
        ],
        provenance: {
          sources: [...up.items, ...over.items].map((s) => ({ type: "COMPLIANCE_OBLIGATION", id: s.obligationId })),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/** Evidence completeness, kept strictly distinct from compliance state. */
export async function assessEvidence(
  context: SpecialistContext,
  options: Options = {},
): Promise<
  SpecialistResult<{
    counts: Record<EvidenceState, number>;
    total: number;
    verifiedPercent: string | null;
    items: Array<{ obligationId: string; code: string; evidence: ObligationStatus["evidence"] }>;
  }>
> {
  return runSpecialist(
    {
      specialist: "COMPLIANCE",
      operation: "ASSESS_EVIDENCE",
      kind: "ANALYSIS",
      /**
       * Gated on the OBLIGATION permission, not the document permission.
       *
       * Found by hostile audit (§21): this operation returns obligation identifiers, codes and
       * their evidence posture. Gating it on `documents:registry.read` alone let HCM_DIRECTOR —
       * a role deliberately granted document access but NOT compliance access — enumerate the
       * entire obligation register. The permission must match the most sensitive data returned,
       * not the table the data is joined from.
       */
      permission: "compliance:obligation.read",
      version: COMPLIANCE_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      // Defence in depth: evidence detail also requires document-registry access. Every role that
      // legitimately performs this analysis (CRC, CGO, CFO, AUDITOR, SECTOR_OPERATOR) holds both.
      if (!scope.principal.permissions.has("documents:registry.read")) {
        throw new SpecialistError(
          "DENIED",
          "Evidence analysis requires both compliance:obligation.read and documents:registry.read.",
        );
      }
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);
      const { statuses } = await buildStatuses(scope.tenantId, scope.legalEntityId, asOf);
      const completeness = evidenceCompleteness(statuses);

      return {
        data: {
          counts: completeness.counts,
          total: completeness.total,
          verifiedPercent: completeness.verifiedPercent,
          items: statuses.map((s) => ({ obligationId: s.obligationId, code: s.code, evidence: s.evidence })),
        },
        explanation: [
          ...completeness.explanation,
          "Evidence state answers 'is documentation present and current', never 'is the obligation satisfied'.",
        ],
        provenance: {
          sources: statuses
            .filter((s) => s.evidence.documentId)
            .map((s) => ({ type: "DOCUMENT", id: s.evidence.documentId! })),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/** Control coverage per obligation. */
export async function assessControlCoverage(
  context: SpecialistContext,
  options: Options & { staleTestDays?: number } = {},
): Promise<SpecialistResult<{ items: ControlCoverage[] }>> {
  return runSpecialist<{ items: ControlCoverage[] }>(
    {
      specialist: "COMPLIANCE",
      operation: "ASSESS_CONTROL_COVERAGE",
      kind: "ANALYSIS",
      permission: "compliance:obligation.read",
      version: COMPLIANCE_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);
      const obligations = await loadObligations(scope.tenantId, scope.legalEntityId);
      const ctrls = await loadControls(scope.tenantId);

      const items = obligations
        .map((o) =>
          controlCoverage(
            { id: o.id, type: "OBLIGATION", controlIds: o.controlIds, framework: o.framework },
            ctrls,
            { asOf, staleTestDays: options.staleTestDays },
          ),
        )
        .sort((a, b) => a.subject.localeCompare(b.subject));

      return {
        data: { items },
        explanation: [
          `Coverage assessed for ${items.length} obligation(s) against ${ctrls.length} control(s).`,
          `${items.filter((i) => i.coverageBasis === "DATA_NOT_AVAILABLE").length} obligation(s) have no linked control, reported as DATA_NOT_AVAILABLE rather than 0% coverage.`,
          "Control effectiveness is read from the register. This module tests no controls.",
        ],
        provenance: {
          sources: ctrls.map((c) => ({ type: "CONTROL", id: c.id })),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/** Compliance-relevant view of the EXISTING risk register. Creates no second register. */
export async function assessComplianceRisk(
  context: SpecialistContext,
  options: Options = {},
): Promise<SpecialistResult<{ items: ObligationRiskView[] }>> {
  return runSpecialist<{ items: ObligationRiskView[] }>(
    {
      specialist: "COMPLIANCE",
      operation: "ASSESS_COMPLIANCE_RISK",
      kind: "ANALYSIS",
      permission: "risk:register.read",
      version: COMPLIANCE_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);
      const riskRows = await loadRisks(scope.tenantId, scope.legalEntityId);
      const ctrls = await loadControls(scope.tenantId);
      const entityOwners = await loadEntityOwners();
      const result = obligationRisk(riskRows, ctrls, { asOf, entityOwners });

      return {
        data: { items: result.items },
        explanation: [
          ...result.explanation,
          "Residual scores and appetite thresholds come from the existing enterprise risk register; this module supplies neither and stores nothing.",
        ],
        provenance: {
          sources: result.items.map((i) => ({ type: "RISK", id: i.riskId })),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/** Exceptions requiring human attention. Advisory only. */
export async function detectExceptions(
  context: SpecialistContext,
  options: Options = {},
): Promise<SpecialistResult<{ items: ComplianceException[] }>> {
  return runSpecialist<{ items: ComplianceException[] }>(
    {
      specialist: "COMPLIANCE",
      operation: "DETECT_EXCEPTIONS",
      kind: "ANALYSIS",
      permission: "compliance:obligation.read",
      version: COMPLIANCE_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);
      const { statuses, assessments } = await buildStatuses(scope.tenantId, scope.legalEntityId, asOf);
      const result = exceptionDetection(statuses, assessments, { asOf });

      return {
        data: { items: result.items },
        explanation: [
          ...result.explanation,
          "No exception here authorises enforcement, filing, payment, settlement or any other action.",
        ],
        provenance: {
          sources: result.items.flatMap((i) => i.sources.map((s) => ({ type: s.type, id: s.id }))),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/** Jurisdiction and entity exposure views, including attribution divergence. */
export async function profileExposure(
  context: SpecialistContext,
  options: Options = {},
): Promise<
  SpecialistResult<{ jurisdictions: JurisdictionExposure[]; entities: EntityComplianceProfile[] }>
> {
  return runSpecialist(
    {
      specialist: "COMPLIANCE",
      operation: "PROFILE_EXPOSURE",
      kind: "ANALYSIS",
      permission: "compliance:obligation.read",
      version: COMPLIANCE_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
      assertAsOf(asOf);
      const { statuses, entityOwners } = await buildStatuses(scope.tenantId, scope.legalEntityId, asOf);

      const jur = jurisdictionExposure(statuses);
      const ent = entityComplianceProfile(statuses, {
        claimedTenantId: scope.tenantId,
        entityOwners,
      });

      const inconsistent = ent.items.filter((e) => !e.attributionConsistent);

      return {
        data: { jurisdictions: jur.items, entities: ent.items },
        explanation: [
          ...jur.explanation,
          ...ent.explanation,
          inconsistent.length > 0
            ? `${inconsistent.length} entity grouping(s) show tenant/entity attribution divergence. This is surfaced as a governance finding and is deliberately NOT corrected.`
            : "All entity attributions are consistent with recorded ownership.",
        ],
        provenance: {
          sources: statuses.map((s) => ({ type: "COMPLIANCE_OBLIGATION", id: s.obligationId })),
          assumptions: ["Entity ownership is read from legal_entities and never inferred."],
          blockedBy: [],
        },
      };
    },
  );
}
