-- ---------------------------------------------------------------------------
-- BEYU OS — 0074 ENTERPRISE INTELLIGENCE EXPANSION
--
-- THREE additive domains, ONE canonical architecture. This migration creates no
-- OS, no ledger, no identity and no audit system:
--
--   1. FINANCE INTELLIGENCE — valuation models with versioned, fingerprinted
--      assumption sets; metric observations carrying full provenance; private
--      equity funds, participants, capital calls, distributions, portfolio
--      companies, due diligence and investment-committee decisions; LBO models,
--      tranches and runs; and a capital-formation register whose `capital_origin`
--      separates BEYU's own capital from fiduciary, project and guaranteed
--      capital so no query can merge them by accident.
--
--   2. HCM COMPENSATION, BENEFITS & EMPLOYEE WELFARE — versioned policies,
--      employee entitlements, cleared approval stages, credit facilities with
--      stored repayment schedules, emergency-assistance cases and employee
--      development sponsorships. HCM is a SHARED CAPABILITY, never an HR OS:
--      these tables extend the existing people domain and record ENTITLEMENTS.
--      Payments remain Finance OS facts, referenced by `finance_reference_id`.
--
--   3. SHARED PRICING, MARGIN & PROFITABILITY — price lists and items where the
--      database itself enforces markup = (price-cost)/cost and
--      margin = (price-cost)/price; approved pricing decisions; versioned cost
--      allocation rule sets; exact, remainder-carrying allocation runs; and the
--      §12 profitability ladder.
--
-- INVARIANTS THIS MIGRATION HOLDS ITSELF TO
--   * Money is numeric(38,0) INTEGER MINOR UNITS with an explicit currency on
--     every monetary row. No float, no implicit currency, anywhere.
--   * Rates are integer basis points; absent values are NULL (undefined), never
--     zero — a zero denominator must not become a zero rate.
--   * Markup and margin are separately named and constrained so the two can
--     never be interchanged. 100 cost / 125 price = 2500 bps markup, 2000 bps
--     margin.
--   * Segregation of duties is enforced by the DATABASE for the two paths that
--     matter most: compensation approval stages cannot be cleared by their own
--     beneficiary, and an investment-committee decision cannot be proposed and
--     decided by the same principal.
--   * Structural faults (a LBO whose sources do not equal its uses; a metric
--     with a value in a MISSING state) are refused by CHECK constraints and by
--     the engines that feed them.
--
-- NOTHING HERE POSTS TO THE LEDGER. CAP_POSTING remains LOCKED; journal_entries
-- and journal_lines remain the only booked truth in BEYU OS.
-- ---------------------------------------------------------------------------

CREATE TABLE "compensation_approval_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"entitlement_id" text NOT NULL,
	"stage" text NOT NULL,
	"actor_principal_id" text NOT NULL,
	"beneficiary_principal_id" text,
	"note" text,
	"acted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sequence" integer NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	CONSTRAINT "compensation_approval_stages_stage_check" CHECK (stage IN ('MANAGER_RECOMMENDATION','HR_VALIDATION','FINANCE_VALIDATION','FINAL_APPROVAL','PAYMENT')),
	CONSTRAINT "compensation_approval_stages_sod_check" CHECK (beneficiary_principal_id IS NULL OR actor_principal_id <> beneficiary_principal_id),
	CONSTRAINT "compensation_approval_stages_note_check" CHECK (stage = 'PAYMENT' OR (note IS NOT NULL AND char_length(note) >= 4))
);

--> statement-breakpoint
CREATE TABLE "compensation_entitlements" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"employee_principal_id" text,
	"policy_id" text,
	"policy_version" integer,
	"kind" text NOT NULL,
	"period" text,
	"currency" text NOT NULL,
	"amount_minor" numeric(38, 0) NOT NULL,
	"data_state" text DEFAULT 'CALCULATED' NOT NULL,
	"financial_treatment" text NOT NULL,
	"eligibility" text NOT NULL,
	"reason" text NOT NULL,
	"policy_ref" text NOT NULL,
	"effective_date" date NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"calculation" jsonb,
	"finance_reference_id" text,
	"employment_relationship_ref" text,
	"raised_by" text NOT NULL,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	CONSTRAINT "compensation_entitlements_kind_check" CHECK (kind IN ('BASE_COMPENSATION','PERFORMANCE_BONUS','PROFIT_SHARING','SALES_COMMISSION','PROJECT_COMPLETION_BONUS','RETENTION_BONUS','RECOGNITION_AWARD','DISCRETIONARY_BONUS','ALLOWANCE','BENEFIT','EMPLOYEE_CREDIT','EMERGENCY_ASSISTANCE','EDUCATION_SPONSORSHIP','PROFESSIONAL_DEVELOPMENT')),
	CONSTRAINT "compensation_entitlements_treatment_check" CHECK (financial_treatment IN ('PAYROLL','EXPENSE_REIMBURSEMENT','FRINGE_BENEFIT','LOAN_ADVANCE','NON_CASH_RECOGNITION','NON_REPAYABLE_WELFARE')),
	CONSTRAINT "compensation_entitlements_status_check" CHECK (status IN ('DRAFT','PENDING','APPROVED','REJECTED','PAID','CANCELLED','EXPIRED')),
	CONSTRAINT "compensation_entitlements_state_check" CHECK (data_state IN ('VERIFIED','CALCULATED','ESTIMATED','FORECAST')),
	CONSTRAINT "compensation_entitlements_amount_check" CHECK (amount_minor >= 0),
	CONSTRAINT "compensation_entitlements_base_source_check" CHECK (kind <> 'BASE_COMPENSATION' OR employment_relationship_ref IS NOT NULL),
	CONSTRAINT "compensation_entitlements_currency_check" CHECK (char_length(currency) = 3),
	CONSTRAINT "compensation_entitlements_reason_check" CHECK (char_length(reason) >= 3 AND char_length(eligibility) >= 3),
	CONSTRAINT "compensation_entitlements_paid_check" CHECK (status <> 'PAID' OR finance_reference_id IS NOT NULL)
);

--> statement-breakpoint
CREATE TABLE "compensation_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text,
	"code" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"policy_family" text NOT NULL,
	"policy_type" text NOT NULL,
	"calculation_basis" text,
	"currency" text NOT NULL,
	"rate_bps" integer,
	"fixed_amount_minor" numeric(38, 0),
	"unit_rate_minor" numeric(38, 0),
	"budget_minor" numeric(38, 0),
	"monthly_ceiling_minor" numeric(38, 0),
	"minimum_service_months" integer,
	"performance_threshold_bps" integer,
	"quota_minor" numeric(38, 0),
	"requires_manager_recommendation" boolean DEFAULT true NOT NULL,
	"requires_hr_validation" boolean DEFAULT true NOT NULL,
	"requires_finance_validation" boolean DEFAULT true NOT NULL,
	"requires_final_approval" boolean DEFAULT true NOT NULL,
	"eligibility_rule" text NOT NULL,
	"policy_statement" text NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"approval_ref" text,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compensation_policies_family_check" CHECK (policy_family IN ('BONUS','ALLOWANCE','CREDIT','WELFARE','BENEFIT','SPONSORSHIP')),
	CONSTRAINT "compensation_policies_currency_check" CHECK (char_length(currency) = 3),
	CONSTRAINT "compensation_policies_version_check" CHECK (version >= 1),
	CONSTRAINT "compensation_policies_rate_check" CHECK (rate_bps IS NULL OR (rate_bps >= 0 AND rate_bps <= 10000)),
	CONSTRAINT "compensation_policies_amounts_check" CHECK ((fixed_amount_minor IS NULL OR fixed_amount_minor >= 0) AND (unit_rate_minor IS NULL OR unit_rate_minor >= 0) AND (budget_minor IS NULL OR budget_minor >= 0) AND (monthly_ceiling_minor IS NULL OR monthly_ceiling_minor >= 0) AND (quota_minor IS NULL OR quota_minor >= 0)),
	CONSTRAINT "compensation_policies_approval_check" CHECK ((approved = false AND approval_ref IS NULL) OR (approved = true AND approval_ref IS NOT NULL)),
	CONSTRAINT "compensation_policies_period_check" CHECK (effective_to IS NULL OR effective_to >= effective_from),
	CONSTRAINT "compensation_policies_eligibility_check" CHECK (char_length(eligibility_rule) >= 8)
);

--> statement-breakpoint
CREATE TABLE "emergency_assistance_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"employee_principal_id" text,
	"case_number" text NOT NULL,
	"category" text NOT NULL,
	"currency" text NOT NULL,
	"requested_amount_minor" numeric(38, 0) NOT NULL,
	"approved_amount_minor" numeric(38, 0),
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"repayable" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'SUBMITTED' NOT NULL,
	"review_notes" text,
	"review_findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approval_ref" text,
	"approved_by_principal_id" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"finance_reference_id" text,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	CONSTRAINT "emergency_assistance_cases_status_check" CHECK (status IN ('SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','DISBURSED','CLOSED')),
	CONSTRAINT "emergency_assistance_cases_amount_check" CHECK (requested_amount_minor > 0),
	CONSTRAINT "emergency_assistance_cases_approved_check" CHECK (approved_amount_minor IS NULL OR (approved_amount_minor >= 0 AND approved_amount_minor <= requested_amount_minor)),
	CONSTRAINT "emergency_assistance_cases_currency_check" CHECK (char_length(currency) = 3),
	CONSTRAINT "emergency_assistance_cases_category_check" CHECK (char_length(category) >= 3),
	CONSTRAINT "emergency_assistance_cases_approval_check" CHECK (status NOT IN ('APPROVED','DISBURSED') OR (approval_ref IS NOT NULL AND approved_amount_minor IS NOT NULL)),
	CONSTRAINT "emergency_assistance_cases_sod_check" CHECK (employee_principal_id IS NULL OR approved_by_principal_id IS NULL OR approved_by_principal_id <> employee_principal_id)
);

