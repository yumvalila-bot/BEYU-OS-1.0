CREATE TABLE "governance_body_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"body_id" text NOT NULL,
	"authority_body_id" text NOT NULL,
	"command" text NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"body_revision" integer NOT NULL,
	"affected_party_ids" jsonb NOT NULL,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"document_id" text NOT NULL,
	"document_version" text NOT NULL,
	"document_checksum" text NOT NULL,
	"classification" "beyu_classification" NOT NULL,
	"rationale" text NOT NULL,
	"proposed_by_user_id" text NOT NULL,
	"proposed_by_party_id" text NOT NULL,
	"applied_by_party_id" text,
	"applied_by_user_id" text,
	"resolution_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "governance_body_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "governance_body_changes" ADD CONSTRAINT "governance_body_changes_body_id_governance_bodies_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."governance_bodies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_changes" ADD CONSTRAINT "governance_body_changes_authority_body_id_governance_bodies_id_fk" FOREIGN KEY ("authority_body_id") REFERENCES "public"."governance_bodies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_changes" ADD CONSTRAINT "governance_body_changes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_changes" ADD CONSTRAINT "governance_body_changes_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_changes" ADD CONSTRAINT "governance_body_changes_proposed_by_party_id_parties_id_fk" FOREIGN KEY ("proposed_by_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_changes" ADD CONSTRAINT "governance_body_changes_applied_by_party_id_parties_id_fk" FOREIGN KEY ("applied_by_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_changes" ADD CONSTRAINT "governance_body_changes_applied_by_user_id_users_id_fk" FOREIGN KEY ("applied_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_changes" ADD CONSTRAINT "governance_body_changes_resolution_id_resolutions_id_fk" FOREIGN KEY ("resolution_id") REFERENCES "public"."resolutions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE governance_body_changes FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_body_changes ADD CONSTRAINT governance_body_change_shape CHECK (
 body_revision>=0 AND jsonb_typeof(affected_party_ids)='array' AND document_checksum ~ '^[a-fA-F0-9]{64}$'
 AND authority_body_id<>body_id AND status IN ('PROPOSED','APPLIED')
 AND ((command='SUSPEND' AND from_status='ACTIVE' AND to_status='SUSPENDED')
 OR (command='RESUME' AND from_status='SUSPENDED' AND to_status='ACTIVE')
 OR (command='DISSOLVE' AND from_status IN ('ACTIVE','SUSPENDED') AND to_status='RETIRED')
 OR (command='ARCHIVE' AND from_status='RETIRED' AND to_status='RETIRED'))
 AND ((status='PROPOSED' AND applied_by_user_id IS NULL AND applied_by_party_id IS NULL AND applied_at IS NULL AND resolution_id IS NULL)
 OR (status='APPLIED' AND applied_by_user_id IS NOT NULL AND applied_by_party_id IS NOT NULL AND applied_at IS NOT NULL AND resolution_id IS NOT NULL
 AND applied_by_user_id<>proposed_by_user_id AND applied_by_party_id<>proposed_by_party_id))
);
CREATE UNIQUE INDEX governance_body_change_applied_revision ON governance_body_changes(body_id,body_revision) WHERE status='APPLIED';
CREATE POLICY governance_body_change_scope ON governance_body_changes USING (
 current_setting('beyu.governance_actions_read',true)='on' AND classification::text=ANY(string_to_array(current_setting('beyu.governance_classifications',true),','))
 AND EXISTS(SELECT 1 FROM governance_bodies b WHERE b.id=body_id)
) WITH CHECK (
 current_setting('beyu.governance_actions_read',true)='on' AND classification::text=ANY(string_to_array(current_setting('beyu.governance_classifications',true),','))
 AND EXISTS(SELECT 1 FROM governance_bodies b WHERE b.id=body_id)
);
CREATE POLICY governance_body_change_no_delete ON governance_body_changes AS RESTRICTIVE FOR DELETE USING(false);
CREATE FUNCTION beyu_body_change_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text:=current_setting('beyu.body_change_actor',true); actor_party text; b governance_bodies; affected jsonb;
BEGIN
 SELECT * INTO b FROM governance_bodies WHERE id=NEW.body_id FOR UPDATE;
 IF NOT FOUND OR b.status::text<>NEW.from_status OR (SELECT count(*) FROM governance_body_changes WHERE body_id=b.id AND status='APPLIED')<>NEW.body_revision THEN
  RAISE EXCEPTION 'Exact current body status and lifecycle revision required' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM governance_body_changes WHERE body_id=b.id AND status='APPLIED' AND command='ARCHIVE') OR (NEW.command='ARCHIVE' AND NOT EXISTS(SELECT 1 FROM governance_body_changes WHERE body_id=b.id AND status='APPLIED' AND command='DISSOLVE')) THEN RAISE EXCEPTION 'Archival is terminal and requires recorded dissolution' USING ERRCODE='23514'; END IF;
 -- Match membership/charter lock order before checking live superior evidence.
 PERFORM 1 FROM governance_bodies WHERE id=NEW.authority_body_id FOR SHARE;
 PERFORM 1 FROM governance_members WHERE body_id=NEW.authority_body_id FOR SHARE;
 PERFORM 1 FROM constitution_articles WHERE article_no=1 AND status='ACTIVE' FOR SHARE;
 PERFORM 1 FROM documents WHERE id=NEW.document_id FOR SHARE;
 SELECT COALESCE(jsonb_agg(party_id ORDER BY party_id),'[]'::jsonb) INTO affected FROM (SELECT DISTINCT party_id FROM governance_members WHERE body_id=b.id) m;
 SELECT u.party_id INTO actor_party FROM users u WHERE u.id=actor AND u.status='ACTIVE' AND NOT u.is_service_account AND u.primary_tenant_id=b.tenant_id FOR SHARE;
 IF actor_party IS NULL OR affected ? actor_party OR NEW.affected_party_ids ? actor_party OR NOT EXISTS(SELECT 1 FROM constitution_articles WHERE article_no=1 AND status='ACTIVE' AND effective_from<=CURRENT_DATE) THEN
  RAISE EXCEPTION 'Current independent human and effective constitution required' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'PROPOSED' OR NEW.proposed_by_user_id IS DISTINCT FROM actor OR NEW.proposed_by_party_id IS DISTINCT FROM actor_party OR NEW.affected_party_ids IS DISTINCT FROM affected THEN
   RAISE EXCEPTION 'Exact non-authorizing human proposal and affected parties required' USING ERRCODE='23514'; END IF;
  NEW.created_at:=clock_timestamp();
 ELSE
  IF OLD.status<>'PROPOSED' OR NEW.status<>'APPLIED' OR (to_jsonb(NEW)-ARRAY['status','resolution_id','applied_by_user_id','applied_by_party_id','applied_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','resolution_id','applied_by_user_id','applied_by_party_id','applied_at']) THEN
   RAISE EXCEPTION 'Immutable body request/history changed' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM legal_entities le JOIN documents d ON d.tenant_id=le.tenant_id WHERE le.id=b.legal_entity_id AND le.tenant_id=b.tenant_id AND le.status='ACTIVE'
 AND d.id=NEW.document_id AND d.version=NEW.document_version AND d.checksum=NEW.document_checksum AND d.classification=NEW.classification
 AND d.authority_status='AUTHORITATIVE' AND d.superseded_by_id IS NULL AND (d.effective_date IS NULL OR d.effective_date<=CURRENT_DATE)
 AND (d.entity_scope IS NULL OR d.entity_scope='*' OR d.entity_scope=le.code) AND (d.jurisdiction_code IS NULL OR d.jurisdiction_code=le.country_code)) THEN
  RAISE EXCEPTION 'Current scoped body instrument required' USING ERRCODE='23514'; END IF;
 IF b.body_type<>'COMMITTEE' OR NOT EXISTS(SELECT 1 FROM governance_body_establishments e
 JOIN governance_bodies a ON a.id=e.parent_body_id AND a.id=NEW.authority_body_id AND a.status='ACTIVE' AND a.body_type IN ('BOARD','TRUSTEES') AND a.tenant_id=b.tenant_id AND a.legal_entity_id=b.legal_entity_id
 JOIN governance_members m ON m.body_id=a.id AND m.party_id=actor_party AND m.lifecycle_status='ACTIVE' AND m.seat_role IN ('CHAIR','SECRETARY') AND m.appointed_on<=CURRENT_DATE AND (m.retired_on IS NULL OR m.retired_on>=CURRENT_DATE)
 WHERE e.body_id=b.id AND e.status='ESTABLISHED') OR NOT beyu_current_body_composition_valid(NEW.authority_body_id) THEN
  RAISE EXCEPTION 'Current recorded superior presiding authority and composition required' USING ERRCODE='23514'; END IF;
 -- Termination must not silently strand outstanding mandates. Full classification
 -- coverage is necessary: absence behind RLS is not evidence of absence of work.
 IF NEW.command IN ('DISSOLVE','ARCHIVE') THEN
  IF NOT COALESCE(ARRAY['PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','HIGHLY_RESTRICTED'] <@ string_to_array(current_setting('beyu.governance_classifications',true),','),false) THEN
   RAISE EXCEPTION 'Full history clearance required for body wind-down' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM resolutions r WHERE r.body_id=b.id AND r.status NOT IN ('APPROVED','REJECTED','WITHDRAWN'))
   OR EXISTS(SELECT 1 FROM tasks t JOIN resolutions r ON r.id=t.source_resolution_id WHERE r.body_id=b.id AND t.status<>'CLOSED')
   OR EXISTS(SELECT 1 FROM governance_appointments a WHERE a.body_id=b.id AND a.status NOT IN ('ACTIVE','DECLINED'))
   OR EXISTS(SELECT 1 FROM foundation_meetings m WHERE m.governance_body_id=b.id AND m.status NOT IN ('COMPLETED','CANCELLED')) THEN
   RAISE EXCEPTION 'Outstanding decisions, actions, appointments or meetings must be resolved before body wind-down' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.status='APPLIED' THEN
  IF actor=NEW.proposed_by_user_id OR actor_party=NEW.proposed_by_party_id OR NEW.applied_by_user_id IS DISTINCT FROM actor OR (NEW.applied_by_party_id IS NOT NULL AND NEW.applied_by_party_id IS DISTINCT FROM actor_party)
   OR NOT EXISTS(SELECT 1 FROM resolutions r WHERE r.id=NEW.resolution_id AND r.body_id=NEW.authority_body_id AND r.status='APPROVED' AND r.category='RESERVED_MATTER'
   AND r.linked_object_type='GOVERNANCE_BODY_CHANGE' AND r.linked_object_id=NEW.id AND r.classification>=NEW.classification AND r.quorum_met AND r.decided_by_member_id IS NOT NULL AND r.decision_date IS NOT NULL
   AND EXISTS(SELECT 1 FROM enterprise_events ev WHERE ev.subject_id=r.id AND ev.tenant_id=r.tenant_id AND ev.type='GOVERNANCE_RESOLUTION_DECIDED'
    AND ev.payload->>'outcome'='APPROVED' AND ev.payload->>'decidedByMemberId'=r.decided_by_member_id
    AND ev.payload->>'decisionDate'=to_char(r.decision_date AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
   OR EXISTS(SELECT 1 FROM resolution_votes v JOIN governance_members m ON m.id=v.member_id WHERE v.resolution_id=NEW.resolution_id AND v.vote<>'RECUSED' AND (affected ? m.party_id OR NEW.affected_party_ids ? m.party_id)) THEN
   RAISE EXCEPTION 'Exact independent superior decision and affected-party recusal required' USING ERRCODE='23514'; END IF;
  NEW.applied_by_party_id:=actor_party;NEW.applied_at:=clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER governance_body_change_guard BEFORE INSERT OR UPDATE ON governance_body_changes FOR EACH ROW EXECUTE FUNCTION beyu_body_change_guard();
--> statement-breakpoint
CREATE FUNCTION beyu_body_change_matches(target_body text,target_status text) RETURNS boolean LANGUAGE sql AS $$
 SELECT EXISTS(SELECT 1 FROM governance_body_changes c WHERE c.id=current_setting('beyu.body_change_id',true) AND c.body_id=target_body AND c.to_status=target_status AND c.status='APPLIED'
 AND c.applied_by_user_id=current_setting('beyu.body_change_actor',true)
 AND c.body_revision+1=(SELECT count(*) FROM governance_body_changes h WHERE h.body_id=target_body AND h.status='APPLIED'));
$$;
-- Preserve the exact initial-activation alternative and the immutable metadata
-- guard. No INSERT, DELETE, finalized decision, membership or tenant gate changes.
DROP POLICY governance_bodies_no_update ON governance_bodies;
CREATE POLICY governance_bodies_no_update ON governance_bodies AS RESTRICTIVE FOR UPDATE USING(true) WITH CHECK (
 (status='ACTIVE' AND EXISTS(SELECT 1 FROM governance_body_activations p WHERE p.body_id=governance_bodies.id AND beyu_body_activation_matches(p.body_id,p.initial_charter_id)))
 OR beyu_body_change_matches(id,status::text)
);
CREATE OR REPLACE FUNCTION beyu_initial_body_active_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN RETURN NEW; END IF;
 IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'Body metadata/history remain immutable' USING ERRCODE='42501'; END IF;
 IF OLD.status='DRAFT' AND NEW.status='ACTIVE' AND EXISTS(SELECT 1 FROM governance_body_activations p WHERE p.body_id=NEW.id AND beyu_body_activation_matches(p.body_id,p.initial_charter_id)) THEN RETURN NEW; END IF;
 IF beyu_body_change_matches(NEW.id,NEW.status::text) AND EXISTS(SELECT 1 FROM governance_body_changes c WHERE c.id=current_setting('beyu.body_change_id',true) AND c.from_status=OLD.status::text) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Body update requires exact paired activation or lifecycle evidence' USING ERRCODE='42501';
END $$;
CREATE FUNCTION beyu_body_change_atomic() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c governance_body_changes;
BEGIN
 SELECT * INTO c FROM governance_body_changes WHERE id=NEW.id;
 IF c.status='APPLIED' AND (NOT EXISTS(SELECT 1 FROM governance_bodies b WHERE b.id=c.body_id AND b.status::text=c.to_status)
 OR (c.command='RESUME' AND NOT beyu_current_body_composition_valid(c.body_id))) THEN
  RAISE EXCEPTION 'Body lifecycle evidence and canonical status must commit atomically with valid resumption composition' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER governance_body_change_atomic AFTER INSERT OR UPDATE ON governance_body_changes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION beyu_body_change_atomic();
--> statement-breakpoint
-- Serialize current governed writes against body cessation, including raw SQL.
-- Historical SELECTs and final decision guards are untouched. Existing privileged
-- bootstrap/fixture maintenance remains separate from the runtime boundary.
CREATE FUNCTION beyu_governance_live_body_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bid text; state text;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='resolutions' THEN bid:=NEW.body_id;
 ELSIF TG_TABLE_NAME='resolution_votes' THEN SELECT body_id INTO bid FROM resolutions WHERE id=NEW.resolution_id;
 ELSIF TG_TABLE_NAME='tasks' THEN
  IF NEW.source_resolution_id IS NULL THEN RETURN NEW; END IF;
  SELECT body_id INTO bid FROM resolutions WHERE id=NEW.source_resolution_id;
 ELSE SELECT r.body_id INTO bid FROM tasks t JOIN resolutions r ON r.id=t.source_resolution_id WHERE t.id=NEW.task_id;
 END IF;
 SELECT status INTO state FROM governance_bodies WHERE id=bid FOR SHARE;
 IF state IS DISTINCT FROM 'ACTIVE' THEN RAISE EXCEPTION 'Current active body authority is required for this governed write' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER governance_live_resolution_body BEFORE INSERT OR UPDATE ON resolutions FOR EACH ROW EXECUTE FUNCTION beyu_governance_live_body_guard();
CREATE TRIGGER governance_live_ballot_body BEFORE INSERT OR UPDATE ON resolution_votes FOR EACH ROW EXECUTE FUNCTION beyu_governance_live_body_guard();
CREATE TRIGGER governance_live_task_body BEFORE INSERT OR UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION beyu_governance_live_body_guard();
CREATE TRIGGER governance_live_evidence_body BEFORE INSERT OR UPDATE ON governance_action_evidence FOR EACH ROW EXECUTE FUNCTION beyu_governance_live_body_guard();
