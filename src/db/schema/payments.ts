/**
 * BEYU OS → Payments & Banking domain (migration 0028).
 *
 * Provider-neutral transaction ingestion, verification, normalization,
 * idempotency, reconciliation, settlement and governed accounting preparation.
 *
 * Rules this schema exists to enforce:
 *  - A provider event is NEVER accounting truth. Only `postJournal()`
 *    (src/lib/finance/posting-engine.ts) may create POSTED facts, and it stays
 *    behind CAP_POSTING. These tables therefore stop at `ACCOUNTING_READY`.
 *  - Balances are never stored here; they are derived. Treasury positions stay
 *    OBSERVED and are reconciled to, never posted from (src/lib/finance/truth.ts).
 *  - `*_ref` columns hold the NAME of an environment variable or secret-store
 *    key, never a secret value. No credential, API key, PIN, card PAN or raw
 *    provider payload is persisted; only a SHA-256 digest of the payload.
 *  - The four status axes (verification, reconciliation, settlement, accounting)
 *    are separate columns and are never conflated into one "integrated"/"done"
 *    flag.
 *  - Configuration and authority tables (providers, connections, accounts,
 *    mappings, policies) are SELECT-only for the runtime role: INSERT/UPDATE/
 *    DELETE are revoked in 0028 and writes flow exclusively through the
 *    governed admin DSN (`scripts/payment-config.ts`). Transactional tables are
 *    append-oriented and RLS/FORCE-enforced, mirroring 0021's policy shape.
 *  - `BLOCKED`, `NOT_CONFIGURED`, `ENVIRONMENT_LIMITED` and `DATA_NOT_AVAILABLE`
 *    are first-class states; nothing converts them into a pass.
 */
import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { countries, legalEntities, tenants } from "./core";
import { parties, users } from "./identity";
import { journalEntries, ledgerAccounts } from "./finance";

/* ------------------------------------------------------------------ *
 * Configuration — governed, runtime SELECT-only
 * ------------------------------------------------------------------ */

/** Provider registry. `integration_status` can never be set by application code alone. */
export const paymentProviders = pgTable(
  "payment_providers",
  {
    code: text("code").primaryKey(), // e.g. MPESA_TZ, AIRTELAIRTEL_MONEY_TZ, HALOPESA_TZ, TTCL_PESA_TZ, MIXX_YAS_TZ, NMB_IPP, CRDB_GTTRANSFER, MOCK_SANDBOX
    displayName: text("display_name").notNull(),
    kind: text("kind").notNull(), // MOBILE_MONEY | BANK_TRANSFER | CARD | AGENT | UNIFIED_SWITCH
    countryCode: text("country_code").notNull().references(() => countries.code),
    integrationStatus: text("integration_status").notNull().default("NOT_INTEGRATED"), // NOT_INTEGRATED | ADAPTER_CODED | SANDBOX_CONFIGURED | SANDBOX_VERIFIED | PRODUCTION_CONFIGURED | PRODUCTION_VERIFIED | BLOCKED_EXTERNAL_DEPENDENCY
    contractStatus: text("contract_status").notNull().default("NOT_INVESTIGATED"),
    credentialStatus: text("credential_status").notNull().default("NOT_ISSUED"),
    apiAvailability: text("api_availability").notNull().default("UNVERIFIED"), // UNVERIFIED | DOCUMENTED_PUBLIC | DOCUMENTED_PARTNER | NONE_FOUND
    webhookModel: text("webhook_model").notNull().default("UNVERIFIED"), // UNVERIFIED | PROVIDER_PUSH | POLL_ONLY
    settlementModel: text("settlement_model").notNull().default("UNVERIFIED"),
    signatureScheme: text("signature_scheme").notNull().default("NONE"), // NONE | HMAC_SHA256 | RSA_SHA256 | JWT | BASIC_AUTH_HASH
    capabilities: jsonb("capabilities").notNull().default({}), // {receipts,payouts,refunds,reversals,statements,balance,ipsp,...}
    sandboxEvidence: text("sandbox_evidence"),
    productionEvidence: text("production_evidence"),
    blockedReason: text("blocked_reason"),
    // Governance of this row itself: who enabled it, and on what authority.
    enabledBy: text("enabled_by"),
    enabledAt: timestamp("enabled_at", { withTimezone: true }),
    approvalReference: text("approval_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_providers_country_idx").on(t.countryCode), index("payment_providers_kind_idx").on(t.kind)],
);

