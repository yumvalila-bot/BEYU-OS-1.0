/**
 * Routing Engine — governed channel selection & routing.
 *
 * Inputs may include: recipient preference, message classification, urgency,
 * country, tenant, entity, provider availability, consent, message type,
 * language, cost, delivery reliability.
 *
 * Example: Invoice → Email PDF + WhatsApp notification + In-app copy
 * Critical alert → In-app + authorized SMS + internal escalation
 *
 * Noelia may RECOMMEND a channel. The governance layer decides whether that
 * recommendation is permitted.
 */

import { and, eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { communicationRoutingRules, communicationSlaPolicies } from "@/db/schema";
import type { CommunicationChannel, MessageType, MessagePriority, ConsentPurpose, ChannelRecommendation } from "./types";
import { newId, ID_PREFIX } from "@/lib/ids";

export type RoutingRuleRecord = typeof communicationRoutingRules.$inferSelect;
export type SlaPolicyRecord = typeof communicationSlaPolicies.$inferSelect;

export type RoutingContext = {
  tenantId: string;
  countryCode?: string | null;
  channel?: CommunicationChannel | null;
  messageType: MessageType;
  priority: MessagePriority;
  purpose: ConsentPurpose;
  classification: string;
  contactPreferredChannel?: CommunicationChannel | null;
  providerAvailability?: Record<string, boolean>;
  language?: string;
  costSensitivity?: "LOW" | "MEDIUM" | "HIGH";
  requiresConsent?: boolean;
};

export type RoutingDecision = {
  channels: CommunicationChannel[];
  strategy: "SINGLE" | "MULTI_CHANNEL" | "PREFERRED_WITH_FALLBACK" | "CONSENT_GATED";
  primaryChannel: CommunicationChannel;
  fallbackChannels: CommunicationChannel[];
  requiresConsent: boolean;
  slaPolicyId?: string;
  reason: string;
};

export async function listRoutingRules(tenantId?: string): Promise<RoutingRuleRecord[]> {
  if (tenantId) {
    const { or, isNull } = await import("drizzle-orm");
    return db
      .select()
      .from(communicationRoutingRules)
      .where(or(eq(communicationRoutingRules.tenantId, tenantId), isNull(communicationRoutingRules.tenantId)))
      .orderBy(asc(communicationRoutingRules.priority));
  }
  return db.select().from(communicationRoutingRules).orderBy(asc(communicationRoutingRules.priority));
}

export async function evaluateRouting(context: RoutingContext): Promise<RoutingDecision> {
  const rules = await listRoutingRules(context.tenantId);

  // Find matching rules — first match by priority wins, but we also consider multi-channel
  for (const rule of rules) {
    if (!rule.enabled) continue;

    // Check conditions
    const conditions = rule.conditions as Record<string, unknown>;
    if (!matchesConditions(conditions, context)) continue;

    const action = rule.action as Record<string, unknown>;
    const strategy = (action.strategy as RoutingDecision["strategy"]) ?? "SINGLE";
    const channels = (action.channels as CommunicationChannel[]) ?? (rule.channel ? [rule.channel as CommunicationChannel] : []);
    const fallback = (action.fallback as CommunicationChannel[]) ?? [];
    const requiresConsent = (action.requires_consent as boolean) ?? (conditions.purpose as string[] | undefined)?.includes("MARKETING") ?? false;

    if (channels.length > 0) {
      return {
        channels: strategy === "MULTI_CHANNEL" ? channels : [channels[0]],
        strategy,
        primaryChannel: channels[0],
        fallbackChannels: fallback,
        requiresConsent,
        reason: `Matched rule ${rule.name} (${rule.id})`,
      };
    }
  }

  // Default routing based on priority and type
  return defaultRouting(context);
}

function matchesConditions(conditions: Record<string, unknown>, context: RoutingContext): boolean {
  if (!conditions || Object.keys(conditions).length === 0) return true;

  // Check message_type
  if (conditions.message_type) {
    const allowed = conditions.message_type as string[];
    if (!allowed.includes(context.messageType)) return false;
  }

  // Check priority
  if (conditions.priority) {
    const allowed = conditions.priority as string[];
    if (!allowed.includes(context.priority)) return false;
  }

  // Check purpose
  if (conditions.purpose) {
    const allowed = conditions.purpose as string[];
    if (!allowed.includes(context.purpose)) return false;
  }

  // Check classification
  if (conditions.message_classification) {
    const allowed = conditions.message_classification as string[];
    if (!allowed.includes(context.classification)) return false;
  }

  // Check channel
  if (conditions.channel && context.channel) {
    const allowed = conditions.channel as string[];
    if (!allowed.includes(context.channel)) return false;
  }

  return true;
}

function defaultRouting(context: RoutingContext): RoutingDecision {
  // Critical → multi-channel
  if (context.priority === "CRITICAL") {
    return {
      channels: ["IN_APP", "SMS", "INTERNAL"],
      strategy: "MULTI_CHANNEL",
      primaryChannel: "IN_APP",
      fallbackChannels: ["SMS", "INTERNAL"],
      requiresConsent: false,
      reason: "Critical priority default — multi-channel with escalation",
    };
  }

  // Invoice, receipt, statement → Email + WhatsApp + In-App
  if (["INVOICE", "RECEIPT", "STATEMENT"].includes(context.messageType)) {
    return {
      channels: ["EMAIL", "WHATSAPP", "IN_APP"],
      strategy: "MULTI_CHANNEL",
      primaryChannel: "EMAIL",
      fallbackChannels: ["WHATSAPP", "IN_APP"],
      requiresConsent: false,
      reason: "Financial document default — Email primary with WhatsApp and In-App",
    };
  }

  // Marketing → consent-gated, preferred channel
  if (context.purpose === "MARKETING") {
    return {
      channels: [context.contactPreferredChannel ?? "EMAIL"],
      strategy: "CONSENT_GATED",
      primaryChannel: context.contactPreferredChannel ?? "EMAIL",
      fallbackChannels: ["WHATSAPP", "EMAIL"],
      requiresConsent: true,
      reason: "Marketing default — consent-gated, preferred channel",
    };
  }

  // Default: preferred channel with Email fallback
  return {
    channels: [context.contactPreferredChannel ?? "EMAIL"],
    strategy: "PREFERRED_WITH_FALLBACK",
    primaryChannel: context.contactPreferredChannel ?? "EMAIL",
    fallbackChannels: ["EMAIL", "IN_APP"],
    requiresConsent: false,
    reason: "Default routing — preferred channel with Email fallback",
  };
}

// Noelia may RECOMMEND, governance decides
export function applyChannelRecommendation(
  recommendation: ChannelRecommendation,
  governanceDecision: RoutingDecision,
  context: RoutingContext,
): RoutingDecision {
  // Governance always wins — recommendation is advisory only
  // But if recommendation is compatible (consent allows, provider available), we can honor it
  if (governanceDecision.requiresConsent) {
    // If consent required, recommendation cannot bypass
    return governanceDecision;
  }

  // Check provider availability
  if (context.providerAvailability && !context.providerAvailability[recommendation.channel]) {
    return governanceDecision;
  }

  // If recommendation confidence high and channel compatible, use it as primary
  if (recommendation.confidence >= 0.8) {
    return {
      ...governanceDecision,
      primaryChannel: recommendation.channel,
      channels: governanceDecision.strategy === "MULTI_CHANNEL" ? governanceDecision.channels : [recommendation.channel],
      reason: `${governanceDecision.reason} + Noelia recommendation ${recommendation.channel} (${recommendation.reason}) — governance approved`,
    };
  }

  return governanceDecision;
}

// SLA
export async function getSlaPolicyForContext(context: {
  tenantId?: string;
  channel?: string;
  priority: MessagePriority;
  messageType?: string;
}): Promise<SlaPolicyRecord | null> {
  const { or, isNull } = await import("drizzle-orm");
  const conditions = [eq(communicationSlaPolicies.priority, context.priority)];
  if (context.channel) conditions.push(eq(communicationSlaPolicies.channel, context.channel));

  const rows = await db
    .select()
    .from(communicationSlaPolicies)
    .where(and(...conditions))
    .limit(10);

  if (rows.length === 0) {
    // Fallback to priority-only match
    const fallback = await db
      .select()
      .from(communicationSlaPolicies)
      .where(eq(communicationSlaPolicies.priority, context.priority))
      .limit(1);
    return fallback[0] ?? null;
  }

  return rows[0];
}

export async function createRoutingRule(input: {
  tenantId?: string | null;
  name: string;
  description?: string;
  channel?: string | null;
  messageType?: string | null;
  priority?: number;
  conditions: Record<string, unknown>;
  action: Record<string, unknown>;
  countryCode?: string | null;
  classification?: string | null;
  createdBy: string;
}): Promise<RoutingRuleRecord> {
  const id = newId("ROUTE" as keyof typeof ID_PREFIX);
  const [row] = await db
    .insert(communicationRoutingRules)
    .values({
      id,
      tenantId: input.tenantId,
      name: input.name,
      description: input.description,
      channel: input.channel,
      messageType: input.messageType,
      priority: input.priority ?? 100,
      conditions: input.conditions,
      action: input.action,
      countryCode: input.countryCode,
      classification: input.classification as never,
      createdBy: input.createdBy,
    })
    .returning();
  return row;
}
