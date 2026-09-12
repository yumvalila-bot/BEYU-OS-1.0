/*
 * BEYU OS — Family Office PROTECTION & INSURANCE (additive; 9 governed tables).
 *
 * A capability INSIDE the existing Family Office: life-insurance protection
 * records, beneficiary designations (distinct from the TRUST beneficiary
 * register in `people.beneficiaries`), premium obligations, assignment/loan
 * posture, policy reviews, a claims ledger with an append-only event log, and
 * modeled protection-gap assessments. Not an OS; no insurer integration; no
 * underwriting; no adjudication (§36, §37).
 *
 * Constitutional boundaries this migration is built to preserve:
 *   - Finance OS remains the sole accounting authority. Amount columns are
 *     numeric(18,2); every amount-carrying row records `authoritative_owner`
 *     (default 'FINANCE_OS') and a nullable `finance_record_ref`. No journal,
 *     period, balance or posting object is created here, and the Finance
 *     posting capability (CAP_POSTING) remains locked and fail-closed exactly
 *     as before — this domain does not call it (§22, FIR-018 parity with 0037).
 *   - HCM remains the canonical employee master: group-life records hold a
 *     reference (`hcm_employee_ref`), never a copy.
 *   - Documents remain canonical: every `*_document_ref` / `document_refs`
 *     column points at the existing documents registry. No parallel store.
 *   - Death benefit is recorded as a contingent contract amount. No total,
 *     view or column in these tables sums it into wealth or liquidity; the
 *     buckets in the service keep contingent and received values apart (§4).
 *
 * Row Level Security mirrors 0036/0037: every table is RLS-enabled with the
 * canonical `tenant_id = ANY (beyu_tenant_ids())` policy (USING + WITH CHECK),
 * the runtime role receives DML only, and the verification block FAILS the
 * migration if any table lacks its policy — a half-applied migration cannot
 * leave an unprotected insurance record behind.
 */
