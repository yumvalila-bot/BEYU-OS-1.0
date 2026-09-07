/**
 * Provider adapter contract — the only shape through which a payment provider
 * can speak to BEYU OS.
 *
 * THE CONTRACT'S PURPOSE IS NOT CONVENIENCE, IT IS CONTAINMENT.
 *   An adapter exists to translate; it has no database handle, no principal, no
 *   capability authority and no ability to assert a fact about the ledger. It
 *   returns a candidate and an evidence bundle. Everything downstream —
 *   verification, idempotency, matching, the accounting gate, `postJournal()` —
 *   lives outside this interface on purpose, so that adding a provider can never
 *   accidentally change how money is proved. That is what "no provider-specific
 *   logic in Finance OS" means in code.
 *
 * CAPABILITIES ARE CLAIMS, NOT FACTS
 *   `capabilities` describes what the adapter can attempt. It does not say the
 *   provider accepted anything, and it is entirely separate from
 *   `ProviderIntegrationStatus`, which is the only field that speaks about
 *   external reality. An adapter can be fully implemented and still report
 *   `BLOCKED_EXTERNAL_DEPENDENCY`.
 */

import type { Direction, TransactionType } from "../domain";

export const PROVIDER_CAPABILITY = [
  "INBOUND_WEBHOOK",
  "TXN_QUERY",
  "OUTBOUND_PAYOUT",
  "REFUND",
  "REVERSAL_NOTICE",
  "SETTLEMENT_BATCH",
  "STATEMENT_FILE",
  "BALANCE_QUERY",
] as const;
export type ProviderCapability = (typeof PROVIDER_CAPABILITY)[number];

/**
 * The ten independent facts §58 requires per provider. Deliberately a record of
 * separate fields: a single `integrated` boolean is what lets a mock be
 * mistaken for production, so the type refuses to express it.
 */
export const INTEGRATION_STATUS = [
  "NOT_INTEGRATED",
  "ADAPTER_CODED",
  "SANDBOX_CONFIGURED",
  "SANDBOX_VERIFIED",
  "PRODUCTION_CONFIGURED",
  "PRODUCTION_VERIFIED",
  "BLOCKED_EXTERNAL_DEPENDENCY",
] as const;
export type ProviderIntegrationStatus = (typeof INTEGRATION_STATUS)[number];

export const CONTRACT_STATUS = ["NOT_INVESTIGATED", "REQUIRED", "IN_PROGRESS", "SIGNED", "NOT_REQUIRED"] as const;
export type ProviderContractStatus = (typeof CONTRACT_STATUS)[number];

export const CREDENTIAL_STATUS = [
  "NOT_ISSUED",
  "SANDBOX_ISSUED",
  "PRODUCTION_ISSUED",
  "ROTATION_REQUIRED",
  "REFUSED",
] as const;
export type ProviderCredentialStatus = (typeof CREDENTIAL_STATUS)[number];

export const API_AVAILABILITY = ["UNVERIFIED", "DOCUMENTED_PUBLIC", "DOCUMENTED_PARTNER", "NONE_FOUND"] as const;
export type ProviderApiAvailability = (typeof API_AVAILABILITY)[number];

export const WEBHOOK_MODEL = ["UNVERIFIED", "PROVIDER_PUSH", "POLL_ONLY"] as const;
export type ProviderWebhookModel = (typeof WEBHOOK_MODEL)[number];

export const SETTLEMENT_MODEL = [
  "UNVERIFIED",
  "AUTOMATIC_DAILY",
  "MANUAL_BATCH",
  "PER_TRANSACTION",
  "UNKNOWN",
] as const;
export type ProviderSettlementModel = (typeof SETTLEMENT_MODEL)[number];

export const SIGNATURE_SCHEME = ["NONE", "HMAC_SHA256", "RSA_SHA256", "JWT", "BASIC_AUTH_HASH"] as const;
export type ProviderSignatureScheme = (typeof SIGNATURE_SCHEME)[number];

export const ENFORCEMENT_STATUS = ["NOT_INVESTIGATED", "LICENSED", "AGENT_NETWORK", "DIRECT", "UNKNOWN"] as const;
export type ProviderEnforcementStatus = (typeof ENFORCEMENT_STATUS)[number];

export const SANDBOX_MODE = ["NONE", "PUBLIC_SANDBOX", "PARTNER_SANDBOX", "MOCK_ONLY"] as const;
export type ProviderSandboxMode = (typeof SANDBOX_MODE)[number];

