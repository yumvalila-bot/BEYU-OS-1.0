/**
 * Provider registry and provider-status ledger.
 *
 * TWO THINGS THIS FILE REFUSES TO DO
 *   1. It never enables a provider because an adapter exists. `getAdapter()`
 *      answers "is there code that can speak this protocol"; whether BEYU may
 *      use it for a tenant is decided by an enabled `payment_provider_connections`
 *      row, which the runtime role cannot write. Code presence and live
 *      integration are different facts and are kept in different places.
 *   2. It never reports a single boolean "integrated". §58 requires ten separate
 *      fields, and this registry is the only place that assembles them.
 *
 * Every entry below reflects what was actually established in this environment.
 * The Tanzanian providers are `NOT_INTEGRATED` with `UNVERIFIED` /
 * `NOT_INVESTIGATED` fields because no provider documentation was retrieved and
 * no credential exists here — that is recorded as the reason, not smoothed into a
 * guess. Marking them `NONE_FOUND` would be just as false as marking them
 * `DOCUMENTED_PUBLIC`.
 */
import { PROVIDER_CAPABILITY, type PaymentProviderAdapter, type ProviderCapability, type ProviderStatusReport } from "./adapter";
import { MOCK_PROVIDER_CODE, MockProviderAdapter, mockStatus } from "./mock";

export const PROVIDER_REGISTRY_VERSION = "payment-provider-registry-1.0.0";

/** Codes the platform knows how to speak to, with the code's own claim. */
const ADAPTERS: Readonly<Record<string, PaymentProviderAdapter>> = {
  [MOCK_PROVIDER_CODE]: new MockProviderAdapter(),
};

/**
 * The external-reality ledger, one entry per provider the programme was asked to
 * cover. Keys are `payment_providers.code` values; the DB row is authoritative at
 * runtime, this catalogue is the honest starting point it must not exceed.
 */
const NOT_INVESTIGATED_EVIDENCE = {
  apiAvailability: "NOT VERIFIED IN THIS ENVIRONMENT. No provider documentation was retrieved and no request was made to any provider endpoint.",
  webhookModel: "NOT VERIFIED. Provider push vs polling must be confirmed from provider documentation before an adapter is written.",
  settlementModel: "NOT VERIFIED. Settlement cadence, cut-off times and float treatment must be confirmed with the provider and with Bank of Tanzania requirements.",
  contractStatus: "NOT INVESTIGATED. Commercial agreement, pricing and KYC/onboarding obligations are unknown to this repository.",
  credentialStatus: "NOT ISSUED. No sandbox or production credential exists in this environment (no provider secret is present in .env).",
  regulatoryEnforcement: "NOT INVESTIGATED. Any mobile-money or payment aggregation activity in Tanzania is expected to sit under Bank of Tanzania national payment systems regulation; the applicable licence class, reporting duty and data-residency rule for each provider must be confirmed by a human with the provider's own documentation and legal advice before activation. Not asserted here because no source was retrieved.",
  integrationStatus: "NOT_INTEGRATED. No adapter code exists for this provider.",
} as const;

function notIntegrated(
  provider: string,
  lastAssessedAt: string,
  extra: Partial<ProviderStatusReport> = {},
): ProviderStatusReport {
  return {
    provider,
    integrationStatus: "NOT_INTEGRATED",
    contractStatus: "NOT_INVESTIGATED",
    credentialStatus: "NOT_ISSUED",
    apiAvailability: "UNVERIFIED",
    webhookModel: "UNVERIFIED",
    settlementModel: "UNVERIFIED",
    signatureScheme: "NONE",
    regulatoryEnforcement: "NOT_INVESTIGATED",
    sandboxMode: "NONE",
    supportedCapabilities: [],
    evidence: { ...NOT_INVESTIGATED_EVIDENCE },
    blockedOn: [
      "REAL_PROVIDER_INTEGRATION = BLOCKED_EXTERNAL_DEPENDENCY: no credential, no signed agreement, no verified API documentation, no sandbox account.",
      "A provider-specific adapter must be written against verified documentation, then verified in the provider's own sandbox, before any status above can advance.",
    ],
    lastAssessedAt,
    ...extra,
  };
}

/**
 * The providers this programme was asked to cover. Listed for scope honesty:
 * having a name here means "we know we owe this one an adapter", never "we can
 * transact with it".
 */
export const REGISTERED_PROVIDER_CODES = [
  MOCK_PROVIDER_CODE,
  "MPESA_TZ",
  "AIRTEL_MONEY_TZ",
  "HALOPESA_TZ",
  "TIGO_PESA_TZ",
  "MIXX_YAS_TZ",
  "TTCL_PESA_TZ",
  "NMB_BANK_TZ",
  "CRDB_BANK_TZ",
] as const;