--> statement-breakpoint
CREATE TABLE "family_insurance_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"policy_id" text NOT NULL,
	"assignment_type" text NOT NULL,
	"assignee_ref" text NOT NULL,
	"assignee_name" text NOT NULL,
	"secured_amount" numeric(18, 2),
	"currency" text,
	"effective_date" date NOT NULL,
	"release_date" date,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"instrument_document_ref" text NOT NULL,
	"notes" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_insurance_beneficiary_designations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"policy_id" text NOT NULL,
	"beneficiary_ref" text NOT NULL,
	"beneficiary_kind" text NOT NULL,
	"designation_type" text NOT NULL,
	"entitlement_basis" text NOT NULL,
	"pct_millionths" integer,
	"fixed_amount" numeric(18, 2),
	"currency" text,
	"effective_date" date NOT NULL,
	"end_date" date,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"relationship_basis" text NOT NULL,
	"review_status" text DEFAULT 'UNREVIEWED' NOT NULL,
	"legal_review_status" text,
	"document_ref" text,
	"notes" text,
	"recorded_by" text NOT NULL,
	"authority_ref" text,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_insurance_claim_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"event_kind" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"note" text,
	"evidence_document_ref" text,
	"actor_ref" text NOT NULL,
	"actor_type" text DEFAULT 'HUMAN' NOT NULL,
	"audit_ref" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_insurance_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"policy_id" text NOT NULL,
	"claim_reference" text NOT NULL,
	"insured_ref" text NOT NULL,
	"insurer_ref" text NOT NULL,
	"incident_date" date NOT NULL,
	"notification_date" date,
	"status" text DEFAULT 'CLAIM_OPENED' NOT NULL,
	"proceeds_state" text DEFAULT 'NONE' NOT NULL,
	"approved_amount" numeric(18, 2),
	"received_amount" numeric(18, 2),
	"currency" text NOT NULL,
	"proceeds_received_date" date,
	"allocation_ref" text,
	"decision_evidence_ref" text,
	"document_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"authoritative_owner" text DEFAULT 'FINANCE_OS' NOT NULL,
	"finance_record_ref" text,
	"epistemic_class" text DEFAULT 'USER_PROVIDED' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_insurance_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text,
	"country_code" text,
	"policy_number" text NOT NULL,
	"policy_type" text NOT NULL,
	"owner_ref" text,
	"owner_kind" text,
	"insured_ref" text,
	"insured_kind" text,
	"premium_payer_ref" text,
	"insurer_ref" text NOT NULL,
	"broker_ref" text,
	"currency" text NOT NULL,
	"coverage_amount" numeric(18, 2) NOT NULL,
	"death_benefit" numeric(18, 2) NOT NULL,
	"cash_value" numeric(18, 2),
	"surrender_value" numeric(18, 2),
	"premium_amount" numeric(18, 2) NOT NULL,
	"premium_frequency" text NOT NULL,
	"next_premium_due_date" date,
	"effective_date" date,
	"maturity_date" date,
	"review_interval_days" integer,
	"last_review_date" date,
	"next_review_date" date,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"governance_stage" text DEFAULT 'DRAFT' NOT NULL,
	"assignment_status" text DEFAULT 'NONE' NOT NULL,
	"collateral_beneficiary_ref" text,
	"purpose" text NOT NULL,
	"succession_plan_id" text,
	"succession_plan_ref" text,
	"liquidity_objective_ref" text,
	"risk_assessment_ref" text,
	"hcm_employee_ref" text,
	"document_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"legal_review_status" text DEFAULT 'NOT_STARTED' NOT NULL,
	"tax_review_status" text DEFAULT 'NOT_STARTED' NOT NULL,
	"jurisdiction_ref" text,
	"amount_provenance" text DEFAULT 'USER_PROVIDED' NOT NULL,
	"amount_source_ref" text,
	"authoritative_owner" text DEFAULT 'FINANCE_OS' NOT NULL,
	"finance_record_ref" text,
	"epistemic_class" text DEFAULT 'USER_PROVIDED' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_insurance_policy_loans" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"policy_id" text NOT NULL,
	"advanced_date" date NOT NULL,
	"principal" numeric(18, 2) NOT NULL,
	"interest_rate_bps" integer,
	"outstanding_balance" numeric(18, 2),
	"status" text DEFAULT 'OUTSTANDING' NOT NULL,
	"repaid_date" date,
	"authorization_ref" text,
	"notes" text,
	"authoritative_owner" text DEFAULT 'FINANCE_OS' NOT NULL,
	"finance_record_ref" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_insurance_premiums" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"policy_id" text NOT NULL,
	"due_date" date NOT NULL,
	"frequency" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"payer_ref" text,
	"paid_date" date,
	"payment_evidence_document_ref" text,
	"finance_record_ref" text,
	"authoritative_owner" text DEFAULT 'FINANCE_OS' NOT NULL,
	"epistemic_class" text DEFAULT 'USER_PROVIDED' NOT NULL,
	"notes" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_insurance_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"policy_id" text NOT NULL,
	"review_kind" text NOT NULL,
	"review_date" date NOT NULL,
	"reviewer_ref" text NOT NULL,
	"reviewer_type" text DEFAULT 'HUMAN' NOT NULL,
	"outcome" text NOT NULL,
	"exceptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_review_date" date,
	"evidence_document_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"governance_stage_after" text,
	"authority_ref" text,
	"notes" text,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_protection_assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text,
	"country_code" text,
	"subject_ref" text NOT NULL,
	"subject_kind" text NOT NULL,
	"as_of" date NOT NULL,
	"currency" text NOT NULL,
	"components" jsonb NOT NULL,
	"policy_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"methodology" text DEFAULT 'beyu.protection-gap' NOT NULL,
	"methodology_version" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"epistemic_class" text DEFAULT 'MODELLED' NOT NULL,
	"authoritative_owner" text DEFAULT 'FINANCE_OS' NOT NULL,
	"disclaimer" text NOT NULL,
	"reviewed_by" text,
	"authority_ref" text,
	"created_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "family_insurance_assignments" ADD CONSTRAINT "family_insurance_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_insurance_assignments" ADD CONSTRAINT "family_insurance_assignments_policy_id_family_insurance_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."family_insurance_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_insurance_beneficiary_designations" ADD CONSTRAINT "family_insurance_beneficiary_designations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_insurance_beneficiary_designations" ADD CONSTRAINT "family_insurance_beneficiary_designations_policy_id_family_insurance_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."family_insurance_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_insurance_claim_events" ADD CONSTRAINT "family_insurance_claim_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_insurance_claim_events" ADD CONSTRAINT "family_insurance_claim_events_claim_id_family_insurance_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."family_insurance_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_insurance_claims" ADD CONSTRAINT "family_insurance_claims_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_insurance_claims" ADD CONSTRAINT "family_insurance_claims_policy_id_family_insurance_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."family_insurance_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_insurance_policies" ADD CONSTRAINT "family_insurance_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_insurance_policies" ADD CONSTRAINT "family_insurance_policies_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_insurance_policies" ADD CONSTRAINT "family_insurance_policies_succession_plan_id_family_generational_plans_id_fk" FOREIGN KEY ("succession_plan_id") REFERENCES "public"."family_generational_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_insurance_policy_loans" ADD CONSTRAINT "family_insurance_policy_loans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_insurance_policy_loans" ADD CONSTRAINT "family_insurance_policy_loans_policy_id_family_insurance_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."family_insurance_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_insurance_premiums" ADD CONSTRAINT "family_insurance_premiums_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_insurance_premiums" ADD CONSTRAINT "family_insurance_premiums_policy_id_family_insurance_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."family_insurance_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_insurance_reviews" ADD CONSTRAINT "family_insurance_reviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_insurance_reviews" ADD CONSTRAINT "family_insurance_reviews_policy_id_family_insurance_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."family_insurance_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_protection_assessments" ADD CONSTRAINT "family_protection_assessments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_protection_assessments" ADD CONSTRAINT "family_protection_assessments_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_insurance_assignments_policy_idx" ON "family_insurance_assignments" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "family_insurance_assignments_tenant_idx" ON "family_insurance_assignments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "family_insurance_designations_policy_idx" ON "family_insurance_beneficiary_designations" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "family_insurance_designations_tenant_idx" ON "family_insurance_beneficiary_designations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "family_insurance_claim_events_claim_idx" ON "family_insurance_claim_events" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "family_insurance_claim_events_tenant_idx" ON "family_insurance_claim_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_insurance_claims_ref_uidx" ON "family_insurance_claims" USING btree ("tenant_id","claim_reference");--> statement-breakpoint
