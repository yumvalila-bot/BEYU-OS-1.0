/**
 * BEYU OS — GOVERNED CONTRACTING domain tables (X10THINK master program).
 *
 * ============================== WHAT THIS DOMAIN IS ============================
 *
 * The operating system for BEYU's own contracts: contract records with a
 * governed lifecycle, the party register they bind, authority checks,
 * deterministic obligations and their append-only event ledger, SLA
 * measurements, execution links, signature records, disputes, and legal
 * document lifecycle. Every state transition here is decided by the pure
 * engines in `src/lib/contracts/*` and audited; the tables store the RESULT of
 * a decision, never an inference about it.
 *
 * ============================== WHAT THIS DOMAIN IS NOT ========================
 *
 *   - NOT a signature vendor replacement. `contract_signatures` records the
 *     fact and evidence of a signature event (who, which document, which
 *     content hash, which ceremony); the cryptographic act stays with the
 *     qualified provider. Nothing here generates, stores or needs a private key.
 *   - NOT a second document store. Every `*_document_ref` /
 *     `lifecycle.document_id` points at the canonical `documents` registry
 *     (platform.ts), which already owns checksum, storage URI, retention code,
 *     legal hold and supersession. `legal_document_lifecycle` adds CONTRACT-state
 *     semantics on top; it never copies content or replaces retention.
 *   - NOT a second ledger. Amount-carrying rows (`contract_obligations`) record
 *     `authoritative_owner` = 'FINANCE_OS' plus a nullable `finance_record_ref`;
 *     payment/settlement truth lives in Finance. No code path in this domain
 *     calls the posting engine, and CAP_POSTING remains locked and fail-closed.
 *   - NOT a legal opinion. `legal_review_status` defaults to
 *     'REQUIRES_LEGAL_REVIEW' everywhere; enforceability is a human/legal
 *     determination that the software records and gates on, never asserts.
 *   - NOT an AI decision-maker. `ai_initiated` marks proposals for review; the
 *     lifecycle engine refuses to auto-approve commercial authority, execute,
 *     terminate, amend, renew or resolve disputes.
 *   - NOT an ERP/CLM re-implementation. `external_ref` carries the counterparty
 *     system reference for reconciliation only.
 *
 * ============================== ISOLATION =====================================
 *
 * Every table carries `tenant_id` (references `tenants`). Migration 0042
 * enables RLS with the canonical `tenant_id = ANY (beyu_tenant_ids())` policy
 * (USING + WITH CHECK), grants the runtime role DML only, and FAILS if any table
 * lacks its policy — mirroring 0035–0041. Controlled vocabularies are enforced
 * in the service layer against `src/lib/contracts/vocabulary.ts` (closed sets),
 * which keeps the enums from drifting into an unmanaged DDL migration chain.
 */

import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { classificationEnum } from "./enums";
import { legalEntities, tenants } from "./core";
import { parties } from "./identity";
import { documents } from "./platform";

/* ------------------------------------------------------------------ */
/* §16 — Party register (counterparty master, reference-only)          */
/* ------------------------------------------------------------------ */

/**
 * Contract-role view over the canonical `parties` registry. Identity truth
 * stays in `parties` (one row per party per tenant); this table holds only
 * contract-relevant posture: credit standing, sanctions/KYC state, the default
 * entity this party contracts with, and the posture the engine computed from
 * evidence. A party with no open risk evidence is `UNKNOWN`, never "clean".
 */