--> statement-breakpoint
CREATE TABLE "employee_credit_facilities" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"employee_principal_id" text,
	"kind" text NOT NULL,
	"policy_id" text,
	"currency" text NOT NULL,
	"principal_minor" numeric(38, 0) NOT NULL,
	"annual_interest_rate_bps" integer DEFAULT 0 NOT NULL,
	"instalments" integer NOT NULL,
	"first_instalment_date" date NOT NULL,
	"payroll_deduction_authorised" boolean DEFAULT false NOT NULL,
	"authorisation_ref" text,
	"maximum_deduction_per_period_minor" numeric(38, 0),
	"purpose" text NOT NULL,
	"approval_ref" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"disbursed_on" date,
	"finance_reference_id" text,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_credit_facilities_kind_check" CHECK (kind IN ('SALARY_ADVANCE','EMPLOYEE_LOAN','EMERGENCY_CREDIT','EDUCATION_CREDIT')),
	CONSTRAINT "employee_credit_facilities_currency_check" CHECK (char_length(currency) = 3),
	CONSTRAINT "employee_credit_facilities_principal_check" CHECK (principal_minor > 0),
	CONSTRAINT "employee_credit_facilities_instalments_check" CHECK (instalments >= 1),
	CONSTRAINT "employee_credit_facilities_rate_check" CHECK (annual_interest_rate_bps > -10000),
	CONSTRAINT "employee_credit_facilities_deduction_check" CHECK (payroll_deduction_authorised = false OR authorisation_ref IS NOT NULL),
	CONSTRAINT "employee_credit_facilities_status_check" CHECK (status IN ('DRAFT','PENDING','APPROVED','REJECTED','PAID','CANCELLED','EXPIRED')),
	CONSTRAINT "employee_credit_facilities_disbursed_check" CHECK (disbursed_on IS NULL OR status = 'PAID')
);

--> statement-breakpoint
CREATE TABLE "employee_credit_instalments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"facility_id" text NOT NULL,
	"number" integer NOT NULL,
	"due_date" date NOT NULL,
	"opening_balance_minor" numeric(38, 0) NOT NULL,
	"interest_minor" numeric(38, 0) NOT NULL,
	"principal_minor" numeric(38, 0) NOT NULL,
	"instalment_minor" numeric(38, 0) NOT NULL,
	"closing_balance_minor" numeric(38, 0) NOT NULL,
	"paid_on" date,
	"finance_reference_id" text,
	CONSTRAINT "employee_credit_instalments_number_check" CHECK (number >= 1),
	CONSTRAINT "employee_credit_instalments_amounts_check" CHECK (opening_balance_minor >= 0 AND interest_minor >= 0 AND principal_minor >= 0 AND instalment_minor > 0 AND closing_balance_minor >= 0),
	CONSTRAINT "employee_credit_instalments_balance_check" CHECK (opening_balance_minor - principal_minor = closing_balance_minor),
	CONSTRAINT "employee_credit_instalments_instalment_check" CHECK (instalment_minor = principal_minor + interest_minor)
);

--> statement-breakpoint
CREATE TABLE "employee_sponsorships" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"domain" text DEFAULT 'EMPLOYEE_DEVELOPMENT' NOT NULL,
	"owner_capability" text DEFAULT 'HCM' NOT NULL,
	"policy_id" text,
	"programme" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" numeric(38, 0) NOT NULL,
	"financial_treatment" text DEFAULT 'FRINGE_BENEFIT' NOT NULL,
	"retention_obligation_months" integer,
	"repayable_on_early_exit" boolean DEFAULT false NOT NULL,
	"policy_ref" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"finance_reference_id" text,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_sponsorships_domain_check" CHECK (domain = 'EMPLOYEE_DEVELOPMENT'),
	CONSTRAINT "employee_sponsorships_owner_check" CHECK (owner_capability = 'HCM'),
	CONSTRAINT "employee_sponsorships_treatment_check" CHECK (financial_treatment IN ('FRINGE_BENEFIT','EXPENSE_REIMBURSEMENT')),
	CONSTRAINT "employee_sponsorships_amount_check" CHECK (amount_minor >= 0),
	CONSTRAINT "employee_sponsorships_currency_check" CHECK (char_length(currency) = 3),
	CONSTRAINT "employee_sponsorships_retention_check" CHECK (repayable_on_early_exit = false OR (retention_obligation_months IS NOT NULL AND retention_obligation_months > 0))
);

--> statement-breakpoint
CREATE TABLE "capital_formation_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"capital_origin" text NOT NULL,
	"currency" text NOT NULL,
	"commitment_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"drawn_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"as_of" date NOT NULL,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capital_formation_positions_origin_check" CHECK ("capital_origin" IN ('OWN','FIDUCIARY','PROJECT','GUARANTEED')),
	CONSTRAINT "capital_formation_positions_amount_check" CHECK ("commitment_minor" >= 0 AND "drawn_minor" >= 0 AND "drawn_minor" <= "commitment_minor")
);

--> statement-breakpoint
CREATE TABLE "entrusted_capital_arrangements" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"provider_party_id" text NOT NULL,
	"beneficial_owner_party_id" text,
	"instrument" text NOT NULL,
	"capital_origin" text NOT NULL,
	"currency" text NOT NULL,
	"commitment_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"drawn_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"purpose" text NOT NULL,
	"restrictions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fiduciary_restrictions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"maturity_date" date,
	"repayable" boolean DEFAULT true NOT NULL,
	"return_rate_bps" integer,
	"fee_rate_bps" integer,
	"governing_agreement_ref" text,
	"covenant_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approval_ref" text,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entrusted_capital_arrangements_currency_check" CHECK (char_length("currency") = 3),
	CONSTRAINT "entrusted_capital_arrangements_instrument_check" CHECK ("instrument" IN ('EXTERNAL_INVESTOR_EQUITY','LP_COMMITMENT','CO_INVESTMENT','THIRD_PARTY_DEBT','PROJECT_FINANCE','MANAGED_CAPITAL','ENTRUSTED_FUND','INVESTMENT_MANDATE','GUARANTEE','CREDIT_FACILITY','EXTERNAL_FINANCING','CAPITAL_COMMITMENT')),
	CONSTRAINT "entrusted_capital_arrangements_origin_check" CHECK ("capital_origin" IN ('OWN','FIDUCIARY','PROJECT','GUARANTEED')),
	CONSTRAINT "entrusted_capital_arrangements_amount_check" CHECK ("commitment_minor" >= 0 AND "drawn_minor" >= 0 AND "drawn_minor" <= "commitment_minor"),
	CONSTRAINT "entrusted_capital_arrangements_status_check" CHECK ("status" IN ('PROPOSED','APPROVED','ACTIVE','MATURED','REPAID','CANCELLED')),
	CONSTRAINT "entrusted_capital_arrangements_restrictions_check" CHECK ("capital_origin" = 'OWN' OR jsonb_array_length("restrictions") > 0),
	CONSTRAINT "entrusted_capital_arrangements_fiduciary_check" CHECK ("capital_origin" <> 'FIDUCIARY' OR jsonb_array_length("fiduciary_restrictions") > 0),
	CONSTRAINT "entrusted_capital_arrangements_approval_check" CHECK ("status" <> 'ACTIVE' OR "approval_ref" IS NOT NULL)
);

--> statement-breakpoint
CREATE TABLE "entrusted_capital_drawdowns" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"arrangement_id" text NOT NULL,
	"sequence_number" integer NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" numeric(38, 0) NOT NULL,
	"purpose" text NOT NULL,
	"drawdown_date" date NOT NULL,
	"restriction_check_passed" boolean DEFAULT false NOT NULL,
	"restriction_notes" text,
	"finance_reference_id" text,
	"approval_ref" text,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entrusted_capital_drawdowns_amount_check" CHECK ("amount_minor" > 0),
	CONSTRAINT "entrusted_capital_drawdowns_restriction_check" CHECK ("restriction_check_passed" OR ("restriction_notes" IS NOT NULL AND char_length("restriction_notes") >= 8))
);

--> statement-breakpoint
CREATE TABLE "financial_instruments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text,
	"instrument_type" text NOT NULL,
	"symbol" text,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"share_class" text,
	"listed" boolean DEFAULT false NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_instruments_type_check" CHECK ("instrument_type" IN ('LISTED_EQUITY','PRIVATE_EQUITY','PREFERRED_EQUITY','CONVERTIBLE','CORPORATE_BOND','GOVERNMENT_BOND','FUND_INTEREST','PARTNERSHIP_INTEREST','REAL_ESTATE','OTHER')),
	CONSTRAINT "financial_instruments_currency_check" CHECK (char_length("currency") = 3)
);

--> statement-breakpoint
CREATE TABLE "financial_metric_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"metric_code" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"instrument_id" text,
	"legal_entity_id" text,
	"period" text,
	"currency" text,
	"value" numeric(38, 0),
	"value_scaled" numeric(38, 0),
	"data_state" text NOT NULL,
	"method" text NOT NULL,
	"calculation_version" text NOT NULL,
	"inputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text NOT NULL,
	"source_timestamp" timestamp with time zone,
	"data_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"confidence" numeric(5, 4),
	"quality" text DEFAULT 'UNSPECIFIED' NOT NULL,
	"reason" text,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"recorded_by" text NOT NULL,
	"trace_id" text,
	CONSTRAINT "financial_metric_observations_state_check" CHECK ("data_state" IN ('VERIFIED','CALCULATED','ESTIMATED','FORECAST','MISSING','NOT_APPLICABLE','INVALID')),
	CONSTRAINT "financial_metric_observations_value_pairing_check" CHECK ((("data_state" IN ('VERIFIED','CALCULATED','ESTIMATED','FORECAST')) AND ("value" IS NOT NULL OR "value_scaled" IS NOT NULL)) OR (("data_state" IN ('MISSING','NOT_APPLICABLE','INVALID')) AND "value" IS NULL AND "value_scaled" IS NULL AND "reason" IS NOT NULL)),
	CONSTRAINT "financial_metric_observations_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1))
);

