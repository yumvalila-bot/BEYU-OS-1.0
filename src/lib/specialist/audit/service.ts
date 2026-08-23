/**
 * BEYU OS — Audit Intelligence governed service (Phase 7G).
 *
 * Every operation runs through the Phase 7B specialist platform. No bespoke RBAC, tenant
 * isolation, entity scoping, audit or capability logic lives here.
 *
 * READ-ONLY BY CONSTRUCTION. SELECT statements only. This module defines no tables and writes
 * nothing to `audit_log` or `enterprise_events` — which is doubly important here, because the
 * subject of the analysis IS the audit trail. An audit reader that could write to the ledger it
 * inspects would destroy the property that makes the ledger worth having.
 *
 * THE RECURSION HAZARD. Every ANALYSIS run through `runSpecialist()` writes one audit row and one
 * event. An Audit Intelligence operation therefore appends to the very table it reads. That is
 * correct and desirable — audit access must itself be audited — but it means results are
 * timing-sensitive, and a naive "count rows before and after" test would be self-defeating. Reads
 * are classified READ (not audited individually) where they are pure retrieval, and the analysis
 * operations bound their queries by an explicit window so their own footprint is visible rather
 * than hidden.
 *
 * CLEARANCE GATING. `enterprise_events.classification` is the ABAC classification consumed by
 * `can()`. Events can carry CONFIDENTIAL or higher, so this service filters events by the
 * caller's clearance in SQL and reports `withheldEventCount` — the Phase 7F lesson applied to a
 * more sensitive dataset. The clearance whitelist fails closed on an unrecognised value.
 */
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, enterpriseEvents } from "@/db/schema";
import { classificationRank, type Classification } from "@/lib/constants";
import { runSpecialist, type SpecialistContext, type SpecialistResult } from "../platform";
import {
  AUDIT_INTEL_VERSION,
  activityTimeline,
  actorActivity,
  assertWindow,
  auditDataQuality,
  correlate,
  failedActionAnalysis,
  governanceActivity,
  inspectEvidenceChain,
  privilegedActionAnalysis,
  unsupportedAnalyses,
} from "./engines";
import type {
  ActivityTimelineEntry,
  ActorActivity,
  AuditObservation,
  AuditRecordView,
  AuditReport,
  AuditWindow,
  CorrelationView,
  EventRecordView,
  EvidenceChainReport,
  GovernanceActivityView,
  UnsupportedAnalysis,
} from "./model";

const MAX_ROWS = 5000;

const CLASSIFICATIONS: Classification[] = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
  "HIGHLY_RESTRICTED",
];

/**
 * Classifications a principal may read. FAILS CLOSED on an unrecognised clearance.
 *
 * Same defect class as Phase 7F: `classificationRank()` returns CLASSIFICATION_ORDER.length for
 * an unknown string, which is HIGHER than HIGHLY_RESTRICTED, so a rank comparison alone would let
 * a forged clearance read everything. The whitelist check must come first.
 */
function visibleClassifications(clearance: Classification): Classification[] {
  if (!CLASSIFICATIONS.includes(clearance)) return [];
  return CLASSIFICATIONS.filter((c) => classificationRank(c) <= classificationRank(clearance));
}

function isoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return "";
}

function defaultWindow(): AuditWindow {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}

/**
 * Loads audit records for the validated scope and window.
 *
 * `audit_log` has no classification column, so it is gated by permission and tenant alone. The
 * caller-facing operations that expose it require `audit:log.read`.
 */
async function loadAuditRecords(tenantId: string, window: AuditWindow): Promise<AuditRecordView[]> {
  const rows = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.tenantId, tenantId),
        gte(auditLog.occurredAt, new Date(`${window.from}T00:00:00.000Z`)),
        lte(auditLog.occurredAt, new Date(`${window.to}T23:59:59.999Z`)),
      ),
    )
    .orderBy(asc(auditLog.sequence))
    .limit(MAX_ROWS);

  return rows.map((r) => ({
    id: r.id,
    sequence: String(r.sequence),
    tenantId: r.tenantId,
    actorUserId: r.actorUserId,
    actorType: r.actorType,
    action: r.action,
    objectType: r.objectType,
    objectId: r.objectId,
    outcome: r.outcome,
    reason: r.reason,
    authority: r.authority,
    traceId: r.traceId,
    occurredAt: isoTimestamp(r.occurredAt),
    hash: r.hash,
    prevHash: r.prevHash,
    basis: "OBSERVED" as const,
  }));
}

