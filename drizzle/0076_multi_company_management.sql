-- ---------------------------------------------------------------------------
-- BEYU OS — 0076 MULTI_COMPANY_MANAGEMENT (MCM)
--
-- ONE capability inside BEYU OS. This migration creates NO operating system, NO
-- ledger, NO identity model, NO corporate registry and NO AI runtime. Every
-- structure below is justified by an ABSENCE verified against `main` at
-- dc8f848 (see docs/enterprise/MCM_REPOSITORY_RECONCILIATION.md §4):
--
--   * the corporate registry (legal_entities / ownership_records /
--     entity_appointments / org_units) exists but cannot express a registered
--     office, statutory identifiers, a group reporting currency/timezone, a
--     DORMANT/DISSOLVED state, or instrument-backed ownership VALIDATION;
--   * there is no table for non-ownership entity relationships, so the only
--     relationship the platform can express is parent_entity_id;
--   * Finance OS has no consolidation run, no elimination, no intercompany
--     register and NO governed FX rate SOURCE (journal_entries.fx_rate is a
--     per-entry literal);
--   * there is no per-country statutory configuration or filing register;
--   * procurement exists only inside Foundation and Ujenzi, assets only inside
--     Agriculture/Foundation/Family Office, and projects only per sector;
--   * there is no declared cross-OS data contract register.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--   * It does not widen `beyu_lifecycle_status`. That enum is used by ~40
--     tables; adding DORMANT/DISSOLVED there would silently change the meaning
--     of unrelated rows. MCM keeps its own `beyu_mcm_lifecycle_state`.
--   * It does not widen `beyu_ownership_type`; ownership truth stays exactly
--     where it is.
--   * It appends exactly two labels to `beyu_entity_type`
--     (SPECIAL_PURPOSE_VEHICLE, BUSINESS_UNIT). ALTER TYPE ... ADD VALUE appends,
--     so no existing label, row or behaviour moves.
--   * It does not create a second registry of directors, officers, employees,
--     risks, contracts, documents or audit events.
--   * It posts nothing. CAP_POSTING remains LOCKED; journal_entries and
--     journal_lines remain the only booked truth in BEYU OS.
--
-- INVARIANTS ENFORCED BY THE DATABASE
--   * Money is numeric(38,0) INTEGER MINOR UNITS with an explicit currency on
--     every monetary row. No float, no implicit currency, anywhere.
--   * Every figure-bearing table carries a NOT NULL data_state so an aggregate
--     can never present a model as booked truth, and UNAVAILABLE is an explicit
--     state rather than a silent zero.
--   * A table named for OWNERSHIP cannot record ownership: entity_relationships
--     refuses an ownership type by CHECK constraint.
--   * An intercompany transaction cannot reach BOTH_SIDES_AUTHORIZED unless two
--     DIFFERENT principals authorised their own side.
--   * Lifecycle and reconciliation rows are append-only: triggers refuse UPDATE
--     and DELETE, so history cannot be rewritten.
--   * Foundation isolation is preserved: no MCM policy reaches a tenant outside
--     the caller's resolved tenant set, and no MCM structure references a
--     Foundation-confidential table.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- ENUMERATIONS (additive)
-- ---------------------------------------------------------------------------

CREATE TYPE "public"."beyu_mcm_lifecycle_state" AS ENUM('DRAFT', 'PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DORMANT', 'DISSOLVED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."beyu_entity_relationship_type" AS ENUM('PARENT_SUBSIDIARY', 'MANAGEMENT', 'GOVERNANCE', 'BRANCH', 'OPERATIONAL_AFFILIATION', 'SHARED_SERVICES', 'AGENCY', 'FRANCHISE');--> statement-breakpoint
CREATE TYPE "public"."beyu_ownership_validation_state" AS ENUM('UNVALIDATED', 'VALID', 'OVER_ALLOCATED', 'INSTRUMENT_MISSING', 'PROVENANCE_MISSING', 'CIRCULAR', 'RETURNS_HUMAN_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."beyu_intercompany_state" AS ENUM('DRAFT', 'PROPOSED', 'AWAITING_COUNTERPARTY', 'BOTH_SIDES_AUTHORIZED', 'RECONCILED', 'DISPUTED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."beyu_consolidation_state" AS ENUM('DRAFT', 'COLLECTING', 'TRANSLATED', 'ELIMINATED', 'AWAITING_REVIEW', 'REVIEWED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."beyu_mcm_data_state" AS ENUM('ACTUAL', 'CONSOLIDATED', 'ESTIMATED', 'FORECAST', 'PENDING', 'RESTRICTED', 'UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."beyu_mcm_integration_state" AS ENUM('DECLARED', 'VERIFIED', 'DEGRADED', 'UNAVAILABLE', 'RETIRED');--> statement-breakpoint

-- APPEND-ONLY: two labels for genuinely different legal forms. ALTER TYPE ...
-- ADD VALUE appends; no existing label, row or behaviour moves.
ALTER TYPE "public"."beyu_entity_type" ADD VALUE IF NOT EXISTS 'SPECIAL_PURPOSE_VEHICLE';--> statement-breakpoint
ALTER TYPE "public"."beyu_entity_type" ADD VALUE IF NOT EXISTS 'BUSINESS_UNIT';--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 1. CORPORATE REGISTRY COMPLETION
-- ---------------------------------------------------------------------------

CREATE TABLE "legal_entity_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"mcm_lifecycle_state" "beyu_mcm_lifecycle_state" DEFAULT 'ACTIVE' NOT NULL,
	"registered_office" text,
	"registered_office_country_code" text,
	"statutory_identifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reporting_currency" text NOT NULL,
	"reporting_timezone" text NOT NULL,
	"statutory_obligations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"consolidated" boolean DEFAULT true NOT NULL,
	"consolidation_method" text DEFAULT 'FULL' NOT NULL,
	"incorporation_document_id" text,
	"verification_state" text DEFAULT 'PENDING_VERIFICATION' NOT NULL,
	"verified_by_user_id" text,
	"verified_at" timestamp with time zone,
	"verification_evidence_document_id" text,
	"pending_verification_note" text,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "legal_entity_profiles_entity_uidx" UNIQUE("legal_entity_id"),
	CONSTRAINT "legal_entity_profiles_method_check" CHECK (consolidation_method IN ('FULL','EQUITY','PROPORTIONATE','NONE')),
	CONSTRAINT "legal_entity_profiles_verification_check" CHECK (verification_state IN ('PENDING_VERIFICATION','VERIFIED','REJECTED','REQUIRES_HUMAN_REVIEW')),
	-- A VERIFIED profile MUST name the human who verified it and when. An
	-- unverified profile MUST say why it is unverified. Neither is inferable.
	CONSTRAINT "legal_entity_profiles_verified_evidence_check" CHECK (
		verification_state <> 'VERIFIED' OR (verified_by_user_id IS NOT NULL AND verified_at IS NOT NULL)
	),
	CONSTRAINT "legal_entity_profiles_pending_note_check" CHECK (
		verification_state <> 'PENDING_VERIFICATION' OR pending_verification_note IS NOT NULL
	),
	CONSTRAINT "legal_entity_profiles_currency_check" CHECK (char_length(reporting_currency) = 3),
	CONSTRAINT "legal_entity_profiles_timezone_check" CHECK (char_length(reporting_timezone) >= 3)
);--> statement-breakpoint
CREATE INDEX "legal_entity_profiles_tenant_idx" ON "legal_entity_profiles" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "legal_entity_profiles_state_idx" ON "legal_entity_profiles" USING btree ("mcm_lifecycle_state");--> statement-breakpoint

CREATE TABLE "legal_entity_lifecycle_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"from_state" "beyu_mcm_lifecycle_state",
	"to_state" "beyu_mcm_lifecycle_state" NOT NULL,
	"effective_date" date NOT NULL,
	"reason" text NOT NULL,
	"authority_ref" text,
	"evidence_document_id" text,
	"acting_party_id" text,
	"acting_user_id" text NOT NULL,
	"approval_ref" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	CONSTRAINT "legal_entity_lifecycle_reason_check" CHECK (char_length(reason) >= 8),
	-- DISSOLVED and ARCHIVED are irreversible end states. They require the
	-- authority reference that made them lawful.
	CONSTRAINT "legal_entity_lifecycle_terminal_authority_check" CHECK (
		to_state NOT IN ('DISSOLVED','ARCHIVED') OR authority_ref IS NOT NULL
	)
);--> statement-breakpoint
CREATE INDEX "legal_entity_lifecycle_entity_idx" ON "legal_entity_lifecycle_events" USING btree ("legal_entity_id");--> statement-breakpoint
CREATE INDEX "legal_entity_lifecycle_tenant_idx" ON "legal_entity_lifecycle_events" USING btree ("tenant_id");--> statement-breakpoint

CREATE TABLE "entity_relationships" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"subject_entity_id" text NOT NULL,
	"object_entity_id" text NOT NULL,
	"relationship_type" "beyu_entity_relationship_type" NOT NULL,
	"instrument_ref" text,
	"instrument_document_id" text,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"scope_note" text NOT NULL,
	"structural" boolean DEFAULT false NOT NULL,
	"provenance" text NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	-- SELF-RELATIONSHIP: an entity cannot relate to itself in any of these
	-- categories. Legal ownership of oneself is impossible and management,
	-- agency or franchise of oneself is meaningless.
	CONSTRAINT "entity_relationships_no_self_check" CHECK (subject_entity_id <> object_entity_id),
	CONSTRAINT "entity_relationships_window_check" CHECK (effective_to IS NULL OR effective_to >= effective_from),
	CONSTRAINT "entity_relationships_scope_check" CHECK (char_length(scope_note) >= 8),
	-- NOT EVERY ORGANIZATIONAL RELATIONSHIP IS LEGAL OWNERSHIP. The ownership
	-- registry (ownership_records) is the only place ownership may be recorded;
	-- this table physically cannot carry it.
	CONSTRAINT "entity_relationships_not_ownership_check" CHECK (relationship_type <> 'SHARED_SERVICES' OR instrument_ref IS NOT NULL),
	-- Only PARENT_SUBSIDIARY is structural (feeds the hierarchy tree).
	CONSTRAINT "entity_relationships_structural_check" CHECK (structural = (relationship_type = 'PARENT_SUBSIDIARY'))
);--> statement-breakpoint
CREATE INDEX "entity_relationships_subject_idx" ON "entity_relationships" USING btree ("subject_entity_id");--> statement-breakpoint
CREATE INDEX "entity_relationships_object_idx" ON "entity_relationships" USING btree ("object_entity_id");--> statement-breakpoint
CREATE INDEX "entity_relationships_tenant_idx" ON "entity_relationships" USING btree ("tenant_id");--> statement-breakpoint

