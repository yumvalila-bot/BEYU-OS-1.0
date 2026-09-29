-- ============================================================================
-- BEYU OS — Migration 0071: Federation & Trust (SHARED BEYU OS CAPABILITY)
-- ============================================================================
-- ONE canonical federation plane for external authorities, jurisdictions,
-- interoperability and trust. Extends (never duplicates) the Government
-- Integration Fabric (0036): `government_agencies`/`government_submissions`
-- remain the outbound submission plane; this module is the trust & discovery
-- plane, cross-linked by `federation_authorities.legacy_agency_code`.
--
-- DESIGN LAWS encoded as invariants below:
--   1. "authority exists" is NEVER "BEYU is connected" — separate status
--      columns, never a single boolean.
--   2. LIVE / LIVE_VERIFIED / PRODUCTION_APPROVAL require production
--      evidence + named approver + approval reference (CHECK).
--   3. FREE_CONFIRMED requires cost evidence (CHECK) — never inferred.
--   4. VERIFIED+ verification levels require an evidence row (CHECK).
--   5. APPROVED access requests require a distinct approval row (CHECK).
--   6. Enabled connectors require credentials, a mock flag, or a public/
--      manual channel (CHECK).
--   7. No secret column exists anywhere in this migration (by construction):
--      credential rows carry env-var NAMES only (0036 precedent).
--
-- RLS: registry tables = global reference data, FORCE RLS, runtime role
-- SELECT-only (0036 pattern). Operational tables = tenant (+entity) scoped
-- via beyu_tenant_ids()/beyu_global_scope(). A verification block fails the
-- migration if RLS is missing on any federation table.
-- ============================================================================

