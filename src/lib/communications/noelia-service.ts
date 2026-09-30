/**
 * Noelia / HIVE — AI-assisted communication, governed.
 *
 * Canonical identity remains NOELIA_AI, never NOELIA_WHATSAPP, etc.
 * Noelia is one governed intelligence identity.
 *
 * Noelia may: draft, summarize, classify, translate, route, recommend,
 * detect urgency, assist support, analyze feedback, prepare reports,
 * recommend escalation.
 *
 * Noelia MUST NOT: grant permissions, change roles, bypass RLS/RBAC/ABAC,
 * override consent, approve financial transactions, post journals, move money,
 * disable audit, impersonate human, silently override governance.
 *
 * Sensitive communication: AI DRAFT → POLICY CHECK → HUMAN REVIEW → APPROVAL → SEND → AUDIT
 */

import { db } from "@/db";
import { aiDecisions, noeliaActionRequests } from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { recordAudit } from "@/lib/audit";
import type { CommunicationChannel, ChannelRecommendation } from "./types";
import { NOELIA_IDENTITY, HIVE_RUNTIME, SYSTEM_VERSION } from "@/lib/constants";

export type NoeliaDraftRequest = {
  tenantId: string;
  contactId?: string;
  channel: CommunicationChannel;
  messageType: string;
  purpose: string;
  context: Record<string, unknown>;
  originalMessage?: string;
  language?: string;
};

export type NoeliaDraftResult = {
  draft: string;
  subject?: string;
  confidence: number;
  model: string;
  requiresHumanApproval: boolean;
  reason: string;
  suggestions?: string[];
};

export async function draftWithNoelia(
  request: NoeliaDraftRequest,
  principal: { userId: string; tenantId: string },
): Promise<NoeliaDraftResult> {
  // This is a governed AI interaction — record as ai_decisions
  // In production, would call HIVE runtime with governed model gateway
  // For now, deterministic simulated drafting with policy checks

  const isSensitive =
    ["LEGAL", "FINANCE", "EXECUTIVE", "COMPLIANCE"].includes(request.messageType) ||
    (request.context.classification as string) === "RESTRICTED" ||
    (request.context.classification as string) === "HIGHLY_RESTRICTED" ||
    request.purpose === "MARKETING" ||
    (request.context.amount as number) > 10000000; // TSh 10M threshold example

  // Simulated draft — in production, would use modelRegistry with classification limits
  let draft = "";
  let subject: string | undefined;

  if (request.originalMessage) {
    draft = `[Noelia draft — refactored]\n\n${request.originalMessage}\n\n—\nThis draft was prepared by Noelia/HIVE and requires human review.`;
  } else {
    draft = `Hello {{contact_name}},\n\nThis is a governed communication regarding ${request.context.subject ?? request.messageType}.\n\nBest regards,\nBEYU OS Team\n\n[Draft by Noelia — ${isSensitive ? "REQUIRES HUMAN APPROVAL" : "auto-approved for transactional"}]`;
  }

  if (request.channel === "EMAIL") {
    subject = `Re: ${request.context.subject ?? request.messageType} — BEYU OS`;
  }

  const decisionId = newId(ID_PREFIX.aiDecision);
  await db.insert(aiDecisions).values({
    id: decisionId,
    tenantId: request.tenantId,
    userId: principal.userId,
    agent: NOELIA_IDENTITY,
    runtime: HIVE_RUNTIME,
    engine: "COMMUNICATIONS",
    model: "NOELIA_COMMUNICATIONS_DRAFT_V1",
    modelVersion: "1.0.0",
    promptVersion: "communications-draft/1.0.0",
    requestType: "COMMUNICATION_DRAFT",
    question: `Draft ${request.messageType} for ${request.channel}`,
    inputs: {
      channel: request.channel,
      messageType: request.messageType,
      purpose: request.purpose,
      context: request.context,
      language: request.language ?? "en",
    },
    output: {
      draft,
      subject,
      requiresHumanApproval: isSensitive,
      reason: isSensitive ? "Sensitive communication requires human approval" : "Transactional — auto-approvable",
    },
    outputClass: isSensitive ? "REQUIRES_HUMAN_REVIEW" : "RECOMMENDATION",
    confidence: isSensitive ? "0.85" as never : ("0.95" as never),
    policyDecision: isSensitive ? "REQUIRES_APPROVAL" : "ALLOWED",
    humanReviewRequired: isSensitive,
    finalAction: isSensitive ? "PENDING_HUMAN_REVIEW" : "DRAFT_READY",
    latencyMs: 100,
  });

  await recordAudit({
    tenantId: request.tenantId,
    actorUserId: principal.userId,
    actorType: "AI",
    action: "communications.noelia.draft",
    objectType: "MESSAGE_DRAFT",
    objectId: decisionId,
    outcome: "SUCCESS",
    aiVersion: "NOELIA_COMMUNICATIONS_DRAFT_V1",
    newValue: {
      channel: request.channel,
      messageType: request.messageType,
      requiresHumanApproval: isSensitive,
      model: "NOELIA_COMMUNICATIONS_DRAFT_V1",
    },
  });

  return {
    draft,
    subject,
    confidence: isSensitive ? 0.85 : 0.95,
    model: "NOELIA_COMMUNICATIONS_DRAFT_V1",
    requiresHumanApproval: isSensitive,
    reason: isSensitive ? "Sensitive communication requires human approval per policy" : "Transactional — no approval required",
  };
}