/** Loads events for the validated scope, window AND clearance. Returns the withheld count. */
async function loadEvents(
  tenantId: string,
  window: AuditWindow,
  clearance: Classification,
): Promise<{ events: EventRecordView[]; withheld: number }> {
  const allowed = visibleClassifications(clearance);

  const scope = [
    eq(enterpriseEvents.tenantId, tenantId),
    gte(enterpriseEvents.occurredAt, new Date(`${window.from}T00:00:00.000Z`)),
    lte(enterpriseEvents.occurredAt, new Date(`${window.to}T23:59:59.999Z`)),
  ];

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(enterpriseEvents)
    .where(and(...scope));

  // Explicit short-circuit: an unrecognised clearance grants nothing. Relying on inArray with an
  // empty list would leave a security decision to driver-specific SQL generation.
  const rows =
    allowed.length === 0
      ? []
      : await db
          .select()
          .from(enterpriseEvents)
          .where(and(...scope, inArray(enterpriseEvents.classification, allowed)))
          .orderBy(asc(enterpriseEvents.sequence))
          .limit(MAX_ROWS);

  const events = rows.map((r) => ({
    id: r.id,
    sequence: String(r.sequence),
    type: r.type,
    source: r.source,
    tenantId: r.tenantId,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    actorUserId: r.actorUserId,
    actorType: r.actorType,
    classification: r.classification,
    traceId: r.traceId,
    occurredAt: isoTimestamp(r.occurredAt),
    hash: r.hash,
    prevHash: r.prevHash,
    basis: "OBSERVED" as const,
  }));

  return { events, withheld: Number(total) - events.length };
}

function withheldNote(withheld: number): string[] {
  return withheld > 0
    ? [
        `${withheld} event(s) in scope were withheld because their classification exceeds your ` +
          "clearance. Every count here is therefore PARTIAL.",
      ]
    : [];
}

function resolveWindow(window?: AuditWindow): AuditWindow {
  const w = window ?? defaultWindow();
  assertWindow(w);
  return w;
}

type WindowOptions = { window?: AuditWindow };

