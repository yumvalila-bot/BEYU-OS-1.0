/*
 * BEYU OS — FAMILY TRUST GOVERNANCE (additive; 4 governed tables).
 * X10THINK Institutionalization Program, Phase 3 (§8, §11, §48).
 *
 * Persists the trust rails already engineered as pure mechanism in
 * `src/lib/family/office/trust.ts`: versioned trust instruments, jurisdiction-
 * aware provisions (Spendthrift / No-Contest / Discretionary Distribution /
 * Trustee Removal / Trustee Replacement / Succession), trustee governance
 * decisions and distribution decision records.
 *
 * Constitutional boundaries this migration is built to preserve:
 *   - The trust remains a `legal_entities` row (seeded LEN_BEYU_FAMILY_TRUST);
 *     trustees remain `entity_appointments` rows (role TRUSTEE/PROTECTOR);
 *     beneficiaries remain the `beneficiaries` register; instruments and clause
 *     texts remain `documents` rows. Every link below is a REFERENCE — no
 *     parallel identity, appointment, beneficiary or document store.
 *   - A provision without a ratified `legal_effect_reference` is INERT
 *     (`legal_effect_status` default 'INERT', `enforceability_assumed` default
 *     false): software records structure, never legal enforceability (§48).
 *   - Finance OS remains the sole accounting authority for distributions
 *     (`authoritative_owner` default 'FINANCE_OS', nullable
 *     `finance_record_ref`); nothing here posts a journal entry and CAP_POSTING
 *     remains locked and fail-closed exactly as before.
 *   - Lifecycle (§8): DRAFT → LEGAL_REVIEW → APPROVED → EXECUTED → SUPERSEDED |
 *     EXPIRED | DISPUTED; superseded rows are never deleted.
 *
 * Row Level Security mirrors 0035–0040: RLS enabled on every table with the
 * canonical `tenant_id = ANY (beyu_tenant_ids())` policy (USING + WITH CHECK),
 * runtime role DML only, and a fail-closed verification block.
 *
 * META NOTE: no drizzle-kit meta snapshot is added — see 0040 (the snapshot
 * chain has been stale since 0039; scripts/migrate.ts is the only canonical
 * runner and does not read meta).
 */
--> statement-breakpoint
CREATE TABLE "trust_instruments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"trust_entity_id" text NOT NULL,
	"instrument_name" text NOT NULL,
	"instrument_type" text DEFAULT 'DEED' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"jurisdiction_code" text NOT NULL,
	"settlor_party_id" text,
	"document_ref" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"legal_review_status" text DEFAULT 'REQUIRES_LEGAL_REVIEW' NOT NULL,
	"supersedes_instrument_id" text,
	"effective_date" date,
	"expiration_date" date,
	"approved_by_resolution_id" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trust_provisions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"instrument_id" text NOT NULL,
	"provision_type" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"jurisdiction_code" text NOT NULL,
	"summary" text NOT NULL,
	"clause_document_ref" text,
	"legal_effect_status" text DEFAULT 'INERT' NOT NULL,
	"legal_effect_reference" text,
	"enforceability_assumed" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"supersedes_provision_id" text,
	"approved_by_resolution_id" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trust_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"instrument_id" text NOT NULL,
	"decision_type" text NOT NULL,
	"subject_party_id" text,
	"rationale" text NOT NULL,
	"data_basis" text,
	"consequences" text,
	"authority_kind" text DEFAULT 'RESOLUTION' NOT NULL,
	"authority_ref" text,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"resulting_appointment_id" text,
	"effective_date" date,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"evidence_document_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conflict_of_interest" boolean DEFAULT false NOT NULL,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trust_distributions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"instrument_id" text NOT NULL,
	"beneficiary_id" text NOT NULL,
	"distribution_type" text NOT NULL,
	"amount" numeric(18, 2),
	"currency" text,
	"asset_description" text,
	"discretion_basis" text,
	"conditions_met" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"approval_ref" text,
	"resolution_ref" text,
	"authoritative_owner" text DEFAULT 'FINANCE_OS' NOT NULL,
	"finance_record_ref" text,
	"payment_status" text DEFAULT 'NOT_DUE' NOT NULL,
	"effective_date" date,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trust_instruments" ADD CONSTRAINT "trust_instruments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_instruments" ADD CONSTRAINT "trust_instruments_trust_entity_id_legal_entities_id_fk" FOREIGN KEY ("trust_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_instruments" ADD CONSTRAINT "trust_instruments_settlor_party_id_parties_id_fk" FOREIGN KEY ("settlor_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_provisions" ADD CONSTRAINT "trust_provisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_provisions" ADD CONSTRAINT "trust_provisions_instrument_id_trust_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."trust_instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_decisions" ADD CONSTRAINT "trust_decisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_decisions" ADD CONSTRAINT "trust_decisions_instrument_id_trust_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."trust_instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_decisions" ADD CONSTRAINT "trust_decisions_subject_party_id_parties_id_fk" FOREIGN KEY ("subject_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_decisions" ADD CONSTRAINT "trust_decisions_resulting_appointment_id_entity_appointments_id_fk" FOREIGN KEY ("resulting_appointment_id") REFERENCES "public"."entity_appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_distributions" ADD CONSTRAINT "trust_distributions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_distributions" ADD CONSTRAINT "trust_distributions_instrument_id_trust_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."trust_instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_distributions" ADD CONSTRAINT "trust_distributions_beneficiary_id_beneficiaries_id_fk" FOREIGN KEY ("beneficiary_id") REFERENCES "public"."beneficiaries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trust_instruments_entity_version_uidx" ON "trust_instruments" USING btree ("tenant_id","trust_entity_id","instrument_type","version");--> statement-breakpoint
