/**
 * Contact / Recipient 360° — governed identity resolution.
 *
 * A contact may have:
 * - GlobalUserID (canonical, verified identity linking)
 * - phone numbers, WhatsApp endpoints, email addresses, in-app, internal
 * - organization relationship, customer/supplier/employee/family relationship
 * - tenant/entity relationships, language preference, consent, verified status
 *
 * Do NOT create another identity system. Use existing canonical identity architecture.
 * Identity resolution must be explicit, auditable, tenant-aware, entity-aware,
 * country-aware, authorization-aware.
 */

import { and, eq, or, ilike, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  communicationContacts,
  communicationContactMethods,
  users,
  legalEntities,
} from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import type { ContactMethodType } from "./types";

export type ContactRecord = typeof communicationContacts.$inferSelect;
export type ContactMethodRecord = typeof communicationContactMethods.$inferSelect;

export type Contact360 = {
  contact: ContactRecord;
  methods: ContactMethodRecord[];
  globalUser?: { id: string; email: string; displayName?: string } | null;
  legalEntity?: { id: string; code: string; name: string } | null;
};

function normalizePhone(phone: string): string {
  // E.164 normalization — strip spaces, ensure + prefix
  const cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("00")) return "+" + cleaned.slice(2);
  // Default to Tanzania +255 if local format (0 prefix) — but as configuration, not hard-coded engine logic
  if (cleaned.startsWith("0")) return "+255" + cleaned.slice(1);
  return "+" + cleaned;
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function normalizeContactValue(type: ContactMethodType, value: string): string {
  switch (type) {
    case "PHONE":
    case "WHATSAPP":
      return normalizePhone(value);
    case "EMAIL":
      return normalizeEmail(value);
    default:
      return value.trim();
  }
}

export async function resolveContact360(contactId: string, tenantId: string): Promise<Contact360 | null> {
  const [contact] = await db
    .select()
    .from(communicationContacts)
    .where(and(eq(communicationContacts.id, contactId), eq(communicationContacts.tenantId, tenantId)))
    .limit(1);
  if (!contact) return null;

  const methods = await db
    .select()
    .from(communicationContactMethods)
    .where(eq(communicationContactMethods.contactId, contactId));

  let globalUser = null;
  if (contact.globalUserId) {
    const [u] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, contact.globalUserId)).limit(1);
    if (u) globalUser = { id: u.id, email: u.email, displayName: undefined };
  }

  let legalEntity = null;
  if (contact.legalEntityId) {
    const [le] = await db
      .select({ id: legalEntities.id, code: legalEntities.code, name: legalEntities.legalName })
      .from(legalEntities)
      .where(eq(legalEntities.id, contact.legalEntityId))
      .limit(1);
    if (le) legalEntity = { id: le.id, code: le.code, name: le.name };
  }

  return { contact, methods, globalUser, legalEntity };
}

export async function findContactByMethod(
  tenantId: string,
  methodType: ContactMethodType,
  value: string,
): Promise<Contact360 | null> {
  const normalized = normalizeContactValue(methodType, value);
  const [method] = await db
    .select()
    .from(communicationContactMethods)
    .where(
      and(
        eq(communicationContactMethods.tenantId, tenantId),
        eq(communicationContactMethods.methodType, methodType),
        or(
          eq(communicationContactMethods.value, value),
          eq(communicationContactMethods.normalizedValue, normalized),
        ),
      ),
    )
    .limit(1);
  if (!method) return null;
  return resolveContact360(method.contactId, tenantId);
}

export async function findContactByGlobalUserId(tenantId: string, globalUserId: string): Promise<Contact360 | null> {
  const [contact] = await db
    .select()
    .from(communicationContacts)
    .where(and(eq(communicationContacts.tenantId, tenantId), eq(communicationContacts.globalUserId, globalUserId)))
    .limit(1);
  if (!contact) return null;
  return resolveContact360(contact.id, tenantId);
}