export const contractParties = pgTable(
  "contract_parties",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    partyId: text("party_id")
      .notNull()
      .references(() => parties.id),
    /** Default BEYU-side contracting entity for this relationship. */
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    /** COUNTERPARTY_KINDS vocabulary member (src/lib/contracts/vocabulary.ts). */
    counterpartyKind: text("counterparty_kind").notNull().default("OTHER_AUTHORIZED"),
    /** Authority role of this party's signatory: SIGNATORY_ROLE_KINDS member. */
    signatoryRoleCode: text("signatory_role_code"),
    /** BLOCKED | HIGH_RISK | CONDITIONAL | CLEAR (PartyPosture.riskRating-driven; UNKNOWN means no evidence, never "clean"). */
    posture: text("posture").notNull().default("UNKNOWN"),
    creditRating: text("credit_rating"),
    /** Evidence reference (documents/credit file), never the file itself. */
    creditFileRef: text("credit_file_ref"),
    sanctionsScreenedAt: timestamp("sanctions_screened_at", { withTimezone: true }),
    /** CLEAN | HIT | PENDING | STALE (controlled; STALE blocks contracting). */
    sanctionsResult: text("sanctions_result").notNull().default("PENDING"),
    /** NOT_REQUIRED | PENDING | VERIFIED | EXPIRED | REFUSED (Parties engine vocabulary). */
    kycState: text("kyc_state").notNull().default("PENDING"),
    /** Legal name/address/tax id as recorded at contracting time (snapshot of an assertion, not a substitute for `parties`). */
    legalNameSnapshot: text("legal_name_snapshot"),
    taxIdReference: text("tax_id_reference"),
    defaultCurrencyCode: text("default_currency_code"),
    defaultPaymentTermsCode: text("default_payment_terms_code"),
    /** Bank details are referenced, never stored: the treasury record owns them. */
    payoutProfileRef: text("payout_profile_ref"),
    /**
     * The party's approved on-chain representation address (EIP-55 checksummed,
     * stored normalized). This is a RELATIONSHIP fact recorded under
     * `contracts:manage` — never an identity claim and never a key: BEYU holds no
     * private material (§23C). Reconciliation attributes token positions to this
     * address; a position at any other address is an UNKNOWN_HOLDER finding.
     */
    approvedBlockchainAddress: text("approved_blockchain_address"),
    blockchainAddressEvidenceRef: text("blockchain_address_evidence_ref"),
    riskTier: text("risk_tier"),
    blockedReason: text("blocked_reason"),
    /** Outcome of the pure posture engine, with the evidence it was computed from. */
    postureDetail: jsonb("posture_detail").$type<Record<string, unknown>>().notNull().default({}),
    note: text("note"),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | SUSPENDED | ARCHIVED
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contract_parties_tenant_party_kind_uidx").on(t.tenantId, t.partyId, t.counterpartyKind),
    index("contract_parties_tenant_idx").on(t.tenantId),
    index("contract_parties_posture_idx").on(t.tenantId, t.posture),
  ],
);

/* ------------------------------------------------------------------ */
/* §17 — Contract master and lifecycle                                  */
/* ------------------------------------------------------------------ */

/**
 * The contract record: commercial spine of the domain. Lifecycle truth is
 * `state`; `current_state_at` records when it was set. Review gates are
 * references to governed approval records, and the lifecycle engine will not
 * advance a state whose gate is not closed. `authority_snapshot` stores the
 * evaluation the engine produced (checks + thresholds version) so a later
 * change of thresholds never silently re-legitimizes an old decision.
 */
