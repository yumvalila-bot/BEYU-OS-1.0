/**
 * Feedback Platform — governed feedback, surveys, ratings, complaints.
 *
 * Flow: COMMUNICATION → FEEDBACK REQUEST → RESPONSE → FEEDBACK RECORD →
 * CLASSIFICATION → ROUTING → ACTION → RESOLUTION → FOLLOW-UP
 *
 * Preserve original feedback. AI analysis remains attributable and auditable.
 * Noelia/HIVE may assist with categorization, summarization, topic extraction,
 * urgency detection, trend detection, suggested routing, suggested response.
 * Do NOT silently alter original feedback.
 */

import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { communicationFeedback, communicationCases } from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { recordAudit, publishEvent } from "@/lib/audit";
import type { FeedbackType, FeedbackStatus } from "./types";

export type FeedbackRecord = typeof communicationFeedback.$inferSelect;

export async function createFeedback(input: {
  tenantId: string;
  messageId?: string | null;
  conversationId?: string | null;
  contactId?: string | null;
  caseId?: string | null;
  type: FeedbackType;
  rating?: number | null;
  subject?: string | null;
  body: string;
  category?: string | null;
  urgency?: string;
  classification?: string;
  correlationId: string;
  causationId?: string | null;
  createdBy: string;
}): Promise<FeedbackRecord> {
  const id = newId("FDBK" as keyof typeof ID_PREFIX);
  const [row] = await db
    .insert(communicationFeedback)
    .values({
      id,
      tenantId: input.tenantId,
      messageId: input.messageId,
      conversationId: input.conversationId,
      contactId: input.contactId,
      caseId: input.caseId,
      type: input.type,
      rating: input.rating,
      subject: input.subject,
      body: input.body,
      category: input.category,
      urgency: input.urgency ?? "NORMAL",
      classification: (input.classification as never) ?? "INTERNAL",
      status: "SUBMITTED",
      correlationId: input.correlationId,
      causationId: input.causationId,
      createdBy: input.createdBy,
    })
    .returning();

  await recordAudit({
    tenantId: input.tenantId,
    actorUserId: input.createdBy,
    action: "communications.feedback.submitted",
    objectType: "FEEDBACK",
    objectId: id,
    outcome: "SUCCESS",
    newValue: {
      type: input.type,
      rating: input.rating,
      category: input.category,
      conversationId: input.conversationId,
      contactId: input.contactId,
    },
  });

  await publishEvent({
    type: "FEEDBACK_SUBMITTED",
    source: "BEYU_OS",
    domain: "communications",
    operation: "feedback.submit",
    destinationDomain: null,
    tenantId: input.tenantId,
    legalEntityId: null,
    subjectType: "FEEDBACK",
    subjectId: id,
    actorUserId: input.createdBy,
    classification: (input.classification as never) ?? "INTERNAL",
    payload: {
      feedbackId: id,
      type: input.type,
      rating: input.rating,
      conversationId: input.conversationId,
      contactId: input.contactId,
      correlationId: input.correlationId,
    },
    traceId: input.correlationId,
    correlationId: input.correlationId,
    causationId: input.causationId ?? null,
    authorityContext: null,
    policyVersion: null,
  });

  return row;
}

export async function classifyFeedback(
  id: string,
  tenantId: string,
  classification: { category: string; urgency: string; assignedToRole?: string; assignedToUserId?: string },
  classifiedBy: string,
): Promise<FeedbackRecord | null> {
  const [row] = await db
    .update(communicationFeedback)
    .set({
      category: classification.category,
      urgency: classification.urgency,
      assignedToRole: classification.assignedToRole,
      assignedToUserId: classification.assignedToUserId,
      status: "CLASSIFIED",
      updatedAt: new Date(),
    })
    .where(and(eq(communicationFeedback.id, id), eq(communicationFeedback.tenantId, tenantId)))
    .returning();
  return row ?? null;
}

export async function analyzeFeedbackWithAI(
  id: string,
  tenantId: string,
  analysis: Record<string, unknown>,
  aiModel: string,
): Promise<FeedbackRecord | null> {
  // AI analysis is additive — never overwrites original body
  const [row] = await db
    .update(communicationFeedback)
    .set({
      aiAnalysis: analysis,
      aiModel,
      aiAnalyzedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(communicationFeedback.id, id), eq(communicationFeedback.tenantId, tenantId)))
    .returning();

  if (row) {
    await recordAudit({
      tenantId,
      actorType: "AI",
      action: "communications.feedback.analyzed",
      objectType: "FEEDBACK",
      objectId: id,
      outcome: "SUCCESS",
      aiVersion: aiModel,
      newValue: {
        analysis,
        originalPreserved: true,
      },
    });
  }

  return row ?? null;
}

export async function resolveFeedback(
  id: string,
  tenantId: string,
  resolvedBy: string,
): Promise<FeedbackRecord | null> {
  const [row] = await db
    .update(communicationFeedback)
    .set({
      status: "RESOLVED",
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(communicationFeedback.id, id), eq(communicationFeedback.tenantId, tenantId)))
    .returning();
  return row ?? null;
}

export async function listFeedback(
  tenantId: string,
  options?: { type?: string; status?: string; contactId?: string; limit?: number },
) {
  const conditions = [eq(communicationFeedback.tenantId, tenantId)];
  if (options?.type) conditions.push(eq(communicationFeedback.type, options.type));
  if (options?.status) conditions.push(eq(communicationFeedback.status, options.status));
  if (options?.contactId) conditions.push(eq(communicationFeedback.contactId, options.contactId));

  return db
    .select()
    .from(communicationFeedback)
    .where(and(...conditions))
    .orderBy(desc(communicationFeedback.createdAt))
    .limit(options?.limit ?? 50);
}

export async function getFeedbackTrends(tenantId: string): Promise<{
  byType: Record<string, number>;
  byCategory: Record<string, number>;
  byRating: Record<number, number>;
  avgRating: number;
}> {
  const { sql } = await import("drizzle-orm");
  const rows = await db.execute(
    sql`SELECT type, category, rating, COUNT(*) as cnt, AVG(rating) as avg_rating
        FROM communication_feedback
        WHERE tenant_id = ${tenantId}
        GROUP BY type, category, rating`,
  );

  const byType: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byRating: Record<number, number> = {};
  let totalRating = 0;
  let ratingCount = 0;

  for (const row of rows.rows as unknown as { type: string; category: string | null; rating: number | null; cnt: string; avg_rating: string }[]) {
    const cnt = Number(row.cnt);
    byType[row.type] = (byType[row.type] ?? 0) + cnt;
    if (row.category) byCategory[row.category] = (byCategory[row.category] ?? 0) + cnt;
    if (row.rating !== null) {
      byRating[row.rating] = (byRating[row.rating] ?? 0) + cnt;
      totalRating += row.rating * cnt;
      ratingCount += cnt;
    }
  }

  return {
    byType,
    byCategory,
    byRating,
    avgRating: ratingCount > 0 ? totalRating / ratingCount : 0,
  };
}