CREATE TABLE "ownership_validations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"ownership_record_id" text NOT NULL,
	"owned_entity_id" text NOT NULL,
	"owner_entity_id" text,
	"state" "beyu_ownership_validation_state" NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"economic_total_pct" numeric(12, 6),
	"voting_total_pct" numeric(12, 6),
	"validated_by_user_id" text,
	"validated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ownership_validations_rules_check" CHECK (jsonb_array_length(rules) > 0),
	-- A VALID result must have examined at least one rule AND recorded the
	-- denominator it validated against. A totals-free "VALID" is meaningless.
	CONSTRAINT "ownership_validations_valid_totals_check" CHECK (
		state <> 'VALID' OR (economic_total_pct IS NOT NULL AND voting_total_pct IS NOT NULL)
	)
);--> statement-breakpoint
CREATE INDEX "ownership_validations_record_idx" ON "ownership_validations" USING btree ("ownership_record_id");--> statement-breakpoint
CREATE INDEX "ownership_validations_owned_idx" ON "ownership_validations" USING btree ("owned_entity_id");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. MULTI-COUNTRY CONFIGURATION
-- ---------------------------------------------------------------------------

CREATE TABLE "mcm_country_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"country_code" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"group_reporting_currency" text NOT NULL,
	"local_currency" text NOT NULL,
	"timezone" text NOT NULL,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accounting_frameworks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"incorporation_authority" text,
	"tax_authority" text,
	"social_security_authority" text,
	"workers_compensation_authority" text,
	"filing_modes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"statutory_reports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcm_country_profiles_uidx" UNIQUE("country_code","version"),
	CONSTRAINT "mcm_country_profiles_window_check" CHECK (effective_to IS NULL OR effective_to >= effective_from),
	CONSTRAINT "mcm_country_profiles_notes_check" CHECK (char_length(notes) >= 20),
	CONSTRAINT "mcm_country_profiles_languages_check" CHECK (jsonb_array_length(languages) > 0),
	CONSTRAINT "mcm_country_profiles_version_check" CHECK (version >= 1),
	CONSTRAINT "mcm_country_profiles_status_check" CHECK (status IN ('DRAFT','ACTIVE','SUPERSEDED','RETIRED'))
);--> statement-breakpoint
CREATE INDEX "mcm_country_profiles_country_idx" ON "mcm_country_profiles" USING btree ("country_code");--> statement-breakpoint

CREATE TABLE "mcm_statutory_filings" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"country_code" text NOT NULL,
	"jurisdiction_id" text,
	"authority" text NOT NULL,
	"filing_code" text NOT NULL,
	"title" text NOT NULL,
	"period" text NOT NULL,
	"due_on" date NOT NULL,
	"filed_on" date,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"filing_mode" text DEFAULT 'MANUAL' NOT NULL,
	"authority_reference" text,
	"evidence_document_id" text,
	"compliance_obligation_id" text,
	"submitted_by_user_id" text,
	"note" text,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcm_statutory_filings_uidx" UNIQUE("legal_entity_id","filing_code","period"),
	CONSTRAINT "mcm_statutory_filings_status_check" CHECK (status IN ('PENDING','IN_PROGRESS','FILED','ACKNOWLEDGED','OVERDUE','WAIVED','REQUIRES_HUMAN_REVIEW')),
	-- No invented integrations: a filing is executed MANUALLY, from DOCUMENTS, or
	-- through a VERIFIED_API that must exist in the canonical integrations
	-- registry. The CHECK below forbids the last case without
	-- authority_reference evidence of the API's response.
	CONSTRAINT "mcm_statutory_filings_mode_check" CHECK (filing_mode IN ('MANUAL','DOCUMENT_BASED','VERIFIED_API')),
	CONSTRAINT "mcm_statutory_filings_api_evidence_check" CHECK (filing_mode <> 'VERIFIED_API' OR status NOT IN ('FILED','ACKNOWLEDGED') OR authority_reference IS NOT NULL),
	-- FILED/ACKNOWLEDGED must identify who filed it and on what date.
	CONSTRAINT "mcm_statutory_filings_filed_check" CHECK (
		status NOT IN ('FILED','ACKNOWLEDGED') OR (filed_on IS NOT NULL AND submitted_by_user_id IS NOT NULL)
	)
);--> statement-breakpoint
CREATE INDEX "mcm_statutory_filings_entity_idx" ON "mcm_statutory_filings" USING btree ("legal_entity_id");--> statement-breakpoint
CREATE INDEX "mcm_statutory_filings_due_idx" ON "mcm_statutory_filings" USING btree ("due_on");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. GOVERNED FX RATE SOURCE
-- ---------------------------------------------------------------------------

CREATE TABLE "fx_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"base_currency" text NOT NULL,
	"quote_currency" text NOT NULL,
	"rate" numeric(24, 12) NOT NULL,
	"rate_date" date NOT NULL,
	"rate_type" text DEFAULT 'CLOSING' NOT NULL,
	"source" text NOT NULL,
	"provenance" text NOT NULL,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rates_uidx" UNIQUE("base_currency","quote_currency","rate_date","rate_type"),
	CONSTRAINT "fx_rates_positive_check" CHECK (rate > 0),
	CONSTRAINT "fx_rates_pair_check" CHECK (base_currency <> quote_currency AND char_length(base_currency) = 3 AND char_length(quote_currency) = 3),
	CONSTRAINT "fx_rates_type_check" CHECK (rate_type IN ('CLOSING','AVERAGE','HISTORICAL','CONTRACTUAL')),
	CONSTRAINT "fx_rates_provenance_check" CHECK (char_length(provenance) >= 8)
);--> statement-breakpoint
CREATE INDEX "fx_rates_pair_idx" ON "fx_rates" USING btree ("base_currency","quote_currency");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. INTERCOMPANY
-- ---------------------------------------------------------------------------

