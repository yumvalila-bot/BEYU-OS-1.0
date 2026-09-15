/**
 * BEYU OS — GOVERNED BLOCKCHAIN CAPABILITY tables (X10THINK master program).
 *
 * ============================== WHAT THIS DOMAIN IS ============================
 *
 * Evidence and execution infrastructure under BEYU governance: anchored
 * commitments (EIP-712 typed digests), a smart-contract registry with
 * testnet-first progression, indexed on-chain events, governed oracles with
 * freshness/deviation semantics, on-chain token positions, and read-only
 * reconciliation against the canonical cap table.
 *
 * ============================== WHAT THIS DOMAIN IS NOT ========================
 *
 *   - NOT a signer. There is NO key material anywhere in this schema: no
 *     private key, no seed phrase, no keystore, no wallet credential column, and
 *     no address marked as "hot". BEYU computes commitments off-chain, publishes
 *     them through an externally governed signer, and verifies what came back.
 *     `signer_ref` is a reference to the custody arrangement, never a key.
 *   - NOT a chain node or indexer. `blockchain_events` stores what an indexer
 *     reported after validation by `src/lib/blockchain/model.ts`; the tables
 *     never poll a RPC endpoint and never claim completeness of the chain.
 *   - NOT an authority source. `usable`, `verified`, `creates_authority=false`
 *     and `grants_authority=false` are structural: a confirmed anchor proves a
 *     commitment existed at a height; it does not approve anything, and an oracle
 *     reading never authorizes a payment.
 *   - NOT a second ledger or cap table. `blockchain_token_positions` is
 *     explicitly NON-authoritative; `blockchain_reconciliation_runs` reports
 *     differences against `equity_*`/`ownership_records` and cannot write to them.
 *   - NOT a token issuance platform. `smart_contract_registry` records what
 *     exists and who may change it; issuance requires governed approvals recorded
 *     in Governance, and the registry's testnet-first status machine refuses a
 *     mainnet record that never passed audit and legal review.
 *
 * ============================== ISOLATION =====================================
 *
 * Every table carries `tenant_id` (references `tenants`). Migration 0042 enables
 * RLS with the canonical `tenant_id = ANY (beyu_tenant_ids())` policy
 * (USING + WITH CHECK), grants the runtime role DML only, and FAILS if any table
 * lacks its policy — mirroring 0035–0041.
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
import { tenants } from "./core";
import { parties } from "./identity";
import { contractRecords, contractObligations } from "./contracts";

/* ------------------------------------------------------------------ */
/* §37 — Anchors (commitment evidence)                                  */
/* ------------------------------------------------------------------ */

/**
 * One anchored commitment. The pair (content_hash, commitment) is the whole
 * point: `content_hash` is what BEYU hashed, `commitment` is the EIP-712 typed
 * digest placed on-chain, and `verification` stores the engine's findings at
 * the time it was checked. `status` may only be VERIFIED when the engine found
 * no blocking evidence, so a row cannot be "verified" by assertion.
 */