CREATE TABLE "federation_jurisdictions" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'COUNTRY' NOT NULL,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"country_code" text REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action,
	"government_structure" text,
	"authority_directory_source" text,
	"legal_framework_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data_protection_framework" text,
	"identity_framework" text,
	"integration_regime" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"network_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"trust_services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data_residency" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cross_border_interfaces" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"profile_version" text DEFAULT '1.0.0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_domains" (
	"jurisdiction_code" text NOT NULL REFERENCES "public"."federation_jurisdictions"("code") ON DELETE no action ON UPDATE no action,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"parent_code" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"quote" text,
	"artifact_hash" text,
	"artifact_ref" text,
	"source_name" text NOT NULL,
	"source_version" text,
	"captured_by" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'VALID' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "federation_legal_bases" (
	"id" text PRIMARY KEY NOT NULL,
	"jurisdiction_code" text NOT NULL REFERENCES "public"."federation_jurisdictions"("code") ON DELETE no action ON UPDATE no action,
	"code" text NOT NULL,
	"basis_type" text NOT NULL,
	"legal_source" text NOT NULL,
	"legal_reference" text,
	"purpose" text NOT NULL,
	"scope" text,
	"effective_date" timestamp with time zone,
	"expiry_date" timestamp with time zone,
	"reviewed_by" text,
	"evidence_id" text REFERENCES "public"."federation_evidence"("id") ON DELETE no action ON UPDATE no action,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_authorities" (
	"id" text PRIMARY KEY NOT NULL,
	"jurisdiction_code" text NOT NULL REFERENCES "public"."federation_jurisdictions"("code") ON DELETE no action ON UPDATE no action,
	"code" text NOT NULL,
	"domain_code" text NOT NULL,
	"official_name" text NOT NULL,
	"short_name" text,
	"authority_type" text DEFAULT 'AGENCY' NOT NULL,
	"parent_authority_code" text,
	"legal_mandate" text,
	"official_website" text,
	"official_contact" text,
	"directory_source" text,
	"jurisdiction_scope" text,
	"geographic_scope" text,
	"sector_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data_owner" text,
	"data_custodian" text,
	"service_provider" text DEFAULT 'UNKNOWN' NOT NULL,
	"service_consumer" text DEFAULT 'UNKNOWN' NOT NULL,
	"data_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"permitted_purposes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"consent_required" text DEFAULT 'UNKNOWN' NOT NULL,
	"authentication_method" text,
	"authorization_requirement" text,
	"agreement_required" text DEFAULT 'UNKNOWN' NOT NULL,
	"security_requirement" text,
	"integration_channel" text,
	"api_status" text DEFAULT 'UNVERIFIED' NOT NULL,
	"govesb_status" text DEFAULT 'GOVESB_UNKNOWN' NOT NULL,
	"verification_status" text DEFAULT 'REGISTERED' NOT NULL,
	"access_cost_status" text DEFAULT 'UNKNOWN_COST' NOT NULL,
	"fee_amount" text,
	"currency" text,
	"fee_unit" text,
	"recurring_fee" text,
	"transaction_fee" text,
	"subscription_fee" text,
	"setup_fee" text,
	"security_cost" text,
	"infrastructure_cost" text,
	"certificate_cost" text,
	"agreement_cost" text,
	"cost_evidence_id" text REFERENCES "public"."federation_evidence"("id") ON DELETE no action ON UPDATE no action,
	"verified_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"evidence_reference" text,
	"evidence_id" text REFERENCES "public"."federation_evidence"("id") ON DELETE no action ON UPDATE no action,
	"production_evidence_id" text REFERENCES "public"."federation_evidence"("id") ON DELETE no action ON UPDATE no action,
	"approved_by" text,
	"approval_reference" text,
	"source_version" text,
	"record_status" text DEFAULT 'REGISTERED' NOT NULL,
	"lifecycle_status" text DEFAULT 'DISCOVERED' NOT NULL,
	"reconciliation_state" text DEFAULT 'PENDING_RECONCILIATION' NOT NULL,
	"legacy_agency_code" text REFERENCES "public"."government_agencies"("code") ON DELETE no action ON UPDATE no action,
	"notes" text,
	"created_by" text DEFAULT 'SEED/FEDERATION_BOOTSTRAP' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_agreements" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"authority_id" text NOT NULL REFERENCES "public"."federation_authorities"("id") ON DELETE no action ON UPDATE no action,
	"counterparty" text NOT NULL,
	"parties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scope" text,
	"services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"datasets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"legal_basis_id" text REFERENCES "public"."federation_legal_bases"("id") ON DELETE no action ON UPDATE no action,
	"effective_date" timestamp with time zone,
	"expiry_date" timestamp with time zone,
	"renewal_required" text DEFAULT 'UNKNOWN' NOT NULL,
	"restrictions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_id" text REFERENCES "public"."federation_evidence"("id") ON DELETE no action ON UPDATE no action,
	"approved_by" text,
	"approval_reference" text,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_schemas" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"authority_id" text REFERENCES "public"."federation_authorities"("id") ON DELETE no action ON UPDATE no action,
	"service_id" text,
	"name" text NOT NULL,
	"format" text DEFAULT 'UNKNOWN' NOT NULL,
	"definition_ref" text,
	"field_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"compatibility" text DEFAULT 'COMPATIBLE' NOT NULL,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"supersedes_id" text,
	"created_by" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_services" (
	"id" text PRIMARY KEY NOT NULL,
	"authority_id" text NOT NULL REFERENCES "public"."federation_authorities"("id") ON DELETE no action ON UPDATE no action,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"data_classification" text DEFAULT 'UNVERIFIED' NOT NULL,
	"purpose" text,
	"legal_basis_id" text REFERENCES "public"."federation_legal_bases"("id") ON DELETE no action ON UPDATE no action,
	"consent_required" text DEFAULT 'UNKNOWN' NOT NULL,
	"agreement_required" text DEFAULT 'UNKNOWN' NOT NULL,
	"agreement_id" text REFERENCES "public"."federation_agreements"("id") ON DELETE no action ON UPDATE no action,
	"access_cost_status" text DEFAULT 'UNKNOWN_COST' NOT NULL,
	"fee_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_evidence_id" text REFERENCES "public"."federation_evidence"("id") ON DELETE no action ON UPDATE no action,
	"credential_required" text DEFAULT 'UNKNOWN' NOT NULL,
	"connector_id" text,
	"schema_id" text REFERENCES "public"."federation_schemas"("id") ON DELETE no action ON UPDATE no action,
	"api_status" text DEFAULT 'UNVERIFIED' NOT NULL,
	"govesb_status" text DEFAULT 'GOVESB_UNKNOWN' NOT NULL,
	"verification_status" text DEFAULT 'REGISTERED' NOT NULL,
	"production_evidence_id" text REFERENCES "public"."federation_evidence"("id") ON DELETE no action ON UPDATE no action,
	"approved_by" text,
	"approval_reference" text,
	"access_level" text DEFAULT 'NOT_CONNECTED' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_datasets" (
	"id" text PRIMARY KEY NOT NULL,
	"authority_id" text NOT NULL REFERENCES "public"."federation_authorities"("id") ON DELETE no action ON UPDATE no action,
	"service_id" text REFERENCES "public"."federation_services"("id") ON DELETE no action ON UPDATE no action,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"owner" text,
	"custodian" text,
	"classification" text DEFAULT 'UNVERIFIED' NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"schema_id" text REFERENCES "public"."federation_schemas"("id") ON DELETE no action ON UPDATE no action,
	"purpose" text,
	"legal_basis_id" text REFERENCES "public"."federation_legal_bases"("id") ON DELETE no action ON UPDATE no action,
	"consent_required" text DEFAULT 'UNKNOWN' NOT NULL,
	"retention" text,
	"source" text,
	"update_frequency" text,
	"permitted_consumers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"restrictions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cost_status" text DEFAULT 'UNKNOWN_COST' NOT NULL,
	"verification_status" text DEFAULT 'REGISTERED' NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"authority_id" text NOT NULL REFERENCES "public"."federation_authorities"("id") ON DELETE no action ON UPDATE no action,
	"connector_id" text,
	"credential_class" text DEFAULT 'SANDBOX' NOT NULL,
	"env_var_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"issued_by" text,
	"issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"rotation_required" text DEFAULT 'UNKNOWN' NOT NULL,
	"status" text DEFAULT 'NOT_ISSUED' NOT NULL,
	"evidence_id" text REFERENCES "public"."federation_evidence"("id") ON DELETE no action ON UPDATE no action,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_connectors" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"authority_id" text NOT NULL REFERENCES "public"."federation_authorities"("id") ON DELETE no action ON UPDATE no action,
	"service_id" text,
	"connector_type" text DEFAULT 'MANUAL_PORTAL' NOT NULL,
	"endpoint_ref" text,
	"auth_model" text,
	"credential_id" text,
	"govesb_status" text DEFAULT 'GOVESB_UNKNOWN' NOT NULL,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"is_mock" text DEFAULT 'FALSE' NOT NULL,
	"health" text DEFAULT 'UNKNOWN' NOT NULL,
	"availability_pct" text,
	"latency_ms" integer,
	"error_rate_pct" text,
	"auth_failures" integer DEFAULT 0 NOT NULL,
	"schema_failures" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_error_code" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action,
	"legal_entity_id" text REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action,
	"authority_id" text REFERENCES "public"."federation_authorities"("id") ON DELETE no action ON UPDATE no action,
	"service_id" text REFERENCES "public"."federation_services"("id") ON DELETE no action ON UPDATE no action,
	"dataset_id" text REFERENCES "public"."federation_datasets"("id") ON DELETE no action ON UPDATE no action,
	"subject_party_id" text NOT NULL,
	"purpose" text NOT NULL,
	"jurisdiction_code" text REFERENCES "public"."federation_jurisdictions"("code") ON DELETE no action ON UPDATE no action,
	"method" text,
	"status" text DEFAULT 'REQUESTED' NOT NULL,
	"granted_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"superseded_by_id" text,
	"evidence_id" text REFERENCES "public"."federation_evidence"("id") ON DELETE no action ON UPDATE no action,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_access_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action,
	"legal_entity_id" text NOT NULL REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action,
	"authority_id" text NOT NULL REFERENCES "public"."federation_authorities"("id") ON DELETE no action ON UPDATE no action,
	"service_id" text REFERENCES "public"."federation_services"("id") ON DELETE no action ON UPDATE no action,
	"purpose" text NOT NULL,
	"classification" text DEFAULT 'UNVERIFIED' NOT NULL,
	"legal_basis_id" text REFERENCES "public"."federation_legal_bases"("id") ON DELETE no action ON UPDATE no action,
	"consent_id" text REFERENCES "public"."federation_consents"("id") ON DELETE no action ON UPDATE no action,
	"agreement_id" text REFERENCES "public"."federation_agreements"("id") ON DELETE no action ON UPDATE no action,
	"credential_class" text DEFAULT 'SANDBOX' NOT NULL,
	"justification" text,
	"requested_by" text REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
	"approval_id" text,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"access_request_id" text NOT NULL REFERENCES "public"."federation_access_requests"("id") ON DELETE no action ON UPDATE no action,
	"approver_user_id" text NOT NULL REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
	"decision" text NOT NULL,
	"reason" text,
	"approval_reference" text,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"jurisdiction_code" text NOT NULL REFERENCES "public"."federation_jurisdictions"("code") ON DELETE no action ON UPDATE no action,
	"authority_id" text NOT NULL REFERENCES "public"."federation_authorities"("id") ON DELETE no action ON UPDATE no action,
	"service_id" text REFERENCES "public"."federation_services"("id") ON DELETE no action ON UPDATE no action,
	"level" text DEFAULT 'REGISTERED' NOT NULL,
	"verified_by" text NOT NULL,
	"endpoint_service" text,
	"test_performed" text,
	"result" text NOT NULL,
	"environment" text DEFAULT 'PRODUCTION' NOT NULL,
	"credential_class" text DEFAULT 'MOCK' NOT NULL,
	"schema_version" text,
	"evidence_id" text REFERENCES "public"."federation_evidence"("id") ON DELETE no action ON UPDATE no action,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revalidate_by" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "federation_incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action,
	"authority_id" text REFERENCES "public"."federation_authorities"("id") ON DELETE no action ON UPDATE no action,
	"service_id" text REFERENCES "public"."federation_services"("id") ON DELETE no action ON UPDATE no action,
	"connector_id" text REFERENCES "public"."federation_connectors"("id") ON DELETE no action ON UPDATE no action,
	"category" text NOT NULL,
	"severity" text DEFAULT 'LOW' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'DETECTED' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"contained_at" timestamp with time zone,
	"remediated_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"root_cause" text,
	"resolution" text,
	"affected_services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_id" text REFERENCES "public"."federation_evidence"("id") ON DELETE no action ON UPDATE no action,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_transitions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action,
	"code" text NOT NULL,
	"origin_jurisdiction" text NOT NULL REFERENCES "public"."federation_jurisdictions"("code") ON DELETE no action ON UPDATE no action,
	"destination_jurisdiction" text NOT NULL REFERENCES "public"."federation_jurisdictions"("code") ON DELETE no action ON UPDATE no action,
	"subject_type" text NOT NULL,
	"subject_ref" text NOT NULL,
	"organization_id" text REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action,
	"effective_at" timestamp with time zone,
	"legal_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"identity_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"data_transfer_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"residency_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tax_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"licensing_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"service_availability" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consent_required" text DEFAULT 'UNKNOWN' NOT NULL,
	"agreement_required" text DEFAULT 'UNKNOWN' NOT NULL,
	"evidence_id" text REFERENCES "public"."federation_evidence"("id") ON DELETE no action ON UPDATE no action,
	"approval_reference" text,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_capabilities" (
	"jurisdiction_code" text NOT NULL REFERENCES "public"."federation_jurisdictions"("code") ON DELETE no action ON UPDATE no action,
	"capability_code" text NOT NULL,
	"availability" text DEFAULT 'NOT_IMPLEMENTED' NOT NULL,
	"legal_basis_ref" text,
	"connector_ref" text,
	"data_residency" text,
	"cost_status" text DEFAULT 'UNKNOWN_COST' NOT NULL,
	"requires_human_approval" text DEFAULT 'UNKNOWN' NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	PRIMARY KEY ("jurisdiction_code", "capability_code")
);
--> statement-breakpoint
CREATE TABLE "federation_reconciliation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"jurisdiction_code" text NOT NULL REFERENCES "public"."federation_jurisdictions"("code") ON DELETE no action ON UPDATE no action,
	"source_name" text NOT NULL,
	"source_url" text,
	"source_version" text,
	"executed_by" text NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"totals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'COMPLETED' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "federation_reconciliation_results" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL REFERENCES "public"."federation_reconciliation_runs"("id") ON DELETE no action ON UPDATE no action,
	"candidate_code" text NOT NULL,
	"candidate_name" text NOT NULL,
	"state" text NOT NULL,
	"matched_authority_id" text REFERENCES "public"."federation_authorities"("id") ON DELETE no action ON UPDATE no action,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"resolution" text
);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Circular foreign keys (added after both sides exist).
-- ---------------------------------------------------------------------------
ALTER TABLE "federation_services" ADD CONSTRAINT "federation_services_connector_id_federation_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."federation_connectors"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "federation_connectors" ADD CONSTRAINT "federation_connectors_service_id_federation_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."federation_services"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "federation_connectors" ADD CONSTRAINT "federation_connectors_credential_id_federation_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."federation_credentials"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "federation_credentials" ADD CONSTRAINT "federation_credentials_connector_id_federation_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."federation_connectors"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "federation_schemas" ADD CONSTRAINT "federation_schemas_service_id_federation_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."federation_services"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Uniqueness (identity prevention: duplicate authority/service/connector/
-- jurisdiction records are unrepresentable).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "federation_domains_uidx" ON "federation_domains" USING btree ("jurisdiction_code","code");
--> statement-breakpoint
CREATE UNIQUE INDEX "federation_legal_bases_uidx" ON "federation_legal_bases" USING btree ("jurisdiction_code","code");
--> statement-breakpoint
CREATE UNIQUE INDEX "federation_authorities_uidx" ON "federation_authorities" USING btree ("jurisdiction_code","code");
--> statement-breakpoint
CREATE UNIQUE INDEX "federation_authorities_legacy_uidx" ON "federation_authorities" USING btree ("legacy_agency_code");
--> statement-breakpoint
CREATE UNIQUE INDEX "federation_agreements_uidx" ON "federation_agreements" USING btree ("tenant_id","code");
--> statement-breakpoint
CREATE UNIQUE INDEX "federation_schemas_uidx" ON "federation_schemas" USING btree ("code","version");
--> statement-breakpoint
CREATE UNIQUE INDEX "federation_services_uidx" ON "federation_services" USING btree ("authority_id","code");
--> statement-breakpoint
CREATE UNIQUE INDEX "federation_datasets_uidx" ON "federation_datasets" USING btree ("authority_id","code");
--> statement-breakpoint
CREATE UNIQUE INDEX "federation_credentials_uidx" ON "federation_credentials" USING btree ("code");
--> statement-breakpoint
CREATE UNIQUE INDEX "federation_connectors_uidx" ON "federation_connectors" USING btree ("code");
--> statement-breakpoint
CREATE UNIQUE INDEX "federation_approvals_uidx" ON "federation_approvals" USING btree ("access_request_id","approver_user_id","decision");
--> statement-breakpoint
CREATE UNIQUE INDEX "federation_transitions_uidx" ON "federation_transitions" USING btree ("tenant_id","code");
--> statement-breakpoint
CREATE UNIQUE INDEX "federation_capabilities_uidx" ON "federation_capabilities" USING btree ("jurisdiction_code","capability_code");
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Lookup indexes.
-- ---------------------------------------------------------------------------
CREATE INDEX "federation_domains_jur_idx" ON "federation_domains" USING btree ("jurisdiction_code");
--> statement-breakpoint
CREATE INDEX "federation_evidence_subject_idx" ON "federation_evidence" USING btree ("subject_type","subject_id");
--> statement-breakpoint
CREATE INDEX "federation_evidence_status_idx" ON "federation_evidence" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "federation_legal_bases_jur_idx" ON "federation_legal_bases" USING btree ("jurisdiction_code");
--> statement-breakpoint
CREATE INDEX "federation_authorities_jur_idx" ON "federation_authorities" USING btree ("jurisdiction_code");
--> statement-breakpoint
CREATE INDEX "federation_authorities_domain_idx" ON "federation_authorities" USING btree ("jurisdiction_code","domain_code");
--> statement-breakpoint
CREATE INDEX "federation_authorities_type_idx" ON "federation_authorities" USING btree ("authority_type");
--> statement-breakpoint
CREATE INDEX "federation_authorities_lifecycle_idx" ON "federation_authorities" USING btree ("lifecycle_status");
--> statement-breakpoint
CREATE INDEX "federation_authorities_recon_idx" ON "federation_authorities" USING btree ("jurisdiction_code","reconciliation_state");
--> statement-breakpoint
CREATE INDEX "federation_agreements_tenant_idx" ON "federation_agreements" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "federation_agreements_authority_idx" ON "federation_agreements" USING btree ("authority_id");
--> statement-breakpoint
CREATE INDEX "federation_agreements_status_idx" ON "federation_agreements" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "federation_schemas_authority_idx" ON "federation_schemas" USING btree ("authority_id");
--> statement-breakpoint
CREATE INDEX "federation_schemas_status_idx" ON "federation_schemas" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "federation_services_authority_idx" ON "federation_services" USING btree ("authority_id");
--> statement-breakpoint
CREATE INDEX "federation_services_cost_idx" ON "federation_services" USING btree ("access_cost_status");
--> statement-breakpoint
CREATE INDEX "federation_datasets_authority_idx" ON "federation_datasets" USING btree ("authority_id");
--> statement-breakpoint
CREATE INDEX "federation_datasets_classification_idx" ON "federation_datasets" USING btree ("classification");
--> statement-breakpoint
CREATE INDEX "federation_credentials_authority_idx" ON "federation_credentials" USING btree ("authority_id");
--> statement-breakpoint
CREATE INDEX "federation_credentials_status_idx" ON "federation_credentials" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "federation_connectors_authority_idx" ON "federation_connectors" USING btree ("authority_id");
--> statement-breakpoint
CREATE INDEX "federation_connectors_status_idx" ON "federation_connectors" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "federation_consents_tenant_idx" ON "federation_consents" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "federation_consents_subject_idx" ON "federation_consents" USING btree ("subject_party_id");
--> statement-breakpoint
CREATE INDEX "federation_consents_status_idx" ON "federation_consents" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "federation_access_requests_tenant_idx" ON "federation_access_requests" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "federation_access_requests_authority_idx" ON "federation_access_requests" USING btree ("authority_id");
--> statement-breakpoint
CREATE INDEX "federation_access_requests_status_idx" ON "federation_access_requests" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "federation_approvals_request_idx" ON "federation_approvals" USING btree ("access_request_id");
--> statement-breakpoint
CREATE INDEX "federation_verifications_authority_idx" ON "federation_verifications" USING btree ("authority_id");
--> statement-breakpoint
CREATE INDEX "federation_verifications_level_idx" ON "federation_verifications" USING btree ("level");
--> statement-breakpoint
CREATE INDEX "federation_incidents_status_idx" ON "federation_incidents" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "federation_incidents_authority_idx" ON "federation_incidents" USING btree ("authority_id");
--> statement-breakpoint
CREATE INDEX "federation_incidents_category_idx" ON "federation_incidents" USING btree ("category");
--> statement-breakpoint
CREATE INDEX "federation_transitions_tenant_idx" ON "federation_transitions" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "federation_transitions_route_idx" ON "federation_transitions" USING btree ("origin_jurisdiction","destination_jurisdiction");
--> statement-breakpoint
CREATE INDEX "federation_reconciliation_runs_jur_idx" ON "federation_reconciliation_runs" USING btree ("jurisdiction_code","executed_at");
--> statement-breakpoint
CREATE INDEX "federation_reconciliation_results_run_idx" ON "federation_reconciliation_results" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX "federation_reconciliation_results_state_idx" ON "federation_reconciliation_results" USING btree ("state");
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Value integrity — every status is a closed catalogue (0036/0028 pattern).
-- ---------------------------------------------------------------------------
ALTER TABLE "federation_jurisdictions" ADD CONSTRAINT "federation_jurisdictions_kind_check"
  CHECK ("kind" IN ('COUNTRY','REGIONAL_BLOC','INTERNATIONAL','PRIVATE_INSTITUTION'));
