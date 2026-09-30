/**
 * Conversation Engine — unified, governed, omnichannel.
 *
 * Supports: OPEN, BOT_ACTIVE, HUMAN_REQUIRED, HUMAN_ACTIVE, WAITING_CUSTOMER,
 * WAITING_INTERNAL, BOT_RESUMED, RESOLVED, CLOSED
 *
 * A conversation can span multiple channels only when identity linking is verified.
 * Omnichannel continuity: WhatsApp → Email → SMS → In-App remains one conversation
 * only where relationship is authoritatively established (verified GlobalUserID link).
 */

import { and, eq, desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { communicationConversations, communicationMessages } from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import type { ConversationStatus, MessagePriority } from "./types";
import { CONVERSATION_STATUSES } from "./types";

export type ConversationRecord = typeof communicationConversations.$inferSelect;

const VALID_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["BOT_ACTIVE", "HUMAN_REQUIRED", "HUMAN_ACTIVE", "WAITING_CUSTOMER", "WAITING_INTERNAL", "RESOLVED", "CLOSED"],
  BOT_ACTIVE: ["HUMAN_REQUIRED", "WAITING_CUSTOMER", "WAITING_INTERNAL", "RESOLVED", "CLOSED"],
  HUMAN_REQUIRED: ["HUMAN_ACTIVE", "BOT_RESUMED", "RESOLVED", "CLOSED"],
  HUMAN_ACTIVE: ["WAITING_CUSTOMER", "WAITING_INTERNAL", "BOT_RESUMED", "RESOLVED", "CLOSED"],
  WAITING_CUSTOMER: ["OPEN", "BOT_ACTIVE", "HUMAN_ACTIVE", "RESOLVED", "CLOSED"],
  WAITING_INTERNAL: ["OPEN", "HUMAN_ACTIVE", "RESOLVED", "CLOSED"],
  BOT_RESUMED: ["HUMAN_REQUIRED", "HUMAN_ACTIVE", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"],
  RESOLVED: ["OPEN", "CLOSED"],
  CLOSED: ["OPEN"], // Reopen only
};

export function isValidConversationStatus(status: string): boolean {
  return (CONVERSATION_STATUSES as readonly string[]).includes(status);
}

export function canTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export async function getConversationById(id: string, tenantId: string): Promise<ConversationRecord | null> {
  const [row] = await db
    .select()
    .from(communicationConversations)
    .where(and(eq(communicationConversations.id, id), eq(communicationConversations.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

export async function listConversations(
  tenantId: string,
  options?: { status?: string; channel?: string; contactId?: string; assignedToUserId?: string; limit?: number },
): Promise<ConversationRecord[]> {
  let query = db
    .select()
    .from(communicationConversations)
    .where(eq(communicationConversations.tenantId, tenantId))
    .orderBy(desc(communicationConversations.updatedAt))
    .$dynamic();

  const conditions = [eq(communicationConversations.tenantId, tenantId)];
  if (options?.status) conditions.push(eq(communicationConversations.status, options.status));
  if (options?.channel) conditions.push(eq(communicationConversations.channel, options.channel));
  if (options?.contactId) conditions.push(eq(communicationConversations.contactId, options.contactId));
  if (options?.assignedToUserId) conditions.push(eq(communicationConversations.assignedToUserId, options.assignedToUserId));

  if (conditions.length > 1) {
    query = db
      .select()
      .from(communicationConversations)
      .where(and(...conditions))
      .orderBy(desc(communicationConversations.updatedAt))
      .limit(options?.limit ?? 50) as unknown as typeof query;
  } else {
    query = query.limit(options?.limit ?? 50) as unknown as typeof query;
  }

  return query;
}

export async function createConversation(input: {
  tenantId: string;
  legalEntityId?: string | null;
  countryCode?: string | null;
  contactId?: string | null;
  globalUserId?: string | null;
  channel: string;
  subject?: string;
  priority?: MessagePriority;
  classification?: string;
  correlationId: string;
  causationId?: string | null;
  slaPolicyId?: string | null;
  createdBy: string;
  metadata?: Record<string, unknown>;
}): Promise<ConversationRecord> {
  const id = newId(ID_PREFIX.commConversation);
  const [row] = await db
    .insert(communicationConversations)
    .values({
      id,
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      countryCode: input.countryCode,
      contactId: input.contactId,
      globalUserId: input.globalUserId,
      channel: input.channel,
      subject: input.subject,
      status: "OPEN",
      priority: input.priority ?? "NORMAL",
      classification: (input.classification as never) ?? "INTERNAL",
      correlationId: input.correlationId,
      causationId: input.causationId,
      slaPolicyId: input.slaPolicyId,
      createdBy: input.createdBy,
      metadata: input.metadata ?? {},
    })
    .returning();
  return row;
}

export async function transitionConversation(
  id: string,
  tenantId: string,
  toStatus: ConversationStatus,
  updatedBy: string,
): Promise<{ success: boolean; reason?: string; conversation?: ConversationRecord }> {
  const existing = await getConversationById(id, tenantId);
  if (!existing) {
    return { success: false, reason: "Conversation not found" };
  }

  if (!canTransition(existing.status, toStatus)) {
    return { success: false, reason: `Invalid transition ${existing.status} → ${toStatus}` };
  }

  const updates: Partial<ConversationRecord> = {
    status: toStatus,
    updatedAt: new Date(),
  } as never;

  if (toStatus === "RESOLVED") {
    (updates as { resolvedAt: Date }).resolvedAt = new Date();
  }
  if (toStatus === "CLOSED") {
    (updates as { closedAt: Date }).closedAt = new Date();
    (updates as { resolvedAt: Date }).resolvedAt = existing.resolvedAt ?? new Date();
  }

  const [row] = await db
    .update(communicationConversations)
    .set(updates)
    .where(and(eq(communicationConversations.id, id), eq(communicationConversations.tenantId, tenantId)))
    .returning();

  return { success: true, conversation: row };
}

export async function assignConversation(
  id: string,
  tenantId: string,
  assignedToUserId: string | null,
  assignedToRole: string | null,
): Promise<ConversationRecord | null> {
  const [row] = await db
    .update(communicationConversations)
    .set({
      assignedToUserId,
      assignedToRole,
      updatedAt: new Date(),
    })
    .where(and(eq(communicationConversations.id, id), eq(communicationConversations.tenantId, tenantId)))
    .returning();
  return row ?? null;
}

export async function getConversationTimeline(conversationId: string, tenantId: string) {
  // Assemble from canonical events + messages — not a duplicate event ledger
  const messages = await db
    .select()
    .from(communicationMessages)
    .where(and(eq(communicationMessages.conversationId, conversationId), eq(communicationMessages.tenantId, tenantId)))
    .orderBy(communicationMessages.createdAt);

  return messages.map((m) => ({
    timestamp: m.createdAt,
    type: "MESSAGE",
    channel: m.channel,
    direction: m.direction,
    status: m.status,
    subject: m.subject,
    body: m.body.slice(0, 200),
    sender: m.sender,
    recipient: m.recipient,
    providerMessageId: m.providerMessageId,
    correlationId: m.correlationId,
  }));
}

// Human handoff: BOT_ACTIVE → HUMAN_REQUIRED → HUMAN_ACTIVE → BOT_RESUMED → RESOLVED
export async function requestHumanHandoff(
  conversationId: string,
  tenantId: string,
  requestedBy: string,
): Promise<{ success: boolean; reason?: string }> {
  const conv = await getConversationById(conversationId, tenantId);
  if (!conv) return { success: false, reason: "Conversation not found" };

  if (conv.status === "HUMAN_REQUIRED" || conv.status === "HUMAN_ACTIVE") {
    return { success: true }; // Already requested/active
  }

  const result = await transitionConversation(conversationId, tenantId, "HUMAN_REQUIRED", requestedBy);
  return result;
}

export async function acceptHumanHandoff(
  conversationId: string,
  tenantId: string,
  agentUserId: string,
): Promise<{ success: boolean; reason?: string }> {
  const conv = await getConversationById(conversationId, tenantId);
  if (!conv) return { success: false, reason: "Conversation not found" };

  await assignConversation(conversationId, tenantId, agentUserId, null);
  const result = await transitionConversation(conversationId, tenantId, "HUMAN_ACTIVE", agentUserId);
  return result;
}
