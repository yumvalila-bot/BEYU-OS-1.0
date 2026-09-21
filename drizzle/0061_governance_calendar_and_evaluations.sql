CREATE TABLE "governance_calendar_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"body_id" text NOT NULL,
	"event_type" text DEFAULT 'BOARD_MEETING' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"scheduled_date" text NOT NULL,
	"scheduled_time" text,
	"notice_required_days" integer DEFAULT 14 NOT NULL,
	"notice_dispatched" boolean DEFAULT false NOT NULL,
	"notice_deadline_date" text NOT NULL,
	"status" text DEFAULT 'UPCOMING' NOT NULL,
	"linked_meeting_id" text,
	"linked_resolution_id" text,
	"classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "governance_escalations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"body_id" text NOT NULL,
	"event_id" text,
	"escalation_level" text DEFAULT 'LEVEL_1_WARNING' NOT NULL,
	"trigger_reason" text NOT NULL,
	"target_party_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"escalated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_by_user_id" text,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "governance_evaluations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"body_id" text NOT NULL,
	"evaluation_type" text DEFAULT 'ANNUAL_BOARD_EFFECTIVENESS' NOT NULL,
	"evaluation_period" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"overall_score" integer,
	"dimension_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommendations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"document_id" text,
	"conducted_by_user_id" text NOT NULL,
	"conducted_on" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "governance_legal_holds" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"body_id" text,
	"hold_title" text NOT NULL,
	"hold_reason" text NOT NULL,
	"matter_reference" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"applied_by_user_id" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_by_user_id" text,
	"released_at" timestamp with time zone,
	"release_justification" text
);
--> statement-breakpoint
ALTER TABLE "governance_calendar_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "governance_escalations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "governance_evaluations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "governance_legal_holds" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "governance_calendar_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "governance_escalations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "governance_evaluations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "governance_legal_holds" FORCE ROW LEVEL SECURITY;

ALTER TABLE "governance_calendar_events" ADD CONSTRAINT "governance_calendar_events_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_calendar_events" ADD CONSTRAINT "governance_calendar_events_body_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."governance_bodies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_calendar_events" ADD CONSTRAINT "governance_calendar_events_meeting_id_fk" FOREIGN KEY ("linked_meeting_id") REFERENCES "public"."governance_meetings"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "governance_calendar_events" ADD CONSTRAINT "governance_calendar_events_resolution_id_fk" FOREIGN KEY ("linked_resolution_id") REFERENCES "public"."resolutions"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "governance_calendar_events" ADD CONSTRAINT "governance_calendar_events_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "governance_escalations" ADD CONSTRAINT "governance_escalations_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_escalations" ADD CONSTRAINT "governance_escalations_body_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."governance_bodies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_escalations" ADD CONSTRAINT "governance_escalations_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."governance_calendar_events"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "governance_escalations" ADD CONSTRAINT "governance_escalations_ack_user_fk" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "governance_evaluations" ADD CONSTRAINT "governance_evaluations_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_evaluations" ADD CONSTRAINT "governance_evaluations_body_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."governance_bodies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_evaluations" ADD CONSTRAINT "governance_evaluations_doc_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "governance_evaluations" ADD CONSTRAINT "governance_evaluations_conducted_by_fk" FOREIGN KEY ("conducted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "governance_legal_holds" ADD CONSTRAINT "governance_legal_holds_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_legal_holds" ADD CONSTRAINT "governance_legal_holds_body_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."governance_bodies"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "governance_legal_holds" ADD CONSTRAINT "governance_legal_holds_applied_by_fk" FOREIGN KEY ("applied_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_legal_holds" ADD CONSTRAINT "governance_legal_holds_released_by_fk" FOREIGN KEY ("released_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

--> statement-breakpoint
CREATE POLICY "calendar_events_scope" ON "governance_calendar_events" USING (
 (current_setting('beyu.global_scope', true) = 'on' OR tenant_id = ANY(string_to_array(current_setting('beyu.current_tenant_ids', true), ',')))
 AND (current_setting('beyu.governance_classifications', true) IS NULL OR classification::text = ANY(string_to_array(current_setting('beyu.governance_classifications', true), ',')))
) WITH CHECK (
 (current_setting('beyu.global_scope', true) = 'on' OR tenant_id = ANY(string_to_array(current_setting('beyu.current_tenant_ids', true), ',')))
 AND (current_setting('beyu.governance_classifications', true) IS NULL OR classification::text = ANY(string_to_array(current_setting('beyu.governance_classifications', true), ',')))
);

CREATE POLICY "escalations_scope" ON "governance_escalations" USING (
 current_setting('beyu.global_scope', true) = 'on' OR tenant_id = ANY(string_to_array(current_setting('beyu.current_tenant_ids', true), ','))
) WITH CHECK (
 current_setting('beyu.global_scope', true) = 'on' OR tenant_id = ANY(string_to_array(current_setting('beyu.current_tenant_ids', true), ','))
);

CREATE POLICY "evaluations_scope" ON "governance_evaluations" USING (
 current_setting('beyu.global_scope', true) = 'on' OR tenant_id = ANY(string_to_array(current_setting('beyu.current_tenant_ids', true), ','))
) WITH CHECK (
 current_setting('beyu.global_scope', true) = 'on' OR tenant_id = ANY(string_to_array(current_setting('beyu.current_tenant_ids', true), ','))
);

CREATE POLICY "legal_holds_scope" ON "governance_legal_holds" USING (
 current_setting('beyu.global_scope', true) = 'on' OR tenant_id = ANY(string_to_array(current_setting('beyu.current_tenant_ids', true), ','))
) WITH CHECK (
 current_setting('beyu.global_scope', true) = 'on' OR tenant_id = ANY(string_to_array(current_setting('beyu.current_tenant_ids', true), ','))
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE ON "governance_calendar_events" TO "authenticated";
    GRANT SELECT, INSERT, UPDATE ON "governance_escalations" TO "authenticated";
    GRANT SELECT, INSERT, UPDATE ON "governance_evaluations" TO "authenticated";
    GRANT SELECT, INSERT, UPDATE ON "governance_legal_holds" TO "authenticated";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE ON "governance_calendar_events" TO "service_role";
    GRANT SELECT, INSERT, UPDATE ON "governance_escalations" TO "service_role";
    GRANT SELECT, INSERT, UPDATE ON "governance_evaluations" TO "service_role";
    GRANT SELECT, INSERT, UPDATE ON "governance_legal_holds" TO "service_role";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'beyu_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON "governance_calendar_events" TO "beyu_runtime";
    GRANT SELECT, INSERT, UPDATE ON "governance_escalations" TO "beyu_runtime";
    GRANT SELECT, INSERT, UPDATE ON "governance_evaluations" TO "beyu_runtime";
    GRANT SELECT, INSERT, UPDATE ON "governance_legal_holds" TO "beyu_runtime";
  END IF;
END $$;