/** A provider mounted for one tenant + legal entity + country. Carries credential REFERENCES only. */
export const paymentProviderConnections = pgTable(
  "payment_provider_connections",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    legalEntityId: text("legal_entity_id").notNull().references(() => legalEntities.id),
    providerCode: text("provider_code").notNull().references(() => paymentProviders.code),
    countryCode: text("country_code").notNull().references(() => countries.code),
    label: text("label").notNull(),
    environment: text("environment").notNull().default("SANDBOX"), // SANDBOX | PRODUCTION
    baseUrl: text("base_url"),
    merchantId: text("merchant_id"),
    credentialRef: text("credential_ref"), // NAME of an env var / secret key
    signingSecretRef: text("signing_secret_ref"), // inbound webhook secret: env var NAME
    callbackPath: text("callback_path"),
    pollIntervalSeconds: integer("poll_interval_seconds"),
    enabled: integer("enabled").notNull().default(0), // 0 = disabled; enabling is a governed act
    enabledBy: text("enabled_by"),
    enabledAt: timestamp("enabled_at", { withTimezone: true }),
    approvalReference: text("approval_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_provider_connections_uidx").on(
      t.tenantId,
      t.legalEntityId,
      t.providerCode,
      t.environment,
      t.label,
    ),
    index("payment_provider_connections_provider_idx").on(t.providerCode),
    index("payment_provider_connections_tenant_idx").on(t.tenantId),
  ],
);

/** The institution-side account / wallet / till / merchant code that money moves through. */
export const paymentAccounts = pgTable(
  "payment_accounts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    legalEntityId: text("legal_entity_id").notNull().references(() => legalEntities.id),
    connectionId: text("connection_id").notNull().references(() => paymentProviderConnections.id),
    providerCode: text("provider_code").notNull().references(() => paymentProviders.code),
    externalAccountId: text("external_account_id").notNull(), // wallet number, till number, IBAN (already-masked form)
    externalAccountDigest: text("external_account_digest").notNull(), // sha256, for dedupe without storing raw
    accountType: text("account_type").notNull().default("OPERATING"), // OPERATING | COLLECTION | PAYOUT | CLEARING | FLOAT
    currency: text("currency").notNull(),
    label: text("label").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_accounts_external_uidx").on(t.connectionId, t.externalAccountId, t.accountType),
    index("payment_accounts_tenant_idx").on(t.tenantId),
    index("payment_accounts_provider_idx").on(t.providerCode),
  ],
);

/**
 * The accounting-policy surface: which chart-of-accounts line each payment role
 * maps to. Deliberately configuration and not code — an adapter must never
 * hard-code a ledger account (that would be an unratified accounting policy).
 */
export const paymentAccountMappings = pgTable(
  "payment_account_mappings",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    legalEntityId: text("legal_entity_id").notNull().references(() => legalEntities.id),
    providerCode: text("provider_code"), // NULL = applies to every provider
    currency: text("currency"), // NULL = applies to every currency
    mappingRole: text("mapping_role").notNull(), // RECEIVABLE | CLEARING | CASH | FEE_EXPENSE | TAX_PAYABLE | SETTLEMENT_LIABILITY | SUSPENSE
    ledgerAccountId: text("ledger_account_id").notNull().references(() => ledgerAccounts.id),
    policyVersion: text("policy_version").notNull(),
    approvedBy: text("approved_by").notNull(),
    approvalReference: text("approval_reference").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_account_mappings_uidx").on(
      t.tenantId,
      t.legalEntityId,
      t.providerCode,
      t.currency,
      t.mappingRole,
    ),
    index("payment_account_mappings_account_idx").on(t.ledgerAccountId),
  ],
);