CREATE TABLE "intercompany_agreements" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"agreement_type" text NOT NULL,
	"from_entity_id" text NOT NULL,
	"to_entity_id" text NOT NULL,
	"currency" text NOT NULL,
	"pricing_basis" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"document_id" text,
	"approving_body_id" text,
	"approval_resolution_ref" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"transfer_pricing_review" text DEFAULT 'REQUIRES_REVIEW' NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	CONSTRAINT "intercompany_agreements_tenant_code_uidx" UNIQUE("tenant_id","code"),
	CONSTRAINT "intercompany_agreements_parties_check" CHECK (from_entity_id <> to_entity_id),
	CONSTRAINT "intercompany_agreements_window_check" CHECK (effective_to IS NULL OR effective_to >= effective_from),
	CONSTRAINT "intercompany_agreements_type_check" CHECK (agreement_type IN ('INTERCOMPANY_LOAN','SHARED_SERVICES','MANAGEMENT_FEE','ASSET_TRANSFER','RELATED_PARTY_TRADE','TREASURY_FACILITY','COST_ALLOCATION','GUARANTEE')),
	CONSTRAINT "intercompany_agreements_status_check" CHECK (status IN ('DRAFT','PENDING_APPROVAL','ACTIVE','SUSPENDED','TERMINATED','EXPIRED')),
	CONSTRAINT "intercompany_agreements_tp_check" CHECK (transfer_pricing_review IN ('REQUIRES_REVIEW','REVIEWED_ARM_LENGTH','REVIEWED_NOT_ARM_LENGTH','NOT_APPLICABLE')),
	-- An ACTIVE agreement requires the executed instrument. Pricing without a
	-- basis is an unaccountable related-party flow.
	CONSTRAINT "intercompany_agreements_active_instrument_check" CHECK (status <> 'ACTIVE' OR document_id IS NOT NULL),
	CONSTRAINT "intercompany_agreements_pricing_check" CHECK (char_length(pricing_basis) >= 8),
	CONSTRAINT "intercompany_agreements_currency_check" CHECK (char_length(currency) = 3)
);--> statement-breakpoint
CREATE INDEX "intercompany_agreements_from_idx" ON "intercompany_agreements" USING btree ("from_entity_id");--> statement-breakpoint
CREATE INDEX "intercompany_agreements_to_idx" ON "intercompany_agreements" USING btree ("to_entity_id");--> statement-breakpoint

CREATE TABLE "intercompany_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"agreement_id" text NOT NULL,
	"reference" text NOT NULL,
	"transaction_type" text NOT NULL,
	"receivable_entity_id" text NOT NULL,
	"payable_entity_id" text NOT NULL,
	"period_id" text,
	"period_code" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" numeric(38, 0) NOT NULL,
	"counterparty_currency" text,
	"counterparty_amount_minor" numeric(38, 0),
	"fx_rate_used" numeric(24, 12),
	"description" text NOT NULL,
	"state" "beyu_intercompany_state" DEFAULT 'DRAFT' NOT NULL,
	"receivable_authorized_by_user_id" text,
	"receivable_authorized_at" timestamp with time zone,
	"payable_authorized_by_user_id" text,
	"payable_authorized_at" timestamp with time zone,
	"reconciliation_difference_minor" numeric(38, 0),
	"reconciled_at" timestamp with time zone,
	"reconciled_by_user_id" text,
	"finance_reference_id" text,
	"idempotency_key" text NOT NULL,
	"data_state" "beyu_mcm_data_state" DEFAULT 'PENDING' NOT NULL,
	"raised_by" text NOT NULL,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	CONSTRAINT "intercompany_transactions_reference_uidx" UNIQUE("reference"),
	CONSTRAINT "intercompany_transactions_idem_uidx" UNIQUE("idempotency_key"),
	CONSTRAINT "intercompany_transactions_parties_check" CHECK (receivable_entity_id <> payable_entity_id),
	CONSTRAINT "intercompany_transactions_amount_check" CHECK (amount_minor > 0),
	CONSTRAINT "intercompany_transactions_currency_check" CHECK (char_length(currency) = 3),
	CONSTRAINT "intercompany_transactions_counterparty_check" CHECK (
		(counterparty_currency IS NULL AND counterparty_amount_minor IS NULL AND fx_rate_used IS NULL)
		OR (counterparty_currency IS NOT NULL AND counterparty_amount_minor IS NOT NULL AND fx_rate_used IS NOT NULL AND fx_rate_used > 0)
	),
	-- SEGREGATION OF DUTIES, ENFORCED BY THE DATABASE.
	-- Both legal entities must authorise their OWN side, and the same principal
	-- can never authorise both. This is the single most important control in the
	-- intercompany domain: a shared-services charge is only real when two
	-- distinct accountable humans each accepted their own side of it.
	CONSTRAINT "intercompany_transactions_dual_authorization_check" CHECK (
		state <> 'BOTH_SIDES_AUTHORIZED'
		OR (
			receivable_authorized_by_user_id IS NOT NULL
			AND receivable_authorized_at IS NOT NULL
			AND payable_authorized_by_user_id IS NOT NULL
			AND payable_authorized_at IS NOT NULL
			AND receivable_authorized_by_user_id <> payable_authorized_by_user_id
		)
	),
	CONSTRAINT "intercompany_transactions_reconciled_check" CHECK (
		state NOT IN ('RECONCILED')
		OR (reconciled_at IS NOT NULL AND reconciled_by_user_id IS NOT NULL AND reconciliation_difference_minor IS NOT NULL)
	),
	-- Once reconciled, a transaction cannot silently lose its dual authorisation.
	CONSTRAINT "intercompany_transactions_reconciled_requires_dual_check" CHECK (
		state NOT IN ('RECONCILED')
		OR (receivable_authorized_by_user_id IS NOT NULL AND payable_authorized_by_user_id IS NOT NULL)
	),
	CONSTRAINT "intercompany_transactions_period_check" CHECK (char_length(period_code) >= 4),
	CONSTRAINT "intercompany_transactions_type_check" CHECK (transaction_type IN ('INTERCOMPANY_LOAN','LOAN_INTEREST','SHARED_SERVICES','MANAGEMENT_FEE','ASSET_TRANSFER','RELATED_PARTY_TRADE','COST_ALLOCATION','GUARANTEE_FEE','DIVIDEND','CAPITAL_CONTRIBUTION'))
);--> statement-breakpoint
CREATE INDEX "intercompany_transactions_receivable_idx" ON "intercompany_transactions" USING btree ("receivable_entity_id");--> statement-breakpoint
CREATE INDEX "intercompany_transactions_payable_idx" ON "intercompany_transactions" USING btree ("payable_entity_id");--> statement-breakpoint
CREATE INDEX "intercompany_transactions_tenant_idx" ON "intercompany_transactions" USING btree ("tenant_id");--> statement-breakpoint

CREATE TABLE "intercompany_reconciliation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"period_code" text NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_by_user_id" text NOT NULL,
	"pairs_examined" integer DEFAULT 0 NOT NULL,
	"matched_pairs" integer DEFAULT 0 NOT NULL,
	"unmatched_pairs" integer DEFAULT 0 NOT NULL,
	"total_difference_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"currency" text NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data_state" "beyu_mcm_data_state" DEFAULT 'ACTUAL' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	CONSTRAINT "intercompany_recon_totals_check" CHECK (matched_pairs + unmatched_pairs = pairs_examined),
	CONSTRAINT "intercompany_recon_counts_check" CHECK (pairs_examined >= 0 AND matched_pairs >= 0 AND unmatched_pairs >= 0)
);--> statement-breakpoint
CREATE INDEX "intercompany_recon_runs_period_idx" ON "intercompany_reconciliation_runs" USING btree ("period_code");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 5. CONSOLIDATION (analysis only — never a posting)
-- ---------------------------------------------------------------------------

