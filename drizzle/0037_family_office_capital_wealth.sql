CREATE TABLE "family_asset_ladder_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"subject_ref" text NOT NULL,
	"subject_kind" text NOT NULL,
	"stage_code" text NOT NULL,
	"last_action" text,
	"satisfied_prerequisites" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"as_of" date NOT NULL,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_balance_sheet_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"as_of" date NOT NULL,
	"currency" text NOT NULL,
	"total_assets" numeric(18, 2) NOT NULL,
	"total_liabilities" numeric(18, 2) NOT NULL,
	"net_worth" numeric(18, 2) NOT NULL,
	"liquid_assets" numeric(18, 2) DEFAULT '0' NOT NULL,
	"near_liquid_assets" numeric(18, 2) DEFAULT '0' NOT NULL,
	"illiquid_assets" numeric(18, 2) DEFAULT '0' NOT NULL,
	"productive_assets" numeric(18, 2) DEFAULT '0' NOT NULL,
	"investable_capital" numeric(18, 2) DEFAULT '0' NOT NULL,
	"capital_commitments" numeric(18, 2) DEFAULT '0' NOT NULL,
	"contingent_liabilities" numeric(18, 2) DEFAULT '0' NOT NULL,
	"productive_capital_ratio_bps" integer,
	"capital_utilisation_bps" integer,
	"by_entity" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"by_country" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"by_asset_class" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excluded" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"basis" text DEFAULT 'DERIVED' NOT NULL,
	"authoritative_owner" text DEFAULT 'FINANCE_OS' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_business_maturity_assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_ref" text NOT NULL,
	"as_of" date NOT NULL,
	"dimensions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assessed_level" text NOT NULL,
	"key_persons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assessor_ref" text NOT NULL,
	"assessor_type" text DEFAULT 'HUMAN' NOT NULL,
	"adopted_by_ref" text,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_capital_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"capital_request_ref" text NOT NULL,
	"legal_entity_id" text,
	"country_code" text NOT NULL,
	"currency" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"title" text NOT NULL,
	"purpose" text NOT NULL,
	"requester_ref" text NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps_not_applicable" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_step_index" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'IN_PROGRESS' NOT NULL,
	"executor_ref" text,
	"reconciler_ref" text,
	"segregation_waived_by_policy" boolean DEFAULT false NOT NULL,
	"segregation_policy_ref" text,
	"authoritative_owner" text DEFAULT 'FINANCE_OS' NOT NULL,
	"finance_record_ref" text,
	"audit_ref" text,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_capital_doctrine_adopted" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"doctrine_id" text NOT NULL,
	"policy_key" text NOT NULL,
	"policy_version_ref" text,
	"adopted_by_ref" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"status" text DEFAULT 'ADOPTED' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_cash_flow_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text,
	"country_code" text NOT NULL,
	"currency" text NOT NULL,
	"period" text NOT NULL,
	"direction" text NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"basis" text NOT NULL,
	"source_ref" text NOT NULL,
	"recurring" boolean DEFAULT false NOT NULL,
	"sector_code" text,
	"authoritative_owner" text DEFAULT 'FINANCE_OS' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_committee_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"allocation_id" text,
	"decision" text NOT NULL,
	"body_ref" text NOT NULL,
	"members" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quorum_minimum" integer NOT NULL,
	"majority_rule" text NOT NULL,
	"decision_date" date NOT NULL,
	"reason" text NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"follow_ups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"authority_ref" text,
	"decided_by_actor_type" text DEFAULT 'HUMAN' NOT NULL,
	"requester_ref" text NOT NULL,
	"executor_ref" text,
	"reconciler_ref" text,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_decision_journal_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"investment_id" text,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"emotion_disclosure" text NOT NULL,
	"author_ref" text NOT NULL,
	"author_type" text DEFAULT 'HUMAN' NOT NULL,
	"as_of" date NOT NULL,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_education_lessons" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"topic" text NOT NULL,
	"format" text NOT NULL,
	"title" text NOT NULL,
	"learning_objective" text NOT NULL,
	"prerequisites" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"uses_live_family_data" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_generational_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"structure_ref" text NOT NULL,
	"objective" text NOT NULL,
	"generation" integer NOT NULL,
	"success_criteria" text NOT NULL,
	"required_preparation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"interests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_date" date,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"adopted_by_ref" text,
	"legal_effect_reference" text,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_investment_theses" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"investment_id" text NOT NULL,
	"thesis" text NOT NULL,
	"counter_thesis" text NOT NULL,
	"falsification_test" text NOT NULL,
	"major_assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"maximum_acceptable_loss" numeric(18, 2) NOT NULL,
	"exit_condition" text NOT NULL,
	"target_return_bps" integer,
	"target_holding_months" integer,
	"author_ref" text NOT NULL,
	"author_type" text DEFAULT 'HUMAN' NOT NULL,
	"as_of" date NOT NULL,
	"status" text DEFAULT 'CURRENT' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_investment_valuations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"investment_id" text NOT NULL,
	"value" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"basis" text NOT NULL,
	"source" text NOT NULL,
	"as_of" date NOT NULL,
	"professional_valuation_document_ref" text,
	"recorded_by" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_investments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text,
	"country_code" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"asset_class" text NOT NULL,
	"currency" text NOT NULL,
	"acquisition_cost" numeric(18, 2) NOT NULL,
	"cash_invested" numeric(18, 2) NOT NULL,
	"acquisition_date" date NOT NULL,
	"current_value" numeric(18, 2),
	"current_value_basis" text,
	"current_value_source" text,
	"valued_as_of" date,
	"professional_valuation_document_ref" text,
	"realised_gain" numeric(18, 2) DEFAULT '0' NOT NULL,
	"annual_cash_flow" numeric(18, 2) DEFAULT '0' NOT NULL,
	"realised_cash_flow" numeric(18, 2) DEFAULT '0' NOT NULL,
	"attributable_debt" numeric(18, 2) DEFAULT '0' NOT NULL,
	"liquidity" text NOT NULL,
	"risk_bps" integer,
	"governance_status" text DEFAULT 'IDEA' NOT NULL,
	"held_years" integer DEFAULT 0 NOT NULL,
	"exit_strategy" text,
	"exit_value_assumption" numeric(18, 2),
	"legal_review_ref" text,
	"tax_review_ref" text,
	"committee_decision_id" text,
	"authoritative_owner" text DEFAULT 'FINANCE_OS' NOT NULL,
	"finance_record_ref" text,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_liquidity_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"as_of" date NOT NULL,
	"currency" text NOT NULL,
	"liquid" numeric(18, 2) NOT NULL,
	"near_liquid" numeric(18, 2) DEFAULT '0' NOT NULL,
	"illiquid" numeric(18, 2) DEFAULT '0' NOT NULL,
	"horizons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"liquidity_coverage_bps" integer,
	"liquidity_runway_days" integer,
	"average_daily_net_obligation" numeric(18, 2) DEFAULT '0' NOT NULL,
	"alerts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"basis" text DEFAULT 'SCENARIO' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_obligation_covenants" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"obligation_id" text NOT NULL,
	"covenant_type" text NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"measure_code" text,
	"direction" text,
	"threshold_bps" integer,
	"consequence_on_breach" text,
	"cure_period_days" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_obligations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"kind" text NOT NULL,
	"direction" text NOT NULL,
	"borrower_ref" text NOT NULL,
	"borrower_name" text NOT NULL,
	"borrower_party_type" text NOT NULL,
	"borrower_country_code" text NOT NULL,
	"borrower_legal_entity_id" text,
	"lender_ref" text NOT NULL,
	"lender_name" text NOT NULL,
	"lender_party_type" text NOT NULL,
	"lender_country_code" text NOT NULL,
	"lender_legal_entity_id" text,
	"owner_ref" text,
	"currency" text NOT NULL,
	"principal" numeric(18, 2) NOT NULL,
	"outstanding" numeric(18, 2) NOT NULL,
	"annual_rate_bps" integer DEFAULT 0 NOT NULL,
	"rate_type" text NOT NULL,
	"floating_reference" text,
	"floating_spread_bps" integer,
	"maturity_date" date,
	"payment_frequency" text NOT NULL,
	"amortisation" text NOT NULL,
	"collateral_description" text,
	"collateral_ref" text,
	"guarantee_description" text,
	"guarantor_ref" text,
	"guarantee_direction" text DEFAULT 'NONE' NOT NULL,
	"agreement_document_ref" text,
	"approval_ref" text,
	"authorised_by" text,
	"legal_review_ref" text,
	"jurisdiction_ref" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"authoritative_owner" text DEFAULT 'FINANCE_OS' NOT NULL,
	"epistemic_class" text DEFAULT 'OBSERVED' NOT NULL,
	"finance_record_ref" text,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_post_investment_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"investment_id" text NOT NULL,
	"pre_investment_entry_id" text NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outcome" text NOT NULL,
	"lessons_applied" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"realised_gain" numeric(18, 2) NOT NULL,
	"maximum_acceptable_loss" numeric(18, 2) NOT NULL,
	"maximum_loss_breached" boolean DEFAULT false NOT NULL,
	"reviewer_ref" text NOT NULL,
	"reviewer_type" text DEFAULT 'HUMAN' NOT NULL,
	"as_of" date NOT NULL,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_real_estate_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text,
	"country_code" text NOT NULL,
	"property_class" text NOT NULL,
	"name" text NOT NULL,
	"stage" text DEFAULT 'OPPORTUNITY' NOT NULL,
	"gross_potential_rent" numeric(18, 2) DEFAULT '0' NOT NULL,
	"vacancy_bps" integer DEFAULT 0 NOT NULL,
	"other_income" numeric(18, 2) DEFAULT '0' NOT NULL,
	"operating_expenses" numeric(18, 2) DEFAULT '0' NOT NULL,
	"maintenance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"property_tax" numeric(18, 2) DEFAULT '0' NOT NULL,
	"insurance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"purchase_price" numeric(18, 2),
	"cash_invested" numeric(18, 2),
	"debt" numeric(18, 2),
	"annual_rate_bps" integer,
	"rate_type" text,
	"annual_debt_service" numeric(18, 2),
	"tenor_months" integer,
	"amortisation" text,
	"currency" text NOT NULL,
	"valuation" numeric(18, 2),
	"valuation_basis" text,
	"valuation_source" text,
	"valued_as_of" date,
	"professional_valuation_document_ref" text,
	"held_years" integer DEFAULT 0 NOT NULL,
	"exit_value_assumption" numeric(18, 2),
	"exit_strategy" text,
	"annual_cash_flow_after_debt" numeric(18, 2),
	"realised_cash_flow" numeric(18, 2) DEFAULT '0' NOT NULL,
	"acquisition_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"cleared_gates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"authoritative_owner" text DEFAULT 'FINANCE_OS' NOT NULL,
	"finance_record_ref" text,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_real_estate_financing_models" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"property_id" text,
	"structure" text NOT NULL,
	"model_only" boolean DEFAULT true NOT NULL,
	"executed_legal_transaction" boolean DEFAULT false NOT NULL,
	"jurisdiction_ref" text NOT NULL,
	"counterparty_ref" text NOT NULL,
	"counterparty_name" text NOT NULL,
	"counterparty_country_code" text NOT NULL,
	"credit_analysis_ref" text,
	"legal_review_ref" text,
	"tax_review_ref" text,
	"collateral_description" text,
	"default_scenario" text,
	"documentation_ref" text,
	"governance_approval_ref" text,
	"currency" text NOT NULL,
	"financed_amount" numeric(18, 2) NOT NULL,
	"annual_rate_bps" integer DEFAULT 0 NOT NULL,
	"tenor_months" integer NOT NULL,
	"purchase_price" numeric(18, 2),
	"credited_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_regulatory_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"domain" text NOT NULL,
	"classification" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	"event_date" date NOT NULL,
	"jurisdiction_ref" text NOT NULL,
	"country_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" text NOT NULL,
	"affected_entity_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"affected_asset_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommended_action" text,
	"review_assigned_to" text,
	"review_due_date" date,
	"status" text DEFAULT 'NEW' NOT NULL,
	"recorded_by" text NOT NULL,
	"recorded_by_actor_type" text DEFAULT 'HUMAN' NOT NULL,
	"security_classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_scenario_models" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"scenario_type" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"basis" text DEFAULT 'SCENARIO' NOT NULL,
	"outcome_guaranteed" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"as_of" date NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_scenario_results" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"scenario_model_id" text NOT NULL,
	"case_label" text NOT NULL,
	"axis" text,
	"shock_bps" integer,
	"outputs" jsonb NOT NULL,
	"basis" text DEFAULT 'SCENARIO' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_tax_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"subject_ref" text NOT NULL,
	"subject_kind" text NOT NULL,
	"jurisdiction_ref" text NOT NULL,
	"country_code" text NOT NULL,
	"tax_type" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"level" text NOT NULL,
	"rule_reference" text,
	"rule_as_of" date,
	"professional_review_ref" text,
	"finance_record_ref" text,
	"recorded_by" text NOT NULL,
	"recorded_by_actor_type" text DEFAULT 'HUMAN' NOT NULL,
	"as_of" date NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "family_asset_ladder_positions" ADD CONSTRAINT "family_asset_ladder_positions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_balance_sheet_snapshots" ADD CONSTRAINT "family_balance_sheet_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_business_maturity_assessments" ADD CONSTRAINT "family_business_maturity_assessments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_capital_allocations" ADD CONSTRAINT "family_capital_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_capital_allocations" ADD CONSTRAINT "family_capital_allocations_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_capital_doctrine_adopted" ADD CONSTRAINT "family_capital_doctrine_adopted_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_cash_flow_items" ADD CONSTRAINT "family_cash_flow_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_cash_flow_items" ADD CONSTRAINT "family_cash_flow_items_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_committee_decisions" ADD CONSTRAINT "family_committee_decisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_committee_decisions" ADD CONSTRAINT "family_committee_decisions_allocation_id_family_capital_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."family_capital_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_decision_journal_entries" ADD CONSTRAINT "family_decision_journal_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_decision_journal_entries" ADD CONSTRAINT "family_decision_journal_entries_investment_id_family_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."family_investments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_education_lessons" ADD CONSTRAINT "family_education_lessons_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_generational_plans" ADD CONSTRAINT "family_generational_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_investment_theses" ADD CONSTRAINT "family_investment_theses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_investment_theses" ADD CONSTRAINT "family_investment_theses_investment_id_family_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."family_investments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_investment_valuations" ADD CONSTRAINT "family_investment_valuations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_investment_valuations" ADD CONSTRAINT "family_investment_valuations_investment_id_family_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."family_investments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_investments" ADD CONSTRAINT "family_investments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_investments" ADD CONSTRAINT "family_investments_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_liquidity_snapshots" ADD CONSTRAINT "family_liquidity_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_obligation_covenants" ADD CONSTRAINT "family_obligation_covenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_obligation_covenants" ADD CONSTRAINT "family_obligation_covenants_obligation_id_family_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."family_obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_obligations" ADD CONSTRAINT "family_obligations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_obligations" ADD CONSTRAINT "family_obligations_borrower_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("borrower_legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_obligations" ADD CONSTRAINT "family_obligations_lender_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("lender_legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_post_investment_reviews" ADD CONSTRAINT "family_post_investment_reviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_post_investment_reviews" ADD CONSTRAINT "family_post_investment_reviews_investment_id_family_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."family_investments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_post_investment_reviews" ADD CONSTRAINT "family_post_investment_reviews_pre_investment_entry_id_family_decision_journal_entries_id_fk" FOREIGN KEY ("pre_investment_entry_id") REFERENCES "public"."family_decision_journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_real_estate_assets" ADD CONSTRAINT "family_real_estate_assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_real_estate_assets" ADD CONSTRAINT "family_real_estate_assets_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_real_estate_financing_models" ADD CONSTRAINT "family_real_estate_financing_models_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_real_estate_financing_models" ADD CONSTRAINT "family_real_estate_financing_models_property_id_family_real_estate_assets_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."family_real_estate_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_regulatory_events" ADD CONSTRAINT "family_regulatory_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_scenario_models" ADD CONSTRAINT "family_scenario_models_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_scenario_results" ADD CONSTRAINT "family_scenario_results_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_scenario_results" ADD CONSTRAINT "family_scenario_results_scenario_model_id_family_scenario_models_id_fk" FOREIGN KEY ("scenario_model_id") REFERENCES "public"."family_scenario_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_tax_positions" ADD CONSTRAINT "family_tax_positions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_asset_ladder_positions_tenant_idx" ON "family_asset_ladder_positions" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_balance_sheet_snapshots_uidx" ON "family_balance_sheet_snapshots" USING btree ("tenant_id","as_of","currency");--> statement-breakpoint
CREATE INDEX "family_business_maturity_assessments_entity_idx" ON "family_business_maturity_assessments" USING btree ("legal_entity_ref","as_of");--> statement-breakpoint
CREATE INDEX "family_capital_allocations_tenant_idx" ON "family_capital_allocations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "family_capital_allocations_status_idx" ON "family_capital_allocations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "family_capital_doctrine_adopted_uidx" ON "family_capital_doctrine_adopted" USING btree ("tenant_id","doctrine_id","effective_from");--> statement-breakpoint
CREATE INDEX "family_capital_doctrine_adopted_tenant_idx" ON "family_capital_doctrine_adopted" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "family_cash_flow_items_tenant_period_idx" ON "family_cash_flow_items" USING btree ("tenant_id","period");--> statement-breakpoint
CREATE INDEX "family_cash_flow_items_category_idx" ON "family_cash_flow_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "family_committee_decisions_allocation_idx" ON "family_committee_decisions" USING btree ("allocation_id");--> statement-breakpoint
CREATE INDEX "family_decision_journal_entries_tenant_idx" ON "family_decision_journal_entries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "family_education_lessons_topic_idx" ON "family_education_lessons" USING btree ("topic","format");--> statement-breakpoint
CREATE INDEX "family_generational_plans_tenant_idx" ON "family_generational_plans" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "family_investment_theses_investment_idx" ON "family_investment_theses" USING btree ("investment_id");--> statement-breakpoint
CREATE INDEX "family_investment_valuations_investment_idx" ON "family_investment_valuations" USING btree ("investment_id","as_of");--> statement-breakpoint
CREATE INDEX "family_investments_tenant_idx" ON "family_investments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "family_investments_entity_idx" ON "family_investments" USING btree ("legal_entity_id");--> statement-breakpoint
CREATE INDEX "family_investments_status_idx" ON "family_investments" USING btree ("governance_status");--> statement-breakpoint
CREATE UNIQUE INDEX "family_liquidity_snapshots_uidx" ON "family_liquidity_snapshots" USING btree ("tenant_id","as_of","currency");--> statement-breakpoint
CREATE INDEX "family_obligation_covenants_obligation_idx" ON "family_obligation_covenants" USING btree ("obligation_id");--> statement-breakpoint
CREATE INDEX "family_obligations_tenant_idx" ON "family_obligations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "family_obligations_status_idx" ON "family_obligations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "family_obligations_country_idx" ON "family_obligations" USING btree ("borrower_country_code","lender_country_code");--> statement-breakpoint
CREATE INDEX "family_post_investment_reviews_investment_idx" ON "family_post_investment_reviews" USING btree ("investment_id");--> statement-breakpoint
CREATE INDEX "family_real_estate_assets_tenant_idx" ON "family_real_estate_assets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "family_real_estate_assets_stage_idx" ON "family_real_estate_assets" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "family_real_estate_financing_models_tenant_idx" ON "family_real_estate_financing_models" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "family_regulatory_events_tenant_idx" ON "family_regulatory_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "family_regulatory_events_domain_idx" ON "family_regulatory_events" USING btree ("domain","classification");--> statement-breakpoint
CREATE INDEX "family_scenario_models_tenant_idx" ON "family_scenario_models" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "family_scenario_results_model_idx" ON "family_scenario_results" USING btree ("scenario_model_id");--> statement-breakpoint
CREATE INDEX "family_tax_positions_subject_idx" ON "family_tax_positions" USING btree ("tenant_id","subject_ref");--> statement-breakpoint
/*
 * ---------------------------------------------------------------------------
 * ROW LEVEL SECURITY — Family Office capital & wealth tables.
 *
 * Every table created above is tenant-isolated with the canonical
 * `tenant_id = ANY (beyu_tenant_ids())` policy defined in migration 0001, exactly
 * as 0034/0035 do for Agriculture OS and Foundation OS. USING and WITH CHECK are
 * both set: USING alone would let a row be inserted into another tenant's scope.
 *
 * Entity and country isolation are expressed as columns (legal_entity_id,
 * country_code) and enforced by the query layer (`src/lib/tenant-scope.ts`) and
 * the OfficeScope containment rule (`src/lib/family/office/types.ts`), which
 * refuses an entity or jurisdiction escape at the record level. RLS is the
 * tenant boundary; the scope engine is the entity/country boundary.
 * ---------------------------------------------------------------------------
 */
ALTER TABLE "family_capital_doctrine_adopted" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_capital_doctrine_adopted_tenant_isolation ON family_capital_doctrine_adopted USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_asset_ladder_positions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_asset_ladder_positions_tenant_isolation ON family_asset_ladder_positions USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_obligations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_obligations_tenant_isolation ON family_obligations USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_obligation_covenants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_obligation_covenants_tenant_isolation ON family_obligation_covenants USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_investments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_investments_tenant_isolation ON family_investments USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_investment_theses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_investment_theses_tenant_isolation ON family_investment_theses USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_investment_valuations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_investment_valuations_tenant_isolation ON family_investment_valuations USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_decision_journal_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_decision_journal_entries_tenant_isolation ON family_decision_journal_entries USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_post_investment_reviews" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_post_investment_reviews_tenant_isolation ON family_post_investment_reviews USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_real_estate_assets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_real_estate_assets_tenant_isolation ON family_real_estate_assets USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_real_estate_financing_models" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_real_estate_financing_models_tenant_isolation ON family_real_estate_financing_models USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_cash_flow_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_cash_flow_items_tenant_isolation ON family_cash_flow_items USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_balance_sheet_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_balance_sheet_snapshots_tenant_isolation ON family_balance_sheet_snapshots USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_liquidity_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_liquidity_snapshots_tenant_isolation ON family_liquidity_snapshots USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_scenario_models" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_scenario_models_tenant_isolation ON family_scenario_models USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_scenario_results" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_scenario_results_tenant_isolation ON family_scenario_results USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_capital_allocations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_capital_allocations_tenant_isolation ON family_capital_allocations USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_committee_decisions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_committee_decisions_tenant_isolation ON family_committee_decisions USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_regulatory_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_regulatory_events_tenant_isolation ON family_regulatory_events USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_tax_positions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_tax_positions_tenant_isolation ON family_tax_positions USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_generational_plans" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_generational_plans_tenant_isolation ON family_generational_plans USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_education_lessons" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_education_lessons_tenant_isolation ON family_education_lessons USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE "family_business_maturity_assessments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY family_business_maturity_assessments_tenant_isolation ON family_business_maturity_assessments USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
/* Runtime DML grant, mirroring 0034/0035. No DDL is ever granted to the runtime role. */
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO %I', 'family_capital_doctrine_adopted, family_asset_ladder_positions, family_obligations, family_obligation_covenants, family_investments, family_investment_theses, family_investment_valuations, family_decision_journal_entries, family_post_investment_reviews, family_real_estate_assets, family_real_estate_financing_models, family_cash_flow_items, family_balance_sheet_snapshots, family_liquidity_snapshots, family_scenario_models, family_scenario_results, family_capital_allocations, family_committee_decisions, family_regulatory_events, family_tax_positions, family_generational_plans, family_education_lessons, family_business_maturity_assessments', r.rolname);
    RAISE NOTICE 'granted family office capital DML to %', r.rolname;
  END LOOP;
END
$$;
--> statement-breakpoint
/*
 * Verification. The migration FAILS if any table lacks its tenant isolation
 * policy, so a half-applied migration cannot leave an unprotected family capital
 * table behind. This mirrors the verification block in 0034/0035.
 */
DO $$
DECLARE
  table_name text;
  policy_count int;
BEGIN
  FOR table_name IN SELECT unnest(ARRAY['family_capital_doctrine_adopted', 'family_asset_ladder_positions', 'family_obligations', 'family_obligation_covenants', 'family_investments', 'family_investment_theses', 'family_investment_valuations', 'family_decision_journal_entries', 'family_post_investment_reviews', 'family_real_estate_assets', 'family_real_estate_financing_models', 'family_cash_flow_items', 'family_balance_sheet_snapshots', 'family_liquidity_snapshots', 'family_scenario_models', 'family_scenario_results', 'family_capital_allocations', 'family_committee_decisions', 'family_regulatory_events', 'family_tax_positions', 'family_generational_plans', 'family_education_lessons', 'family_business_maturity_assessments'])
  LOOP
    SELECT count(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = table_name
      AND policyname = table_name || '_tenant_isolation';
    IF policy_count = 0 THEN
      RAISE EXCEPTION 'Migration 0036 verification failed: % has no tenant isolation policy', table_name;
    END IF;
  END LOOP;
END $$;