export const blockchainAnchors = pgTable(
  "blockchain_anchors",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** CONTRACT | OBLIGATION | LEGAL_DOCUMENT | CAP_TABLE_SNAPSHOT | POLICY_SET | DECISION_LOG (controlled). */
    anchorType: text("anchor_type").notNull(),
    /** Domain row the commitment is about (deliberately not a FK: an anchor may cover a set). */
    subjectId: text("subject_id"),
    contractId: text("contract_id").references(() => contractRecords.id),
    obligationId: text("obligation_id").references(() => contractObligations.id),
    /** 0x + 64 hex: SHA-256 of the canonicalized subject payload. */
    contentHash: text("content_hash").notNull(),
    contentVersion: text("content_version").notNull().default("BEYU_STABLE_V1"),
    /** EIP-712 typed digest placed on-chain (legacy rows may carry the BEYU_HASH_CHAIN_ONLY sha). */
    commitment: text("commitment"),
    commitmentVersion: text("commitment_version").notNull().default("EIP712_V1"),
    eip712Domain: jsonb("eip712_domain").$type<Record<string, unknown>>(),
    /** EVM_TRANSACTION_CALLDATA | EVM_LOG_INDEXED | ONCHAIN_REGISTRY_COMMITMENT | BEYU_HASH_CHAIN_ONLY (controlled). */
    method: text("method").notNull().default("BEYU_HASH_CHAIN_ONLY"),
    networkKey: text("network_key"),
    chainId: integer("chain_id"),
    txHash: text("tx_hash"),
    blockNumber: bigint("block_number", { mode: "number" }),
    blockHash: text("block_hash"),
    /** Anchor/registry contract that carries the commitment — must be registered. */
    anchorContractAddress: text("anchor_contract_address"),
    requiredConfirmations: integer("required_confirmations"),
    confirmations: integer("confirmations"),
    blockHashMatchesChain: boolean("block_hash_matches_chain"),
    /** PENDING | RECORDED | VERIFIED | SUPERSEDED | REVOKED | FAILED | BLOCKED (controlled). */
    status: text("status").notNull().default("PENDING"),
    /** Engine output: blocking findings, confirmation depth, commitment match. */
    verification: jsonb("verification").$type<Record<string, unknown>>().notNull().default({}),
    /** EIP-712 domain separator used for the digest (reproducibility anchor). */
    domainSeparator: text("domain_separator"),
    signerRef: text("signer_ref"),
    supersededByAnchorId: text("superseded_by_anchor_id"),
    revokedReason: text("revoked_reason"),
    legalReviewStatus: text("legal_review_status").notNull().default("REQUIRES_LEGAL_REVIEW"),
    note: text("note"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("blockchain_anchors_tenant_tx_log_uidx").on(t.tenantId, t.chainId, t.txHash),
    index("blockchain_anchors_subject_idx").on(t.tenantId, t.anchorType, t.subjectId),
    index("blockchain_anchors_status_idx").on(t.tenantId, t.status),
    index("blockchain_anchors_content_hash_idx").on(t.contentHash),
  ],
);

/* ------------------------------------------------------------------ */
/* §40/§43 — Smart-contract registry                                    */
/* ------------------------------------------------------------------ */

/**
 * Registry of deployed contracts BEYU recognizes, with the provenance needed to
 * reason about them: pinned compiler version, source commit, ABI/bytecode
 * hashes, audit and legal-review state, and — for proxied deployments — the
 * implementation plus the ADDRESS that may upgrade it. A record is engineering
 * evidence about code; `legal_review_status` and `enforceability_note` exist so
 * nobody mistakes "deployed and verified" for "legally sanctioned".
 */
export const smartContractRegistry = pgTable(
  "smart_contract_registry",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    networkKey: text("network_key").notNull(),
    chainId: integer("chain_id").notNull(),
    /** Canonical EIP-55 checksummed address (stored lower-case-normalized by the service). */
    address: text("address"),
    /** DRAFT | AUDIT_PENDING | APPROVED_TESTNET | DEPLOYED_TESTNET | VERIFIED_TESTNET | APPROVED_MAINNET | DEPLOYED_MAINNET | DEPRECATED | COMPROMISED (controlled). */
    status: text("status").notNull().default("DRAFT"),
    /** Production flag copied from the network catalogue at record time: the deploy gate reads this, never a client claim. */
    networkProduction: boolean("network_production").notNull().default(false),
    repositoryRef: text("repository_ref"),
    sourceCommit: text("source_commit"),
    compilerVersion: text("compiler_version").notNull(),
    optimizerRuns: integer("optimizer_runs"),
    abiHash: text("abi_hash"),
    bytecodeHash: text("bytecode_hash"),
    verifiedOnExplorer: boolean("verified_on_explorer").notNull().default(false),
    /** NONE | TRANSPARENT | UUPS | BEACON (controlled). */
    proxyKind: text("proxy_kind").notNull().default("NONE"),
    implementationAddress: text("implementation_address"),
    /** Address allowed to upgrade — a multisig/timelock, never a bare EOA (engine refuses). */
    upgradeAuthority: text("upgrade_authority"),
    multisigAddress: text("multisig_address"),
    timelockAddress: text("timelock_address"),
    timelockDelaySeconds: integer("timelock_delay_seconds"),
    auditStatus: text("audit_status"),
    auditReportDocumentRef: text("audit_report_document_ref"),
    legalReviewStatus: text("legal_review_status").notNull().default("REVIEW_OPEN"),
    enforceabilityNote: text("enforceability_note"),
    purpose: text("purpose"),
    /** Feeds this contract consumes; validated against the oracle catalogue. */
    oracleDependencies: jsonb("oracle_dependencies").$type<string[]>().notNull().default([]),
    governanceBodyRef: text("governance_body_ref"),
    riskClassificationCode: text("risk_classification_code"),
    /** Registry-level state timestamp (status history lives in the audit trail). */
    statusAt: timestamp("status_at", { withTimezone: true }),
    externalRef: text("external_ref"),
    note: text("note"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("smart_contract_registry_chain_addr_uidx").on(t.tenantId, t.chainId, t.address),
    index("smart_contract_registry_status_idx").on(t.tenantId, t.networkKey, t.status),
  ],
);

