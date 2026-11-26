/**
 * NOELIA — INSTITUTIONAL DECISION MEMORY.
 *
 * Distinguishes carefully between two different things that are easily
 * conflated:
 *
 *   1. `ai_decisions` (existing) records what NOELIA **said** — an AI evidence
 *      row, with policy decision, tools used and epistemic classification.
 *   2. `noelia_decision_records` (this module) records what the INSTITUTION
 *      **decided** — an authorised human act with rationale, alternatives,
 *      approving body and provenance.
 *
 * NOELIA may READ (2) to maintain institutional continuity. NOELIA may never
 * create, approve or amend (2). A record is written only by an accountable
 * human through the governed action path, and supersession is a CHAIN — a
 * decision is never overwritten and its rationale is never erased.
 */

import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { noeliaDecisionRecords } from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { can } from "@/lib/authz";
import { classificationsAtOrBelow } from "@/lib/constants";
import { ID_PREFIX, newId } from "@/lib/ids";
import type { NoeliaAuthorizedScope } from "@/lib/noelia/types";
import { makeClaim, type NoeliaClaim } from "./reasoning";

export type DecisionMemoryRecord = {
  id: string;
  code: string;
  title: string;
  question: string;
  decision: string;
  rationale: string;
  alternatives: string[];
  evidenceRefs: string[];
  assumptions: string[];
  status: string;
  decidedOn: string;
  decidedByRole: string;
  approvingBody: string | null;
  approvalReference: string | null;
  supersedesId: string | null;
  provenance: string;
  classification: string;
  legalEntityId: string | null;
};

function requireContext(): void {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("NOELIA decision memory requires canonical transaction-scoped tenant context.");
  }
}

function requireRead(principal: Principal) {
  const decision = can(principal, "ai:noelia.query");
  if (!decision.allowed) throw new Error(`Decision memory read denied: ${decision.reason}`);
}

export type DecisionMemoryQuery = {
  principal: Principal;
  scope: NoeliaAuthorizedScope;
  /** Free-text filter over title/question/decision. Substring, not semantic. */
  keyword?: string | null;
  legalEntityId?: string | null;
  /** ISO date bounds on decided_on. */
  from?: string | null;
  to?: string | null;
  includeSuperseded?: boolean;
  limit?: number;
};

/**
 * Retrieve authorized decision history.
 *
 * Continuity rule: by default only EFFECTIVE decisions are returned, because a
 * superseded decision is history, not current authority. Callers asking for
 * history explicitly get the supersession chain.
 */