export const contractRecords = pgTable(
  "contract_records",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    /** CONTRACT_TYPES member (~40 codes), validated by the service. */
    typeCode: text("type_code").notNull(),
    /** CONTRACT_TYPE_FAMILIES[type_code] — stored so reporting never re-derives it. */
    typeFamily: text("type_family").notNull(),
    /** DRAFT … CLOSED (20 states, controlled by the lifecycle engine). */
    state: text("state").notNull().default("DRAFT"),
    /** LOW | MEDIUM | HIGH | CRITICAL (review depth; OBLIGATION_RISK_SEVERITIES scale). */
    criticality: text("criticality").notNull().default("MEDIUM"),
    counterpartyPartyId: text("counterparty_party_id").references(() => parties.id),
    beyuEntityId: text("beyu_entity_id").references(() => legalEntities.id),
    ownerUserId: text("owner_user_id"),
    commercialOwnerUserId: text("commercial_owner_user_id"),
    legalOwnerUserId: text("legal_owner_user_id"),
    contractValue: numeric("contract_value", { precision: 18, scale: 2 }),
    currencyCode: text("currency_code"),
    signedDate: date("signed_date"),
    effectiveDate: date("effective_date"),
    expiryDate: date("expiry_date"),
    renewalNoticeDeadline: date("renewal_notice_deadline"),
    autoRenewal: boolean("auto_renewal").notNull().default(false),
    renewalTermMonths: integer("renewal_term_months"),
    /** Governing law and forum are recorded facts from the instrument, never defaults. */
    governingLawJurisdictionCode: text("governing_law_jurisdiction_code"),
    disputeForum: text("dispute_forum"),
    /** REVIEW_OPEN | REVIEW_CLOSED per CONTRACT_REVIEW_GATES; closing requires a governed approval record. */
    commercialReviewStatus: text("commercial_review_status").notNull().default("REVIEW_OPEN"),
    legalReviewStatus: text("legal_review_status").notNull().default("REVIEW_OPEN"),
    riskReviewStatus: text("risk_review_status").notNull().default("REVIEW_OPEN"),
    dataProtectionReviewStatus: text("data_protection_review_status").notNull().default("REVIEW_OPEN"),
    taxReviewStatus: text("tax_review_status").notNull().default("REVIEW_OPEN"),
    treasuryReviewStatus: text("treasury_review_status").notNull().default("REVIEW_OPEN"),
    authorityPolicyCode: text("authority_policy_code"),
    /** Snapshot of the authority evaluation the engine ran (checks + version). */
    authoritySnapshot: jsonb("authority_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    riskClassificationCode: text("risk_classification_code"),
    frameworkContractId: text("framework_contract_id"),
    parentContractId: text("parent_contract_id"),
    /** Supersession chain: this record amends/renews that record. */
    supersedesContractId: text("supersedes_contract_id"),
    amendmentCount: integer("amendment_count").notNull().default(0),
    renewalCount: integer("renewal_count").notNull().default(0),
    externalRef: text("external_ref"),
    signatureBlock: jsonb("signature_block").$type<Record<string, unknown>>().notNull().default({}),
    currentStateAt: timestamp("current_state_at", { withTimezone: true }),
    /** EXECUTION_METHODS member; ONCHAIN_ATTESTED means the anchor table owns the evidence. */
    executionMethod: text("execution_method"),
    /** ENFORCEABILITY_STATES member; default REQUIRES_LEGAL_REVIEW until counsel decides (§23, §74). */
    enforceabilityState: text("enforceability_state").notNull().default("REQUIRES_LEGAL_REVIEW"),
    legalEnforceabilityNote: text("legal_enforceability_note"),
    note: text("note"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contract_records_tenant_code_uidx").on(t.tenantId, t.code),
    index("contract_records_tenant_state_idx").on(t.tenantId, t.state),
    index("contract_records_tenant_expiry_idx").on(t.tenantId, t.expiryDate),
    index("contract_records_counterparty_idx").on(t.tenantId, t.counterpartyPartyId),
    index("contract_records_framework_idx").on(t.tenantId, t.frameworkContractId),
  ],
);

/**
 * Append-only lifecycle ledger. One row per transition the engine allowed; the
 * contract row is a materialization of its last event. Nothing here mutates a
 * prior event, and every event carries the evidence or resolution reference
 * that justified the move (the engine requires one for high-risk moves).
 */
export const contractLifecycleEvents = pgTable(
  "contract_lifecycle_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    contractId: text("contract_id")
      .notNull()
      .references(() => contractRecords.id),
    /** 22 governed actions (controlled; human-only set enforced by the engine). */
    actionCode: text("action_code").notNull(),
    fromState: text("from_state").notNull(),
    toState: text("to_state").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    aiInitiated: boolean("ai_initiated").notNull().default(false),
    evidenceDocumentId: text("evidence_document_id").references(() => documents.id),
    evidenceRef: text("evidence_ref"),
    resolutionRef: text("resolution_ref"),
    disputeRef: text("dispute_ref"),
    note: text("note"),
    /** The engine's full result for this transition (posture, gates evaluated). */
    resultDetail: jsonb("result_detail").$type<Record<string, unknown>>().notNull().default({}),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
  },
  (t) => [
    index("contract_lifecycle_events_contract_idx").on(t.tenantId, t.contractId, t.recordedAt),
    index("contract_lifecycle_events_actor_idx").on(t.tenantId, t.actorUserId),
  ],
);

