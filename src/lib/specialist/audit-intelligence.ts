/**
 * BEYU OS — Audit Intelligence specialist (Phase 7B, Priority 2).
 *
 * Analyses the existing append-only audit and event substrate to surface control failures,
 * anomalies, missing evidence and segregation-of-duties concerns.
 *
 * WHY THIS IS SAFE TO BUILD WITHOUT RATIFICATION. Everything here is observation over records that
 * already exist. Detecting that "two postings share an actor and an amount" requires no accounting
 * policy. Deciding what that MEANS financially does — and this module never does that.
 *
 * WHAT IT MAY NEVER DO. It may not authorise a journal posting, capital execution, treasury
 * settlement, tax treatment or accounting recognition. It produces FINDINGS. A finding is an
 * observation with evidence and a severity; it is never an instruction. Remediation of a finding
 * still passes through the ordinary authority gates.
 *
 * IMMUTABILITY. This module only ever SELECTs from `audit_log` and `enterprise_events`. Those
 * ledgers reject UPDATE, DELETE and TRUNCATE (migrations 0001 and 0008), and nothing here attempts
 * otherwise.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, enterpriseEvents } from "@/db/schema";
import { bandRisk, runSpecialist, type SpecialistContext, type SpecialistResult } from "./platform";

export const AUDIT_INTELLIGENCE_VERSION = "audit-intel-1.0.0";

export type FindingSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AuditFinding = {
  /** Stable code so a finding can be tracked across runs. */
  code: string;
  title: string;
  severity: FindingSeverity;
  /** Score 0-100 driving the severity band. */
  score: number;
  /** Audit or event rows evidencing the finding. Immutable references. */
  evidence: Array<{ type: string; id: string }>;
  explanation: string;
  /** What a human must do. Never executed automatically. */
  recommendedAction: string;
  /** True when acting on this finding would require governance authority. */
  requiresAuthority: boolean;
};

export type ControlTestResult = {
  controlCode: string;
  description: string;
  status: "PASS" | "FAIL" | "NOT_TESTABLE";
  detail: string;
};

export type AuditScanOutput = {
  windowDays: number;
  auditRecordsExamined: number;
  eventRecordsExamined: number;
  findings: AuditFinding[];
  controls: ControlTestResult[];
  /** Highest severity observed, or null when clean. */
  highestSeverity: FindingSeverity | null;
};

type AuditRow = {
  id: string;
  action: string;
  actorUserId: string | null;
  objectType: string;
  objectId: string;
  outcome: string | null;
  occurredAt: Date | string;
};

/**
 * Pure detection logic over already-fetched rows. Exported so detection can be unit-tested
 * deterministically without a database, and so the same rules can be replayed over an evidence
 * set during an external audit.
 */