/* ------------------------------------------------------------------ */
/* §33 — Indexed events                                                 */
/* ------------------------------------------------------------------ */

/**
 * One validated log entry. Dedup is structural: `(chain_id, tx_hash, log_index)`
 * is unique, so a replay is impossible rather than merely discouraged. Findings
 * from the indexer (gaps, reorg candidates, unauthorized actors, attempted
 * payload disclosure) are stored alongside the event, because a "quietly fixed"
 * anomaly is exactly what governance must be able to see.
 */
export const blockchainEvents = pgTable(
  "blockchain_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** Deterministic sha256 of chain_id|tx_hash|log_index (replay-stable). */
    dedupeKey: text("dedupe_key").notNull(),
    chainId: integer("chain_id").notNull(),
    /** EIP-55 checksummed emitting contract (registry-checked). */
    contractAddress: text("contract_address").notNull(),
    blockNumber: bigint("block_number", { mode: "number" }).notNull(),
    blockHash: text("block_hash").notNull(),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    /** 24 governed kinds (controlled); unknown kinds are rejected by the engine. */
    eventKind: text("event_kind").notNull(),
    emittedAt: timestamp("emitted_at", { withTimezone: true }).notNull(),
    actorAddress: text("actor_address"),
    funcSelector: text("func_selector"),
    /** Commitment-bearing attributes only; confidential content/personal data is rejected. */
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    /** Contract ⇄ domain attribution, set by the indexer from the registry. */
    contractId: text("contract_id").references(() => contractRecords.id),
    anchorId: text("anchor_id").references(() => blockchainAnchors.id),
    obligationId: text("obligation_id").references(() => contractObligations.id),
    correlationId: text("correlation_id"),
    /** Indexer status: ACCEPTED | DUPLICATE | QUARANTINED (controlled). */
    ingestState: text("ingest_state").notNull().default("ACCEPTED"),
    findings: jsonb("findings").$type<string[]>().notNull().default([]),
    /** Structural: an event can never create authority (engine returns false). */
    createsAuthority: boolean("creates_authority").notNull().default(false),
    note: text("note"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("blockchain_events_chain_tx_log_uidx").on(t.tenantId, t.chainId, t.txHash, t.logIndex),
    uniqueIndex("blockchain_events_dedupe_uidx").on(t.tenantId, t.dedupeKey),
    index("blockchain_events_contract_kind_idx").on(t.tenantId, t.contractAddress, t.eventKind),
    index("blockchain_events_block_idx").on(t.chainId, t.blockNumber),
  ],
);

/* ------------------------------------------------------------------ */
/* §32 — Governed oracles                                               */
/* ------------------------------------------------------------------ */

/**
 * An oracle source as governed: which feed family it serves, what qualifies it
 * (`authority_ref`), the deviation limit and max age the evaluator applies, and
 * which fallback rank it holds. A source is DISQUALIFIED rather than deleted, so
 * history stays explainable.
 */