--> statement-breakpoint
CREATE TABLE "lbo_debt_tranches" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lbo_model_id" text NOT NULL,
	"code" text NOT NULL,
	"seniority_rank" integer NOT NULL,
	"amount_minor" numeric(38, 0) NOT NULL,
	"interest_rate_bps" integer NOT NULL,
	"mandatory_amortisation_bps" integer DEFAULT 0 NOT NULL,
	"cash_sweep_eligible" boolean DEFAULT false NOT NULL,
	"cash_sweep_share_bps" integer DEFAULT 10000 NOT NULL,
	"is_revolver" boolean DEFAULT false NOT NULL,
	"commitment_minor" numeric(38, 0),
	"arrangement_fee_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	CONSTRAINT "lbo_debt_tranches_amount_check" CHECK ("amount_minor" >= 0),
	CONSTRAINT "lbo_debt_tranches_rate_check" CHECK ("interest_rate_bps" > -10000),
	CONSTRAINT "lbo_debt_tranches_amort_check" CHECK ("mandatory_amortisation_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "lbo_debt_tranches_sweep_check" CHECK ("cash_sweep_share_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "lbo_debt_tranches_revolver_check" CHECK (NOT "is_revolver" OR ("commitment_minor" IS NOT NULL AND "commitment_minor" >= "amount_minor"))
);

--> statement-breakpoint
CREATE TABLE "lbo_model_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lbo_model_id" text NOT NULL,
	"scenario_kind" text NOT NULL,
	"fingerprint" text NOT NULL,
	"currency" text NOT NULL,
	"sources_and_uses" jsonb NOT NULL,
	"projections" jsonb NOT NULL,
	"exit_enterprise_value_minor" numeric(38, 0),
	"exit_net_debt_minor" numeric(38, 0),
	"exit_equity_value_minor" numeric(38, 0),
	"sponsor_moic_scaled" numeric(38, 0),
	"sponsor_irr_bps" integer,
	"total_debt_paydown_minor" numeric(38, 0),
	"sensitivity" jsonb,
	"data_state" text NOT NULL,
	"reason" text,
	"run_by" text NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trace_id" text,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	CONSTRAINT "lbo_model_runs_scenario_check" CHECK ("scenario_kind" IN ('BASE','UPSIDE','DOWNSIDE','CUSTOM')),
	CONSTRAINT "lbo_model_runs_state_check" CHECK ("data_state" IN ('VERIFIED','CALCULATED','ESTIMATED','FORECAST','MISSING','NOT_APPLICABLE','INVALID')),
	CONSTRAINT "lbo_model_runs_reason_check" CHECK ("data_state" NOT IN ('MISSING','NOT_APPLICABLE','INVALID') OR ("reason" IS NOT NULL AND char_length("reason") >= 8))
);

--> statement-breakpoint
CREATE TABLE "lbo_models" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"model_id" text,
	"assumption_set_id" text NOT NULL,
	"portfolio_company_id" text,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"purchase_price_minor" numeric(38, 0) NOT NULL,
	"entry_multiple_scaled" numeric(38, 0) NOT NULL,
	"entry_ebitda_minor" numeric(38, 0) NOT NULL,
	"transaction_fee_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"sponsor_equity_minor" numeric(38, 0) NOT NULL,
	"rollover_equity_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"target_cash_used_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"maximum_leverage_scaled" numeric(38, 0),
	"minimum_interest_coverage_scaled" numeric(38, 0),
	"exit_method" text NOT NULL,
	"exit_multiple_scaled" numeric(38, 0),
	"exit_enterprise_value_minor" numeric(38, 0),
	"holding_period_years" integer NOT NULL,
	"operating_assumptions" jsonb NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lbo_models_currency_check" CHECK (char_length("currency") = 3),
	CONSTRAINT "lbo_models_price_check" CHECK ("purchase_price_minor" > 0 AND "entry_ebitda_minor" > 0 AND "sponsor_equity_minor" >= 0),
	CONSTRAINT "lbo_models_exit_method_check" CHECK ("exit_method" IN ('MULTIPLE','EXPLICIT_VALUE')),
	CONSTRAINT "lbo_models_exit_input_check" CHECK (("exit_method" = 'MULTIPLE' AND "exit_multiple_scaled" IS NOT NULL) OR ("exit_method" = 'EXPLICIT_VALUE' AND "exit_enterprise_value_minor" IS NOT NULL)),
	CONSTRAINT "lbo_models_hold_check" CHECK ("holding_period_years" BETWEEN 1 AND 30)
);

--> statement-breakpoint
CREATE TABLE "pe_due_diligence_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"portfolio_company_id" text NOT NULL,
	"workstream" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"assessment" text DEFAULT 'UNASSESSED' NOT NULL,
	"finding" text,
	"risk_severity" text,
	"mitigation" text,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"owner_principal_id" text,
	"due_date" date,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pe_due_diligence_items_workstream_check" CHECK ("workstream" IN ('COMMERCIAL','FINANCIAL','LEGAL','TAX','TECHNICAL','ESG','MANAGEMENT','REGULATORY','OPERATIONAL')),
	CONSTRAINT "pe_due_diligence_items_status_check" CHECK ("status" IN ('OPEN','IN_PROGRESS','COMPLETE','BLOCKED','NOT_APPLICABLE')),
	CONSTRAINT "pe_due_diligence_items_assessment_check" CHECK ("assessment" IN ('RED','AMBER','GREEN','UNASSESSED')),
	CONSTRAINT "pe_due_diligence_items_severity_check" CHECK ("risk_severity" IS NULL OR "risk_severity" IN ('LOW','MEDIUM','HIGH','CRITICAL')),
	CONSTRAINT "pe_due_diligence_items_finding_check" CHECK ("status" <> 'COMPLETE' OR ("finding" IS NOT NULL AND char_length("finding") >= 8))
);

--> statement-breakpoint
CREATE TABLE "pe_exit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"portfolio_company_id" text NOT NULL,
	"exit_type" text NOT NULL,
	"currency" text NOT NULL,
	"exit_value_minor" numeric(38, 0) NOT NULL,
	"invested_minor" numeric(38, 0) NOT NULL,
	"exit_date" date NOT NULL,
	"holding_period_years" numeric(6, 2),
	"moic_scaled" numeric(38, 0),
	"irr_bps" integer,
	"data_state" text DEFAULT 'CALCULATED' NOT NULL,
	"finance_reference_id" text,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pe_exit_events_type_check" CHECK ("exit_type" IN ('TRADE_SALE','SECONDARY','IPO','RECAPITALISATION','WRITE_OFF','MERGER')),
	CONSTRAINT "pe_exit_events_amount_check" CHECK ("exit_value_minor" >= 0 AND "invested_minor" > 0),
	CONSTRAINT "pe_exit_events_state_check" CHECK ("data_state" IN ('CALCULATED','VERIFIED'))
);

--> statement-breakpoint
CREATE TABLE "pe_investment_committee_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"portfolio_company_id" text NOT NULL,
	"fund_id" text,
	"authority_ref" text NOT NULL,
	"decision" text NOT NULL,
	"conditions" text,
	"rationale" text NOT NULL,
	"approved_amount_minor" numeric(38, 0),
	"currency" text,
	"proposed_by_principal_id" text NOT NULL,
	"decided_by_principal_id" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"votes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	CONSTRAINT "pe_ic_decisions_decision_check" CHECK ("decision" IN ('APPROVE','APPROVE_WITH_CONDITIONS','DEFER','REJECT','WITHDRAW')),
	CONSTRAINT "pe_ic_decisions_rationale_check" CHECK (char_length("rationale") >= 16),
	CONSTRAINT "pe_ic_decisions_sod_check" CHECK ("proposed_by_principal_id" <> "decided_by_principal_id"),
	CONSTRAINT "pe_ic_decisions_conditions_check" CHECK ("decision" <> 'APPROVE_WITH_CONDITIONS' OR ("conditions" IS NOT NULL AND char_length("conditions") >= 8))
);

--> statement-breakpoint
CREATE TABLE "portfolio_companies" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"fund_id" text,
	"legal_entity_id" text,
	"external_party_id" text,
	"name" text NOT NULL,
	"sector" text,
	"country_code" text NOT NULL,
	"currency" text NOT NULL,
	"invested_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"current_value_minor" numeric(38, 0),
	"valued_at" date,
	"ownership_bps" integer,
	"stage" text DEFAULT 'INVESTED' NOT NULL,
	"control_type" text,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_companies_currency_check" CHECK (char_length("currency") = 3),
	CONSTRAINT "portfolio_companies_ownership_check" CHECK ("ownership_bps" IS NULL OR ("ownership_bps" >= 0 AND "ownership_bps" <= 10000)),
	CONSTRAINT "portfolio_companies_stage_check" CHECK ("stage" IN ('PIPELINE','SCREENING','DUE_DILIGENCE','IC_REVIEW','APPROVED','INVESTED','EXITED','WRITTEN_OFF')),
	CONSTRAINT "portfolio_companies_identity_check" CHECK ("legal_entity_id" IS NOT NULL OR "external_party_id" IS NOT NULL)
);

--> statement-breakpoint
CREATE TABLE "private_capital_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"fund_id" text NOT NULL,
	"call_number" integer NOT NULL,
	"purpose" text NOT NULL,
	"currency" text NOT NULL,
	"call_amount_minor" numeric(38, 0) NOT NULL,
	"portfolio_company_id" text,
	"notice_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'NOTICE_ISSUED' NOT NULL,
	"finance_reference_id" text,
	"approval_ref" text,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_capital_calls_amount_check" CHECK ("call_amount_minor" > 0),
	CONSTRAINT "private_capital_calls_number_check" CHECK ("call_number" >= 1)
);