export function detectFindings(rows: AuditRow[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // --- Detector 1: repeated DENIED outcomes for one actor. Possible probing or misconfiguration.
  const deniedByActor = new Map<string, AuditRow[]>();
  for (const row of rows) {
    if (row.outcome !== "DENIED" || !row.actorUserId) continue;
    const list = deniedByActor.get(row.actorUserId) ?? [];
    list.push(row);
    deniedByActor.set(row.actorUserId, list);
  }
  for (const [actor, list] of deniedByActor) {
    if (list.length < 3) continue;
    const score = Math.min(100, list.length * 12);
    findings.push({
      code: "REPEATED_AUTHORIZATION_DENIAL",
      title: `Actor accumulated ${list.length} denied attempts`,
      severity: bandRisk(score),
      score,
      evidence: list.slice(0, 10).map((r) => ({ type: "AUDIT_LOG", id: r.id })),
      explanation:
        `Actor ${actor} was denied ${list.length} times in the window. This may indicate ` +
        "credential misuse, a misconfigured role, or legitimate exploration of the UI.",
      recommendedAction: "Review the actor's role assignments and confirm the denials were expected.",
      requiresAuthority: false,
    });
  }

  // --- Detector 2: privileged action outside a governed sequence.
  const privileged = rows.filter((r) => /ledger\.post|capital\.|treasury\./.test(r.action));
  if (privileged.length > 0) {
    const score = Math.min(100, 40 + privileged.length * 5);
    findings.push({
      code: "PRIVILEGED_FINANCIAL_ACTION_OBSERVED",
      title: `${privileged.length} privileged financial action(s) recorded`,
      severity: bandRisk(score),
      score,
      evidence: privileged.slice(0, 10).map((r) => ({ type: "AUDIT_LOG", id: r.id })),
      explanation:
        "Financial actions were recorded in the window. Each must trace to an activated capability " +
        "and an approved governance decision.",
      recommendedAction: "Confirm each action's authority reference against the decision registry.",
      requiresAuthority: true,
    });
  }

  // --- Detector 3: segregation of duties — same actor both producing and approving.
  const byObject = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.actorUserId) continue;
    const key = `${row.objectType}:${row.objectId}`;
    const actors = byObject.get(key) ?? new Set<string>();
    actors.add(row.actorUserId);
    byObject.set(key, actors);
  }
  const soloApprovals = [...byObject.entries()].filter(([key, actors]) => {
    if (actors.size !== 1) return false;
    const related = rows.filter((r) => `${r.objectType}:${r.objectId}` === key);
    const hasCreate = related.some((r) => /propose|create|submit|post/.test(r.action));
    const hasApprove = related.some((r) => /approve|decide|authorize/.test(r.action));
    return hasCreate && hasApprove;
  });
  for (const [key] of soloApprovals) {
    findings.push({
      code: "SEGREGATION_OF_DUTIES_CONCERN",
      title: `Single actor both initiated and approved ${key}`,
      severity: "HIGH",
      score: 70,
      evidence: rows
        .filter((r) => `${r.objectType}:${r.objectId}` === key)
        .slice(0, 10)
        .map((r) => ({ type: "AUDIT_LOG", id: r.id })),
      explanation:
        "The same actor appears as both initiator and approver for this object. Whether that is " +
        "permitted depends on the maker/checker decision (P9), which is unratified.",
      recommendedAction: "Refer to the Group CFO; the maker/checker model is decision P9.",
      requiresAuthority: true,
    });
  }

  return findings.sort((a, b) => b.score - a.score);
}

/**
 * Tests structural controls that can be verified without any accounting policy.
 * These are all POLICY-INDEPENDENT: they hold under any ratified accounting decision.
 */
async function testStructuralControls(): Promise<ControlTestResult[]> {
  const results: ControlTestResult[] = [];

  const triggerRows = (await db.execute(sql`
    select count(*)::int total,
           count(*) filter (where t.tgenabled <> 'O')::int disabled
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal
  `)) as unknown as { rows: Array<{ total: number; disabled: number }> };
  const triggers = (triggerRows.rows ?? [])[0];
  results.push({
    controlCode: "CTL-STRUCT-TRIGGERS",
    description: "All database integrity triggers are installed and armed",
    status: triggers && triggers.disabled === 0 && triggers.total > 0 ? "PASS" : "FAIL",
    detail: `${triggers?.total ?? 0} trigger(s) installed, ${triggers?.disabled ?? 0} disabled.`,
  });

  const orphanRows = (await db.execute(sql`
    select count(*)::int n
    from journal_lines jl left join journal_entries je on je.id = jl.entry_id
    where je.id is null
  `)) as unknown as { rows: Array<{ n: number }> };
  const orphans = (orphanRows.rows ?? [])[0]?.n ?? 0;
  results.push({
    controlCode: "CTL-STRUCT-ORPHANS",
    description: "No journal line exists without a parent entry",
    status: orphans === 0 ? "PASS" : "FAIL",
    detail: `${orphans} orphaned line(s).`,
  });

  const unbalancedRows = (await db.execute(sql`
    select count(*)::int n from (
      select entry_id from journal_lines
      group by entry_id
      having coalesce(sum(debit),0) <> coalesce(sum(credit),0)
    ) x
  `)) as unknown as { rows: Array<{ n: number }> };
  const unbalanced = (unbalancedRows.rows ?? [])[0]?.n ?? 0;
  results.push({
    controlCode: "CTL-STRUCT-BALANCE",
    description: "Every journal entry balances",
    status: unbalanced === 0 ? "PASS" : "FAIL",
    detail: `${unbalanced} unbalanced entr(ies).`,
  });

  const provenanceRows = (await db.execute(sql`
    select count(*)::int n
    from governance_decision_registry d
    left join resolutions r on r.id = d.resolution_id
    where d.resolution_id is not null and r.id is null
  `)) as unknown as { rows: Array<{ n: number }> };
  const danglingProvenance = (provenanceRows.rows ?? [])[0]?.n ?? 0;
  results.push({
    controlCode: "CTL-STRUCT-PROVENANCE",
    description: "No governance decision cites a nonexistent resolution",
    status: danglingProvenance === 0 ? "PASS" : "FAIL",
    detail: `${danglingProvenance} dangling citation(s).`,
  });

  return results;
}

