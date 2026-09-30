-- ============================================================================
-- BEYU OS — Migration 0072: Shared Communications Capability
-- ============================================================================
-- ONE shared BEYU OS capability, NOT an OS: the governed communication layer
-- for WhatsApp, SMS, Email, In-App, Internal BEYU messaging, unified
-- conversations, contact 360°, omnichannel continuity, orchestration,
-- routing, templates, localization, consent, preferences, human handoff,
-- cases/tickets, SLA/escalation, invoices, receipts, reports, documents,
-- feedback, surveys, alerts, reminders, journeys, workflow-triggered
-- communications, AI-assisted communication through Noelia/HIVE, human
-- approval, delivery tracking, provider failover, reliability, analytics,
-- cost intelligence, security monitoring, international/country-specific
-- providers, accessibility, auditability, governance.
--
-- DESIGN LAWS:
-- 1. Communications is NOT an OS — no COMMUNICATIONS_OS row, ever.
-- 2. GlobalUserID is canonical — phone/email are endpoints, not identities.
-- 3. Provider secrets are env-var NAMES only — no secret column exists.
-- 4. Tenant isolation via RLS with beyu_tenant_ids() / beyu_global_scope().
-- 5. Documents remain canonical — attachments reference documents.id.
-- 6. CAP_POSTING remains LOCKED — no finance ledger mutation here.
-- 7. Marketing requires consent — enforced at orchestrator layer, not DB alone.
-- 8. Webhooks: signature verification → idempotency → canonical event.
-- 9. Idempotency: (tenant_id, idempotency_key) unique prevents duplicates.
-- 10. Loop prevention: correlation_id + depth tracking.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Channel Registry
-- ---------------------------------------------------------------------------
CREATE TABLE "communication_channels" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"supports_inbound" boolean DEFAULT false NOT NULL,
	"supports_outbound" boolean DEFAULT true NOT NULL,
	"supports_media" boolean DEFAULT false NOT NULL,
	"supports_templates" boolean DEFAULT false NOT NULL,
	"max_body_length" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"channel_code" text NOT NULL,
	"provider_type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'NOT_CONNECTED' NOT NULL,
	"secret_ref" text,
	"signing_secret_ref" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"country_code" text,
	"tenant_id" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"rate_limit_per_minute" integer,
	"rate_limit_per_hour" integer,
	"rate_limit_per_day" integer,
	"webhook_url" text,
	"health_status" text DEFAULT 'UNKNOWN' NOT NULL,
	"last_health_check_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"global_user_id" text,
	"legal_entity_id" text,
	"country_code" text,
	"display_name" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"organization_name" text,
	"primary_phone" text,
	"primary_email" text,
	"primary_whatsapp" text,
	"preferred_channel" text,
	"preferred_language" text DEFAULT 'en' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"relationship_type" text,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_tsv" tsvector
);
--> statement-breakpoint
CREATE TABLE "communication_contact_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"method_type" text NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text,
	"label" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"verification_source" text,
	"verification_evidence_id" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"purpose" text NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'OPT_IN' NOT NULL,
	"source" text NOT NULL,
	"evidence_ref" text,
	"evidence_document_id" text,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"timezone" text,
	"frequency" text DEFAULT 'IMMEDIATE' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"code" text NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"channel" text NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"subject_template" text,
	"body_template" text NOT NULL,
	"html_template" text,
	"structured_payload_template" jsonb,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"country_code" text,
	"classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"approval_ref" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"provider_template_id" text,
	"provider_status" text,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text,
	"country_code" text,
	"contact_id" text,
	"global_user_id" text,
	"channel" text NOT NULL,
	"subject" text,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"priority" text DEFAULT 'NORMAL' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"assigned_to_user_id" text,
	"assigned_to_role" text,
	"correlation_id" text NOT NULL,
	"causation_id" text,
	"sla_policy_id" text,
	"sla_due_at" timestamp with time zone,
	"sla_breached_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_message_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"last_outbound_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_tsv" tsvector
);
--> statement-breakpoint
CREATE TABLE "communication_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"conversation_id" text,
	"contact_id" text,
	"channel" text NOT NULL,
	"provider_id" text,
	"direction" text NOT NULL,
	"message_type" text DEFAULT 'TEXT' NOT NULL,
	"sender" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"html_body" text,
	"structured_payload" jsonb,
	"template_id" text,
	"template_variables" jsonb,
	"priority" text DEFAULT 'NORMAL' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"delivery_status" text DEFAULT 'QUEUED' NOT NULL,
	"failure_reason" text,
	"failure_code" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"correlation_id" text NOT NULL,
	"causation_id" text,
	"idempotency_key" text NOT NULL,
	"trace_id" text NOT NULL,
	"provider_message_id" text,
	"provider_thread_id" text,
	"estimated_cost" numeric(12, 6),
	"actual_cost" numeric(12, 6),
	"cost_currency" text DEFAULT 'USD' NOT NULL,
	"ai_drafted" boolean DEFAULT false NOT NULL,
	"ai_model" text,
	"ai_confidence" numeric(5, 4),
	"requires_human_approval" boolean DEFAULT false NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_tsv" tsvector
);
--> statement-breakpoint
CREATE TABLE "communication_delivery_events" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"event_type" text NOT NULL,
	"provider_event_id" text,
	"provider_status" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"failure_reason" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text,
	"provider_code" text NOT NULL,
	"channel" text NOT NULL,
	"tenant_id" text,
	"event_type" text NOT NULL,
	"raw_payload" text NOT NULL,
	"parsed_payload" jsonb,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"signature_verified" boolean DEFAULT false NOT NULL,
	"verification_status" text DEFAULT 'PENDING' NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_event_id" text,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"failure_reason" text,
	"correlation_id" text,
	"trace_id" text NOT NULL,
	"source_ip" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"document_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" bigint,
	"access_expires_at" timestamp with time zone,
	"download_count" integer DEFAULT 0 NOT NULL,
	"last_downloaded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_routing_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"name" text NOT NULL,
	"description" text,
	"channel" text,
	"message_type" text,
	"priority" integer DEFAULT 100 NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"country_code" text,
	"classification" "beyu_classification",
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_sla_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"name" text NOT NULL,
	"description" text,
	"channel" text,
	"priority" text DEFAULT 'NORMAL' NOT NULL,
	"message_type" text,
	"response_time_minutes" integer NOT NULL,
	"resolution_time_minutes" integer NOT NULL,
	"business_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"holidays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"escalation_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"conversation_id" text,
	"contact_id" text,
	"legal_entity_id" text,
	"type" text DEFAULT 'SUPPORT' NOT NULL,
	"subject" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"priority" text DEFAULT 'NORMAL' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"assigned_to_user_id" text,
	"assigned_to_role" text,
	"sla_policy_id" text,
	"sla_due_at" timestamp with time zone,
	"sla_breached_at" timestamp with time zone,
	"correlation_id" text NOT NULL,
	"causation_id" text,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_tsv" tsvector
);
--> statement-breakpoint
CREATE TABLE "communication_journeys" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger_event_type" text NOT NULL,
	"trigger_conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_journey_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"journey_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"conversation_id" text,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"correlation_id" text NOT NULL,
	"causation_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"message_id" text,
	"conversation_id" text,
	"contact_id" text,
	"case_id" text,
	"type" text DEFAULT 'FEEDBACK' NOT NULL,
	"rating" integer,
	"subject" text,
	"body" text NOT NULL,
	"classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"category" text,
	"urgency" text DEFAULT 'NORMAL' NOT NULL,
	"status" text DEFAULT 'SUBMITTED' NOT NULL,
	"assigned_to_user_id" text,
	"assigned_to_role" text,
	"ai_analysis" jsonb,
	"ai_model" text,
	"ai_analyzed_at" timestamp with time zone,
	"correlation_id" text NOT NULL,
	"causation_id" text,
	"resolved_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_tsv" tsvector
);
--> statement-breakpoint
CREATE TABLE "communication_scheduled" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"contact_id" text,
	"conversation_id" text,
	"journey_run_id" text,
	"type" text NOT NULL,
	"channel" text NOT NULL,
	"template_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"correlation_id" text NOT NULL,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"failure_reason" text,
	"scheduled_for" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_analytics_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"date" text NOT NULL,
	"channel" text NOT NULL,
	"provider_id" text,
	"country_code" text,
	"message_type" text,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"read_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"bounced_count" integer DEFAULT 0 NOT NULL,
	"inbound_count" integer DEFAULT 0 NOT NULL,
	"avg_response_time_seconds" numeric(12, 2),
	"avg_resolution_time_seconds" numeric(12, 2),
	"total_estimated_cost" numeric(12, 6) DEFAULT '0' NOT NULL,
	"total_actual_cost" numeric(12, 6) DEFAULT '0' NOT NULL,
	"cost_currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_cost_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"message_id" text NOT NULL,
	"provider_id" text,
	"channel" text NOT NULL,
	"country_code" text,
	"message_type" text,
	"estimated_cost" numeric(12, 6),
	"actual_cost" numeric(12, 6),
	"currency" text DEFAULT 'USD' NOT NULL,
	"billing_status" text DEFAULT 'ESTIMATED' NOT NULL,
	"billed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_security_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"event_type" text NOT NULL,
	"severity" text DEFAULT 'MEDIUM' NOT NULL,
	"channel" text,
	"provider_id" text,
	"contact_id" text,
	"message_id" text,
	"webhook_event_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text NOT NULL,
	"channel" text,
	"limit_per_minute" integer DEFAULT 60 NOT NULL,
	"limit_per_hour" integer DEFAULT 1000 NOT NULL,
	"limit_per_day" integer DEFAULT 10000 NOT NULL,
	"current_count_minute" integer DEFAULT 0 NOT NULL,
	"current_count_hour" integer DEFAULT 0 NOT NULL,
	"current_count_day" integer DEFAULT 0 NOT NULL,
	"window_start_minute" timestamp with time zone DEFAULT now() NOT NULL,
	"window_start_hour" timestamp with time zone DEFAULT now() NOT NULL,
	"window_start_day" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_loop_detections" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"correlation_id" text NOT NULL,
	"conversation_id" text,
	"channel" text NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"detected" boolean DEFAULT false NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_broadcasts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"channel" text NOT NULL,
	"template_id" text,
	"audience_filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"audience_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"approval_ref" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"scheduled_for" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"correlation_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_broadcast_recipients" (
	"broadcast_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"message_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"failure_reason" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communication_broadcast_recipients_broadcast_id_contact_id_pk" PRIMARY KEY("broadcast_id","contact_id")
);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------
ALTER TABLE "communication_providers" ADD CONSTRAINT "communication_providers_channel_code_communication_channels_code_fk" FOREIGN KEY ("channel_code") REFERENCES "public"."communication_channels"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_providers" ADD CONSTRAINT "communication_providers_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_providers" ADD CONSTRAINT "communication_providers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_contacts" ADD CONSTRAINT "communication_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_contacts" ADD CONSTRAINT "communication_contacts_global_user_id_users_id_fk" FOREIGN KEY ("global_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_contacts" ADD CONSTRAINT "communication_contacts_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_contacts" ADD CONSTRAINT "communication_contacts_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_contact_methods" ADD CONSTRAINT "communication_contact_methods_contact_id_communication_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."communication_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_contact_methods" ADD CONSTRAINT "communication_contact_methods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_consents" ADD CONSTRAINT "communication_consents_contact_id_communication_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."communication_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_consents" ADD CONSTRAINT "communication_consents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_consents" ADD CONSTRAINT "communication_consents_evidence_document_id_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_preferences" ADD CONSTRAINT "communication_preferences_contact_id_communication_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."communication_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_preferences" ADD CONSTRAINT "communication_preferences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_templates" ADD CONSTRAINT "communication_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_templates" ADD CONSTRAINT "communication_templates_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_contact_id_communication_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."communication_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_global_user_id_users_id_fk" FOREIGN KEY ("global_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_conversation_id_communication_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."communication_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_contact_id_communication_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."communication_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_provider_id_communication_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."communication_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_template_id_communication_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."communication_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_delivery_events" ADD CONSTRAINT "communication_delivery_events_message_id_communication_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."communication_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_delivery_events" ADD CONSTRAINT "communication_delivery_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_webhook_events" ADD CONSTRAINT "communication_webhook_events_provider_id_communication_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."communication_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_webhook_events" ADD CONSTRAINT "communication_webhook_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_attachments" ADD CONSTRAINT "communication_attachments_message_id_communication_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."communication_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_attachments" ADD CONSTRAINT "communication_attachments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_attachments" ADD CONSTRAINT "communication_attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_routing_rules" ADD CONSTRAINT "communication_routing_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_routing_rules" ADD CONSTRAINT "communication_routing_rules_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_sla_policies" ADD CONSTRAINT "communication_sla_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_cases" ADD CONSTRAINT "communication_cases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_cases" ADD CONSTRAINT "communication_cases_conversation_id_communication_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."communication_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_cases" ADD CONSTRAINT "communication_cases_contact_id_communication_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."communication_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_cases" ADD CONSTRAINT "communication_cases_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_cases" ADD CONSTRAINT "communication_cases_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_cases" ADD CONSTRAINT "communication_cases_sla_policy_id_communication_sla_policies_id_fk" FOREIGN KEY ("sla_policy_id") REFERENCES "public"."communication_sla_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_journeys" ADD CONSTRAINT "communication_journeys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_journey_runs" ADD CONSTRAINT "communication_journey_runs_journey_id_communication_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."communication_journeys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_journey_runs" ADD CONSTRAINT "communication_journey_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_journey_runs" ADD CONSTRAINT "communication_journey_runs_contact_id_communication_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."communication_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_journey_runs" ADD CONSTRAINT "communication_journey_runs_conversation_id_communication_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."communication_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_feedback" ADD CONSTRAINT "communication_feedback_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_feedback" ADD CONSTRAINT "communication_feedback_message_id_communication_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."communication_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_feedback" ADD CONSTRAINT "communication_feedback_conversation_id_communication_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."communication_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_feedback" ADD CONSTRAINT "communication_feedback_contact_id_communication_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."communication_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_feedback" ADD CONSTRAINT "communication_feedback_case_id_communication_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."communication_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_feedback" ADD CONSTRAINT "communication_feedback_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_scheduled" ADD CONSTRAINT "communication_scheduled_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_scheduled" ADD CONSTRAINT "communication_scheduled_contact_id_communication_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."communication_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_scheduled" ADD CONSTRAINT "communication_scheduled_conversation_id_communication_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."communication_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_scheduled" ADD CONSTRAINT "communication_scheduled_journey_run_id_communication_journey_runs_id_fk" FOREIGN KEY ("journey_run_id") REFERENCES "public"."communication_journey_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_scheduled" ADD CONSTRAINT "communication_scheduled_template_id_communication_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."communication_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_analytics_daily" ADD CONSTRAINT "communication_analytics_daily_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_analytics_daily" ADD CONSTRAINT "communication_analytics_daily_provider_id_communication_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."communication_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_analytics_daily" ADD CONSTRAINT "communication_analytics_daily_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_cost_ledger" ADD CONSTRAINT "communication_cost_ledger_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_cost_ledger" ADD CONSTRAINT "communication_cost_ledger_message_id_communication_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."communication_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_cost_ledger" ADD CONSTRAINT "communication_cost_ledger_provider_id_communication_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."communication_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_cost_ledger" ADD CONSTRAINT "communication_cost_ledger_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_security_events" ADD CONSTRAINT "communication_security_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_security_events" ADD CONSTRAINT "communication_security_events_provider_id_communication_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."communication_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_security_events" ADD CONSTRAINT "communication_security_events_contact_id_communication_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."communication_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_security_events" ADD CONSTRAINT "communication_security_events_message_id_communication_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."communication_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_security_events" ADD CONSTRAINT "communication_security_events_webhook_event_id_communication_webhook_events_id_fk" FOREIGN KEY ("webhook_event_id") REFERENCES "public"."communication_webhook_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_rate_limits" ADD CONSTRAINT "communication_rate_limits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_loop_detections" ADD CONSTRAINT "communication_loop_detections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_loop_detections" ADD CONSTRAINT "communication_loop_detections_conversation_id_communication_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."communication_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_broadcasts" ADD CONSTRAINT "communication_broadcasts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_broadcasts" ADD CONSTRAINT "communication_broadcasts_template_id_communication_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."communication_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_broadcast_recipients" ADD CONSTRAINT "communication_broadcast_recipients_broadcast_id_communication_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."communication_broadcasts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_broadcast_recipients" ADD CONSTRAINT "communication_broadcast_recipients_contact_id_communication_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."communication_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_broadcast_recipients" ADD CONSTRAINT "communication_broadcast_recipients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_broadcast_recipients" ADD CONSTRAINT "communication_broadcast_recipients_message_id_communication_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."communication_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "communication_providers_code_uidx" ON "communication_providers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "communication_providers_channel_idx" ON "communication_providers" USING btree ("channel_code");--> statement-breakpoint
CREATE INDEX "communication_providers_tenant_idx" ON "communication_providers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_providers_country_idx" ON "communication_providers" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "communication_providers_status_idx" ON "communication_providers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "communication_contacts_tenant_idx" ON "communication_contacts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_contacts_global_user_idx" ON "communication_contacts" USING btree ("global_user_id");--> statement-breakpoint
CREATE INDEX "communication_contacts_entity_idx" ON "communication_contacts" USING btree ("legal_entity_id");--> statement-breakpoint
CREATE INDEX "communication_contacts_country_idx" ON "communication_contacts" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "communication_contacts_status_idx" ON "communication_contacts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "communication_contacts_phone_idx" ON "communication_contacts" USING btree ("primary_phone");--> statement-breakpoint
CREATE INDEX "communication_contacts_email_idx" ON "communication_contacts" USING btree ("primary_email");--> statement-breakpoint
CREATE INDEX "communication_contacts_search_tsv_idx" ON "communication_contacts" USING gin ("search_tsv");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_contact_methods_unique" ON "communication_contact_methods" USING btree ("contact_id","method_type","value");--> statement-breakpoint
CREATE INDEX "communication_contact_methods_contact_idx" ON "communication_contact_methods" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "communication_contact_methods_tenant_idx" ON "communication_contact_methods" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_contact_methods_type_idx" ON "communication_contact_methods" USING btree ("method_type");--> statement-breakpoint
CREATE INDEX "communication_contact_methods_normalized_idx" ON "communication_contact_methods" USING btree ("normalized_value");--> statement-breakpoint
CREATE INDEX "communication_consents_contact_idx" ON "communication_consents" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "communication_consents_tenant_idx" ON "communication_consents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_consents_purpose_idx" ON "communication_consents" USING btree ("purpose");--> statement-breakpoint
CREATE INDEX "communication_consents_channel_idx" ON "communication_consents" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "communication_consents_status_idx" ON "communication_consents" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_consents_unique" ON "communication_consents" USING btree ("contact_id","purpose","channel");--> statement-breakpoint
CREATE INDEX "communication_preferences_contact_idx" ON "communication_preferences" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "communication_preferences_tenant_idx" ON "communication_preferences" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_preferences_unique" ON "communication_preferences" USING btree ("contact_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_templates_code_version_uidx" ON "communication_templates" USING btree ("code","version");--> statement-breakpoint
CREATE INDEX "communication_templates_tenant_idx" ON "communication_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_templates_channel_idx" ON "communication_templates" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "communication_templates_category_idx" ON "communication_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "communication_templates_status_idx" ON "communication_templates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "communication_templates_language_idx" ON "communication_templates" USING btree ("language");--> statement-breakpoint
CREATE INDEX "communication_templates_country_idx" ON "communication_templates" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "communication_conversations_tenant_idx" ON "communication_conversations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_conversations_contact_idx" ON "communication_conversations" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "communication_conversations_global_user_idx" ON "communication_conversations" USING btree ("global_user_id");--> statement-breakpoint
CREATE INDEX "communication_conversations_status_idx" ON "communication_conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "communication_conversations_channel_idx" ON "communication_conversations" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "communication_conversations_priority_idx" ON "communication_conversations" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "communication_conversations_assigned_idx" ON "communication_conversations" USING btree ("assigned_to_user_id");--> statement-breakpoint
CREATE INDEX "communication_conversations_correlation_idx" ON "communication_conversations" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "communication_conversations_search_tsv_idx" ON "communication_conversations" USING gin ("search_tsv");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_messages_idempotency_uidx" ON "communication_messages" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "communication_messages_tenant_idx" ON "communication_messages" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_messages_conversation_idx" ON "communication_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "communication_messages_contact_idx" ON "communication_messages" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "communication_messages_channel_idx" ON "communication_messages" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "communication_messages_provider_idx" ON "communication_messages" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "communication_messages_status_idx" ON "communication_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "communication_messages_direction_idx" ON "communication_messages" USING btree ("direction");--> statement-breakpoint
CREATE INDEX "communication_messages_correlation_idx" ON "communication_messages" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "communication_messages_provider_message_idx" ON "communication_messages" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "communication_messages_search_tsv_idx" ON "communication_messages" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "communication_delivery_events_message_idx" ON "communication_delivery_events" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "communication_delivery_events_tenant_idx" ON "communication_delivery_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_delivery_events_type_idx" ON "communication_delivery_events" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_webhook_events_idempotency_uidx" ON "communication_webhook_events" USING btree ("provider_code","idempotency_key");--> statement-breakpoint
CREATE INDEX "communication_webhook_events_provider_idx" ON "communication_webhook_events" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "communication_webhook_events_tenant_idx" ON "communication_webhook_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_webhook_events_status_idx" ON "communication_webhook_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "communication_webhook_events_channel_idx" ON "communication_webhook_events" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "communication_attachments_message_idx" ON "communication_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "communication_attachments_document_idx" ON "communication_attachments" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "communication_attachments_tenant_idx" ON "communication_attachments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_routing_rules_tenant_idx" ON "communication_routing_rules" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_routing_rules_channel_idx" ON "communication_routing_rules" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "communication_routing_rules_priority_idx" ON "communication_routing_rules" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "communication_sla_policies_tenant_idx" ON "communication_sla_policies" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_sla_policies_channel_idx" ON "communication_sla_policies" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "communication_sla_policies_priority_idx" ON "communication_sla_policies" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "communication_cases_tenant_idx" ON "communication_cases" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_cases_conversation_idx" ON "communication_cases" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "communication_cases_contact_idx" ON "communication_cases" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "communication_cases_status_idx" ON "communication_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "communication_cases_assigned_idx" ON "communication_cases" USING btree ("assigned_to_user_id");--> statement-breakpoint
CREATE INDEX "communication_cases_correlation_idx" ON "communication_cases" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "communication_cases_search_tsv_idx" ON "communication_cases" USING gin ("search_tsv");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_journeys_code_uidx" ON "communication_journeys" USING btree ("code");--> statement-breakpoint
CREATE INDEX "communication_journeys_tenant_idx" ON "communication_journeys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_journeys_status_idx" ON "communication_journeys" USING btree ("status");--> statement-breakpoint
CREATE INDEX "communication_journeys_trigger_idx" ON "communication_journeys" USING btree ("trigger_event_type");--> statement-breakpoint
CREATE INDEX "communication_journey_runs_journey_idx" ON "communication_journey_runs" USING btree ("journey_id");--> statement-breakpoint
CREATE INDEX "communication_journey_runs_tenant_idx" ON "communication_journey_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_journey_runs_contact_idx" ON "communication_journey_runs" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "communication_journey_runs_status_idx" ON "communication_journey_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "communication_journey_runs_correlation_idx" ON "communication_journey_runs" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "communication_feedback_tenant_idx" ON "communication_feedback" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_feedback_contact_idx" ON "communication_feedback" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "communication_feedback_conversation_idx" ON "communication_feedback" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "communication_feedback_case_idx" ON "communication_feedback" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "communication_feedback_type_idx" ON "communication_feedback" USING btree ("type");--> statement-breakpoint
CREATE INDEX "communication_feedback_status_idx" ON "communication_feedback" USING btree ("status");--> statement-breakpoint
CREATE INDEX "communication_feedback_correlation_idx" ON "communication_feedback" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "communication_feedback_search_tsv_idx" ON "communication_feedback" USING gin ("search_tsv");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_scheduled_idempotency_uidx" ON "communication_scheduled" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "communication_scheduled_tenant_idx" ON "communication_scheduled" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_scheduled_contact_idx" ON "communication_scheduled" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "communication_scheduled_status_idx" ON "communication_scheduled" USING btree ("status");--> statement-breakpoint
CREATE INDEX "communication_scheduled_scheduled_for_idx" ON "communication_scheduled" USING btree ("scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_analytics_daily_uidx" ON "communication_analytics_daily" USING btree ("tenant_id","date","channel","message_type");--> statement-breakpoint
CREATE INDEX "communication_analytics_daily_tenant_idx" ON "communication_analytics_daily" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_analytics_daily_date_idx" ON "communication_analytics_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX "communication_analytics_daily_channel_idx" ON "communication_analytics_daily" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "communication_cost_ledger_tenant_idx" ON "communication_cost_ledger" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_cost_ledger_message_idx" ON "communication_cost_ledger" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "communication_cost_ledger_provider_idx" ON "communication_cost_ledger" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "communication_cost_ledger_channel_idx" ON "communication_cost_ledger" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "communication_security_events_tenant_idx" ON "communication_security_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_security_events_type_idx" ON "communication_security_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "communication_security_events_severity_idx" ON "communication_security_events" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "communication_security_events_channel_idx" ON "communication_security_events" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "communication_security_events_created_at_idx" ON "communication_security_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_rate_limits_scope_uidx" ON "communication_rate_limits" USING btree ("tenant_id","scope_type","scope_id","channel");--> statement-breakpoint
CREATE INDEX "communication_rate_limits_tenant_idx" ON "communication_rate_limits" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_loop_detections_tenant_idx" ON "communication_loop_detections" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_loop_detections_correlation_idx" ON "communication_loop_detections" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "communication_loop_detections_conversation_idx" ON "communication_loop_detections" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "communication_broadcasts_tenant_idx" ON "communication_broadcasts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_broadcasts_status_idx" ON "communication_broadcasts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "communication_broadcasts_channel_idx" ON "communication_broadcasts" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "communication_broadcasts_correlation_idx" ON "communication_broadcasts" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "communication_broadcast_recipients_tenant_idx" ON "communication_broadcast_recipients" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "communication_broadcast_recipients_status_idx" ON "communication_broadcast_recipients" USING btree ("status");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Value integrity — closed catalogues
-- ---------------------------------------------------------------------------
ALTER TABLE "communication_channels" ADD CONSTRAINT "communication_channels_code_check"
  CHECK ("code" IN ('WHATSAPP','SMS','EMAIL','IN_APP','INTERNAL','PUSH','VOICE','TELEGRAM','TEAMS','SLACK'));--> statement-breakpoint
ALTER TABLE "communication_providers" ADD CONSTRAINT "communication_providers_status_check"
  CHECK ("status" IN ('CONFIGURED','CONNECTED','VERIFIED','DEGRADED','FAILED','NOT_CONNECTED','SIMULATED'));--> statement-breakpoint
ALTER TABLE "communication_providers" ADD CONSTRAINT "communication_providers_health_check"
  CHECK ("health_status" IN ('HEALTHY','DEGRADED','DOWN','UNKNOWN'));--> statement-breakpoint
ALTER TABLE "communication_contacts" ADD CONSTRAINT "communication_contacts_status_check"
  CHECK ("status" IN ('ACTIVE','INACTIVE','BLOCKED','ARCHIVED'));--> statement-breakpoint
ALTER TABLE "communication_contact_methods" ADD CONSTRAINT "communication_contact_methods_type_check"
  CHECK ("method_type" IN ('PHONE','WHATSAPP','EMAIL','IN_APP','INTERNAL'));--> statement-breakpoint
ALTER TABLE "communication_contact_methods" ADD CONSTRAINT "communication_contact_methods_status_check"
  CHECK ("status" IN ('ACTIVE','INACTIVE','BLOCKED'));--> statement-breakpoint
ALTER TABLE "communication_consents" ADD CONSTRAINT "communication_consents_purpose_check"
  CHECK ("purpose" IN ('TRANSACTIONAL','OPERATIONAL','SECURITY','MARKETING','RESEARCH','FEEDBACK'));--> statement-breakpoint
ALTER TABLE "communication_consents" ADD CONSTRAINT "communication_consents_status_check"
  CHECK ("status" IN ('OPT_IN','OPT_OUT','REVOKED'));--> statement-breakpoint
ALTER TABLE "communication_templates" ADD CONSTRAINT "communication_templates_channel_check"
  CHECK ("channel" IN ('WHATSAPP','SMS','EMAIL','IN_APP','INTERNAL','ALL'));--> statement-breakpoint
ALTER TABLE "communication_templates" ADD CONSTRAINT "communication_templates_category_check"
  CHECK ("category" IN ('TRANSACTIONAL','OPERATIONAL','MARKETING','ALERT','INVOICE','RECEIPT','REPORT','REMINDER','FEEDBACK','SURVEY','WELCOME','NOTIFICATION','SECURITY','APPROVAL','CASE','JOURNEY','BROADCAST'));--> statement-breakpoint
ALTER TABLE "communication_templates" ADD CONSTRAINT "communication_templates_status_check"
  CHECK ("status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','ARCHIVED'));--> statement-breakpoint
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_status_check"
  CHECK ("status" IN ('OPEN','BOT_ACTIVE','HUMAN_REQUIRED','HUMAN_ACTIVE','WAITING_CUSTOMER','WAITING_INTERNAL','BOT_RESUMED','RESOLVED','CLOSED'));--> statement-breakpoint
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_priority_check"
  CHECK ("priority" IN ('LOW','NORMAL','HIGH','CRITICAL'));--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_channel_check"
  CHECK ("channel" IN ('WHATSAPP','SMS','EMAIL','IN_APP','INTERNAL','PUSH','VOICE'));--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_direction_check"
  CHECK ("direction" IN ('INBOUND','OUTBOUND'));--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_status_check"
  CHECK ("status" IN ('QUEUED','SENDING','SENT','DELIVERED','READ','FAILED','BOUNCED','REJECTED','CANCELLED'));--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_priority_check"
  CHECK ("priority" IN ('LOW','NORMAL','HIGH','CRITICAL'));--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_failure_code_check"
  CHECK ("failure_code" IS NULL OR "failure_code" IN ('TRANSIENT','PERMANENT','AUTHENTICATION','RATE_LIMIT','INVALID_RECIPIENT','PROVIDER_OUTAGE','POLICY_REJECTION'));--> statement-breakpoint
ALTER TABLE "communication_delivery_events" ADD CONSTRAINT "communication_delivery_events_type_check"
  CHECK ("event_type" IN ('QUEUED','SENDING','SENT','DELIVERED','READ','FAILED','BOUNCED','REJECTED','CANCELLED'));--> statement-breakpoint
ALTER TABLE "communication_webhook_events" ADD CONSTRAINT "communication_webhook_events_status_check"
  CHECK ("status" IN ('RECEIVED','PROCESSING','PROCESSED','FAILED','REJECTED'));--> statement-breakpoint
ALTER TABLE "communication_webhook_events" ADD CONSTRAINT "communication_webhook_events_verification_check"
  CHECK ("verification_status" IN ('PENDING','VERIFIED','FAILED','SKIPPED'));--> statement-breakpoint
ALTER TABLE "communication_cases" ADD CONSTRAINT "communication_cases_status_check"
  CHECK ("status" IN ('OPEN','ASSIGNED','IN_PROGRESS','WAITING_CUSTOMER','RESOLVED','CLOSED'));--> statement-breakpoint
ALTER TABLE "communication_cases" ADD CONSTRAINT "communication_cases_priority_check"
  CHECK ("priority" IN ('LOW','NORMAL','HIGH','CRITICAL'));--> statement-breakpoint
ALTER TABLE "communication_journeys" ADD CONSTRAINT "communication_journeys_status_check"
  CHECK ("status" IN ('DRAFT','ACTIVE','PAUSED','ARCHIVED'));--> statement-breakpoint
ALTER TABLE "communication_journey_runs" ADD CONSTRAINT "communication_journey_runs_status_check"
  CHECK ("status" IN ('RUNNING','COMPLETED','FAILED','CANCELLED','PAUSED'));--> statement-breakpoint
ALTER TABLE "communication_feedback" ADD CONSTRAINT "communication_feedback_type_check"
  CHECK ("type" IN ('FEEDBACK','SURVEY','RATING','COMPLAINT','SUGGESTION','REVIEW'));--> statement-breakpoint
ALTER TABLE "communication_feedback" ADD CONSTRAINT "communication_feedback_status_check"
  CHECK ("status" IN ('SUBMITTED','CLASSIFIED','ROUTED','IN_PROGRESS','RESOLVED','CLOSED'));--> statement-breakpoint
ALTER TABLE "communication_feedback" ADD CONSTRAINT "communication_feedback_rating_check"
  CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5));--> statement-breakpoint