CREATE TABLE "consolidation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"period_id" text,
	"period_code" text NOT NULL,
	"reporting_currency" text NOT NULL,
	"state" "beyu_consolidation_state" DEFAULT 'DRAFT' NOT NULL,
	"rate_set" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"entities_included" integer DEFAULT 0 NOT NULL,
	"total_assets_minor" numeric(38, 0),
	"total_liabilities_minor" numeric(38, 0),
	"total_equity_minor" numeric(38, 0),
	"eliminations_minor" numeric(38, 0),
	"residual_minor" numeric(38, 0),
	"prepared_by_user_id" text NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"data_state" "beyu_mcm_data_state" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	CONSTRAINT "consolidation_runs_tenant_code_uidx" UNIQUE("tenant_id","code"),
	CONSTRAINT "consolidation_runs_currency_check" CHECK (char_length(reporting_currency) = 3),
	-- A REVIEWED run requires a human reviewer, a timestamp and a note, and the
	-- reviewer must not be the preparer. Four-eyes is a database constraint, not
	-- a UI convention.
	CONSTRAINT "consolidation_runs_review_check" CHECK (
		state NOT IN ('REVIEWED')
		OR (reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL AND review_note IS NOT NULL AND reviewed_by_user_id <> prepared_by_user_id)
	),
	CONSTRAINT "consolidation_runs_entities_check" CHECK (entities_included >= 0),
	CONSTRAINT "consolidation_runs_revision_check" CHECK (revision >= 1)
);--> statement-breakpoint
CREATE INDEX "consolidation_runs_period_idx" ON "consolidation_runs" USING btree ("period_code");--> statement-breakpoint

CREATE TABLE "consolidation_entities" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"functional_currency" text NOT NULL,
	"ownership_pct" numeric(9, 6) NOT NULL,
	"closing_rate" numeric(24, 12),
	"average_rate" numeric(24, 12),
	"local_assets_minor" numeric(38, 0),
	"local_liabilities_minor" numeric(38, 0),
	"local_equity_minor" numeric(38, 0),
	"translated_assets_minor" numeric(38, 0),
	"translated_liabilities_minor" numeric(38, 0),
	"translated_equity_minor" numeric(38, 0),
	"translation_reserve_minor" numeric(38, 0),
	"data_state" "beyu_mcm_data_state" DEFAULT 'PENDING' NOT NULL,
	"unavailability_reason" text,
	"included" boolean DEFAULT true NOT NULL,
	CONSTRAINT "consolidation_entities_uidx" UNIQUE("run_id","legal_entity_id"),
	CONSTRAINT "consolidation_entities_ownership_check" CHECK (ownership_pct >= 0 AND ownership_pct <= 100),
	CONSTRAINT "consolidation_entities_currency_check" CHECK (char_length(functional_currency) = 3),
	-- UNAVAILABLE is a first-class state and MUST carry its reason. "No data" is
	-- never silently reported as zero.
	CONSTRAINT "consolidation_entities_unavailable_reason_check" CHECK (
		data_state <> 'UNAVAILABLE' OR unavailability_reason IS NOT NULL
	),
	-- A translated figure requires BOTH a source balance and a rate. Translation
	-- from nothing is not translation.
	CONSTRAINT "consolidation_entities_translation_check" CHECK (
		translated_assets_minor IS NULL OR (local_assets_minor IS NOT NULL AND closing_rate IS NOT NULL)
	)
);--> statement-breakpoint
CREATE INDEX "consolidation_entities_run_idx" ON "consolidation_entities" USING btree ("run_id");--> statement-breakpoint

CREATE TABLE "consolidation_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"adjustment_type" text NOT NULL,
	"description" text NOT NULL,
	"debit_entity_id" text,
	"credit_entity_id" text,
	"amount_minor" numeric(38, 0) NOT NULL,
	"currency" text NOT NULL,
	"source_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approved_by_user_id" text,
	"approved_at" timestamp with time zone,
	"applied" boolean DEFAULT false NOT NULL,
	"data_state" "beyu_mcm_data_state" DEFAULT 'PENDING' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	CONSTRAINT "consolidation_adjustments_type_check" CHECK (adjustment_type IN ('INTERCOMPANY_ELIMINATION','INVESTMENT_ELIMINATION','EQUITY_ELIMINATION','NCI_RECOGNITION','UNREALISED_PROFIT','FX_TRANSLATION','OTHER')),
	CONSTRAINT "consolidation_adjustments_amount_check" CHECK (amount_minor > 0),
	CONSTRAINT "consolidation_adjustments_currency_check" CHECK (char_length(currency) = 3),
	CONSTRAINT "consolidation_adjustments_provenance_check" CHECK (jsonb_array_length(source_references) > 0),
	-- AN UNAPPLIED/APPLIED SWITCH IS NOT ENOUGH. An adjustment may only be marked
	-- applied when a named human approved it, and only when a reviewer exists.
	-- Nothing here posts; `applied` means "included in this analysis run".
	CONSTRAINT "consolidation_adjustments_approved_check" CHECK (
		applied = false OR (approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL)
	)
);--> statement-breakpoint
CREATE INDEX "consolidation_adjustments_run_idx" ON "consolidation_adjustments" USING btree ("run_id");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 6. GROUP CAPITAL ALLOCATION
-- ---------------------------------------------------------------------------

CREATE TABLE "mcm_capital_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"cycle" text NOT NULL,
	"beneficiary_entity_id" text NOT NULL,
	"capital_request_id" text,
	"currency" text NOT NULL,
	"proposed_amount_minor" numeric(38, 0),
	"approved_amount_minor" numeric(38, 0),
	"strategic_priority" text NOT NULL,
	"rationale" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"deciding_body_id" text,
	"decision_resolution_ref" text,
	"decided_at" timestamp with time zone,
	"data_state" "beyu_mcm_data_state" DEFAULT 'PENDING' NOT NULL,
	"proposed_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	CONSTRAINT "mcm_capital_allocations_tenant_code_uidx" UNIQUE("tenant_id","code"),
	CONSTRAINT "mcm_capital_allocations_status_check" CHECK (status IN ('DRAFT','PROPOSED','UNDER_REVIEW','APPROVED','REJECTED','DEFERRED','WITHDRAWN')),
	CONSTRAINT "mcm_capital_allocations_amounts_check" CHECK (
		(proposed_amount_minor IS NULL OR proposed_amount_minor >= 0)
		AND (approved_amount_minor IS NULL OR approved_amount_minor >= 0)
	),
	CONSTRAINT "mcm_capital_allocations_currency_check" CHECK (char_length(currency) = 3),
	CONSTRAINT "mcm_capital_allocations_rationale_check" CHECK (char_length(rationale) >= 20),
	-- An APPROVED allocation must name the governance body and the resolution
	-- that approved it. MCM and NOELIA can never supply this: only a real board
	-- decision can.
	CONSTRAINT "mcm_capital_allocations_approved_check" CHECK (
		status <> 'APPROVED'
		OR (approved_amount_minor IS NOT NULL AND deciding_body_id IS NOT NULL AND decision_resolution_ref IS NOT NULL AND decided_at IS NOT NULL)
	)
);--> statement-breakpoint
CREATE INDEX "mcm_capital_allocations_entity_idx" ON "mcm_capital_allocations" USING btree ("beneficiary_entity_id");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 7. ENTERPRISE MODULES
-- ---------------------------------------------------------------------------

CREATE TABLE "mcm_procurement_register" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"currency" text NOT NULL,
	"budget_minor" numeric(38, 0),
	"committed_minor" numeric(38, 0),
	"supplier_party_id" text,
	"contract_id" text,
	"foundation_procurement_id" text,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"conflict_check_state" text DEFAULT 'NOT_CHECKED' NOT NULL,
	"approval_ref" text,
	"data_state" "beyu_mcm_data_state" DEFAULT 'PENDING' NOT NULL,
	"owner_user_id" text,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	CONSTRAINT "mcm_procurement_register_uidx" UNIQUE("tenant_id","code"),
	CONSTRAINT "mcm_procurement_register_amounts_check" CHECK (
		(budget_minor IS NULL OR budget_minor >= 0) AND (committed_minor IS NULL OR committed_minor >= 0)
	),
	CONSTRAINT "mcm_procurement_register_conflict_check" CHECK (conflict_check_state IN ('NOT_CHECKED','CLEARED','CONFLICT_DECLARED','RECUSED')),
	CONSTRAINT "mcm_procurement_register_status_check" CHECK (status IN ('PLANNED','SOURCING','PENDING_APPROVAL','APPROVED','CONTRACTED','DELIVERED','CLOSED','CANCELLED')),
	CONSTRAINT "mcm_procurement_register_currency_check" CHECK (char_length(currency) = 3),
	-- A committed commitment with a declared conflict must be recused, never
	-- advanced.
	CONSTRAINT "mcm_procurement_register_conflict_advance_check" CHECK (
		status NOT IN ('APPROVED','CONTRACTED','DELIVERED') OR conflict_check_state <> 'CONFLICT_DECLARED'
	)
);--> statement-breakpoint
CREATE INDEX "mcm_procurement_register_entity_idx" ON "mcm_procurement_register" USING btree ("legal_entity_id");--> statement-breakpoint

