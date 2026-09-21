CREATE TABLE "governance_appointments" (
	"id" text PRIMARY KEY NOT NULL,
	"body_id" text NOT NULL,
	"nominee_user_id" text NOT NULL,
	"party_id" text NOT NULL,
	"seat_role" text NOT NULL,
	"voting_rights" boolean NOT NULL,
	"appointed_on" date NOT NULL,
	"retired_on" date NOT NULL,
	"document_id" text NOT NULL,
	"document_version" text NOT NULL,
	"document_checksum" text NOT NULL,
	"classification" "beyu_classification" NOT NULL,
	"rationale" text NOT NULL,
	"status" text DEFAULT 'NOMINATED' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"nominated_by_user_id" text NOT NULL,
	"approved_by_user_id" text,
	"resolution_id" text,
	"accepted_at" timestamp with time zone,
	"activated_by_user_id" text,
	"member_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "governance_appointments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "governance_appointments" ADD CONSTRAINT "governance_appointments_body_id_governance_bodies_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."governance_bodies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_appointments" ADD CONSTRAINT "governance_appointments_nominee_user_id_users_id_fk" FOREIGN KEY ("nominee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_appointments" ADD CONSTRAINT "governance_appointments_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_appointments" ADD CONSTRAINT "governance_appointments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_appointments" ADD CONSTRAINT "governance_appointments_nominated_by_user_id_users_id_fk" FOREIGN KEY ("nominated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_appointments" ADD CONSTRAINT "governance_appointments_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_appointments" ADD CONSTRAINT "governance_appointments_resolution_id_resolutions_id_fk" FOREIGN KEY ("resolution_id") REFERENCES "public"."resolutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_appointments" ADD CONSTRAINT "governance_appointments_activated_by_user_id_users_id_fk" FOREIGN KEY ("activated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "governance_appointments_member_uidx" ON "governance_appointments" USING btree ("member_id");
--> statement-breakpoint
ALTER TABLE governance_appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_appointments ADD CONSTRAINT governance_appointment_shape CHECK (
 revision>0 AND retired_on>=appointed_on AND document_checksum ~ '^[a-fA-F0-9]{64}$'
 AND seat_role IN ('CHAIR','VICE_CHAIR','SECRETARY','TREASURER','MEMBER','INDEPENDENT_MEMBER','COMMITTEE_MEMBER','OBSERVER')
 AND NOT (seat_role='OBSERVER' AND voting_rights)
 AND status IN ('NOMINATED','APPROVED','ACCEPTED','ACTIVE','DECLINED')
 AND nominated_by_user_id<>nominee_user_id
 AND (status='NOMINATED' OR (resolution_id IS NOT NULL AND approved_by_user_id IS NOT NULL AND approved_by_user_id<>nominee_user_id AND approved_by_user_id<>nominated_by_user_id))
 AND (status NOT IN ('ACCEPTED','ACTIVE') OR accepted_at IS NOT NULL)
 AND ((status='ACTIVE' AND member_id IS NOT NULL AND activated_by_user_id IS NOT NULL AND activated_by_user_id<>nominee_user_id)
   OR (status<>'ACTIVE' AND member_id IS NULL AND activated_by_user_id IS NULL))
);
CREATE POLICY governance_appointments_scope ON governance_appointments USING (
 current_setting('beyu.governance_actions_read',true)='on'
 AND classification::text=ANY(string_to_array(current_setting('beyu.governance_classifications',true),','))
 AND EXISTS(SELECT 1 FROM governance_bodies b WHERE b.id=body_id)
) WITH CHECK (
 current_setting('beyu.governance_actions_read',true)='on'
 AND classification::text=ANY(string_to_array(current_setting('beyu.governance_classifications',true),','))
 AND EXISTS(SELECT 1 FROM governance_bodies b WHERE b.id=body_id)
);
CREATE POLICY governance_appointments_no_delete ON governance_appointments AS RESTRICTIVE FOR DELETE USING(false);
--> statement-breakpoint
CREATE FUNCTION beyu_governance_appointment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text := current_setting('beyu.governance_appointment_actor',true);
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'NOMINATED' OR NEW.revision<>1 OR NEW.approved_by_user_id IS NOT NULL OR NEW.resolution_id IS NOT NULL OR NEW.accepted_at IS NOT NULL
   OR actor IS DISTINCT FROM NEW.nominated_by_user_id THEN RAISE EXCEPTION 'Nomination must start without authority' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.status IN ('ACTIVE','DECLINED') OR NEW.revision<>OLD.revision+1 OR NOT (
   (OLD.status='NOMINATED' AND NEW.status='APPROVED' AND actor=NEW.approved_by_user_id)
   OR (OLD.status='APPROVED' AND NEW.status IN ('ACCEPTED','DECLINED') AND actor=NEW.nominee_user_id)
   OR (OLD.status='ACCEPTED' AND NEW.status='DECLINED' AND actor=NEW.nominee_user_id)
   OR (OLD.status='ACCEPTED' AND NEW.status='ACTIVE' AND actor=NEW.activated_by_user_id)) OR actor IS NULL THEN
   RAISE EXCEPTION 'Invalid appointment transition or actor' USING ERRCODE='23514'; END IF;
  IF ROW(NEW.id,NEW.body_id,NEW.nominee_user_id,NEW.party_id,NEW.seat_role,NEW.voting_rights,NEW.appointed_on,NEW.retired_on,NEW.document_id,NEW.document_version,NEW.document_checksum,NEW.classification,NEW.rationale,NEW.nominated_by_user_id,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.body_id,OLD.nominee_user_id,OLD.party_id,OLD.seat_role,OLD.voting_rights,OLD.appointed_on,OLD.retired_on,OLD.document_id,OLD.document_version,OLD.document_checksum,OLD.classification,OLD.rationale,OLD.nominated_by_user_id,OLD.created_at)
   OR (OLD.status<>'NOMINATED' AND ROW(NEW.resolution_id,NEW.approved_by_user_id) IS DISTINCT FROM ROW(OLD.resolution_id,OLD.approved_by_user_id))
   OR (OLD.status<>'APPROVED' AND NEW.accepted_at IS DISTINCT FROM OLD.accepted_at)
   OR (NEW.status<>'ACCEPTED' AND OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Immutable appointment terms/provenance changed' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM users u JOIN governance_bodies b ON b.id=NEW.body_id
  JOIN legal_entities le ON le.id=b.legal_entity_id JOIN documents d ON d.tenant_id=b.tenant_id
  WHERE u.id=NEW.nominee_user_id AND u.party_id=NEW.party_id AND u.primary_tenant_id=b.tenant_id AND u.status='ACTIVE' AND NOT u.is_service_account
  AND d.id=NEW.document_id AND d.version=NEW.document_version AND d.checksum=NEW.document_checksum AND d.classification=NEW.classification
  AND d.authority_status='AUTHORITATIVE' AND d.superseded_by_id IS NULL
  AND (d.effective_date IS NULL OR d.effective_date<=CURRENT_DATE)
  AND (d.entity_scope IS NULL OR d.entity_scope='*' OR d.entity_scope=le.code)
  AND (d.jurisdiction_code IS NULL OR d.jurisdiction_code=le.country_code)) THEN
  RAISE EXCEPTION 'Current scoped instrument and human identity required' USING ERRCODE='23514'; END IF;
 IF NEW.status<>'NOMINATED' AND NOT EXISTS(SELECT 1 FROM resolutions r WHERE r.id=NEW.resolution_id AND r.body_id=NEW.body_id AND r.status='APPROVED'
  AND r.category='APPOINTMENT' AND r.classification>=NEW.classification AND r.linked_object_type='GOVERNANCE_APPOINTMENT' AND r.linked_object_id=NEW.id
  AND r.quorum_met AND r.decided_by_member_id IS NOT NULL AND r.decision_date IS NOT NULL) THEN
  RAISE EXCEPTION 'Nomination-specific decision required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER governance_appointment_guard BEFORE INSERT OR UPDATE ON governance_appointments FOR EACH ROW EXECUTE FUNCTION beyu_governance_appointment_guard();
--> statement-breakpoint
-- Replace only the unconditional INSERT denial with a narrow, decision-backed
-- activation gate. 0048 history, body rules, membership UPDATE/DELETE denials,
-- final ballot/resolution protection and every tenant/entity policy remain intact.
DROP POLICY governance_members_read_only ON governance_members;
CREATE POLICY governance_members_read_only ON governance_members AS RESTRICTIVE FOR INSERT WITH CHECK (
 EXISTS(SELECT 1 FROM governance_appointments a WHERE a.id=current_setting('beyu.governance_appointment_id',true)
  AND a.status='ACTIVE' AND a.activated_by_user_id=current_setting('beyu.governance_appointment_actor',true)
  AND a.member_id=governance_members.id AND a.body_id=governance_members.body_id AND a.party_id=governance_members.party_id
  AND a.seat_role=governance_members.seat_role AND a.voting_rights=governance_members.voting_rights
  AND a.appointed_on=governance_members.appointed_on AND a.retired_on=governance_members.retired_on
  AND a.appointed_on>=CURRENT_DATE)
);
-- An ACTIVE record and its exact canonical membership must commit atomically.
CREATE FUNCTION beyu_governance_appointment_activation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM governance_appointments a WHERE a.id=NEW.id AND a.status='ACTIVE' AND NOT EXISTS(
  SELECT 1 FROM governance_members m WHERE m.id=a.member_id AND m.body_id=a.body_id AND m.party_id=a.party_id AND m.seat_role=a.seat_role
   AND m.voting_rights=a.voting_rights AND m.appointed_on=a.appointed_on AND m.retired_on=a.retired_on)) THEN
  RAISE EXCEPTION 'Active appointment requires its exact canonical member' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER governance_appointment_activation AFTER INSERT OR UPDATE ON governance_appointments
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION beyu_governance_appointment_activation();
