CREATE TABLE "governance_meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"body_id" text NOT NULL,
	"title" text NOT NULL,
	"meeting_type" text DEFAULT 'ORDINARY' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"scheduled_start_at" timestamp with time zone NOT NULL,
	"scheduled_end_at" timestamp with time zone NOT NULL,
	"actual_start_at" timestamp with time zone,
	"actual_end_at" timestamp with time zone,
	"location" text DEFAULT 'Boardroom / Virtual Hybrid' NOT NULL,
	"is_virtual" boolean DEFAULT false NOT NULL,
	"classification" "beyu_classification" DEFAULT 'INTERNAL' NOT NULL,
	"notice_document_id" text,
	"minutes_document_id" text,
	"presiding_member_id" text,
	"secretary_member_id" text,
	"quorum_required" integer NOT NULL,
	"quorum_achieved" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "governance_meeting_agenda_items" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"item_order" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"item_type" text DEFAULT 'DISCUSSION' NOT NULL,
	"lead_party_id" text,
	"duration_minutes" integer DEFAULT 15 NOT NULL,
	"board_paper_document_id" text,
	"board_paper_checksum" text,
	"linked_resolution_id" text,
	"is_confidential" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "governance_meeting_attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"member_id" text NOT NULL,
	"party_id" text NOT NULL,
	"attendance_type" text DEFAULT 'IN_PERSON' NOT NULL,
	"joined_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	"voting_eligible" boolean DEFAULT true NOT NULL,
	"recorded_by_user_id" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "governance_meeting_conflicts" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"member_id" text NOT NULL,
	"party_id" text NOT NULL,
	"agenda_item_id" text,
	"nature_of_interest" text NOT NULL,
	"conflict_type" text DEFAULT 'PECUNIARY' NOT NULL,
	"action_taken" text DEFAULT 'RECUSED_FROM_DISCUSSION_AND_VOTE' NOT NULL,
	"recorded_by_user_id" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "governance_meeting_motions" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"agenda_item_id" text,
	"motion_text" text NOT NULL,
	"moved_by_member_id" text NOT NULL,
	"seconded_by_member_id" text,
	"motion_status" text DEFAULT 'PROPOSED' NOT NULL,
	"linked_resolution_id" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "governance_meeting_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"agenda_item_id" text,
	"resolution_id" text,
	"action_title" text NOT NULL,
	"assignee_party_id" text NOT NULL,
	"due_date" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"independent_verifier_party_id" text,
	"verification_evidence_document_id" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "governance_meetings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "governance_meeting_agenda_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "governance_meeting_attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "governance_meeting_conflicts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "governance_meeting_motions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "governance_meeting_actions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "governance_meetings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "governance_meeting_agenda_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "governance_meeting_attendance" FORCE ROW LEVEL SECURITY;