export async function createContact(input: {
  tenantId: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  organizationName?: string;
  globalUserId?: string | null;
  legalEntityId?: string | null;
  countryCode?: string | null;
  primaryPhone?: string | null;
  primaryEmail?: string | null;
  preferredChannel?: string | null;
  preferredLanguage?: string;
  timezone?: string;
  relationshipType?: string;
  classification?: string;
  createdBy: string;
  methods?: { type: ContactMethodType; value: string; label?: string; isPrimary?: boolean }[];
}): Promise<Contact360> {
  const id = newId("CONT" as keyof typeof ID_PREFIX);
  const [contact] = await db
    .insert(communicationContacts)
    .values({
      id,
      tenantId: input.tenantId,
      displayName: input.displayName,
      firstName: input.firstName,
      lastName: input.lastName,
      organizationName: input.organizationName,
      globalUserId: input.globalUserId,
      legalEntityId: input.legalEntityId,
      countryCode: input.countryCode,
      primaryPhone: input.primaryPhone ? normalizePhone(input.primaryPhone) : null,
      primaryEmail: input.primaryEmail ? normalizeEmail(input.primaryEmail) : null,
      primaryWhatsapp: input.primaryPhone ? normalizePhone(input.primaryPhone) : null,
      preferredChannel: input.preferredChannel,
      preferredLanguage: input.preferredLanguage ?? "en",
      timezone: input.timezone ?? "UTC",
      relationshipType: input.relationshipType,
      classification: (input.classification as never) ?? "CONFIDENTIAL",
      verified: !!input.globalUserId,
      verifiedAt: input.globalUserId ? new Date() : null,
      verifiedBy: input.globalUserId ? input.createdBy : null,
      createdBy: input.createdBy,
    })
    .returning();

  const methods: ContactMethodRecord[] = [];
  if (input.methods && input.methods.length > 0) {
    for (const m of input.methods) {
      const normalized = normalizeContactValue(m.type, m.value);
      const [method] = await db
        .insert(communicationContactMethods)
        .values({
          id: newId("CMTH" as keyof typeof ID_PREFIX),
          contactId: id,
          tenantId: input.tenantId,
          methodType: m.type,
          value: m.value,
          normalizedValue: normalized,
          label: m.label,
          isPrimary: m.isPrimary ?? false,
          verified: !!input.globalUserId,
          verifiedAt: input.globalUserId ? new Date() : null,
          verificationSource: input.globalUserId ? "GLOBAL_USER_LINK" : "MANUAL",
        })
        .returning();
      methods.push(method);
    }
  } else {
    // Auto-create methods from primary endpoints
    if (input.primaryPhone) {
      const [method] = await db
        .insert(communicationContactMethods)
        .values({
          id: newId("CMTH" as keyof typeof ID_PREFIX),
          contactId: id,
          tenantId: input.tenantId,
          methodType: "PHONE",
          value: input.primaryPhone,
          normalizedValue: normalizePhone(input.primaryPhone),
          isPrimary: true,
          verified: !!input.globalUserId,
        })
        .returning();
      methods.push(method);
    }
    if (input.primaryEmail) {
      const [method] = await db
        .insert(communicationContactMethods)
        .values({
          id: newId("CMTH" as keyof typeof ID_PREFIX),
          contactId: id,
          tenantId: input.tenantId,
          methodType: "EMAIL",
          value: input.primaryEmail,
          normalizedValue: normalizeEmail(input.primaryEmail),
          isPrimary: true,
          verified: !!input.globalUserId,
        })
        .returning();
      methods.push(method);
    }
  }

  return { contact, methods, globalUser: null, legalEntity: null };
}

export async function linkGlobalUserId(
  contactId: string,
  tenantId: string,
  globalUserId: string,
  verifiedBy: string,
): Promise<void> {
  await db
    .update(communicationContacts)
    .set({
      globalUserId,
      verified: true,
      verifiedAt: new Date(),
      verifiedBy,
      updatedAt: new Date(),
    })
    .where(and(eq(communicationContacts.id, contactId), eq(communicationContacts.tenantId, tenantId)));

  // Also mark methods as verified
  await db
    .update(communicationContactMethods)
    .set({ verified: true, verifiedAt: new Date(), verificationSource: "GLOBAL_USER_LINK" })
    .where(eq(communicationContactMethods.contactId, contactId));
}

export async function searchContacts(tenantId: string, query: string, limit = 20): Promise<ContactRecord[]> {
  return db
    .select()
    .from(communicationContacts)
    .where(and(eq(communicationContacts.tenantId, tenantId), ilike(communicationContacts.displayName, `%${query}%`)))
    .limit(limit);
}
