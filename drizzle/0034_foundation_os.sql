CREATE TABLE "beneficiary_services" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"beneficiary_id" text NOT NULL,
	"service_type" text NOT NULL,
	"provided_at" date NOT NULL,
	"outcome" text,
	"provider_ref" text,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donation_pledges" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"donor_id" text NOT NULL,
	"foundation_id" text NOT NULL,
	"code" text NOT NULL,
	"pledged_amount" numeric(18, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"schedule" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"start_date" date,
	"end_date" date,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"donor_id" text NOT NULL,
	"foundation_id" text NOT NULL,
	"fund_id" text,
	"code" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"received_at" date NOT NULL,
	"channel" text,
	"restriction_summary" text,
	"agreement_document_id" text,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"journal_entry_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donors" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"donor_type" text NOT NULL,
	"party_id" text,
	"country_code" text,
	"contact_ref" text,
	"due_diligence_status" text DEFAULT 'PENDING' NOT NULL,
	"due_diligence_at" timestamp with time zone,
	"steward_owner_role" text DEFAULT 'FOUNDATION_OFFICER' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "formation_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"foundation_id" text,
	"founder_party_id" text,
	"proposed_name" text NOT NULL,
	"mission" text,
	"purpose" text,
	"activities" text,
	"beneficiary_scope" text,
	"geographic_scope" text,
	"funding_model" text,
	"initial_capital" numeric(18, 2),
	"endowment_target" numeric(18, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"governance_model" text,
	"jurisdiction_id" text,
	"proposed_vehicle" text,
	"tax_objectives" text,
	"donor_model" text,
	"grantmaking_model" text,
	"international_activities" boolean DEFAULT false NOT NULL,
	"expected_workforce" integer,
	"assessment" jsonb,
	"recommendation" text,
	"status" text DEFAULT 'INTAKE' NOT NULL,
	"owner_role" text DEFAULT 'FOUNDATION_OFFICER' NOT NULL,
	"legal_review_required" boolean DEFAULT true NOT NULL,
	"tax_review_required" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"foundation_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"asset_type" text NOT NULL,
	"acquisition_date" date,
	"acquisition_value" numeric(18, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"donated_by_donor_id" text,
	"location" text,
	"custodian_role" text,
	"status" text DEFAULT 'REGISTERED' NOT NULL,
	"disposal_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_beneficiaries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"program_id" text,
	"project_id" text,
	"code" text NOT NULL,
	"cohort" text,
	"eligibility_status" text DEFAULT 'UNDER_REVIEW' NOT NULL,
	"consent_status" text DEFAULT 'PENDING' NOT NULL,
	"consent_ref" text,
	"safeguarding_flag" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_compliance_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"deadline_id" text NOT NULL,
	"foundation_id" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"owner_role" text NOT NULL,
	"owner_user_id" text,
	"depends_on_task_id" text,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"submitted_at" timestamp with time zone,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_conflicts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"foundation_id" text NOT NULL,
	"party_id" text NOT NULL,
	"interest_type" text NOT NULL,
	"description" text NOT NULL,
	"related_entity" text,
	"related_grant_id" text,
	"related_procurement_id" text,
	"severity" text DEFAULT 'MEDIUM' NOT NULL,
	"mitigation" text,
	"status" text DEFAULT 'DECLARED' NOT NULL,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" text,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_deadlines" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"obligation_id" text NOT NULL,
	"foundation_id" text NOT NULL,
	"period_label" text,
	"trigger_date" date NOT NULL,
	"due_date" date NOT NULL,
	"reminder_schedule" jsonb DEFAULT '[90,60,30,14,7,3,1,0]'::jsonb NOT NULL,
	"extensions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"overridden_due_date" date,
	"override_reason" text,
	"override_approved_by" text,
	"status" text DEFAULT 'UPCOMING' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_escalations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"deadline_id" text,
	"task_id" text,
	"foundation_id" text NOT NULL,
	"level" integer NOT NULL,
	"from_role" text NOT NULL,
	"to_role" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"acknowledged_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"foundation_id" text NOT NULL,
	"obligation_id" text,
	"deadline_id" text,
	"task_id" text,
	"document_id" text,
	"evidence_type" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"expires_at" date,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_impact_measurements" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"metric_id" text NOT NULL,
	"period" text NOT NULL,
	"actual" numeric(18, 4) NOT NULL,
	"evidence_document_id" text,
	"recorded_by" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_impact_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"program_id" text,
	"projectId" text,
	"grant_id" text,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"level" text NOT NULL,
	"unit" text NOT NULL,
	"baseline" numeric(18, 4),
	"target" numeric(18, 4),
	"geography" text,
	"beneficiary_scope" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_investment_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"foundation_id" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"asset_allocation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"liquidity_requirement" text,
	"risk_appetite" text,
	"concentration_limits" text,
	"prohibited_instruments" text,
	"approval_ref" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"effective_from" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_investments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"foundation_id" text NOT NULL,
	"policy_id" text,
	"fund_id" text,
	"code" text NOT NULL,
	"instrument" text NOT NULL,
	"counterparty" text,
	"principal_amount" numeric(18, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"expected_return_pct" numeric(7, 4),
	"maturity_date" date,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"approval_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"foundation_id" text NOT NULL,
	"governance_body_id" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"location" text,
	"agenda" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"minutes_document_id" text,
	"quorum_required" integer,
	"quorum_met" boolean,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_notification_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"deadline_id" text,
	"task_id" text,
	"foundation_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"channel" text DEFAULT 'IN_APP' NOT NULL,
	"offset_days" integer,
	"recipient_role" text,
	"recipient_user_id" text,
	"notification_id" text,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_obligations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"foundation_id" text NOT NULL,
	"requirement" text NOT NULL,
	"authority" text NOT NULL,
	"regulator" text,
	"jurisdiction_id" text,
	"legal_entity_id" text,
	"canonical_obligation_id" text,
	"trigger" text NOT NULL,
	"frequency" text DEFAULT 'ANNUAL' NOT NULL,
	"deadline_rule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"effective_from" date NOT NULL,
	"owner_role" text NOT NULL,
	"approver_role" text,
	"evidence_required" boolean DEFAULT true NOT NULL,
	"risk_rating" text DEFAULT 'MEDIUM' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"source" text,
	"verification_date" date,
	"next_review_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_project_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"depends_on_task_id" text,
	"owner_role" text,
	"due_date" date,
	"status" text DEFAULT 'TODO' NOT NULL,
	"evidence_document_id" text
);
--> statement-breakpoint
CREATE TABLE "foundation_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"program_id" text NOT NULL,
	"foundation_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"objectives" text,
	"geography" text,
	"budget" numeric(18, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"start_date" date,
	"end_date" date,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"owner_role" text DEFAULT 'FOUNDATION_OFFICER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_tax_assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"foundation_id" text NOT NULL,
	"tax_rule_id" text,
	"activity" text NOT NULL,
	"transaction_ref" text,
	"tax_status" text DEFAULT 'UNDER_REVIEW' NOT NULL,
	"potential_benefit" text,
	"potential_liability" text,
	"assumptions" text,
	"risks" text,
	"professional_review_required" boolean DEFAULT true NOT NULL,
	"reviewer" text,
	"assessed_by" text,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_tax_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"foundation_id" text NOT NULL,
	"jurisdiction_id" text,
	"tax_status" text DEFAULT 'UNDER_REVIEW' NOT NULL,
	"exempt_since" date,
	"registration_ref" text,
	"fiscal_year_end" text,
	"assumptions" text,
	"last_reviewed_at" date,
	"next_review_at" date,
	"professional_review_required" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_tax_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"jurisdiction_id" text,
	"country_code" text NOT NULL,
	"authority" text NOT NULL,
	"source" text NOT NULL,
	"rule_version" text DEFAULT '1.0' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"superseded_by" text,
	"applicability" text NOT NULL,
	"rule_body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"verification_date" date,
	"status" text DEFAULT 'UNDER_REVIEW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_types" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"available_in" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_governance" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_workforce_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"foundation_id" text NOT NULL,
	"program_id" text,
	"projectId" text,
	"grant_id" text,
	"assignment_type" text NOT NULL,
	"role_title" text NOT NULL,
	"responsibility_scope" text,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text,
	"code" text NOT NULL,
	"legal_name" text NOT NULL,
	"operating_name" text,
	"foundation_type_id" text,
	"legal_vehicle" text NOT NULL,
	"registration_number" text,
	"jurisdiction_id" text,
	"country_code" text NOT NULL,
	"regulator" text,
	"tax_authority" text,
	"tax_status" text DEFAULT 'UNDER_REVIEW' NOT NULL,
	"fiscal_year_end" text,
	"base_currency" text DEFAULT 'USD' NOT NULL,
	"mission" text,
	"purpose" text,
	"geographic_scope" text,
	"beneficiary_scope" text,
	"founding_date" date,
	"registration_date" date,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"status_changed_at" timestamp with time zone,
	"status_changed_by" text,
	"governance_body_id" text,
	"owner_role" text DEFAULT 'FOUNDATION_DIRECTOR' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"fund_id" text NOT NULL,
	"program_id" text,
	"grant_id" text,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"purpose" text,
	"allocated_by" text,
	"approval_ref" text,
	"allocated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'PROPOSED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_restrictions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"fund_id" text NOT NULL,
	"restriction_type" text NOT NULL,
	"rule" text NOT NULL,
	"donor_id" text,
	"effective_from" date,
	"effective_to" date,
	"status" text DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funds" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"foundation_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"fund_type" text NOT NULL,
	"purpose" text,
	"source" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"committed" numeric(18, 2) DEFAULT '0' NOT NULL,
	"reporting_obligations" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grant_disbursements" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"grant_id" text NOT NULL,
	"milestone_id" text,
	"code" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"scheduled_for" date,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"approval_ref" text,
	"journal_entry_id" text,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grant_milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"grant_id" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"deliverables" text,
	"due_date" date,
	"evidence_document_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"verified_by" text,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "grantees" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"grantee_type" text NOT NULL,
	"country_code" text,
	"registration_ref" text,
	"due_diligence_status" text DEFAULT 'PENDING' NOT NULL,
	"sanctions_checked_at" timestamp with time zone,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grants" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"foundation_id" text NOT NULL,
	"fund_id" text,
	"program_id" text,
	"grantee_id" text,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"budget" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"restrictions" text,
	"eligibility_result" text,
	"assessment_score" numeric(7, 2),
	"conflict_check_status" text DEFAULT 'PENDING' NOT NULL,
	"approval_ref" text,
	"agreement_document_id" text,
	"start_date" date,
	"end_date" date,
	"status" text DEFAULT 'OPPORTUNITY' NOT NULL,
	"risk_rating" text DEFAULT 'MEDIUM' NOT NULL,
	"owner_role" text DEFAULT 'FOUNDATION_OFFICER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procurements" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"foundation_id" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"need_statement" text,
	"budget_amount" numeric(18, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"supplier_id" text,
	"quotes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conflict_check_status" text DEFAULT 'PENDING' NOT NULL,
	"contract_document_id" text,
	"status" text DEFAULT 'NEED' NOT NULL,
	"approval_ref" text,
	"owner_role" text DEFAULT 'FOUNDATION_OFFICER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safeguarding_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"foundation_id" text NOT NULL,
	"code" text NOT NULL,
	"case_type" text NOT NULL,
	"summary" text NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reporter_ref" text,
	"status" text DEFAULT 'REPORTED' NOT NULL,
	"investigator_role" text,
	"corrective_action" text,
	"closed_at" timestamp with time zone,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "structure_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"foundation_id" text,
	"kind" text DEFAULT 'PROPOSED' NOT NULL,
	"title" text NOT NULL,
	"graph" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rationale" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"proposed_by" text,
	"resolution_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "structure_scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"baseline_proposal_id" text,
	"candidate_proposal_id" text,
	"question" text NOT NULL,
	"diff" jsonb,
	"impacts" jsonb,
	"required_approvals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"implementation_tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"country_code" text,
	"registration_ref" text,
	"due_diligence_status" text DEFAULT 'PENDING' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "beneficiary_services" ADD CONSTRAINT "beneficiary_services_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beneficiary_services" ADD CONSTRAINT "beneficiary_services_beneficiary_id_foundation_beneficiaries_id_fk" FOREIGN KEY ("beneficiary_id") REFERENCES "public"."foundation_beneficiaries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_pledges" ADD CONSTRAINT "donation_pledges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_pledges" ADD CONSTRAINT "donation_pledges_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_pledges" ADD CONSTRAINT "donation_pledges_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_agreement_document_id_documents_id_fk" FOREIGN KEY ("agreement_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donors" ADD CONSTRAINT "donors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donors" ADD CONSTRAINT "donors_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donors" ADD CONSTRAINT "donors_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_cases" ADD CONSTRAINT "formation_cases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_cases" ADD CONSTRAINT "formation_cases_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_cases" ADD CONSTRAINT "formation_cases_founder_party_id_parties_id_fk" FOREIGN KEY ("founder_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formation_cases" ADD CONSTRAINT "formation_cases_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_assets" ADD CONSTRAINT "foundation_assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_assets" ADD CONSTRAINT "foundation_assets_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_assets" ADD CONSTRAINT "foundation_assets_donated_by_donor_id_donors_id_fk" FOREIGN KEY ("donated_by_donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_beneficiaries" ADD CONSTRAINT "foundation_beneficiaries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_beneficiaries" ADD CONSTRAINT "foundation_beneficiaries_program_id_foundation_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."foundation_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_beneficiaries" ADD CONSTRAINT "foundation_beneficiaries_project_id_foundation_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."foundation_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_compliance_tasks" ADD CONSTRAINT "foundation_compliance_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_compliance_tasks" ADD CONSTRAINT "foundation_compliance_tasks_deadline_id_foundation_deadlines_id_fk" FOREIGN KEY ("deadline_id") REFERENCES "public"."foundation_deadlines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_compliance_tasks" ADD CONSTRAINT "foundation_compliance_tasks_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_compliance_tasks" ADD CONSTRAINT "foundation_compliance_tasks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_conflicts" ADD CONSTRAINT "foundation_conflicts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_conflicts" ADD CONSTRAINT "foundation_conflicts_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_conflicts" ADD CONSTRAINT "foundation_conflicts_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_deadlines" ADD CONSTRAINT "foundation_deadlines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_deadlines" ADD CONSTRAINT "foundation_deadlines_obligation_id_foundation_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."foundation_obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_deadlines" ADD CONSTRAINT "foundation_deadlines_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_escalations" ADD CONSTRAINT "foundation_escalations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_escalations" ADD CONSTRAINT "foundation_escalations_deadline_id_foundation_deadlines_id_fk" FOREIGN KEY ("deadline_id") REFERENCES "public"."foundation_deadlines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_escalations" ADD CONSTRAINT "foundation_escalations_task_id_foundation_compliance_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."foundation_compliance_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_escalations" ADD CONSTRAINT "foundation_escalations_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evidence" ADD CONSTRAINT "foundation_evidence_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evidence" ADD CONSTRAINT "foundation_evidence_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evidence" ADD CONSTRAINT "foundation_evidence_obligation_id_foundation_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."foundation_obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evidence" ADD CONSTRAINT "foundation_evidence_deadline_id_foundation_deadlines_id_fk" FOREIGN KEY ("deadline_id") REFERENCES "public"."foundation_deadlines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evidence" ADD CONSTRAINT "foundation_evidence_task_id_foundation_compliance_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."foundation_compliance_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_evidence" ADD CONSTRAINT "foundation_evidence_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_impact_measurements" ADD CONSTRAINT "foundation_impact_measurements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_impact_measurements" ADD CONSTRAINT "foundation_impact_measurements_metric_id_foundation_impact_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."foundation_impact_metrics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_impact_measurements" ADD CONSTRAINT "foundation_impact_measurements_evidence_document_id_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_impact_metrics" ADD CONSTRAINT "foundation_impact_metrics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_impact_metrics" ADD CONSTRAINT "foundation_impact_metrics_program_id_foundation_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."foundation_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_impact_metrics" ADD CONSTRAINT "foundation_impact_metrics_projectId_foundation_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."foundation_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_impact_metrics" ADD CONSTRAINT "foundation_impact_metrics_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_investment_policies" ADD CONSTRAINT "foundation_investment_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_investment_policies" ADD CONSTRAINT "foundation_investment_policies_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_investments" ADD CONSTRAINT "foundation_investments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_investments" ADD CONSTRAINT "foundation_investments_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_investments" ADD CONSTRAINT "foundation_investments_policy_id_foundation_investment_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."foundation_investment_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_investments" ADD CONSTRAINT "foundation_investments_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_meetings" ADD CONSTRAINT "foundation_meetings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_meetings" ADD CONSTRAINT "foundation_meetings_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_meetings" ADD CONSTRAINT "foundation_meetings_minutes_document_id_documents_id_fk" FOREIGN KEY ("minutes_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_notification_log" ADD CONSTRAINT "foundation_notification_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_notification_log" ADD CONSTRAINT "foundation_notification_log_deadline_id_foundation_deadlines_id_fk" FOREIGN KEY ("deadline_id") REFERENCES "public"."foundation_deadlines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_notification_log" ADD CONSTRAINT "foundation_notification_log_task_id_foundation_compliance_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."foundation_compliance_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_notification_log" ADD CONSTRAINT "foundation_notification_log_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_notification_log" ADD CONSTRAINT "foundation_notification_log_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_obligations" ADD CONSTRAINT "foundation_obligations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_obligations" ADD CONSTRAINT "foundation_obligations_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_obligations" ADD CONSTRAINT "foundation_obligations_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_obligations" ADD CONSTRAINT "foundation_obligations_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_project_tasks" ADD CONSTRAINT "foundation_project_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_project_tasks" ADD CONSTRAINT "foundation_project_tasks_project_id_foundation_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."foundation_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_project_tasks" ADD CONSTRAINT "foundation_project_tasks_evidence_document_id_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_projects" ADD CONSTRAINT "foundation_projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_projects" ADD CONSTRAINT "foundation_projects_program_id_foundation_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."foundation_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_projects" ADD CONSTRAINT "foundation_projects_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_tax_assessments" ADD CONSTRAINT "foundation_tax_assessments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_tax_assessments" ADD CONSTRAINT "foundation_tax_assessments_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_tax_assessments" ADD CONSTRAINT "foundation_tax_assessments_tax_rule_id_foundation_tax_rules_id_fk" FOREIGN KEY ("tax_rule_id") REFERENCES "public"."foundation_tax_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_tax_profiles" ADD CONSTRAINT "foundation_tax_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_tax_profiles" ADD CONSTRAINT "foundation_tax_profiles_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_tax_profiles" ADD CONSTRAINT "foundation_tax_profiles_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_tax_rules" ADD CONSTRAINT "foundation_tax_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_tax_rules" ADD CONSTRAINT "foundation_tax_rules_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_tax_rules" ADD CONSTRAINT "foundation_tax_rules_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_types" ADD CONSTRAINT "foundation_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_workforce_assignments" ADD CONSTRAINT "foundation_workforce_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_workforce_assignments" ADD CONSTRAINT "foundation_workforce_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_workforce_assignments" ADD CONSTRAINT "foundation_workforce_assignments_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_workforce_assignments" ADD CONSTRAINT "foundation_workforce_assignments_program_id_foundation_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."foundation_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_workforce_assignments" ADD CONSTRAINT "foundation_workforce_assignments_projectId_foundation_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."foundation_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_workforce_assignments" ADD CONSTRAINT "foundation_workforce_assignments_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundations" ADD CONSTRAINT "foundations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundations" ADD CONSTRAINT "foundations_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundations" ADD CONSTRAINT "foundations_foundation_type_id_foundation_types_id_fk" FOREIGN KEY ("foundation_type_id") REFERENCES "public"."foundation_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundations" ADD CONSTRAINT "foundations_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundations" ADD CONSTRAINT "foundations_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_allocations" ADD CONSTRAINT "fund_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_allocations" ADD CONSTRAINT "fund_allocations_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_allocations" ADD CONSTRAINT "fund_allocations_program_id_foundation_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."foundation_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_restrictions" ADD CONSTRAINT "fund_restrictions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_restrictions" ADD CONSTRAINT "fund_restrictions_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_restrictions" ADD CONSTRAINT "fund_restrictions_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funds" ADD CONSTRAINT "funds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funds" ADD CONSTRAINT "funds_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_disbursements" ADD CONSTRAINT "grant_disbursements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_disbursements" ADD CONSTRAINT "grant_disbursements_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_disbursements" ADD CONSTRAINT "grant_disbursements_milestone_id_grant_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."grant_milestones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_milestones" ADD CONSTRAINT "grant_milestones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_milestones" ADD CONSTRAINT "grant_milestones_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_milestones" ADD CONSTRAINT "grant_milestones_evidence_document_id_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grantees" ADD CONSTRAINT "grantees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grantees" ADD CONSTRAINT "grantees_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_program_id_foundation_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."foundation_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_grantee_id_grantees_id_fk" FOREIGN KEY ("grantee_id") REFERENCES "public"."grantees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_agreement_document_id_documents_id_fk" FOREIGN KEY ("agreement_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurements" ADD CONSTRAINT "procurements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurements" ADD CONSTRAINT "procurements_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurements" ADD CONSTRAINT "procurements_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurements" ADD CONSTRAINT "procurements_contract_document_id_documents_id_fk" FOREIGN KEY ("contract_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safeguarding_cases" ADD CONSTRAINT "safeguarding_cases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safeguarding_cases" ADD CONSTRAINT "safeguarding_cases_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_proposals" ADD CONSTRAINT "structure_proposals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_proposals" ADD CONSTRAINT "structure_proposals_foundation_id_foundations_id_fk" FOREIGN KEY ("foundation_id") REFERENCES "public"."foundations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_scenarios" ADD CONSTRAINT "structure_scenarios_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_scenarios" ADD CONSTRAINT "structure_scenarios_baseline_proposal_id_structure_proposals_id_fk" FOREIGN KEY ("baseline_proposal_id") REFERENCES "public"."structure_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_scenarios" ADD CONSTRAINT "structure_scenarios_candidate_proposal_id_structure_proposals_id_fk" FOREIGN KEY ("candidate_proposal_id") REFERENCES "public"."structure_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "beneficiary_services_tenant_idx" ON "beneficiary_services" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "beneficiary_services_beneficiary_idx" ON "beneficiary_services" USING btree ("beneficiary_id");--> statement-breakpoint
CREATE UNIQUE INDEX "donation_pledges_tenant_code_uidx" ON "donation_pledges" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "donation_pledges_donor_idx" ON "donation_pledges" USING btree ("donor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "donations_tenant_code_uidx" ON "donations" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "donations_donor_idx" ON "donations" USING btree ("donor_id");--> statement-breakpoint
CREATE INDEX "donations_foundation_idx" ON "donations" USING btree ("foundation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "donors_tenant_code_uidx" ON "donors" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "donors_tenant_idx" ON "donors" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "formation_cases_tenant_code_uidx" ON "formation_cases" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "formation_cases_tenant_idx" ON "formation_cases" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "formation_cases_status_idx" ON "formation_cases" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_assets_tenant_code_uidx" ON "foundation_assets" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "foundation_assets_foundation_idx" ON "foundation_assets" USING btree ("foundation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_beneficiaries_tenant_code_uidx" ON "foundation_beneficiaries" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "foundation_beneficiaries_program_idx" ON "foundation_beneficiaries" USING btree ("program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_compliance_tasks_tenant_code_uidx" ON "foundation_compliance_tasks" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "foundation_compliance_tasks_deadline_idx" ON "foundation_compliance_tasks" USING btree ("deadline_id");--> statement-breakpoint
CREATE INDEX "foundation_compliance_tasks_status_idx" ON "foundation_compliance_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "foundation_conflicts_tenant_idx" ON "foundation_conflicts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "foundation_conflicts_foundation_idx" ON "foundation_conflicts" USING btree ("foundation_id");--> statement-breakpoint
CREATE INDEX "foundation_deadlines_tenant_idx" ON "foundation_deadlines" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "foundation_deadlines_obligation_idx" ON "foundation_deadlines" USING btree ("obligation_id");--> statement-breakpoint
CREATE INDEX "foundation_deadlines_due_idx" ON "foundation_deadlines" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "foundation_deadlines_status_idx" ON "foundation_deadlines" USING btree ("status");--> statement-breakpoint
CREATE INDEX "foundation_escalations_tenant_idx" ON "foundation_escalations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "foundation_escalations_deadline_idx" ON "foundation_escalations" USING btree ("deadline_id");--> statement-breakpoint
CREATE INDEX "foundation_escalations_status_idx" ON "foundation_escalations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "foundation_evidence_tenant_idx" ON "foundation_evidence" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "foundation_evidence_deadline_idx" ON "foundation_evidence" USING btree ("deadline_id");--> statement-breakpoint
CREATE INDEX "foundation_evidence_status_idx" ON "foundation_evidence" USING btree ("status");--> statement-breakpoint
CREATE INDEX "foundation_impact_measurements_tenant_idx" ON "foundation_impact_measurements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "foundation_impact_measurements_metric_idx" ON "foundation_impact_measurements" USING btree ("metric_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_impact_metrics_tenant_code_uidx" ON "foundation_impact_metrics" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "foundation_impact_metrics_program_idx" ON "foundation_impact_metrics" USING btree ("program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_investment_policies_tenant_code_uidx" ON "foundation_investment_policies" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "foundation_investment_policies_foundation_idx" ON "foundation_investment_policies" USING btree ("foundation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_investments_tenant_code_uidx" ON "foundation_investments" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "foundation_investments_foundation_idx" ON "foundation_investments" USING btree ("foundation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_meetings_tenant_code_uidx" ON "foundation_meetings" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "foundation_meetings_foundation_idx" ON "foundation_meetings" USING btree ("foundation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_notification_log_key_uidx" ON "foundation_notification_log" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "foundation_notification_log_deadline_idx" ON "foundation_notification_log" USING btree ("deadline_id");--> statement-breakpoint
CREATE INDEX "foundation_notification_log_status_idx" ON "foundation_notification_log" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_obligations_tenant_code_uidx" ON "foundation_obligations" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "foundation_obligations_foundation_idx" ON "foundation_obligations" USING btree ("foundation_id");--> statement-breakpoint
CREATE INDEX "foundation_obligations_status_idx" ON "foundation_obligations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_project_tasks_project_code_uidx" ON "foundation_project_tasks" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "foundation_project_tasks_tenant_idx" ON "foundation_project_tasks" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_projects_tenant_code_uidx" ON "foundation_projects" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "foundation_projects_program_idx" ON "foundation_projects" USING btree ("program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_tax_assessments_tenant_code_uidx" ON "foundation_tax_assessments" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "foundation_tax_assessments_foundation_idx" ON "foundation_tax_assessments" USING btree ("foundation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_tax_profiles_foundation_uidx" ON "foundation_tax_profiles" USING btree ("foundation_id");--> statement-breakpoint
CREATE INDEX "foundation_tax_profiles_tenant_idx" ON "foundation_tax_profiles" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_tax_rules_tenant_code_uidx" ON "foundation_tax_rules" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "foundation_tax_rules_jurisdiction_idx" ON "foundation_tax_rules" USING btree ("jurisdiction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundation_types_tenant_code_uidx" ON "foundation_types" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "foundation_types_tenant_idx" ON "foundation_types" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "foundation_workforce_assignments_tenant_idx" ON "foundation_workforce_assignments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "foundation_workforce_assignments_employee_idx" ON "foundation_workforce_assignments" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "foundation_workforce_assignments_foundation_idx" ON "foundation_workforce_assignments" USING btree ("foundation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foundations_tenant_code_uidx" ON "foundations" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "foundations_tenant_idx" ON "foundations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "foundations_entity_idx" ON "foundations" USING btree ("legal_entity_id");--> statement-breakpoint
CREATE INDEX "foundations_status_idx" ON "foundations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fund_allocations_tenant_idx" ON "fund_allocations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "fund_allocations_fund_idx" ON "fund_allocations" USING btree ("fund_id");--> statement-breakpoint
CREATE INDEX "fund_restrictions_tenant_idx" ON "fund_restrictions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "fund_restrictions_fund_idx" ON "fund_restrictions" USING btree ("fund_id");--> statement-breakpoint
CREATE UNIQUE INDEX "funds_tenant_code_uidx" ON "funds" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "funds_foundation_idx" ON "funds" USING btree ("foundation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grant_disbursements_tenant_code_uidx" ON "grant_disbursements" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "grant_disbursements_grant_idx" ON "grant_disbursements" USING btree ("grant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grant_milestones_grant_code_uidx" ON "grant_milestones" USING btree ("grant_id","code");--> statement-breakpoint
CREATE INDEX "grant_milestones_tenant_idx" ON "grant_milestones" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grantees_tenant_code_uidx" ON "grantees" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "grantees_tenant_idx" ON "grantees" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grants_tenant_code_uidx" ON "grants" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "grants_foundation_idx" ON "grants" USING btree ("foundation_id");--> statement-breakpoint
CREATE INDEX "grants_status_idx" ON "grants" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "procurements_tenant_code_uidx" ON "procurements" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "procurements_foundation_idx" ON "procurements" USING btree ("foundation_id");--> statement-breakpoint
CREATE INDEX "procurements_status_idx" ON "procurements" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "safeguarding_cases_tenant_code_uidx" ON "safeguarding_cases" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "safeguarding_cases_foundation_idx" ON "safeguarding_cases" USING btree ("foundation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "structure_proposals_tenant_code_uidx" ON "structure_proposals" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "structure_proposals_tenant_idx" ON "structure_proposals" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "structure_scenarios_tenant_code_uidx" ON "structure_scenarios" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "structure_scenarios_tenant_idx" ON "structure_scenarios" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_tenant_code_uidx" ON "suppliers" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "suppliers_tenant_idx" ON "suppliers" USING btree ("tenant_id");
-- Foundation OS RLS: canonical tenant isolation via beyu_tenant_ids().
--> statement-breakpoint
ALTER TABLE foundation_types ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_types_tenant_isolation ON foundation_types USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundations_tenant_isolation ON foundations USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE formation_cases ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY formation_cases_tenant_isolation ON formation_cases USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE structure_proposals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY structure_proposals_tenant_isolation ON structure_proposals USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE structure_scenarios ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY structure_scenarios_tenant_isolation ON structure_scenarios USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_meetings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_meetings_tenant_isolation ON foundation_meetings USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_conflicts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_conflicts_tenant_isolation ON foundation_conflicts USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_tax_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_tax_profiles_tenant_isolation ON foundation_tax_profiles USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_tax_rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_tax_rules_tenant_isolation ON foundation_tax_rules USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_tax_assessments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_tax_assessments_tenant_isolation ON foundation_tax_assessments USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_obligations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_obligations_tenant_isolation ON foundation_obligations USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_deadlines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_deadlines_tenant_isolation ON foundation_deadlines USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_compliance_tasks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_compliance_tasks_tenant_isolation ON foundation_compliance_tasks USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_notification_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_notification_log_tenant_isolation ON foundation_notification_log USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_escalations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_escalations_tenant_isolation ON foundation_escalations USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_evidence ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_evidence_tenant_isolation ON foundation_evidence USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE donors ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY donors_tenant_isolation ON donors USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY donations_tenant_isolation ON donations USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE donation_pledges ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY donation_pledges_tenant_isolation ON donation_pledges USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE funds ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY funds_tenant_isolation ON funds USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE fund_restrictions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY fund_restrictions_tenant_isolation ON fund_restrictions USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE fund_allocations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY fund_allocations_tenant_isolation ON fund_allocations USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE grantees ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY grantees_tenant_isolation ON grantees USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE grants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY grants_tenant_isolation ON grants USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE grant_milestones ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY grant_milestones_tenant_isolation ON grant_milestones USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE grant_disbursements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY grant_disbursements_tenant_isolation ON grant_disbursements USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_projects ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_projects_tenant_isolation ON foundation_projects USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_project_tasks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_project_tasks_tenant_isolation ON foundation_project_tasks USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_beneficiaries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_beneficiaries_tenant_isolation ON foundation_beneficiaries USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE beneficiary_services ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY beneficiary_services_tenant_isolation ON beneficiary_services USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY suppliers_tenant_isolation ON suppliers USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE procurements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY procurements_tenant_isolation ON procurements USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_assets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_assets_tenant_isolation ON foundation_assets USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_investment_policies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_investment_policies_tenant_isolation ON foundation_investment_policies USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_investments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_investments_tenant_isolation ON foundation_investments USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE safeguarding_cases ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY safeguarding_cases_tenant_isolation ON safeguarding_cases USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_impact_metrics ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_impact_metrics_tenant_isolation ON foundation_impact_metrics USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_impact_measurements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_impact_measurements_tenant_isolation ON foundation_impact_measurements USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
ALTER TABLE foundation_workforce_assignments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY foundation_workforce_assignments_tenant_isolation ON foundation_workforce_assignments USING (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));
--> statement-breakpoint
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO %I', 'foundation_types, foundations, formation_cases, structure_proposals, structure_scenarios, foundation_meetings, foundation_conflicts, foundation_tax_profiles, foundation_tax_rules, foundation_tax_assessments, foundation_obligations, foundation_deadlines, foundation_compliance_tasks, foundation_notification_log, foundation_escalations, foundation_evidence, donors, donations, donation_pledges, funds, fund_restrictions, fund_allocations, grantees, grants, grant_milestones, grant_disbursements, foundation_projects, foundation_project_tasks, foundation_beneficiaries, beneficiary_services, suppliers, procurements, foundation_assets, foundation_investment_policies, foundation_investments, safeguarding_cases, foundation_impact_metrics, foundation_impact_measurements, foundation_workforce_assignments', r.rolname);
    RAISE NOTICE 'granted foundation DML to %', r.rolname;
  END LOOP;
END
$$;
--> statement-breakpoint
DO $$
DECLARE
  table_name text;
  policy_count int;
BEGIN
  FOR table_name IN SELECT unnest(ARRAY['foundation_types', 'foundations', 'formation_cases', 'structure_proposals', 'structure_scenarios', 'foundation_meetings', 'foundation_conflicts', 'foundation_tax_profiles', 'foundation_tax_rules', 'foundation_tax_assessments', 'foundation_obligations', 'foundation_deadlines', 'foundation_compliance_tasks', 'foundation_notification_log', 'foundation_escalations', 'foundation_evidence', 'donors', 'donations', 'donation_pledges', 'funds', 'fund_restrictions', 'fund_allocations', 'grantees', 'grants', 'grant_milestones', 'grant_disbursements', 'foundation_projects', 'foundation_project_tasks', 'foundation_beneficiaries', 'beneficiary_services', 'suppliers', 'procurements', 'foundation_assets', 'foundation_investment_policies', 'foundation_investments', 'safeguarding_cases', 'foundation_impact_metrics', 'foundation_impact_measurements', 'foundation_workforce_assignments'])
  LOOP
    SELECT count(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = table_name
      AND policyname = table_name || '_tenant_isolation';
    IF policy_count = 0 THEN
      RAISE EXCEPTION 'Migration 0034 verification failed: % has no tenant isolation policy', table_name;
    END IF;
  END LOOP;
END $$;
