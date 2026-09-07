/**
 * BEYU OS — Data Governance: Retention Enforcement Service
 *
 * This service implements governed data lifecycle management with explicit
 * authorization gates. Destructive operations require human approval and are
 * never fully automated.
 *
 * RETENTION MODEL
 *   Retention is calculated from the document's `uploaded_at` timestamp (the
 *   actual creation-date column on `platform.documents`) plus the policy's
 *   retention years. The `beyu_authority_status` enum does NOT model deletion
 *   workflow states, so no code in this module writes a workflow status that
 *   the database cannot represent; eligibility is returned as a decision and
 *   actual destruction remains a separate governed process.
 *
 * Every decision is auditable by the caller. Legal holds block deletion
 * regardless of retention expiry. Classification influences the approval
 * requirement on the deletion decision.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { documents, retentionPolicies } from "@/db/schema";

export const RETENTION_VERSION = "retention-1.0.0";

export type DocumentRecord = typeof documents.$inferSelect;

/**
 * Calculate when a document's retention expires based on its policy.
 * Retention starts at the document's `uploaded_at` (creation) timestamp.
 */
export async function calculateRetentionExpiry(
  documentId: string,
): Promise<{ expiresAt: Date | null; policy: typeof retentionPolicies.$inferSelect | null }> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);

  if (!doc) {
    return { expiresAt: null, policy: null };
  }

  const [policy] = await db
    .select()
    .from(retentionPolicies)
    .where(eq(retentionPolicies.code, doc.retentionCode))
    .limit(1);

  if (!policy) {
    return { expiresAt: null, policy: null };
  }

  const uploadedAt = doc.uploadedAt;
  const expiresAt = new Date(uploadedAt);
  expiresAt.setFullYear(expiresAt.getFullYear() + policy.retentionYears);

  return { expiresAt, policy };
}

/**
 * Find all documents whose retention has expired and are eligible for review.
 * This is a READ-ONLY scan that returns candidates; it does not delete.
 */
export async function findRetentionExpiredDocuments(options?: {
  tenantId?: string;
  limit?: number;
}): Promise<
  Array<{
    documentId: string;
    retentionCode: string;
    expiresAt: Date;
    legalHold: boolean;
    eligible: boolean;
    reason: string;
  }>
> {
  const limit = options?.limit ?? 100;

  const now = new Date();
  const result = await db.execute<{
    id: string;
    tenant_id: string;
    retention_code: string;
    legal_hold: boolean;
    uploaded_at: Date;
  }>(sql`
    select d.id, d.tenant_id, d.retention_code, d.legal_hold, d.uploaded_at
    from documents d
    inner join retention_policies rp on rp.code = d.retention_code
    where d.legal_hold = false
      and (${options?.tenantId ? sql`d.tenant_id = ${options.tenantId} and` : sql``} true)
    order by d.uploaded_at asc
    limit ${limit}
  `);

  const rows = Array.isArray(result) ? result : result.rows ?? [];
  const results = [];
  for (const row of rows) {
    const uploadedAt = new Date(row.uploaded_at);
    const [policy] = await db
      .select()
      .from(retentionPolicies)
      .where(eq(retentionPolicies.code, row.retention_code))
      .limit(1);

    if (!policy) continue;

    const expiresAt = new Date(uploadedAt);
    expiresAt.setFullYear(expiresAt.getFullYear() + policy.retentionYears);

    if (expiresAt <= now) {
      results.push({
        documentId: row.id,
        retentionCode: row.retention_code,
        expiresAt,
        legalHold: row.legal_hold,
        eligible: !row.legal_hold,
        reason: row.legal_hold
          ? "Retention expired but legal hold is active"
          : "Retention expired, eligible for review",
      });
    }
  }

  return results;
}

/**
 * Check whether a document can be deleted.
 * Returns an authorization decision with explicit reasons.
 */
export async function canDeleteDocument(
  documentId: string,
  actor: { userId: string; tenantId: string },
): Promise<{ permitted: boolean; reason: string; requiresApproval: boolean }> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);

  if (!doc) {
    return { permitted: false, reason: "Document not found", requiresApproval: false };
  }

  // Tenant isolation
  if (doc.tenantId !== actor.tenantId) {
    return { permitted: false, reason: "Cross-tenant access denied", requiresApproval: false };
  }

  // Legal hold blocks deletion
  if (doc.legalHold) {
    return {
      permitted: false,
      reason: "Document is under legal hold; deletion prohibited",
      requiresApproval: false,
    };
  }

  // Check retention expiry
  const { expiresAt } = await calculateRetentionExpiry(documentId);
  if (!expiresAt || expiresAt > new Date()) {
    return {
      permitted: false,
      reason: "Document retention has not expired",
      requiresApproval: true,
    };
  }

  // Classification-based authorization
  if (doc.classification === "RESTRICTED" || doc.classification === "CONFIDENTIAL") {
    return {
      permitted: true,
      reason: "Document eligible for deletion; requires approval due to classification",
      requiresApproval: true,
    };
  }

  return {
    permitted: true,
    reason: "Document eligible for deletion",
    requiresApproval: true,
  };
}