export const blockchainOracleSources = pgTable(
  "blockchain_oracle_sources",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    /** FX_RATE | COMMODITY_PRICE | MILESTONE_COMPLETION | DELIVERY_ACCEPTANCE | WEATHER_INDEX | PAYMENT_CONFIRMATION | GOVERNMENT_VERIFICATION | DONOR_DISBURSEMENT | IDENTITY_VERIFICATION | REGULATORY_STATE (controlled). */
    feed: text("feed").notNull(),
    /** AUTHORITATIVE_PRIMARY | SISTER_SOURCE | OPEN_DATA | MANUAL_EVIDENCE | ONCHAIN_PUSH (controlled). */
    sourceKind: text("source_kind").notNull(),
    networkKey: text("network_key"),
    chainId: integer("chain_id"),
    /** Oracle contract on-chain, if the source is a push feed (registry-checked). */
    contractAddress: text("contract_address"),
    /** Reference to the registry/legal record that qualifies this source. */
    authorityRef: text("authority_ref"),
    deviationLimitBps: integer("deviation_limit_bps").notNull().default(100),
    maxAgeSeconds: integer("max_age_seconds").notNull().default(3600),
    fallbackOrder: integer("fallback_order").notNull().default(1),
    /** ACTIVE | SUSPENDED | DISQUALIFIED (controlled; disqualification is a governed act). */
    state: text("state").notNull().default("ACTIVE"),
    legalReviewStatus: text("legal_review_status").notNull().default("REQUIRES_LEGAL_REVIEW"),
    governanceNote: text("governance_note"),
    /** Manual readings need a named human; this records who may submit them. */
    manualSubmitterRoleCode: text("manual_submitter_role_code"),
    note: text("note"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("blockchain_oracle_sources_tenant_code_uidx").on(t.tenantId, t.code),
    index("blockchain_oracle_sources_feed_idx").on(t.tenantId, t.feed, t.state),
  ],
);

/**
 * One reading. `raw_value` is kept as text so on-chain scaling (decimals) is
 * never silently reinterpreted, and `usable`/`evaluation` are the engine's
 * verdict frozen at decision time — a later re-read of the same row must
 * reproduce the same verdict for the same `as_of`.
 */