CREATE INDEX "family_insurance_claims_policy_idx" ON "family_insurance_claims" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "family_insurance_claims_status_idx" ON "family_insurance_claims" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "family_insurance_policies_number_uidx" ON "family_insurance_policies" USING btree ("tenant_id","policy_number");--> statement-breakpoint
CREATE INDEX "family_insurance_policies_tenant_idx" ON "family_insurance_policies" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "family_insurance_policies_status_idx" ON "family_insurance_policies" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "family_insurance_policies_insured_idx" ON "family_insurance_policies" USING btree ("tenant_id","insured_ref");--> statement-breakpoint
CREATE INDEX "family_insurance_policy_loans_policy_idx" ON "family_insurance_policy_loans" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "family_insurance_policy_loans_tenant_idx" ON "family_insurance_policy_loans" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_insurance_premiums_due_uidx" ON "family_insurance_premiums" USING btree ("policy_id","due_date");--> statement-breakpoint
CREATE INDEX "family_insurance_premiums_tenant_idx" ON "family_insurance_premiums" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "family_insurance_reviews_policy_idx" ON "family_insurance_reviews" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "family_insurance_reviews_tenant_idx" ON "family_insurance_reviews" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "family_protection_assessments_subject_idx" ON "family_protection_assessments" USING btree ("tenant_id","subject_ref","as_of");--> statement-breakpoint
CREATE INDEX "family_protection_assessments_tenant_idx" ON "family_protection_assessments" USING btree ("tenant_id");
--> statement-breakpoint
ALTER TABLE "family_insurance_policies" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "family_insurance_beneficiary_designations" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "family_insurance_premiums" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "family_insurance_assignments" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "family_insurance_policy_loans" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "family_insurance_reviews" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "family_insurance_claims" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "family_insurance_claim_events" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "family_protection_assessments" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY family_insurance_policies_tenant_isolation ON family_insurance_policies USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY family_insurance_beneficiary_designations_tenant_isolation ON family_insurance_beneficiary_designations USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY family_insurance_premiums_tenant_isolation ON family_insurance_premiums USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY family_insurance_assignments_tenant_isolation ON family_insurance_assignments USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY family_insurance_policy_loans_tenant_isolation ON family_insurance_policy_loans USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY family_insurance_reviews_tenant_isolation ON family_insurance_reviews USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY family_insurance_claims_tenant_isolation ON family_insurance_claims USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY family_insurance_claim_events_tenant_isolation ON family_insurance_claim_events USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY family_protection_assessments_tenant_isolation ON family_protection_assessments USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
/* Runtime DML grant, mirroring 0035/0036/0037. No DDL is ever granted to the runtime role. */
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO %I', 'family_insurance_policies, family_insurance_beneficiary_designations, family_insurance_premiums, family_insurance_assignments, family_insurance_policy_loans, family_insurance_reviews, family_insurance_claims, family_insurance_claim_events, family_protection_assessments', r.rolname);
    RAISE NOTICE 'granted family office protection & insurance DML to %', r.rolname;
  END LOOP;
END
$$
--> statement-breakpoint
/*
 * Verification. The migration FAILS if any table lacks its tenant isolation
 * policy, so a half-applied migration cannot leave an unprotected protection &
 * insurance table behind. This mirrors the verification blocks in 0035/0036/0037.
 */
DO $$
DECLARE
  table_name text;
  policy_count int;
BEGIN
  FOR table_name IN SELECT unnest(ARRAY['family_insurance_policies', 'family_insurance_beneficiary_designations', 'family_insurance_premiums', 'family_insurance_assignments', 'family_insurance_policy_loans', 'family_insurance_reviews', 'family_insurance_claims', 'family_insurance_claim_events', 'family_protection_assessments'])
  LOOP
    SELECT count(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = table_name
      AND policyname = table_name || '_tenant_isolation';
    IF policy_count = 0 THEN
      RAISE EXCEPTION 'Migration 0038 verification failed: % has no tenant isolation policy', table_name;
    END IF;
  END LOOP;
END $$
