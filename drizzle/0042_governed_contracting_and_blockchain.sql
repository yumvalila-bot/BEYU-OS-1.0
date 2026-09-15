/*
 * BEYU OS — GOVERNED CONTRACTING & BLOCKCHAIN (additive; 18 governed tables).
 * X10THINK Institutionalization Program — contracting domain + blockchain capability.
 *
 * ============================== WHAT THIS MIGRATION ADDS =======================
 *
 * Contracting domain (11 tables): contract_parties (contract-role view over the
 * canonical party register), contract_records (commercial spine + governed
 * lifecycle + review gates + authority snapshot), contract_lifecycle_events
 * (append-only transition ledger), contract_authority_checks (evaluated checks
 * pinned to a threshold version), contract_obligations + contract_obligation_events
 * (deterministic timing, verification evidence, append-only ledger),
 * contract_sla_measurements, contract_execution_links (contract ⇄ execution
 * mechanism incl. on-chain anchors and EIP-712 commitments), contract_signatures
 * (signature EVIDENCE only), contract_disputes, legal_document_lifecycle.
 *
 * Blockchain capability (7 tables): blockchain_anchors (EIP-712 commitments with
 * confirmation-depth verification), smart_contract_registry (testnet-first
 * progression, pinned compiler + source commit, upgrade authority),
 * blockchain_events (deduplicated indexed logs + anomalies),
 * blockchain_oracle_sources / blockchain_oracle_readings (freshness, deviation,
 * fallback, dispute semantics), blockchain_token_positions (explicitly
 * non-authoritative), blockchain_reconciliation_runs (read-only findings).
 *
 * ============================== BOUNDARIES PRESERVED =========================
 *
 *   - NO KEY MATERIAL. There is no private key, seed phrase, keystore, wallet
 *     credential or "hot address" column anywhere below, and no code path in
 *     this domain signs a transaction. BEYU computes and verifies commitments;
 *     an externally governed signer executes them (signer_ref is a reference to
 *     a custody arrangement). `creates_authority` / `grants_authority` /
 *     `mutates_state` are NOT NULL DEFAULT false columns and no write path sets
 *     them true — structural, not conventional.
 *   - Finance OS remains the sole accounting authority. Amount-carrying rows
 *     (contract_obligations, contract_sla_measurements, blockchain_* fee fields)
 *     record authoritative_owner='FINANCE_OS' plus a nullable finance_record_ref;
 *     no journal, period or posting object is created here and nothing calls the
 *     posting engine. CAP_POSTING remains locked and fail-closed (0037-0041 parity).
 *   - Documents remain canonical (platform.ts): documents already owns checksum,
 *     storage URI, retention code, legal hold and supersession, so
 *     legal_document_lifecycle references documents and adds contract-state
 *     semantics only — it never copies content or replaces retention.
 *   - Identity remains canonical in `parties`; contract_parties stores posture
 *     and a snapshot of asserted attributes, never a competing master record.
 *   - The cap table remains canonical in share_classes/equity_positions/
 *     ownership_records. blockchain_token_positions is a non-authoritative
 *     observation and reconciliation reports findings; neither can overwrite a
 *     canonical register, and there is no remediation column by design.
 *   - Enforceability is a legal determination, never a software claim:
 *     legal_review_status defaults to REQUIRES_LEGAL_REVIEW / REVIEW_OPEN on
 *     every table, and the engines return "REQUIRES_LEGAL_REVIEW" for any
 *     on-chain or off-chain execution posture.
 *   - AI never self-approves: ai_initiated is recorded on lifecycle/obligation
 *     events, and the lifecycle engine refuses AI-initiated commercial
 *     approval, authority verification, execution, termination, amendment,
 *     renewal and dispute resolution.
 *
 * Controlled vocabularies (contract type codes, 20 lifecycle states, review
 * gates, obligation kinds, signature states, dispute/SLA/document states, event
 * kinds, oracle feeds, anchor methods) are closed sets defined in
 * src/lib/contracts/vocabulary.ts and in src/lib/blockchain/model.ts, validated in the
 * service layer. They are deliberately NOT pgEnums: adding a state would
 * otherwise require an unmanaged DDL migration in the middle of a legal process,
 * and the engine — not a column type — is where legality is decided.
 *
 * Row Level Security mirrors 0035-0041: every table is RLS-enabled with the
 * canonical `tenant_id = ANY (beyu_tenant_ids())` policy (USING + WITH CHECK),
 * the runtime role receives DML only, and the verification block FAILS the
 * migration if any table lacks its policy.
 *
 * META NOTE: no drizzle-kit meta snapshot is added. The snapshot chain has been
 * stale since 0039 (drizzle/meta/0039_snapshot.json duplicates 0038's snapshot
 * id, which already blocks `drizzle-kit generate` on main); scripts/migrate.ts
 * is the only canonical runner and does not read meta. Repairing the chain stays
 * registered as remaining work; this migration does not worsen or rewrite it.
 */
