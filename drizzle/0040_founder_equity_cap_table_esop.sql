/*
 * BEYU OS — FOUNDER EQUITY, CAPITALIZATION & ESOP (additive; 12 governed tables).
 * X10THINK Institutionalization Program, Phase 2 (§9–§15).
 *
 * The financing-grade capitalization layer INSIDE BEYU OS: founder profiles,
 * share classes, equity positions, vesting schedules + append-only vesting
 * ledger, change-of-control declarations, good/bad leaver cases, ESOP plans,
 * grants + append-only grant ledger, reconstructable cap-table snapshots and
 * never-executed dilution scenarios.
 *
 * Constitutional boundaries this migration is built to preserve:
 *   - `ownership_records` remains the canonical entity-level ownership registry;
 *     positions link to it (`ownership_record_id`), never restate it.
 *   - Finance OS remains the sole accounting authority. Amount columns are
 *     numeric(18,2)/(18,6); amount-carrying rows record `authoritative_owner`
 *     (default 'FINANCE_OS') and a nullable `finance_record_ref`. No journal,
 *     period or posting object is created here; CAP_POSTING remains locked and
 *     fail-closed exactly as before (0037/0038 parity).
 *   - HCM remains the canonical employee master (`hcm_employee_ref`, never a copy).
 *   - Documents remain canonical (`*_document_ref` → documents registry).
 *   - Governance remains canonical (`approval_ref`, `resolution_ref`,
 *     `approved_by_resolution_id` → approvals/resolutions).
 *   - Vesting defaults (48-month / 12-month cliff / monthly) are configurable
 *     candidate INPUTS, never hard-coded legal truth; every schedule and leaver
 *     condition carries `legal_review_status` (default REQUIRES_LEGAL_REVIEW).
 *
 * Row Level Security mirrors 0035–0039: every table is RLS-enabled with the
 * canonical `tenant_id = ANY (beyu_tenant_ids())` policy (USING + WITH CHECK),
 * the runtime role receives DML only, and the verification block FAILS the
 * migration if any table lacks its policy.
 *
 * META NOTE: no drizzle-kit meta snapshot is added. The snapshot chain has been
 * stale since 0039 (drizzle/meta/0039_snapshot.json duplicates 0038's snapshot
 * id, which already blocks `drizzle-kit generate` on main). scripts/migrate.ts
 * is the only canonical runner and does not read meta. Repairing the snapshot
 * chain is registered as remaining work; this migration deliberately does not
 * worsen or silently rewrite it.
 */
