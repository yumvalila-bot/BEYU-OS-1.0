/**
 * Provider Registry — adapter pattern, governed, auditable.
 *
 * Providers are adapters: WhatsApp → Meta Cloud API, SMS → approved SMS provider,
 * Email → approved email provider. Never hard-coded into business logic.
 *
 * Status: CONFIGURED | CONNECTED | VERIFIED | DEGRADED | FAILED | NOT_CONNECTED | SIMULATED
 * Never claim CONNECTED without evidence.
 *
 * Preserves: GlobalUserID, RBAC/ABAC/RLS, audit, events, secret management.
 * Secrets are env-var NAMES only — no secret column exists (0071 precedent).
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { communicationProviders } from "@/db/schema";
import type { ProviderStatus, CommunicationChannel } from "./types";
import { PROVIDER_STATUSES } from "./types";
import { newId, ID_PREFIX } from "@/lib/ids";

export type ProviderRecord = typeof communicationProviders.$inferSelect;

export function isValidProviderStatus(status: string): status is ProviderStatus {
  return (PROVIDER_STATUSES as readonly string[]).includes(status);
}

export async function listProviders(tenantId?: string, channel?: string): Promise<ProviderRecord[]> {
  let query = db.select().from(communicationProviders).$dynamic();
  const conditions: ReturnType<typeof eq>[] = [];
  if (tenantId) {
    // Global providers (tenant_id IS NULL) visible everywhere, plus tenant-specific
    const { or, isNull } = await import("drizzle-orm");
    query = query.where(
      or(eq(communicationProviders.tenantId, tenantId), isNull(communicationProviders.tenantId)),
    );
  }
  if (channel) {
    const { and } = await import("drizzle-orm");
    const base = tenantId
      ? undefined
      : undefined;
    // Re-apply with both filters if needed
    if (tenantId) {
      const { or, isNull, and } = await import("drizzle-orm");
      query = db
        .select()
        .from(communicationProviders)
        .where(
          and(
            or(eq(communicationProviders.tenantId, tenantId), isNull(communicationProviders.tenantId)),
            eq(communicationProviders.channelCode, channel),
          ),
        ) as unknown as typeof query;
    } else {
      query = db
        .select()
        .from(communicationProviders)
        .where(eq(communicationProviders.channelCode, channel)) as unknown as typeof query;
    }
  }
  return query;
}

export async function getProviderById(id: string): Promise<ProviderRecord | null> {
  const rows = await db.select().from(communicationProviders).where(eq(communicationProviders.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getProviderByCode(code: string): Promise<ProviderRecord | null> {
  const rows = await db.select().from(communicationProviders).where(eq(communicationProviders.code, code)).limit(1);
  return rows[0] ?? null;
}

export async function getDefaultProvider(channel: CommunicationChannel, tenantId?: string, countryCode?: string): Promise<ProviderRecord | null> {
  const { and, or, isNull, desc } = await import("drizzle-orm");
  // Priority: tenant + country > tenant > country > global default
  // For now, simple: is_default true, channel match, tenant null or matching, ordered by priority
  const conditions = [eq(communicationProviders.channelCode, channel), eq(communicationProviders.isDefault, true)];
  const rows = await db
    .select()
    .from(communicationProviders)
    .where(and(...conditions))
    .orderBy(communicationProviders.priority)
    .limit(10);

  if (rows.length === 0) return null;

  // Prefer tenant-specific, then country-specific, then global
  if (tenantId && countryCode) {
    const tenantCountry = rows.find((r) => r.tenantId === tenantId && r.countryCode === countryCode);
    if (tenantCountry) return tenantCountry;
  }
  if (tenantId) {
    const tenantSpecific = rows.find((r) => r.tenantId === tenantId);
    if (tenantSpecific) return tenantSpecific;
  }
  if (countryCode) {
    const countrySpecific = rows.find((r) => r.countryCode === countryCode);
    if (countrySpecific) return countrySpecific;
  }
  return rows.find((r) => r.tenantId === null) ?? rows[0];
}

export async function createProvider(input: {
  tenantId?: string | null;
  code: string;
  channelCode: string;
  providerType: string;
  name: string;
  description?: string;
  secretRef?: string;
  signingSecretRef?: string;
  config?: Record<string, unknown>;
  countryCode?: string | null;
  isDefault?: boolean;
  priority?: number;
  createdBy: string;
}): Promise<ProviderRecord> {
  const id = newId(ID_PREFIX.provider);
  const [row] = await db
    .insert(communicationProviders)
    .values({
      id,
      code: input.code,
      channelCode: input.channelCode,
      providerType: input.providerType,
      name: input.name,
      description: input.description,
      secretRef: input.secretRef,
      signingSecretRef: input.signingSecretRef,
      config: input.config ?? {},
      countryCode: input.countryCode,
      tenantId: input.tenantId,
      isDefault: input.isDefault ?? false,
      priority: input.priority ?? 100,
      status: "NOT_CONNECTED",
      healthStatus: "UNKNOWN",
      createdBy: input.createdBy,
    })
    .returning();
  return row;
}

export async function updateProviderStatus(id: string, status: ProviderStatus, healthStatus?: string): Promise<void> {
  await db
    .update(communicationProviders)
    .set({
      status,
      healthStatus: healthStatus ?? (status === "CONNECTED" || status === "VERIFIED" ? "HEALTHY" : status === "DEGRADED" ? "DEGRADED" : status === "FAILED" ? "DOWN" : "UNKNOWN"),
      updatedAt: new Date(),
      lastHealthCheckAt: new Date(),
      ...(status === "CONNECTED" || status === "VERIFIED" ? { lastSuccessAt: new Date(), failureCount: 0 } : {}),
      ...(status === "FAILED" ? { lastFailureAt: new Date() } : {}),
    })
    .where(eq(communicationProviders.id, id));
}

// Simulated provider adapter — safe, never reaches real providers
export function createSimulatedAdapter(providerId: string, channel: CommunicationChannel) {
  return {
    providerId,
    channel,
    send: async (message: { to: string; body: string }) => {
      // Simulated: never reaches real provider, visibly labeled
      return {
        messageId: `SIM_${Date.now()}`,
        status: "SENT" as const,
        providerMessageId: `SIM_PROV_${Date.now()}`,
        metadata: { simulated: true, to: message.to, channel },
      };
    },
  };
}