ALTER TABLE "communication_scheduled" ADD CONSTRAINT "communication_scheduled_status_check"
  CHECK ("status" IN ('SCHEDULED','SENT','FAILED','CANCELLED'));--> statement-breakpoint
ALTER TABLE "communication_broadcasts" ADD CONSTRAINT "communication_broadcasts_status_check"
  CHECK ("status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','SCHEDULED','SENDING','COMPLETED','CANCELLED','FAILED'));--> statement-breakpoint
ALTER TABLE "communication_broadcast_recipients" ADD CONSTRAINT "communication_broadcast_recipients_status_check"
  CHECK ("status" IN ('PENDING','SENT','FAILED','SKIPPED','OPTED_OUT'));--> statement-breakpoint
ALTER TABLE "communication_security_events" ADD CONSTRAINT "communication_security_events_severity_check"
  CHECK ("severity" IN ('LOW','MEDIUM','HIGH','CRITICAL'));--> statement-breakpoint
ALTER TABLE "communication_rate_limits" ADD CONSTRAINT "communication_rate_limits_scope_check"
  CHECK ("scope_type" IN ('TENANT','CONTACT','PROVIDER','CHANNEL','IP'));--> statement-breakpoint
ALTER TABLE "communication_cost_ledger" ADD CONSTRAINT "communication_cost_ledger_billing_check"
  CHECK ("billing_status" IN ('ESTIMATED','BILLED','CONFIRMED'));--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row Level Security — tenant isolation (existing pattern)
-- ---------------------------------------------------------------------------
ALTER TABLE "communication_channels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_channels" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_channels_read_only" ON "communication_channels";
CREATE POLICY "communication_channels_read_only" ON "communication_channels" FOR SELECT USING (true);
--> statement-breakpoint
ALTER TABLE "communication_providers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_providers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_providers_tenant_scope" ON "communication_providers";
CREATE POLICY "communication_providers_tenant_scope" ON "communication_providers" FOR ALL
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
ALTER TABLE "communication_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_contacts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_contacts_tenant_scope" ON "communication_contacts";
CREATE POLICY "communication_contacts_tenant_scope" ON "communication_contacts" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  );
--> statement-breakpoint
ALTER TABLE "communication_contact_methods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_contact_methods" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_contact_methods_tenant_scope" ON "communication_contact_methods";
CREATE POLICY "communication_contact_methods_tenant_scope" ON "communication_contact_methods" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  );
--> statement-breakpoint
ALTER TABLE "communication_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_consents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_consents_tenant_scope" ON "communication_consents";
CREATE POLICY "communication_consents_tenant_scope" ON "communication_consents" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  );
--> statement-breakpoint
ALTER TABLE "communication_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_preferences" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_preferences_tenant_scope" ON "communication_preferences";
CREATE POLICY "communication_preferences_tenant_scope" ON "communication_preferences" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  );
--> statement-breakpoint
ALTER TABLE "communication_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_templates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_templates_tenant_scope" ON "communication_templates";
CREATE POLICY "communication_templates_tenant_scope" ON "communication_templates" FOR ALL
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
ALTER TABLE "communication_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_conversations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_conversations_tenant_scope" ON "communication_conversations";
CREATE POLICY "communication_conversations_tenant_scope" ON "communication_conversations" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  );
--> statement-breakpoint
ALTER TABLE "communication_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_messages" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_messages_tenant_scope" ON "communication_messages";
CREATE POLICY "communication_messages_tenant_scope" ON "communication_messages" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  );
--> statement-breakpoint
ALTER TABLE "communication_delivery_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_delivery_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_delivery_events_tenant_scope" ON "communication_delivery_events";
CREATE POLICY "communication_delivery_events_tenant_scope" ON "communication_delivery_events" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  );
--> statement-breakpoint
ALTER TABLE "communication_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_webhook_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_webhook_events_tenant_scope" ON "communication_webhook_events";
CREATE POLICY "communication_webhook_events_tenant_scope" ON "communication_webhook_events" FOR ALL
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
ALTER TABLE "communication_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_attachments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_attachments_tenant_scope" ON "communication_attachments";
CREATE POLICY "communication_attachments_tenant_scope" ON "communication_attachments" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  );
--> statement-breakpoint
ALTER TABLE "communication_routing_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_routing_rules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_routing_rules_tenant_scope" ON "communication_routing_rules";
CREATE POLICY "communication_routing_rules_tenant_scope" ON "communication_routing_rules" FOR ALL
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
ALTER TABLE "communication_sla_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_sla_policies" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_sla_policies_tenant_scope" ON "communication_sla_policies";
CREATE POLICY "communication_sla_policies_tenant_scope" ON "communication_sla_policies" FOR ALL
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
ALTER TABLE "communication_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_cases" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_cases_tenant_scope" ON "communication_cases";
CREATE POLICY "communication_cases_tenant_scope" ON "communication_cases" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  );
--> statement-breakpoint
ALTER TABLE "communication_journeys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_journeys" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_journeys_tenant_scope" ON "communication_journeys";
CREATE POLICY "communication_journeys_tenant_scope" ON "communication_journeys" FOR ALL
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
ALTER TABLE "communication_journey_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_journey_runs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_journey_runs_tenant_scope" ON "communication_journey_runs";
CREATE POLICY "communication_journey_runs_tenant_scope" ON "communication_journey_runs" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  );
--> statement-breakpoint
ALTER TABLE "communication_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_feedback" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_feedback_tenant_scope" ON "communication_feedback";
CREATE POLICY "communication_feedback_tenant_scope" ON "communication_feedback" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  );
--> statement-breakpoint
ALTER TABLE "communication_scheduled" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_scheduled" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_scheduled_tenant_scope" ON "communication_scheduled";
CREATE POLICY "communication_scheduled_tenant_scope" ON "communication_scheduled" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  );
--> statement-breakpoint
ALTER TABLE "communication_analytics_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_analytics_daily" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_analytics_daily_tenant_scope" ON "communication_analytics_daily";
CREATE POLICY "communication_analytics_daily_tenant_scope" ON "communication_analytics_daily" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  );
--> statement-breakpoint
ALTER TABLE "communication_cost_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_cost_ledger" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_cost_ledger_tenant_scope" ON "communication_cost_ledger";
CREATE POLICY "communication_cost_ledger_tenant_scope" ON "communication_cost_ledger" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  );
--> statement-breakpoint
ALTER TABLE "communication_security_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_security_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_security_events_tenant_scope" ON "communication_security_events";
CREATE POLICY "communication_security_events_tenant_scope" ON "communication_security_events" FOR ALL
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
ALTER TABLE "communication_rate_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_rate_limits" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_rate_limits_tenant_scope" ON "communication_rate_limits";
CREATE POLICY "communication_rate_limits_tenant_scope" ON "communication_rate_limits" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  );
--> statement-breakpoint
ALTER TABLE "communication_loop_detections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_loop_detections" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_loop_detections_tenant_scope" ON "communication_loop_detections";
CREATE POLICY "communication_loop_detections_tenant_scope" ON "communication_loop_detections" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  );
--> statement-breakpoint
ALTER TABLE "communication_broadcasts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_broadcasts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_broadcasts_tenant_scope" ON "communication_broadcasts";
CREATE POLICY "communication_broadcasts_tenant_scope" ON "communication_broadcasts" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  );
--> statement-breakpoint
ALTER TABLE "communication_broadcast_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_broadcast_recipients" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "communication_broadcast_recipients_tenant_scope" ON "communication_broadcast_recipients";
CREATE POLICY "communication_broadcast_recipients_tenant_scope" ON "communication_broadcast_recipients" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  );
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Restrictive policies — registry tables immutable for runtime
-- ---------------------------------------------------------------------------
CREATE POLICY "communication_channels_no_insert" ON "communication_channels" AS RESTRICTIVE FOR INSERT WITH CHECK (false);
CREATE POLICY "communication_channels_no_update" ON "communication_channels" AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);
CREATE POLICY "communication_channels_no_delete" ON "communication_channels" AS RESTRICTIVE FOR DELETE USING (false);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Role grants — conditional on role existence
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format('GRANT SELECT ON communication_channels TO %I', r.rolname);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON communication_providers, communication_contacts, communication_contact_methods, communication_consents, communication_preferences, communication_templates, communication_conversations, communication_messages, communication_delivery_events, communication_webhook_events, communication_attachments, communication_routing_rules, communication_sla_policies, communication_cases, communication_journeys, communication_journey_runs, communication_feedback, communication_scheduled, communication_analytics_daily, communication_cost_ledger, communication_security_events, communication_rate_limits, communication_loop_detections, communication_broadcasts, communication_broadcast_recipients TO %I', r.rolname);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON communication_channels FROM %I', r.rolname);
  END LOOP;