/** Limits and thresholds. Runtime may read them; it may not move them. */
export const paymentPolicies = pgTable(
  "payment_policies",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id), // NULL = tenant-wide
    providerCode: text("provider_code"), // NULL = every provider
    currency: text("currency").notNull(),
    maxTransactionMinor: numeric("max_transaction_minor", { precision: 18, scale: 0 }).notNull(),
    dailyInboundLimitMinor: numeric("daily_inbound_limit_minor", { precision: 18, scale: 0 }),
    dailyOutboundLimitMinor: numeric("daily_outbound_limit_minor", { precision: 18, scale: 0 }),
    autoPostCeilingMinor: numeric("auto_post_ceiling_minor", { precision: 18, scale: 0 }), // NULL = never auto-post
    confidenceFloor: numeric("confidence_floor", { precision: 4, scale: 3 }).notNull().default("0.990"),
    maxClockSkewSeconds: integer("max_clock_skew_seconds").notNull().default(300),
    requireApprovalAboveMinor: numeric("require_approval_above_minor", { precision: 18, scale: 0 }),
    matchRulesetVersion: text("match_ruleset_version").notNull().default("payment-match-1.0.0"),
    unknownTransactionTreatment: text("unknown_transaction_treatment").notNull().default("SUSPENSE_REVIEW"), // SUSPENSE_REVIEW | REJECT
    enabled: integer("enabled").notNull().default(1),
    policyVersion: text("policy_version").notNull(),
    approvedBy: text("approved_by").notNull(),
    approvalReference: text("approval_reference").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_policies_uidx").on(t.tenantId, t.legalEntityId, t.providerCode, t.currency),
    index("payment_policies_tenant_idx").on(t.tenantId),
  ],
);

/* ------------------------------------------------------------------ *
 * Ingestion — append-oriented, RLS + FORCE enforced
 * ------------------------------------------------------------------ */

/**
 * Durable inbound inbox. One row per (connection, provider event id). Replays
 * UPDATE `duplicate_count` only — mirroring `internal_event_receipts` (0019).
 */
export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    legalEntityId: text("legal_entity_id").notNull().references(() => legalEntities.id),
    providerCode: text("provider_code").notNull().references(() => paymentProviders.code),
    connectionId: text("connection_id").notNull().references(() => paymentProviderConnections.id),
    providerEventId: text("provider_event_id").notNull(),
    providerTransactionId: text("provider_transaction_id"),
    eventType: text("event_type").notNull(), // TRANSACTION receipt | TRANSACTION reversal | SETTLEMENT batch | ...
    payloadDigest: text("payload_digest").notNull(), // sha256 of the exact bytes verified
    payloadSizeBytes: integer("payload_size_bytes").notNull(),
    signatureValid: integer("signature_valid").notNull().default(0),
    timestampValid: integer("timestamp_valid").notNull().default(0),
    replayDetected: integer("replay_detected").notNull().default(0),
    verificationDetail: text("verification_detail"), // reason code only, never the secret
    processingState: text("processing_state").notNull().default("RECEIVED"), // RECEIVED | PROCESSED | DUPLICATE | REJECTED | FAILED
    attemptCount: integer("attempt_count").notNull().default(1),
    lastErrorCode: text("last_error_code"),
    transactionId: text("transaction_id"),
    correlationId: text("correlation_id"),
    traceId: text("trace_id"),
    sourceIp: text("source_ip"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("payment_webhook_events_inbox_uidx").on(t.connectionId, t.providerEventId),
    index("payment_webhook_events_state_idx").on(t.processingState),
    index("payment_webhook_events_tenant_idx").on(t.tenantId),
  ],
);

