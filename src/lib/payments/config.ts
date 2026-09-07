/**
 * Governed payment configuration, read side.
 *
 * WHY THERE IS NO WRITE SIDE HERE
 *   `payment_providers`, `payment_provider_connections`, `payment_accounts`,
 *   `payment_account_mappings` and `payment_policies` carry a SELECT-only RLS
 *   policy and have INSERT/UPDATE/DELETE revoked from the runtime role (migration
 *   0028). So this module can only read. Configuration changes are governed acts
 *   with an approver and a reference, recorded by
 *   `scripts/payment-config.ts` through the admin DSN. If this file grew an
 *   `updatePolicy()` the entire point of the revocation would be undone by the
 *   application's own credentials, which is exactly the platform finding F-01
 *   shape this program promised not to repeat.
 *
 * CREDENTIALS NEVER APPEAR HERE AS VALUES
 *   A connection stores the NAME of an environment variable. The value is read
 *   from the process environment at the moment of use and is never persisted,
 *   returned, logged or compared against a stored copy.
 */
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  paymentAccountMappings,
  paymentPolicies,
  paymentProviderConnections,
  paymentProviders,
} from "@/db/schema";
import { ledgerAccounts } from "@/db/schema/finance";

export const PAYMENT_CONFIG_VERSION = "payment-config-1.0.0";

export type MappingRole =
  | "RECEIVABLE"
  | "CLEARING"
  | "CASH"
  | "FEE_EXPENSE"
  | "TAX_PAYABLE"
  | "SETTLEMENT_LIABILITY"
  | "SUSPENSE";

export const MAPPING_ROLES: readonly MappingRole[] = [
  "RECEIVABLE",
  "CLEARING",
  "CASH",
  "FEE_EXPENSE",
  "TAX_PAYABLE",
  "SETTLEMENT_LIABILITY",
  "SUSPENSE",
];

export type ResolvedPolicy = {
  id: string;
  currency: string;
  maxTransactionMinor: number;
  dailyInboundLimitMinor: number | null;
  dailyOutboundLimitMinor: number | null;
  autoPostCeilingMinor: number | null;
  confidenceFloor: number;
  maxClockSkewSeconds: number;
  requireApprovalAboveMinor: number | null;
  matchRulesetVersion: string;
  unknownTransactionTreatment: "SUSPENSE_REVIEW" | "REJECT";
  policyVersion: string;
};

export type ResolvedConnection = {
  connectionId: string;
  providerCode: string;
  providerDisplayName: string;
  providerKind: string;
  providerCountryCode: string;
  integrationStatus: string;
  signatureScheme: string;
  tenantId: string;
  legalEntityId: string;
  countryCode: string;
  environment: "SANDBOX" | "PRODUCTION";
  label: string;
  signingSecretRef: string | null;
  credentialRef: string | null;
  baseUrl: string | null;
  providerCapabilities: Record<string, boolean>;
};

export type PaymentConfiguration = {
  connection: ResolvedConnection;
  /** Null when no enabled policy covers this tenant/entity/provider/currency. */
  policy: ResolvedPolicy | null;
  /** mapping role -> ledger account id. Absent roles are missing mappings, not zero. */
  accountMappingIds: Partial<Record<MappingRole, string>>;
  /** Human-readable reasons the configuration is incomplete. Surfaced, never hidden. */
  problems: string[];
};