export type ProviderStatusReport = {
  provider: string;
  integrationStatus: ProviderIntegrationStatus;
  contractStatus: ProviderContractStatus;
  credentialStatus: ProviderCredentialStatus;
  apiAvailability: ProviderApiAvailability;
  webhookModel: ProviderWebhookModel;
  settlementModel: ProviderSettlementModel;
  signatureScheme: ProviderSignatureScheme;
  regulatoryEnforcement: ProviderEnforcementStatus;
  sandboxMode: ProviderSandboxMode;
  supportedCapabilities: readonly ProviderCapability[];
  /** One line per field, saying what was actually measured. Never marketing copy. */
  evidence: Record<string, string>;
  blockedOn: readonly string[];
  lastAssessedAt: string;
  /** Free-text scope note. Never a status, never evidence of capability. */
  note?: string;
};

/** What an adapter receives. Raw bytes, never a re-serialized approximation. */
export type RawInbound = {
  /** Exact request body bytes as received; the digest is taken over these. */
  rawBody: string;
  headers: Record<string, string>;
  /** Resolved from the URL path, not from the payload. */
  providerCode: string;
  receivedAt: Date;
  sourceIp: string | null;
};

export type InboundVerification = {
  signatureValid: boolean;
  timestampValid: boolean;
  replaySuspected: boolean;
  /** Stable reason code, safe to log and store. Never a secret, never the payload. */
  detail: string;
  clockSkewSeconds: number | null;
};

/** A provider's claim about money, before anyone believes it. */
export type NormalizedInbound = {
  providerEventId: string;
  providerTransactionId: string | null;
  eventType: "TRANSACTION" | "REVERSAL" | "SETTLEMENT" | "UNKNOWN";
  direction: Direction;
  transactionType: TransactionType;
  currency: string;
  /** Integer minor units. Set by the adapter through `parseProviderAmount`. */
  grossMinor: number;
  /**
   * Null means the provider did not report it. Zero means the provider reported
   * zero. Collapsing the two is how an unreported fee becomes a booked expense
   * of nothing, so the adapter contract refuses to.
   */
  feeMinor: number | null;
  taxMinor: number | null;
  netMinor: number | null;
  netBasis: "REPORTED" | "DERIVED_FROM_GROSS" | "DERIVED_FROM_COMPONENTS" | "UNRESOLVED";
  /** Counterparty on the sending and receiving side, as the provider named them. */
  from: string | null;
  to: string | null;
  settlementCurrency: string | null;
  settlementMinor: number | null;
  occurredAt: Date;
  providerSettledAt: Date | null;
  providerReference: string | null;
  counterpartyRef: string | null;
  counterpartyName: string | null;
  invoiceReference: string | null;
  description: string | null;
  /** Preserved for investigation only; never authoritative. */
  metadata: Record<string, unknown>;
  /** What the adapter needed but did not get. Surfaced, not defaulted away. */
  gaps: string[];
};

export type OutboundPayoutRequest = {
  amountMinor: number;
  currency: string;
  destinationRef: string;
  destinationType: "MSISDN" | "BANK_ACCOUNT" | "WALLET_ID" | "TILL_NUMBER";
  payerReference: string;
  description: string;
  idempotencyKey: string;
};

export type OutboundResult =
  | { ok: true; providerTransactionId: string; state: "PENDING_PROVIDER" | "QUEUED_LOCALLY"; acceptedAt: Date; raw: Record<string, unknown> }
  | { ok: false; code: string; message: string; retryable: boolean };

export interface PaymentProviderAdapter {
  readonly providerCode: string;
  readonly displayName: string;
  readonly capabilities: readonly ProviderCapability[];
  /** True only for an in-process simulation. A mock must never be able to claim otherwise. */
  readonly isMock: boolean;
  hasCapability(capability: ProviderCapability): boolean;
  verifyInbound(input: RawInbound, context: { signingSecret: string | null; maxClockSkewSeconds: number }): InboundVerification;
  parseInbound(input: RawInbound): NormalizedInbound;
  initiatePayout?(input: OutboundPayoutRequest, context: { credential: string | null }): Promise<OutboundResult>;
  queryTransaction?(providerTransactionId: string, context: { credential: string | null }): Promise<OutboundResult>;
}

export function supportsVerification(scheme: ProviderSignatureScheme): boolean {
  return scheme === "HMAC_SHA256" || scheme === "RSA_SHA256" || scheme === "JWT" || scheme === "BASIC_AUTH_HASH";
}