CREATE INDEX "trust_instruments_tenant_idx" ON "trust_instruments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "trust_instruments_status_idx" ON "trust_instruments" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "trust_provisions_instrument_idx" ON "trust_provisions" USING btree ("instrument_id");--> statement-breakpoint
CREATE INDEX "trust_provisions_type_idx" ON "trust_provisions" USING btree ("tenant_id","provision_type");--> statement-breakpoint
CREATE INDEX "trust_decisions_instrument_idx" ON "trust_decisions" USING btree ("instrument_id");--> statement-breakpoint
CREATE INDEX "trust_decisions_tenant_status_idx" ON "trust_decisions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "trust_distributions_instrument_idx" ON "trust_distributions" USING btree ("instrument_id");--> statement-breakpoint
CREATE INDEX "trust_distributions_beneficiary_idx" ON "trust_distributions" USING btree ("beneficiary_id");--> statement-breakpoint
CREATE INDEX "trust_distributions_tenant_status_idx" ON "trust_distributions" USING btree ("tenant_id","status");
--> statement-breakpoint
ALTER TABLE "trust_instruments" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "trust_provisions" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "trust_decisions" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "trust_distributions" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY trust_instruments_tenant_isolation ON trust_instruments USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY trust_provisions_tenant_isolation ON trust_provisions USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY trust_decisions_tenant_isolation ON trust_decisions USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY trust_distributions_tenant_isolation ON trust_distributions USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
/* Runtime DML grant, mirroring 0035–0040. No DDL is ever granted to the runtime role. */
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO %I', 'trust_instruments, trust_provisions, trust_decisions, trust_distributions', r.rolname);
    RAISE NOTICE 'granted family trust governance DML to %', r.rolname;
  END LOOP;
END
$$
--> statement-breakpoint
/*
 * Verification. The migration FAILS if any table lacks its tenant isolation
 * policy, so a half-applied migration cannot leave an unprotected trust
 * governance table behind. Mirrors 0035–0040.
 */
DO $$
DECLARE
  table_name text;
  policy_count int;
BEGIN
  FOR table_name IN SELECT unnest(ARRAY['trust_instruments', 'trust_provisions', 'trust_decisions', 'trust_distributions'])
  LOOP
    SELECT count(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = table_name
      AND policyname = table_name || '_tenant_isolation';
    IF policy_count = 0 THEN
      RAISE EXCEPTION 'Migration 0041 verification failed: % has no tenant isolation policy', table_name;
    END IF;
  END LOOP;
END $$