--> statement-breakpoint
CREATE TABLE "founder_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"party_id" text NOT NULL,
	"legal_entity_id" text,
	"founder_status" text DEFAULT 'ACTIVE' NOT NULL,
	"reserved_matters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transfer_restrictions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"voting_rights_summary" text,
	"economic_rights_summary" text,
	"succession_document_ref" text,
	"legal_review_status" text DEFAULT 'REQUIRES_LEGAL_REVIEW' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_classes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"class_type" text DEFAULT 'ORDINARY' NOT NULL,
	"authorized_shares" bigint DEFAULT 0 NOT NULL,
	"issued_shares" bigint DEFAULT 0 NOT NULL,
	"votes_per_share" numeric(9, 4) DEFAULT '1' NOT NULL,
	"rights_summary" text,
	"instrument_document_ref" text,
	"approval_ref" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equity_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"share_class_id" text NOT NULL,
	"holder_type" text NOT NULL,
	"holder_party_id" text,
	"holder_name" text NOT NULL,
	"instrument" text DEFAULT 'ORDINARY_SHARES' NOT NULL,
	"total_shares" bigint NOT NULL,
	"vested_shares" bigint DEFAULT 0 NOT NULL,
	"unvested_shares" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"ownership_record_id" text,
	"provenance" text NOT NULL,
	"supporting_document_id" text,
	"resolution_ref" text,
	"approval_ref" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vesting_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"position_id" text NOT NULL,
	"schedule_type" text DEFAULT 'CUSTOM' NOT NULL,
	"total_shares" bigint NOT NULL,
	"vesting_months" integer NOT NULL,
	"cliff_months" integer NOT NULL,
	"frequency" text DEFAULT 'MONTHLY' NOT NULL,
	"start_date" date NOT NULL,
	"cliff_date" date NOT NULL,
	"end_date" date NOT NULL,
	"acceleration_policy" text DEFAULT 'DOUBLE_TRIGGER' NOT NULL,
	"acceleration_pct_millionths" integer,
	"legal_review_status" text DEFAULT 'REQUIRES_LEGAL_REVIEW' NOT NULL,
	"document_ref" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"approved_by_resolution_id" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vesting_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"schedule_id" text NOT NULL,
	"position_id" text NOT NULL,
	"event_type" text NOT NULL,
	"vested_shares_delta" bigint DEFAULT 0 NOT NULL,
	"cumulative_vested_shares" bigint NOT NULL,
	"milestone_date" date,
	"change_of_control_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" text,
	"authority_ref" text,
	"document_ref" text,
	"trace_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_of_control_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"event_type" text NOT NULL,
	"description" text NOT NULL,
	"occurred_on" date NOT NULL,
	"linked_event_id" text,
	"affected_party_id" text,
	"status" text DEFAULT 'DECLARED' NOT NULL,
	"legal_review_status" text DEFAULT 'REQUIRES_LEGAL_REVIEW' NOT NULL,
	"resolution_ref" text,
	"document_ref" text,
	"declared_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaver_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"position_id" text NOT NULL,
	"holder_party_id" text,
	"case_type" text DEFAULT 'UNDETERMINED' NOT NULL,
	"condition_code" text NOT NULL,
	"condition_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"treatment" jsonb,
	"status" text DEFAULT 'INITIATED' NOT NULL,
	"vested_shares_at_event" bigint DEFAULT 0 NOT NULL,
	"unvested_shares_at_event" bigint DEFAULT 0 NOT NULL,
	"retained_shares" bigint,
	"repurchase_shares" bigint,
	"forfeited_shares" bigint,
	"repurchase_price_per_share" numeric(18, 6),
	"repurchase_total" numeric(18, 2),
	"currency" text,
	"valuation_basis" text,
	"authoritative_owner" text DEFAULT 'FINANCE_OS' NOT NULL,
	"finance_record_ref" text,
	"payment_status" text DEFAULT 'NOT_DUE' NOT NULL,
	"legal_review_status" text DEFAULT 'REQUIRES_LEGAL_REVIEW' NOT NULL,
	"approval_ref" text,
	"resolution_ref" text,
	"document_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dispute_notes" text,
	"initiated_by" text NOT NULL,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "esop_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"plan_name" text NOT NULL,
	"jurisdiction_code" text NOT NULL,
	"pool_shares_authorized" bigint NOT NULL,
	"pool_shares_issued" bigint DEFAULT 0 NOT NULL,
	"default_vesting" jsonb DEFAULT '{"vestingMonths":48,"cliffMonths":12,"frequency":"MONTHLY"}'::jsonb NOT NULL,
	"exercise_window_days" integer DEFAULT 90 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"legal_review_status" text DEFAULT 'REQUIRES_LEGAL_REVIEW' NOT NULL,
	"approved_by_resolution_id" text,
	"document_ref" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "esop_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"grantee_party_id" text NOT NULL,
	"hcm_employee_ref" text,
	"share_class_id" text,
	"option_shares" bigint NOT NULL,
	"exercise_price_per_share" numeric(18, 6) NOT NULL,
	"currency" text NOT NULL,
	"grant_date" date NOT NULL,
	"vesting_schedule_id" text,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"exercised_shares" bigint DEFAULT 0 NOT NULL,
	"tax_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"legal_review_status" text DEFAULT 'REQUIRES_LEGAL_REVIEW' NOT NULL,
	"approval_ref" text,
	"document_ref" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "esop_grant_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"grant_id" text NOT NULL,
	"event_type" text NOT NULL,
	"shares_delta" bigint DEFAULT 0 NOT NULL,
	"exercise_price_per_share" numeric(18, 6),
	"proceeds_ref" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" text,
	"authority_ref" text,
	"document_ref" text,
	"trace_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cap_table_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"as_of_date" date NOT NULL,
	"authorized_shares" bigint DEFAULT 0 NOT NULL,
	"issued_shares" bigint DEFAULT 0 NOT NULL,
	"outstanding_shares" bigint DEFAULT 0 NOT NULL,
	"vested_shares" bigint DEFAULT 0 NOT NULL,
	"unvested_shares" bigint DEFAULT 0 NOT NULL,
	"esop_pool_shares" bigint DEFAULT 0 NOT NULL,
	"esop_granted_shares" bigint DEFAULT 0 NOT NULL,
	"options_outstanding" bigint DEFAULT 0 NOT NULL,
	"treasury_shares" bigint DEFAULT 0 NOT NULL,
	"cancelled_shares" bigint DEFAULT 0 NOT NULL,
	"fully_diluted_shares" bigint DEFAULT 0 NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reconstruction_basis" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"computed_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dilution_scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"name" text NOT NULL,
	"scenario_type" text NOT NULL,
	"model_version" text DEFAULT '1.0.0' NOT NULL,
	"assumptions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pre_transaction" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"transaction" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"post_transaction" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"execution_prohibited" boolean DEFAULT true NOT NULL,
	"decision_owner_user_id" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "founder_profiles" ADD CONSTRAINT "founder_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "founder_profiles" ADD CONSTRAINT "founder_profiles_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "founder_profiles" ADD CONSTRAINT "founder_profiles_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_classes" ADD CONSTRAINT "share_classes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_classes" ADD CONSTRAINT "share_classes_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equity_positions" ADD CONSTRAINT "equity_positions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equity_positions" ADD CONSTRAINT "equity_positions_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equity_positions" ADD CONSTRAINT "equity_positions_share_class_id_share_classes_id_fk" FOREIGN KEY ("share_class_id") REFERENCES "public"."share_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equity_positions" ADD CONSTRAINT "equity_positions_holder_party_id_parties_id_fk" FOREIGN KEY ("holder_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equity_positions" ADD CONSTRAINT "equity_positions_ownership_record_id_ownership_records_id_fk" FOREIGN KEY ("ownership_record_id") REFERENCES "public"."ownership_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vesting_schedules" ADD CONSTRAINT "vesting_schedules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vesting_schedules" ADD CONSTRAINT "vesting_schedules_position_id_equity_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."equity_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vesting_events" ADD CONSTRAINT "vesting_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vesting_events" ADD CONSTRAINT "vesting_events_schedule_id_vesting_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."vesting_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vesting_events" ADD CONSTRAINT "vesting_events_position_id_equity_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."equity_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_of_control_events" ADD CONSTRAINT "change_of_control_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_of_control_events" ADD CONSTRAINT "change_of_control_events_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_of_control_events" ADD CONSTRAINT "change_of_control_events_affected_party_id_parties_id_fk" FOREIGN KEY ("affected_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaver_cases" ADD CONSTRAINT "leaver_cases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaver_cases" ADD CONSTRAINT "leaver_cases_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaver_cases" ADD CONSTRAINT "leaver_cases_position_id_equity_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."equity_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaver_cases" ADD CONSTRAINT "leaver_cases_holder_party_id_parties_id_fk" FOREIGN KEY ("holder_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esop_plans" ADD CONSTRAINT "esop_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esop_plans" ADD CONSTRAINT "esop_plans_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esop_grants" ADD CONSTRAINT "esop_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esop_grants" ADD CONSTRAINT "esop_grants_plan_id_esop_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."esop_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esop_grants" ADD CONSTRAINT "esop_grants_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esop_grants" ADD CONSTRAINT "esop_grants_grantee_party_id_parties_id_fk" FOREIGN KEY ("grantee_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esop_grants" ADD CONSTRAINT "esop_grants_share_class_id_share_classes_id_fk" FOREIGN KEY ("share_class_id") REFERENCES "public"."share_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esop_grant_events" ADD CONSTRAINT "esop_grant_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esop_grant_events" ADD CONSTRAINT "esop_grant_events_grant_id_esop_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."esop_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cap_table_snapshots" ADD CONSTRAINT "cap_table_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cap_table_snapshots" ADD CONSTRAINT "cap_table_snapshots_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dilution_scenarios" ADD CONSTRAINT "dilution_scenarios_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dilution_scenarios" ADD CONSTRAINT "dilution_scenarios_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "founder_profiles_party_uidx" ON "founder_profiles" USING btree ("tenant_id","party_id");--> statement-breakpoint
CREATE INDEX "founder_profiles_tenant_idx" ON "founder_profiles" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_classes_entity_code_uidx" ON "share_classes" USING btree ("tenant_id","legal_entity_id","code");--> statement-breakpoint
CREATE INDEX "share_classes_tenant_idx" ON "share_classes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "equity_positions_entity_idx" ON "equity_positions" USING btree ("tenant_id","legal_entity_id");--> statement-breakpoint
CREATE INDEX "equity_positions_holder_idx" ON "equity_positions" USING btree ("tenant_id","holder_party_id");--> statement-breakpoint
CREATE INDEX "equity_positions_class_idx" ON "equity_positions" USING btree ("share_class_id");--> statement-breakpoint
CREATE INDEX "vesting_schedules_position_idx" ON "vesting_schedules" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "vesting_schedules_tenant_idx" ON "vesting_schedules" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "vesting_schedules_status_idx" ON "vesting_schedules" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "vesting_events_schedule_idx" ON "vesting_events" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "vesting_events_tenant_idx" ON "vesting_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "change_of_control_entity_idx" ON "change_of_control_events" USING btree ("tenant_id","legal_entity_id");--> statement-breakpoint
CREATE INDEX "change_of_control_link_idx" ON "change_of_control_events" USING btree ("linked_event_id");--> statement-breakpoint
CREATE INDEX "leaver_cases_position_idx" ON "leaver_cases" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "leaver_cases_tenant_status_idx" ON "leaver_cases" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "esop_plans_name_uidx" ON "esop_plans" USING btree ("tenant_id","plan_name");--> statement-breakpoint
CREATE INDEX "esop_plans_tenant_idx" ON "esop_plans" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "esop_grants_plan_idx" ON "esop_grants" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "esop_grants_grantee_idx" ON "esop_grants" USING btree ("tenant_id","grantee_party_id");--> statement-breakpoint
CREATE INDEX "esop_grant_events_grant_idx" ON "esop_grant_events" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "esop_grant_events_tenant_idx" ON "esop_grant_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cap_table_snapshots_entity_date_uidx" ON "cap_table_snapshots" USING btree ("tenant_id","legal_entity_id","as_of_date");--> statement-breakpoint
CREATE INDEX "cap_table_snapshots_tenant_idx" ON "cap_table_snapshots" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "dilution_scenarios_entity_idx" ON "dilution_scenarios" USING btree ("tenant_id","legal_entity_id");--> statement-breakpoint
CREATE INDEX "dilution_scenarios_type_idx" ON "dilution_scenarios" USING btree ("scenario_type");
--> statement-breakpoint
ALTER TABLE "founder_profiles" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "share_classes" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "equity_positions" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "vesting_schedules" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "vesting_events" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "change_of_control_events" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "leaver_cases" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "esop_plans" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "esop_grants" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "esop_grant_events" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "cap_table_snapshots" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
ALTER TABLE "dilution_scenarios" ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY founder_profiles_tenant_isolation ON founder_profiles USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY share_classes_tenant_isolation ON share_classes USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY equity_positions_tenant_isolation ON equity_positions USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY vesting_schedules_tenant_isolation ON vesting_schedules USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY vesting_events_tenant_isolation ON vesting_events USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY change_of_control_events_tenant_isolation ON change_of_control_events USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY leaver_cases_tenant_isolation ON leaver_cases USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY esop_plans_tenant_isolation ON esop_plans USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY esop_grants_tenant_isolation ON esop_grants USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY esop_grant_events_tenant_isolation ON esop_grant_events USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY cap_table_snapshots_tenant_isolation ON cap_table_snapshots USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
CREATE POLICY dilution_scenarios_tenant_isolation ON dilution_scenarios USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))
--> statement-breakpoint
/* Runtime DML grant, mirroring 0035–0039. No DDL is ever granted to the runtime role. */
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO %I', 'founder_profiles, share_classes, equity_positions, vesting_schedules, vesting_events, change_of_control_events, leaver_cases, esop_plans, esop_grants, esop_grant_events, cap_table_snapshots, dilution_scenarios', r.rolname);
    RAISE NOTICE 'granted founder equity / cap table / ESOP DML to %', r.rolname;
  END LOOP;
END
$$
--> statement-breakpoint
/*
 * Verification. The migration FAILS if any table lacks its tenant isolation
 * policy, so a half-applied migration cannot leave an unprotected capitalization
 * table behind. This mirrors the verification blocks in 0035–0039.
 */
DO $$
DECLARE
  table_name text;
  policy_count int;
BEGIN
  FOR table_name IN SELECT unnest(ARRAY['founder_profiles', 'share_classes', 'equity_positions', 'vesting_schedules', 'vesting_events', 'change_of_control_events', 'leaver_cases', 'esop_plans', 'esop_grants', 'esop_grant_events', 'cap_table_snapshots', 'dilution_scenarios'])
  LOOP
    SELECT count(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = table_name
      AND policyname = table_name || '_tenant_isolation';
    IF policy_count = 0 THEN
      RAISE EXCEPTION 'Migration 0040 verification failed: % has no tenant isolation policy', table_name;
    END IF;
  END LOOP;
END $$