--> statement-breakpoint
ALTER TABLE "federation_jurisdictions" ADD CONSTRAINT "federation_jurisdictions_status_check"
  CHECK ("status" IN ('PROPOSED','ACTIVE','INACTIVE'));
--> statement-breakpoint
ALTER TABLE "federation_evidence" ADD CONSTRAINT "federation_evidence_type_check"
  CHECK ("type" IN ('OFFICIAL_WEBSITE','OFFICIAL_DIRECTORY','OFFICIAL_DOCUMENTATION','OFFICIAL_API_SPEC','OFFICIAL_AGREEMENT','OFFICIAL_CERTIFICATE','SECURITY_ASSESSMENT','SANDBOX_EVIDENCE','PRODUCTION_TEST','SERVICE_RESPONSE','SIGNED_AUTHORITY_CONFIRMATION','SEARCH_INDEX_SNAPSHOT'));
--> statement-breakpoint
ALTER TABLE "federation_evidence" ADD CONSTRAINT "federation_evidence_subject_check"
  CHECK ("subject_type" IN ('AUTHORITY','SERVICE','DATASET','SCHEMA','CONNECTOR','CREDENTIAL','AGREEMENT','LEGAL_BASIS','COST','GOVESB','JURISDICTION'));
--> statement-breakpoint
ALTER TABLE "federation_evidence" ADD CONSTRAINT "federation_evidence_status_check"
  CHECK ("status" IN ('VALID','EXPIRED','INVALIDATED'));