export const blockchainOracleReadings = pgTable(
  "blockchain_oracle_readings",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sourceId: text("source_id")
      .notNull()
      .references(() => blockchainOracleSources.id),
    /** Anchor of the reading (e.g. currency pair, commodity, milestone id). */
    subjectCode: text("subject_code").notNull(),
    feed: text("feed").notNull(),
    valueBps: bigint("value_bps", { mode: "number" }),
    valueText: text("value_text"),
    decimals: integer("decimals").notNull().default(0),
    rawValue: text("raw_value"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    /** Decision instant the reading was evaluated against (stale/fresh is relative to this). */
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    ageSeconds: integer("age_seconds"),
    deviationBps: integer("deviation_bps"),
    /** CURRENT | STALE | EXPIRED | DISPUTED | INVALID | MISSING (controlled). */
    state: text("state").notNull(),
    usable: boolean("usable").notNull().default(false),
    /** Structural: a reading never grants authority (engine returns false). */
    grantsAuthority: boolean("grants_authority").notNull().default(false),
    /** Governing document version in force at evaluation (reproducibility). */
    policyVersion: text("policy_version"),
    evaluation: jsonb("evaluation").$type<Record<string, unknown>>().notNull().default({}),
    /** On-chain round identifier for push feeds. */
    roundId: text("round_id"),
    /** Anchor proving the round was published on-chain, when applicable. */
    anchorId: text("anchor_id").references(() => blockchainAnchors.id),
    previousReadingId: text("previous_reading_id"),
    disputeRef: text("dispute_ref"),
    note: text("note"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("blockchain_oracle_readings_source_subject_obs_uidx").on(
      t.tenantId,
      t.sourceId,
      t.subjectCode,
      t.observedAt,
    ),
    index("blockchain_oracle_readings_subject_asof_idx").on(t.tenantId, t.feed, t.subjectCode, t.asOf),
    index("blockchain_oracle_readings_usable_idx").on(t.tenantId, t.usable),
  ],
);

/* ------------------------------------------------------------------ */
/* §34 — On-chain token positions (non-authoritative)                   */
/* ------------------------------------------------------------------ */

/**
 * Observed on-chain balance. Authoritativeness is a column with a default of
 * false — and there is no write path that sets it true. Canonical share counts
 * live in `share_classes`/`equity_positions`; this table exists so
 * reconciliation has something to compare against and so a holder's
 * representation can be attributed to a registered token contract.
 */
export const blockchainTokenPositions = pgTable(
  "blockchain_token_positions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    holderAddress: text("holder_address").notNull(),
    /** Canonical holder, when the address has been attributed to a party. */
    holderPartyId: text("holder_party_id").references(() => parties.id),
    legalEntityId: text("legal_entity_id"),
    registryId: text("registry_id").references(() => smartContractRegistry.id),
    tokenSymbol: text("token_symbol").notNull(),
    shareClassCode: text("share_class_code"),
    balanceUnits: bigint("balance_units", { mode: "number" }).notNull().default(0),
    decimals: integer("decimals").notNull().default(0),
    /** Share ⇄ token scaling used by the last reconciliation. */
    sharesPerUnit: numeric("shares_per_unit", { precision: 18, scale: 6 }).notNull().default("1"),
    chainId: integer("chain_id").notNull(),
    lastSyncedBlock: bigint("last_synced_block", { mode: "number" }).notNull().default(0),
    chainHeadBlock: bigint("chain_head_block", { mode: "number" }).notNull().default(0),
    /** Non-authoritative by construction: the cap table is the canonical register. */
    authoritative: boolean("authoritative").notNull().default(false),
    /** ACTIVE | FROZEN | UNKNOWN_HOLDER (controlled). */
    state: text("state").notNull().default("ACTIVE"),
    lastReconciliationRunId: text("last_reconciliation_run_id"),
    note: text("note"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("blockchain_token_positions_addr_token_uidx").on(t.tenantId, t.chainId, t.holderAddress, t.tokenSymbol),
    index("blockchain_token_positions_holder_idx").on(t.tenantId, t.holderPartyId),
  ],
);

/* ------------------------------------------------------------------ */
/* §34 — Reconciliation runs                                            */
/* ------------------------------------------------------------------ */

/**
 * A read-only reconciliation run. Inputs and outputs are stored together so a
 * reviewer can see exactly what was compared (and with what tolerance), not just
 * a verdict. There is no "fix" column: discrepancies are findings for a human,
 * and remediation happens through the governed cap-table and registry paths.
 */
export const blockchainReconciliationRuns = pgTable(
  "blockchain_reconciliation_runs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    networkKey: text("network_key").notNull(),
    chainId: integer("chain_id").notNull(),
    registryId: text("registry_id").references(() => smartContractRegistry.id),
    tokenSymbol: text("token_symbol"),
    /** As-of date for the canonical side (the cap table is effective-dated). */
    asOfDate: date("as_of_date"),
    sharesPerUnit: numeric("shares_per_unit", { precision: 18, scale: 6 }).notNull().default("1"),
    toleranceUnits: integer("tolerance_units").notNull().default(0),
    staleBlockTolerance: integer("stale_block_tolerance").notNull().default(25),
    canonicalSnapshot: jsonb("canonical_snapshot").$type<Record<string, unknown>[]>().notNull().default([]),
    onchainSnapshot: jsonb("onchain_snapshot").$type<Record<string, unknown>[]>().notNull().default([]),
    /** MATCHED | RECONCILED_WITH_FINDINGS | UNRECONCILED (controlled). */
    status: text("status").notNull().default("MATCHED"),
    findings: jsonb("findings").$type<Record<string, unknown>[]>().notNull().default([]),
    findingCount: integer("finding_count").notNull().default(0),
    highSeverityCount: integer("high_severity_count").notNull().default(0),
    totals: jsonb("totals").$type<Record<string, unknown>>().notNull().default({}),
    /** Snapshot evidence document (documents registry), when one was filed. */
    evidenceDocumentRef: text("evidence_document_ref"),
    ticketRef: text("ticket_ref"),
    /** Structural: reconciliation never mutates either side of the comparison. */
    mutatesState: boolean("mutates_state").notNull().default(false),
    ranBy: text("ran_by").notNull(),
    note: text("note"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("blockchain_reconciliation_runs_tenant_code_uidx").on(t.tenantId, t.code),
    index("blockchain_reconciliation_runs_status_idx").on(t.tenantId, t.status, t.createdAt),
  ],
);