/**
 * Governed audit scan. Read-only over immutable ledgers; declares no capability because it
 * produces findings, never execution.
 */
export async function scanAuditIntelligence(
  context: SpecialistContext,
  options: { windowDays?: number } = {},
): Promise<SpecialistResult<AuditScanOutput>> {
  const windowDays = options.windowDays ?? 30;
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 3650) {
    throw new Error("windowDays must be an integer between 1 and 3650.");
  }

  return runSpecialist<AuditScanOutput>(
    {
      specialist: "AUDIT_INTELLIGENCE",
      operation: "SCAN",
      kind: "ANALYSIS",
      permission: "audit:log.read",
      version: AUDIT_INTELLIGENCE_VERSION,
      riskClass: "MEDIUM",
    },
    context,
    async (scope) => {
      const since = new Date(Date.now() - windowDays * 86_400_000);

      // Tenant-scoped read. Cross-tenant audit rows are never visible here.
      const auditRows = await db
        .select({
          id: auditLog.id,
          action: auditLog.action,
          actorUserId: auditLog.actorUserId,
          objectType: auditLog.objectType,
          objectId: auditLog.objectId,
          outcome: auditLog.outcome,
          occurredAt: auditLog.occurredAt,
        })
        .from(auditLog)
        .where(and(eq(auditLog.tenantId, scope.tenantId), gte(auditLog.occurredAt, since)))
        .orderBy(desc(auditLog.occurredAt))
        .limit(5000);

      const eventCountRows = (await db.execute(sql`
        select count(*)::int n from enterprise_events
        where tenant_id = ${scope.tenantId} and occurred_at >= ${since.toISOString()}
      `)) as unknown as { rows: Array<{ n: number }> };
      const eventCount = (eventCountRows.rows ?? [])[0]?.n ?? 0;

      const findings = detectFindings(auditRows as AuditRow[]);
      const controls = await testStructuralControls();

      const severityRank: Record<FindingSeverity, number> = {
        LOW: 1,
        MEDIUM: 2,
        HIGH: 3,
        CRITICAL: 4,
      };
      const highestSeverity =
        findings.length === 0
          ? null
          : findings.reduce<FindingSeverity>(
              (worst, f) => (severityRank[f.severity] > severityRank[worst] ? f.severity : worst),
              "LOW",
            );

      return {
        data: {
          windowDays,
          auditRecordsExamined: auditRows.length,
          eventRecordsExamined: eventCount,
          findings,
          controls,
          highestSeverity,
        },
        explanation: [
          `Examined ${auditRows.length} audit record(s) and ${eventCount} event(s) over ${windowDays} day(s), scoped to this tenant.`,
          `${findings.length} finding(s) raised by ${3} detectors; ${controls.filter((c) => c.status === "PASS").length}/${controls.length} structural controls passed.`,
          "Findings are observations with evidence. They authorise nothing; remediation passes through the ordinary authority gates.",
        ],
        provenance: {
          sources: auditRows.slice(0, 25).map((r) => ({ type: "AUDIT_LOG", id: r.id })),
          assumptions: [
            "Audit and event ledgers are append-only and therefore trustworthy as evidence.",
            "Detection thresholds are structural heuristics, not ratified control standards.",
          ],
          blockedBy: findings.some((f) => f.requiresAuthority) ? ["P9"] : [],
        },
      };
    },
  );
}

/** Read-only verification that the immutable ledgers remain append-only. */
export async function verifyLedgerImmutability(): Promise<{
  auditTriggers: number;
  eventTriggers: number;
  intact: boolean;
}> {
  const rows = (await db.execute(sql`
    select
      count(*) filter (where c.relname = 'audit_log' and t.tgenabled = 'O')::int audit_triggers,
      count(*) filter (where c.relname = 'enterprise_events' and t.tgenabled = 'O')::int event_triggers
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal and t.tgname like '%immutable%'
  `)) as unknown as { rows: Array<{ audit_triggers: number; event_triggers: number }> };
  const r = (rows.rows ?? [])[0] ?? { audit_triggers: 0, event_triggers: 0 };
  return {
    auditTriggers: r.audit_triggers,
    eventTriggers: r.event_triggers,
    // Two per table: one for UPDATE/DELETE, one for TRUNCATE.
    intact: r.audit_triggers >= 2 && r.event_triggers >= 2,
  };
}

export { enterpriseEvents };