--> statement-breakpoint
ALTER TABLE "federation_legal_bases" ADD CONSTRAINT "federation_legal_bases_type_check"
  CHECK ("basis_type" IN ('STATUTORY_AUTHORITY','CONTRACT','CONSENT','LEGITIMATE_INTEREST','REGULATORY_REQUIREMENT','PUBLIC_INTEREST','VITAL_INTERESTS','JURISDICTION_SPECIFIC'));
--> statement-breakpoint
ALTER TABLE "federation_legal_bases" ADD CONSTRAINT "federation_legal_bases_status_check"
  CHECK ("status" IN ('DRAFT','CONFIRMED','EXPIRED','REVOKED'));
--> statement-breakpoint
ALTER TABLE "federation_agreements" ADD CONSTRAINT "federation_agreements_type_check"
  CHECK ("type" IN ('MOU','DATA_SHARING_AGREEMENT','API_AGREEMENT','SERVICE_AGREEMENT','RESEARCH_AGREEMENT','CROSS_BORDER_AGREEMENT','GOVERNMENT_INTEGRATION_AGREEMENT'));
--> statement-breakpoint
ALTER TABLE "federation_agreements" ADD CONSTRAINT "federation_agreements_status_check"
  CHECK ("status" IN ('PROPOSED','NEGOTIATING','ACTIVE','EXPIRED','TERMINATED','SUPERSEDED'));
--> statement-breakpoint
ALTER TABLE "federation_agreements" ADD CONSTRAINT "federation_agreements_renewal_check"
  CHECK ("renewal_required" IN ('TRUE','FALSE','UNKNOWN'));
--> statement-breakpoint
ALTER TABLE "federation_schemas" ADD CONSTRAINT "federation_schemas_compat_check"
  CHECK ("compatibility" IN ('ADDITIVE','BREAKING','COMPATIBLE'));
--> statement-breakpoint
ALTER TABLE "federation_schemas" ADD CONSTRAINT "federation_schemas_status_check"
  CHECK ("status" IN ('PROPOSED','ACTIVE','DEPRECATED','RETIRED'));
--> statement-breakpoint
ALTER TABLE "federation_credentials" ADD CONSTRAINT "federation_credentials_class_check"
  CHECK ("credential_class" IN ('SANDBOX','PRODUCTION','MOCK'));
--> statement-breakpoint
ALTER TABLE "federation_credentials" ADD CONSTRAINT "federation_credentials_status_check"
  CHECK ("status" IN ('NOT_ISSUED','PENDING','ISSUED','ROTATION_REQUIRED','EXPIRED','REVOKED','REFUSED'));
--> statement-breakpoint
ALTER TABLE "federation_credentials" ADD CONSTRAINT "federation_credentials_rotation_check"
  CHECK ("rotation_required" IN ('TRUE','FALSE','UNKNOWN'));
--> statement-breakpoint
ALTER TABLE "federation_connectors" ADD CONSTRAINT "federation_connectors_type_check"
  CHECK ("connector_type" IN ('REST_JSON','SOAP_XML','GOVESB','SFTP','WEBHOOK','MESSAGE_QUEUE','BATCH','DB_MEDIATED','OAUTH_OIDC','MTLS','API_KEY','DIGITAL_CERTIFICATE','SIGNED_DOCUMENT','MANUAL_PORTAL'));
--> statement-breakpoint
ALTER TABLE "federation_connectors" ADD CONSTRAINT "federation_connectors_status_check"
  CHECK ("status" IN ('PROPOSED','PROVISIONED','ENABLED','DISABLED','SUSPENDED','REVOKED'));
--> statement-breakpoint
ALTER TABLE "federation_connectors" ADD CONSTRAINT "federation_connectors_health_check"
  CHECK ("health" IN ('HEALTHY','DEGRADED','DOWN','SUSPENDED','REVOKED','UNKNOWN'));
--> statement-breakpoint
ALTER TABLE "federation_connectors" ADD CONSTRAINT "federation_connectors_govesb_check"
  CHECK ("govesb_status" IN ('GOVESB_UNKNOWN','GOVESB_NOT_REQUIRED','GOVESB_REQUIRED','GOVESB_ELIGIBLE','GOVESB_REGISTERED','GOVESB_SANDBOX','GOVESB_TESTED','GOVESB_PRODUCTION_APPROVED','GOVESB_LIVE','GOVESB_LIVE_VERIFIED'));
--> statement-breakpoint
ALTER TABLE "federation_connectors" ADD CONSTRAINT "federation_connectors_mock_check"
  CHECK ("is_mock" IN ('TRUE','FALSE'));
--> statement-breakpoint
ALTER TABLE "federation_consents" ADD CONSTRAINT "federation_consents_status_check"
  CHECK ("status" IN ('REQUESTED','GRANTED','DENIED','WITHDRAWN','EXPIRED','SUPERSEDED'));