--> statement-breakpoint
CREATE TABLE "private_fund_distributions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"fund_id" text NOT NULL,
	"participant_id" text,
	"distribution_number" integer NOT NULL,
	"currency" text NOT NULL,
	"return_of_capital_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"gain_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"carried_interest_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"distribution_date" date NOT NULL,
	"source" text NOT NULL,
	"exit_event_id" text,
	"status" text DEFAULT 'DECLARED' NOT NULL,
	"finance_reference_id" text,
	"approval_ref" text,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_fund_distributions_amount_check" CHECK ("return_of_capital_minor" >= 0 AND "gain_minor" >= 0 AND "carried_interest_minor" >= 0),
	CONSTRAINT "private_fund_distributions_total_check" CHECK (("return_of_capital_minor" + "gain_minor") > 0)
);

--> statement-breakpoint
CREATE TABLE "private_fund_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"fund_id" text NOT NULL,
	"party_id" text NOT NULL,
	"account_class" text NOT NULL,
	"currency" text NOT NULL,
	"commitment_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"paid_in_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"distributed_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"unrealized_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"management_fees_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"carried_interest_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"marked_at" timestamp with time zone,
	"mark_source" text,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_fund_participants_class_check" CHECK ("account_class" IN ('LP','GP','CO_INVESTOR','PARALLEL_VEHICLE','EMPLOYEE_VEHICLE')),
	CONSTRAINT "private_fund_participants_amounts_check" CHECK ("commitment_minor" >= 0 AND "paid_in_minor" >= 0 AND "distributed_minor" >= 0 AND "unrealized_minor" >= 0 AND "paid_in_minor" <= "commitment_minor")
);

--> statement-breakpoint
CREATE TABLE "private_funds" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text,
	"general_partner_entity_id" text,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"strategy" text NOT NULL,
	"vintage_year" integer NOT NULL,
	"currency" text NOT NULL,
	"target_size_minor" numeric(38, 0),
	"hard_cap_minor" numeric(38, 0),
	"preferred_return_bps" integer,
	"carry_bps" integer,
	"management_fee_bps" integer,
	"management_fee_basis" text DEFAULT 'COMMITTED' NOT NULL,
	"term_years" integer,
	"waterfall_form" text DEFAULT 'EUROPEAN_WHOLE_FUND' NOT NULL,
	"status" text DEFAULT 'FUNDRAISING' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_funds_currency_check" CHECK (char_length("currency") = 3),
	CONSTRAINT "private_funds_vintage_check" CHECK ("vintage_year" BETWEEN 1900 AND 2200),
	CONSTRAINT "private_funds_strategy_check" CHECK ("strategy" IN ('BUYOUT','GROWTH','VENTURE','MEZZANINE','REAL_ASSETS','FUND_OF_FUNDS','OTHER')),
	CONSTRAINT "private_funds_waterfall_check" CHECK ("waterfall_form" IN ('EUROPEAN_WHOLE_FUND','AMERICAN_DEAL_BY_DEAL','CUSTOM_GOVERNED')),
	CONSTRAINT "private_funds_carry_check" CHECK ("carry_bps" IS NULL OR ("carry_bps" >= 0 AND "carry_bps" <= 10000))
);

--> statement-breakpoint
CREATE TABLE "valuation_assumption_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"model_id" text NOT NULL,
	"version" integer NOT NULL,
	"scenario_kind" text DEFAULT 'BASE' NOT NULL,
	"fingerprint" text NOT NULL,
	"assumptions" jsonb NOT NULL,
	"rationale" text,
	"authored_by" text NOT NULL,
	"authored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"supersedes_id" text,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	CONSTRAINT "valuation_assumption_sets_version_check" CHECK ("version" >= 1),
	CONSTRAINT "valuation_assumption_sets_scenario_check" CHECK ("scenario_kind" IN ('BASE','UPSIDE','DOWNSIDE','CUSTOM')),
	CONSTRAINT "valuation_assumption_sets_rationale_check" CHECK ("scenario_kind" = 'BASE' OR ("rationale" IS NOT NULL AND char_length("rationale") >= 8))
);

--> statement-breakpoint
CREATE TABLE "valuation_models" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"legal_entity_id" text,
	"instrument_id" text,
	"name" text NOT NULL,
	"method" text NOT NULL,
	"currency" text NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valuation_models_currency_check" CHECK (char_length("currency") = 3),
	CONSTRAINT "valuation_models_method_check" CHECK ("method" IN ('DCF','TRADING_MULTIPLES','TRANSACTION_MULTIPLES','REVENUE_MULTIPLES','EBITDA_MULTIPLES','PE','PS','EV_EBITDA','FCF_YIELD','ROIC_ANALYSIS'))
);

--> statement-breakpoint
CREATE TABLE "valuation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"model_id" text NOT NULL,
	"assumption_set_id" text NOT NULL,
	"scenario_kind" text NOT NULL,
	"fingerprint" text NOT NULL,
	"currency" text NOT NULL,
	"enterprise_value_minor" numeric(38, 0),
	"equity_value_minor" numeric(38, 0),
	"implied_share_price_minor" numeric(38, 0),
	"result" jsonb NOT NULL,
	"sensitivity" jsonb,
	"data_state" text NOT NULL,
	"reason" text,
	"run_by" text NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trace_id" text,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	CONSTRAINT "valuation_runs_state_check" CHECK ("data_state" IN ('VERIFIED','CALCULATED','ESTIMATED','FORECAST','MISSING','NOT_APPLICABLE','INVALID')),
	CONSTRAINT "valuation_runs_scenario_check" CHECK ("scenario_kind" IN ('BASE','UPSIDE','DOWNSIDE','CUSTOM'))
);

--> statement-breakpoint
CREATE TABLE "cost_allocation_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"run_id" text NOT NULL,
	"pool_code" text NOT NULL,
	"receiving_unit_type" text NOT NULL,
	"receiving_unit_id" text NOT NULL,
	"driver_code" text NOT NULL,
	"driver_value" numeric(30, 6) NOT NULL,
	"driver_total" numeric(30, 6) NOT NULL,
	"allocated_minor" numeric(38, 0) NOT NULL,
	"currency" text NOT NULL,
	"rounding_adjustment_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	CONSTRAINT "cost_allocation_lines_amount_check" CHECK (allocated_minor >= 0),
	CONSTRAINT "cost_allocation_lines_driver_check" CHECK (driver_total >= 0 AND driver_value >= 0 AND driver_value <= driver_total),
	CONSTRAINT "cost_allocation_lines_currency_check" CHECK (char_length(currency) = 3)
);

--> statement-breakpoint
CREATE TABLE "cost_allocation_rule_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text,
	"code" text NOT NULL,
	"version" integer NOT NULL,
	"currency" text NOT NULL,
	"period" text NOT NULL,
	"rules" jsonb NOT NULL,
	"remainder_policy" text DEFAULT 'LARGEST_REMAINDER' NOT NULL,
	"rationale" text NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"approval_ref" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"supersedes_id" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_allocation_rule_sets_version_check" CHECK (version >= 1),
	CONSTRAINT "cost_allocation_rule_sets_currency_check" CHECK (char_length(currency) = 3),
	CONSTRAINT "cost_allocation_rule_sets_remainder_check" CHECK (remainder_policy = 'LARGEST_REMAINDER'),
	CONSTRAINT "cost_allocation_rule_sets_rules_check" CHECK (jsonb_array_length(rules) > 0),
	CONSTRAINT "cost_allocation_rule_sets_rationale_check" CHECK (char_length(rationale) >= 16),
	CONSTRAINT "cost_allocation_rule_sets_approval_check" CHECK (approved = false OR (approval_ref IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL)),
	CONSTRAINT "cost_allocation_rule_sets_status_check" CHECK (status IN ('DRAFT','APPROVED','SUPERSEDED','WITHDRAWN'))
);

--> statement-breakpoint
CREATE TABLE "cost_allocation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"rule_set_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"code" text NOT NULL,
	"period" text NOT NULL,
	"currency" text NOT NULL,
	"pool_minor" numeric(38, 0) NOT NULL,
	"allocated_minor" numeric(38, 0) NOT NULL,
	"remainder_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"remainder_policy" text DEFAULT 'LARGEST_REMAINDER' NOT NULL,
	"data_state" text DEFAULT 'CALCULATED' NOT NULL,
	"reason" text,
	"run_by" text NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trace_id" text,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	CONSTRAINT "cost_allocation_runs_currency_check" CHECK (char_length(currency) = 3),
	CONSTRAINT "cost_allocation_runs_exactness_check" CHECK (allocated_minor + remainder_minor = pool_minor),
	CONSTRAINT "cost_allocation_runs_state_check" CHECK (data_state IN ('VERIFIED','CALCULATED','ESTIMATED','FORECAST','MISSING','NOT_APPLICABLE','INVALID')),
	CONSTRAINT "cost_allocation_runs_reason_check" CHECK (data_state NOT IN ('MISSING','NOT_APPLICABLE','INVALID') OR (reason IS NOT NULL AND char_length(reason) >= 8))
);