/** The canonical payment transaction. Four independent status axes, by design. */
export const paymentTransactions = pgTable(
  "payment_transactions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    legalEntityId: text("legal_entity_id").notNull().references(() => legalEntities.id),
    countryCode: text("country_code").notNull().references(() => countries.code),
    providerCode: text("provider_code").notNull().references(() => paymentProviders.code),
    connectionId: text("connection_id").notNull().references(() => paymentProviderConnections.id),
    accountId: text("account_id").references(() => paymentAccounts.id),
    webhookEventId: text("webhook_event_id"),
    providerTransactionId: text("provider_transaction_id").notNull(),
    providerReference: text("provider_reference"),
    idempotencyKey: text("idempotency_key").notNull(),
    source: text("source").notNull().default("PROVIDER_WEBHOOK"), // PROVIDER_WEBHOOK | PROVIDER_POLL | STATEMENT_FILE | MANUAL_GOVERNED
    direction: text("direction").notNull(), // INBOUND | OUTBOUND
    transactionType: text("transaction_type").notNull(), // DEPOSIT | WITHDRAWAL | TRANSFER | PAYMENT | REFUND | REVERSAL | FEE | SETTLEMENT ADJUSTMENT
    currency: text("currency").notNull(),
    grossMinor: numeric("gross_minor", { precision: 18, scale: 0 }).notNull(),
    // Nullable on purpose: a provider that reports no fee is NOT a provider
    // that reports a zero fee. `0` would be a fabricated fact and would silently
    // make net = gross; NULL keeps the unknown unknown and the accounting gate
    // refuses to post while it is unresolved.
    feeMinor: numeric("fee_minor", { precision: 18, scale: 0 }),
    taxMinor: numeric("tax_minor", { precision: 18, scale: 0 }),
    netMinor: numeric("net_minor", { precision: 18, scale: 0 }),
    /** How net was obtained: REPORTED | DERIVED_FROM_GROSS | UNRESOLVED. */
    netBasis: text("net_basis").notNull().default("UNRESOLVED"),
    settlementCurrency: text("settlement_currency"),
    settlementMinor: numeric("settlement_minor", { precision: 18, scale: 0 }),
    fxRate: numeric("fx_rate", { precision: 18, scale: 8 }),
    fxSourceKind: text("fx_source_kind"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    providerSettledAt: timestamp("provider_settled_at", { withTimezone: true }),
    // Axis 1 — trust/verification of the provider's claim.
    verificationStatus: text("verification_status").notNull().default("CANDIDATE"), // CANDIDATE | UNTRUSTED | VERIFIED | SUSPICIOUS | REJECTED
    verificationEvidence: jsonb("verification_evidence").notNull().default({}),
    trustLevel: text("trust_level").notNull().default("RAW"), // RAW | AUTHENTICATED | VERIFIED_PROVIDER | RECONCILED_BANK | CONFIRMED_MANUAL
    // Axis 2 — reconciliation against an internal obligation or statement.
    reconciliationStatus: text("reconciliation_status").notNull().default("RECONCILIATION_REQUIRED"),
    matchConfidence: numeric("match_confidence", { precision: 4, scale: 3 }),
    matchMethod: text("match_method"),
    // Axis 3 — provider/clearing settlement.
    settlementStatus: text("settlement_status").notNull().default("PENDING"), // PENDING | IN_SETTLEMENT | SETTLED | FAILED | NOT_APPLICABLE
    settlementId: text("settlement_id"),
    // Axis 4 — governed accounting (owned by Finance OS; never written directly).
    accountingStatus: text("accounting_status").notNull().default("NOT_PREPARED"), // NOT_PREPARED | POLICY_MISSING | PREPARED | READY | POSTED | POSTING_FAILED | REVERSED
    journalEntryId: text("journal_entry_id").references(() => journalEntries.id),
    accountingPreparedAt: timestamp("accounting_prepared_at", { withTimezone: true }),
    // Attribution — resolved from registration data, never invented from a name.
    partyId: text("party_id").references(() => parties.id),
    customerUserId: text("customer_user_id").references(() => users.id),
    counterpartyRef: text("counterparty_ref"), // masked/pseudonymous identifier from the provider
    counterpartyDigest: text("counterparty_digest"),
    counterpartyName: text("counterparty_name"), // as the provider reported it — untrusted display text
    invoiceReference: text("invoice_reference"),
    description: text("description"),
    providerMetadata: jsonb("provider_metadata").notNull().default({}), // preserved, never trusted
    stateVersion: integer("state_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_transactions_provider_uidx").on(t.connectionId, t.providerTransactionId),
    uniqueIndex("payment_transactions_idempotency_uidx").on(t.connectionId, t.idempotencyKey),
    index("payment_transactions_tenant_state_idx").on(t.tenantId, t.reconciliationStatus),
    index("payment_transactions_entity_occurred_idx").on(t.legalEntityId, t.occurredAt),
    index("payment_transactions_party_idx").on(t.partyId),
    index("payment_transactions_invoice_idx").on(t.invoiceReference),
  ],
);

/** Append-only transition trail: every state change with actor, reason and provenance. */
export const paymentTransactionStates = pgTable(
  "payment_transaction_states",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    transactionId: text("transaction_id").notNull().references(() => paymentTransactions.id),
    axis: text("axis").notNull(), // VERIFICATION | TRUST | RECONCILIATION | SETTLEMENT | ACCOUNTING
    fromState: text("from_state"),
    toState: text("to_state").notNull(),
    reason: text("reason").notNull(),
    actorType: text("actor_type").notNull(), // SERVICE | HUMAN | SYSTEM
    actorUserId: text("actor_user_id"),
    controlRole: text("control_role"), // MAKER | CHECKER | AUTHORIZER | EXECUTOR
    evidence: jsonb("evidence").notNull().default({}),
    policyVersion: text("policy_version"),
    correlationId: text("correlation_id"),
    traceId: text("trace_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_transaction_states_tx_idx").on(t.transactionId, t.occurredAt)],
);

