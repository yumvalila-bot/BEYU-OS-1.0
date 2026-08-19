CREATE TYPE "public"."beyu_ai_output_class" AS ENUM('FACT', 'INFERENCE', 'RECOMMENDATION', 'PREDICTION', 'UNCERTAINTY', 'REQUIRES_HUMAN_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."beyu_approval_decision" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'DELEGATED', 'ESCALATED');--> statement-breakpoint
CREATE TYPE "public"."beyu_authority_status" AS ENUM('AUTHORITATIVE', 'UNDER_REVIEW', 'SUPERSEDED', 'EXPIRED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."beyu_classification" AS ENUM('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'HIGHLY_RESTRICTED');--> statement-breakpoint
CREATE TYPE "public"."beyu_compliance_state" AS ENUM('COMPLIANT', 'NON_COMPLIANT', 'PARTIALLY_COMPLIANT', 'NOT_ASSESSED', 'NOT_APPLICABLE', 'REQUIRES_HUMAN_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."beyu_decision_status" AS ENUM('DRAFT', 'TABLED', 'VOTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'DEFERRED');--> statement-breakpoint
CREATE TYPE "public"."beyu_eligibility" AS ENUM('ELIGIBLE', 'CONDITIONAL', 'INELIGIBLE', 'UNDER_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."beyu_entity_type" AS ENUM('TRUST', 'FOUNDATION', 'HOLDING', 'COUNTRY_HOLDING', 'OPERATING_COMPANY', 'SUBSIDIARY', 'ASSOCIATE', 'JOINT_VENTURE', 'PARTNERSHIP', 'BRANCH', 'NON_PROFIT');--> statement-breakpoint
CREATE TYPE "public"."beyu_lifecycle_status" AS ENUM('CREATED', 'VERIFIED', 'ACTIVE', 'MODIFIED', 'SUSPENDED', 'REVOKED', 'DEACTIVATED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."beyu_ownership_type" AS ENUM('DIRECT', 'INDIRECT', 'BENEFICIAL', 'CONTROL_ONLY');--> statement-breakpoint
CREATE TYPE "public"."beyu_party_type" AS ENUM('PERSON', 'ORGANIZATION', 'SERVICE_ACCOUNT', 'AI_AGENT', 'DEVICE');--> statement-breakpoint
CREATE TYPE "public"."beyu_policy_level" AS ENUM('CONSTITUTION', 'ENTERPRISE', 'DOMAIN', 'SECTOR', 'ENTITY', 'TENANT', 'WORKFLOW_RULE', 'TRANSACTION_CONTROL');--> statement-breakpoint
CREATE TYPE "public"."beyu_risk_category" AS ENUM('STRATEGIC', 'OPERATIONAL', 'FINANCIAL', 'LEGAL', 'REGULATORY', 'CYBERSECURITY', 'PRIVACY', 'INVESTMENT', 'LIQUIDITY', 'REPUTATIONAL', 'THIRD_PARTY', 'AI', 'CLINICAL', 'COUNTRY', 'GEOPOLITICAL', 'CONCENTRATION');--> statement-breakpoint
CREATE TYPE "public"."beyu_tax_position" AS ENUM('LEGAL_TAX_PLANNING', 'LAWFUL_AVOIDANCE', 'AGGRESSIVE_UNCERTAIN', 'PROHIBITED_EVASION');--> statement-breakpoint
CREATE TYPE "public"."beyu_tenant_type" AS ENUM('ENTERPRISE', 'COUNTRY', 'SECTOR', 'LEGAL_ENTITY', 'BRANCH', 'DEPARTMENT');--> statement-breakpoint
CREATE TYPE "public"."beyu_verification_status" AS ENUM('UNVERIFIED', 'DOCUMENTED', 'VERIFIED', 'DISPUTED');--> statement-breakpoint
CREATE TYPE "public"."beyu_version_status" AS ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'SUPERSEDED', 'RETIRED');--> statement-breakpoint
CREATE TABLE "countries" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"region" text NOT NULL,
	"currency_code" text NOT NULL,
	"timezone" text NOT NULL,
	"locale" text DEFAULT 'en-US' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_appointments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"party_id" text NOT NULL,
	"role" text NOT NULL,
	"appointed_on" date NOT NULL,
	"resigned_on" date,
	"authority_limit" numeric(18, 2),
	"resolution_ref" text
);
--> statement-breakpoint
CREATE TABLE "jurisdictions" (
	"id" text PRIMARY KEY NOT NULL,
	"country_code" text NOT NULL,
	"level" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"regulator" text,
	"legal_system" text,
	"effective_from" date NOT NULL,
	"effective_to" date
);
--> statement-breakpoint
CREATE TABLE "legal_entities" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"legal_name" text NOT NULL,
	"trading_name" text,
	"entity_type" "beyu_entity_type" NOT NULL,
	"parent_entity_id" text,
	"country_code" text NOT NULL,
	"jurisdiction_id" text,
	"registration_number" text,
	"tax_identifier" text,
	"incorporation_date" date,
	"functional_currency" text DEFAULT 'USD' NOT NULL,
	"accounting_standard" text DEFAULT 'IFRS' NOT NULL,
	"sector_code" text,
	"status" "beyu_lifecycle_status" DEFAULT 'ACTIVE' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_units" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit_type" text NOT NULL,
	"parent_unit_id" text,
	"cost_centre" text,
	"status" "beyu_lifecycle_status" DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_registry" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"purpose" text NOT NULL,
	"owner_role" text NOT NULL,
	"authority_scope" text NOT NULL,
	"data_authority" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"apis" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"compliance_frameworks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"lifecycle" "beyu_version_status" DEFAULT 'ACTIVE' NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ownership_records" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"owned_entity_id" text NOT NULL,
	"owner_entity_id" text,
	"owner_party_id" text,
	"ownership_type" "beyu_ownership_type" NOT NULL,
	"instrument" text DEFAULT 'ORDINARY_SHARES' NOT NULL,
	"economic_pct" numeric(9, 6) NOT NULL,
	"voting_pct" numeric(9, 6) NOT NULL,
	"control_rights" text,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"provenance" text NOT NULL,
	"supporting_document_id" text,
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_of_truth" (
	"id" text PRIMARY KEY NOT NULL,
	"capability" text NOT NULL,
	"authoritative_os" text NOT NULL,
	"authoritative_store" text NOT NULL,
	"consumers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duplication_allowed" boolean DEFAULT false NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "beyu_tenant_type" NOT NULL,
	"parent_tenant_id" text,
	"country_code" text,
	"isolation_tier" text DEFAULT 'LOGICAL' NOT NULL,
	"status" "beyu_lifecycle_status" DEFAULT 'ACTIVE' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"party_id" text NOT NULL,
	"purpose" text NOT NULL,
	"lawful_basis" text NOT NULL,
	"jurisdiction_code" text NOT NULL,
	"granted" boolean NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"evidence_document_id" text
);
--> statement-breakpoint
CREATE TABLE "delegations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"scope" text NOT NULL,
	"monetary_limit" text,
	"effective_from" date NOT NULL,
	"effective_to" date NOT NULL,
	"authorized_by" text NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "emergency_access_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"permission_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" text NOT NULL,
	"approved_by" text NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"post_review_by" text,
	"post_review_at" timestamp with time zone,
	"post_review_outcome" text
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "beyu_party_type" NOT NULL,
	"display_name" text NOT NULL,
	"legal_name" text,
	"given_name" text,
	"family_name" text,
	"birth_date" date,
	"nationality" text,
	"country_code" text,
	"email" text,
	"phone" text,
	"kyc_status" "beyu_verification_status" DEFAULT 'UNVERIFIED' NOT NULL,
	"kyc_method" text,
	"biometric_consent" boolean DEFAULT false NOT NULL,
	"duplicate_of_party_id" text,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"status" "beyu_lifecycle_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"code" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"action" text NOT NULL,
	"description" text NOT NULL,
	"classification_ceiling" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"requires_mfa" boolean DEFAULT false NOT NULL,
	"high_risk" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"granted_by" text NOT NULL,
	"justification" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"permission_code" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"scope_level" text NOT NULL,
	"privileged" boolean DEFAULT false NOT NULL,
	"separation_group" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"tenant_id" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip_address" text,
	"user_agent" text,
	"device_trust" text DEFAULT 'UNKNOWN' NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"mfa_satisfied" boolean DEFAULT false NOT NULL,
	"mfa_satisfied_at" timestamp with time zone,
	"mfa_expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"party_id" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"password_algo" text DEFAULT 'scrypt' NOT NULL,
	"password_must_change" boolean DEFAULT false NOT NULL,
	"mfa_enrolled" boolean DEFAULT false NOT NULL,
	"mfa_method" text,
	"mfa_secret_encrypted" text,
	"mfa_recovery_codes_hash" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mfa_last_accepted_step" integer,
	"mfa_failed_attempts" integer DEFAULT 0 NOT NULL,
	"mfa_locked_until" timestamp with time zone,
	"primary_tenant_id" text NOT NULL,
	"is_service_account" boolean DEFAULT false NOT NULL,
	"status" "beyu_lifecycle_status" DEFAULT 'ACTIVE' NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" text NOT NULL,
	"step" integer DEFAULT 1 NOT NULL,
	"approver_role" text NOT NULL,
	"approver_user_id" text,
	"decision" "beyu_approval_decision" DEFAULT 'PENDING' NOT NULL,
	"policy_id" text,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"sla_due_at" timestamp with time zone,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "constitution_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"article_no" integer NOT NULL,
	"title" text NOT NULL,
	"domain" text NOT NULL,
	"body" text NOT NULL,
	"authority_statement" text NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"status" "beyu_version_status" DEFAULT 'ACTIVE' NOT NULL,
	"effective_from" date NOT NULL,
	"amendment_procedure" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "governance_bodies" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"body_type" text NOT NULL,
	"legal_entity_id" text,
	"quorum_minimum" integer DEFAULT 3 NOT NULL,
	"majority_rule" text DEFAULT 'SIMPLE' NOT NULL,
	"reserved_matters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"charter_document_id" text,
	"status" "beyu_version_status" DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "governance_members" (
	"id" text PRIMARY KEY NOT NULL,
	"body_id" text NOT NULL,
	"party_id" text NOT NULL,
	"seat_role" text NOT NULL,
	"voting_rights" boolean DEFAULT true NOT NULL,
	"appointed_on" date NOT NULL,
	"retired_on" date
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"level" "beyu_policy_level" NOT NULL,
	"parent_policy_id" text,
	"constitution_article_id" text,
	"domain" text NOT NULL,
	"jurisdiction_code" text,
	"entity_scope" text,
	"role_scope" text,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"status" "beyu_version_status" DEFAULT 'ACTIVE' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"body" text NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"owner_role" text NOT NULL,
	"approved_by_resolution_id" text,
	"classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resolution_votes" (
	"id" text PRIMARY KEY NOT NULL,
	"resolution_id" text NOT NULL,
	"member_id" text NOT NULL,
	"vote" text NOT NULL,
	"conflict_declared" boolean DEFAULT false NOT NULL,
	"comment" text,
	"cast_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resolutions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"body_id" text NOT NULL,
	"reference" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"summary" text NOT NULL,
	"rationale" text NOT NULL,
	"data_basis" text NOT NULL,
	"authority_policy_id" text,
	"consequences" text NOT NULL,
	"linked_object_type" text,
	"linked_object_id" text,
	"proposed_by" text NOT NULL,
	"status" "beyu_decision_status" DEFAULT 'DRAFT' NOT NULL,
	"required_majority" text DEFAULT 'SIMPLE' NOT NULL,
	"quorum_met" boolean DEFAULT false NOT NULL,
	"votes_for" integer DEFAULT 0 NOT NULL,
	"votes_against" integer DEFAULT 0 NOT NULL,
	"votes_abstain" integer DEFAULT 0 NOT NULL,
	"decision_date" timestamp with time zone,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategic_objectives" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"horizon" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"owner_role" text NOT NULL,
	"parent_objective_id" text,
	"target_value" numeric(18, 4),
	"current_value" numeric(18, 4),
	"unit" text,
	"status" text DEFAULT 'ON_TRACK' NOT NULL,
	"review_cadence" text DEFAULT 'QUARTERLY' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"instance_id" text,
	"title" text NOT NULL,
	"description" text,
	"assignee_user_id" text,
	"assignee_role" text,
	"priority" text DEFAULT 'NORMAL' NOT NULL,
	"due_at" timestamp with time zone,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" text NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'RUNNING' NOT NULL,
	"started_by" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"sla_due_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"definition" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"policy_id" text,
	"status" "beyu_version_status" DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anomaly_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"detector" text NOT NULL,
	"signal_type" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"severity" text DEFAULT 'MEDIUM' NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"assigned_role" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text
);
--> statement-breakpoint
CREATE TABLE "compliance_assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"obligation_id" text NOT NULL,
	"period" text NOT NULL,
	"state" "beyu_compliance_state" DEFAULT 'NOT_ASSESSED' NOT NULL,
	"evidence_document_id" text,
	"findings" text,
	"remediation_plan" text,
	"remediation_due_at" date,
	"ai_assisted" boolean DEFAULT false NOT NULL,
	"assessed_by" text NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"human_confirmed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_obligations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"framework" text NOT NULL,
	"reference" text NOT NULL,
	"title" text NOT NULL,
	"obligation_type" text NOT NULL,
	"jurisdiction_code" text NOT NULL,
	"legal_entity_id" text,
	"sector_code" text,
	"frequency" text DEFAULT 'ANNUAL' NOT NULL,
	"next_due_at" date,
	"owner_role" text NOT NULL,
	"control_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "beyu_version_status" DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "continuity_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"scope" text NOT NULL,
	"scenario" text NOT NULL,
	"rpo_minutes" integer NOT NULL,
	"rto_minutes" integer NOT NULL,
	"strategy" text NOT NULL,
	"owner_role" text NOT NULL,
	"last_tested_at" date,
	"last_test_outcome" text,
	"next_test_due" date,
	"runbook_uri" text
);
--> statement-breakpoint
CREATE TABLE "controls" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"control_type" text NOT NULL,
	"automation" text DEFAULT 'MANUAL' NOT NULL,
	"frameworks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risk_id" text,
	"owner_role" text NOT NULL,
	"test_frequency" text DEFAULT 'QUARTERLY' NOT NULL,
	"last_tested_at" date,
	"effectiveness" text DEFAULT 'NOT_ASSESSED' NOT NULL,
	"evidence_document_id" text
);
--> statement-breakpoint
CREATE TABLE "legal_matters" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"matter_type" text NOT NULL,
	"title" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"counterparty" text,
	"jurisdiction_code" text NOT NULL,
	"exposure_amount" numeric(18, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"obligation_summary" text,
	"key_deadline" date,
	"counsel_name" text,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"document_id" text,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risks" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"category" "beyu_risk_category" NOT NULL,
	"description" text NOT NULL,
	"legal_entity_id" text,
	"sector_code" text,
	"inherent_likelihood" integer NOT NULL,
	"inherent_impact" integer NOT NULL,
	"residual_likelihood" integer NOT NULL,
	"residual_impact" integer NOT NULL,
	"appetite_threshold" integer DEFAULT 12 NOT NULL,
	"treatment" text NOT NULL,
	"owner_user_id" text,
	"mitigation_plan" text,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"escalated" boolean DEFAULT false NOT NULL,
	"last_reviewed_at" date,
	"next_review_at" date,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capital_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"request_type" text NOT NULL,
	"sector_code" text,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"horizon_months" integer DEFAULT 60 NOT NULL,
	"expected_irr" numeric(7, 4),
	"expected_npv" numeric(18, 2),
	"payback_months" integer,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"risk_adjusted_return" numeric(7, 4),
	"strategic_objective_id" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"requested_by" text NOT NULL,
	"resolution_id" text,
	"decision_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"legal_entity_id" text NOT NULL,
	"code" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"closed_by" text,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"period_id" text,
	"reference" text NOT NULL,
	"description" text NOT NULL,
	"currency" text NOT NULL,
	"fx_rate" numeric(18, 8) DEFAULT '1' NOT NULL,
	"posted_by" text NOT NULL,
	"approved_by" text,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversal_of_id" text,
	"idempotency_key" text,
	"source" text DEFAULT 'MANUAL' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"account_id" text NOT NULL,
	"debit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"memo" text,
	"cost_centre" text
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"account_type" text NOT NULL,
	"ifrs_category" text,
	"parent_account_id" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_strategies" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"jurisdiction_code" text NOT NULL,
	"category" text NOT NULL,
	"position" "beyu_tax_position" NOT NULL,
	"legal_basis" text NOT NULL,
	"statutory_reference" text NOT NULL,
	"eligibility_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"documentation_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"implementation_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"economic_benefit_basis" text NOT NULL,
	"benefit_rate" numeric(7, 4),
	"tax_effect" text NOT NULL,
	"cashflow_effect" text NOT NULL,
	"accounting_effect" text NOT NULL,
	"compliance_risk" integer NOT NULL,
	"audit_risk" integer NOT NULL,
	"legal_risk" integer NOT NULL,
	"reputational_risk" integer NOT NULL,
	"required_approvals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alternatives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provenance_source" text NOT NULL,
	"authority_status" "beyu_authority_status" DEFAULT 'AUTHORITATIVE' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"review_date" date NOT NULL,
	"knowledge_source_id" text
);
--> statement-breakpoint
CREATE TABLE "tax_strategy_assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"strategy_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"period" text NOT NULL,
	"eligibility" "beyu_eligibility" NOT NULL,
	"unmet_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_benefit" numeric(18, 2),
	"currency" text DEFAULT 'TZS' NOT NULL,
	"risk_summary" text NOT NULL,
	"governance_requirement" text NOT NULL,
	"human_review_required" boolean DEFAULT true NOT NULL,
	"approved_by_resolution_id" text,
	"assessed_by" text NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treasury_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"institution" text NOT NULL,
	"account_label" text NOT NULL,
	"account_type" text DEFAULT 'OPERATING' NOT NULL,
	"currency" text NOT NULL,
	"balance" numeric(18, 2) NOT NULL,
	"base_currency_balance" numeric(18, 2) NOT NULL,
	"as_of" date NOT NULL,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waterfall_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"jurisdiction_code" text NOT NULL,
	"transaction_type" text DEFAULT 'OPERATING_SURPLUS' NOT NULL,
	"currency" text NOT NULL,
	"status" "beyu_version_status" DEFAULT 'DRAFT' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"approved_by_resolution_id" text,
	"policy_id" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "waterfall_run_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"tier_code" text NOT NULL,
	"tier_name" text NOT NULL,
	"beneficiary_type" text NOT NULL,
	"basis_amount" numeric(18, 2) NOT NULL,
	"allocated_amount" numeric(18, 2) NOT NULL,
	"remaining_after" numeric(18, 2) NOT NULL,
	"formula" text NOT NULL,
	"legal_basis" text
);
--> statement-breakpoint
CREATE TABLE "waterfall_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"config_id" text NOT NULL,
	"period" text NOT NULL,
	"gross_amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"total_allocated" numeric(18, 2) NOT NULL,
	"residual" numeric(18, 2) NOT NULL,
	"scenario" text DEFAULT 'BASE' NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"explanation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"engine_version" text NOT NULL,
	"checksum" text NOT NULL,
	"executed_by" text NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by_resolution_id" text,
	"status" text DEFAULT 'SIMULATED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waterfall_tiers" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"tier_type" text NOT NULL,
	"rate" numeric(9, 6),
	"fixed_amount" numeric(18, 2),
	"min_amount" numeric(18, 2),
	"max_amount" numeric(18, 2),
	"beneficiary_type" text NOT NULL,
	"beneficiary_ref" text,
	"legal_basis" text,
	"mandatory" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beneficiaries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"family_member_id" text NOT NULL,
	"trust_entity_id" text NOT NULL,
	"beneficiary_class" text NOT NULL,
	"eligibility" "beyu_eligibility" DEFAULT 'UNDER_REVIEW' NOT NULL,
	"eligibility_rationale" text NOT NULL,
	"entitlement_pct" numeric(9, 6),
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"verified_by" text,
	"approved_by_resolution_id" text,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"employee_no" text NOT NULL,
	"party_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"position_id" text,
	"manager_employee_id" text,
	"work_email" text,
	"country_code" text NOT NULL,
	"employment_type" text DEFAULT 'PERMANENT' NOT NULL,
	"contract_ref" text,
	"hire_date" date NOT NULL,
	"end_date" date,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"base_salary" numeric(18, 2),
	"salary_currency" text,
	"classification" "beyu_classification" DEFAULT 'RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"event_type" text NOT NULL,
	"effective_from" date NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"approved_by" text,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_members" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"party_id" text NOT NULL,
	"family_line" text NOT NULL,
	"branch" text NOT NULL,
	"generation" integer NOT NULL,
	"parent_member_id" text,
	"relationship_to_parent" text DEFAULT 'CHILD' NOT NULL,
	"direct_descendant" boolean DEFAULT false NOT NULL,
	"verification_status" "beyu_verification_status" DEFAULT 'UNVERIFIED' NOT NULL,
	"verification_method" text,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"deceased_on" date,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_vault_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"vault_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"document_id" text,
	"owner_member_id" text,
	"custodian_role" text NOT NULL,
	"access_policy_id" text,
	"sealed_until" date,
	"succession_instruction" text,
	"classification" "beyu_classification" DEFAULT 'HIGHLY_RESTRICTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_programs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"theme" text NOT NULL,
	"country_code" text NOT NULL,
	"budget" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"spend_to_date" numeric(18, 2) DEFAULT '0' NOT NULL,
	"beneficiaries_reached" integer DEFAULT 0 NOT NULL,
	"impact_metric" text,
	"impact_value" numeric(18, 2),
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"funding_resolution_id" text
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"org_unit_id" text,
	"grade" text NOT NULL,
	"job_family" text,
	"headcount_budget" integer DEFAULT 1 NOT NULL,
	"reports_to_position_id" text,
	"status" "beyu_lifecycle_status" DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sector_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"sector_code" text NOT NULL,
	"metric_code" text NOT NULL,
	"period" text NOT NULL,
	"value" numeric(18, 4) NOT NULL,
	"unit" text NOT NULL,
	"source_system" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workforce_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"request_type" text NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"days" numeric(6, 2),
	"reason" text,
	"status" text DEFAULT 'SUBMITTED' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"user_id" text,
	"agent" text DEFAULT 'NOELIA' NOT NULL,
	"runtime" text DEFAULT 'HIVE' NOT NULL,
	"engine" text NOT NULL,
	"model" text NOT NULL,
	"model_version" text NOT NULL,
	"prompt_version" text NOT NULL,
	"request_type" text NOT NULL,
	"question" text NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"retrieved_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tools_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_class" "beyu_ai_output_class" NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"policy_decision" text NOT NULL,
	"denied_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"human_review_required" boolean DEFAULT false NOT NULL,
	"reviewed_by" text,
	"review_decision" text,
	"reviewed_at" timestamp with time zone,
	"final_action" text,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "architecture_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"adr_number" integer NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'ACCEPTED' NOT NULL,
	"context" text NOT NULL,
	"decision" text NOT NULL,
	"consequences" text NOT NULL,
	"alternatives" text NOT NULL,
	"security_analysis" text NOT NULL,
	"compliance_analysis" text NOT NULL,
	"rollback_plan" text NOT NULL,
	"decided_by" text NOT NULL,
	"decided_on" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_chain_heads" (
	"chain_name" text PRIMARY KEY NOT NULL,
	"current_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence" bigserial NOT NULL,
	"tenant_id" text,
	"actor_user_id" text,
	"actor_type" text DEFAULT 'HUMAN' NOT NULL,
	"action" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" text NOT NULL,
	"outcome" text DEFAULT 'SUCCESS' NOT NULL,
	"reason" text,
	"authority" text,
	"approval_ref" text,
	"policy_version" text,
	"system_version" text NOT NULL,
	"ai_version" text,
	"old_value" jsonb,
	"new_value" jsonb,
	"ip_address" text,
	"user_agent" text,
	"trace_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prev_hash" text,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"system_of_record" text NOT NULL,
	"owner_role" text NOT NULL,
	"steward_role" text NOT NULL,
	"classification" "beyu_classification" NOT NULL,
	"contains_personal_data" boolean DEFAULT false NOT NULL,
	"lawful_basis" text,
	"retention_code" text NOT NULL,
	"lineage_upstream" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lineage_downstream" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quality_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"access_policy_id" text
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"source" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_date" date,
	"entity_scope" text,
	"jurisdiction_code" text,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"authority_status" "beyu_authority_status" DEFAULT 'UNDER_REVIEW' NOT NULL,
	"supersedes_id" text,
	"superseded_by_id" text,
	"checksum" text NOT NULL,
	"storage_uri" text NOT NULL,
	"access_policy_id" text,
	"retention_code" text NOT NULL,
	"legal_hold" boolean DEFAULT false NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "enterprise_events" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence" bigserial NOT NULL,
	"type" text NOT NULL,
	"spec_version" text DEFAULT '1.0' NOT NULL,
	"schema_version" text DEFAULT '1' NOT NULL,
	"source" text NOT NULL,
	"tenant_id" text,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"actor_user_id" text,
	"actor_type" text DEFAULT 'HUMAN' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trace_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prev_hash" text,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"scope" text DEFAULT 'ENTERPRISE' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"rollout_rule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"owner_role" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"category" text NOT NULL,
	"direction" text DEFAULT 'BIDIRECTIONAL' NOT NULL,
	"protocol" text DEFAULT 'REST' NOT NULL,
	"standard" text,
	"auth_type" text DEFAULT 'OAUTH2' NOT NULL,
	"secret_ref" text,
	"version" text DEFAULT 'v1' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"owner_role" text NOT NULL,
	"last_sync_at" timestamp with time zone,
	"sla_uptime_pct" numeric(5, 2)
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"domain" text NOT NULL,
	"source_uri" text,
	"owner_role" text NOT NULL,
	"jurisdiction_code" text,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"authority_status" "beyu_authority_status" DEFAULT 'AUTHORITATIVE' NOT NULL,
	"provenance" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"effective_from" date NOT NULL,
	"review_date" date NOT NULL,
	"expires_at" date,
	"content" text NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_definitions" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"definition" text NOT NULL,
	"domain" text NOT NULL,
	"source_of_truth" text NOT NULL,
	"owner_role" text NOT NULL,
	"calculation" text NOT NULL,
	"period" text NOT NULL,
	"unit" text NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"authority_status" "beyu_authority_status" DEFAULT 'AUTHORITATIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text,
	"role" text,
	"channel" text DEFAULT 'IN_APP' NOT NULL,
	"urgency" text DEFAULT 'NORMAL' NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"link_href" text,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "regulatory_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"jurisdiction_code" text NOT NULL,
	"reference" text NOT NULL,
	"title" text NOT NULL,
	"change_type" text NOT NULL,
	"summary" text NOT NULL,
	"published_on" date NOT NULL,
	"effective_from" date,
	"impacted_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assessment_status" text DEFAULT 'DETECTED' NOT NULL,
	"adoption_resolution_id" text,
	"owner_role" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_policies" (
	"code" text PRIMARY KEY NOT NULL,
	"record_type" text NOT NULL,
	"jurisdiction_code" text NOT NULL,
	"retention_years" integer NOT NULL,
	"legal_basis" text NOT NULL,
	"disposal_action" text DEFAULT 'SECURE_DELETE' NOT NULL,
	"litigation_hold_overrides" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entity_appointments" ADD CONSTRAINT "entity_appointments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_appointments" ADD CONSTRAINT "entity_appointments_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jurisdictions" ADD CONSTRAINT "jurisdictions_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_records" ADD CONSTRAINT "ownership_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_records" ADD CONSTRAINT "ownership_records_owned_entity_id_legal_entities_id_fk" FOREIGN KEY ("owned_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_records" ADD CONSTRAINT "ownership_records_owner_entity_id_legal_entities_id_fk" FOREIGN KEY ("owner_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_access_grants" ADD CONSTRAINT "emergency_access_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_access_grants" ADD CONSTRAINT "emergency_access_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "public"."permissions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_primary_tenant_id_tenants_id_fk" FOREIGN KEY ("primary_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approver_user_id_users_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_bodies" ADD CONSTRAINT "governance_bodies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_bodies" ADD CONSTRAINT "governance_bodies_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_members" ADD CONSTRAINT "governance_members_body_id_governance_bodies_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."governance_bodies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_members" ADD CONSTRAINT "governance_members_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_constitution_article_id_constitution_articles_id_fk" FOREIGN KEY ("constitution_article_id") REFERENCES "public"."constitution_articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_votes" ADD CONSTRAINT "resolution_votes_resolution_id_resolutions_id_fk" FOREIGN KEY ("resolution_id") REFERENCES "public"."resolutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_votes" ADD CONSTRAINT "resolution_votes_member_id_governance_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."governance_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_body_id_governance_bodies_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."governance_bodies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_authority_policy_id_policies_id_fk" FOREIGN KEY ("authority_policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_objectives" ADD CONSTRAINT "strategic_objectives_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_instance_id_workflow_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."workflow_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomaly_signals" ADD CONSTRAINT "anomaly_signals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_assessments" ADD CONSTRAINT "compliance_assessments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_assessments" ADD CONSTRAINT "compliance_assessments_obligation_id_compliance_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."compliance_obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_obligations" ADD CONSTRAINT "compliance_obligations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_obligations" ADD CONSTRAINT "compliance_obligations_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controls" ADD CONSTRAINT "controls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controls" ADD CONSTRAINT "controls_risk_id_risks_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_matters" ADD CONSTRAINT "legal_matters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_matters" ADD CONSTRAINT "legal_matters_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_requests" ADD CONSTRAINT "capital_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_requests" ADD CONSTRAINT "capital_requests_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD CONSTRAINT "financial_periods_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_period_id_financial_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."financial_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_strategy_assessments" ADD CONSTRAINT "tax_strategy_assessments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_strategy_assessments" ADD CONSTRAINT "tax_strategy_assessments_strategy_id_tax_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."tax_strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_strategy_assessments" ADD CONSTRAINT "tax_strategy_assessments_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_positions" ADD CONSTRAINT "treasury_positions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_positions" ADD CONSTRAINT "treasury_positions_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waterfall_configs" ADD CONSTRAINT "waterfall_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waterfall_configs" ADD CONSTRAINT "waterfall_configs_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waterfall_run_lines" ADD CONSTRAINT "waterfall_run_lines_run_id_waterfall_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."waterfall_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waterfall_runs" ADD CONSTRAINT "waterfall_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waterfall_runs" ADD CONSTRAINT "waterfall_runs_config_id_waterfall_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."waterfall_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waterfall_tiers" ADD CONSTRAINT "waterfall_tiers_config_id_waterfall_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."waterfall_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_family_member_id_family_members_id_fk" FOREIGN KEY ("family_member_id") REFERENCES "public"."family_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_trust_entity_id_legal_entities_id_fk" FOREIGN KEY ("trust_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_events" ADD CONSTRAINT "employment_events_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_vault_items" ADD CONSTRAINT "family_vault_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_vault_items" ADD CONSTRAINT "family_vault_items_owner_member_id_family_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."family_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_programs" ADD CONSTRAINT "foundation_programs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_org_unit_id_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sector_metrics" ADD CONSTRAINT "sector_metrics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_requests" ADD CONSTRAINT "workforce_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_requests" ADD CONSTRAINT "workforce_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_decisions" ADD CONSTRAINT "ai_decisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_decisions" ADD CONSTRAINT "ai_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_events" ADD CONSTRAINT "enterprise_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jurisdictions_code_uidx" ON "jurisdictions" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_entities_code_uidx" ON "legal_entities" USING btree ("code");--> statement-breakpoint
CREATE INDEX "legal_entities_tenant_idx" ON "legal_entities" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_units_code_uidx" ON "org_units" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "os_registry_code_uidx" ON "os_registry" USING btree ("code");--> statement-breakpoint
CREATE INDEX "ownership_owned_idx" ON "ownership_records" USING btree ("owned_entity_id");--> statement-breakpoint
CREATE INDEX "ownership_tenant_idx" ON "ownership_records" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_of_truth_capability_uidx" ON "source_of_truth" USING btree ("capability");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_code_uidx" ON "tenants" USING btree ("code");--> statement-breakpoint
CREATE INDEX "parties_name_idx" ON "parties" USING btree ("display_name");--> statement-breakpoint
CREATE INDEX "role_assignments_user_idx" ON "role_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_uidx" ON "role_permissions" USING btree ("role_id","permission_code");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_code_uidx" ON "roles" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uidx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uidx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "approvals_object_idx" ON "approvals" USING btree ("object_type","object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "constitution_article_no_uidx" ON "constitution_articles" USING btree ("article_no");--> statement-breakpoint
CREATE UNIQUE INDEX "governance_bodies_code_uidx" ON "governance_bodies" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "policies_code_version_uidx" ON "policies" USING btree ("code","version");--> statement-breakpoint
CREATE UNIQUE INDEX "resolution_votes_uidx" ON "resolution_votes" USING btree ("resolution_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resolutions_reference_uidx" ON "resolutions" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "resolutions_tenant_idx" ON "resolutions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_code_version_uidx" ON "workflows" USING btree ("code","version");--> statement-breakpoint
CREATE INDEX "compliance_assessments_obligation_idx" ON "compliance_assessments" USING btree ("obligation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_obligations_code_uidx" ON "compliance_obligations" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "controls_code_uidx" ON "controls" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_matters_code_uidx" ON "legal_matters" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "risks_code_uidx" ON "risks" USING btree ("code");--> statement-breakpoint
CREATE INDEX "risks_tenant_idx" ON "risks" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "capital_requests_code_uidx" ON "capital_requests" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_periods_uidx" ON "financial_periods" USING btree ("legal_entity_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_reference_uidx" ON "journal_entries" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "journal_entries_entity_idx" ON "journal_entries" USING btree ("legal_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_code_uidx" ON "ledger_accounts" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_strategies_code_uidx" ON "tax_strategies" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "waterfall_configs_code_version_uidx" ON "waterfall_configs" USING btree ("code","version");--> statement-breakpoint
CREATE INDEX "waterfall_runs_config_idx" ON "waterfall_runs" USING btree ("config_id");--> statement-breakpoint
CREATE UNIQUE INDEX "waterfall_tiers_uidx" ON "waterfall_tiers" USING btree ("config_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_no_uidx" ON "employees" USING btree ("employee_no");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_party_uidx" ON "employees" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "employees_entity_idx" ON "employees" USING btree ("legal_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_members_party_uidx" ON "family_members" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "family_members_branch_idx" ON "family_members" USING btree ("branch");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_code_uidx" ON "positions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "ai_decisions_tenant_idx" ON "ai_decisions" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "adr_number_uidx" ON "architecture_decisions" USING btree ("adr_number");--> statement-breakpoint
CREATE INDEX "audit_object_idx" ON "audit_log" USING btree ("object_type","object_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_tenant_idx" ON "audit_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "data_assets_code_uidx" ON "data_assets" USING btree ("code");--> statement-breakpoint
CREATE INDEX "documents_tenant_idx" ON "documents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "documents_category_idx" ON "documents" USING btree ("category");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "enterprise_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "events_tenant_idx" ON "enterprise_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_code_uidx" ON "integrations" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sources_code_uidx" ON "knowledge_sources" USING btree ("code");