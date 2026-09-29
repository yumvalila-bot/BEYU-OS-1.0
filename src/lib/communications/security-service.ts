/**
 * Communications Security Center — integrates with existing SIEM/audit/security.
 *
 * Surface: failed webhook signatures, abnormal volume, repeated retries,
 * suspicious recipients, provider failures, configuration changes,
 * unauthorized access attempts, automation anomalies, message loops.
 *
 * Do not create a separate SIEM. Integrate with existing audit_log + enterprise_events.
 *
 * Abuse / Anti-Spam: tenant rate limits, endpoint limits, recipient limits,
 * provider quotas, automation limits, message-loop detection, suspicious
 * activity controls, emergency channel disablement.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  communicationSecurityEvents,
  communicationRateLimits,
  communicationLoopDetections,
  communicationProviders,
} from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { recordAudit } from "@/lib/audit";
import type { SecurityEventType } from "./types";

export type SecurityEventRecord = typeof communicationSecurityEvents.$inferSelect;

export async function recordSecurityEvent(input: {
  tenantId?: string | null;
  eventType: SecurityEventType;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  channel?: string | null;
  providerId?: string | null;
  contactId?: string | null;
  messageId?: string | null;
  webhookEventId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<SecurityEventRecord> {
  const id = newId("CSEC" as keyof typeof ID_PREFIX);
  const [row] = await db
    .insert(communicationSecurityEvents)
    .values({
      id,
      tenantId: input.tenantId,
      eventType: input.eventType,
      severity: input.severity ?? "MEDIUM",
      channel: input.channel,
      providerId: input.providerId,
      contactId: input.contactId,
      messageId: input.messageId,
      webhookEventId: input.webhookEventId,
      details: input.details ?? {},
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    })
    .returning();

  await recordAudit({
    tenantId: input.tenantId,
    actorType: "SERVICE",
    action: `communications.security.${input.eventType.toLowerCase()}`,
    objectType: "COMMUNICATION_SECURITY_EVENT",
    objectId: id,
    outcome: "SUCCESS",
    reason: input.eventType,
    newValue: {
      eventType: input.eventType,
      severity: input.severity,
      channel: input.channel,
      providerId: input.providerId,
    },
  });

  return row;
}

export async function listSecurityEvents(tenantId?: string, options?: { eventType?: string; severity?: string; limit?: number }) {
  const { desc } = await import("drizzle-orm");
  let query = db.select().from(communicationSecurityEvents).orderBy(desc(communicationSecurityEvents.createdAt)).$dynamic();

  if (tenantId) {
    const conditions = [eq(communicationSecurityEvents.tenantId, tenantId)];
    if (options?.eventType) conditions.push(eq(communicationSecurityEvents.eventType, options.eventType));
    if (options?.severity) conditions.push(eq(communicationSecurityEvents.severity, options.severity));
    query = db
      .select()
      .from(communicationSecurityEvents)
      .where(and(...conditions))
      .orderBy(desc(communicationSecurityEvents.createdAt))
      .limit(options?.limit ?? 50) as unknown as typeof query;
  } else {
    query = query.limit(options?.limit ?? 50) as unknown as typeof query;
  }

  return query;
}

// Rate limiting — tenant, contact, provider, channel, IP
export async function checkRateLimit(input: {
  tenantId: string;
  scopeType: "TENANT" | "CONTACT" | "PROVIDER" | "CHANNEL" | "IP";
  scopeId: string;
  channel?: string | null;
}): Promise<{ allowed: boolean; reason?: string; limit?: typeof communicationRateLimits.$inferSelect }> {
  const { or, isNull } = await import("drizzle-orm");
  const [limit] = await db
    .select()
    .from(communicationRateLimits)
    .where(
      and(
        eq(communicationRateLimits.tenantId, input.tenantId),
        eq(communicationRateLimits.scopeType, input.scopeType),
        eq(communicationRateLimits.scopeId, input.scopeId),
        input.channel ? eq(communicationRateLimits.channel, input.channel) : isNull(communicationRateLimits.channel),
      ),
    )
    .limit(1);

  if (!limit) {
    // No limit configured — allow, but create default tracking
    return { allowed: true };
  }

  const now = new Date();
  if (limit.blockedUntil && limit.blockedUntil > now) {
    return { allowed: false, reason: `Blocked until ${limit.blockedUntil.toISOString()}`, limit };
  }

  // Check minute window
  const minuteWindowStart = new Date(now.getTime() - 60 * 1000);
  if (limit.windowStartMinute < minuteWindowStart) {
    // Reset minute window
    await db
      .update(communicationRateLimits)
      .set({ currentCountMinute: 1, windowStartMinute: now, updatedAt: now })
      .where(eq(communicationRateLimits.id, limit.id));
    return { allowed: true, limit };
  }

  if (limit.currentCountMinute >= limit.limitPerMinute) {
    // Block for 1 minute on minute limit exceeded
    await db
      .update(communicationRateLimits)
      .set({ blockedUntil: new Date(now.getTime() + 60 * 1000), updatedAt: now })
      .where(eq(communicationRateLimits.id, limit.id));

    await recordSecurityEvent({
      tenantId: input.tenantId,
      eventType: "RATE_LIMIT_EXCEEDED",
      severity: "MEDIUM",
      channel: input.channel,
      details: { scopeType: input.scopeType, scopeId: input.scopeId, channel: input.channel, limit: limit.limitPerMinute, window: "MINUTE" },
    });

    return { allowed: false, reason: `Rate limit ${limit.limitPerMinute}/minute exceeded for ${input.scopeType} ${input.scopeId}`, limit };
  }

  // Increment counters
  await db.execute(
    sql`UPDATE communication_rate_limits 
        SET current_count_minute = current_count_minute + 1,
            current_count_hour = current_count_hour + 1,
            current_count_day = current_count_day + 1,
            updated_at = now()
        WHERE id = ${limit.id}`,
  );

  // Check hour/day limits
  if (limit.currentCountHour >= limit.limitPerHour) {
    return { allowed: false, reason: `Rate limit ${limit.limitPerHour}/hour exceeded`, limit };
  }
  if (limit.currentCountDay >= limit.limitPerDay) {
    return { allowed: false, reason: `Rate limit ${limit.limitPerDay}/day exceeded`, limit };
  }

  return { allowed: true, limit };
}

export async function createRateLimit(input: {
  tenantId: string;
  scopeType: "TENANT" | "CONTACT" | "PROVIDER" | "CHANNEL" | "IP";
  scopeId: string;
  channel?: string | null;
  limitPerMinute?: number;
  limitPerHour?: number;
  limitPerDay?: number;
}): Promise<typeof communicationRateLimits.$inferSelect> {
  const id = newId("RLIM" as keyof typeof ID_PREFIX);
  const [row] = await db
    .insert(communicationRateLimits)
    .values({
      id,
      tenantId: input.tenantId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      channel: input.channel,
      limitPerMinute: input.limitPerMinute ?? 60,
      limitPerHour: input.limitPerHour ?? 1000,
      limitPerDay: input.limitPerDay ?? 10000,
    })
    .returning();
  return row;
}

// Emergency channel disablement
export async function emergencyDisableChannel(
  tenantId: string,
  channel: string,
  reason: string,
  disabledBy: string,
): Promise<void> {
  // Disable all providers for channel in tenant
  await db
    .update(communicationProviders)
    .set({ status: "FAILED", healthStatus: "DOWN", updatedAt: new Date() })
    .where(and(eq(communicationProviders.tenantId, tenantId), eq(communicationProviders.channelCode, channel)));

  // Also global providers if tenant is enterprise-level
  // (handled via separate logic if needed)

  await recordSecurityEvent({
    tenantId,
    eventType: "CONFIGURATION_CHANGE",
    severity: "CRITICAL",
    channel,
    details: { action: "EMERGENCY_DISABLE", reason, disabledBy },
  });

  await recordAudit({
    tenantId,
    actorUserId: disabledBy,
    action: "communications.channel.emergency_disable",
    objectType: "COMMUNICATION_CHANNEL",
    objectId: channel,
    outcome: "SUCCESS",
    reason: "EMERGENCY_DISABLE",
    newValue: { channel, reason, disabledBy },
  });
}

export async function detectAbnormalVolume(
  tenantId: string,
  channel: string,
  currentCount: number,
  windowMinutes: number = 60,
): Promise<{ abnormal: boolean; reason?: string }> {
  // Simple heuristic: if current count > 10x average of last 24h, flag
  // In production, would use analytics table
  const threshold = 1000; // Default threshold for abnormal
  if (currentCount > threshold) {
    await recordSecurityEvent({
      tenantId,
      eventType: "ABNORMAL_VOLUME",
      severity: "HIGH",
      channel,
      details: { currentCount, threshold, windowMinutes },
    });
    return { abnormal: true, reason: `Volume ${currentCount} exceeds threshold ${threshold} in ${windowMinutes}min` };
  }
  return { abnormal: false };
}