/** A proposed or confirmed link between a transaction and an internal obligation. */
export const paymentMatches = pgTable(
  "payment_matches",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    legalEntityId: text("legal_entity_id").notNull().references(() => legalEntities.id),
    transactionId: text("transaction_id").notNull().references(() => paymentTransactions.id),
    targetType: text("target_type").notNull(), // RECEIVABLE | PAYABLE | SETTLEMENT ITEM | STATEMENT LINE
    targetTable: text("target_table"), // NULL when no substrate exists yet — recorded as such, not faked
    targetId: text("target_id"),
    method: text("method").notNull(), // EXACT_REFERENCE | EXACT_IDEMPOTENCY | AMOUNT_ACCOUNT_EXACT | AMOUNT_DATE_WINDOW | INVOICE_REFERENCE | COUNTERPARTY_DIGEST | FUZZY
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
    rulesetVersion: text("ruleset_version").notNull(),
    evidence: jsonb("evidence").notNull().default({}),
    status: text("status").notNull().default("PROPOSED"), // PROPOSED | CONFIRMED | REJECTED
    proposedBy: text("proposed_by").notNull().default("SYSTEM"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewReason: text("review_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_matches_active_uidx").on(t.transactionId, t.method, t.targetId),
    index("payment_matches_target_idx").on(t.targetType, t.targetId),
    index("payment_matches_status_idx").on(t.status, t.confidence),
  ],
);

/** Anything the pipeline cannot resolve on its own. Exceptions are the product, not an afterthought. */
export const paymentExceptions = pgTable(
  "payment_exceptions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    transactionId: text("transaction_id").references(() => paymentTransactions.id),
    webhookEventId: text("webhook_event_id").references(() => paymentWebhookEvents.id),
    code: text("code").notNull(), // UNKNOWN_PARTY | AMOUNT_MISMATCH | MISSING ACCOUNT MAPPING | POLICY_MISSING | CAPABILITY LOCKED | DUPLICATE_CONFLICT | FX_RATE_UNAVAILABLE | PERIOD CLOSED | UNSIGNED_PAYLOAD | REPLAY | LIMIT_EXCEEDED | SETTLEMENT_SHORTFALL | ...
    severity: text("severity").notNull().default("MEDIUM"), // LOW | MEDIUM | HIGH | CRITICAL
    status: text("status").notNull().default("OPEN"), // OPEN | IN_REVIEW | RESOLVED | ACCEPTED_RISK | ESCALATED
    detail: jsonb("detail").notNull().default({}),
    blocking: integer("blocking").notNull().default(1), // blocks downstream effect while 1
    raisedBy: text("raised_by").notNull().default("SYSTEM"),
    assignedTo: text("assigned_to"),
    reviewedBy: text("reviewed_by"),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    correlationId: text("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payment_exceptions_open_idx").on(t.tenantId, t.status, t.severity),
    index("payment_exceptions_tx_idx").on(t.transactionId),
  ],
);

/** A provider settlement batch, reconciled against the transactions it contains. */
export const paymentSettlements = pgTable(
  "payment_settlements",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    legalEntityId: text("legal_entity_id").notNull().references(() => legalEntities.id),
    providerCode: text("provider_code").notNull().references(() => paymentProviders.code),
    connectionId: text("connection_id").notNull().references(() => paymentProviderConnections.id),
    providerSettlementId: text("provider_settlement_id").notNull(),
    settlementDate: timestamp("settlement_date", { withTimezone: true }).notNull(),
    currency: text("currency").notNull(),
    grossMinor: numeric("gross_minor", { precision: 18, scale: 0 }).notNull(),
    // A settlement record is only created from a complete batch: an ingest that
    // cannot see the fee column raises an exception instead of inventing a zero,
    // so these are non-null here even though they are nullable on a transaction.
    feeMinor: numeric("fee_minor", { precision: 18, scale: 0 }).notNull().default("0"),
    taxMinor: numeric("tax_minor", { precision: 18, scale: 0 }).notNull().default("0"),
    netMinor: numeric("net_minor", { precision: 18, scale: 0 }).notNull(),
    creditedMinor: numeric("credited_minor", { precision: 18, scale: 0 }), // what the bank statement actually showed
    varianceMinor: numeric("variance_minor", { precision: 18, scale: 0 }),
    itemCount: integer("item_count").notNull().default(0),
    matchedCount: integer("matched_count").notNull().default(0),
    unmatchedCount: integer("unmatched_count").notNull().default(0),
    status: text("status").notNull().default("RECEIVED"), // RECEIVED | MATCHING | RECONCILED | VARIANCE | PARTIAL | DISPUTED | CREDIT_CONFIRMED
    source: text("source").notNull().default("STATEMENT_FILE"), // PROVIDER_PUSH | STATEMENT_FILE | BANK_STATEMENT
    evidenceDigest: text("evidence_digest"),
    accountingStatus: text("accounting_status").notNull().default("NOT_PREPARED"),
    journalEntryId: text("journal_entry_id").references(() => journalEntries.id),
    correlationId: text("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_settlements_uidx").on(t.connectionId, t.providerSettlementId),
    index("payment_settlements_tenant_date_idx").on(t.tenantId, t.settlementDate),
  ],
);

