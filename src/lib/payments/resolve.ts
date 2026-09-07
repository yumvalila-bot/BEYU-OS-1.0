/**
 * Counterparty, account and invoice resolution.
 *
 * WHAT "RESOLVED" MEANS HERE
 *   A provider's text is a claim about a string, not about a customer. Resolution
 *   therefore only ever produces an identity when a canonical BEYU record matches
 *   EXACTLY on a normalized key, and the match is unambiguous. Everything else is
 *   a named gap. There is no branch of this file that says "the name looked
 *   similar, so attribute the money" — that is the failure mode §19 prohibits,
 *   because an attributed transaction becomes revenue in the ledger.
 *
 * PRIVACY STANCE
 *   The provider sends a phone number. We do not persist it. We persist a masked
 *   form (last four characters) and, when a dedicated HMAC key is configured, a
 *   keyed digest used only for equality. An unsalted SHA-256 of a Tanzanian MSISDN
 *   is trivially reversible by enumeration (the number space is ~10^9), so with no
 *   key configured we store no digest at all and record the gap. Failing to hash
 *   is a smaller loss than hashing in a way that can be undone.
 */
import { createHmac, createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, type DatabaseTransaction } from "@/db";
import { parties, roleAssignments, users } from "@/db/schema";
import { paymentAccounts } from "@/db/schema";

export const RESOLVE_VERSION = "payment-resolve-1.1.0";

/** Env var whose value keys the counterparty digest. Absent ⇒ no digest is produced. */
export const PARTY_DIGEST_KEY_ENV = "BEYU_PAYMENT_PARTY_HASH_KEY";

export type NormalizedRef = {
  /** Canonical comparison key. Never persisted raw. */
  key: string;
  kind: "MSISDN" | "ACCOUNT" | "WALLET" | "REFERENCE";
  masked: string;
};

const DIGITS = /\D+/g;

/**
 * Deterministic normalization. Country-aware only for the numbering plans this
 * deployment legitimately speaks (TZ first); an unrecognized shape stays a
 * generic reference rather than being forced into a phone number.
 */
export function normalizeCounterpartyRef(raw: string | null, countryCode: string): NormalizedRef | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^\+?\d[\d\s-]{6,}$/.test(trimmed)) {
    let digits = trimmed.replace(DIGITS, "");
    if (trimmed.startsWith("+")) digits = digits.replace(/^0+/, "");
    const cc = countryCode.toUpperCase();
    if (cc === "TZ") {
      if (digits.startsWith("0")) digits = `255${digits.slice(1)}`;
      else if (!digits.startsWith("255")) digits = `255${digits}`;
    } else if (cc === "KE") {
      if (digits.startsWith("0")) digits = `254${digits.slice(1)}`;
      else if (!digits.startsWith("254")) digits = `254${digits}`;
    }
    if (digits.length < 8) return { key: digits, kind: "REFERENCE", masked: mask(digits) };
    return { key: digits, kind: "MSISDN", masked: mask(digits) };
  }

  if (/^[A-Za-z]{2}\d[\dA-Za-z]{6,30}$/.test(trimmed.replace(/\s+/g, ""))) {
    const v = trimmed.replace(/\s+/g, "").toUpperCase();
    return { key: v, kind: "ACCOUNT", masked: mask(v) };
  }

  const generic = trimmed.toUpperCase().replace(/\s+/g, "");
  return { key: generic, kind: "REFERENCE", masked: mask(generic) };
}

function mask(value: string): string {
  if (value.length <= 4) return "*".repeat(value.length);
  return `****${value.slice(-4)}`;
}

export function counterpartyDigest(key: string | null): { digest: string | null; gap: string | null } {
  if (!key) return { digest: null, gap: "COUNTERPARTY_KEY_ABSENT" };
  const secret = process.env[PARTY_DIGEST_KEY_ENV];
  if (!secret || secret.length < 16) {
    return { digest: null, gap: "PARTY_DIGEST_UNAVAILABLE_NO_KEY" };
  }
  return { digest: createHmac("sha256", secret).update(key, "utf8").digest("hex"), gap: null };
}