/**
 * Authority checks as evaluated (one row per check per evaluation). `outcome`
 * is the engine's verdict for that check, `threshold_version` pins which policy
 * produced it, so an audit can replay why a contract could or could not execute.
 */
export const contractAuthorityChecks = pgTable(
  "contract_authority_checks",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    contractId: text("contract_id")
      .notNull()
      .references(() => contractRecords.id),
    /** COMMERCIAL | RISK_COMMITTEE | BOARD | SHAREHOLDER | RESERVED_MATTER | DELEGATION | SEGREGATION | BUDGET | COUNTERPARTY_AUTHORITY (controlled). */
    checkKind: text("check_kind").notNull(),
    /** SATISFIED | MISSING | NOT_REQUIRED | BLOCKED_BY_RESTRICTION (controlled). */
    outcome: text("outcome").notNull(),
    requiredValue: jsonb("required_value").$type<Record<string, unknown>>().notNull().default({}),
    observedValue: jsonb("observed_value").$type<Record<string, unknown>>().notNull().default({}),
    thresholdVersion: text("threshold_version").notNull(),
    evaluatedByUserId: text("evaluated_by_user_id").notNull(),
    satisfied: boolean("satisfied").notNull().default(false),
    note: text("note"),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
  },
  (t) => [
    index("contract_authority_checks_contract_idx").on(t.tenantId, t.contractId, t.evaluatedAt),
  ],
);

/* ------------------------------------------------------------------ */
/* §18 — Obligations, SLAs and verification                             */
/* ------------------------------------------------------------------ */

/**
 * A contract obligation. Timing is computed deterministically from
 * `due_basis`/`due_reference_date` + criticality lead time by the obligations
 * engine (never hand-set), and `verification_evidence_ref` is required to move
 * out of PERFORMED into VERIFIED. Amount-carrying rows defer money truth to
 * Finance OS: `authoritative_owner` is fixed to 'FINANCE_OS' by the intake
 * guard and `finance_record_ref` is how a payment is linked, not duplicated.
 */