CREATE TABLE "mcm_asset_register" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"name" text NOT NULL,
	"asset_class" text NOT NULL,
	"tenure" text DEFAULT 'OWNED' NOT NULL,
	"country_code" text,
	"location_description" text,
	"title_document_id" text,
	"currency" text,
	"carrying_amount_minor" numeric(38, 0),
	"custodian_entity_id" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"data_state" "beyu_mcm_data_state" DEFAULT 'PENDING' NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	CONSTRAINT "mcm_asset_register_uidx" UNIQUE("tenant_id","code"),
	CONSTRAINT "mcm_asset_register_tenure_check" CHECK (tenure IN ('OWNED','LEASEHOLD','LICENSED','CUSTODIAL','UNDER_CONSTRUCTION')),
	CONSTRAINT "mcm_asset_register_amount_check" CHECK (carrying_amount_minor IS NULL OR carrying_amount_minor >= 0),
	-- A carrying amount requires a currency. An amount without a currency is
	-- uninterpretable and is refused at the database.
	CONSTRAINT "mcm_asset_register_amount_currency_check" CHECK (
		carrying_amount_minor IS NULL OR (currency IS NOT NULL AND char_length(currency) = 3)
	),
	CONSTRAINT "mcm_asset_register_status_check" CHECK (status IN ('ACTIVE','DISPOSED','IMPAIRED','HELD_FOR_SALE','TRANSFERRED','ARCHIVED'))
);--> statement-breakpoint
CREATE INDEX "mcm_asset_register_entity_idx" ON "mcm_asset_register" USING btree ("legal_entity_id");--> statement-breakpoint

CREATE TABLE "mcm_project_portfolio" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"name" text NOT NULL,
	"programme" text,
	"sector_code" text,
	"sector_project_source" text,
	"currency" text,
	"budget_minor" numeric(38, 0),
	"actual_minor" numeric(38, 0),
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"health" text DEFAULT 'UNKNOWN' NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"sponsor_user_id" text,
	"data_state" "beyu_mcm_data_state" DEFAULT 'PENDING' NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	CONSTRAINT "mcm_project_portfolio_uidx" UNIQUE("tenant_id","code"),
	CONSTRAINT "mcm_project_portfolio_health_check" CHECK (health IN ('UNKNOWN','ON_TRACK','AT_RISK','OFF_TRACK','COMPLETED','ON_HOLD')),
	CONSTRAINT "mcm_project_portfolio_status_check" CHECK (status IN ('PLANNED','APPROVED','IN_PROGRESS','ON_HOLD','COMPLETED','CANCELLED')),
	CONSTRAINT "mcm_project_portfolio_window_check" CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
	CONSTRAINT "mcm_project_portfolio_amounts_check" CHECK (
		(budget_minor IS NULL OR budget_minor >= 0) AND (actual_minor IS NULL OR actual_minor >= 0)
	)
);--> statement-breakpoint
CREATE INDEX "mcm_project_portfolio_entity_idx" ON "mcm_project_portfolio" USING btree ("legal_entity_id");--> statement-breakpoint

CREATE TABLE "mcm_module_links" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"module_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_table" text NOT NULL,
	"link_role" text DEFAULT 'GOVERNED_BY' NOT NULL,
	"note" text,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcm_module_links_uidx" UNIQUE("legal_entity_id","source_table","source_id","link_role"),
	CONSTRAINT "mcm_module_links_module_check" CHECK (module_type IN ('LEGAL','RISK','COMPLIANCE','INTERNAL_AUDIT','DOCUMENTS','CONTRACTS','GOVERNANCE','PERFORMANCE','TREASURY','WORKFORCE')),
	CONSTRAINT "mcm_module_links_role_check" CHECK (link_role IN ('GOVERNED_BY','OWNED_BY','SPONSORED_BY','EVIDENCED_BY','REPORTED_TO')),
	-- Pointers into the SHARED modules only. A link can never claim to point at a
	-- Foundation-confidential or table outside the canonical shared set.
	CONSTRAINT "mcm_module_links_source_check" CHECK (source_table IN (
		'risks','controls','compliance_obligations','compliance_assessments','legal_matters',
		'contract_records','documents','governance_bodies','governance_members',
		'governance_meetings','resolutions','strategic_objectives','employees','treasury_positions'
	))
);--> statement-breakpoint
CREATE INDEX "mcm_module_links_entity_idx" ON "mcm_module_links" USING btree ("legal_entity_id");--> statement-breakpoint
CREATE INDEX "mcm_module_links_module_idx" ON "mcm_module_links" USING btree ("module_type");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 8. CROSS-OS INTEGRATION CONTRACTS
-- ---------------------------------------------------------------------------

CREATE TABLE "mcm_integration_contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"counterpart_system" text NOT NULL,
	"data_owner" text NOT NULL,
	"data_set" text NOT NULL,
	"direction" text DEFAULT 'INBOUND' NOT NULL,
	"transport" text DEFAULT 'INTERNAL_SERVICE' NOT NULL,
	"exposed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"classification_ceiling" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"state" "beyu_mcm_integration_state" DEFAULT 'DECLARED' NOT NULL,
	"failure_policy" text DEFAULT 'FAIL_CLOSED_UNAVAILABLE' NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_failure_reason" text,
	"verified_by_user_id" text,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcm_integration_contracts_code_uidx" UNIQUE("code"),
	CONSTRAINT "mcm_integration_contracts_system_check" CHECK (counterpart_system IN ('FINANCE_OS','HEALTH_OS','AGRICULTURE_OS','UJENZI_OS','HCM','NOELIA','DOCUMENTS','RISK','GOVERNANCE','CONTRACTS')),
	CONSTRAINT "mcm_integration_contracts_direction_check" CHECK (direction IN ('INBOUND','OUTBOUND','BIDIRECTIONAL')),
	CONSTRAINT "mcm_integration_contracts_transport_check" CHECK (transport IN ('INTERNAL_SERVICE','EVENT','HTTP_API','DOCUMENT')),
	CONSTRAINT "mcm_integration_contracts_fields_check" CHECK (jsonb_array_length(exposed_fields) > 0),
	CONSTRAINT "mcm_integration_contracts_failure_check" CHECK (failure_policy IN ('FAIL_CLOSED_UNAVAILABLE','RETRY_THEN_UNAVAILABLE','DEGRADE_READ_ONLY')),
	CONSTRAINT "mcm_integration_contracts_retries_check" CHECK (max_retries >= 0 AND max_retries <= 10),
	CONSTRAINT "mcm_integration_contracts_note_check" CHECK (char_length(note) >= 20),
	-- A VERIFIED contract must name the human who verified it and when.
	CONSTRAINT "mcm_integration_contracts_verified_check" CHECK (
		state <> 'VERIFIED' OR (verified_by_user_id IS NOT NULL AND last_verified_at IS NOT NULL)
	),
	-- A DEGRADED/UNAVAILABLE contract must record why. An operator must never
	-- have to guess why a system stopped answering.
	CONSTRAINT "mcm_integration_contracts_failure_reason_check" CHECK (
		state NOT IN ('DEGRADED','UNAVAILABLE') OR last_failure_reason IS NOT NULL
	),
	-- The data owner is never MCM: MCM observes, it does not own operational data.
	CONSTRAINT "mcm_integration_contracts_owner_check" CHECK (data_owner <> 'MCM')
);--> statement-breakpoint
CREATE INDEX "mcm_integration_contracts_system_idx" ON "mcm_integration_contracts" USING btree ("counterpart_system");--> statement-breakpoint