/** Line-level membership of a settlement batch. */
export const paymentSettlementItems = pgTable(
  "payment_settlement_items",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    settlementId: text("settlement_id").notNull().references(() => paymentSettlements.id),
    transactionId: text("transaction_id").references(() => paymentTransactions.id),
    providerTransactionId: text("provider_transaction_id").notNull(),
    amountMinor: numeric("amount_minor", { precision: 18, scale: 0 }).notNull(),
    feeMinor: numeric("fee_minor", { precision: 18, scale: 0 }).notNull().default("0"),
    matchStatus: text("match_status").notNull().default("UNMATCHED"), // MATCHED | UNMATCHED | AMOUNT_MISMATCH
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_settlement_items_uidx").on(t.settlementId, t.providerTransactionId),
    index("payment_settlement_items_tx_idx").on(t.transactionId),
  ],
);

/** Refunds, reversals, chargebacks and disputes — always against a known original. */
export const paymentCorrections = pgTable(
  "payment_corrections",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    legalEntityId: text("legal_entity_id").notNull().references(() => legalEntities.id),
    originalTransactionId: text("original_transaction_id").notNull().references(() => paymentTransactions.id),
    replacementTransactionId: text("replacement_transaction_id").references(() => paymentTransactions.id),
    kind: text("kind").notNull(), // REFUND | REVERSAL | CHARGEBACK | DISPUTE | ADJUSTMENT
    reasonCode: text("reason_code").notNull(),
    reasonDetail: text("reason_detail"),
    amountMinor: numeric("amount_minor", { precision: 18, scale: 0 }).notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull().default("RECEIVED"), // RECEIVED | UNDER_REVIEW | APPROVED | EXECUTING | COMPLETED | REJECTED | FAILED
    approvalReference: text("approval_reference"),
    requestedBy: text("requested_by"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    providerReference: text("provider_reference"),
    accountingStatus: text("accounting_status").notNull().default("NOT_PREPARED"),
    journalEntryId: text("journal_entry_id").references(() => journalEntries.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payment_corrections_original_idx").on(t.originalTransactionId),
    index("payment_corrections_status_idx").on(t.tenantId, t.status),
  ],
);

/** Deterministic risk findings. No ML, no "AI fraud engine" claim. */
export const paymentRiskSignals = pgTable(
  "payment_risk_signals",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    transactionId: text("transaction_id").references(() => paymentTransactions.id),
    signal: text("signal").notNull(), // DUPLICATE_AMOUNT_BURST | VELOCITY LIMIT | AMOUNT OVER POLICY | FINGERPRINT REUSE | UNSIGNED SPIKE | UNMATCHED HIGH VALUE
    severity: text("severity").notNull().default("MEDIUM"),
    score: numeric("score", { precision: 4, scale: 3 }).notNull().default("0.500"),
    evidence: jsonb("evidence").notNull().default({}),
    disposition: text("disposition").notNull().default("OPEN"), // OPEN | DISMISSED | BLOCKED | ESCALATED
    ruleVersion: text("rule_version").notNull().default("payment-risk-1.0.0"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payment_risk_signals_tx_idx").on(t.transactionId),
    index("payment_risk_signals_open_idx").on(t.tenantId, t.disposition, t.severity),
  ],
);