export const contractObligations = pgTable(
  "contract_obligations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    contractId: text("contract_id")
      .notNull()
      .references(() => contractRecords.id),
    code: text("code").notNull(),
    /** OBLIGATION_KINDS member (PAYMENT, DELIVERY, MILESTONE, REPORTING, ... OTHER). */
    kind: text("kind").notNull(),
    /** OBLIGATION_RESPONSIBLE_PARTY_ROLES member: BEYU_ENTITY | COUNTERPARTY | THIRD_PARTY | JOINT. */
    responsiblePartyRole: text("responsible_party_role").notNull().default("BEYU_ENTITY"),
    ownerRole: text("owner_role"),
    ownerUserId: text("owner_user_id"),
    responsiblePartyId: text("responsible_party_id").references(() => parties.id),
    description: text("description").notNull(),
    /** OBLIGATION_RISK_SEVERITIES member (controlled; drives lead time and verification window). */
    criticality: text("criticality").notNull().default("MEDIUM"),
    /** OBLIGATION_STATES member: PENDING | IN_PROGRESS | DELIVERED | VERIFIED | CLOSED |
     * WAIVED | DISPUTED | OVERDUE | TERMINATED_WITH_CONTRACT. */
    state: text("state").notNull().default("PENDING"),
    /** EXPLICIT_DUE_DATE | TRIGGER_PLUS_OFFSET | CONTRACT_DATE_PLUS_OFFSET (engine output). */
    dueBasis: text("due_basis"),
    dueReferenceDate: date("due_reference_date"),
    dueDate: date("due_date"),
    /** Offset in days applied by the engine when computing dueDate/escalation. */
    leadTimeDays: integer("lead_time_days"),
    /** Verification must land within OBLIGATION_VERIFICATION_WINDOW_DAYS of dueDate. */
    verificationDeadline: date("verification_deadline"),
    escalationDueDate: date("escalation_due_date"),
    amount: numeric("amount", { precision: 18, scale: 2 }),
    currencyCode: text("currency_code"),
    /** Fixed by the intake guard for amount-bearing obligations (never a local ledger). */
    authoritativeOwner: text("authoritative_owner"),
    financeRecordRef: text("finance_record_ref"),
    obligationPeriodCode: text("obligation_period_code"),
    dependencyObligationId: text("dependency_obligation_id"),
    evidenceRequired: boolean("evidence_required").notNull().default(true),
    verificationEvidenceRef: text("verification_evidence_ref"),
    verificationDocumentId: text("verification_document_id").references(() => documents.id),
    verifiedByUserId: text("verified_by_user_id"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    waiverApprovalRef: text("waiver_approval_ref"),
    waiverNote: text("waiver_note"),
    lastStateAt: timestamp("last_state_at", { withTimezone: true }),
    legalReviewStatus: text("legal_review_status").notNull().default("REQUIRES_LEGAL_REVIEW"),
    note: text("note"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contract_obligations_contract_code_uidx").on(t.tenantId, t.contractId, t.code),
    index("contract_obligations_due_idx").on(t.tenantId, t.dueDate, t.state),
    index("contract_obligations_owner_idx").on(t.tenantId, t.ownerUserId),
  ],
);

/** Append-only obligation ledger (transitions, escalations, reminders sent). */
export const contractObligationEvents = pgTable(
  "contract_obligation_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    obligationId: text("obligation_id")
      .notNull()
      .references(() => contractObligations.id),
    actionCode: text("action_code").notNull(),
    fromState: text("from_state").notNull(),
    toState: text("to_state").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    aiInitiated: boolean("ai_initiated").notNull().default(false),
    evidenceRef: text("evidence_ref"),
    note: text("note"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
  },
  (t) => [index("contract_obligation_events_obligation_idx").on(t.tenantId, t.obligationId, t.recordedAt)],
);

/**
 * SLA measurement window. `outcome` is computed from the measured value against
 * the target/threshold the service supplied (`within_sla` is stored so reporting
 * never re-derives it from floating-point comparisons).
 */
export const contractSlaMeasurements = pgTable(
  "contract_sla_measurements",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    contractId: text("contract_id")
      .notNull()
      .references(() => contractRecords.id),
    obligationId: text("obligation_id").references(() => contractObligations.id),
    code: text("code").notNull(),
    metricName: text("metric_name").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    targetValue: numeric("target_value", { precision: 18, scale: 6 }),
    thresholdValue: numeric("threshold_value", { precision: 18, scale: 6 }),
    measuredValue: numeric("measured_value", { precision: 18, scale: 6 }),
    unitCode: text("unit_code"),
    /** SLA_METRIC_OUTCOMES member: MET | PARTIALLY_MET | MISSED | NOT_MEASURED. */
    outcome: text("outcome").notNull(),
    withinSla: boolean("within_sla").notNull(),
    breachEventId: text("breach_event_id"),
    creditCalculationRef: text("credit_calculation_ref"),
    creditAmount: numeric("credit_amount", { precision: 18, scale: 2 }),
    currencyCode: text("currency_code"),
    authoritativeOwner: text("authoritative_owner"),
    financeRecordRef: text("finance_record_ref"),
    evidenceRef: text("evidence_ref"),
    note: text("note"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contract_sla_measurements_contract_period_uidx").on(t.tenantId, t.contractId, t.code, t.periodStart),
    index("contract_sla_measurements_outcome_idx").on(t.tenantId, t.outcome),
  ],
);

/* ------------------------------------------------------------------ */
/* §23 — Execution links (contract ⇄ on-chain evidence)                 */
/* ------------------------------------------------------------------ */

/**
 * Links a contract (or one of its obligations) to a governed execution
 * mechanism: a document, a signature ceremony, or an on-chain anchor. For
 * on-chain rows the anchor id is the authoritative evidence record; this table
 * keeps the domain-side pointer plus the EIP-712 commitment BEYU computed, so a
 * reviewer can see WHAT was committed without ever holding a key.
 */
export const contractExecutionLinks = pgTable(
  "contract_execution_links",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    contractId: text("contract_id")
      .notNull()
      .references(() => contractRecords.id),
    obligationId: text("obligation_id").references(() => contractObligations.id),
    /** EXECUTION_METHODS member (WET_INK ... ONCHAIN_ATTESTED | NOT_APPLICABLE). */
    method: text("method").notNull(),
    /** DRAFT | READY | PROPOSED | TIMELOCKED | EXECUTABLE | EXECUTED | PAUSED | VOIDED | FAILED (controlled). */
    state: text("state").notNull().default("DRAFT"),
    networkKey: text("network_key"),
    chainId: integer("chain_id"),
    contractAddress: text("contract_address"),
    txHash: text("tx_hash"),
    blockNumber: bigint("block_number", { mode: "number" }),
    anchorId: text("anchor_id"),
    /** EIP-712 typed digest computed off-chain; the contract recomputes it. */
    commitment: text("commitment"),
    commitmentVersion: text("commitment_version").notNull().default("EIP712_V1"),
    referenceDocumentId: text("reference_document_id").references(() => documents.id),
    blockedBy: jsonb("blocked_by").$type<string[]>().notNull().default([]),
    note: text("note"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contract_execution_links_contract_anchor_uidx").on(t.tenantId, t.contractId, t.anchorId),
    index("contract_execution_links_method_idx").on(t.tenantId, t.method, t.state),
  ],
);

/* ------------------------------------------------------------------ */
/* §19 — Signature records                                              */
/* ------------------------------------------------------------------ */

/**
 * Signature evidence, not signature keys. Records that a party's authorized
 * signer executed a specific content hash at a specific time through a named
 * method, with the provider's ceremony reference. The signing engine refuses a
 * record whose content hash does not match the document's canonical checksum, so
 * a signed document cannot silently change underneath the record.
 */
export const contractSignatures = pgTable(
  "contract_signatures",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    contractId: text("contract_id")
      .notNull()
      .references(() => contractRecords.id),
    partyId: text("party_id").references(() => parties.id),
    signatoryName: text("signatory_name").notNull(),
    signatoryTitle: text("signatory_title"),
    /** INSTRUMENT | RESOLUTION | DELEGATION | UNVERIFIED — the basis the signing engine checked. */
    authorityBasis: text("authority_basis").notNull().default("UNVERIFIED"),
    authorityEvidenceRef: text("authority_evidence_ref"),
    /** SIGNATURE_STATES member: PENDING | SIGNED | REJECTED | WITHDRAWN | EXPIRED. */
    state: text("state").notNull().default("PENDING"),
    /** EXECUTION_METHODS member (how the signature was produced/attested). */
    method: text("method"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    /** Content hash that was actually signed (must equal the document checksum). */
    contentHash: text("content_hash"),
    documentId: text("document_id").references(() => documents.id),
    providerRef: text("provider_ref"),
    ceremonyRef: text("ceremony_ref"),
    signerIdentityRef: text("signer_identity_ref"),
    ipEvidenceRef: text("ip_evidence_ref"),
    withdrawalReason: text("withdrawal_reason"),
    /** On-chain execution method (e.g. multisig call) that stands in for a signature, if any. */
    executionMethodRef: text("execution_method_ref"),
    note: text("note"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contract_signatures_contract_idx").on(t.tenantId, t.contractId, t.state),
    index("contract_signatures_party_idx").on(t.tenantId, t.partyId),
  ],
);

/* ------------------------------------------------------------------ */
/* §20 — Disputes                                                       */
/* ------------------------------------------------------------------ */

/**
 * A dispute against a contract. The disputes engine decides whether execution
 * is paused, which obligations freeze, and what escalation applies; the row
 * stores that posture so no consumer has to re-derive it. Terminal states
 * require a resolution reference (settlement/award/closure evidence).
 */
export const contractDisputes = pgTable(
  "contract_disputes",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    contractId: text("contract_id")
      .notNull()
      .references(() => contractRecords.id),
    code: text("code").notNull(),
    /** DISPUTE_TYPES member (OBLIGATION_DISPUTED, BREACH, PAYMENT_DISPUTE, ORACLE_DISPUTE, ...). */
    disputeType: text("dispute_type").notNull(),
    /** DISPUTE_STATES member: OPEN | ESCALATED | IN_MEDIATION | IN_ARBITRATION |
     *  IN_LITIGATION | SETTLED | WITHDRAWN | CLOSED. */
    state: text("state").notNull().default("OPEN"),
    /** LOW | MEDIUM | HIGH | CRITICAL (decides pause + escalation clock with dispute type). */
    severity: text("severity").notNull().default("MEDIUM"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    /** Dispute date as recorded on the instrument/notice (day precision). */
    openedOn: date("opened_on"),
    reviewBy: date("review_by"),
    escalateBy: date("escalate_by"),
    counterpartyPosition: text("counterparty_position"),
    beyuPosition: text("beyu_position"),
    financialExposure: numeric("financial_exposure", { precision: 18, scale: 2 }),
    currencyCode: text("currency_code"),
    /** Amount truth stays in Finance/Legal-Cases; this only links. */
    financeRecordRef: text("finance_record_ref"),
    legalCaseRef: text("legal_case_ref"),
    counselRef: text("counsel_ref"),
    pausesExecution: boolean("pauses_execution").notNull().default(true),
    pauseScope: jsonb("pause_scope").$type<string[]>().notNull().default([]),
    /** Evidence set: document ids or references; nothing is stored inline. */
    evidenceRefs: jsonb("evidence_refs").$type<string[]>().notNull().default([]),
    resolutionRef: text("resolution_ref"),
    resolutionOutcome: text("resolution_outcome"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    escalationDueAt: timestamp("escalation_due_at", { withTimezone: true }),
    note: text("note"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contract_disputes_tenant_code_uidx").on(t.tenantId, t.code),
    index("contract_disputes_contract_state_idx").on(t.tenantId, t.contractId, t.state),
  ],
);

/* ------------------------------------------------------------------ */
/* §21/§22 — Legal document lifecycle (extends `documents` by reference)*/
/* ------------------------------------------------------------------ */

/**
 * Contract-side lifecycle for a legal document. Retention, legal hold,
 * checksum and storage remain canonical in `documents`; this row owns
 * DRAFT → ARCHIVED/DISPOSED state for counsel workflow plus provenance
 * (which instrument, which clause set, which negotiation record). Supersession
 * is a chain, not an overwrite: the prior row stays and gains `SUPERSEDED`.
 */
export const legalDocumentLifecycle = pgTable(
  "legal_document_lifecycle",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id),
    contractId: text("contract_id").references(() => contractRecords.id),
    partyId: text("party_id").references(() => parties.id),
    /** LEGAL_DOCUMENT_STATES member: DRAFT | UNDER_REVIEW | APPROVED | EXECUTED |
     *  SUPERSEDED | EXPIRED | WITHDRAWN | LEGAL_HOLD | ARCHIVED. */
    state: text("state").notNull().default("DRAFT"),
    /** LEGAL_DOCUMENT_CLASSES member (the registry's own closed set). */
    documentClass: text("document_class").notNull().default("OTHER_LEGAL"),
    versionNumber: integer("version_number").notNull().default(1),
    supersedesLifecycleId: text("supersedes_lifecycle_id"),
    clauseSetRef: text("clause_set_ref"),
    templateRef: text("template_ref"),
    negotiationRecordRef: text("negotiation_record_ref"),
    reviewGateStatus: text("review_gate_status").notNull().default("REVIEW_OPEN"),
    reviewGateRef: text("review_gate_ref"),
    /** Provenance: how we came to hold this document and why it is trustworthy. */
    provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull().default({}),
    confidentialityBasis: text("confidentiality_basis"),
    legalHoldRef: text("legal_hold_ref"),
    disposalHoldReason: text("disposal_hold_reason"),
    /** Disposal posture computed by the engine; disposal is a governed act, not a delete. */
    disposalPosture: jsonb("disposal_posture").$type<Record<string, unknown>>().notNull().default({}),
    attentionWindow: jsonb("attention_window").$type<Record<string, unknown>>().notNull().default({}),
    note: text("note"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("legal_document_lifecycle_doc_version_uidx").on(t.tenantId, t.documentId, t.versionNumber),
    index("legal_document_lifecycle_contract_idx").on(t.tenantId, t.contractId, t.state),
  ],
);