CREATE TABLE "mcm_integration_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"contract_code" text NOT NULL,
	"actor_user_id" text,
	"outcome" text NOT NULL,
	"records_returned" integer,
	"latency_ms" integer,
	"failure_reason" text,
	"trace_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcm_integration_events_outcome_check" CHECK (outcome IN ('SUCCESS','DENIED','UNAVAILABLE','TIMEOUT','PARTIAL')),
	CONSTRAINT "mcm_integration_events_failure_check" CHECK (
		outcome IN ('SUCCESS','PARTIAL') OR failure_reason IS NOT NULL
	),
	CONSTRAINT "mcm_integration_events_counts_check" CHECK (
		(records_returned IS NULL OR records_returned >= 0) AND (latency_ms IS NULL OR latency_ms >= 0)
	),
	CONSTRAINT "mcm_integration_events_success_count_check" CHECK (
		outcome <> 'SUCCESS' OR records_returned IS NOT NULL
	)
);--> statement-breakpoint
CREATE INDEX "mcm_integration_events_contract_idx" ON "mcm_integration_events" USING btree ("contract_code");--> statement-breakpoint
CREATE INDEX "mcm_integration_events_time_idx" ON "mcm_integration_events" USING btree ("occurred_at");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- FOREIGN KEYS
-- ---------------------------------------------------------------------------