/** A `*_ref` column names an environment variable. Nothing else is accepted. */
export function secretFromRef(ref: string | null): string | null {
  if (!ref) return null;
  if (!/^[A-Z][A-Z0-9_]{2,}$/.test(ref)) return null;
  const value = process.env[ref];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function refLooksLikeSecretValue(ref: string): boolean {
  // Defence in depth: a value pasted into a *_ref column must be refused at the
  // door rather than trusted because the column is named correctly.
  return !/^[A-Z][A-Z0-9_]{2,}$/.test(ref);
}

type ConnectionRow = typeof paymentProviderConnections.$inferSelect;
type ProviderRow = typeof paymentProviders.$inferSelect;

/**
 * Find the enabled connection(s) for a provider code. The webhook path supplies
 * the provider; an optional `x-beyu-connection` header disambiguates a tenant
 * running the same provider twice. Never resolved from the payload body.
 */
export async function findCandidateConnections(input: {
  providerCode: string;
  connectionId?: string | null;
}): Promise<ConnectionRow[]> {
  const clauses = [eq(paymentProviderConnections.providerCode, input.providerCode), eq(paymentProviderConnections.enabled, 1)];
  if (input.connectionId) clauses.push(eq(paymentProviderConnections.id, input.connectionId));
  return db
    .select()
    .from(paymentProviderConnections)
    .where(and(...clauses));
}

function toPolicy(row: typeof paymentPolicies.$inferSelect, currency: string): ResolvedPolicy {
  return {
    id: row.id,
    currency,
    maxTransactionMinor: Number(row.maxTransactionMinor),
    dailyInboundLimitMinor: row.dailyInboundLimitMinor === null ? null : Number(row.dailyInboundLimitMinor),
    dailyOutboundLimitMinor: row.dailyOutboundLimitMinor === null ? null : Number(row.dailyOutboundLimitMinor),
    autoPostCeilingMinor: row.autoPostCeilingMinor === null ? null : Number(row.autoPostCeilingMinor),
    confidenceFloor: Number(row.confidenceFloor),
    maxClockSkewSeconds: row.maxClockSkewSeconds,
    requireApprovalAboveMinor: row.requireApprovalAboveMinor === null ? null : Number(row.requireApprovalAboveMinor),
    matchRulesetVersion: row.matchRulesetVersion,
    unknownTransactionTreatment: row.unknownTransactionTreatment as ResolvedPolicy["unknownTransactionTreatment"],
    policyVersion: row.policyVersion,
  };
}

/**
 * Most-specific-first policy resolution: tenant+entity+provider+currency, then
 * tenant+provider+currency (entity NULL), then tenant-wide. An exact currency
 * match is required — falling back across currencies would apply a TZS ceiling
 * to a USD flow.
 */
async function resolvePolicy(input: {
  tenantId: string;
  legalEntityId: string;
  providerCode: string;
  currency: string;
}): Promise<ResolvedPolicy | null> {
  const rows = await db
    .select()
    .from(paymentPolicies)
    .where(
      and(
        eq(paymentPolicies.tenantId, input.tenantId),
        eq(paymentPolicies.currency, input.currency),
        eq(paymentPolicies.enabled, 1),
        or(isNull(paymentPolicies.providerCode), eq(paymentPolicies.providerCode, input.providerCode)),
        or(isNull(paymentPolicies.legalEntityId), eq(paymentPolicies.legalEntityId, input.legalEntityId)),
      ),
    );
  if (rows.length === 0) return null;
  const score = (r: (typeof rows)[number]): number =>
    (r.legalEntityId === input.legalEntityId ? 2 : 0) + (r.providerCode === input.providerCode ? 1 : 0);
  const best = [...rows].sort((a, b) => score(b) - score(a))[0];
  return best ? toPolicy(best, input.currency) : null;
}

async function resolveMappings(input: {
  tenantId: string;
  legalEntityId: string;
  providerCode: string;
  currency: string;
}): Promise<Partial<Record<MappingRole, string>>> {
  const rows = await db
    .select({
      mappingRole: paymentAccountMappings.mappingRole,
      ledgerAccountId: paymentAccountMappings.ledgerAccountId,
      providerCode: paymentAccountMappings.providerCode,
      currency: paymentAccountMappings.currency,
      active: ledgerAccounts.active,
    })
    .from(paymentAccountMappings)
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, paymentAccountMappings.ledgerAccountId))
    .where(
      and(
        eq(paymentAccountMappings.tenantId, input.tenantId),
        eq(paymentAccountMappings.legalEntityId, input.legalEntityId),
        or(isNull(paymentAccountMappings.providerCode), eq(paymentAccountMappings.providerCode, input.providerCode)),
        or(isNull(paymentAccountMappings.currency), eq(paymentAccountMappings.currency, input.currency)),
      ),
    );
  const out: Partial<Record<MappingRole, string>> = {};
  for (const row of rows) {
    if (!row.active) continue; // a deactivated account is not a mapping
    const existing = out[row.mappingRole as MappingRole];
    // Deterministic winner: a provider-specific, currency-specific mapping beats
    // a wildcard. Ambiguity must never be resolved by row order.
    const specificity =
      (row.providerCode === input.providerCode ? 2 : 0) + (row.currency === input.currency ? 1 : 0);
    const current = (out as Record<string, unknown>)[`__score_${row.mappingRole}`];
    if (existing && typeof current === "number" && current >= specificity) continue;
    out[row.mappingRole as MappingRole] = row.ledgerAccountId;
    (out as Record<string, unknown>)[`__score_${row.mappingRole}`] = specificity;
  }
  for (const key of Object.keys(out)) {
    if (key.startsWith("__score_")) delete out[key as MappingRole];
  }
  return out;
}

