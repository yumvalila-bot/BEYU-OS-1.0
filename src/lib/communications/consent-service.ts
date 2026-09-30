/**
 * Consent & Preferences — governed, auditable, fail-closed.
 *
 * Reuse existing consent architecture where applicable, but communications
 * needs channel-specific consent (WhatsApp, SMS, Email, In-App, Internal,
 * Marketing, Reports, Invoices, Alerts).
 *
 * Marketing must never be sent without appropriate consent.
 * Preserve: opt-in, opt-out, revocation, timestamp, source, purpose, evidence.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { communicationConsents, communicationPreferences } from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import type { ConsentPurpose, ConsentStatus } from "./types";
import { CONSENT_PURPOSES, CONSENT_STATUSES } from "./types";

export type ConsentRecord = typeof communicationConsents.$inferSelect;
export type PreferenceRecord = typeof communicationPreferences.$inferSelect;

export function isValidConsentPurpose(purpose: string): boolean {
  return (CONSENT_PURPOSES as readonly string[]).includes(purpose);
}

export function isValidConsentStatus(status: string): boolean {
  return (CONSENT_STATUSES as readonly string[]).includes(status);
}

export async function getConsent(
  contactId: string,
  tenantId: string,
  purpose: ConsentPurpose,
  channel: string,
): Promise<ConsentRecord | null> {
  const [row] = await db
    .select()
    .from(communicationConsents)
    .where(
      and(
        eq(communicationConsents.contactId, contactId),
        eq(communicationConsents.tenantId, tenantId),
        eq(communicationConsents.purpose, purpose),
        eq(communicationConsents.channel, channel),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getAllConsents(contactId: string, tenantId: string): Promise<ConsentRecord[]> {
  return db
    .select()
    .from(communicationConsents)
    .where(and(eq(communicationConsents.contactId, contactId), eq(communicationConsents.tenantId, tenantId)));
}

export async function checkConsentAllowed(input: {
  contactId: string;
  tenantId: string;
  purpose: ConsentPurpose;
  channel: string;
}): Promise<{ allowed: boolean; reason: string; consent?: ConsentRecord }> {
  // Security, transactional, operational are always allowed (with policy checks elsewhere)
  if (["TRANSACTIONAL", "OPERATIONAL", "SECURITY"].includes(input.purpose)) {
    return { allowed: true, reason: `${input.purpose} communications are always permitted` };
  }

  // Marketing, research, feedback require explicit OPT_IN
  const consent = await getConsent(input.contactId, input.tenantId, input.purpose, input.channel);
  if (!consent) {
    // Also check ALL channel consent
    const allChannelConsent = await getConsent(input.contactId, input.tenantId, input.purpose, "ALL");
    if (allChannelConsent && allChannelConsent.status === "OPT_IN") {
      return { allowed: true, reason: `OPT_IN via ALL channel for ${input.purpose}`, consent: allChannelConsent };
    }
    return { allowed: false, reason: `No consent for ${input.purpose} via ${input.channel}` };
  }

  if (consent.status === "OPT_IN") {
    // Check expiry
    if (consent.expiresAt && consent.expiresAt < new Date()) {
      return { allowed: false, reason: `Consent expired for ${input.purpose} via ${input.channel}`, consent };
    }
    return { allowed: true, reason: `OPT_IN for ${input.purpose} via ${input.channel}`, consent };
  }

  return { allowed: false, reason: `Consent status ${consent.status} for ${input.purpose} via ${input.channel}`, consent };
}

export async function recordConsent(input: {
  contactId: string;
  tenantId: string;
  purpose: ConsentPurpose;
  channel: string;
  status: ConsentStatus;
  source: string;
  evidenceRef?: string;
  evidenceDocumentId?: string | null;
  createdBy: string;
  expiresAt?: Date | null;
}): Promise<ConsentRecord> {
  const id = newId(ID_PREFIX.commConsent);
  const [row] = await db
    .insert(communicationConsents)
    .values({
      id,
      contactId: input.contactId,
      tenantId: input.tenantId,
      purpose: input.purpose,
      channel: input.channel,
      status: input.status,
      source: input.source,
      evidenceRef: input.evidenceRef,
      evidenceDocumentId: input.evidenceDocumentId,
      consentedAt: input.status === "OPT_IN" ? new Date() : undefined,
      revokedAt: input.status === "OPT_OUT" || input.status === "REVOKED" ? new Date() : null,
      expiresAt: input.expiresAt,
      createdBy: input.createdBy,
    })
    .onConflictDoUpdate({
      target: [communicationConsents.contactId, communicationConsents.purpose, communicationConsents.channel],
      set: {
        status: input.status,
        source: input.source,
        evidenceRef: input.evidenceRef,
        evidenceDocumentId: input.evidenceDocumentId,
        consentedAt: input.status === "OPT_IN" ? new Date() : undefined,
        revokedAt: input.status === "OPT_OUT" || input.status === "REVOKED" ? new Date() : null,
        expiresAt: input.expiresAt,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function revokeConsent(
  contactId: string,
  tenantId: string,
  purpose: ConsentPurpose,
  channel: string,
  revokedBy: string,
): Promise<ConsentRecord | null> {
  const [row] = await db
    .update(communicationConsents)
    .set({
      status: "REVOKED",
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(communicationConsents.contactId, contactId),
        eq(communicationConsents.tenantId, tenantId),
        eq(communicationConsents.purpose, purpose),
        eq(communicationConsents.channel, channel),
      ),
    )
    .returning();
  return row ?? null;
}

// Preferences

export async function getPreferences(contactId: string, tenantId: string): Promise<PreferenceRecord[]> {
  return db
    .select()
    .from(communicationPreferences)
    .where(and(eq(communicationPreferences.contactId, contactId), eq(communicationPreferences.tenantId, tenantId)));
}

export async function getPreference(
  contactId: string,
  tenantId: string,
  channel: string,
): Promise<PreferenceRecord | null> {
  const [row] = await db
    .select()
    .from(communicationPreferences)
    .where(
      and(
        eq(communicationPreferences.contactId, contactId),
        eq(communicationPreferences.tenantId, tenantId),
        eq(communicationPreferences.channel, channel),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function setPreference(input: {
  contactId: string;
  tenantId: string;
  channel: string;
  enabled: boolean;
  priority?: number;
  language?: string;
  frequency?: string;
}): Promise<PreferenceRecord> {
  const id = newId(ID_PREFIX.commPreference);
  const [row] = await db
    .insert(communicationPreferences)
    .values({
      id,
      contactId: input.contactId,
      tenantId: input.tenantId,
      channel: input.channel,
      enabled: input.enabled,
      priority: input.priority ?? 100,
      language: input.language ?? "en",
      frequency: input.frequency ?? "IMMEDIATE",
    })
    .onConflictDoUpdate({
      target: [communicationPreferences.contactId, communicationPreferences.channel],
      set: {
        enabled: input.enabled,
        priority: input.priority ?? 100,
        language: input.language ?? "en",
        frequency: input.frequency ?? "IMMEDIATE",
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}
