CREATE TABLE "payment_account_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"provider_code" text,
	"currency" text,
	"mapping_role" text NOT NULL,
	"ledger_account_id" text NOT NULL,
	"policy_version" text NOT NULL,
	"approved_by" text NOT NULL,
	"approval_reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"provider_code" text NOT NULL,
	"external_account_id" text NOT NULL,
	"external_account_digest" text NOT NULL,
	"account_type" text DEFAULT 'OPERATING' NOT NULL,
	"currency" text NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_corrections" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"original_transaction_id" text NOT NULL,
	"replacement_transaction_id" text,
	"kind" text NOT NULL,
	"reason_code" text NOT NULL,
	"reason_detail" text,
	"amount_minor" numeric(18, 0) NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"approval_reference" text,
	"requested_by" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"provider_reference" text,
	"accounting_status" text DEFAULT 'NOT_PREPARED' NOT NULL,
	"journal_entry_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_exceptions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text,
	"transaction_id" text,
	"webhook_event_id" text,
	"code" text NOT NULL,
	"severity" text DEFAULT 'MEDIUM' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"blocking" integer DEFAULT 1 NOT NULL,
	"raised_by" text DEFAULT 'SYSTEM' NOT NULL,
	"assigned_to" text,
	"reviewed_by" text,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_table" text,
	"target_id" text,
	"method" text NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"ruleset_version" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"proposed_by" text DEFAULT 'SYSTEM' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text,
	"provider_code" text,
	"currency" text NOT NULL,
	"max_transaction_minor" numeric(18, 0) NOT NULL,
	"daily_inbound_limit_minor" numeric(18, 0),
	"daily_outbound_limit_minor" numeric(18, 0),
	"auto_post_ceiling_minor" numeric(18, 0),
	"confidence_floor" numeric(4, 3) DEFAULT '0.990' NOT NULL,
	"max_clock_skew_seconds" integer DEFAULT 300 NOT NULL,
	"require_approval_above_minor" numeric(18, 0),
	"match_ruleset_version" text DEFAULT 'payment-match-1.0.0' NOT NULL,
	"unknown_transaction_treatment" text DEFAULT 'SUSPENSE_REVIEW' NOT NULL,
	"enabled" integer DEFAULT 1 NOT NULL,
	"policy_version" text NOT NULL,
	"approved_by" text NOT NULL,
	"approval_reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_provider_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"provider_code" text NOT NULL,
	"country_code" text NOT NULL,
	"label" text NOT NULL,
	"environment" text DEFAULT 'SANDBOX' NOT NULL,
	"base_url" text,
	"merchant_id" text,
	"credential_ref" text,
	"signing_secret_ref" text,
	"callback_path" text,
	"poll_interval_seconds" integer,
	"enabled" integer DEFAULT 0 NOT NULL,
	"enabled_by" text,
	"enabled_at" timestamp with time zone,
	"approval_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_providers" (
	"code" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"kind" text NOT NULL,
	"country_code" text NOT NULL,
	"integration_status" text DEFAULT 'NOT_INTEGRATED' NOT NULL,
	"contract_status" text DEFAULT 'NOT_INVESTIGATED' NOT NULL,
	"credential_status" text DEFAULT 'NOT_ISSUED' NOT NULL,
	"api_availability" text DEFAULT 'UNVERIFIED' NOT NULL,
	"webhook_model" text DEFAULT 'UNVERIFIED' NOT NULL,
	"settlement_model" text DEFAULT 'UNVERIFIED' NOT NULL,
	"signature_scheme" text DEFAULT 'NONE' NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sandbox_evidence" text,
	"production_evidence" text,
	"blocked_reason" text,
	"enabled_by" text,
	"enabled_at" timestamp with time zone,
	"approval_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_risk_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text,
	"transaction_id" text,
	"signal" text NOT NULL,
	"severity" text DEFAULT 'MEDIUM' NOT NULL,
	"score" numeric(4, 3) DEFAULT '0.500' NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"disposition" text DEFAULT 'OPEN' NOT NULL,
	"rule_version" text DEFAULT 'payment-risk-1.0.0' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_settlement_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"settlement_id" text NOT NULL,
	"transaction_id" text,
	"provider_transaction_id" text NOT NULL,
	"amount_minor" numeric(18, 0) NOT NULL,
	"fee_minor" numeric(18, 0) DEFAULT '0' NOT NULL,
	"match_status" text DEFAULT 'UNMATCHED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"provider_code" text NOT NULL,
	"connection_id" text NOT NULL,
	"provider_settlement_id" text NOT NULL,
	"settlement_date" timestamp with time zone NOT NULL,
	"currency" text NOT NULL,
	"gross_minor" numeric(18, 0) NOT NULL,
	"fee_minor" numeric(18, 0) DEFAULT '0' NOT NULL,
	"tax_minor" numeric(18, 0) DEFAULT '0' NOT NULL,
	"net_minor" numeric(18, 0) NOT NULL,
	"credited_minor" numeric(18, 0),
	"variance_minor" numeric(18, 0),
	"item_count" integer DEFAULT 0 NOT NULL,
	"matched_count" integer DEFAULT 0 NOT NULL,
	"unmatched_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"source" text DEFAULT 'STATEMENT_FILE' NOT NULL,
	"evidence_digest" text,
	"accounting_status" text DEFAULT 'NOT_PREPARED' NOT NULL,
	"journal_entry_id" text,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transaction_states" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"axis" text NOT NULL,
	"from_state" text,
	"to_state" text NOT NULL,
	"reason" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" text,
	"control_role" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"policy_version" text,
	"correlation_id" text,
	"trace_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"country_code" text NOT NULL,
	"provider_code" text NOT NULL,
	"connection_id" text NOT NULL,
	"account_id" text,
	"webhook_event_id" text,
	"provider_transaction_id" text NOT NULL,
	"provider_reference" text,
	"idempotency_key" text NOT NULL,
	"source" text DEFAULT 'PROVIDER_WEBHOOK' NOT NULL,
	"direction" text NOT NULL,
	"transaction_type" text NOT NULL,
	"currency" text NOT NULL,
	"gross_minor" numeric(18, 0) NOT NULL,
	"fee_minor" numeric(18, 0),
	"tax_minor" numeric(18, 0),
	"net_minor" numeric(18, 0),
	"net_basis" text DEFAULT 'UNRESOLVED' NOT NULL,
	"settlement_currency" text,
	"settlement_minor" numeric(18, 0),
	"fx_rate" numeric(18, 8),
	"fx_source_kind" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"provider_settled_at" timestamp with time zone,
	"verification_status" text DEFAULT 'CANDIDATE' NOT NULL,
	"verification_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trust_level" text DEFAULT 'RAW' NOT NULL,
	"reconciliation_status" text DEFAULT 'RECONCILIATION_REQUIRED' NOT NULL,
	"match_confidence" numeric(4, 3),
	"match_method" text,
	"settlement_status" text DEFAULT 'PENDING' NOT NULL,
	"settlement_id" text,
	"accounting_status" text DEFAULT 'NOT_PREPARED' NOT NULL,
	"journal_entry_id" text,
	"accounting_prepared_at" timestamp with time zone,
	"party_id" text,
	"customer_user_id" text,
	"counterparty_ref" text,
	"counterparty_digest" text,
	"counterparty_name" text,
	"invoice_reference" text,
	"description" text,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"provider_code" text NOT NULL,
	"connection_id" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"provider_transaction_id" text,
	"event_type" text NOT NULL,
	"payload_digest" text NOT NULL,
	"payload_size_bytes" integer NOT NULL,
	"signature_valid" integer DEFAULT 0 NOT NULL,
	"timestamp_valid" integer DEFAULT 0 NOT NULL,
	"replay_detected" integer DEFAULT 0 NOT NULL,
	"verification_detail" text,
	"processing_state" text DEFAULT 'RECEIVED' NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"last_error_code" text,
	"transaction_id" text,
	"correlation_id" text,
	"trace_id" text,
	"source_ip" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payment_account_mappings" ADD CONSTRAINT "payment_account_mappings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_account_mappings" ADD CONSTRAINT "payment_account_mappings_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_account_mappings" ADD CONSTRAINT "payment_account_mappings_ledger_account_id_ledger_accounts_id_fk" FOREIGN KEY ("ledger_account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_connection_id_payment_provider_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."payment_provider_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_provider_code_payment_providers_code_fk" FOREIGN KEY ("provider_code") REFERENCES "public"."payment_providers"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_corrections" ADD CONSTRAINT "payment_corrections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_corrections" ADD CONSTRAINT "payment_corrections_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_corrections" ADD CONSTRAINT "payment_corrections_original_transaction_id_payment_transactions_id_fk" FOREIGN KEY ("original_transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_corrections" ADD CONSTRAINT "payment_corrections_replacement_transaction_id_payment_transactions_id_fk" FOREIGN KEY ("replacement_transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_corrections" ADD CONSTRAINT "payment_corrections_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_transaction_id_payment_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_webhook_event_id_payment_webhook_events_id_fk" FOREIGN KEY ("webhook_event_id") REFERENCES "public"."payment_webhook_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_matches" ADD CONSTRAINT "payment_matches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_matches" ADD CONSTRAINT "payment_matches_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_matches" ADD CONSTRAINT "payment_matches_transaction_id_payment_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_policies" ADD CONSTRAINT "payment_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_policies" ADD CONSTRAINT "payment_policies_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_provider_connections" ADD CONSTRAINT "payment_provider_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_provider_connections" ADD CONSTRAINT "payment_provider_connections_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_provider_connections" ADD CONSTRAINT "payment_provider_connections_provider_code_payment_providers_code_fk" FOREIGN KEY ("provider_code") REFERENCES "public"."payment_providers"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_provider_connections" ADD CONSTRAINT "payment_provider_connections_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_providers" ADD CONSTRAINT "payment_providers_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_risk_signals" ADD CONSTRAINT "payment_risk_signals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_risk_signals" ADD CONSTRAINT "payment_risk_signals_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_risk_signals" ADD CONSTRAINT "payment_risk_signals_transaction_id_payment_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settlement_items" ADD CONSTRAINT "payment_settlement_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settlement_items" ADD CONSTRAINT "payment_settlement_items_settlement_id_payment_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."payment_settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settlement_items" ADD CONSTRAINT "payment_settlement_items_transaction_id_payment_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_provider_code_payment_providers_code_fk" FOREIGN KEY ("provider_code") REFERENCES "public"."payment_providers"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_connection_id_payment_provider_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."payment_provider_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transaction_states" ADD CONSTRAINT "payment_transaction_states_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transaction_states" ADD CONSTRAINT "payment_transaction_states_transaction_id_payment_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_provider_code_payment_providers_code_fk" FOREIGN KEY ("provider_code") REFERENCES "public"."payment_providers"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_connection_id_payment_provider_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."payment_provider_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_account_id_payment_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."payment_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_provider_code_payment_providers_code_fk" FOREIGN KEY ("provider_code") REFERENCES "public"."payment_providers"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_connection_id_payment_provider_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."payment_provider_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_account_mappings_uidx" ON "payment_account_mappings" USING btree ("tenant_id","legal_entity_id","provider_code","currency","mapping_role");--> statement-breakpoint
CREATE INDEX "payment_account_mappings_account_idx" ON "payment_account_mappings" USING btree ("ledger_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_accounts_external_uidx" ON "payment_accounts" USING btree ("connection_id","external_account_id","account_type");--> statement-breakpoint
CREATE INDEX "payment_accounts_tenant_idx" ON "payment_accounts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "payment_accounts_provider_idx" ON "payment_accounts" USING btree ("provider_code");--> statement-breakpoint
CREATE INDEX "payment_corrections_original_idx" ON "payment_corrections" USING btree ("original_transaction_id");--> statement-breakpoint
CREATE INDEX "payment_corrections_status_idx" ON "payment_corrections" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "payment_exceptions_open_idx" ON "payment_exceptions" USING btree ("tenant_id","status","severity");--> statement-breakpoint
CREATE INDEX "payment_exceptions_tx_idx" ON "payment_exceptions" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_matches_active_uidx" ON "payment_matches" USING btree ("transaction_id","method","target_id");--> statement-breakpoint
CREATE INDEX "payment_matches_target_idx" ON "payment_matches" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "payment_matches_status_idx" ON "payment_matches" USING btree ("status","confidence");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_policies_uidx" ON "payment_policies" USING btree ("tenant_id","legal_entity_id","provider_code","currency");--> statement-breakpoint
CREATE INDEX "payment_policies_tenant_idx" ON "payment_policies" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_connections_uidx" ON "payment_provider_connections" USING btree ("tenant_id","legal_entity_id","provider_code","environment","label");--> statement-breakpoint
CREATE INDEX "payment_provider_connections_provider_idx" ON "payment_provider_connections" USING btree ("provider_code");--> statement-breakpoint
CREATE INDEX "payment_provider_connections_tenant_idx" ON "payment_provider_connections" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "payment_providers_country_idx" ON "payment_providers" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "payment_providers_kind_idx" ON "payment_providers" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "payment_risk_signals_tx_idx" ON "payment_risk_signals" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "payment_risk_signals_open_idx" ON "payment_risk_signals" USING btree ("tenant_id","disposition","severity");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_settlement_items_uidx" ON "payment_settlement_items" USING btree ("settlement_id","provider_transaction_id");--> statement-breakpoint
CREATE INDEX "payment_settlement_items_tx_idx" ON "payment_settlement_items" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_settlements_uidx" ON "payment_settlements" USING btree ("connection_id","provider_settlement_id");--> statement-breakpoint
CREATE INDEX "payment_settlements_tenant_date_idx" ON "payment_settlements" USING btree ("tenant_id","settlement_date");--> statement-breakpoint
CREATE INDEX "payment_transaction_states_tx_idx" ON "payment_transaction_states" USING btree ("transaction_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_transactions_provider_uidx" ON "payment_transactions" USING btree ("connection_id","provider_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_transactions_idempotency_uidx" ON "payment_transactions" USING btree ("connection_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "payment_transactions_tenant_state_idx" ON "payment_transactions" USING btree ("tenant_id","reconciliation_status");--> statement-breakpoint
CREATE INDEX "payment_transactions_entity_occurred_idx" ON "payment_transactions" USING btree ("legal_entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "payment_transactions_party_idx" ON "payment_transactions" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "payment_transactions_invoice_idx" ON "payment_transactions" USING btree ("invoice_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_events_inbox_uidx" ON "payment_webhook_events" USING btree ("connection_id","provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_webhook_events_state_idx" ON "payment_webhook_events" USING btree ("processing_state");--> statement-breakpoint

-- ============================================================================
-- 0028 hardening (hand-written; deliberately not drizzle-generated)
--
-- WHY THESE STATEMENTS EXIST
--   `beyu_runtime` is granted blanket DML over schema public (scripts/
--   setup-db-role.ts:109 and again for future tables at :113-117) — the exact
--   root cause of the still-OPEN platform finding F-01 (see
--   docs/production/BEYU_OS_2_PRODUCTION_READINESS_MASTER_REPORT.md §V). Any
--   payment table created naively would inherit that openness, which would make
--   payment configuration, provider enablement, account mapping, limits and
--   settlement authority silently mutable by the runtime role. This section is
--   the payment-domain answer to F-01: it does NOT claim to remediate F-01 for
--   the governance tables, it guarantees the payment authority surfaces are
--   strictly better protected than they.
--
--   Three layers, each independently effective:
--     1. Column CHECK constraints — an invalid state value cannot be written by
--        ANY role, including a future bug or a superuser script.
--     2. Row Level Security with FORCE on every payment table. Configuration
--        tables receive a SELECT-only policy, so INSERT/UPDATE/DELETE have no
--         policy at all and are refused for the non-owner role even before the
--         grant is considered.
--     3. Explicit REVOKE of DML on the five configuration tables from the
--        runtime role (idempotent and role-existence tolerant, because CI
--        provisions the role AFTER migrations run; scripts/setup-db-role.ts
--        applies the same revocation at provisioning time, which is the
--        enforceable path for every environment).
--
--   Nothing here grants, activates or unlocks any capability. CAP_POSTING
--   remains LOCKED and posting authority is untouched by this migration.
-- ============================================================================

-- 1. Amount and state invariants. Money is stored in integer minor units,
--    exactly like the ledger (numeric, never float), and the gross/fee/net
--    relationship is a database-enforced rule rather than a convention.
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_gross_nonneg" CHECK ("gross_minor" >= 0);--> statement-breakpoint
-- Fee and tax are NULLABLE on a transaction precisely because "not reported"
-- and "reported as zero" are different facts. A CHECK that treated NULL as 0
-- would let the difference evaporate at the database boundary.
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_fee_nonneg" CHECK ("fee_minor" IS NULL OR "fee_minor" >= 0);--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_tax_nonneg" CHECK ("tax_minor" IS NULL OR "tax_minor" >= 0);--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_net_nonneg" CHECK ("net_minor" IS NULL OR "net_minor" >= 0);--> statement-breakpoint
-- When net is present it must tie. This is the constraint that makes an
-- invented "net = gross" impossible to persist quietly.
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_net_ties" CHECK ("net_minor" IS NULL OR "net_minor" = "gross_minor" - COALESCE("fee_minor", 0) - COALESCE("tax_minor", 0));--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_net_basis_check" CHECK ("net_basis" IN ('REPORTED','DERIVED_FROM_GROSS','DERIVED_FROM_COMPONENTS','UNRESOLVED'));--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_net_resolved_needs_value" CHECK ("net_basis" = 'UNRESOLVED' OR "net_minor" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_gross_not_zero" CHECK ("gross_minor" > 0);--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_direction_check" CHECK ("direction" IN ('INBOUND','OUTBOUND'));--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_type_check" CHECK ("transaction_type" IN ('DEPOSIT','WITHDRAWAL','TRANSFER','PAYMENT','REFUND','REVERSAL','FEE','SETTLEMENT_ADJUSTMENT'));--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_source_check" CHECK ("source" IN ('PROVIDER_WEBHOOK','PROVIDER_POLL','STATEMENT_FILE','MANUAL_GOVERNED'));--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_verification_check" CHECK ("verification_status" IN ('CANDIDATE','UNTRUSTED','VERIFIED','SUSPICIOUS','REJECTED'));--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_trust_check" CHECK ("trust_level" IN ('RAW','AUTHENTICATED','VERIFIED_PROVIDER','RECONCILED_BANK','CONFIRMED_MANUAL'));--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_reconciliation_check" CHECK ("reconciliation_status" IN ('RECONCILIATION_REQUIRED','RECONCILED','DATA_NOT_AVAILABLE','ATTRIBUTION_CONFLICT','DATA_CONFLICT','REQUIRES_AUTHORITY'));--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_settlement_check" CHECK ("settlement_status" IN ('PENDING','IN_SETTLEMENT','SETTLED','FAILED','NOT_APPLICABLE'));--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_accounting_check" CHECK ("accounting_status" IN ('NOT_PREPARED','POLICY_MISSING','PREPARED','READY','POSTED','POSTING_FAILED','REVERSED'));--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_confidence_range" CHECK ("match_confidence" IS NULL OR ("match_confidence" >= 0 AND "match_confidence" <= 1));--> statement-breakpoint
-- A RECONCILED transaction must carry a confidence; "reconciled" with no
-- evidence is precisely the silent-truth failure this program prohibits.
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_reconciled_needs_evidence" CHECK ("reconciliation_status" <> 'RECONCILED' OR "match_confidence" IS NOT NULL);--> statement-breakpoint
-- Accounting truth requires verified money. Nothing may be POSTED that has not
-- been authenticated at provider level AND reconciled or manually confirmed.
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_posted_needs_trust" CHECK ("accounting_status" <> 'POSTED' OR ("verification_status" = 'VERIFIED' AND "reconciliation_status" = 'RECONCILED' AND "trust_level" IN ('VERIFIED_PROVIDER','RECONCILED_BANK','CONFIRMED_MANUAL')));--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_posted_needs_entry" CHECK ("accounting_status" <> 'POSTED' OR "journal_entry_id" IS NOT NULL);--> statement-breakpoint

ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_processing_check" CHECK ("processing_state" IN ('RECEIVED','PROCESSED','DUPLICATE','REJECTED','FAILED'));--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_size_check" CHECK ("payload_size_bytes" >= 0 AND "payload_size_bytes" <= 262144);--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_attempts_check" CHECK ("attempt_count" >= 1);--> statement-breakpoint

ALTER TABLE "payment_providers" ADD CONSTRAINT "payment_providers_kind_check" CHECK ("kind" IN ('MOBILE_MONEY','BANK_TRANSFER','CARD','AGENT','UNIFIED_SWITCH'));--> statement-breakpoint
ALTER TABLE "payment_providers" ADD CONSTRAINT "payment_providers_integration_check" CHECK ("integration_status" IN ('NOT_INTEGRATED','ADAPTER_CODED','SANDBOX_CONFIGURED','SANDBOX_VERIFIED','PRODUCTION_CONFIGURED','PRODUCTION_VERIFIED','BLOCKED_EXTERNAL_DEPENDENCY'));--> statement-breakpoint
ALTER TABLE "payment_providers" ADD CONSTRAINT "payment_providers_contract_check" CHECK ("contract_status" IN ('NOT_INVESTIGATED','REQUIRED','IN_PROGRESS','SIGNED','NOT_REQUIRED'));--> statement-breakpoint
ALTER TABLE "payment_providers" ADD CONSTRAINT "payment_providers_credential_check" CHECK ("credential_status" IN ('NOT_ISSUED','SANDBOX_ISSUED','PRODUCTION_ISSUED','ROTATION_REQUIRED','REFUSED'));--> statement-breakpoint
ALTER TABLE "payment_providers" ADD CONSTRAINT "payment_providers_api_check" CHECK ("api_availability" IN ('UNVERIFIED','DOCUMENTED_PUBLIC','DOCUMENTED_PARTNER','NONE_FOUND'));--> statement-breakpoint
ALTER TABLE "payment_providers" ADD CONSTRAINT "payment_providers_webhook_check" CHECK ("webhook_model" IN ('UNVERIFIED','PROVIDER_PUSH','POLL_ONLY'));--> statement-breakpoint
ALTER TABLE "payment_providers" ADD CONSTRAINT "payment_providers_settlement_check" CHECK ("settlement_model" IN ('UNVERIFIED','AUTOMATIC_DAILY','MANUAL_BATCH','PER_TRANSACTION','UNKNOWN'));--> statement-breakpoint
ALTER TABLE "payment_providers" ADD CONSTRAINT "payment_providers_signature_check" CHECK ("signature_scheme" IN ('NONE','HMAC_SHA256','RSA_SHA256','JWT','BASIC_AUTH_HASH'));--> statement-breakpoint
-- An "integrated" claim may not be self-declared: it requires a sandbox
-- evidence string, and production verification requires a named approver plus
-- an approval reference. A mock can never satisfy both.
ALTER TABLE "payment_providers" ADD CONSTRAINT "payment_providers_status_needs_evidence" CHECK ("integration_status" IN ('NOT_INTEGRATED','ADAPTER_CODED','BLOCKED_EXTERNAL_DEPENDENCY') OR "sandbox_evidence" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "payment_providers" ADD CONSTRAINT "payment_providers_prod_needs_approval" CHECK ("integration_status" NOT IN ('PRODUCTION_CONFIGURED','PRODUCTION_VERIFIED') OR ("enabled_by" IS NOT NULL AND "approval_reference" IS NOT NULL));--> statement-breakpoint

ALTER TABLE "payment_provider_connections" ADD CONSTRAINT "payment_provider_connections_env_check" CHECK ("environment" IN ('SANDBOX','PRODUCTION'));--> statement-breakpoint
ALTER TABLE "payment_provider_connections" ADD CONSTRAINT "payment_provider_connections_enabled_check" CHECK ("enabled" IN (0,1));--> statement-breakpoint
-- Enabling a connection is a governed act: it needs an actor and a reference.
ALTER TABLE "payment_provider_connections" ADD CONSTRAINT "payment_provider_connections_enable_evidence" CHECK ("enabled" = 0 OR ("enabled_by" IS NOT NULL AND "approval_reference" IS NOT NULL));--> statement-breakpoint
-- No secret values may ever land in a *_ref column (they hold env-var NAMES).
ALTER TABLE "payment_provider_connections" ADD CONSTRAINT "payment_provider_connections_ref_shape" CHECK ("credential_ref" IS NULL OR "credential_ref" ~ '^[A-Z][A-Z0-9_]{2,}$');--> statement-breakpoint
ALTER TABLE "payment_provider_connections" ADD CONSTRAINT "payment_provider_connections_secret_ref_shape" CHECK ("signing_secret_ref" IS NULL OR "signing_secret_ref" ~ '^[A-Z][A-Z0-9_]{2,}$');--> statement-breakpoint

ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_type_check" CHECK ("account_type" IN ('OPERATING','COLLECTION','PAYOUT','CLEARING','FLOAT'));--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_status_check" CHECK ("status" IN ('ACTIVE','SUSPENDED','CLOSED'));--> statement-breakpoint

ALTER TABLE "payment_account_mappings" ADD CONSTRAINT "payment_account_mappings_role_check" CHECK ("mapping_role" IN ('RECEIVABLE','CLEARING','CASH','FEE_EXPENSE','TAX_PAYABLE','SETTLEMENT_LIABILITY','SUSPENSE'));--> statement-breakpoint

ALTER TABLE "payment_policies" ADD CONSTRAINT "payment_policies_enabled_check" CHECK ("enabled" IN (0,1));--> statement-breakpoint
ALTER TABLE "payment_policies" ADD CONSTRAINT "payment_policies_confidence_range" CHECK ("confidence_floor" >= 0 AND "confidence_floor" <= 1);--> statement-breakpoint
ALTER TABLE "payment_policies" ADD CONSTRAINT "payment_policies_skew_check" CHECK ("max_clock_skew_seconds" BETWEEN 0 AND 86400);--> statement-breakpoint
ALTER TABLE "payment_policies" ADD CONSTRAINT "payment_policies_unknown_treatment_check" CHECK ("unknown_transaction_treatment" IN ('SUSPENSE_REVIEW','REJECT'));--> statement-breakpoint

ALTER TABLE "payment_matches" ADD CONSTRAINT "payment_matches_method_check" CHECK ("method" IN ('EXACT_REFERENCE','EXACT_IDEMPOTENCY','AMOUNT_ACCOUNT_EXACT','AMOUNT_DATE_WINDOW','INVOICE_REFERENCE','COUNTERPARTY_DIGEST','FUZZY'));--> statement-breakpoint
ALTER TABLE "payment_matches" ADD CONSTRAINT "payment_matches_status_check" CHECK ("status" IN ('PROPOSED','CONFIRMED','REJECTED'));--> statement-breakpoint
ALTER TABLE "payment_matches" ADD CONSTRAINT "payment_matches_confidence_range" CHECK ("confidence" >= 0 AND "confidence" <= 1);--> statement-breakpoint
-- A fuzzy match can never be self-confirming: it stays PROPOSED and needs a
-- named reviewer distinct from the proposing actor.
ALTER TABLE "payment_matches" ADD CONSTRAINT "payment_matches_fuzzy_needs_reviewer" CHECK ("method" <> 'FUZZY' OR "status" = 'PROPOSED' OR ("reviewed_by" IS NOT NULL AND "reviewed_by" <> "proposed_by"));--> statement-breakpoint

ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_severity_check" CHECK ("severity" IN ('LOW','MEDIUM','HIGH','CRITICAL'));--> statement-breakpoint
ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_status_check" CHECK ("status" IN ('OPEN','IN_REVIEW','RESOLVED','ACCEPTED_RISK','ESCALATED'));--> statement-breakpoint
ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_blocking_check" CHECK ("blocking" IN (0,1));--> statement-breakpoint
-- Closing an exception requires a named reviewer and a reason. Nothing is
-- quietly swept away.
ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_closure_evidence" CHECK ("status" NOT IN ('RESOLVED','ACCEPTED_RISK') OR ("reviewed_by" IS NOT NULL AND "resolution" IS NOT NULL));--> statement-breakpoint

ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_status_check" CHECK ("status" IN ('RECEIVED','MATCHING','RECONCILED','VARIANCE','PARTIAL','DISPUTED','CREDIT_CONFIRMED'));--> statement-breakpoint
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_source_check" CHECK ("source" IN ('PROVIDER_PUSH','STATEMENT_FILE','BANK_STATEMENT'));--> statement-breakpoint
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_accounting_check" CHECK ("accounting_status" IN ('NOT_PREPARED','POLICY_MISSING','PREPARED','READY','POSTED','POSTING_FAILED','REVERSED'));--> statement-breakpoint
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_net_nonneg" CHECK ("net_minor" >= 0 AND "gross_minor" >= 0 AND "fee_minor" >= 0 AND "tax_minor" >= 0);--> statement-breakpoint
-- "RECONCILED" must mean the components add up, not that nobody looked.
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_reconciled_counts" CHECK ("status" <> 'RECONCILED' OR ("unmatched_count" = 0 AND "item_count" = "matched_count"));--> statement-breakpoint
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_item_counts" CHECK ("matched_count" + "unmatched_count" <= "item_count");--> statement-breakpoint

ALTER TABLE "payment_settlement_items" ADD CONSTRAINT "payment_settlement_items_match_check" CHECK ("match_status" IN ('MATCHED','UNMATCHED','AMOUNT_MISMATCH'));--> statement-breakpoint
ALTER TABLE "payment_corrections" ADD CONSTRAINT "payment_corrections_kind_check" CHECK ("kind" IN ('REFUND','REVERSAL','CHARGEBACK','DISPUTE','ADJUSTMENT'));--> statement-breakpoint
ALTER TABLE "payment_corrections" ADD CONSTRAINT "payment_corrections_status_check" CHECK ("status" IN ('RECEIVED','UNDER_REVIEW','APPROVED','EXECUTING','COMPLETED','REJECTED','FAILED'));--> statement-breakpoint
ALTER TABLE "payment_corrections" ADD CONSTRAINT "payment_corrections_amount_nonneg" CHECK ("amount_minor" >= 0);--> statement-breakpoint
ALTER TABLE "payment_corrections" ADD CONSTRAINT "payment_corrections_not_self" CHECK ("replacement_transaction_id" IS NULL OR "replacement_transaction_id" <> "original_transaction_id");--> statement-breakpoint
ALTER TABLE "payment_risk_signals" ADD CONSTRAINT "payment_risk_signals_severity_check" CHECK ("severity" IN ('LOW','MEDIUM','HIGH','CRITICAL'));--> statement-breakpoint
ALTER TABLE "payment_risk_signals" ADD CONSTRAINT "payment_risk_signals_disposition_check" CHECK ("disposition" IN ('OPEN','DISMISSED','BLOCKED','ESCALATED'));--> statement-breakpoint
ALTER TABLE "payment_risk_signals" ADD CONSTRAINT "payment_risk_signals_score_range" CHECK ("score" >= 0 AND "score" <= 1);--> statement-breakpoint
-- Five status axes, matching `StatusAxis` in src/lib/payments/domain.ts: the TRUST
-- axis (how much the platform may believe a row) is deliberately separate from the
-- VERIFICATION axis (whether the message was authenticated), because an
-- authenticated message from an unverifiable source is still not corroborated.
ALTER TABLE "payment_transaction_states" ADD CONSTRAINT "payment_transaction_states_axis_check" CHECK ("axis" IN ('VERIFICATION','TRUST','RECONCILIATION','SETTLEMENT','ACCOUNTING'));--> statement-breakpoint
ALTER TABLE "payment_transaction_states" ADD CONSTRAINT "payment_transaction_states_actor_check" CHECK ("actor_type" IN ('SERVICE','HUMAN','SYSTEM'));--> statement-breakpoint
ALTER TABLE "payment_transaction_states" ADD CONSTRAINT "payment_transaction_states_role_check" CHECK ("control_role" IS NULL OR "control_role" IN ('MAKER','CHECKER','AUTHORIZER','EXECUTOR'));--> statement-breakpoint

-- 2. Row Level Security, mirroring the canonical shape established in 0021 (one
--    policy per table per command; tenant AND entity conditions inside a single
--    policy; FORCE so table owners are bound too).
--
--    Configuration tables receive a SELECT-only policy. The absence of an
--    INSERT/UPDATE/DELETE policy is deliberate: the runtime role cannot rewrite
--    provider status, account mappings, limits or enablement through the
--    database at all, and every change must arrive through the governed admin
--    path (scripts/payment-config.ts under BEYU_ADMIN_DATABASE_URL).
ALTER TABLE "payment_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_providers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "payment_providers_read_only" ON "payment_providers";--> statement-breakpoint
CREATE POLICY "payment_providers_read_only" ON "payment_providers" FOR SELECT
  USING (true);--> statement-breakpoint

ALTER TABLE "payment_provider_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_provider_connections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "payment_provider_connections_read_only" ON "payment_provider_connections";--> statement-breakpoint
CREATE POLICY "payment_provider_connections_read_only" ON "payment_provider_connections" FOR SELECT
  USING ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "payment_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "payment_accounts_read_only" ON "payment_accounts";--> statement-breakpoint
CREATE POLICY "payment_accounts_read_only" ON "payment_accounts" FOR SELECT
  USING ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "payment_account_mappings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_account_mappings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "payment_account_mappings_read_only" ON "payment_account_mappings";--> statement-breakpoint
CREATE POLICY "payment_account_mappings_read_only" ON "payment_account_mappings" FOR SELECT
  USING ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "payment_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_policies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "payment_policies_read_only" ON "payment_policies";--> statement-breakpoint
CREATE POLICY "payment_policies_read_only" ON "payment_policies" FOR SELECT
  USING ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

-- Transactional tables: full tenant + entity isolation on every command.
ALTER TABLE "payment_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_transactions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "payment_transactions_tenant_entity_isolation" ON "payment_transactions";--> statement-breakpoint
CREATE POLICY "payment_transactions_tenant_entity_isolation" ON "payment_transactions" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND EXISTS (
      SELECT 1 FROM "legal_entities" le
      WHERE le."id" = "payment_transactions"."legal_entity_id"
        AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND EXISTS (
      SELECT 1 FROM "legal_entities" le
      WHERE le."id" = "payment_transactions"."legal_entity_id"
        AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  );--> statement-breakpoint

ALTER TABLE "payment_webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "payment_webhook_events_tenant_entity_isolation" ON "payment_webhook_events";--> statement-breakpoint
CREATE POLICY "payment_webhook_events_tenant_entity_isolation" ON "payment_webhook_events" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND EXISTS (
      SELECT 1 FROM "legal_entities" le
      WHERE le."id" = "payment_webhook_events"."legal_entity_id"
        AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND EXISTS (
      SELECT 1 FROM "legal_entities" le
      WHERE le."id" = "payment_webhook_events"."legal_entity_id"
        AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  );--> statement-breakpoint

ALTER TABLE "payment_transaction_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_transaction_states" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "payment_transaction_states_tenant_isolation" ON "payment_transaction_states";--> statement-breakpoint
CREATE POLICY "payment_transaction_states_tenant_isolation" ON "payment_transaction_states" FOR ALL
  USING ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "payment_matches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_matches" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "payment_matches_tenant_entity_isolation" ON "payment_matches";--> statement-breakpoint
CREATE POLICY "payment_matches_tenant_entity_isolation" ON "payment_matches" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND EXISTS (
      SELECT 1 FROM "legal_entities" le
      WHERE le."id" = "payment_matches"."legal_entity_id"
        AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND EXISTS (
      SELECT 1 FROM "legal_entities" le
      WHERE le."id" = "payment_matches"."legal_entity_id"
        AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  );--> statement-breakpoint

ALTER TABLE "payment_exceptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_exceptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "payment_exceptions_tenant_isolation" ON "payment_exceptions";--> statement-breakpoint
CREATE POLICY "payment_exceptions_tenant_isolation" ON "payment_exceptions" FOR ALL
  USING ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "payment_settlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_settlements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "payment_settlements_tenant_entity_isolation" ON "payment_settlements";--> statement-breakpoint
CREATE POLICY "payment_settlements_tenant_entity_isolation" ON "payment_settlements" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND EXISTS (
      SELECT 1 FROM "legal_entities" le
      WHERE le."id" = "payment_settlements"."legal_entity_id"
        AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND EXISTS (
      SELECT 1 FROM "legal_entities" le
      WHERE le."id" = "payment_settlements"."legal_entity_id"
        AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  );--> statement-breakpoint

ALTER TABLE "payment_settlement_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_settlement_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "payment_settlement_items_tenant_isolation" ON "payment_settlement_items";--> statement-breakpoint
CREATE POLICY "payment_settlement_items_tenant_isolation" ON "payment_settlement_items" FOR ALL
  USING ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

ALTER TABLE "payment_corrections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_corrections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "payment_corrections_tenant_entity_isolation" ON "payment_corrections";--> statement-breakpoint
CREATE POLICY "payment_corrections_tenant_entity_isolation" ON "payment_corrections" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND EXISTS (
      SELECT 1 FROM "legal_entities" le
      WHERE le."id" = "payment_corrections"."legal_entity_id"
        AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND EXISTS (
      SELECT 1 FROM "legal_entities" le
      WHERE le."id" = "payment_corrections"."legal_entity_id"
        AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  );--> statement-breakpoint

ALTER TABLE "payment_risk_signals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_risk_signals" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "payment_risk_signals_tenant_isolation" ON "payment_risk_signals";--> statement-breakpoint
CREATE POLICY "payment_risk_signals_tenant_isolation" ON "payment_risk_signals" FOR ALL
  USING ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

-- 3. Append-only and lineage triggers (the same defensive family as the ledger
--    triggers on audit_log / journal_entries / journal_lines).
CREATE OR REPLACE FUNCTION "beyu_assert_payment_state_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION 'payment state history is append-only; % on % is forbidden', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$function$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "payment_transaction_states_append_only" ON "payment_transaction_states";--> statement-breakpoint
CREATE TRIGGER "payment_transaction_states_append_only" BEFORE UPDATE OR DELETE ON "payment_transaction_states"
  FOR EACH ROW EXECUTE FUNCTION "beyu_assert_payment_state_append_only"();--> statement-breakpoint

-- A received provider event may be advanced (RECEIVED -> PROCESSED/DUPLICATE/…)
-- but its identity and its verified bytes are never rewritten. Rewriting the
-- digest or the provider event id after the fact would destroy replay
-- protection, so it is refused for every role.
CREATE OR REPLACE FUNCTION "beyu_assert_payment_webhook_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
     OR NEW."legal_entity_id" IS DISTINCT FROM OLD."legal_entity_id"
     OR NEW."provider_code" IS DISTINCT FROM OLD."provider_code"
     OR NEW."connection_id" IS DISTINCT FROM OLD."connection_id"
     OR NEW."provider_event_id" IS DISTINCT FROM OLD."provider_event_id"
     OR NEW."payload_digest" IS DISTINCT FROM OLD."payload_digest"
     OR NEW."payload_size_bytes" IS DISTINCT FROM OLD."payload_size_bytes"
     OR NEW."received_at" IS DISTINCT FROM OLD."received_at" THEN
    RAISE EXCEPTION 'webhook event identity and payload digest are immutable (event %)', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "payment_webhook_events_immutable_identity" ON "payment_webhook_events";--> statement-breakpoint
CREATE TRIGGER "payment_webhook_events_immutable_identity" BEFORE UPDATE ON "payment_webhook_events"
  FOR EACH ROW EXECUTE FUNCTION "beyu_assert_payment_webhook_immutable"();--> statement-breakpoint

-- A payment row may claim accounting_status = POSTED only when a genuine
-- journal entry exists, belongs to the same tenant, and carries the PAYMENTS
-- source written by postJournal(). This makes "posted" a fact about the ledger
-- rather than a field someone set.
CREATE OR REPLACE FUNCTION "beyu_assert_payment_accounting_lineage"() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE
  v_entry_tenant text;
  v_entry_source text;
BEGIN
  IF NEW."accounting_status" = 'POSTED' THEN
    SELECT "tenant_id", "source" INTO v_entry_tenant, v_entry_source
      FROM "journal_entries" WHERE "id" = NEW."journal_entry_id";
    IF v_entry_tenant IS NULL THEN
      RAISE EXCEPTION 'payment transaction % claims POSTED but journal entry % does not exist', NEW."id", NEW."journal_entry_id"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF v_entry_tenant <> NEW."tenant_id" THEN
      RAISE EXCEPTION 'payment transaction % claims POSTED against a journal entry in another tenant', NEW."id"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF v_entry_source <> 'PAYMENTS' THEN
      RAISE EXCEPTION 'payment transaction % claims POSTED against journal entry % which was not posted by the payments bridge (source %)', NEW."id", NEW."journal_entry_id", v_entry_source
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "payment_transactions_accounting_lineage" ON "payment_transactions";--> statement-breakpoint
CREATE TRIGGER "payment_transactions_accounting_lineage" BEFORE UPDATE OR INSERT ON "payment_transactions"
  FOR EACH ROW EXECUTE FUNCTION "beyu_assert_payment_accounting_lineage"();--> statement-breakpoint

-- Confirmed matches are a decision, not a draft: once CONFIRMED the decision
-- columns freeze. A later discovery becomes a new row plus an exception, never
-- a silent edit of the old one.
CREATE OR REPLACE FUNCTION "beyu_assert_payment_match_decision_frozen"() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD."status" = 'CONFIRMED' AND (
       NEW."status" IS DISTINCT FROM OLD."status"
    OR NEW."target_id" IS DISTINCT FROM OLD."target_id"
    OR NEW."target_table" IS DISTINCT FROM OLD."target_table"
    OR NEW."reviewed_by" IS DISTINCT FROM OLD."reviewed_by"
    OR NEW."method" IS DISTINCT FROM OLD."method"
    OR NEW."confidence" IS DISTINCT FROM OLD."confidence"
  ) THEN
    RAISE EXCEPTION 'confirmed payment match % is frozen; record a new match and an exception instead of editing it', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "payment_matches_decision_frozen" ON "payment_matches";--> statement-breakpoint
CREATE TRIGGER "payment_matches_decision_frozen" BEFORE UPDATE ON "payment_matches"
  FOR EACH ROW EXECUTE FUNCTION "beyu_assert_payment_match_decision_frozen"();--> statement-breakpoint

-- 4. Least privilege. Configuration and authority surfaces are SELECT-only for
--    the runtime role. The DO block keeps the statement safe on a database
--    where the role has not been provisioned yet (CI applies migrations before
--    scripts/setup-db-role.ts creates the role); setup-db-role.ts repeats the
--    same revocation after its blanket grant so the control holds in every
--    environment, including a re-provision.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles
           WHERE rolname = 'beyu_runtime'
              OR rolname = current_setting('beyu.runtime_role', true)
  LOOP
    -- The role exists (the loop is driven by pg_roles), so the revocation is
    -- meaningful; a role with no prior grant accepts REVOKE as a no-op.
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE ON %s, %s, %s, %s, %s FROM %I',
      'public.payment_providers',
      'public.payment_provider_connections',
      'public.payment_accounts',
      'public.payment_account_mappings',
      'public.payment_policies',
      r.rolname
    );
    RAISE NOTICE 'revoked DML on payment configuration tables from %', r.rolname;
  END LOOP;
END
$$;
--> statement-breakpoint