END
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Seed canonical channels
-- ---------------------------------------------------------------------------
INSERT INTO "communication_channels" ("code", "name", "description", "enabled", "capabilities", "supports_inbound", "supports_outbound", "supports_media", "supports_templates") VALUES
('WHATSAPP', 'WhatsApp', 'WhatsApp Business via Meta Cloud API — official integration only', true, '["TEXT","TEMPLATE","MEDIA","DOCUMENT","LOCATION","BUTTON","LIST"]', true, true, true, true),
('SMS', 'SMS', 'SMS via approved providers with country-specific routing', true, '["TEXT","TEMPLATE"]', true, true, false, true),
('EMAIL', 'Email', 'Email via approved providers with HTML, attachments, threading', true, '["TEXT","HTML","TEMPLATE","ATTACHMENT","THREADING"]', true, true, true, true),
('IN_APP', 'In-App Notifications', 'Governed in-application notifications — existing notification infrastructure', true, '["TEXT","ACTION","LINK"]', false, true, false, true),
('INTERNAL', 'Internal BEYU Messaging', 'Governed internal communication between authorized BEYU users', true, '["TEXT","DOCUMENT","TASK"]', true, true, true, false)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Seed default providers in SIMULATED mode (safe, no real provider activation)
-- ---------------------------------------------------------------------------
INSERT INTO "communication_providers" ("id", "code", "channel_code", "provider_type", "name", "status", "is_default", "priority", "health_status") VALUES
('PROV_WHATSAPP_SIM', 'WHATSAPP_SIMULATED', 'WHATSAPP', 'META_WHATSAPP_SIMULATED', 'WhatsApp Simulated Provider', 'SIMULATED', true, 100, 'UNKNOWN'),
('PROV_SMS_SIM', 'SMS_SIMULATED', 'SMS', 'SMS_SIMULATED', 'SMS Simulated Provider', 'SIMULATED', true, 100, 'UNKNOWN'),
('PROV_EMAIL_SIM', 'EMAIL_SIMULATED', 'EMAIL', 'EMAIL_SIMULATED', 'Email Simulated Provider', 'SIMULATED', true, 100, 'UNKNOWN'),
('PROV_INAPP', 'INAPP_BEYU', 'IN_APP', 'BEYU_IN_APP', 'BEYU In-App Provider', 'CONFIGURED', true, 100, 'HEALTHY'),
('PROV_INTERNAL', 'INTERNAL_BEYU', 'INTERNAL', 'BEYU_INTERNAL', 'BEYU Internal Messaging Provider', 'CONFIGURED', true, 100, 'HEALTHY')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Seed default routing rules (Tanzania first, but as configuration)
-- ---------------------------------------------------------------------------
INSERT INTO "communication_routing_rules" ("id", "name", "description", "priority", "conditions", "action", "created_by") VALUES
('ROUTE_DEFAULT_TRANSACTIONAL', 'Default Transactional Routing', 'Route transactional messages via preferred channel with Email fallback', 100, '{"message_classification": ["TRANSACTIONAL","OPERATIONAL","SECURITY"]}', '{"strategy": "PREFERRED_WITH_FALLBACK", "fallback": ["EMAIL","IN_APP"]}', 'SYSTEM'),
('ROUTE_INVOICE', 'Invoice Delivery Routing', 'Invoices via Email PDF + WhatsApp notification + In-App copy', 90, '{"message_type": ["INVOICE","RECEIPT","STATEMENT"]}', '{"strategy": "MULTI_CHANNEL", "channels": ["EMAIL","WHATSAPP","IN_APP"]}', 'SYSTEM'),
('ROUTE_CRITICAL_ALERT', 'Critical Alert Routing', 'Critical alerts via In-App + SMS + internal escalation', 10, '{"priority": ["CRITICAL"], "message_type": ["ALERT","SECURITY"]}', '{"strategy": "MULTI_CHANNEL", "channels": ["IN_APP","SMS","INTERNAL"], "escalate": true}', 'SYSTEM'),
('ROUTE_MARKETING', 'Marketing Routing', 'Marketing requires consent, prefers WhatsApp then Email', 200, '{"purpose": ["MARKETING"]}', '{"strategy": "CONSENT_GATED", "channels": ["WHATSAPP","EMAIL","SMS"], "requires_consent": true}', 'SYSTEM')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Seed default SLA policies
-- ---------------------------------------------------------------------------
INSERT INTO "communication_sla_policies" ("id", "name", "description", "priority", "response_time_minutes", "resolution_time_minutes", "business_hours", "timezone", "escalation_rules", "created_by") VALUES
('SLA_CRITICAL', 'Critical SLA', 'Critical priority conversations', 'CRITICAL', 15, 120, '{"monday": {"start": "00:00", "end": "23:59"}, "tuesday": {"start": "00:00", "end": "23:59"}, "wednesday": {"start": "00:00", "end": "23:59"}, "thursday": {"start": "00:00", "end": "23:59"}, "friday": {"start": "00:00", "end": "23:59"}, "saturday": {"start": "00:00", "end": "23:59"}, "sunday": {"start": "00:00", "end": "23:59"}}', 'UTC', '{"levels": [{"after_minutes": 15, "action": "NOTIFY_SUPERVISOR"}, {"after_minutes": 60, "action": "ESCALATE_MANAGEMENT"}]}', 'SYSTEM'),
('SLA_HIGH', 'High Priority SLA', 'High priority conversations', 'HIGH', 60, 480, '{"monday": {"start": "08:00", "end": "18:00"}, "tuesday": {"start": "08:00", "end": "18:00"}, "wednesday": {"start": "08:00", "end": "18:00"}, "thursday": {"start": "08:00", "end": "18:00"}, "friday": {"start": "08:00", "end": "18:00"}}', 'UTC', '{"levels": [{"after_minutes": 60, "action": "NOTIFY_SUPERVISOR"}, {"after_minutes": 240, "action": "ESCALATE_MANAGEMENT"}]}', 'SYSTEM'),
('SLA_NORMAL', 'Normal SLA', 'Normal priority conversations', 'NORMAL', 240, 1440, '{"monday": {"start": "08:00", "end": "18:00"}, "tuesday": {"start": "08:00", "end": "18:00"}, "wednesday": {"start": "08:00", "end": "18:00"}, "thursday": {"start": "08:00", "end": "18:00"}, "friday": {"start": "08:00", "end": "18:00"}}', 'UTC', '{"levels": [{"after_minutes": 240, "action": "NOTIFY_SUPERVISOR"}, {"after_minutes": 1440, "action": "ESCALATE_MANAGEMENT"}]}', 'SYSTEM')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Seed reference countries required for templates (idempotent, safe)
-- Ensures migration succeeds on fresh DB without seed.ts
-- ---------------------------------------------------------------------------
INSERT INTO "countries" ("code", "name", "region", "currency_code", "timezone", "locale", "active") VALUES
('TZ', 'United Republic of Tanzania', 'East Africa', 'TZS', 'Africa/Dar_es_Salaam', 'sw-TZ', true),
('KE', 'Republic of Kenya', 'East Africa', 'KES', 'Africa/Nairobi', 'en-KE', true),
('AE', 'United Arab Emirates', 'Middle East', 'AED', 'Asia/Dubai', 'en-AE', true),
('GB', 'United Kingdom', 'Europe', 'GBP', 'Europe/London', 'en-GB', true),
('MU', 'Republic of Mauritius', 'Indian Ocean', 'MUR', 'Indian/Mauritius', 'en-MU', true)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Seed default templates (Tanzania configuration as data, not hard-coded)
-- ---------------------------------------------------------------------------
INSERT INTO "communication_templates" ("id", "code", "version", "channel", "category", "name", "subject_template", "body_template", "variables", "language", "country_code", "status", "is_active", "created_by") VALUES
('TMPL_WELCOME_EN', 'WELCOME', '1.0.0', 'ALL', 'WELCOME', 'Welcome Template', 'Welcome to {{organization_name}}', 'Hello {{contact_name}},\n\nWelcome to {{organization_name}}! Your account has been created.\n\nBest regards,\n{{organization_name}} Team', '["contact_name","organization_name"]', 'en', null, 'APPROVED', true, 'SYSTEM'),
('TMPL_WELCOME_SW', 'WELCOME', '1.0.1', 'ALL', 'WELCOME', 'Karibu (Swahili)', 'Karibu {{organization_name}}', 'Habari {{contact_name}},\n\nKaribu {{organization_name}}! Akaunti yako imeundwa.\n\nWako,\nTimu ya {{organization_name}}', '["contact_name","organization_name"]', 'sw', 'TZ', 'APPROVED', true, 'SYSTEM'),
('TMPL_INVOICE_EN', 'INVOICE_NOTIFICATION', '1.0.0', 'EMAIL', 'INVOICE', 'Invoice Notification', 'Invoice {{invoice_number}} from {{organization_name}}', 'Hello {{contact_name}},\n\nYour invoice {{invoice_number}} for {{amount}} {{currency}} is ready.\nDue date: {{due_date}}\n\nPlease find attached or click: {{invoice_link}}\n\nBest regards,\n{{organization_name}}', '["contact_name","invoice_number","amount","currency","due_date","invoice_link","organization_name"]', 'en', null, 'APPROVED', true, 'SYSTEM'),
('TMPL_INVOICE_SW', 'INVOICE_NOTIFICATION', '1.0.1', 'EMAIL', 'INVOICE', 'Ankara ya Malipo (Swahili)', 'Ankara {{invoice_number}} kutoka {{organization_name}}', 'Habari {{contact_name}},\n\nAnkara yako {{invoice_number}} ya {{amount}} {{currency}} iko tayari.\nTarehe ya malipo: {{due_date}}\n\nTafadhali pakua: {{invoice_link}}\n\nWako,\n{{organization_name}}', '["contact_name","invoice_number","amount","currency","due_date","invoice_link","organization_name"]', 'sw', 'TZ', 'APPROVED', true, 'SYSTEM'),
('TMPL_OTP_EN', 'OTP_VERIFICATION', '1.0.0', 'ALL', 'SECURITY', 'OTP Verification', 'Your verification code', 'Your verification code is {{otp_code}}. It expires in {{expires_in}} minutes. Do not share this code.', '["otp_code","expires_in"]', 'en', null, 'APPROVED', true, 'SYSTEM')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Full-text search triggers for communications (0066 pattern)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION communications_search_trigger_contacts() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('english', coalesce(NEW.display_name,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.first_name,'') || ' ' || coalesce(NEW.last_name,'') || ' ' || coalesce(NEW.organization_name,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.primary_email,'') || ' ' || coalesce(NEW.primary_phone,'')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_communications_contacts_search ON communication_contacts;
CREATE TRIGGER trg_communications_contacts_search BEFORE INSERT OR UPDATE OF display_name, first_name, last_name, organization_name, primary_email, primary_phone ON communication_contacts FOR EACH ROW EXECUTE FUNCTION communications_search_trigger_contacts();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION communications_search_trigger_conversations() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('english', coalesce(NEW.subject,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.channel,'') || ' ' || coalesce(NEW.status,'') || ' ' || coalesce(NEW.priority,'')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_communications_conversations_search ON communication_conversations;
CREATE TRIGGER trg_communications_conversations_search BEFORE INSERT OR UPDATE OF subject, channel, status, priority ON communication_conversations FOR EACH ROW EXECUTE FUNCTION communications_search_trigger_conversations();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION communications_search_trigger_messages() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('english', coalesce(NEW.subject,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.body,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.channel,'') || ' ' || coalesce(NEW.status,'')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_communications_messages_search ON communication_messages;
CREATE TRIGGER trg_communications_messages_search BEFORE INSERT OR UPDATE OF subject, body, channel, status ON communication_messages FOR EACH ROW EXECUTE FUNCTION communications_search_trigger_messages();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION communications_search_trigger_cases() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('english', coalesce(NEW.subject,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description,'')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_communications_cases_search ON communication_cases;
CREATE TRIGGER trg_communications_cases_search BEFORE INSERT OR UPDATE OF subject, description ON communication_cases FOR EACH ROW EXECUTE FUNCTION communications_search_trigger_cases();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION communications_search_trigger_feedback() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('english', coalesce(NEW.subject,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.body,'')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_communications_feedback_search ON communication_feedback;
CREATE TRIGGER trg_communications_feedback_search BEFORE INSERT OR UPDATE OF subject, body ON communication_feedback FOR EACH ROW EXECUTE FUNCTION communications_search_trigger_feedback();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Source-of-Truth registration
-- ---------------------------------------------------------------------------
INSERT INTO "source_of_truth" ("id", "capability", "authoritative_os", "authoritative_store", "consumers", "duplication_allowed", "notes") VALUES
('SOT_COMMUNICATIONS', 'communications', 'BEYU_OS', 'communication_messages', '["FINANCE_OS","AGRICULTURE_OS","UJENZI_OS","FOUNDATION_OS","HEALTH_OS"]', false, 'Shared Communications Capability — governed messaging, conversations, templates, routing, consent, delivery'),
('SOT_COMMUNICATIONS_CONTACTS', 'communication_contacts', 'BEYU_OS', 'communication_contacts', '["FINANCE_OS","AGRICULTURE_OS","UJENZI_OS","FOUNDATION_OS","HEALTH_OS"]', false, 'Contact/Recipient 360° — verified contact methods linked to GlobalUserID'),
('SOT_COMMUNICATIONS_TEMPLATES', 'communication_templates', 'BEYU_OS', 'communication_templates', '["FINANCE_OS","AGRICULTURE_OS","UJENZI_OS","FOUNDATION_OS"]', false, 'Communication templates — versioned, localized, approved')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- OS Registry — Communications is a SHARED CAPABILITY, NOT an OS
-- ---------------------------------------------------------------------------
INSERT INTO "os_registry" ("id", "code", "name", "kind", "purpose", "owner_role", "authority_scope", "data_authority", "dependencies", "apis", "events", "compliance_frameworks", "classification", "lifecycle") VALUES
('OS_COMMUNICATIONS_CAPABILITY', 'SHARED_COMMUNICATIONS', 'Communications Platform', 'SHARED_CAPABILITY', 'Governed multi-channel communications: WhatsApp, SMS, Email, In-App, Internal, conversations, routing, templates, consent, analytics', 'PLATFORM_ADMIN', 'ENTERPRISE', '["communications","communication_contacts","communication_templates"]', '["identity","documents","workflow","audit","events","finance","federation"]', '["/api/v1/communications/*","/api/v1/communications/webhook/*"]', '["COMMUNICATION_SENT","COMMUNICATION_DELIVERED","COMMUNICATION_FAILED","CONVERSATION_OPENED","CONVERSATION_RESOLVED","FEEDBACK_SUBMITTED"]', '["TCPA","GDPR","CAN-SPAM","WhatsApp Business Policy"]', 'CONFIDENTIAL', 'ACTIVE')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Verification — RLS present on every communications table
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN (
      'communication_channels','communication_providers','communication_contacts',
      'communication_contact_methods','communication_consents','communication_preferences',
      'communication_templates','communication_conversations','communication_messages',
      'communication_delivery_events','communication_webhook_events','communication_attachments',
      'communication_routing_rules','communication_sla_policies','communication_cases',
      'communication_journeys','communication_journey_runs','communication_feedback',
      'communication_scheduled','communication_analytics_daily','communication_cost_ledger',
      'communication_security_events','communication_rate_limits','communication_loop_detections',
      'communication_broadcasts','communication_broadcast_recipients'
    )
    AND rowsecurity = true;
  IF n <> 26 THEN
    RAISE EXCEPTION 'Migration 0072 verification failed: RLS missing on communications tables (found %, expected 26)', n;
  END IF;
END $$;