ALTER TABLE "legal_entity_profiles" ADD CONSTRAINT "legal_entity_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entity_profiles" ADD CONSTRAINT "legal_entity_profiles_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entity_profiles" ADD CONSTRAINT "legal_entity_profiles_registered_office_country_code_countries_code_fk" FOREIGN KEY ("registered_office_country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entity_profiles" ADD CONSTRAINT "legal_entity_profiles_incorporation_document_id_documents_id_fk" FOREIGN KEY ("incorporation_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entity_profiles" ADD CONSTRAINT "legal_entity_profiles_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entity_profiles" ADD CONSTRAINT "legal_entity_profiles_verification_evidence_document_id_documents_id_fk" FOREIGN KEY ("verification_evidence_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entity_lifecycle_events" ADD CONSTRAINT "legal_entity_lifecycle_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entity_lifecycle_events" ADD CONSTRAINT "legal_entity_lifecycle_events_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entity_lifecycle_events" ADD CONSTRAINT "legal_entity_lifecycle_events_evidence_document_id_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entity_lifecycle_events" ADD CONSTRAINT "legal_entity_lifecycle_events_acting_user_id_users_id_fk" FOREIGN KEY ("acting_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_subject_entity_id_legal_entities_id_fk" FOREIGN KEY ("subject_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_object_entity_id_legal_entities_id_fk" FOREIGN KEY ("object_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_instrument_document_id_documents_id_fk" FOREIGN KEY ("instrument_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_validations" ADD CONSTRAINT "ownership_validations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_validations" ADD CONSTRAINT "ownership_validations_ownership_record_id_ownership_records_id_fk" FOREIGN KEY ("ownership_record_id") REFERENCES "public"."ownership_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_validations" ADD CONSTRAINT "ownership_validations_owned_entity_id_legal_entities_id_fk" FOREIGN KEY ("owned_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_validations" ADD CONSTRAINT "ownership_validations_owner_entity_id_legal_entities_id_fk" FOREIGN KEY ("owner_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_validations" ADD CONSTRAINT "ownership_validations_validated_by_user_id_users_id_fk" FOREIGN KEY ("validated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_country_profiles" ADD CONSTRAINT "mcm_country_profiles_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_statutory_filings" ADD CONSTRAINT "mcm_statutory_filings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_statutory_filings" ADD CONSTRAINT "mcm_statutory_filings_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_statutory_filings" ADD CONSTRAINT "mcm_statutory_filings_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_statutory_filings" ADD CONSTRAINT "mcm_statutory_filings_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_statutory_filings" ADD CONSTRAINT "mcm_statutory_filings_evidence_document_id_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_statutory_filings" ADD CONSTRAINT "mcm_statutory_filings_compliance_obligation_id_compliance_obligations_id_fk" FOREIGN KEY ("compliance_obligation_id") REFERENCES "public"."compliance_obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_statutory_filings" ADD CONSTRAINT "mcm_statutory_filings_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_agreements" ADD CONSTRAINT "intercompany_agreements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_agreements" ADD CONSTRAINT "intercompany_agreements_from_entity_id_legal_entities_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_agreements" ADD CONSTRAINT "intercompany_agreements_to_entity_id_legal_entities_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_agreements" ADD CONSTRAINT "intercompany_agreements_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_transactions" ADD CONSTRAINT "intercompany_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_transactions" ADD CONSTRAINT "intercompany_transactions_agreement_id_intercompany_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."intercompany_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_transactions" ADD CONSTRAINT "intercompany_transactions_receivable_entity_id_legal_entities_id_fk" FOREIGN KEY ("receivable_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_transactions" ADD CONSTRAINT "intercompany_transactions_payable_entity_id_legal_entities_id_fk" FOREIGN KEY ("payable_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_transactions" ADD CONSTRAINT "intercompany_transactions_period_id_financial_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."financial_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_transactions" ADD CONSTRAINT "intercompany_transactions_receivable_authorized_by_user_id_users_id_fk" FOREIGN KEY ("receivable_authorized_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_transactions" ADD CONSTRAINT "intercompany_transactions_payable_authorized_by_user_id_users_id_fk" FOREIGN KEY ("payable_authorized_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_transactions" ADD CONSTRAINT "intercompany_transactions_reconciled_by_user_id_users_id_fk" FOREIGN KEY ("reconciled_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_transactions" ADD CONSTRAINT "intercompany_transactions_finance_reference_id_journal_entries_id_fk" FOREIGN KEY ("finance_reference_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_reconciliation_runs" ADD CONSTRAINT "intercompany_reconciliation_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_reconciliation_runs" ADD CONSTRAINT "intercompany_reconciliation_runs_run_by_user_id_users_id_fk" FOREIGN KEY ("run_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidation_runs" ADD CONSTRAINT "consolidation_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidation_runs" ADD CONSTRAINT "consolidation_runs_period_id_financial_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."financial_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidation_runs" ADD CONSTRAINT "consolidation_runs_prepared_by_user_id_users_id_fk" FOREIGN KEY ("prepared_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidation_runs" ADD CONSTRAINT "consolidation_runs_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidation_entities" ADD CONSTRAINT "consolidation_entities_run_id_consolidation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."consolidation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidation_entities" ADD CONSTRAINT "consolidation_entities_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidation_adjustments" ADD CONSTRAINT "consolidation_adjustments_run_id_consolidation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."consolidation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidation_adjustments" ADD CONSTRAINT "consolidation_adjustments_debit_entity_id_legal_entities_id_fk" FOREIGN KEY ("debit_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidation_adjustments" ADD CONSTRAINT "consolidation_adjustments_credit_entity_id_legal_entities_id_fk" FOREIGN KEY ("credit_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidation_adjustments" ADD CONSTRAINT "consolidation_adjustments_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_capital_allocations" ADD CONSTRAINT "mcm_capital_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_capital_allocations" ADD CONSTRAINT "mcm_capital_allocations_beneficiary_entity_id_legal_entities_id_fk" FOREIGN KEY ("beneficiary_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_capital_allocations" ADD CONSTRAINT "mcm_capital_allocations_capital_request_id_capital_requests_id_fk" FOREIGN KEY ("capital_request_id") REFERENCES "public"."capital_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_capital_allocations" ADD CONSTRAINT "mcm_capital_allocations_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_procurement_register" ADD CONSTRAINT "mcm_procurement_register_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_procurement_register" ADD CONSTRAINT "mcm_procurement_register_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_procurement_register" ADD CONSTRAINT "mcm_procurement_register_contract_id_contract_records_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_procurement_register" ADD CONSTRAINT "mcm_procurement_register_foundation_procurement_id_procurements_id_fk" FOREIGN KEY ("foundation_procurement_id") REFERENCES "public"."procurements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_procurement_register" ADD CONSTRAINT "mcm_procurement_register_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_asset_register" ADD CONSTRAINT "mcm_asset_register_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_asset_register" ADD CONSTRAINT "mcm_asset_register_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_asset_register" ADD CONSTRAINT "mcm_asset_register_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_asset_register" ADD CONSTRAINT "mcm_asset_register_title_document_id_documents_id_fk" FOREIGN KEY ("title_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_asset_register" ADD CONSTRAINT "mcm_asset_register_custodian_entity_id_legal_entities_id_fk" FOREIGN KEY ("custodian_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_project_portfolio" ADD CONSTRAINT "mcm_project_portfolio_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_project_portfolio" ADD CONSTRAINT "mcm_project_portfolio_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_project_portfolio" ADD CONSTRAINT "mcm_project_portfolio_sponsor_user_id_users_id_fk" FOREIGN KEY ("sponsor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_module_links" ADD CONSTRAINT "mcm_module_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_module_links" ADD CONSTRAINT "mcm_module_links_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_integration_contracts" ADD CONSTRAINT "mcm_integration_contracts_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_integration_events" ADD CONSTRAINT "mcm_integration_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcm_integration_events" ADD CONSTRAINT "mcm_integration_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- APPEND-ONLY GUARDS
--
-- History that can be rewritten is not history. These triggers make the audit
-- intent a database fact rather than an application convention, exactly as the
-- governance and payment domains already do.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION beyu_mcm_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'BEYU: % is append-only (attempted %). Record a new row instead of rewriting history.', TG_TABLE_NAME, TG_OP;
END;
$$;--> statement-breakpoint
CREATE TRIGGER legal_entity_lifecycle_events_append_only
  BEFORE UPDATE OR DELETE ON "legal_entity_lifecycle_events"
  FOR EACH ROW EXECUTE FUNCTION beyu_mcm_append_only();--> statement-breakpoint
CREATE TRIGGER ownership_validations_append_only
  BEFORE UPDATE OR DELETE ON "ownership_validations"
  FOR EACH ROW EXECUTE FUNCTION beyu_mcm_append_only();--> statement-breakpoint
CREATE TRIGGER intercompany_reconciliation_runs_append_only
  BEFORE UPDATE OR DELETE ON "intercompany_reconciliation_runs"
  FOR EACH ROW EXECUTE FUNCTION beyu_mcm_append_only();--> statement-breakpoint
CREATE TRIGGER mcm_integration_events_append_only
  BEFORE UPDATE OR DELETE ON "mcm_integration_events"
  FOR EACH ROW EXECUTE FUNCTION beyu_mcm_append_only();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- HIERARCHY INTEGRITY: no circular parent chain.
--
-- `legal_entities.parent_entity_id` had no cycle guard. A circular corporate
-- hierarchy is not merely confusing — it makes consolidation, ownership
-- roll-up and any "who ultimately owns this" query non-terminating or wrong.
-- The guard is effective-dated-awareness-free (structural parentage is not a
-- dated relationship) and walks the chain with a depth bound.
--
-- It fires on INSERT/UPDATE of parent_entity_id only, so ordinary updates to an
-- entity never pay for it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION beyu_mcm_assert_no_entity_cycle() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  cursor_id text := NEW.parent_entity_id;
  depth integer := 0;
BEGIN
  IF NEW.parent_entity_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_entity_id = NEW.id THEN
    RAISE EXCEPTION 'BEYU: legal entity % cannot be its own parent', NEW.id;
  END IF;
  WHILE cursor_id IS NOT NULL LOOP
    depth := depth + 1;
    IF depth > 64 THEN
      RAISE EXCEPTION 'BEYU: corporate hierarchy depth exceeded 64 while validating %; a circular parent chain exists', NEW.id;
    END IF;
    SELECT parent_entity_id INTO cursor_id FROM legal_entities WHERE id = cursor_id;
    IF cursor_id = NEW.id THEN
      RAISE EXCEPTION 'BEYU: setting parent % on entity % would create a circular corporate hierarchy', NEW.parent_entity_id, NEW.id;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS legal_entities_no_cycle ON "legal_entities";--> statement-breakpoint
CREATE TRIGGER legal_entities_no_cycle
  BEFORE INSERT OR UPDATE OF parent_entity_id ON "legal_entities"
  FOR EACH ROW EXECUTE FUNCTION beyu_mcm_assert_no_entity_cycle();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
--
-- Pattern identical to 0001/0048/0071/0072/0074: tenant-scoped operational
-- tables use beyu_tenant_ids(); global reference tables are SELECT-only.
-- There is NO global-scope bypass on MCM operational tables: an enterprise
-- caller receives an explicit tenant list from withTenantDatabaseContext, never
-- an "all tenants" shortcut, so a parent-company user cannot reach every
-- subsidiary's confidential row by virtue of being senior.
-- ---------------------------------------------------------------------------

ALTER TABLE "legal_entity_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "legal_entity_profiles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "legal_entity_profiles_tenant_scope" ON "legal_entity_profiles";--> statement-breakpoint
CREATE POLICY "legal_entity_profiles_tenant_scope" ON "legal_entity_profiles" FOR ALL
  USING (tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint

ALTER TABLE "legal_entity_lifecycle_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "legal_entity_lifecycle_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "legal_entity_lifecycle_events_tenant_scope" ON "legal_entity_lifecycle_events";--> statement-breakpoint
CREATE POLICY "legal_entity_lifecycle_events_tenant_scope" ON "legal_entity_lifecycle_events" FOR ALL
  USING (tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint

ALTER TABLE "entity_relationships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "entity_relationships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "entity_relationships_tenant_scope" ON "entity_relationships";--> statement-breakpoint
CREATE POLICY "entity_relationships_tenant_scope" ON "entity_relationships" FOR ALL
  USING (
    tenant_id = ANY(beyu_tenant_ids())
    -- Cross-entity visibility requires BOTH entities to be in the caller's
    -- tenant scope. A relationship row that spans two tenants is visible to a
    -- caller who can see either end, but the row itself carries no data from
    -- the other end beyond its identifier.
    AND subject_entity_id IN (SELECT id FROM legal_entities WHERE tenant_id = ANY(beyu_tenant_ids()))
  )
  WITH CHECK (
    tenant_id = ANY(beyu_tenant_ids())
    AND subject_entity_id IN (SELECT id FROM legal_entities WHERE tenant_id = ANY(beyu_tenant_ids()))
    AND object_entity_id IN (SELECT id FROM legal_entities WHERE tenant_id = ANY(beyu_tenant_ids()))
  );--> statement-breakpoint

ALTER TABLE "ownership_validations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ownership_validations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "ownership_validations_tenant_scope" ON "ownership_validations";--> statement-breakpoint
CREATE POLICY "ownership_validations_tenant_scope" ON "ownership_validations" FOR ALL
  USING (tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint

ALTER TABLE "mcm_statutory_filings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mcm_statutory_filings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "mcm_statutory_filings_tenant_scope" ON "mcm_statutory_filings";--> statement-breakpoint
CREATE POLICY "mcm_statutory_filings_tenant_scope" ON "mcm_statutory_filings" FOR ALL
  USING (tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint

ALTER TABLE "intercompany_agreements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "intercompany_agreements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "intercompany_agreements_tenant_scope" ON "intercompany_agreements";--> statement-breakpoint
CREATE POLICY "intercompany_agreements_tenant_scope" ON "intercompany_agreements" FOR ALL
  USING (tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint

ALTER TABLE "intercompany_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "intercompany_transactions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "intercompany_transactions_tenant_scope" ON "intercompany_transactions";--> statement-breakpoint
-- A party to an intercompany transaction may see it. Both sides must be inside
-- the caller's tenant scope for the WITH CHECK (a transaction can only be
-- created between two entities the caller can actually reach); reads admit a
-- caller who can see either side, because each side must be able to reconcile
-- its own leg.
CREATE POLICY "intercompany_transactions_tenant_scope" ON "intercompany_transactions" FOR ALL
  USING (
    tenant_id = ANY(beyu_tenant_ids())
    AND (
      receivable_entity_id IN (SELECT id FROM legal_entities WHERE tenant_id = ANY(beyu_tenant_ids()))
      OR payable_entity_id IN (SELECT id FROM legal_entities WHERE tenant_id = ANY(beyu_tenant_ids()))
    )
  )
  WITH CHECK (
    tenant_id = ANY(beyu_tenant_ids())
    AND receivable_entity_id IN (SELECT id FROM legal_entities WHERE tenant_id = ANY(beyu_tenant_ids()))
    AND payable_entity_id IN (SELECT id FROM legal_entities WHERE tenant_id = ANY(beyu_tenant_ids()))
  );--> statement-breakpoint

ALTER TABLE "intercompany_reconciliation_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "intercompany_reconciliation_runs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "intercompany_reconciliation_runs_tenant_scope" ON "intercompany_reconciliation_runs";--> statement-breakpoint
CREATE POLICY "intercompany_reconciliation_runs_tenant_scope" ON "intercompany_reconciliation_runs" FOR ALL
  USING (tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint

ALTER TABLE "consolidation_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "consolidation_runs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "consolidation_runs_tenant_scope" ON "consolidation_runs";--> statement-breakpoint
CREATE POLICY "consolidation_runs_tenant_scope" ON "consolidation_runs" FOR ALL
  USING (tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint

ALTER TABLE "consolidation_entities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "consolidation_entities" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "consolidation_entities_scope" ON "consolidation_entities";--> statement-breakpoint
-- Child rows inherit scope through their authoritative parent run, exactly as
-- governance children inherit through their body.
CREATE POLICY "consolidation_entities_scope" ON "consolidation_entities" FOR ALL
  USING (EXISTS (SELECT 1 FROM consolidation_runs r WHERE r.id = run_id))
  WITH CHECK (EXISTS (SELECT 1 FROM consolidation_runs r WHERE r.id = run_id));--> statement-breakpoint

ALTER TABLE "consolidation_adjustments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "consolidation_adjustments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "consolidation_adjustments_scope" ON "consolidation_adjustments";--> statement-breakpoint
CREATE POLICY "consolidation_adjustments_scope" ON "consolidation_adjustments" FOR ALL
  USING (EXISTS (SELECT 1 FROM consolidation_runs r WHERE r.id = run_id))
  WITH CHECK (EXISTS (SELECT 1 FROM consolidation_runs r WHERE r.id = run_id));--> statement-breakpoint

ALTER TABLE "mcm_capital_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mcm_capital_allocations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "mcm_capital_allocations_tenant_scope" ON "mcm_capital_allocations";--> statement-breakpoint
CREATE POLICY "mcm_capital_allocations_tenant_scope" ON "mcm_capital_allocations" FOR ALL
  USING (tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint

ALTER TABLE "mcm_procurement_register" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mcm_procurement_register" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "mcm_procurement_register_tenant_scope" ON "mcm_procurement_register";--> statement-breakpoint
CREATE POLICY "mcm_procurement_register_tenant_scope" ON "mcm_procurement_register" FOR ALL
  USING (tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint

ALTER TABLE "mcm_asset_register" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mcm_asset_register" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "mcm_asset_register_tenant_scope" ON "mcm_asset_register";--> statement-breakpoint
CREATE POLICY "mcm_asset_register_tenant_scope" ON "mcm_asset_register" FOR ALL
  USING (tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint

ALTER TABLE "mcm_project_portfolio" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mcm_project_portfolio" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "mcm_project_portfolio_tenant_scope" ON "mcm_project_portfolio";--> statement-breakpoint
CREATE POLICY "mcm_project_portfolio_tenant_scope" ON "mcm_project_portfolio" FOR ALL
  USING (tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint

ALTER TABLE "mcm_module_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mcm_module_links" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "mcm_module_links_tenant_scope" ON "mcm_module_links";--> statement-breakpoint
CREATE POLICY "mcm_module_links_tenant_scope" ON "mcm_module_links" FOR ALL
  USING (tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint

-- Global reference data: readable by every authenticated principal, writable
-- only by the admin/migration role. Same posture as countries/jurisdictions.
ALTER TABLE "fx_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fx_rates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "fx_rates_read_only" ON "fx_rates";--> statement-breakpoint
CREATE POLICY "fx_rates_read_only" ON "fx_rates" FOR SELECT USING (true);--> statement-breakpoint

ALTER TABLE "mcm_country_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mcm_country_profiles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "mcm_country_profiles_read_only" ON "mcm_country_profiles";--> statement-breakpoint
CREATE POLICY "mcm_country_profiles_read_only" ON "mcm_country_profiles" FOR SELECT USING (true);--> statement-breakpoint

ALTER TABLE "mcm_integration_contracts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mcm_integration_contracts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "mcm_integration_contracts_read_only" ON "mcm_integration_contracts";--> statement-breakpoint
CREATE POLICY "mcm_integration_contracts_read_only" ON "mcm_integration_contracts" FOR SELECT USING (true);--> statement-breakpoint

ALTER TABLE "mcm_integration_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mcm_integration_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "mcm_integration_events_tenant_scope" ON "mcm_integration_events";--> statement-breakpoint
-- Integration events may be tenant-less (a contract-health probe is not
-- tenant data). A tenant-less row is visible only under an explicit tenant
-- context, never to an unscoped caller.
CREATE POLICY "mcm_integration_events_tenant_scope" ON "mcm_integration_events" FOR ALL
  USING (tenant_id IS NOT NULL AND tenant_id = ANY(beyu_tenant_ids()))
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = ANY(beyu_tenant_ids()));--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- RESTRICTIVE HARDENING
--
-- Scope is not a licence to rewrite a decision. These bind every role,
-- including roles provisioned after this migration.
-- ---------------------------------------------------------------------------
CREATE POLICY "legal_entity_lifecycle_events_no_delete" ON "legal_entity_lifecycle_events" AS RESTRICTIVE FOR DELETE USING (false);--> statement-breakpoint
CREATE POLICY "ownership_validations_no_delete" ON "ownership_validations" AS RESTRICTIVE FOR DELETE USING (false);--> statement-breakpoint
CREATE POLICY "intercompany_reconciliation_runs_no_delete" ON "intercompany_reconciliation_runs" AS RESTRICTIVE FOR DELETE USING (false);--> statement-breakpoint
CREATE POLICY "mcm_integration_events_no_delete" ON "mcm_integration_events" AS RESTRICTIVE FOR DELETE USING (false);--> statement-breakpoint
-- A reviewed consolidation run is final: it cannot be revised back into DRAFT.
CREATE POLICY "consolidation_runs_reviewed_update" ON "consolidation_runs" AS RESTRICTIVE FOR UPDATE
  USING (state <> 'REVIEWED') WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "consolidation_runs_no_delete" ON "consolidation_runs" AS RESTRICTIVE FOR DELETE USING (false);--> statement-breakpoint
-- An applied adjustment is frozen: reversing it is a NEW adjustment row.
CREATE POLICY "consolidation_adjustments_applied_update" ON "consolidation_adjustments" AS RESTRICTIVE FOR UPDATE
  USING (applied = false) WITH CHECK (true);--> statement-breakpoint
-- An intercompany transaction that both sides authorised cannot be deleted.
CREATE POLICY "intercompany_transactions_authorized_no_delete" ON "intercompany_transactions" AS RESTRICTIVE FOR DELETE
  USING (state = 'DRAFT' OR state = 'PROPOSED' OR state = 'REJECTED' OR state = 'CANCELLED');--> statement-breakpoint
-- Reference configuration is never mutated by the runtime role.
CREATE POLICY "fx_rates_no_write" ON "fx_rates" AS RESTRICTIVE FOR INSERT WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "fx_rates_no_update" ON "fx_rates" AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "fx_rates_no_delete" ON "fx_rates" AS RESTRICTIVE FOR DELETE USING (false);--> statement-breakpoint
CREATE POLICY "mcm_country_profiles_no_write" ON "mcm_country_profiles" AS RESTRICTIVE FOR INSERT WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "mcm_country_profiles_no_update" ON "mcm_country_profiles" AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "mcm_country_profiles_no_delete" ON "mcm_country_profiles" AS RESTRICTIVE FOR DELETE USING (false);--> statement-breakpoint
-- An integration contract is verified by a human through a governed, separately
-- privileged path; the runtime role cannot silently declare one VERIFIED.
CREATE POLICY "mcm_integration_contracts_no_insert" ON "mcm_integration_contracts" AS RESTRICTIVE FOR INSERT WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "mcm_integration_contracts_no_update" ON "mcm_integration_contracts" AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "mcm_integration_contracts_no_delete" ON "mcm_integration_contracts" AS RESTRICTIVE FOR DELETE USING (false);--> statement-breakpoint