--> statement-breakpoint
CREATE TABLE "price_list_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"price_list_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"subject_label" text,
	"unit_of_measure" text NOT NULL,
	"currency" text NOT NULL,
	"cost_minor" numeric(38, 0) NOT NULL,
	"price_minor" numeric(38, 0) NOT NULL,
	"markup_bps" integer,
	"margin_bps" integer,
	"floor_price_minor" numeric(38, 0),
	"maximum_discount_bps" integer,
	"pricing_basis" text NOT NULL,
	"data_state" text DEFAULT 'CALCULATED' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_list_items_currency_check" CHECK (char_length(currency) = 3),
	CONSTRAINT "price_list_items_cost_price_check" CHECK (cost_minor >= 0 AND price_minor >= 0),
	CONSTRAINT "price_list_items_basis_check" CHECK (pricing_basis IN ('COST_PLUS_MARKUP','TARGET_MARGIN','MARKET_REFERENCE','COMPETITOR_REFERENCE','REGULATED','LEGACY_CONTRACT','INTERCOMPANY')),
	CONSTRAINT "price_list_items_state_check" CHECK (data_state IN ('VERIFIED','CALCULATED','ESTIMATED','FORECAST')),
	CONSTRAINT "price_list_items_discount_check" CHECK (maximum_discount_bps IS NULL OR (maximum_discount_bps >= 0 AND maximum_discount_bps <= 10000)),
	CONSTRAINT "price_list_items_floor_check" CHECK (floor_price_minor IS NULL OR (floor_price_minor >= 0 AND floor_price_minor <= price_minor)),
	CONSTRAINT "price_list_items_markup_check" CHECK ((cost_minor = 0 AND markup_bps IS NULL) OR (cost_minor > 0 AND markup_bps = round(((price_minor - cost_minor) * 10000.0) / cost_minor))),
	CONSTRAINT "price_list_items_margin_check" CHECK ((price_minor = 0 AND margin_bps IS NULL) OR (price_minor > 0 AND margin_bps = round(((price_minor - cost_minor) * 10000.0) / price_minor))),
	CONSTRAINT "price_list_items_consistency_check" CHECK (cost_minor = 0 OR price_minor = 0 OR margin_bps IS NULL OR markup_bps IS NULL OR (((markup_bps - margin_bps) * 1.0) = round((markup_bps * margin_bps) / 10000.0))),
	CONSTRAINT "price_list_items_period_check" CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"channel" text NOT NULL,
	"currency" text NOT NULL,
	"scope_type" text DEFAULT 'TENANT' NOT NULL,
	"scope_id" text,
	"tax_inclusive" boolean DEFAULT false NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"approval_ref" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_lists_currency_check" CHECK (char_length(currency) = 3),
	CONSTRAINT "price_lists_channel_check" CHECK (channel IN ('RETAIL','WHOLESALE','DISTRIBUTOR','CORPORATE','GOVERNMENT','INTERNAL','TRANSFER')),
	CONSTRAINT "price_lists_version_check" CHECK (version >= 1),
	CONSTRAINT "price_lists_period_check" CHECK (effective_to IS NULL OR effective_to >= effective_from),
	CONSTRAINT "price_lists_status_check" CHECK (status IN ('DRAFT','PENDING_APPROVAL','ACTIVE','SUPERSEDED','WITHDRAWN')),
	CONSTRAINT "price_lists_approval_check" CHECK (status <> 'ACTIVE' OR (approval_ref IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

--> statement-breakpoint
CREATE TABLE "pricing_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"price_list_id" text,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"currency" text NOT NULL,
	"previous_price_minor" numeric(38, 0),
	"new_price_minor" numeric(38, 0) NOT NULL,
	"previous_margin_bps" integer,
	"new_margin_bps" integer,
	"reason_category" text NOT NULL,
	"rationale" text NOT NULL,
	"analysis" jsonb,
	"proposed_by" text NOT NULL,
	"approved_by" text,
	"approval_ref" text,
	"decided_at" timestamp with time zone,
	"effective_from" date NOT NULL,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_decisions_currency_check" CHECK (char_length(currency) = 3),
	CONSTRAINT "pricing_decisions_price_check" CHECK (new_price_minor >= 0),
	CONSTRAINT "pricing_decisions_reason_check" CHECK (reason_category IN ('COMPETITIVE_RESPONSE','COST_CHANGE','INFLATION','PROMOTION','CONTRACT_RENEWAL','STRATEGIC','MARGIN_RECOVERY')),
	CONSTRAINT "pricing_decisions_rationale_check" CHECK (char_length(rationale) >= 16),
	CONSTRAINT "pricing_decisions_status_check" CHECK (status IN ('PROPOSED','APPROVED','REJECTED','SUPERSEDED')),
	CONSTRAINT "pricing_decisions_approval_check" CHECK (status <> 'APPROVED' OR (approved_by IS NOT NULL AND approval_ref IS NOT NULL AND decided_at IS NOT NULL)),
	CONSTRAINT "pricing_decisions_sod_check" CHECK (approved_by IS NULL OR approved_by <> proposed_by)
);

--> statement-breakpoint
CREATE TABLE "profitability_analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"code" text NOT NULL,
	"period" text NOT NULL,
	"currency" text NOT NULL,
	"allocation_run_id" text,
	"revenue_minor" numeric(38, 0) NOT NULL,
	"direct_cost_minor" numeric(38, 0) NOT NULL,
	"allocated_indirect_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"operating_expense_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"gross_margin_minor" numeric(38, 0) NOT NULL,
	"contribution_minor" numeric(38, 0) NOT NULL,
	"operating_profit_minor" numeric(38, 0) NOT NULL,
	"gross_margin_bps" integer,
	"contribution_margin_bps" integer,
	"operating_margin_bps" integer,
	"unapproved_allocation" boolean DEFAULT false NOT NULL,
	"data_state" text DEFAULT 'CALCULATED' NOT NULL,
	"reason" text,
	"run_by" text NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trace_id" text,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	CONSTRAINT "profitability_analyses_currency_check" CHECK (char_length(currency) = 3),
	CONSTRAINT "profitability_analyses_ladder_check" CHECK (gross_margin_minor = revenue_minor - direct_cost_minor AND contribution_minor = gross_margin_minor - allocated_indirect_minor AND operating_profit_minor = contribution_minor - operating_expense_minor),
	CONSTRAINT "profitability_analyses_unapproved_check" CHECK (unapproved_allocation = false),
	CONSTRAINT "profitability_analyses_state_check" CHECK (data_state IN ('VERIFIED','CALCULATED','ESTIMATED','FORECAST','MISSING','NOT_APPLICABLE','INVALID')),
	CONSTRAINT "profitability_analyses_reason_check" CHECK (data_state NOT IN ('MISSING','NOT_APPLICABLE','INVALID') OR (reason IS NOT NULL AND char_length(reason) >= 8))
);

--> statement-breakpoint
CREATE TABLE "profitability_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"analysis_id" text NOT NULL,
	"unit_type" text NOT NULL,
	"unit_id" text NOT NULL,
	"unit_label" text,
	"revenue_minor" numeric(38, 0) NOT NULL,
	"direct_cost_minor" numeric(38, 0) NOT NULL,
	"allocated_indirect_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"operating_expense_minor" numeric(38, 0) DEFAULT '0' NOT NULL,
	"gross_margin_minor" numeric(38, 0) NOT NULL,
	"contribution_minor" numeric(38, 0) NOT NULL,
	"operating_profit_minor" numeric(38, 0) NOT NULL,
	"operating_margin_bps" integer,
	"loss_making" boolean DEFAULT false NOT NULL,
	"currency" text NOT NULL,
	CONSTRAINT "profitability_lines_currency_check" CHECK (char_length(currency) = 3),
	CONSTRAINT "profitability_lines_ladder_check" CHECK (gross_margin_minor = revenue_minor - direct_cost_minor AND contribution_minor = gross_margin_minor - allocated_indirect_minor AND operating_profit_minor = contribution_minor - operating_expense_minor),
	CONSTRAINT "profitability_lines_margin_check" CHECK ((revenue_minor = 0 AND operating_margin_bps IS NULL) OR (revenue_minor > 0 AND operating_margin_bps = round((operating_profit_minor * 10000.0) / revenue_minor))),
	CONSTRAINT "profitability_lines_loss_check" CHECK (loss_making = (operating_profit_minor < 0))
);