ALTER TABLE "governance_meeting_conflicts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "governance_meeting_motions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "governance_meeting_actions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "governance_meetings" ADD CONSTRAINT "governance_meetings_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_meetings" ADD CONSTRAINT "governance_meetings_body_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."governance_bodies"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_meetings" ADD CONSTRAINT "governance_meetings_notice_document_id_fk" FOREIGN KEY ("notice_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_meetings" ADD CONSTRAINT "governance_meetings_minutes_document_id_fk" FOREIGN KEY ("minutes_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_meetings" ADD CONSTRAINT "governance_meetings_presiding_member_id_fk" FOREIGN KEY ("presiding_member_id") REFERENCES "public"."governance_members"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_meetings" ADD CONSTRAINT "governance_meetings_secretary_member_id_fk" FOREIGN KEY ("secretary_member_id") REFERENCES "public"."governance_members"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_meetings" ADD CONSTRAINT "governance_meetings_created_by_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "governance_meeting_agenda_items" ADD CONSTRAINT "governance_meeting_agenda_items_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."governance_meetings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "governance_meeting_agenda_items" ADD CONSTRAINT "governance_meeting_agenda_items_lead_party_id_fk" FOREIGN KEY ("lead_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_meeting_agenda_items" ADD CONSTRAINT "governance_meeting_agenda_items_board_paper_doc_fk" FOREIGN KEY ("board_paper_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_meeting_agenda_items" ADD CONSTRAINT "governance_meeting_agenda_items_linked_res_fk" FOREIGN KEY ("linked_resolution_id") REFERENCES "public"."resolutions"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "governance_meeting_attendance" ADD CONSTRAINT "governance_meeting_attendance_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."governance_meetings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "governance_meeting_attendance" ADD CONSTRAINT "governance_meeting_attendance_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."governance_members"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_meeting_attendance" ADD CONSTRAINT "governance_meeting_attendance_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_meeting_attendance" ADD CONSTRAINT "governance_meeting_attendance_recorded_by_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "governance_meeting_conflicts" ADD CONSTRAINT "governance_meeting_conflicts_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."governance_meetings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "governance_meeting_conflicts" ADD CONSTRAINT "governance_meeting_conflicts_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."governance_members"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_meeting_conflicts" ADD CONSTRAINT "governance_meeting_conflicts_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_meeting_conflicts" ADD CONSTRAINT "governance_meeting_conflicts_agenda_item_id_fk" FOREIGN KEY ("agenda_item_id") REFERENCES "public"."governance_meeting_agenda_items"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "governance_meeting_conflicts" ADD CONSTRAINT "governance_meeting_conflicts_recorded_by_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "governance_meeting_motions" ADD CONSTRAINT "governance_meeting_motions_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."governance_meetings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "governance_meeting_motions" ADD CONSTRAINT "governance_meeting_motions_agenda_item_id_fk" FOREIGN KEY ("agenda_item_id") REFERENCES "public"."governance_meeting_agenda_items"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "governance_meeting_motions" ADD CONSTRAINT "governance_meeting_motions_moved_by_fk" FOREIGN KEY ("moved_by_member_id") REFERENCES "public"."governance_members"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_meeting_motions" ADD CONSTRAINT "governance_meeting_motions_seconded_by_fk" FOREIGN KEY ("seconded_by_member_id") REFERENCES "public"."governance_members"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_meeting_motions" ADD CONSTRAINT "governance_meeting_motions_linked_res_fk" FOREIGN KEY ("linked_resolution_id") REFERENCES "public"."resolutions"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "governance_meeting_actions" ADD CONSTRAINT "governance_meeting_actions_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."governance_meetings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "governance_meeting_actions" ADD CONSTRAINT "governance_meeting_actions_agenda_item_id_fk" FOREIGN KEY ("agenda_item_id") REFERENCES "public"."governance_meeting_agenda_items"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "governance_meeting_actions" ADD CONSTRAINT "governance_meeting_actions_resolution_id_fk" FOREIGN KEY ("resolution_id") REFERENCES "public"."resolutions"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "governance_meeting_actions" ADD CONSTRAINT "governance_meeting_actions_assignee_fk" FOREIGN KEY ("assignee_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_meeting_actions" ADD CONSTRAINT "governance_meeting_actions_verifier_fk" FOREIGN KEY ("independent_verifier_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "governance_meeting_actions" ADD CONSTRAINT "governance_meeting_actions_evidence_doc_fk" FOREIGN KEY ("verification_evidence_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint
CREATE POLICY "meetings_scope" ON "governance_meetings" USING (
 (current_setting('beyu.global_scope', true) = 'on' OR tenant_id = ANY(string_to_array(current_setting('beyu.current_tenant_ids', true), ',')))
 AND (current_setting('beyu.governance_classifications', true) IS NULL OR classification::text = ANY(string_to_array(current_setting('beyu.governance_classifications', true), ',')))
) WITH CHECK (
 (current_setting('beyu.global_scope', true) = 'on' OR tenant_id = ANY(string_to_array(current_setting('beyu.current_tenant_ids', true), ',')))
 AND (current_setting('beyu.governance_classifications', true) IS NULL OR classification::text = ANY(string_to_array(current_setting('beyu.governance_classifications', true), ',')))
);

CREATE POLICY "meeting_items_scope" ON "governance_meeting_agenda_items" USING (
 EXISTS (SELECT 1 FROM governance_meetings m WHERE m.id = meeting_id)
) WITH CHECK (
 EXISTS (SELECT 1 FROM governance_meetings m WHERE m.id = meeting_id)
);

CREATE POLICY "meeting_attendance_scope" ON "governance_meeting_attendance" USING (
 EXISTS (SELECT 1 FROM governance_meetings m WHERE m.id = meeting_id)
) WITH CHECK (
 EXISTS (SELECT 1 FROM governance_meetings m WHERE m.id = meeting_id)
);

CREATE POLICY "meeting_conflicts_scope" ON "governance_meeting_conflicts" USING (
 EXISTS (SELECT 1 FROM governance_meetings m WHERE m.id = meeting_id)
) WITH CHECK (
 EXISTS (SELECT 1 FROM governance_meetings m WHERE m.id = meeting_id)
);

CREATE POLICY "meeting_motions_scope" ON "governance_meeting_motions" USING (
 EXISTS (SELECT 1 FROM governance_meetings m WHERE m.id = meeting_id)
) WITH CHECK (
 EXISTS (SELECT 1 FROM governance_meetings m WHERE m.id = meeting_id)
);

CREATE POLICY "meeting_actions_scope" ON "governance_meeting_actions" USING (
 EXISTS (SELECT 1 FROM governance_meetings m WHERE m.id = meeting_id)
) WITH CHECK (
 EXISTS (SELECT 1 FROM governance_meetings m WHERE m.id = meeting_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE ON "governance_meetings" TO "authenticated";
    GRANT SELECT, INSERT, UPDATE ON "governance_meeting_agenda_items" TO "authenticated";
    GRANT SELECT, INSERT, UPDATE ON "governance_meeting_attendance" TO "authenticated";
    GRANT SELECT, INSERT, UPDATE ON "governance_meeting_conflicts" TO "authenticated";
    GRANT SELECT, INSERT, UPDATE ON "governance_meeting_motions" TO "authenticated";
    GRANT SELECT, INSERT, UPDATE ON "governance_meeting_actions" TO "authenticated";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE ON "governance_meetings" TO "service_role";
    GRANT SELECT, INSERT, UPDATE ON "governance_meeting_agenda_items" TO "service_role";
    GRANT SELECT, INSERT, UPDATE ON "governance_meeting_attendance" TO "service_role";
    GRANT SELECT, INSERT, UPDATE ON "governance_meeting_conflicts" TO "service_role";
    GRANT SELECT, INSERT, UPDATE ON "governance_meeting_motions" TO "service_role";
    GRANT SELECT, INSERT, UPDATE ON "governance_meeting_actions" TO "service_role";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'beyu_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON "governance_meetings" TO "beyu_runtime";
    GRANT SELECT, INSERT, UPDATE ON "governance_meeting_agenda_items" TO "beyu_runtime";
    GRANT SELECT, INSERT, UPDATE ON "governance_meeting_attendance" TO "beyu_runtime";
    GRANT SELECT, INSERT, UPDATE ON "governance_meeting_conflicts" TO "beyu_runtime";
    GRANT SELECT, INSERT, UPDATE ON "governance_meeting_motions" TO "beyu_runtime";
    GRANT SELECT, INSERT, UPDATE ON "governance_meeting_actions" TO "beyu_runtime";
  END IF;
END $$;