export type RegisteredProviderCode = (typeof REGISTERED_PROVIDER_CODES)[number];

const ASSESSED_ON = "2026-09-06";

const STATUS_LEDGER: Readonly<Record<RegisteredProviderCode, ProviderStatusReport>> = {
  [MOCK_PROVIDER_CODE]: mockStatus(),
  MPESA_TZ: notIntegrated("MPESA_TZ", ASSESSED_ON, {
    note: "Mobile money; expected capabilities once verified: INBOUND_WEBHOOK, TXN_QUERY, OUTBOUND_PAYOUT, REFUND, SETTLEMENT_BATCH.",
  }),
  AIRTEL_MONEY_TZ: notIntegrated("AIRTEL_MONEY_TZ", ASSESSED_ON, {
    note: "Mobile money; same expected capability set as other wallets. Not verified.",
  }),
  HALOPESA_TZ: notIntegrated("HALOPESA_TZ", ASSESSED_ON, { note: "Mobile money; not verified." }),
  TIGO_PESA_TZ: notIntegrated("TIGO_PESA_TZ", ASSESSED_ON, { note: "Mobile money; not verified." }),
  MIXX_YAS_TZ: notIntegrated("MIXX_YAS_TZ", ASSESSED_ON, { note: "Mobile money / mixed rail; not verified." }),
  TTCL_PESA_TZ: notIntegrated("TTCL_PESA_TZ", ASSESSED_ON, { note: "Mobile money; not verified." }),
  NMB_BANK_TZ: notIntegrated("NMB_BANK_TZ", ASSESSED_ON, {
    note: "Bank rails (payroll/bulk payment/host-to-host); expected STATEMENT_FILE and BALANCE_QUERY. Not verified.",
  }),
  CRDB_BANK_TZ: notIntegrated("CRDB_BANK_TZ", ASSESSED_ON, {
    note: "Bank rails; expected STATEMENT_FILE and BALANCE_QUERY. Not verified.",
  }),
} as unknown as Record<RegisteredProviderCode, ProviderStatusReport>;

export function adapterFor(providerCode: string): PaymentProviderAdapter | null {
  return ADAPTERS[providerCode] ?? null;
}

export function hasAdapter(providerCode: string): boolean {
  return Object.prototype.hasOwnProperty.call(ADAPTERS, providerCode);
}

export function adapterCapabilities(providerCode: string): readonly ProviderCapability[] {
  const adapter = adapterFor(providerCode);
  return adapter ? PROVIDER_CAPABILITY.filter((c) => adapter.hasCapability(c)) : [];
}

export function statusFor(providerCode: string): ProviderStatusReport | null {
  const statics = (STATUS_LEDGER as Record<string, ProviderStatusReport>)[providerCode] ?? null;
  if (!statics) return null;
  // A coded adapter raises the floor from "no code" to "code exists" — and no
  // further. Sandbox/production states require evidence, never code.
  if (statics.integrationStatus === "NOT_INTEGRATED" && hasAdapter(providerCode)) {
    return { ...statics, integrationStatus: "ADAPTER_CODED" };
  }
  return statics;
}

export function allStatuses(): ProviderStatusReport[] {
  return REGISTERED_PROVIDER_CODES.map((code) => statusFor(code)).filter((s): s is ProviderStatusReport => s !== null);
}

/**
 * The §46 rule, as a function: nothing in this registry may be presented as a
 * live integration. Called by the readiness report so a future accidental
 * promotion is caught by a test rather than by a reader.
 */
export function assertNoLiveIntegrationClaim(status: ProviderStatusReport): { ok: boolean; reason: string } {
  const live = status.integrationStatus === "PRODUCTION_CONFIGURED" || status.integrationStatus === "PRODUCTION_VERIFIED";
  if (!live) return { ok: true, reason: "status is explicitly non-live" };
  const unbacked = Object.entries(status.evidence).filter(([, value]) => NOT_VERIFIED_PATTERN.test(value));
  if (unbacked.length > 0) {
    return { ok: false, reason: `live status claimed while these fields are unverified: ${unbacked.map(([k]) => k).join(", ")}` };
  }
  if (status.blockedOn.length > 0) {
    return { ok: false, reason: `live status claimed while blockedOn is non-empty: ${status.blockedOn[0]}` };
  }
  return { ok: true, reason: "live status carries verified evidence and no open blocker" };
}

/** A field whose "evidence" says it was never checked cannot support a live claim. */
const NOT_VERIFIED_PATTERN = /NOT VERIFIED|NOT INVESTIGATED|NOT IN THIS ENVIRONMENT|no provider documentation/i;