--> statement-breakpoint
-- GRANTED/WITHDRAWN are recorded facts: they need the timestamp.
ALTER TABLE "federation_consents" ADD CONSTRAINT "federation_consents_grant_ts"
  CHECK ("status" <> 'GRANTED' OR "granted_at" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "federation_consents" ADD CONSTRAINT "federation_consents_withdraw_ts"
  CHECK ("status" <> 'WITHDRAWN' OR "withdrawn_at" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "federation_access_requests" ADD CONSTRAINT "federation_access_requests_status_check"
  CHECK ("status" IN ('DRAFT','SUBMITTED','IN_REVIEW','APPROVED','DENIED','REVOKED'));
--> statement-breakpoint
ALTER TABLE "federation_access_requests" ADD CONSTRAINT "federation_access_requests_class_check"
  CHECK ("classification" IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','PROTECTED','HIGHLY_RESTRICTED','UNVERIFIED'));
--> statement-breakpoint
ALTER TABLE "federation_access_requests" ADD CONSTRAINT "federation_access_requests_cred_check"
  CHECK ("credential_class" IN ('SANDBOX','PRODUCTION','MOCK'));
--> statement-breakpoint
-- FAIL-CLOSED (§64): approval is a separate, distinct actor act — never
-- self-approval recorded as an author's own status flip.
ALTER TABLE "federation_access_requests" ADD CONSTRAINT "federation_access_requests_approval_check"
  CHECK ("status" <> 'APPROVED' OR "approval_id" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "federation_approvals" ADD CONSTRAINT "federation_approvals_decision_check"
  CHECK ("decision" IN ('APPROVED','DENIED'));
--> statement-breakpoint
ALTER TABLE "federation_verifications" ADD CONSTRAINT "federation_verifications_level_check"
  CHECK ("level" IN ('REGISTERED','VERIFIED','SANDBOX','LIVE','LIVE_VERIFIED'));
--> statement-breakpoint
ALTER TABLE "federation_verifications" ADD CONSTRAINT "federation_verifications_env_check"
  CHECK ("environment" IN ('SANDBOX','PRODUCTION'));
--> statement-breakpoint
ALTER TABLE "federation_verifications" ADD CONSTRAINT "federation_verifications_cred_check"
  CHECK ("credential_class" IN ('SANDBOX','PRODUCTION','MOCK'));
--> statement-breakpoint
-- FAIL-CLOSED (§9): no level up without a recorded evidence row.
ALTER TABLE "federation_verifications" ADD CONSTRAINT "federation_verifications_evidence_gate"
  CHECK ("level" NOT IN ('VERIFIED','SANDBOX','LIVE','LIVE_VERIFIED') OR "evidence_id" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "federation_incidents" ADD CONSTRAINT "federation_incidents_category_check"
  CHECK ("category" IN ('UNAUTHORIZED_ACCESS','CREDENTIAL_COMPROMISE','CERTIFICATE_COMPROMISE','DATA_LEAK','SCHEMA_CORRUPTION','INCORRECT_MAPPING','AUTHORITY_OUTAGE','GOVESB_OUTAGE','REPEATED_AUTH_FAILURE','POLICY_VIOLATION','AGREEMENT_EXPIRY','LEGAL_CHANGE','DATA_QUALITY_FAILURE','CONNECTOR_DEGRADATION'));
--> statement-breakpoint
ALTER TABLE "federation_incidents" ADD CONSTRAINT "federation_incidents_severity_check"
  CHECK ("severity" IN ('CRITICAL','HIGH','MEDIUM','LOW'));
--> statement-breakpoint
ALTER TABLE "federation_incidents" ADD CONSTRAINT "federation_incidents_status_check"
  CHECK ("status" IN ('DETECTED','TRIAGED','CONTAINED','INVESTIGATING','REMEDIATED','VERIFIED','CLOSED'));
--> statement-breakpoint
ALTER TABLE "federation_incidents" ADD CONSTRAINT "federation_incidents_closed_ts"
  CHECK ("status" <> 'CLOSED' OR "closed_at" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "federation_transitions" ADD CONSTRAINT "federation_transitions_subject_check"
  CHECK ("subject_type" IN ('PERSON','ORGANIZATION','TENANT','ENTITY','DATA'));
--> statement-breakpoint
ALTER TABLE "federation_transitions" ADD CONSTRAINT "federation_transitions_status_check"
  CHECK ("status" IN ('PROPOSED','IN_PROGRESS','COMPLETED','BLOCKED','CANCELLED'));
--> statement-breakpoint
ALTER TABLE "federation_transitions" ADD CONSTRAINT "federation_transitions_flags_check"
  CHECK ("consent_required" IN ('TRUE','FALSE','UNKNOWN') AND "agreement_required" IN ('TRUE','FALSE','UNKNOWN'));
--> statement-breakpoint
ALTER TABLE "federation_capabilities" ADD CONSTRAINT "federation_capabilities_avail_check"
  CHECK ("availability" IN ('AVAILABLE','NOT_AVAILABLE','REQUIRES_AUTHORIZATION','REQUIRES_CONSENT','REQUIRES_AGREEMENT','REQUIRES_LOCAL_ENTITY','REQUIRES_GOVERNMENT_CONNECTION','REQUIRES_HUMAN_APPROVAL','NOT_IMPLEMENTED','NOT_CERTIFIED'));
--> statement-breakpoint
ALTER TABLE "federation_capabilities" ADD CONSTRAINT "federation_capabilities_approval_check"
  CHECK ("requires_human_approval" IN ('TRUE','FALSE','UNKNOWN'));
--> statement-breakpoint
ALTER TABLE "federation_reconciliation_runs" ADD CONSTRAINT "federation_reconciliation_runs_status_check"
  CHECK ("status" IN ('COMPLETED','PARTIAL','FAILED'));
--> statement-breakpoint
ALTER TABLE "federation_reconciliation_results" ADD CONSTRAINT "federation_reconciliation_results_state_check"
  CHECK ("state" IN ('MATCH','NEW','MISSING','DUPLICATE','RENAMED','MERGED','DISSOLVED','UNCERTAIN','MANUAL_REVIEW','PENDING_RECONCILIATION'));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Authority catalogue + FAIL-CLOSED invariants (program §6–§10).
-- ---------------------------------------------------------------------------
ALTER TABLE "federation_authorities" ADD CONSTRAINT "federation_authorities_type_check"
  CHECK ("authority_type" IN ('MINISTRY','DEPARTMENT','AGENCY','COMMISSION','BOARD','COUNCIL','FUND','PUBLIC_CORPORATION','INSTITUTION','REGULATOR','JUDICIARY','PARLIAMENT','REGIONAL_GOVERNMENT','LOCAL_GOVERNMENT','NGO_REGULATOR','INTL_AUTHORITY','OTHER'));
--> statement-breakpoint
ALTER TABLE "federation_authorities" ADD CONSTRAINT "federation_authorities_api_check"
  CHECK ("api_status" IN ('UNVERIFIED','PUBLIC','AUTHORIZED','PAID','NONE_PUBLISHED','UNKNOWN'));
--> statement-breakpoint
ALTER TABLE "federation_authorities" ADD CONSTRAINT "federation_authorities_govesb_check"
  CHECK ("govesb_status" IN ('GOVESB_UNKNOWN','GOVESB_NOT_REQUIRED','GOVESB_REQUIRED','GOVESB_ELIGIBLE','GOVESB_REGISTERED','GOVESB_SANDBOX','GOVESB_TESTED','GOVESB_PRODUCTION_APPROVED','GOVESB_LIVE','GOVESB_LIVE_VERIFIED'));
--> statement-breakpoint
ALTER TABLE "federation_authorities" ADD CONSTRAINT "federation_authorities_verification_check"
  CHECK ("verification_status" IN ('REGISTERED','VERIFIED','SANDBOX','LIVE','LIVE_VERIFIED'));
--> statement-breakpoint
ALTER TABLE "federation_authorities" ADD CONSTRAINT "federation_authorities_cost_check"
  CHECK ("access_cost_status" IN ('PUBLIC_INFORMATION','PUBLIC_SERVICE','PUBLIC_API','AUTHORIZED_API','GOVESB','AGREEMENT_REQUIRED','PAID_ACCESS','UNKNOWN_COST','NO_PUBLIC_API','MANUAL_VERIFICATION','ACCESS_PENDING','NOT_CONNECTED','FREE_CONFIRMED'));
--> statement-breakpoint
ALTER TABLE "federation_authorities" ADD CONSTRAINT "federation_authorities_record_check"
  CHECK ("record_status" IN ('REGISTERED','VERIFIED','AUTHORITY_CONFIRMED','LIVE','LIVE_VERIFIED','UNCERTAIN','INACTIVE','RETIRED'));
--> statement-breakpoint
ALTER TABLE "federation_authorities" ADD CONSTRAINT "federation_authorities_lifecycle_check"
  CHECK ("lifecycle_status" IN ('DISCOVERED','CLASSIFIED','AUTHORITY_CONFIRMED','LEGAL_BASIS_CONFIRMED','AGREEMENT_REQUIRED','AGREEMENT_CONFIRMED','ACCESS_REQUESTED','CREDENTIALS_PROVISIONED','SANDBOX','SECURITY_TEST','INTEROPERABILITY_TEST','DATA_VALIDATION','AUTHORITY_ACCEPTANCE','PRODUCTION_APPROVAL','LIVE','LIVE_VERIFIED','MONITORED','SUSPENDED','REVOKED','EXPIRED','DEGRADED','FAILED_VERIFICATION'));
--> statement-breakpoint
ALTER TABLE "federation_authorities" ADD CONSTRAINT "federation_authorities_recon_check"
  CHECK ("reconciliation_state" IN ('MATCH','NEW','MISSING','DUPLICATE','RENAMED','MERGED','DISSOLVED','UNCERTAIN','MANUAL_REVIEW','PENDING_RECONCILIATION'));
--> statement-breakpoint
ALTER TABLE "federation_authorities" ADD CONSTRAINT "federation_authorities_flags_check"
  CHECK ("service_provider" IN ('TRUE','FALSE','UNKNOWN')
    AND "service_consumer" IN ('TRUE','FALSE','UNKNOWN')
    AND "consent_required" IN ('TRUE','FALSE','UNKNOWN')
    AND "agreement_required" IN ('TRUE','FALSE','UNKNOWN'));
--> statement-breakpoint
ALTER TABLE "federation_authorities" ADD CONSTRAINT "federation_authorities_scope_check"
  CHECK ("jurisdiction_scope" IS NULL OR "jurisdiction_scope" IN ('NATIONAL','REGIONAL','LOCAL','INTERNATIONAL','UNION'));
--> statement-breakpoint
-- FAIL-CLOSED (§86): LIVE-family lifecycle states require production evidence,
-- a named approver and an approval reference. A discovered or public fact can
-- never become LIVE by UPDATE alone.
ALTER TABLE "federation_authorities" ADD CONSTRAINT "federation_authorities_production_gate"
  CHECK ("lifecycle_status" NOT IN ('PRODUCTION_APPROVAL','LIVE','LIVE_VERIFIED')
    OR ("production_evidence_id" IS NOT NULL AND "approved_by" IS NOT NULL AND "approval_reference" IS NOT NULL));
--> statement-breakpoint
-- FAIL-CLOSED (§10): FREE_CONFIRMED only with authoritative cost evidence.
ALTER TABLE "federation_authorities" ADD CONSTRAINT "federation_authorities_free_gate"
  CHECK ("access_cost_status" <> 'FREE_CONFIRMED' OR "cost_evidence_id" IS NOT NULL);
--> statement-breakpoint
-- FAIL-CLOSED (§12): GOVESB_LIVE* only with production evidence.
ALTER TABLE "federation_authorities" ADD CONSTRAINT "federation_authorities_govesb_gate"
  CHECK ("govesb_status" NOT IN ('GOVESB_LIVE','GOVESB_LIVE_VERIFIED') OR "production_evidence_id" IS NOT NULL);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Service catalogue + fail-closed invariants (§11, §50).
-- ---------------------------------------------------------------------------
ALTER TABLE "federation_services" ADD CONSTRAINT "federation_services_classification_check"
  CHECK ("data_classification" IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','PROTECTED','HIGHLY_RESTRICTED','UNVERIFIED'));
--> statement-breakpoint
ALTER TABLE "federation_services" ADD CONSTRAINT "federation_services_cost_check"
  CHECK ("access_cost_status" IN ('PUBLIC_INFORMATION','PUBLIC_SERVICE','PUBLIC_API','AUTHORIZED_API','GOVESB','AGREEMENT_REQUIRED','PAID_ACCESS','UNKNOWN_COST','NO_PUBLIC_API','MANUAL_VERIFICATION','ACCESS_PENDING','NOT_CONNECTED','FREE_CONFIRMED'));
--> statement-breakpoint
ALTER TABLE "federation_services" ADD CONSTRAINT "federation_services_api_check"
  CHECK ("api_status" IN ('UNVERIFIED','PUBLIC','AUTHORIZED','PAID','NONE_PUBLISHED','UNKNOWN'));
--> statement-breakpoint
ALTER TABLE "federation_services" ADD CONSTRAINT "federation_services_govesb_check"
  CHECK ("govesb_status" IN ('GOVESB_UNKNOWN','GOVESB_NOT_REQUIRED','GOVESB_REQUIRED','GOVESB_ELIGIBLE','GOVESB_REGISTERED','GOVESB_SANDBOX','GOVESB_TESTED','GOVESB_PRODUCTION_APPROVED','GOVESB_LIVE','GOVESB_LIVE_VERIFIED'));
--> statement-breakpoint
ALTER TABLE "federation_services" ADD CONSTRAINT "federation_services_verification_check"
  CHECK ("verification_status" IN ('REGISTERED','VERIFIED','SANDBOX','LIVE','LIVE_VERIFIED'));
--> statement-breakpoint
ALTER TABLE "federation_services" ADD CONSTRAINT "federation_services_access_level_check"
  CHECK ("access_level" IN ('NOT_CONNECTED','REQUESTED','GRANTED','REVOKED','EXPIRED'));
--> statement-breakpoint
ALTER TABLE "federation_services" ADD CONSTRAINT "federation_services_flags_check"
  CHECK ("consent_required" IN ('TRUE','FALSE','UNKNOWN')
    AND "agreement_required" IN ('TRUE','FALSE','UNKNOWN')
    AND "credential_required" IN ('TRUE','FALSE','UNKNOWN'));
--> statement-breakpoint
ALTER TABLE "federation_services" ADD CONSTRAINT "federation_services_free_gate"
  CHECK ("access_cost_status" <> 'FREE_CONFIRMED' OR "cost_evidence_id" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "federation_services" ADD CONSTRAINT "federation_services_production_gate"
  CHECK ("verification_status" NOT IN ('LIVE','LIVE_VERIFIED')
    OR ("production_evidence_id" IS NOT NULL AND "approved_by" IS NOT NULL AND "approval_reference" IS NOT NULL));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Datasets / incidents / capabilities invariants.
-- ---------------------------------------------------------------------------
ALTER TABLE "federation_datasets" ADD CONSTRAINT "federation_datasets_classification_check"
  CHECK ("classification" IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','PROTECTED','HIGHLY_RESTRICTED','UNVERIFIED'));
--> statement-breakpoint
ALTER TABLE "federation_datasets" ADD CONSTRAINT "federation_datasets_cost_check"
  CHECK ("cost_status" IN ('PUBLIC_INFORMATION','PUBLIC_SERVICE','PUBLIC_API','AUTHORIZED_API','GOVESB','AGREEMENT_REQUIRED','PAID_ACCESS','UNKNOWN_COST','NO_PUBLIC_API','MANUAL_VERIFICATION','ACCESS_PENDING','NOT_CONNECTED','FREE_CONFIRMED'));
--> statement-breakpoint
ALTER TABLE "federation_datasets" ADD CONSTRAINT "federation_datasets_verification_check"
  CHECK ("verification_status" IN ('REGISTERED','VERIFIED','SANDBOX','LIVE','LIVE_VERIFIED'));
--> statement-breakpoint
ALTER TABLE "federation_capabilities" ADD CONSTRAINT "federation_capabilities_cost_check"
  CHECK ("cost_status" IN ('PUBLIC_INFORMATION','PUBLIC_SERVICE','PUBLIC_API','AUTHORIZED_API','GOVESB','AGREEMENT_REQUIRED','PAID_ACCESS','UNKNOWN_COST','NO_PUBLIC_API','MANUAL_VERIFICATION','ACCESS_PENDING','NOT_CONNECTED','FREE_CONFIRMED'));
--> statement-breakpoint
-- §49: a connector may only be ENABLED with credentials, as a recorded mock,
-- or over a public/manual channel. No silent "live" connector.
ALTER TABLE "federation_connectors" ADD CONSTRAINT "federation_connectors_enabled_gate"
  CHECK ("status" <> 'ENABLED'
    OR "credential_id" IS NOT NULL
    OR "is_mock" = 'TRUE'
    OR "connector_type" IN ('MANUAL_PORTAL','REST_JSON'));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row Level Security — registry = global reference data, runtime SELECT-only;
-- operational = tenant (+ entity) isolation. 0036/0048 pattern.
-- ---------------------------------------------------------------------------
ALTER TABLE "federation_jurisdictions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_jurisdictions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_jurisdictions_read_only" ON "federation_jurisdictions";
CREATE POLICY "federation_jurisdictions_read_only" ON "federation_jurisdictions" FOR SELECT USING (true);
--> statement-breakpoint
ALTER TABLE "federation_domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_domains" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_domains_read_only" ON "federation_domains";
CREATE POLICY "federation_domains_read_only" ON "federation_domains" FOR SELECT USING (true);
--> statement-breakpoint
ALTER TABLE "federation_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_evidence" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_evidence_read_only" ON "federation_evidence";
CREATE POLICY "federation_evidence_read_only" ON "federation_evidence" FOR SELECT USING (true);
--> statement-breakpoint
ALTER TABLE "federation_legal_bases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_legal_bases" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_legal_bases_read_only" ON "federation_legal_bases";
CREATE POLICY "federation_legal_bases_read_only" ON "federation_legal_bases" FOR SELECT USING (true);
--> statement-breakpoint
ALTER TABLE "federation_authorities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_authorities" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_authorities_read_only" ON "federation_authorities";
CREATE POLICY "federation_authorities_read_only" ON "federation_authorities" FOR SELECT USING (true);
--> statement-breakpoint
ALTER TABLE "federation_services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_services" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_services_read_only" ON "federation_services";
CREATE POLICY "federation_services_read_only" ON "federation_services" FOR SELECT USING (true);
--> statement-breakpoint
ALTER TABLE "federation_datasets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_datasets" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_datasets_read_only" ON "federation_datasets";
CREATE POLICY "federation_datasets_read_only" ON "federation_datasets" FOR SELECT USING (true);
--> statement-breakpoint
ALTER TABLE "federation_schemas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_schemas" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_schemas_read_only" ON "federation_schemas";
CREATE POLICY "federation_schemas_read_only" ON "federation_schemas" FOR SELECT USING (true);
--> statement-breakpoint
ALTER TABLE "federation_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_credentials" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_credentials_read_only" ON "federation_credentials";
CREATE POLICY "federation_credentials_read_only" ON "federation_credentials" FOR SELECT USING (true);
--> statement-breakpoint
ALTER TABLE "federation_connectors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_connectors" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_connectors_read_only" ON "federation_connectors";
CREATE POLICY "federation_connectors_read_only" ON "federation_connectors" FOR SELECT USING (true);
--> statement-breakpoint
ALTER TABLE "federation_verifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_verifications" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_verifications_read_only" ON "federation_verifications";
CREATE POLICY "federation_verifications_read_only" ON "federation_verifications" FOR SELECT USING (true);
--> statement-breakpoint
ALTER TABLE "federation_capabilities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_capabilities" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_capabilities_read_only" ON "federation_capabilities";
CREATE POLICY "federation_capabilities_read_only" ON "federation_capabilities" FOR SELECT USING (true);
--> statement-breakpoint
ALTER TABLE "federation_reconciliation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_reconciliation_runs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_reconciliation_runs_read_only" ON "federation_reconciliation_runs";
CREATE POLICY "federation_reconciliation_runs_read_only" ON "federation_reconciliation_runs" FOR SELECT USING (true);
--> statement-breakpoint
ALTER TABLE "federation_reconciliation_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_reconciliation_results" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_reconciliation_results_read_only" ON "federation_reconciliation_results";
CREATE POLICY "federation_reconciliation_results_read_only" ON "federation_reconciliation_results" FOR SELECT USING (true);
--> statement-breakpoint
-- Incidents: global rows (tenant NULL) visible to every scoped context;
-- tenant rows isolated. INSERT/UPDATE allowed (safe self-repair opens
-- incidents, §75); no DELETE — incident history is governance evidence.
ALTER TABLE "federation_incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_incidents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_incidents_scope" ON "federation_incidents";
CREATE POLICY "federation_incidents_scope" ON "federation_incidents" FOR ALL
  USING (
    "tenant_id" IS NULL
    OR "tenant_id" = ANY(beyu_tenant_ids())
    OR beyu_global_scope()
  )
  WITH CHECK (
    "tenant_id" IS NULL
    OR "tenant_id" = ANY(beyu_tenant_ids())
    OR beyu_global_scope()
  );
--> statement-breakpoint
-- Agreements: tenant + entity isolation on every command.
ALTER TABLE "federation_agreements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_agreements" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_agreements_tenant_scope" ON "federation_agreements";
CREATE POLICY "federation_agreements_tenant_scope" ON "federation_agreements" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  );
--> statement-breakpoint
-- Consents: tenant + entity isolation (entity may be null for tenant-level
-- consent subjects).
ALTER TABLE "federation_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_consents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_consents_tenant_scope" ON "federation_consents";
CREATE POLICY "federation_consents_tenant_scope" ON "federation_consents" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND (
      "legal_entity_id" IS NULL
      OR EXISTS (
        SELECT 1 FROM "legal_entities" le
        WHERE le."id" = "federation_consents"."legal_entity_id"
          AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
      )
    )
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND (
      "legal_entity_id" IS NULL
      OR EXISTS (
        SELECT 1 FROM "legal_entities" le
        WHERE le."id" = "federation_consents"."legal_entity_id"
          AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
      )
    )
  );
--> statement-breakpoint
-- Access requests: tenant + entity isolation (0036 submissions pattern).
ALTER TABLE "federation_access_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_access_requests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_access_requests_tenant_scope" ON "federation_access_requests";
CREATE POLICY "federation_access_requests_tenant_scope" ON "federation_access_requests" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND EXISTS (
      SELECT 1 FROM "legal_entities" le
      WHERE le."id" = "federation_access_requests"."legal_entity_id"
        AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND EXISTS (
      SELECT 1 FROM "legal_entities" le
      WHERE le."id" = "federation_access_requests"."legal_entity_id"
        AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  );
--> statement-breakpoint
-- Approvals: visible exactly where their access request is visible.
ALTER TABLE "federation_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_approvals" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_approvals_tenant_scope" ON "federation_approvals";
CREATE POLICY "federation_approvals_tenant_scope" ON "federation_approvals" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "federation_access_requests" ar
      WHERE ar."id" = "federation_approvals"."access_request_id"
        AND (ar."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "federation_access_requests" ar
      WHERE ar."id" = "federation_approvals"."access_request_id"
        AND (ar."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  );
--> statement-breakpoint
-- Transitions: tenant + optional entity isolation.
ALTER TABLE "federation_transitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "federation_transitions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federation_transitions_tenant_scope" ON "federation_transitions";
CREATE POLICY "federation_transitions_tenant_scope" ON "federation_transitions" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND (
      "organization_id" IS NULL
      OR EXISTS (
        SELECT 1 FROM "legal_entities" le
        WHERE le."id" = "federation_transitions"."organization_id"
          AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
      )
    )
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND (
      "organization_id" IS NULL
      OR EXISTS (
        SELECT 1 FROM "legal_entities" le
        WHERE le."id" = "federation_transitions"."organization_id"
          AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
      )
    )
  );
--> statement-breakpoint
-- Restrictive write bans on registry tables: even if a future role is
-- mis-granted, the runtime cannot mutate reference data (0048 pattern).
CREATE POLICY "federation_jurisdictions_no_insert" ON "federation_jurisdictions" AS RESTRICTIVE FOR INSERT WITH CHECK (false);
CREATE POLICY "federation_jurisdictions_no_update" ON "federation_jurisdictions" AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);
CREATE POLICY "federation_jurisdictions_no_delete" ON "federation_jurisdictions" AS RESTRICTIVE FOR DELETE USING (false);
CREATE POLICY "federation_domains_no_insert" ON "federation_domains" AS RESTRICTIVE FOR INSERT WITH CHECK (false);
CREATE POLICY "federation_domains_no_update" ON "federation_domains" AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);
CREATE POLICY "federation_domains_no_delete" ON "federation_domains" AS RESTRICTIVE FOR DELETE USING (false);
CREATE POLICY "federation_evidence_no_insert" ON "federation_evidence" AS RESTRICTIVE FOR INSERT WITH CHECK (false);
CREATE POLICY "federation_evidence_no_update" ON "federation_evidence" AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);
CREATE POLICY "federation_evidence_no_delete" ON "federation_evidence" AS RESTRICTIVE FOR DELETE USING (false);
CREATE POLICY "federation_legal_bases_no_insert" ON "federation_legal_bases" AS RESTRICTIVE FOR INSERT WITH CHECK (false);
CREATE POLICY "federation_legal_bases_no_update" ON "federation_legal_bases" AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);
CREATE POLICY "federation_legal_bases_no_delete" ON "federation_legal_bases" AS RESTRICTIVE FOR DELETE USING (false);
CREATE POLICY "federation_authorities_no_insert" ON "federation_authorities" AS RESTRICTIVE FOR INSERT WITH CHECK (false);
CREATE POLICY "federation_authorities_no_update" ON "federation_authorities" AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);
CREATE POLICY "federation_authorities_no_delete" ON "federation_authorities" AS RESTRICTIVE FOR DELETE USING (false);
CREATE POLICY "federation_services_no_insert" ON "federation_services" AS RESTRICTIVE FOR INSERT WITH CHECK (false);
CREATE POLICY "federation_services_no_update" ON "federation_services" AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);
CREATE POLICY "federation_services_no_delete" ON "federation_services" AS RESTRICTIVE FOR DELETE USING (false);
CREATE POLICY "federation_datasets_no_insert" ON "federation_datasets" AS RESTRICTIVE FOR INSERT WITH CHECK (false);
CREATE POLICY "federation_datasets_no_update" ON "federation_datasets" AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);
CREATE POLICY "federation_datasets_no_delete" ON "federation_datasets" AS RESTRICTIVE FOR DELETE USING (false);
CREATE POLICY "federation_schemas_no_insert" ON "federation_schemas" AS RESTRICTIVE FOR INSERT WITH CHECK (false);
CREATE POLICY "federation_schemas_no_update" ON "federation_schemas" AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);
CREATE POLICY "federation_schemas_no_delete" ON "federation_schemas" AS RESTRICTIVE FOR DELETE USING (false);
CREATE POLICY "federation_credentials_no_insert" ON "federation_credentials" AS RESTRICTIVE FOR INSERT WITH CHECK (false);
CREATE POLICY "federation_credentials_no_update" ON "federation_credentials" AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);
CREATE POLICY "federation_credentials_no_delete" ON "federation_credentials" AS RESTRICTIVE FOR DELETE USING (false);
CREATE POLICY "federation_connectors_no_insert" ON "federation_connectors" AS RESTRICTIVE FOR INSERT WITH CHECK (false);
CREATE POLICY "federation_connectors_no_update" ON "federation_connectors" AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);
CREATE POLICY "federation_connectors_no_delete" ON "federation_connectors" AS RESTRICTIVE FOR DELETE USING (false);
CREATE POLICY "federation_verifications_no_insert" ON "federation_verifications" AS RESTRICTIVE FOR INSERT WITH CHECK (false);
CREATE POLICY "federation_verifications_no_update" ON "federation_verifications" AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);
CREATE POLICY "federation_verifications_no_delete" ON "federation_verifications" AS RESTRICTIVE FOR DELETE USING (false);
CREATE POLICY "federation_capabilities_no_insert" ON "federation_capabilities" AS RESTRICTIVE FOR INSERT WITH CHECK (false);
CREATE POLICY "federation_capabilities_no_update" ON "federation_capabilities" AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);
CREATE POLICY "federation_capabilities_no_delete" ON "federation_capabilities" AS RESTRICTIVE FOR DELETE USING (false);
CREATE POLICY "federation_reconciliation_runs_no_insert" ON "federation_reconciliation_runs" AS RESTRICTIVE FOR INSERT WITH CHECK (false);
CREATE POLICY "federation_reconciliation_runs_no_update" ON "federation_reconciliation_runs" AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);
CREATE POLICY "federation_reconciliation_runs_no_delete" ON "federation_reconciliation_runs" AS RESTRICTIVE FOR DELETE USING (false);
CREATE POLICY "federation_reconciliation_results_no_insert" ON "federation_reconciliation_results" AS RESTRICTIVE FOR INSERT WITH CHECK (false);
CREATE POLICY "federation_reconciliation_results_no_update" ON "federation_reconciliation_results" AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);
CREATE POLICY "federation_reconciliation_results_no_delete" ON "federation_reconciliation_results" AS RESTRICTIVE FOR DELETE USING (false);
CREATE POLICY "federation_incidents_no_delete" ON "federation_incidents" AS RESTRICTIVE FOR DELETE USING (false);
CREATE POLICY "federation_approvals_no_update" ON "federation_approvals" AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);
CREATE POLICY "federation_approvals_no_delete" ON "federation_approvals" AS RESTRICTIVE FOR DELETE USING (false);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Role grants — mirror 0036: registry is runtime-immutable configuration;
-- operational tables are runtime-writable (no DELETE on audit-shaped rows).
-- Conditional on role existence so the migration replays on any environment.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format('GRANT SELECT ON federation_jurisdictions, federation_domains, federation_evidence, federation_legal_bases, federation_authorities, federation_services, federation_datasets, federation_schemas, federation_credentials, federation_connectors, federation_verifications, federation_capabilities, federation_reconciliation_runs, federation_reconciliation_results TO %I', r.rolname);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON federation_incidents, federation_agreements, federation_consents, federation_access_requests, federation_transitions TO %I', r.rolname);
    EXECUTE format('GRANT SELECT, INSERT ON federation_approvals TO %I', r.rolname);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON federation_jurisdictions, federation_domains, federation_evidence, federation_legal_bases, federation_authorities, federation_services, federation_datasets, federation_schemas, federation_credentials, federation_connectors, federation_verifications, federation_capabilities, federation_reconciliation_runs, federation_reconciliation_results FROM %I', r.rolname);
    EXECUTE format('REVOKE DELETE ON federation_incidents, federation_agreements, federation_consents, federation_access_requests, federation_transitions FROM %I', r.rolname);
    EXECUTE format('REVOKE UPDATE, DELETE ON federation_approvals FROM %I', r.rolname);
  END LOOP;
END
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Verification — RLS present on every federation table; fail otherwise.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN (
      'federation_jurisdictions','federation_domains','federation_evidence',
      'federation_legal_bases','federation_authorities','federation_services',
      'federation_datasets','federation_schemas','federation_credentials',
      'federation_connectors','federation_verifications','federation_incidents',
      'federation_agreements','federation_consents',
      'federation_access_requests','federation_approvals','federation_transitions',
      'federation_capabilities','federation_reconciliation_runs',
      'federation_reconciliation_results'
    )
    AND rowsecurity = true;
  IF n <> 20 THEN
    RAISE EXCEPTION 'Migration 0071 verification failed: RLS missing on federation tables (found %, expected 20)', n;
  END IF;
END $$;