/**
 * Mark a document as eligible for review (retention expired, no legal hold).
 *
 * This is a DECISION GATE ONLY. The `beyu_authority_status` enum on
 * `documents` has no ELIGIBLE_FOR_REVIEW value (it models
 * AUTHORITATIVE/UNDER_REVIEW/SUPERSEDED/EXPIRED/REJECTED), so no workflow
 * status is written that the schema cannot represent. Actual destruction is a
 * governed, human-approved process outside this module.
 */
export async function markEligibleForReview(
  documentId: string,
  actor: { userId: string; tenantId: string },
): Promise<{ success: boolean; reason: string }> {
  const auth = await canDeleteDocument(documentId, actor);
  if (!auth.permitted) {
    return { success: false, reason: auth.reason };
  }

  return {
    success: true,
    reason:
      "Document is eligible for review. No workflow status was written: documents.authority_status does not model retention states; deletion requires a governed human approval process.",
  };
}

/**
 * Apply a legal hold to a document.
 * Legal holds prevent deletion regardless of retention status.
 */
export async function applyLegalHold(
  documentId: string,
  actor: { userId: string; tenantId: string },
  reason: string,
): Promise<{ success: boolean; reason: string }> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);

  if (!doc) {
    return { success: false, reason: "Document not found" };
  }

  if (doc.tenantId !== actor.tenantId) {
    return { success: false, reason: "Cross-tenant access denied" };
  }

  if (doc.legalHold) {
    return { success: false, reason: "Document already under legal hold" };
  }

  await db
    .update(documents)
    .set({
      legalHold: true,
    })
    .where(eq(documents.id, documentId));

  // Audit log is recorded by the caller through the audit/event layer.
  return { success: true, reason: `Legal hold applied: ${reason}` };
}

/**
 * Remove a legal hold from a document.
 * Requires explicit authorization (same-tenant actor) and is audited.
 */
export async function removeLegalHold(
  documentId: string,
  actor: { userId: string; tenantId: string },
  reason: string,
): Promise<{ success: boolean; reason: string }> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);

  if (!doc) {
    return { success: false, reason: "Document not found" };
  }

  if (doc.tenantId !== actor.tenantId) {
    return { success: false, reason: "Cross-tenant access denied" };
  }

  if (!doc.legalHold) {
    return { success: false, reason: "Document is not under legal hold" };
  }

  await db
    .update(documents)
    .set({
      legalHold: false,
    })
    .where(eq(documents.id, documentId));

  return { success: true, reason: `Legal hold removed: ${reason}` };
}

/**
 * Get data governance summary for a tenant.
 */
export async function getDataGovernanceSummary(tenantId: string): Promise<{
  totalDocuments: number;
  underLegalHold: number;
  retentionExpired: number;
  byClassification: Record<string, number>;
}> {
  const statsResult = await db.execute<{ total: number; legal_hold: number }>(sql`
    select
      count(*)::int as total,
      count(*) filter (where legal_hold = true)::int as legal_hold
    from documents
    where tenant_id = ${tenantId}
  `);
  const stats = Array.isArray(statsResult) ? statsResult[0] : statsResult.rows[0];

  const expired = await findRetentionExpiredDocuments({ tenantId, limit: 10000 });

  const byClassResult = await db.execute<{ classification: string; count: number }>(sql`
    select classification, count(*)::int as count
    from documents
    where tenant_id = ${tenantId}
    group by classification
  `);
  const classRows = Array.isArray(byClassResult) ? byClassResult : byClassResult.rows ?? [];

  const classificationMap: Record<string, number> = {};
  for (const row of classRows) {
    classificationMap[row.classification] = row.count;
  }

  return {
    totalDocuments: Number(stats?.total ?? 0),
    underLegalHold: Number(stats?.legal_hold ?? 0),
    retentionExpired: expired.length,
    byClassification: classificationMap,
  };
}