/** Digest used for the account registry. Not keyed: an account id is not personal data in the same sense. */
export function stableDigest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export type PartyResolution = {
  partyId: string | null;
  customerUserId: string | null;
  gap: string | null;
  method: "EXACT_PHONE_TENANT_MEMBER" | "NONE";
  candidateCount: number;
};

/**
 * Exact phone match, then a tenant-membership test.
 *
 * The membership test is not decoration: `parties` is the cross-OS identity
 * layer and deliberately has no tenant column, so a phone match alone would let
 * one tenant's payment feed reveal which other tenants a person belongs to. A
 * candidate that is not a member of THIS tenant is refused, and the refusal is
 * recorded as a gap so it is visible in the exception queue.
 */
export async function resolveParty(input: {
  tenantId: string;
  normalizedKey: string | null;
  tx?: DatabaseTransaction;
}): Promise<PartyResolution> {
  if (!input.normalizedKey) {
    return { partyId: null, customerUserId: null, gap: "COUNTERPARTY_REF_ABSENT", method: "NONE", candidateCount: 0 };
  }
  const handle = input.tx ?? db;
  const rows = await handle
    .select({
      partyId: parties.id,
      userId: users.id,
      primaryTenantId: users.primaryTenantId,
    })
    .from(parties)
    .innerJoin(users, eq(users.partyId, parties.id))
    .where(and(sql`${parties.phone} = ${input.normalizedKey}`, sql`${users.status} = 'ACTIVE'`));

  if (rows.length === 0) {
    return { partyId: null, customerUserId: null, gap: "UNKNOWN_PARTY", method: "NONE", candidateCount: 0 };
  }
  if (rows.length > 1) {
    return { partyId: null, customerUserId: null, gap: "PARTY_AMBIGUOUS", method: "NONE", candidateCount: rows.length };
  }
  const candidate = rows[0]!;
  const member =
    candidate.primaryTenantId === input.tenantId ||
    (
      await handle
        .select({ one: sql`1` })
        .from(roleAssignments)
        .where(and(eq(roleAssignments.userId, candidate.userId), eq(roleAssignments.tenantId, input.tenantId)))
        .limit(1)
    ).length > 0;
  if (!member) {
    return {
      partyId: null,
      customerUserId: null,
      gap: "PARTY_NOT_IN_TENANT",
      method: "NONE",
      candidateCount: rows.length,
    };
  }
  return { partyId: candidate.partyId, customerUserId: candidate.userId, gap: null, method: "EXACT_PHONE_TENANT_MEMBER", candidateCount: 1 };
}

/**
 * Which of OUR accounts received or sent the money — from the registered account
 * table, matched on the digest of the normalized external identifier. An
 * unregistered account id is a gap, because attributing money to an unmapped
 * account would break the clearing entry before it is even drafted.
 */
export async function resolveAccount(input: {
  tenantId: string;
  connectionId: string;
  externalId: string | null;
  tx?: DatabaseTransaction;
}): Promise<{ accountId: string | null; gap: string | null }> {
  if (!input.externalId) return { accountId: null, gap: "DESTINATION_ACCOUNT_ABSENT" };
  const handle = input.tx ?? db;
  const digest = stableDigest(normalizeCounterpartyRef(input.externalId, "")?.key ?? input.externalId);
  const rows = await handle
    .select({ id: paymentAccounts.id })
    .from(paymentAccounts)
    .where(
      and(
        eq(paymentAccounts.tenantId, input.tenantId),
        eq(paymentAccounts.connectionId, input.connectionId),
        eq(paymentAccounts.externalAccountDigest, digest),
        eq(paymentAccounts.status, "ACTIVE"),
      ),
    )
    .limit(2);
  if (rows.length === 1) return { accountId: rows[0]!.id, gap: null };
  return { accountId: null, gap: rows.length === 0 ? "ACCOUNT_NOT_REGISTERED" : "ACCOUNT_AMBIGUOUS" };
}