export async function recommendChannelWithNoelia(input: {
  tenantId: string;
  contactId: string;
  messageType: string;
  priority: string;
  purpose: string;
  context: Record<string, unknown>;
}): Promise<ChannelRecommendation> {
  // Noelia recommends, governance decides — recommendation is advisory only
  const { getPreferences } = await import("./consent-service");
  const preferences = await getPreferences(input.contactId, input.tenantId);

  // Simple heuristic: prefer contact's preferred channel, or WhatsApp for urgent, Email for invoice
  let recommended: CommunicationChannel = "EMAIL";
  let reason = "Default recommendation";

  const prefChannel = preferences.find((p) => p.enabled)?.channel as CommunicationChannel | undefined;
  if (prefChannel) {
    recommended = prefChannel;
    reason = `Contact prefers ${prefChannel}`;
  } else if (input.priority === "CRITICAL") {
    recommended = "IN_APP";
    reason = "Critical priority — In-App + SMS escalation recommended";
  } else if (["INVOICE", "RECEIPT", "STATEMENT", "REPORT"].includes(input.messageType)) {
    recommended = "EMAIL";
    reason = `${input.messageType} — Email with PDF attachment recommended`;
  } else if (input.messageType === "ALERT") {
    recommended = "WHATSAPP";
    reason = "Alert — WhatsApp for immediacy recommended";
  }

  const decisionId = newId(ID_PREFIX.aiDecision);
  await db.insert(aiDecisions).values({
    id: decisionId,
    tenantId: input.tenantId,
    agent: NOELIA_IDENTITY,
    runtime: HIVE_RUNTIME,
    engine: "COMMUNICATIONS",
    model: "NOELIA_CHANNEL_RECOMMEND_V1",
    modelVersion: "1.0.0",
    promptVersion: "channel-recommend/1.0.0",
    requestType: "CHANNEL_RECOMMENDATION",
    question: `Recommend channel for ${input.messageType} priority ${input.priority}`,
    inputs: {
      messageType: input.messageType,
      priority: input.priority,
      purpose: input.purpose,
      preferences: preferences.map((p) => ({ channel: p.channel, enabled: p.enabled, priority: p.priority })),
      context: input.context,
    },
    output: {
      channel: recommended,
      reason,
      confidence: 0.85,
    },
    outputClass: "RECOMMENDATION",
    confidence: "0.85" as never,
    policyDecision: "ADVISORY_ONLY",
    humanReviewRequired: false,
    finalAction: "RECOMMENDED",
    latencyMs: 50,
  });

  return {
    channel: recommended,
    reason,
    confidence: 0.85,
    model: "NOELIA_CHANNEL_RECOMMEND_V1",
  };
}

export async function summarizeConversationWithNoelia(
  conversationId: string,
  tenantId: string,
  messages: { body: string; direction: string; createdAt: Date }[],
  principal: { userId: string },
): Promise<{ summary: string; model: string; confidence: number }> {
  // Summarize authorized context only — never expose outside authorization boundaries
  const summary = `Conversation ${conversationId} summary (${messages.length} messages):\n` +
    messages.slice(-5).map((m) => `[${m.direction}] ${m.body.slice(0, 100)}`).join("\n") +
    "\n\n[Summary by Noelia — advisory, auditable]";

  const decisionId = newId(ID_PREFIX.aiDecision);
  await db.insert(aiDecisions).values({
    id: decisionId,
    tenantId,
    userId: principal.userId,
    agent: NOELIA_IDENTITY,
    runtime: HIVE_RUNTIME,
    engine: "COMMUNICATIONS",
    model: "NOELIA_SUMMARIZE_V1",
    modelVersion: "1.0.0",
    promptVersion: "conversation-summarize/1.0.0",
    requestType: "CONVERSATION_SUMMARY",
    question: `Summarize conversation ${conversationId}`,
    inputs: { conversationId, messageCount: messages.length },
    output: { summary },
    outputClass: "FACT",
    confidence: "0.90" as never,
    policyDecision: "ALLOWED",
    humanReviewRequired: false,
    finalAction: "SUMMARIZED",
    latencyMs: 80,
  });

  return { summary, model: "NOELIA_SUMMARIZE_V1", confidence: 0.9 };
}

export async function detectUrgencyWithNoelia(
  body: string,
  tenantId: string,
): Promise<{ urgency: "LOW" | "NORMAL" | "HIGH" | "CRITICAL"; confidence: number; keywords: string[] }> {
  const lower = body.toLowerCase();
  const criticalKeywords = ["urgent", "emergency", "critical", "immediately", "asap", "help", "blocked", "down", "failure"];
  const highKeywords = ["important", "priority", "escalate", "deadline", "overdue"];

  const foundCritical = criticalKeywords.filter((k) => lower.includes(k));
  const foundHigh = highKeywords.filter((k) => lower.includes(k));

  if (foundCritical.length > 0) {
    return { urgency: "CRITICAL", confidence: 0.9, keywords: foundCritical };
  }
  if (foundHigh.length > 0) {
    return { urgency: "HIGH", confidence: 0.8, keywords: foundHigh };
  }
  return { urgency: "NORMAL", confidence: 0.7, keywords: [] };
}
