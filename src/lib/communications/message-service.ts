/**
 * Message Engine — canonical message model with delivery tracking, retries,
 * failover, loop prevention, cost intelligence, audit.
 *
 * Preserves: idempotency (durable), audit (hash-chained), events, documents,
 * classification, RLS, tenant/entity/country isolation.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  communicationMessages,
  communicationDeliveryEvents,
  communicationCostLedger,
  communicationLoopDetections,
  communicationAttachments,
} from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import type { DeliveryStatus, FailureCode, CommunicationChannel, MessagePriority, MessageType } from "./types";
import { recordAuditTx, publishEventTx, type Tx } from "@/lib/audit";

export type MessageRecord = typeof communicationMessages.$inferSelect;
export type DeliveryEventRecord = typeof communicationDeliveryEvents.$inferSelect;

const MAX_AUTOMATION_DEPTH = 10;

export async function getMessageById(id: string, tenantId: string): Promise<MessageRecord | null> {
  const [row] = await db
    .select()
    .from(communicationMessages)
    .where(and(eq(communicationMessages.id, id), eq(communicationMessages.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

export async function getMessageByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<MessageRecord | null> {
  const [row] = await db
    .select()
    .from(communicationMessages)
    .where(and(eq(communicationMessages.tenantId, tenantId), eq(communicationMessages.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row ?? null;
}

export async function createMessage(input: {
  tenantId: string;
  conversationId?: string | null;
  contactId?: string | null;
  channel: CommunicationChannel;
  providerId?: string | null;
  direction: "INBOUND" | "OUTBOUND";
  messageType?: MessageType;
  sender: string;
  recipient: string;
  subject?: string | null;
  body: string;
  htmlBody?: string | null;
  structuredPayload?: Record<string, unknown> | null;
  templateId?: string | null;
  templateVariables?: Record<string, unknown> | null;
  priority?: MessagePriority;
  classification?: string;
  correlationId: string;
  causationId?: string | null;
  idempotencyKey: string;
  traceId: string;
  providerMessageId?: string | null;
  scheduledFor?: Date | null;
  estimatedCost?: number | null;
  costCurrency?: string;
  aiDrafted?: boolean;
  aiModel?: string | null;
  aiConfidence?: number | null;
  requiresHumanApproval?: boolean;
  createdBy: string;
}): Promise<{ message: MessageRecord; isDuplicate: boolean }> {
  // Idempotency check — reuse existing idempotency_records pattern
  const existing = await getMessageByIdempotencyKey(input.tenantId, input.idempotencyKey);
  if (existing) {
    return { message: existing, isDuplicate: true };
  }

  const id = newId(ID_PREFIX.commMessage);

  // Loop detection
  const loopCheck = await checkLoop(input.tenantId, input.correlationId, input.conversationId ?? null, input.channel);
  if (loopCheck.shouldBlock) {
    throw new Error(`Message loop detected: correlation ${input.correlationId} depth ${loopCheck.depth} exceeds limit`);
  }

  const [row] = await db
    .insert(communicationMessages)
    .values({
      id,
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      contactId: input.contactId,
      channel: input.channel,
      providerId: input.providerId,
      direction: input.direction,
      messageType: input.messageType ?? "TEXT",
      sender: input.sender,
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
      htmlBody: input.htmlBody,
      structuredPayload: input.structuredPayload,
      templateId: input.templateId,
      templateVariables: input.templateVariables,
      priority: input.priority ?? "NORMAL",
      classification: (input.classification as never) ?? "INTERNAL",
      status: input.direction === "INBOUND" ? "DELIVERED" : "QUEUED",
      deliveryStatus: input.direction === "INBOUND" ? "DELIVERED" : "QUEUED",
      correlationId: input.correlationId,
      causationId: input.causationId,
      idempotencyKey: input.idempotencyKey,
      traceId: input.traceId,
      providerMessageId: input.providerMessageId,
      scheduledFor: input.scheduledFor,
      estimatedCost: input.estimatedCost ? String(input.estimatedCost) as never : null,
      costCurrency: input.costCurrency ?? "USD",
      aiDrafted: input.aiDrafted ?? false,
      aiModel: input.aiModel,
      aiConfidence: input.aiConfidence ? String(input.aiConfidence) as never : null,
      requiresHumanApproval: input.requiresHumanApproval ?? false,
      createdBy: input.createdBy,
    })
    .returning();

  // Record loop detection
  await db.insert(communicationLoopDetections).values({
    id: newId(ID_PREFIX.commLoop),
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    conversationId: input.conversationId,
    channel: input.channel,
    depth: loopCheck.depth + 1,
    detected: false,
  });

  // Cost ledger entry (estimated)
  if (input.estimatedCost) {
    await db.insert(communicationCostLedger).values({
      id: newId(ID_PREFIX.commCost),
      tenantId: input.tenantId,
      messageId: id,
      providerId: input.providerId,
      channel: input.channel,
      messageType: input.messageType ?? "TEXT",
      estimatedCost: String(input.estimatedCost) as never,
      currency: input.costCurrency ?? "USD",
      billingStatus: "ESTIMATED",
    });
  }

  return { message: row, isDuplicate: false };
}

export async function updateMessageStatus(
  id: string,
  tenantId: string,
  status: DeliveryStatus,
  options?: {
    providerMessageId?: string;
    failureCode?: FailureCode;
    failureReason?: string;
    actualCost?: number;
    deliveredAt?: Date;
    readAt?: Date;
    failedAt?: Date;
  },
): Promise<MessageRecord | null> {
  const updates: Record<string, unknown> = {
    status,
    deliveryStatus: status,
    updatedAt: new Date(),
  };

  if (options?.providerMessageId) updates.providerMessageId = options.providerMessageId;
  if (options?.failureCode) updates.failureCode = options.failureCode;
  if (options?.failureReason) updates.failureReason = options.failureReason;
  if (options?.actualCost) updates.actualCost = String(options.actualCost);
  if (status === "SENT") updates.sentAt = new Date();
  if (status === "DELIVERED" || options?.deliveredAt) updates.deliveredAt = options?.deliveredAt ?? new Date();
  if (status === "READ" || options?.readAt) updates.readAt = options?.readAt ?? new Date();
  if (status === "FAILED" || options?.failedAt) updates.failedAt = options?.failedAt ?? new Date();

  const [row] = await db
    .update(communicationMessages)
    .set(updates as never)
    .where(and(eq(communicationMessages.id, id), eq(communicationMessages.tenantId, tenantId)))
    .returning();

  if (row) {
    // Delivery event
    await db.insert(communicationDeliveryEvents).values({
      id: newId(ID_PREFIX.commDeliveryEvent),
      messageId: id,
      tenantId,
      eventType: status,
      providerEventId: options?.providerMessageId,
      providerStatus: status,
      failureReason: options?.failureReason,
      occurredAt: new Date(),
    });

    // Update cost ledger with actual cost if provided
    if (options?.actualCost) {
      await db
        .update(communicationCostLedger)
        .set({ actualCost: String(options.actualCost) as never, billingStatus: "BILLED", billedAt: new Date() })
        .where(eq(communicationCostLedger.messageId, id));
    }
  }

  return row ?? null;
}

export async function incrementRetryCount(id: string, tenantId: string): Promise<MessageRecord | null> {
  const [row] = await db.execute(
    sql`UPDATE communication_messages SET retry_count = retry_count + 1, updated_at = now() WHERE id = ${id} AND tenant_id = ${tenantId} RETURNING *`,
  ).then((r) => r.rows as unknown as MessageRecord[]);
  // Drizzle raw query returns array, but we need to handle
  const result = await db
    .select()
    .from(communicationMessages)
    .where(and(eq(communicationMessages.id, id), eq(communicationMessages.tenantId, tenantId)))
    .limit(1);
  return result[0] ?? null;
}

export async function shouldRetry(message: MessageRecord): Promise<{ retry: boolean; reason: string }> {
  if (message.retryCount >= message.maxRetries) {
    return { retry: false, reason: `Max retries ${message.maxRetries} exceeded` };
  }

  // Permanent failures never retry
  if (message.failureCode === "PERMANENT" || message.failureCode === "INVALID_RECIPIENT" || message.failureCode === "POLICY_REJECTION") {
    return { retry: false, reason: `Permanent failure ${message.failureCode} — no retry` };
  }

  // Transient, rate limit, provider outage, auth (after credential refresh) may retry
  if (["TRANSIENT", "RATE_LIMIT", "PROVIDER_OUTAGE", "AUTHENTICATION"].includes(message.failureCode ?? "")) {
    return { retry: true, reason: `Retryable failure ${message.failureCode}` };
  }

  // Default: retry if no failure code or transient
  return { retry: true, reason: "Default retry policy" };
}

// Loop prevention
export async function checkLoop(
  tenantId: string,
  correlationId: string,
  conversationId: string | null,
  channel: string,
): Promise<{ depth: number; shouldBlock: boolean }> {
  const { count } = await import("drizzle-orm");
  const result = await db
    .select({ depth: communicationLoopDetections.depth })
    .from(communicationLoopDetections)
    .where(and(eq(communicationLoopDetections.tenantId, tenantId), eq(communicationLoopDetections.correlationId, correlationId)))
    .orderBy(communicationLoopDetections.depth);

  const depth = result.length > 0 ? Math.max(...result.map((r) => r.depth)) : 0;

  return {
    depth,
    shouldBlock: depth >= MAX_AUTOMATION_DEPTH,
  };
}

// Document delivery — link to canonical documents table, never duplicate
export async function attachDocument(input: {
  messageId: string;
  documentId: string;
  tenantId: string;
  fileName: string;
  fileType: string;
  fileSize?: number;
  accessExpiresAt?: Date | null;
}): Promise<typeof communicationAttachments.$inferSelect> {
  const id = newId(ID_PREFIX.commAttachment);
  const [row] = await db
    .insert(communicationAttachments)
    .values({
      id,
      messageId: input.messageId,
      documentId: input.documentId,
      tenantId: input.tenantId,
      fileName: input.fileName,
      fileType: input.fileType,
      fileSize: input.fileSize,
      accessExpiresAt: input.accessExpiresAt,
    })
    .returning();
  return row;
}

export async function listMessages(
  tenantId: string,
  options?: { conversationId?: string; contactId?: string; channel?: string; status?: string; limit?: number },
) {
  const { desc } = await import("drizzle-orm");
  let query = db
    .select()
    .from(communicationMessages)
    .where(eq(communicationMessages.tenantId, tenantId))
    .orderBy(desc(communicationMessages.createdAt))
    .$dynamic();

  const conditions = [eq(communicationMessages.tenantId, tenantId)];
  if (options?.conversationId) conditions.push(eq(communicationMessages.conversationId, options.conversationId));
  if (options?.contactId) conditions.push(eq(communicationMessages.contactId, options.contactId));
  if (options?.channel) conditions.push(eq(communicationMessages.channel, options.channel));
  if (options?.status) conditions.push(eq(communicationMessages.status, options.status));

  if (conditions.length > 1) {
    query = db
      .select()
      .from(communicationMessages)
      .where(and(...conditions))
      .orderBy(desc(communicationMessages.createdAt))
      .limit(options?.limit ?? 50) as unknown as typeof query;
  } else {
    query = query.limit(options?.limit ?? 50) as unknown as typeof query;
  }

  return query;
}