export function requiredMappingRoles(direction: "INBOUND" | "OUTBOUND"): MappingRole[] {
  return direction === "INBOUND"
    ? ["RECEIVABLE", "CASH", "SUSPENSE"]
    : ["CASH", "FEE_EXPENSE", "SUSPENSE"];
}

/**
 * Assemble everything the pipeline may consult about one inbound event.
 * `problems` is returned rather than thrown: ingestion must still record and
 * quarantine an event for an incompletely configured tenant, because refusing to
 * store the event would lose the money trail. What the problems block is the
 * advance into accounting.
 */
export async function loadConfiguration(input: {
  connection: ConnectionRow;
  provider: ProviderRow;
  currency: string;
  direction: "INBOUND" | "OUTBOUND";
}): Promise<PaymentConfiguration> {
  const problems: string[] = [];
  const policy = await resolvePolicy({
    tenantId: input.connection.tenantId,
    legalEntityId: input.connection.legalEntityId,
    providerCode: input.connection.providerCode,
    currency: input.currency,
  });
  if (!policy) problems.push("POLICY_MISSING");

  const accountMappingIds = await resolveMappings({
    tenantId: input.connection.tenantId,
    legalEntityId: input.connection.legalEntityId,
    providerCode: input.connection.providerCode,
    currency: input.currency,
  });
  const missingRoles = requiredMappingRoles(input.direction).filter((role) => !accountMappingIds[role]);
  if (missingRoles.length > 0) problems.push(`ACCOUNT_MAPPING_MISSING:${missingRoles.join(",")}`);

  if (!input.connection.signingSecretRef) problems.push("NO_SIGNING_SECRET_REF");
  if (input.provider.integrationStatus === "NOT_INTEGRATED") problems.push("PROVIDER_NOT_INTEGRATED");

  const connection: ResolvedConnection = {
    connectionId: input.connection.id,
    providerCode: input.connection.providerCode,
    providerDisplayName: input.provider.displayName,
    providerKind: input.provider.kind,
    providerCountryCode: input.provider.countryCode,
    integrationStatus: input.provider.integrationStatus,
    signatureScheme: input.provider.signatureScheme,
    tenantId: input.connection.tenantId,
    legalEntityId: input.connection.legalEntityId,
    countryCode: input.connection.countryCode,
    environment: input.connection.environment as ResolvedConnection["environment"],
    label: input.connection.label,
    signingSecretRef: input.connection.signingSecretRef,
    credentialRef: input.connection.credentialRef,
    baseUrl: input.connection.baseUrl,
    providerCapabilities:
      typeof input.provider.capabilities === "object" && input.provider.capabilities !== null
        ? (input.provider.capabilities as Record<string, boolean>)
        : {},
  };

  return { connection, policy, accountMappingIds, problems };
}

/**
 * The governed confidence floor for a transaction's context. Called by the
 * review route so a human decision is checked against the SAME floor the machine
 * was measured against — a reviewer must not be able to confirm a match that the
 * policy would have refused to auto-confirm, which would make the floor advisory.
 */
export async function resolveConfidenceFloor(input: {
  tenantId: string;
  legalEntityId: string;
  providerCode: string;
  currency: string;
}): Promise<number> {
  const policy = await resolvePolicy(input);
  return policy?.confidenceFloor ?? 1;
}

export async function loadProviderRow(providerCode: string): Promise<ProviderRow | null> {
  const rows = await db.select().from(paymentProviders).where(eq(paymentProviders.code, providerCode)).limit(1);
  return rows[0] ?? null;
}