/** Raw audit-record search within the validated scope and window. */
export async function searchAuditRecords(
  context: SpecialistContext,
  options: WindowOptions & { action?: string; actorUserId?: string; outcome?: string; limit?: number } = {},
): Promise<SpecialistResult<{ records: AuditRecordView[]; window: AuditWindow; totalInWindow: number }>> {
  return runSpecialist(
    {
      specialist: "AUDIT_INTELLIGENCE",
      operation: "SEARCH_RECORDS",
      kind: "READ",
      permission: "audit:log.read",
      version: AUDIT_INTEL_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const window = resolveWindow(options.window);
      const all = await loadAuditRecords(scope.tenantId, window);

      let records = all;
      if (options.action) records = records.filter((r) => r.action === options.action);
      if (options.actorUserId) records = records.filter((r) => r.actorUserId === options.actorUserId);
      if (options.outcome) records = records.filter((r) => r.outcome === options.outcome);
      if (options.limit !== undefined) {
        if (!Number.isInteger(options.limit) || options.limit <= 0) {
          throw new Error("limit must be a positive integer.");
        }
        records = records.slice(0, options.limit);
      }

      return {
        data: { records, window, totalInWindow: all.length },
        explanation: [
          `${records.length} record(s) matched within ${window.from}..${window.to} (${all.length} in window before filters).`,
          records.length === 0
            ? "An empty result means no matching record exists in this window and scope. It is not evidence that the activity never occurred elsewhere."
            : "Records are returned exactly as written to the append-only ledger.",
        ],
        provenance: {
          sources: records.map((r) => ({ type: "AUDIT_RECORD", id: r.id })),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/** Per-actor activity analysis. */
export async function analyzeActorActivity(
  context: SpecialistContext,
  options: WindowOptions & { privilegedActions?: string[] } = {},
): Promise<SpecialistResult<{ actors: ActorActivity[]; window: AuditWindow }>> {
  return runSpecialist(
    {
      specialist: "AUDIT_INTELLIGENCE",
      operation: "ANALYZE_ACTOR_ACTIVITY",
      kind: "ANALYSIS",
      permission: "audit:log.read",
      version: AUDIT_INTEL_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const window = resolveWindow(options.window);
      const records = await loadAuditRecords(scope.tenantId, window);
      const result = actorActivity(records, { privilegedActions: options.privilegedActions });

      return {
        data: { actors: result.actors, window },
        explanation: [...result.explanation, `Window ${window.from}..${window.to}.`],
        provenance: {
          sources: records.map((r) => ({ type: "AUDIT_RECORD", id: r.id })),
          assumptions: options.privilegedActions?.length
            ? [`Privileged actions were declared by the caller: ${options.privilegedActions.join(", ")}.`]
            : [],
          blockedBy: [],
        },
      };
    },
  );
}

/** Chronological activity timeline. */
export async function readActivityTimeline(
  context: SpecialistContext,
  options: WindowOptions & { limit?: number } = {},
): Promise<SpecialistResult<{ entries: ActivityTimelineEntry[]; window: AuditWindow }>> {
  return runSpecialist(
    {
      specialist: "AUDIT_INTELLIGENCE",
      operation: "READ_TIMELINE",
      kind: "READ",
      permission: "audit:log.read",
      version: AUDIT_INTEL_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const window = resolveWindow(options.window);
      const records = await loadAuditRecords(scope.tenantId, window);
      const result = activityTimeline(records, { limit: options.limit });

      return {
        data: { entries: result.entries, window },
        explanation: [...result.explanation, `Window ${window.from}..${window.to}.`],
        provenance: {
          sources: result.entries.map((e) => ({ type: "AUDIT_RECORD", id: e.sequence })),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/** Denied and failed action analysis. */
export async function analyzeFailedActions(
  context: SpecialistContext,
  options: WindowOptions & { repeatedDenialThreshold?: number } = {},
): Promise<
  SpecialistResult<{
    denied: AuditRecordView[];
    failed: AuditRecordView[];
    observations: AuditObservation[];
    window: AuditWindow;
  }>
> {
  return runSpecialist(
    {
      specialist: "AUDIT_INTELLIGENCE",
      operation: "ANALYZE_FAILED_ACTIONS",
      kind: "ANALYSIS",
      permission: "audit:log.read",
      version: AUDIT_INTEL_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const window = resolveWindow(options.window);
      const records = await loadAuditRecords(scope.tenantId, window);
      const result = failedActionAnalysis(records, {
        repeatedDenialThreshold: options.repeatedDenialThreshold,
      });

      return {
        data: { denied: result.denied, failed: result.failed, observations: result.observations, window },
        explanation: [...result.explanation, "No observation here is a finding of misconduct."],
        provenance: {
          sources: [...result.denied, ...result.failed].map((r) => ({ type: "AUDIT_RECORD", id: r.id })),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/** Privileged-action analysis against a caller-declared privileged list. */
export async function analyzePrivilegedActions(
  context: SpecialistContext,
  privilegedActions: string[],
  options: WindowOptions = {},
): Promise<SpecialistResult<{ records: AuditRecordView[]; observations: AuditObservation[]; window: AuditWindow }>> {
  return runSpecialist(
    {
      specialist: "AUDIT_INTELLIGENCE",
      operation: "ANALYZE_PRIVILEGED_ACTIONS",
      kind: "ANALYSIS",
      permission: "audit:log.read",
      version: AUDIT_INTEL_VERSION,
      riskClass: "HIGH",
    },
    context,
    async (scope) => {
      const window = resolveWindow(options.window);
      const records = await loadAuditRecords(scope.tenantId, window);
      const result = privilegedActionAnalysis(records, privilegedActions);

      return {
        data: { records: result.records, observations: result.observations, window },
        explanation: [...result.explanation, `Window ${window.from}..${window.to}.`],
        provenance: {
          sources: result.records.map((r) => ({ type: "AUDIT_RECORD", id: r.id })),
          assumptions: [`Privileged actions were declared by the caller, not inferred.`],
          blockedBy: [],
        },
      };
    },
  );
}

/**
 * Correlates audit records with enterprise events.
 *
 * Requires BOTH audit and event read permissions: the result joins the two datasets, so gating on
 * either alone would expose one through the other. This is the Phase 7E lesson — gate on the most
 * sensitive data actually returned.
 */
export async function correlateEvents(
  context: SpecialistContext,
  options: WindowOptions = {},
): Promise<
  SpecialistResult<{
    correlations: CorrelationView[];
    observations: AuditObservation[];
    window: AuditWindow;
    withheldEventCount: number;
  }>
> {
  return runSpecialist(
    {
      specialist: "AUDIT_INTELLIGENCE",
      operation: "CORRELATE_EVENTS",
      kind: "ANALYSIS",
      permission: "audit:log.read",
      version: AUDIT_INTEL_VERSION,
      riskClass: "HIGH",
    },
    context,
    async (scope) => {
      if (!scope.principal.permissions.has("audit:event.read")) {
        throw new Error("Correlation requires both audit:log.read and audit:event.read.");
      }

      const window = resolveWindow(options.window);
      const records = await loadAuditRecords(scope.tenantId, window);
      const { events, withheld } = await loadEvents(scope.tenantId, window, scope.principal.clearance);
      const result = correlate(records, events);

      return {
        data: {
          correlations: result.correlations,
          observations: result.observations,
          window,
          withheldEventCount: withheld,
        },
        explanation: [...result.explanation, ...withheldNote(withheld)],
        provenance: {
          sources: [
            ...records.map((r) => ({ type: "AUDIT_RECORD", id: r.id })),
            ...events.map((e) => ({ type: "EVENT", id: e.id })),
          ],
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/** Hash-chain linkage inspection over audit records in the window. */
export async function inspectChain(
  context: SpecialistContext,
  options: WindowOptions = {},
): Promise<SpecialistResult<EvidenceChainReport & { window: AuditWindow }>> {
  return runSpecialist(
    {
      specialist: "AUDIT_INTELLIGENCE",
      operation: "INSPECT_EVIDENCE_CHAIN",
      kind: "ANALYSIS",
      permission: "audit:log.read",
      version: AUDIT_INTEL_VERSION,
      riskClass: "HIGH",
    },
    context,
    async (scope) => {
      const window = resolveWindow(options.window);
      const records = await loadAuditRecords(scope.tenantId, window);
      const report = inspectEvidenceChain(
        records.map((r) => ({ sequence: r.sequence, hash: r.hash, prevHash: r.prevHash })),
      );

      return {
        data: { ...report, window },
        explanation: [
          ...report.explanation,
          "A tenant-filtered query returns a subset of a global chain, so gaps are expected and are not evidence of tampering.",
        ],
        provenance: {
          sources: records.map((r) => ({ type: "AUDIT_RECORD", id: r.id })),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/** Governance-related audit activity. */
export async function analyzeGovernanceActivity(
  context: SpecialistContext,
  options: WindowOptions = {},
): Promise<SpecialistResult<GovernanceActivityView & { window: AuditWindow }>> {
  return runSpecialist(
    {
      specialist: "AUDIT_INTELLIGENCE",
      operation: "ANALYZE_GOVERNANCE_ACTIVITY",
      kind: "ANALYSIS",
      permission: "audit:log.read",
      version: AUDIT_INTEL_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const window = resolveWindow(options.window);
      const records = await loadAuditRecords(scope.tenantId, window);
      const view = governanceActivity(records);

      return {
        data: { ...view, window },
        explanation: [...view.explanation, `Window ${window.from}..${window.to}.`],
        provenance: {
          sources: view.records.map((r) => ({ type: "AUDIT_RECORD", id: r.objectId })),
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/** Consolidated audit report. */
export async function generateAuditReport(
  context: SpecialistContext,
  options: WindowOptions & { privilegedActions?: string[]; repeatedDenialThreshold?: number } = {},
): Promise<SpecialistResult<AuditReport & { unsupported: UnsupportedAnalysis[] }>> {
  return runSpecialist(
    {
      specialist: "AUDIT_INTELLIGENCE",
      operation: "GENERATE_REPORT",
      kind: "ANALYSIS",
      permission: "audit:log.read",
      version: AUDIT_INTEL_VERSION,
      riskClass: "HIGH",
    },
    context,
    async (scope) => {
      if (!scope.principal.permissions.has("audit:event.read")) {
        throw new Error("The audit report includes event data and requires audit:event.read.");
      }

      const window = resolveWindow(options.window);
      const records = await loadAuditRecords(scope.tenantId, window);
      const { events, withheld } = await loadEvents(scope.tenantId, window, scope.principal.clearance);

      const failures = failedActionAnalysis(records, {
        repeatedDenialThreshold: options.repeatedDenialThreshold,
      });
      const privileged = privilegedActionAnalysis(records, options.privilegedActions ?? []);
      const quality = auditDataQuality(records, events, { asOf: window.to });
      const chain = inspectEvidenceChain(
        records.map((r) => ({ sequence: r.sequence, hash: r.hash, prevHash: r.prevHash })),
      );
      const correlation = correlate(records, events);

      const outcomeCounts: Record<string, number> = {};
      const actionCounts = new Map<string, number>();
      for (const r of records) {
        outcomeCounts[r.outcome] = (outcomeCounts[r.outcome] ?? 0) + 1;
        actionCounts.set(r.action, (actionCounts.get(r.action) ?? 0) + 1);
      }

      const observations: AuditObservation[] = [
        ...failures.observations,
        ...privileged.observations,
        ...quality.observations,
        ...correlation.observations,
      ];

      if (records.length === 0) {
        observations.push({
          code: "EMPTY_WINDOW",
          basis: "OBSERVED",
          subjectType: "TRACE",
          subjectId: `${window.from}..${window.to}`,
          detail:
            `No audit records exist for tenant ${scope.tenantId} between ${window.from} and ${window.to}. ` +
            "An empty window is an absence of recorded activity in this scope, not assurance that nothing happened.",
          advisoryOnly: true,
        });
      }

      return {
        data: {
          window,
          tenantId: scope.tenantId,
          legalEntityId: scope.legalEntityId,
          auditRecordCount: records.length,
          eventCount: events.length,
          actorCount: new Set(records.map((r) => r.actorUserId ?? "__NO_ACTOR__")).size,
          outcomeCounts,
          topActions: [...actionCounts.entries()]
            .map(([action, count]) => ({ action, count }))
            .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action))
            .slice(0, 10),
          observations,
          evidenceChain: chain,
          withheldEventCount: withheld,
          basis: records.length === 0 ? ("DATA_NOT_AVAILABLE" as const) : ("DERIVED" as const),
          explanation: [
            `${records.length} audit record(s) and ${events.length} event(s) between ${window.from} and ${window.to}.`,
            ...withheldNote(withheld),
          ],
          unsupported: unsupportedAnalyses(),
        },
        explanation: [
          `${records.length} audit record(s) and ${events.length} event(s) between ${window.from} and ${window.to}.`,
          ...withheldNote(withheld),
          `${observations.filter((o) => o.basis === "POTENTIAL_ANOMALY").length} observation(s) flagged POTENTIAL_ANOMALY for human review. None is a finding.`,
          "Three analyses are explicitly unsupported by the substrate and are reported as refusals rather than omitted.",
          "This report is intelligence. It freezes nothing, revokes nothing and remediates nothing.",
        ],
        provenance: {
          sources: [
            ...records.map((r) => ({ type: "AUDIT_RECORD", id: r.id })),
            ...events.map((e) => ({ type: "EVENT", id: e.id })),
          ],
          assumptions: [],
          blockedBy: [],
        },
      };
    },
  );
}

/** The analyses this substrate cannot support, as explicit refusals. */
export async function reportUnsupportedAnalyses(
  context: SpecialistContext,
): Promise<SpecialistResult<{ unsupported: UnsupportedAnalysis[] }>> {
  return runSpecialist(
    {
      specialist: "AUDIT_INTELLIGENCE",
      operation: "REPORT_UNSUPPORTED",
      kind: "READ",
      permission: "audit:log.read",
      version: AUDIT_INTEL_VERSION,
      riskClass: "LOW",
    },
    context,
    async () => ({
      data: { unsupported: unsupportedAnalyses() },
      explanation: [
        "These analyses are commonly expected of an audit module and are deliberately NOT provided, " +
        "because the substrate cannot support them honestly.",
      ],
      provenance: { sources: [], assumptions: [], blockedBy: [] },
    }),
  );
}