--> statement-breakpoint
ALTER TABLE "compensation_approval_stages" ADD CONSTRAINT "compensation_approval_stages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "compensation_approval_stages" ADD CONSTRAINT "compensation_approval_stages_entitlement_id_compensation_entitlements_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."compensation_entitlements"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "compensation_approval_stages" ADD CONSTRAINT "compensation_approval_stages_actor_principal_id_users_id_fk" FOREIGN KEY ("actor_principal_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "compensation_approval_stages" ADD CONSTRAINT "compensation_approval_stages_beneficiary_principal_id_users_id_fk" FOREIGN KEY ("beneficiary_principal_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "compensation_entitlements" ADD CONSTRAINT "compensation_entitlements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "compensation_entitlements" ADD CONSTRAINT "compensation_entitlements_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "compensation_entitlements" ADD CONSTRAINT "compensation_entitlements_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "compensation_entitlements" ADD CONSTRAINT "compensation_entitlements_employee_principal_id_users_id_fk" FOREIGN KEY ("employee_principal_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "compensation_entitlements" ADD CONSTRAINT "compensation_entitlements_policy_id_compensation_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."compensation_policies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "compensation_entitlements" ADD CONSTRAINT "compensation_entitlements_raised_by_users_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "compensation_policies" ADD CONSTRAINT "compensation_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "compensation_policies" ADD CONSTRAINT "compensation_policies_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "compensation_policies" ADD CONSTRAINT "compensation_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "emergency_assistance_cases" ADD CONSTRAINT "emergency_assistance_cases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "emergency_assistance_cases" ADD CONSTRAINT "emergency_assistance_cases_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "emergency_assistance_cases" ADD CONSTRAINT "emergency_assistance_cases_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "emergency_assistance_cases" ADD CONSTRAINT "emergency_assistance_cases_employee_principal_id_users_id_fk" FOREIGN KEY ("employee_principal_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "emergency_assistance_cases" ADD CONSTRAINT "emergency_assistance_cases_approved_by_principal_id_users_id_fk" FOREIGN KEY ("approved_by_principal_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_credit_facilities" ADD CONSTRAINT "employee_credit_facilities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_credit_facilities" ADD CONSTRAINT "employee_credit_facilities_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_credit_facilities" ADD CONSTRAINT "employee_credit_facilities_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_credit_facilities" ADD CONSTRAINT "employee_credit_facilities_employee_principal_id_users_id_fk" FOREIGN KEY ("employee_principal_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_credit_facilities" ADD CONSTRAINT "employee_credit_facilities_policy_id_compensation_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."compensation_policies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_credit_facilities" ADD CONSTRAINT "employee_credit_facilities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_credit_instalments" ADD CONSTRAINT "employee_credit_instalments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_credit_instalments" ADD CONSTRAINT "employee_credit_instalments_facility_id_employee_credit_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."employee_credit_facilities"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_sponsorships" ADD CONSTRAINT "employee_sponsorships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_sponsorships" ADD CONSTRAINT "employee_sponsorships_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_sponsorships" ADD CONSTRAINT "employee_sponsorships_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_sponsorships" ADD CONSTRAINT "employee_sponsorships_policy_id_compensation_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."compensation_policies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_sponsorships" ADD CONSTRAINT "employee_sponsorships_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "capital_formation_positions" ADD CONSTRAINT "capital_formation_positions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "capital_formation_positions" ADD CONSTRAINT "capital_formation_positions_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "capital_formation_positions" ADD CONSTRAINT "capital_formation_positions_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entrusted_capital_arrangements" ADD CONSTRAINT "entrusted_capital_arrangements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entrusted_capital_arrangements" ADD CONSTRAINT "entrusted_capital_arrangements_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entrusted_capital_arrangements" ADD CONSTRAINT "entrusted_capital_arrangements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entrusted_capital_drawdowns" ADD CONSTRAINT "entrusted_capital_drawdowns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entrusted_capital_drawdowns" ADD CONSTRAINT "entrusted_capital_drawdowns_arrangement_id_entrusted_capital_arrangements_id_fk" FOREIGN KEY ("arrangement_id") REFERENCES "public"."entrusted_capital_arrangements"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entrusted_capital_drawdowns" ADD CONSTRAINT "entrusted_capital_drawdowns_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "financial_instruments" ADD CONSTRAINT "financial_instruments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "financial_instruments" ADD CONSTRAINT "financial_instruments_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "financial_instruments" ADD CONSTRAINT "financial_instruments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "financial_metric_observations" ADD CONSTRAINT "financial_metric_observations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "financial_metric_observations" ADD CONSTRAINT "financial_metric_observations_instrument_id_financial_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."financial_instruments"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "financial_metric_observations" ADD CONSTRAINT "financial_metric_observations_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "financial_metric_observations" ADD CONSTRAINT "financial_metric_observations_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lbo_debt_tranches" ADD CONSTRAINT "lbo_debt_tranches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lbo_debt_tranches" ADD CONSTRAINT "lbo_debt_tranches_lbo_model_id_lbo_models_id_fk" FOREIGN KEY ("lbo_model_id") REFERENCES "public"."lbo_models"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lbo_model_runs" ADD CONSTRAINT "lbo_model_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lbo_model_runs" ADD CONSTRAINT "lbo_model_runs_lbo_model_id_lbo_models_id_fk" FOREIGN KEY ("lbo_model_id") REFERENCES "public"."lbo_models"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lbo_model_runs" ADD CONSTRAINT "lbo_model_runs_run_by_users_id_fk" FOREIGN KEY ("run_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lbo_models" ADD CONSTRAINT "lbo_models_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lbo_models" ADD CONSTRAINT "lbo_models_model_id_valuation_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."valuation_models"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lbo_models" ADD CONSTRAINT "lbo_models_assumption_set_id_valuation_assumption_sets_id_fk" FOREIGN KEY ("assumption_set_id") REFERENCES "public"."valuation_assumption_sets"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lbo_models" ADD CONSTRAINT "lbo_models_portfolio_company_id_portfolio_companies_id_fk" FOREIGN KEY ("portfolio_company_id") REFERENCES "public"."portfolio_companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lbo_models" ADD CONSTRAINT "lbo_models_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pe_due_diligence_items" ADD CONSTRAINT "pe_due_diligence_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pe_due_diligence_items" ADD CONSTRAINT "pe_due_diligence_items_portfolio_company_id_portfolio_companies_id_fk" FOREIGN KEY ("portfolio_company_id") REFERENCES "public"."portfolio_companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pe_exit_events" ADD CONSTRAINT "pe_exit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pe_exit_events" ADD CONSTRAINT "pe_exit_events_portfolio_company_id_portfolio_companies_id_fk" FOREIGN KEY ("portfolio_company_id") REFERENCES "public"."portfolio_companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pe_exit_events" ADD CONSTRAINT "pe_exit_events_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pe_investment_committee_decisions" ADD CONSTRAINT "pe_investment_committee_decisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pe_investment_committee_decisions" ADD CONSTRAINT "pe_investment_committee_decisions_portfolio_company_id_portfolio_companies_id_fk" FOREIGN KEY ("portfolio_company_id") REFERENCES "public"."portfolio_companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pe_investment_committee_decisions" ADD CONSTRAINT "pe_investment_committee_decisions_fund_id_private_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."private_funds"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pe_investment_committee_decisions" ADD CONSTRAINT "pe_investment_committee_decisions_proposed_by_principal_id_users_id_fk" FOREIGN KEY ("proposed_by_principal_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pe_investment_committee_decisions" ADD CONSTRAINT "pe_investment_committee_decisions_decided_by_principal_id_users_id_fk" FOREIGN KEY ("decided_by_principal_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portfolio_companies" ADD CONSTRAINT "portfolio_companies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portfolio_companies" ADD CONSTRAINT "portfolio_companies_fund_id_private_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."private_funds"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portfolio_companies" ADD CONSTRAINT "portfolio_companies_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portfolio_companies" ADD CONSTRAINT "portfolio_companies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "private_capital_calls" ADD CONSTRAINT "private_capital_calls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "private_capital_calls" ADD CONSTRAINT "private_capital_calls_fund_id_private_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."private_funds"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "private_capital_calls" ADD CONSTRAINT "private_capital_calls_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "private_fund_distributions" ADD CONSTRAINT "private_fund_distributions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "private_fund_distributions" ADD CONSTRAINT "private_fund_distributions_fund_id_private_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."private_funds"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "private_fund_distributions" ADD CONSTRAINT "private_fund_distributions_participant_id_private_fund_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."private_fund_participants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "private_fund_distributions" ADD CONSTRAINT "private_fund_distributions_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "private_fund_participants" ADD CONSTRAINT "private_fund_participants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "private_fund_participants" ADD CONSTRAINT "private_fund_participants_fund_id_private_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."private_funds"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "private_funds" ADD CONSTRAINT "private_funds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "private_funds" ADD CONSTRAINT "private_funds_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "private_funds" ADD CONSTRAINT "private_funds_general_partner_entity_id_legal_entities_id_fk" FOREIGN KEY ("general_partner_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "private_funds" ADD CONSTRAINT "private_funds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "valuation_assumption_sets" ADD CONSTRAINT "valuation_assumption_sets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "valuation_assumption_sets" ADD CONSTRAINT "valuation_assumption_sets_model_id_valuation_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."valuation_models"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "valuation_assumption_sets" ADD CONSTRAINT "valuation_assumption_sets_authored_by_users_id_fk" FOREIGN KEY ("authored_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "valuation_models" ADD CONSTRAINT "valuation_models_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "valuation_models" ADD CONSTRAINT "valuation_models_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "valuation_models" ADD CONSTRAINT "valuation_models_instrument_id_financial_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."financial_instruments"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "valuation_models" ADD CONSTRAINT "valuation_models_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "valuation_runs" ADD CONSTRAINT "valuation_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "valuation_runs" ADD CONSTRAINT "valuation_runs_model_id_valuation_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."valuation_models"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "valuation_runs" ADD CONSTRAINT "valuation_runs_assumption_set_id_valuation_assumption_sets_id_fk" FOREIGN KEY ("assumption_set_id") REFERENCES "public"."valuation_assumption_sets"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "valuation_runs" ADD CONSTRAINT "valuation_runs_run_by_users_id_fk" FOREIGN KEY ("run_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cost_allocation_lines" ADD CONSTRAINT "cost_allocation_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cost_allocation_lines" ADD CONSTRAINT "cost_allocation_lines_run_id_cost_allocation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."cost_allocation_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cost_allocation_rule_sets" ADD CONSTRAINT "cost_allocation_rule_sets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cost_allocation_rule_sets" ADD CONSTRAINT "cost_allocation_rule_sets_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cost_allocation_rule_sets" ADD CONSTRAINT "cost_allocation_rule_sets_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cost_allocation_rule_sets" ADD CONSTRAINT "cost_allocation_rule_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cost_allocation_runs" ADD CONSTRAINT "cost_allocation_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cost_allocation_runs" ADD CONSTRAINT "cost_allocation_runs_rule_set_id_cost_allocation_rule_sets_id_fk" FOREIGN KEY ("rule_set_id") REFERENCES "public"."cost_allocation_rule_sets"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cost_allocation_runs" ADD CONSTRAINT "cost_allocation_runs_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cost_allocation_runs" ADD CONSTRAINT "cost_allocation_runs_run_by_users_id_fk" FOREIGN KEY ("run_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pricing_decisions" ADD CONSTRAINT "pricing_decisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pricing_decisions" ADD CONSTRAINT "pricing_decisions_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pricing_decisions" ADD CONSTRAINT "pricing_decisions_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pricing_decisions" ADD CONSTRAINT "pricing_decisions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "profitability_analyses" ADD CONSTRAINT "profitability_analyses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "profitability_analyses" ADD CONSTRAINT "profitability_analyses_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "profitability_analyses" ADD CONSTRAINT "profitability_analyses_allocation_run_id_cost_allocation_runs_id_fk" FOREIGN KEY ("allocation_run_id") REFERENCES "public"."cost_allocation_runs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "profitability_analyses" ADD CONSTRAINT "profitability_analyses_run_by_users_id_fk" FOREIGN KEY ("run_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "profitability_lines" ADD CONSTRAINT "profitability_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "profitability_lines" ADD CONSTRAINT "profitability_lines_analysis_id_profitability_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."profitability_analyses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "compensation_approval_stages_entitlement_stage_uidx" ON "compensation_approval_stages" USING btree ("entitlement_id","stage");
--> statement-breakpoint
CREATE INDEX "compensation_approval_stages_entitlement_idx" ON "compensation_approval_stages" USING btree ("entitlement_id","sequence");
--> statement-breakpoint
CREATE INDEX "compensation_entitlements_employee_idx" ON "compensation_entitlements" USING btree ("employee_id","effective_date");
--> statement-breakpoint
CREATE INDEX "compensation_entitlements_status_idx" ON "compensation_entitlements" USING btree ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX "compensation_entitlements_kind_idx" ON "compensation_entitlements" USING btree ("kind");
--> statement-breakpoint
CREATE UNIQUE INDEX "compensation_policies_code_version_uidx" ON "compensation_policies" USING btree ("tenant_id","code","version");
--> statement-breakpoint
CREATE INDEX "compensation_policies_family_idx" ON "compensation_policies" USING btree ("policy_family","policy_type");
--> statement-breakpoint
CREATE UNIQUE INDEX "emergency_assistance_cases_number_uidx" ON "emergency_assistance_cases" USING btree ("tenant_id","case_number");
--> statement-breakpoint
CREATE INDEX "emergency_assistance_cases_employee_idx" ON "emergency_assistance_cases" USING btree ("employee_id","status");
--> statement-breakpoint
CREATE INDEX "emergency_assistance_cases_status_idx" ON "emergency_assistance_cases" USING btree ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX "employee_credit_facilities_employee_idx" ON "employee_credit_facilities" USING btree ("employee_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "employee_credit_instalments_facility_number_uidx" ON "employee_credit_instalments" USING btree ("facility_id","number");
--> statement-breakpoint
CREATE INDEX "employee_sponsorships_employee_idx" ON "employee_sponsorships" USING btree ("employee_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "capital_formation_positions_entity_origin_date_uidx" ON "capital_formation_positions" USING btree ("legal_entity_id","capital_origin","as_of");
--> statement-breakpoint
CREATE INDEX "entrusted_capital_arrangements_origin_idx" ON "entrusted_capital_arrangements" USING btree ("tenant_id","capital_origin");
--> statement-breakpoint
CREATE INDEX "entrusted_capital_arrangements_provider_idx" ON "entrusted_capital_arrangements" USING btree ("provider_party_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "entrusted_capital_drawdowns_arrangement_seq_uidx" ON "entrusted_capital_drawdowns" USING btree ("arrangement_id","sequence_number");
--> statement-breakpoint
CREATE INDEX "financial_instruments_tenant_idx" ON "financial_instruments" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "financial_instruments_entity_idx" ON "financial_instruments" USING btree ("legal_entity_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "financial_instruments_tenant_symbol_uidx" ON "financial_instruments" USING btree ("tenant_id","symbol","share_class");
--> statement-breakpoint
CREATE INDEX "financial_metric_observations_subject_idx" ON "financial_metric_observations" USING btree ("tenant_id","subject_type","subject_id","metric_code");
--> statement-breakpoint
CREATE INDEX "financial_metric_observations_metric_idx" ON "financial_metric_observations" USING btree ("metric_code");
--> statement-breakpoint
CREATE INDEX "financial_metric_observations_state_idx" ON "financial_metric_observations" USING btree ("data_state");
--> statement-breakpoint
CREATE UNIQUE INDEX "lbo_debt_tranches_model_code_uidx" ON "lbo_debt_tranches" USING btree ("lbo_model_id","code");
--> statement-breakpoint
CREATE INDEX "lbo_debt_tranches_model_idx" ON "lbo_debt_tranches" USING btree ("lbo_model_id","seniority_rank");
--> statement-breakpoint
CREATE INDEX "lbo_model_runs_model_idx" ON "lbo_model_runs" USING btree ("lbo_model_id","run_at");
--> statement-breakpoint
CREATE INDEX "lbo_model_runs_fingerprint_idx" ON "lbo_model_runs" USING btree ("fingerprint");
--> statement-breakpoint
CREATE INDEX "lbo_models_tenant_idx" ON "lbo_models" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "lbo_models_company_idx" ON "lbo_models" USING btree ("portfolio_company_id");
--> statement-breakpoint
CREATE INDEX "pe_due_diligence_items_company_idx" ON "pe_due_diligence_items" USING btree ("portfolio_company_id","workstream");
--> statement-breakpoint
CREATE INDEX "pe_exit_events_company_idx" ON "pe_exit_events" USING btree ("portfolio_company_id");
--> statement-breakpoint
CREATE INDEX "pe_ic_decisions_company_idx" ON "pe_investment_committee_decisions" USING btree ("portfolio_company_id","decided_at");
--> statement-breakpoint
CREATE INDEX "portfolio_companies_fund_idx" ON "portfolio_companies" USING btree ("fund_id");
--> statement-breakpoint
CREATE INDEX "portfolio_companies_stage_idx" ON "portfolio_companies" USING btree ("stage");
--> statement-breakpoint
CREATE UNIQUE INDEX "private_capital_calls_fund_number_uidx" ON "private_capital_calls" USING btree ("fund_id","call_number");
--> statement-breakpoint
CREATE INDEX "private_capital_calls_due_idx" ON "private_capital_calls" USING btree ("due_date");
--> statement-breakpoint
CREATE INDEX "private_fund_distributions_fund_idx" ON "private_fund_distributions" USING btree ("fund_id","distribution_date");
--> statement-breakpoint
CREATE UNIQUE INDEX "private_fund_participants_fund_party_class_uidx" ON "private_fund_participants" USING btree ("fund_id","party_id","account_class");
--> statement-breakpoint
CREATE INDEX "private_fund_participants_fund_idx" ON "private_fund_participants" USING btree ("fund_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "private_funds_tenant_code_uidx" ON "private_funds" USING btree ("tenant_id","code");
--> statement-breakpoint
CREATE INDEX "private_funds_status_idx" ON "private_funds" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "valuation_assumption_sets_model_version_uidx" ON "valuation_assumption_sets" USING btree ("model_id","version","scenario_kind");
--> statement-breakpoint
CREATE INDEX "valuation_assumption_sets_fingerprint_idx" ON "valuation_assumption_sets" USING btree ("fingerprint");
--> statement-breakpoint
CREATE INDEX "valuation_models_subject_idx" ON "valuation_models" USING btree ("tenant_id","subject_type","subject_id");
--> statement-breakpoint
CREATE INDEX "valuation_models_status_idx" ON "valuation_models" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "valuation_runs_model_idx" ON "valuation_runs" USING btree ("model_id","run_at");
--> statement-breakpoint
CREATE INDEX "valuation_runs_fingerprint_idx" ON "valuation_runs" USING btree ("fingerprint");
--> statement-breakpoint
CREATE INDEX "cost_allocation_lines_run_idx" ON "cost_allocation_lines" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX "cost_allocation_lines_unit_idx" ON "cost_allocation_lines" USING btree ("tenant_id","receiving_unit_type","receiving_unit_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "cost_allocation_rule_sets_code_version_uidx" ON "cost_allocation_rule_sets" USING btree ("tenant_id","code","version");
--> statement-breakpoint
CREATE UNIQUE INDEX "cost_allocation_runs_code_period_uidx" ON "cost_allocation_runs" USING btree ("tenant_id","code","period");
--> statement-breakpoint
CREATE INDEX "cost_allocation_runs_ruleset_idx" ON "cost_allocation_runs" USING btree ("rule_set_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "price_list_items_list_subject_uidx" ON "price_list_items" USING btree ("price_list_id","subject_type","subject_id","effective_from");
--> statement-breakpoint
CREATE INDEX "price_list_items_subject_idx" ON "price_list_items" USING btree ("tenant_id","subject_type","subject_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "price_lists_code_version_uidx" ON "price_lists" USING btree ("tenant_id","code","version");
--> statement-breakpoint
CREATE INDEX "price_lists_channel_idx" ON "price_lists" USING btree ("tenant_id","channel","status");
--> statement-breakpoint
CREATE INDEX "pricing_decisions_subject_idx" ON "pricing_decisions" USING btree ("tenant_id","subject_type","subject_id","decided_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_analyses_code_period_uidx" ON "profitability_analyses" USING btree ("tenant_id","code","period");
--> statement-breakpoint
CREATE INDEX "profitability_analyses_period_idx" ON "profitability_analyses" USING btree ("tenant_id","period");
--> statement-breakpoint
CREATE UNIQUE INDEX "profitability_lines_analysis_unit_uidx" ON "profitability_lines" USING btree ("analysis_id","unit_type","unit_id");
--> statement-breakpoint
CREATE INDEX "profitability_lines_unit_idx" ON "profitability_lines" USING btree ("tenant_id","unit_type","unit_id");

--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Row-level security — one tenant-scoped policy per new table.
-- Canonical predicate beyu_tenant_ids()/beyu_global_scope(), identical to
-- every other tenant-scoped table in the platform. FORCE is set so the
-- table owner is not silently exempt.
-- ---------------------------------------------------------------------------
ALTER TABLE "compensation_approval_stages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compensation_approval_stages" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "compensation_approval_stages_tenant_scope" ON "compensation_approval_stages";
CREATE POLICY "compensation_approval_stages_tenant_scope" ON "compensation_approval_stages" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "compensation_entitlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compensation_entitlements" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "compensation_entitlements_tenant_scope" ON "compensation_entitlements";
CREATE POLICY "compensation_entitlements_tenant_scope" ON "compensation_entitlements" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "compensation_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compensation_policies" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "compensation_policies_tenant_scope" ON "compensation_policies";
CREATE POLICY "compensation_policies_tenant_scope" ON "compensation_policies" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "emergency_assistance_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "emergency_assistance_cases" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "emergency_assistance_cases_tenant_scope" ON "emergency_assistance_cases";
CREATE POLICY "emergency_assistance_cases_tenant_scope" ON "emergency_assistance_cases" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "employee_credit_facilities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_credit_facilities" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employee_credit_facilities_tenant_scope" ON "employee_credit_facilities";
CREATE POLICY "employee_credit_facilities_tenant_scope" ON "employee_credit_facilities" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "employee_credit_instalments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_credit_instalments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employee_credit_instalments_tenant_scope" ON "employee_credit_instalments";
CREATE POLICY "employee_credit_instalments_tenant_scope" ON "employee_credit_instalments" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "employee_sponsorships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_sponsorships" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employee_sponsorships_tenant_scope" ON "employee_sponsorships";
CREATE POLICY "employee_sponsorships_tenant_scope" ON "employee_sponsorships" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "capital_formation_positions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "capital_formation_positions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "capital_formation_positions_tenant_scope" ON "capital_formation_positions";
CREATE POLICY "capital_formation_positions_tenant_scope" ON "capital_formation_positions" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "entrusted_capital_arrangements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "entrusted_capital_arrangements" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "entrusted_capital_arrangements_tenant_scope" ON "entrusted_capital_arrangements";
CREATE POLICY "entrusted_capital_arrangements_tenant_scope" ON "entrusted_capital_arrangements" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "entrusted_capital_drawdowns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "entrusted_capital_drawdowns" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "entrusted_capital_drawdowns_tenant_scope" ON "entrusted_capital_drawdowns";
CREATE POLICY "entrusted_capital_drawdowns_tenant_scope" ON "entrusted_capital_drawdowns" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "financial_instruments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_instruments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "financial_instruments_tenant_scope" ON "financial_instruments";
CREATE POLICY "financial_instruments_tenant_scope" ON "financial_instruments" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "financial_metric_observations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_metric_observations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "financial_metric_observations_tenant_scope" ON "financial_metric_observations";
CREATE POLICY "financial_metric_observations_tenant_scope" ON "financial_metric_observations" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "lbo_debt_tranches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lbo_debt_tranches" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lbo_debt_tranches_tenant_scope" ON "lbo_debt_tranches";
CREATE POLICY "lbo_debt_tranches_tenant_scope" ON "lbo_debt_tranches" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "lbo_model_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lbo_model_runs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lbo_model_runs_tenant_scope" ON "lbo_model_runs";
CREATE POLICY "lbo_model_runs_tenant_scope" ON "lbo_model_runs" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "lbo_models" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lbo_models" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lbo_models_tenant_scope" ON "lbo_models";
CREATE POLICY "lbo_models_tenant_scope" ON "lbo_models" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "pe_due_diligence_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pe_due_diligence_items" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pe_due_diligence_items_tenant_scope" ON "pe_due_diligence_items";
CREATE POLICY "pe_due_diligence_items_tenant_scope" ON "pe_due_diligence_items" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "pe_exit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pe_exit_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pe_exit_events_tenant_scope" ON "pe_exit_events";
CREATE POLICY "pe_exit_events_tenant_scope" ON "pe_exit_events" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "pe_investment_committee_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pe_investment_committee_decisions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pe_investment_committee_decisions_tenant_scope" ON "pe_investment_committee_decisions";
CREATE POLICY "pe_investment_committee_decisions_tenant_scope" ON "pe_investment_committee_decisions" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "portfolio_companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "portfolio_companies" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "portfolio_companies_tenant_scope" ON "portfolio_companies";
CREATE POLICY "portfolio_companies_tenant_scope" ON "portfolio_companies" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "private_capital_calls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private_capital_calls" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "private_capital_calls_tenant_scope" ON "private_capital_calls";
CREATE POLICY "private_capital_calls_tenant_scope" ON "private_capital_calls" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "private_fund_distributions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private_fund_distributions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "private_fund_distributions_tenant_scope" ON "private_fund_distributions";
CREATE POLICY "private_fund_distributions_tenant_scope" ON "private_fund_distributions" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "private_fund_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private_fund_participants" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "private_fund_participants_tenant_scope" ON "private_fund_participants";
CREATE POLICY "private_fund_participants_tenant_scope" ON "private_fund_participants" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "private_funds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private_funds" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "private_funds_tenant_scope" ON "private_funds";
CREATE POLICY "private_funds_tenant_scope" ON "private_funds" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "valuation_assumption_sets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "valuation_assumption_sets" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "valuation_assumption_sets_tenant_scope" ON "valuation_assumption_sets";
CREATE POLICY "valuation_assumption_sets_tenant_scope" ON "valuation_assumption_sets" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "valuation_models" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "valuation_models" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "valuation_models_tenant_scope" ON "valuation_models";
CREATE POLICY "valuation_models_tenant_scope" ON "valuation_models" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "valuation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "valuation_runs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "valuation_runs_tenant_scope" ON "valuation_runs";
CREATE POLICY "valuation_runs_tenant_scope" ON "valuation_runs" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "cost_allocation_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_allocation_lines" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cost_allocation_lines_tenant_scope" ON "cost_allocation_lines";
CREATE POLICY "cost_allocation_lines_tenant_scope" ON "cost_allocation_lines" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "cost_allocation_rule_sets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_allocation_rule_sets" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cost_allocation_rule_sets_tenant_scope" ON "cost_allocation_rule_sets";
CREATE POLICY "cost_allocation_rule_sets_tenant_scope" ON "cost_allocation_rule_sets" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "cost_allocation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_allocation_runs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cost_allocation_runs_tenant_scope" ON "cost_allocation_runs";
CREATE POLICY "cost_allocation_runs_tenant_scope" ON "cost_allocation_runs" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "price_list_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "price_list_items" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "price_list_items_tenant_scope" ON "price_list_items";
CREATE POLICY "price_list_items_tenant_scope" ON "price_list_items" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "price_lists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "price_lists" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "price_lists_tenant_scope" ON "price_lists";
CREATE POLICY "price_lists_tenant_scope" ON "price_lists" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "pricing_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pricing_decisions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pricing_decisions_tenant_scope" ON "pricing_decisions";
CREATE POLICY "pricing_decisions_tenant_scope" ON "pricing_decisions" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "profitability_analyses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profitability_analyses" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profitability_analyses_tenant_scope" ON "profitability_analyses";
CREATE POLICY "profitability_analyses_tenant_scope" ON "profitability_analyses" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
ALTER TABLE "profitability_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profitability_lines" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profitability_lines_tenant_scope" ON "profitability_lines";
CREATE POLICY "profitability_lines_tenant_scope" ON "profitability_lines" FOR ALL
  USING (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()))
  WITH CHECK (("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope()));
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Runtime role grants — conditional on the role existing. Without these the
-- runtime role cannot reach the tables at all (fail-closed), which is what the
-- RLS/privilege audit suite expects.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON compensation_approval_stages, compensation_entitlements, compensation_policies, emergency_assistance_cases, employee_credit_facilities, employee_credit_instalments, employee_sponsorships, capital_formation_positions, entrusted_capital_arrangements, entrusted_capital_drawdowns, financial_instruments, financial_metric_observations, lbo_debt_tranches, lbo_model_runs, lbo_models, pe_due_diligence_items, pe_exit_events, pe_investment_committee_decisions, portfolio_companies, private_capital_calls, private_fund_distributions, private_fund_participants, private_funds, valuation_assumption_sets, valuation_models, valuation_runs, cost_allocation_lines, cost_allocation_rule_sets, cost_allocation_runs, price_list_items, price_lists, pricing_decisions, profitability_analyses, profitability_lines TO %I', r.rolname);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Source-of-truth registration — the new canonical stores, so duplication is
-- detectable rather than merely discouraged.
-- ---------------------------------------------------------------------------
INSERT INTO "source_of_truth" ("id", "capability", "authoritative_os", "authoritative_store", "consumers", "duplication_allowed", "notes") VALUES
('SOT_FINANCE_INTELLIGENCE', 'finance_intelligence', 'FINANCE_OS'::text, 'financial_metric_observations', '[]'::jsonb, false, 'Metric observations with full provenance: state, method, inputs, source, version. A metric with no value is MISSING, never zero.'),
('SOT_VALUATION', 'valuation', 'FINANCE_OS'::text, 'valuation_models', '[]'::jsonb, false, 'Valuation models, versioned assumption sets and runs. Assumptions are append-only and fingerprinted; runs record the version they used.'),
('SOT_PRIVATE_CAPITAL', 'private_capital', 'FINANCE_OS'::text, 'private_funds', '[]'::jsonb, false, 'Private equity funds, participants, capital calls, distributions, portfolio companies and IC decisions.'),
('SOT_LBO_MODELS', 'lbo_modelling', 'FINANCE_OS'::text, 'lbo_models', '[]'::jsonb, false, 'LBO models, debt tranches and deterministic, versioned runs with their refusals recorded.'),
('SOT_ENTRUSTED_CAPITAL', 'capital_formation', 'FINANCE_OS'::text, 'entrusted_capital_arrangements', '[]'::jsonb, false, 'Fiduciary, project and guaranteed capital, held apart by capital_origin. No combined total exists in the model.'),
('SOT_PRICING', 'pricing', 'BEYU_OS'::text, 'price_list_items', '[]'::jsonb, false, 'Enterprise prices with cost, markup and margin in separately constrained columns.'),
('SOT_PROFITABILITY', 'profitability', 'BEYU_OS'::text, 'profitability_analyses', '[]'::jsonb, false, 'The §12 profitability ladder: direct cost, allocated indirect cost and operating expense kept apart.'),
('SOT_COMPENSATION', 'compensation', 'BEYU_OS'::text, 'compensation_entitlements', '[]'::jsonb, false, 'HCM employee entitlements (base, bonus, allowance, credit, welfare). Entitlements, not payments; Finance OS posts the payment.')
ON CONFLICT ("id") DO NOTHING;
-- ---------------------------------------------------------------------------
-- END 0074
-- ---------------------------------------------------------------------------