export async function queryDecisionMemory(
  query: DecisionMemoryQuery,
): Promise<{ records: DecisionMemoryRecord[]; claims: NoeliaClaim[]; truncated: boolean }> {
  requireContext();
  requireRead(query.principal);

  const tenantIds = query.scope.tenantIds;
  if (tenantIds.length === 0) return { records: [], claims: [], truncated: false };

  const allowed = classificationsAtOrBelow(query.principal.clearance);
  const predicates = [
    inArray(noeliaDecisionRecords.tenantId, tenantIds),
    inArray(noeliaDecisionRecords.classification, allowed),
  ];
  if (query.legalEntityId) predicates.push(eq(noeliaDecisionRecords.legalEntityId, query.legalEntityId));
  if (!query.includeSuperseded) predicates.push(eq(noeliaDecisionRecords.status, "EFFECTIVE"));
  if (query.from) predicates.push(gte(noeliaDecisionRecords.decidedOn, query.from));
  if (query.to) predicates.push(lte(noeliaDecisionRecords.decidedOn, query.to));
  if (query.keyword && query.keyword.trim().length > 0) {
    // Escape LIKE metacharacters so a user-supplied '%' cannot widen the scan
    // beyond a literal substring match.
    const escaped = query.keyword.trim().toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const like = `%${escaped}%`;
    predicates.push(
      sql`(lower(${noeliaDecisionRecords.title}) like ${like}
           or lower(${noeliaDecisionRecords.question}) like ${like}
           or lower(${noeliaDecisionRecords.decision}) like ${like})`,
    );
  }

  const limit = Math.min(100, Math.max(1, Math.trunc(query.limit ?? 20)));
  const rows = await db
    .select()
    .from(noeliaDecisionRecords)
    .where(and(...predicates))
    .orderBy(desc(noeliaDecisionRecords.decidedOn))
    .limit(limit + 1);

  const truncated = rows.length > limit;
  const records: DecisionMemoryRecord[] = rows.slice(0, limit).map((row) => ({
    id: row.id,
    code: row.decisionCode,
    title: row.title,
    question: row.question,
    decision: row.decision,
    rationale: row.rationale,
    alternatives: row.alternativesConsidered ?? [],
    evidenceRefs: row.evidenceRefs ?? [],
    assumptions: row.assumptions ?? [],
    status: row.status,
    decidedOn: row.decidedOn,
    decidedByRole: row.decidedByRole,
    approvingBody: row.approvingBody,
    approvalReference: row.approvalReference,
    supersedesId: row.supersedesId,
    provenance: row.provenance,
    classification: row.classification,
    legalEntityId: row.legalEntityId,
  }));

  const claims: NoeliaClaim[] = records.map((record, index) =>
    makeClaim({
      id: `decision-${index + 1}`,
      kind: "FACT",
      statement: `${record.code} — ${record.title}: ${record.decision} (decided ${record.decidedOn} by ${record.decidedByRole}).`,
      brain: "INSTITUTIONAL",
      evidence: [`noelia_decision_records:${record.id}`],
      confidence: 1,
    }),
  );

  if (records.length === 0) {
    claims.push(
      makeClaim({
        id: "decision-none",
        kind: "UNKNOWN",
        statement: "No recorded institutional decision matches within the caller's authorized scope.",
        brain: "INSTITUTIONAL",
        evidence: [],
        confidence: null,
        limitation:
          "Absence in this environment is not evidence that no decision was taken; the decision register may not be populated.",
      }),
    );
  }

  return { records, claims, truncated };
}

/** Fetch a single supersession chain, newest first, bounded. */
export async function decisionLineage(input: {
  principal: Principal;
  scope: NoeliaAuthorizedScope;
  decisionCode: string;
}): Promise<DecisionMemoryRecord[]> {
  requireContext();
  requireRead(input.principal);
  const tenantIds = input.scope.tenantIds;
  if (tenantIds.length === 0) return [];
  const allowed = classificationsAtOrBelow(input.principal.clearance);

  const chain: DecisionMemoryRecord[] = [];
  let cursorCode: string | null = input.decisionCode;
  const seen = new Set<string>();
  for (let i = 0; i < 10 && cursorCode; i += 1) {
    if (seen.has(cursorCode)) break;
    seen.add(cursorCode);
    const [row] = await db
      .select()
      .from(noeliaDecisionRecords)
      .where(
        and(
          inArray(noeliaDecisionRecords.tenantId, tenantIds),
          inArray(noeliaDecisionRecords.classification, allowed),
          eq(noeliaDecisionRecords.decisionCode, cursorCode),
        ),
      )
      .limit(1);
    if (!row) break;
    chain.push({
      id: row.id,
      code: row.decisionCode,
      title: row.title,
      question: row.question,
      decision: row.decision,
      rationale: row.rationale,
      alternatives: row.alternativesConsidered ?? [],
      evidenceRefs: row.evidenceRefs ?? [],
      assumptions: row.assumptions ?? [],
      status: row.status,
      decidedOn: row.decidedOn,
      decidedByRole: row.decidedByRole,
      approvingBody: row.approvingBody,
      approvalReference: row.approvalReference,
      supersedesId: row.supersedesId,
      provenance: row.provenance,
      classification: row.classification,
      legalEntityId: row.legalEntityId,
    });
    if (!row.supersedesId) break;
    const [prior] = await db
      .select({ code: noeliaDecisionRecords.decisionCode })
      .from(noeliaDecisionRecords)
      .where(and(inArray(noeliaDecisionRecords.tenantId, tenantIds), eq(noeliaDecisionRecords.id, row.supersedesId)))
      .limit(1);
    cursorCode = prior?.code ?? null;
  }
  return chain;
}