--> statement-breakpoint
CREATE TABLE "contract_parties" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"party_id" text NOT NULL,
	"legal_entity_id" text,
	"counterparty_kind" text DEFAULT 'OTHER_AUTHORIZED' NOT NULL,
	"signatory_role_code" text,
	"posture" text DEFAULT 'UNKNOWN' NOT NULL,
	"credit_rating" text,
	"credit_file_ref" text,
	"sanctions_screened_at" timestamp with time zone,
	"sanctions_result" text DEFAULT 'PENDING' NOT NULL,
	"kyc_state" text DEFAULT 'PENDING' NOT NULL,
	"legal_name_snapshot" text,
	"tax_id_reference" text,
	"default_currency_code" text,
	"default_payment_terms_code" text,
	"payout_profile_ref" text,
	"approved_blockchain_address" text,
	"blockchain_address_evidence_ref" text,
	"risk_tier" text,
	"blocked_reason" text,
	"posture_detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_records" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"type_code" text NOT NULL,
	"type_family" text NOT NULL,
	"state" text DEFAULT 'DRAFT' NOT NULL,
	"criticality" text DEFAULT 'MEDIUM' NOT NULL,
	"counterparty_party_id" text,
	"beyu_entity_id" text,
	"owner_user_id" text,
	"commercial_owner_user_id" text,
	"legal_owner_user_id" text,
	"contract_value" numeric(18, 2),
	"currency_code" text,
	"signed_date" date,
	"effective_date" date,
	"expiry_date" date,
	"renewal_notice_deadline" date,
	"auto_renewal" boolean DEFAULT false NOT NULL,
	"renewal_term_months" integer,
	"governing_law_jurisdiction_code" text,
	"dispute_forum" text,
	"commercial_review_status" text DEFAULT 'REVIEW_OPEN' NOT NULL,
	"legal_review_status" text DEFAULT 'REVIEW_OPEN' NOT NULL,
	"risk_review_status" text DEFAULT 'REVIEW_OPEN' NOT NULL,
	"data_protection_review_status" text DEFAULT 'REVIEW_OPEN' NOT NULL,
	"tax_review_status" text DEFAULT 'REVIEW_OPEN' NOT NULL,
	"treasury_review_status" text DEFAULT 'REVIEW_OPEN' NOT NULL,
	"authority_policy_code" text,
	"authority_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"risk_classification_code" text,
	"framework_contract_id" text,
	"parent_contract_id" text,
	"supersedes_contract_id" text,
	"amendment_count" integer DEFAULT 0 NOT NULL,
	"renewal_count" integer DEFAULT 0 NOT NULL,
	"external_ref" text,
	"signature_block" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_state_at" timestamp with time zone,
	"execution_method" text,
	"enforceability_state" text DEFAULT 'REQUIRES_LEGAL_REVIEW' NOT NULL,
	"legal_enforceability_note" text,
	"note" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_lifecycle_events" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"contract_id" text NOT NULL,
	"action_code" text NOT NULL,
	"from_state" text NOT NULL,
	"to_state" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"ai_initiated" boolean DEFAULT false NOT NULL,
	"evidence_document_id" text,
	"evidence_ref" text,
	"resolution_ref" text,
	"dispute_ref" text,
	"note" text,
	"result_detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_authority_checks" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"contract_id" text NOT NULL,
	"check_kind" text NOT NULL,
	"outcome" text NOT NULL,
	"required_value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"threshold_version" text NOT NULL,
	"evaluated_by_user_id" text NOT NULL,
	"satisfied" boolean DEFAULT false NOT NULL,
	"note" text,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_obligations" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"contract_id" text NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"responsible_party_role" text DEFAULT 'BEYU_ENTITY' NOT NULL,
	"owner_role" text,
	"owner_user_id" text,
	"responsible_party_id" text,
	"description" text NOT NULL,
	"criticality" text DEFAULT 'MEDIUM' NOT NULL,
	"state" text DEFAULT 'PENDING' NOT NULL,
	"due_basis" text,
	"due_reference_date" date,
	"due_date" date,
	"lead_time_days" integer,
	"verification_deadline" date,
	"escalation_due_date" date,
	"amount" numeric(18, 2),
	"currency_code" text,
	"authoritative_owner" text,
	"finance_record_ref" text,
	"obligation_period_code" text,
	"dependency_obligation_id" text,
	"evidence_required" boolean DEFAULT true NOT NULL,
	"verification_evidence_ref" text,
	"verification_document_id" text,
	"verified_by_user_id" text,
	"verified_at" timestamp with time zone,
	"waiver_approval_ref" text,
	"waiver_note" text,
	"last_state_at" timestamp with time zone,
	"legal_review_status" text DEFAULT 'REQUIRES_LEGAL_REVIEW' NOT NULL,
	"note" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_obligation_events" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"obligation_id" text NOT NULL,
	"action_code" text NOT NULL,
	"from_state" text NOT NULL,
	"to_state" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"ai_initiated" boolean DEFAULT false NOT NULL,
	"evidence_ref" text,
	"note" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_sla_measurements" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"contract_id" text NOT NULL,
	"obligation_id" text,
	"code" text NOT NULL,
	"metric_name" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"target_value" numeric(18, 6),
	"threshold_value" numeric(18, 6),
	"measured_value" numeric(18, 6),
	"unit_code" text,
	"outcome" text NOT NULL,
	"within_sla" boolean NOT NULL,
	"breach_event_id" text,
	"credit_calculation_ref" text,
	"credit_amount" numeric(18, 2),
	"currency_code" text,
	"authoritative_owner" text,
	"finance_record_ref" text,
	"evidence_ref" text,
	"note" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_execution_links" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"contract_id" text NOT NULL,
	"obligation_id" text,
	"method" text NOT NULL,
	"state" text DEFAULT 'DRAFT' NOT NULL,
	"network_key" text,
	"chain_id" integer,
	"contract_address" text,
	"tx_hash" text,
	"block_number" bigint,
	"anchor_id" text,
	"commitment" text,
	"commitment_version" text DEFAULT 'EIP712_V1' NOT NULL,
	"reference_document_id" text,
	"blocked_by" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_signatures" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"contract_id" text NOT NULL,
	"party_id" text,
	"signatory_name" text NOT NULL,
	"signatory_title" text,
	"authority_basis" text DEFAULT 'UNVERIFIED' NOT NULL,
	"authority_evidence_ref" text,
	"state" text DEFAULT 'PENDING' NOT NULL,
	"method" text,
	"signed_at" timestamp with time zone,
	"content_hash" text,
	"document_id" text,
	"provider_ref" text,
	"ceremony_ref" text,
	"signer_identity_ref" text,
	"ip_evidence_ref" text,
	"withdrawal_reason" text,
	"execution_method_ref" text,
	"note" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_disputes" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"contract_id" text NOT NULL,
	"code" text NOT NULL,
	"dispute_type" text NOT NULL,
	"state" text DEFAULT 'OPEN' NOT NULL,
	"severity" text DEFAULT 'MEDIUM' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_on" date,
	"review_by" date,
	"escalate_by" date,
	"counterparty_position" text,
	"beyu_position" text,
	"financial_exposure" numeric(18, 2),
	"currency_code" text,
	"finance_record_ref" text,
	"legal_case_ref" text,
	"counsel_ref" text,
	"pauses_execution" boolean DEFAULT true NOT NULL,
	"pause_scope" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resolution_ref" text,
	"resolution_outcome" text,
	"resolved_at" timestamp with time zone,
	"escalation_due_at" timestamp with time zone,
	"note" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_document_lifecycle" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"document_id" text NOT NULL,
	"contract_id" text,
	"party_id" text,
	"state" text DEFAULT 'DRAFT' NOT NULL,
	"document_class" text DEFAULT 'OTHER_LEGAL' NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"supersedes_lifecycle_id" text,
	"clause_set_ref" text,
	"template_ref" text,
	"negotiation_record_ref" text,
	"review_gate_status" text DEFAULT 'REVIEW_OPEN' NOT NULL,
	"review_gate_ref" text,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidentiality_basis" text,
	"legal_hold_ref" text,
	"disposal_hold_reason" text,
	"disposal_posture" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attention_window" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blockchain_anchors" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"anchor_type" text NOT NULL,
	"subject_id" text,
	"contract_id" text,
	"obligation_id" text,
	"content_hash" text NOT NULL,
	"content_version" text DEFAULT 'BEYU_STABLE_V1' NOT NULL,
	"commitment" text,
	"commitment_version" text DEFAULT 'EIP712_V1' NOT NULL,
	"eip712_domain" jsonb,
	"method" text DEFAULT 'BEYU_HASH_CHAIN_ONLY' NOT NULL,
	"network_key" text,
	"chain_id" integer,
	"tx_hash" text,
	"block_number" bigint,
	"block_hash" text,
	"anchor_contract_address" text,
	"required_confirmations" integer,
	"confirmations" integer,
	"block_hash_matches_chain" boolean,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"verification" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"domain_separator" text,
	"signer_ref" text,
	"superseded_by_anchor_id" text,
	"revoked_reason" text,
	"legal_review_status" text DEFAULT 'REQUIRES_LEGAL_REVIEW' NOT NULL,
	"note" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_contract_registry" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"network_key" text NOT NULL,
	"chain_id" integer NOT NULL,
	"address" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"network_production" boolean DEFAULT false NOT NULL,
	"repository_ref" text,
	"source_commit" text,
	"compiler_version" text NOT NULL,
	"optimizer_runs" integer,
	"abi_hash" text,
	"bytecode_hash" text,
	"verified_on_explorer" boolean DEFAULT false NOT NULL,
	"proxy_kind" text DEFAULT 'NONE' NOT NULL,
	"implementation_address" text,
	"upgrade_authority" text,
	"multisig_address" text,
	"timelock_address" text,
	"timelock_delay_seconds" integer,
	"audit_status" text,
	"audit_report_document_ref" text,
	"legal_review_status" text DEFAULT 'REVIEW_OPEN' NOT NULL,
	"enforceability_note" text,
	"purpose" text,
	"oracle_dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"governance_body_ref" text,
	"risk_classification_code" text,
	"status_at" timestamp with time zone,
	"external_ref" text,
	"note" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blockchain_events" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"chain_id" integer NOT NULL,
	"contract_address" text NOT NULL,
	"block_number" bigint NOT NULL,
	"block_hash" text NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"event_kind" text NOT NULL,
	"emitted_at" timestamp with time zone NOT NULL,
	"actor_address" text,
	"func_selector" text,
	"payload" jsonb,
	"contract_id" text,
	"anchor_id" text,
	"obligation_id" text,
	"correlation_id" text,
	"ingest_state" text DEFAULT 'ACCEPTED' NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"creates_authority" boolean DEFAULT false NOT NULL,
	"note" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blockchain_oracle_sources" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"feed" text NOT NULL,
	"source_kind" text NOT NULL,
	"network_key" text,
	"chain_id" integer,
	"contract_address" text,
	"authority_ref" text,
	"deviation_limit_bps" integer DEFAULT 100 NOT NULL,
	"max_age_seconds" integer DEFAULT 3600 NOT NULL,
	"fallback_order" integer DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'ACTIVE' NOT NULL,
	"legal_review_status" text DEFAULT 'REQUIRES_LEGAL_REVIEW' NOT NULL,
	"governance_note" text,
	"manual_submitter_role_code" text,
	"note" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blockchain_oracle_readings" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"source_id" text NOT NULL,
	"subject_code" text NOT NULL,
	"feed" text NOT NULL,
	"value_bps" bigint,
	"value_text" text,
	"decimals" integer DEFAULT 0 NOT NULL,
	"raw_value" text,
	"observed_at" timestamp with time zone NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"age_seconds" integer,
	"deviation_bps" integer,
	"state" text NOT NULL,
	"usable" boolean DEFAULT false NOT NULL,
	"grants_authority" boolean DEFAULT false NOT NULL,
	"policy_version" text,
	"evaluation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"round_id" text,
	"anchor_id" text,
	"previous_reading_id" text,
	"dispute_ref" text,
	"note" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blockchain_token_positions" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"holder_address" text NOT NULL,
	"holder_party_id" text,
	"legal_entity_id" text,
	"registry_id" text,
	"token_symbol" text NOT NULL,
	"share_class_code" text,
	"balance_units" bigint DEFAULT 0 NOT NULL,
	"decimals" integer DEFAULT 0 NOT NULL,
	"shares_per_unit" numeric(18, 6) DEFAULT '1' NOT NULL,
	"chain_id" integer NOT NULL,
	"last_synced_block" bigint DEFAULT 0 NOT NULL,
	"chain_head_block" bigint DEFAULT 0 NOT NULL,
	"authoritative" boolean DEFAULT false NOT NULL,
	"state" text DEFAULT 'ACTIVE' NOT NULL,
	"last_reconciliation_run_id" text,
	"note" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blockchain_reconciliation_runs" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"network_key" text NOT NULL,
	"chain_id" integer NOT NULL,
	"registry_id" text,
	"token_symbol" text,
	"as_of_date" date,
	"shares_per_unit" numeric(18, 6) DEFAULT '1' NOT NULL,
	"tolerance_units" integer DEFAULT 0 NOT NULL,
	"stale_block_tolerance" integer DEFAULT 25 NOT NULL,
	"canonical_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"onchain_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'MATCHED' NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"finding_count" integer DEFAULT 0 NOT NULL,
	"high_severity_count" integer DEFAULT 0 NOT NULL,
	"totals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence_document_ref" text,
	"ticket_ref" text,
	"mutates_state" boolean DEFAULT false NOT NULL,
	"ran_by" text NOT NULL,
	"note" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_records" ADD CONSTRAINT "contract_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_records" ADD CONSTRAINT "contract_records_counterparty_party_id_parties_id_fk" FOREIGN KEY ("counterparty_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_records" ADD CONSTRAINT "contract_records_beyu_entity_id_legal_entities_id_fk" FOREIGN KEY ("beyu_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_lifecycle_events" ADD CONSTRAINT "contract_lifecycle_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_lifecycle_events" ADD CONSTRAINT "contract_lifecycle_events_contract_id_contract_records_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract_records"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_lifecycle_events" ADD CONSTRAINT "contract_lifecycle_events_evidence_document_id_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_authority_checks" ADD CONSTRAINT "contract_authority_checks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_authority_checks" ADD CONSTRAINT "contract_authority_checks_contract_id_contract_records_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract_records"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_obligations" ADD CONSTRAINT "contract_obligations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_obligations" ADD CONSTRAINT "contract_obligations_contract_id_contract_records_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract_records"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_obligations" ADD CONSTRAINT "contract_obligations_responsible_party_id_parties_id_fk" FOREIGN KEY ("responsible_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_obligations" ADD CONSTRAINT "contract_obligations_verification_document_id_documents_id_fk" FOREIGN KEY ("verification_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_obligation_events" ADD CONSTRAINT "contract_obligation_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_obligation_events" ADD CONSTRAINT "contract_obligation_events_obligation_id_contract_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."contract_obligations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_sla_measurements" ADD CONSTRAINT "contract_sla_measurements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_sla_measurements" ADD CONSTRAINT "contract_sla_measurements_contract_id_contract_records_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract_records"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_sla_measurements" ADD CONSTRAINT "contract_sla_measurements_obligation_id_contract_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."contract_obligations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_execution_links" ADD CONSTRAINT "contract_execution_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_execution_links" ADD CONSTRAINT "contract_execution_links_contract_id_contract_records_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract_records"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_execution_links" ADD CONSTRAINT "contract_execution_links_obligation_id_contract_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."contract_obligations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_execution_links" ADD CONSTRAINT "contract_execution_links_reference_document_id_documents_id_fk" FOREIGN KEY ("reference_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_contract_id_contract_records_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract_records"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_disputes" ADD CONSTRAINT "contract_disputes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_disputes" ADD CONSTRAINT "contract_disputes_contract_id_contract_records_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract_records"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legal_document_lifecycle" ADD CONSTRAINT "legal_document_lifecycle_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legal_document_lifecycle" ADD CONSTRAINT "legal_document_lifecycle_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legal_document_lifecycle" ADD CONSTRAINT "legal_document_lifecycle_contract_id_contract_records_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract_records"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legal_document_lifecycle" ADD CONSTRAINT "legal_document_lifecycle_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blockchain_anchors" ADD CONSTRAINT "blockchain_anchors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blockchain_anchors" ADD CONSTRAINT "blockchain_anchors_contract_id_contract_records_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract_records"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blockchain_anchors" ADD CONSTRAINT "blockchain_anchors_obligation_id_contract_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."contract_obligations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "smart_contract_registry" ADD CONSTRAINT "smart_contract_registry_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blockchain_events" ADD CONSTRAINT "blockchain_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blockchain_events" ADD CONSTRAINT "blockchain_events_contract_id_contract_records_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract_records"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blockchain_events" ADD CONSTRAINT "blockchain_events_anchor_id_blockchain_anchors_id_fk" FOREIGN KEY ("anchor_id") REFERENCES "public"."blockchain_anchors"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blockchain_events" ADD CONSTRAINT "blockchain_events_obligation_id_contract_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."contract_obligations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blockchain_oracle_sources" ADD CONSTRAINT "blockchain_oracle_sources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blockchain_oracle_readings" ADD CONSTRAINT "blockchain_oracle_readings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blockchain_oracle_readings" ADD CONSTRAINT "blockchain_oracle_readings_source_id_blockchain_oracle_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."blockchain_oracle_sources"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blockchain_oracle_readings" ADD CONSTRAINT "blockchain_oracle_readings_anchor_id_blockchain_anchors_id_fk" FOREIGN KEY ("anchor_id") REFERENCES "public"."blockchain_anchors"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blockchain_token_positions" ADD CONSTRAINT "blockchain_token_positions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blockchain_token_positions" ADD CONSTRAINT "blockchain_token_positions_holder_party_id_parties_id_fk" FOREIGN KEY ("holder_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blockchain_token_positions" ADD CONSTRAINT "blockchain_token_positions_registry_id_smart_contract_registry_id_fk" FOREIGN KEY ("registry_id") REFERENCES "public"."smart_contract_registry"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blockchain_reconciliation_runs" ADD CONSTRAINT "blockchain_reconciliation_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blockchain_reconciliation_runs" ADD CONSTRAINT "blockchain_reconciliation_runs_registry_id_smart_contract_registry_id_fk" FOREIGN KEY ("registry_id") REFERENCES "public"."smart_contract_registry"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "contract_parties_tenant_party_kind_uidx" ON "contract_parties" USING btree ("tenant_id","party_id","counterparty_kind");
--> statement-breakpoint
CREATE INDEX "contract_parties_tenant_idx" ON "contract_parties" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "contract_parties_posture_idx" ON "contract_parties" USING btree ("tenant_id","posture");
--> statement-breakpoint
CREATE UNIQUE INDEX "contract_records_tenant_code_uidx" ON "contract_records" USING btree ("tenant_id","code");
--> statement-breakpoint
CREATE INDEX "contract_records_tenant_state_idx" ON "contract_records" USING btree ("tenant_id","state");
--> statement-breakpoint
CREATE INDEX "contract_records_tenant_expiry_idx" ON "contract_records" USING btree ("tenant_id","expiry_date");
--> statement-breakpoint
CREATE INDEX "contract_records_counterparty_idx" ON "contract_records" USING btree ("tenant_id","counterparty_party_id");
--> statement-breakpoint
CREATE INDEX "contract_records_framework_idx" ON "contract_records" USING btree ("tenant_id","framework_contract_id");
--> statement-breakpoint
CREATE INDEX "contract_lifecycle_events_contract_idx" ON "contract_lifecycle_events" USING btree ("tenant_id","contract_id","recorded_at");
--> statement-breakpoint
CREATE INDEX "contract_lifecycle_events_actor_idx" ON "contract_lifecycle_events" USING btree ("tenant_id","actor_user_id");
--> statement-breakpoint
CREATE INDEX "contract_authority_checks_contract_idx" ON "contract_authority_checks" USING btree ("tenant_id","contract_id","evaluated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "contract_obligations_contract_code_uidx" ON "contract_obligations" USING btree ("tenant_id","contract_id","code");
--> statement-breakpoint
CREATE INDEX "contract_obligations_due_idx" ON "contract_obligations" USING btree ("tenant_id","due_date","state");
--> statement-breakpoint
CREATE INDEX "contract_obligations_owner_idx" ON "contract_obligations" USING btree ("tenant_id","owner_user_id");
--> statement-breakpoint
CREATE INDEX "contract_obligation_events_obligation_idx" ON "contract_obligation_events" USING btree ("tenant_id","obligation_id","recorded_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "contract_sla_measurements_contract_period_uidx" ON "contract_sla_measurements" USING btree ("tenant_id","contract_id","code","period_start");
--> statement-breakpoint
CREATE INDEX "contract_sla_measurements_outcome_idx" ON "contract_sla_measurements" USING btree ("tenant_id","outcome");
--> statement-breakpoint
CREATE UNIQUE INDEX "contract_execution_links_contract_anchor_uidx" ON "contract_execution_links" USING btree ("tenant_id","contract_id","anchor_id");
--> statement-breakpoint
CREATE INDEX "contract_execution_links_method_idx" ON "contract_execution_links" USING btree ("tenant_id","method","state");
--> statement-breakpoint
CREATE INDEX "contract_signatures_contract_idx" ON "contract_signatures" USING btree ("tenant_id","contract_id","state");
--> statement-breakpoint
CREATE INDEX "contract_signatures_party_idx" ON "contract_signatures" USING btree ("tenant_id","party_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "contract_disputes_tenant_code_uidx" ON "contract_disputes" USING btree ("tenant_id","code");
--> statement-breakpoint
CREATE INDEX "contract_disputes_contract_state_idx" ON "contract_disputes" USING btree ("tenant_id","contract_id","state");
--> statement-breakpoint
CREATE UNIQUE INDEX "legal_document_lifecycle_doc_version_uidx" ON "legal_document_lifecycle" USING btree ("tenant_id","document_id","version_number");
--> statement-breakpoint
CREATE INDEX "legal_document_lifecycle_contract_idx" ON "legal_document_lifecycle" USING btree ("tenant_id","contract_id","state");
--> statement-breakpoint
CREATE UNIQUE INDEX "blockchain_anchors_tenant_tx_log_uidx" ON "blockchain_anchors" USING btree ("tenant_id","chain_id","tx_hash");
--> statement-breakpoint
CREATE INDEX "blockchain_anchors_subject_idx" ON "blockchain_anchors" USING btree ("tenant_id","anchor_type","subject_id");
--> statement-breakpoint
CREATE INDEX "blockchain_anchors_status_idx" ON "blockchain_anchors" USING btree ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX "blockchain_anchors_content_hash_idx" ON "blockchain_anchors" USING btree ("content_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "smart_contract_registry_chain_addr_uidx" ON "smart_contract_registry" USING btree ("tenant_id","chain_id","address");
--> statement-breakpoint
CREATE INDEX "smart_contract_registry_status_idx" ON "smart_contract_registry" USING btree ("tenant_id","network_key","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "blockchain_events_chain_tx_log_uidx" ON "blockchain_events" USING btree ("tenant_id","chain_id","tx_hash","log_index");
--> statement-breakpoint
CREATE UNIQUE INDEX "blockchain_events_dedupe_uidx" ON "blockchain_events" USING btree ("tenant_id","dedupe_key");
--> statement-breakpoint
CREATE INDEX "blockchain_events_contract_kind_idx" ON "blockchain_events" USING btree ("tenant_id","contract_address","event_kind");
--> statement-breakpoint
CREATE INDEX "blockchain_events_block_idx" ON "blockchain_events" USING btree ("chain_id","block_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "blockchain_oracle_sources_tenant_code_uidx" ON "blockchain_oracle_sources" USING btree ("tenant_id","code");
--> statement-breakpoint
CREATE INDEX "blockchain_oracle_sources_feed_idx" ON "blockchain_oracle_sources" USING btree ("tenant_id","feed","state");
--> statement-breakpoint
CREATE UNIQUE INDEX "blockchain_oracle_readings_source_subject_obs_uidx" ON "blockchain_oracle_readings" USING btree ("tenant_id","source_id","subject_code","observed_at");
--> statement-breakpoint
CREATE INDEX "blockchain_oracle_readings_subject_asof_idx" ON "blockchain_oracle_readings" USING btree ("tenant_id","feed","subject_code","as_of");
--> statement-breakpoint
CREATE INDEX "blockchain_oracle_readings_usable_idx" ON "blockchain_oracle_readings" USING btree ("tenant_id","usable");
--> statement-breakpoint
CREATE UNIQUE INDEX "blockchain_token_positions_addr_token_uidx" ON "blockchain_token_positions" USING btree ("tenant_id","chain_id","holder_address","token_symbol");
--> statement-breakpoint
CREATE INDEX "blockchain_token_positions_holder_idx" ON "blockchain_token_positions" USING btree ("tenant_id","holder_party_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "blockchain_reconciliation_runs_tenant_code_uidx" ON "blockchain_reconciliation_runs" USING btree ("tenant_id","code");
--> statement-breakpoint
CREATE INDEX "blockchain_reconciliation_runs_status_idx" ON "blockchain_reconciliation_runs" USING btree ("tenant_id","status","created_at");
--> statement-breakpoint
ALTER TABLE "contract_parties" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contract_records" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contract_lifecycle_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contract_authority_checks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contract_obligations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contract_obligation_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contract_sla_measurements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contract_execution_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contract_signatures" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contract_disputes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "legal_document_lifecycle" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "blockchain_anchors" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "smart_contract_registry" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "blockchain_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "blockchain_oracle_sources" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "blockchain_oracle_readings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "blockchain_token_positions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "blockchain_reconciliation_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY contract_parties_tenant_isolation ON contract_parties USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
CREATE POLICY contract_records_tenant_isolation ON contract_records USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
CREATE POLICY contract_lifecycle_events_tenant_isolation ON contract_lifecycle_events USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
CREATE POLICY contract_authority_checks_tenant_isolation ON contract_authority_checks USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
CREATE POLICY contract_obligations_tenant_isolation ON contract_obligations USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
CREATE POLICY contract_obligation_events_tenant_isolation ON contract_obligation_events USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
CREATE POLICY contract_sla_measurements_tenant_isolation ON contract_sla_measurements USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
CREATE POLICY contract_execution_links_tenant_isolation ON contract_execution_links USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
CREATE POLICY contract_signatures_tenant_isolation ON contract_signatures USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
CREATE POLICY contract_disputes_tenant_isolation ON contract_disputes USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
CREATE POLICY legal_document_lifecycle_tenant_isolation ON legal_document_lifecycle USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
CREATE POLICY blockchain_anchors_tenant_isolation ON blockchain_anchors USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
CREATE POLICY smart_contract_registry_tenant_isolation ON smart_contract_registry USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
CREATE POLICY blockchain_events_tenant_isolation ON blockchain_events USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
CREATE POLICY blockchain_oracle_sources_tenant_isolation ON blockchain_oracle_sources USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
CREATE POLICY blockchain_oracle_readings_tenant_isolation ON blockchain_oracle_readings USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
CREATE POLICY blockchain_token_positions_tenant_isolation ON blockchain_token_positions USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
CREATE POLICY blockchain_reconciliation_runs_tenant_isolation ON blockchain_reconciliation_runs USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
/* Runtime DML grant, mirroring 0035-0041. No DDL is ever granted to the runtime role. */
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO %I', 'contract_parties, contract_records, contract_lifecycle_events, contract_authority_checks, contract_obligations, contract_obligation_events, contract_sla_measurements, contract_execution_links, contract_signatures, contract_disputes, legal_document_lifecycle, blockchain_anchors, smart_contract_registry, blockchain_events, blockchain_oracle_sources, blockchain_oracle_readings, blockchain_token_positions, blockchain_reconciliation_runs', r.rolname);
    RAISE NOTICE 'granted governed contracting / blockchain DML to %', r.rolname;
  END LOOP;
END
$$;
--> statement-breakpoint
/*
 * Verification. The migration FAILS if any table lacks its tenant isolation
 * policy, so a half-applied migration cannot leave an unprotected contract or
 * blockchain table behind (0035-0041 parity).
 */
DO $$
DECLARE
  table_name text;
  policy_count int;
BEGIN
  FOR table_name IN SELECT unnest(ARRAY['contract_parties', 'contract_records', 'contract_lifecycle_events', 'contract_authority_checks', 'contract_obligations', 'contract_obligation_events', 'contract_sla_measurements', 'contract_execution_links', 'contract_signatures', 'contract_disputes', 'legal_document_lifecycle', 'blockchain_anchors', 'smart_contract_registry', 'blockchain_events', 'blockchain_oracle_sources', 'blockchain_oracle_readings', 'blockchain_token_positions', 'blockchain_reconciliation_runs'])
  LOOP
    SELECT count(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = table_name
      AND policyname = table_name || '_tenant_isolation';
    IF policy_count = 0 THEN
      RAISE EXCEPTION 'Migration 0042 verification failed: % has no tenant isolation policy', table_name;
    END IF;
  END LOOP;
END $$;