export type DecisionRecordInput = {
  tenantId: string;
  legalEntityId?: string | null;
  countryCode?: string | null;
  classification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "HIGHLY_RESTRICTED";
  decisionCode: string;
  title: string;
  question: string;
  decision: string;
  rationale: string;
  alternativesConsidered: string[];
  evidenceRefs: string[];
  assumptions: string[];
  decidedOn: string;
  decidedBy: string;
  decidedByRole: string;
  approvingBody?: string | null;
  approvalReference?: string | null;
  supersedesId?: string | null;
  provenance: string;
  createdBy?: string | null;
  now?: Date;
};

/**
 * Build (but do not persist) a validated decision-record row.
 *
 * Persistence happens ONLY from the governed action executor after human
 * approval. Keeping validation here means there is exactly one place that can
 * define what a legible institutional decision is.
 */
export function prepareDecisionRecord(
  input: DecisionRecordInput,
): { ok: true; row: typeof noeliaDecisionRecords.$inferInsert; id: string } | { ok: false; reason: string } {
  if (input.rationale.trim().length < 10) {
    return { ok: false, reason: "An institutional decision requires a recorded rationale (>= 10 characters)." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.decidedOn)) {
    return { ok: false, reason: "decidedOn must be an ISO date (YYYY-MM-DD)." };
  }
  if (input.decidedOn > (input.now ?? new Date()).toISOString().slice(0, 10)) {
    return { ok: false, reason: "A decision cannot be recorded with a future decision date." };
  }
  if (!input.decidedByRole.trim()) {
    return { ok: false, reason: "An institutional decision must name the accountable role." };
  }
  if (!input.decidedBy.trim()) {
    return { ok: false, reason: "An institutional decision must name the accountable human." };
  }
  if (input.decisionCode.trim().length < 3) {
    return { ok: false, reason: "decisionCode must be at least 3 characters." };
  }
  if (!input.provenance.trim()) {
    return { ok: false, reason: "A decision record must state its provenance (meeting, minute, resolution)." };
  }

  const id = newId(ID_PREFIX.decisionRecord);
  return {
    ok: true,
    id,
    row: {
      id,
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId ?? null,
      countryCode: input.countryCode ?? null,
      classification: input.classification,
      decisionCode: input.decisionCode.trim().toUpperCase(),
      title: input.title.trim(),
      question: input.question.trim(),
      decision: input.decision.trim(),
      rationale: input.rationale.trim(),
      alternativesConsidered: input.alternativesConsidered,
      evidenceRefs: input.evidenceRefs,
      assumptions: input.assumptions,
      status: "EFFECTIVE",
      decidedOn: input.decidedOn,
      decidedBy: input.decidedBy,
      decidedByRole: input.decidedByRole.trim(),
      approvingBody: input.approvingBody ?? null,
      approvalReference: input.approvalReference ?? null,
      supersedesId: input.supersedesId ?? null,
      provenance: input.provenance.trim(),
      createdBy: input.createdBy ?? null,
    },
  };
}

/** Count of effective decisions visible to the caller — used by the Command Centre. */
export async function decisionMemorySummary(input: {
  principal: Principal;
  scope: NoeliaAuthorizedScope;
}): Promise<{ effective: number; superseded: number; earliest: string | null }> {
  requireContext();
  requireRead(input.principal);
  const tenantIds = input.scope.tenantIds;
  if (tenantIds.length === 0) return { effective: 0, superseded: 0, earliest: null };
  const allowed = classificationsAtOrBelow(input.principal.clearance);
  const rows = await db
    .select({ status: noeliaDecisionRecords.status, decidedOn: noeliaDecisionRecords.decidedOn })
    .from(noeliaDecisionRecords)
    .where(
      and(
        inArray(noeliaDecisionRecords.tenantId, tenantIds),
        inArray(noeliaDecisionRecords.classification, allowed),
        isNull(noeliaDecisionRecords.supersedesId),
      ),
    )
    .limit(5000);
  const effective = rows.filter((r) => r.status === "EFFECTIVE").length;
  const superseded = rows.filter((r) => r.status === "SUPERSEDED").length;
  const earliest = rows.reduce<string | null>(
    (min, r) => (min === null || r.decidedOn < min ? r.decidedOn : min),
    null,
  );
  return { effective, superseded, earliest };
}
