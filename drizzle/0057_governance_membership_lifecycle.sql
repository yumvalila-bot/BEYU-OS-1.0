CREATE TABLE "governance_membership_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"body_id" text NOT NULL,
	"member_id" text NOT NULL,
	"authority_body_id" text NOT NULL,
	"command" text NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"member_revision" integer NOT NULL,
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
ALTER TABLE "governance_membership_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "governance_members" ADD COLUMN "lifecycle_status" text DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "governance_members" ADD COLUMN "lifecycle_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "governance_membership_changes" ADD CONSTRAINT "governance_membership_changes_body_id_governance_bodies_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."governance_bodies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_membership_changes" ADD CONSTRAINT "governance_membership_changes_member_id_governance_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."governance_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_membership_changes" ADD CONSTRAINT "governance_membership_changes_authority_body_id_governance_bodies_id_fk" FOREIGN KEY ("authority_body_id") REFERENCES "public"."governance_bodies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_membership_changes" ADD CONSTRAINT "governance_membership_changes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_membership_changes" ADD CONSTRAINT "governance_membership_changes_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_membership_changes" ADD CONSTRAINT "governance_membership_changes_proposed_by_party_id_parties_id_fk" FOREIGN KEY ("proposed_by_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_membership_changes" ADD CONSTRAINT "governance_membership_changes_applied_by_party_id_parties_id_fk" FOREIGN KEY ("applied_by_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_membership_changes" ADD CONSTRAINT "governance_membership_changes_applied_by_user_id_users_id_fk" FOREIGN KEY ("applied_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_membership_changes" ADD CONSTRAINT "governance_membership_changes_resolution_id_resolutions_id_fk" FOREIGN KEY ("resolution_id") REFERENCES "public"."resolutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE governance_members ADD CONSTRAINT governance_member_lifecycle_shape CHECK (lifecycle_status IN ('ACTIVE','SUSPENDED','RESIGNED','REMOVED') AND lifecycle_revision>=0);
ALTER TABLE governance_membership_changes FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_membership_changes ADD CONSTRAINT governance_membership_change_shape CHECK (
 member_revision>=0 AND document_checksum ~ '^[a-fA-F0-9]{64}$' AND status IN ('PROPOSED','APPLIED')
 AND ((command='RESIGN' AND from_status IN ('ACTIVE','SUSPENDED') AND to_status='RESIGNED' AND authority_body_id=body_id AND status='APPLIED' AND resolution_id IS NULL AND applied_by_user_id=proposed_by_user_id)
 OR (command='SUSPEND' AND from_status='ACTIVE' AND to_status='SUSPENDED' AND authority_body_id<>body_id)
 OR (command='REMOVE' AND from_status IN ('ACTIVE','SUSPENDED') AND to_status='REMOVED' AND authority_body_id<>body_id)
 OR (command='REINSTATE' AND from_status='SUSPENDED' AND to_status='ACTIVE' AND authority_body_id<>body_id))
 AND ((status='APPLIED' AND applied_at IS NOT NULL AND applied_by_user_id IS NOT NULL AND applied_by_party_id IS NOT NULL AND (command='RESIGN' OR (resolution_id IS NOT NULL AND applied_by_user_id<>proposed_by_user_id AND applied_by_party_id<>proposed_by_party_id)))
 OR (status='PROPOSED' AND applied_at IS NULL AND applied_by_user_id IS NULL AND applied_by_party_id IS NULL AND resolution_id IS NULL))
);
CREATE UNIQUE INDEX governance_membership_change_applied_revision ON governance_membership_changes(member_id,member_revision) WHERE status='APPLIED';
CREATE POLICY governance_membership_change_scope ON governance_membership_changes USING (
 current_setting('beyu.governance_actions_read',true)='on' AND classification::text=ANY(string_to_array(current_setting('beyu.governance_classifications',true),','))
 AND EXISTS(SELECT 1 FROM governance_bodies b WHERE b.id=body_id)
) WITH CHECK (
 current_setting('beyu.governance_actions_read',true)='on' AND classification::text=ANY(string_to_array(current_setting('beyu.governance_classifications',true),','))
 AND EXISTS(SELECT 1 FROM governance_bodies b WHERE b.id=body_id)
);
CREATE POLICY governance_membership_change_no_delete ON governance_membership_changes AS RESTRICTIVE FOR DELETE USING(false);
CREATE FUNCTION beyu_membership_change_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text:=current_setting('beyu.membership_actor',true); actor_party text; m governance_members;
BEGIN
 SELECT * INTO m FROM governance_members WHERE id=NEW.member_id AND body_id=NEW.body_id;
 IF NOT FOUND OR m.lifecycle_status<>NEW.from_status OR m.lifecycle_revision<>NEW.member_revision OR m.appointed_on>CURRENT_DATE OR m.retired_on<CURRENT_DATE THEN
  RAISE EXCEPTION 'Current exact membership revision and term required' USING ERRCODE='23514'; END IF;
 SELECT u.party_id INTO actor_party FROM users u JOIN governance_bodies b ON b.id=NEW.body_id
 WHERE u.id=actor AND u.status='ACTIVE' AND NOT u.is_service_account AND u.primary_tenant_id=b.tenant_id FOR SHARE OF u;
 IF actor_party IS NULL OR NOT EXISTS(SELECT 1 FROM constitution_articles WHERE article_no=1 AND status='ACTIVE') THEN RAISE EXCEPTION 'Current human and constitution required' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.proposed_by_user_id IS DISTINCT FROM actor OR NEW.proposed_by_party_id IS DISTINCT FROM actor_party OR (NEW.command<>'RESIGN' AND NEW.status<>'PROPOSED') THEN RAISE EXCEPTION 'Immutable human proposal required' USING ERRCODE='23514'; END IF;
  NEW.created_at:=clock_timestamp();
 ELSE
  IF OLD.status<>'PROPOSED' OR NEW.status<>'APPLIED' OR (to_jsonb(NEW)-ARRAY['status','resolution_id','applied_by_user_id','applied_by_party_id','applied_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','resolution_id','applied_by_user_id','applied_by_party_id','applied_at']) THEN
   RAISE EXCEPTION 'Immutable membership request/history changed' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM governance_bodies b JOIN legal_entities le ON le.id=b.legal_entity_id AND le.tenant_id=b.tenant_id AND le.status='ACTIVE'
 JOIN documents d ON d.tenant_id=b.tenant_id WHERE b.id=NEW.body_id AND d.id=NEW.document_id AND d.version=NEW.document_version AND d.checksum=NEW.document_checksum AND d.classification=NEW.classification
 AND d.authority_status='AUTHORITATIVE' AND d.superseded_by_id IS NULL AND (d.effective_date IS NULL OR d.effective_date<=CURRENT_DATE)
 AND (d.entity_scope IS NULL OR d.entity_scope='*' OR d.entity_scope=le.code) AND (d.jurisdiction_code IS NULL OR d.jurisdiction_code=le.country_code)) THEN RAISE EXCEPTION 'Current scoped membership instrument required' USING ERRCODE='23514'; END IF;
 IF NEW.command='RESIGN' THEN
  IF actor_party IS DISTINCT FROM m.party_id OR NEW.applied_by_user_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Only the identified member can resign' USING ERRCODE='23514'; END IF;
 ELSE
  IF actor_party=m.party_id OR NOT EXISTS(SELECT 1 FROM governance_bodies b JOIN governance_body_establishments e ON e.body_id=b.id AND e.status='ESTABLISHED'
   JOIN governance_bodies a ON a.id=e.parent_body_id AND a.id=NEW.authority_body_id AND a.status='ACTIVE' AND a.body_type IN ('BOARD','TRUSTEES') AND a.tenant_id=b.tenant_id AND a.legal_entity_id=b.legal_entity_id
   JOIN governance_members presider ON presider.body_id=a.id AND presider.party_id=actor_party
   WHERE b.id=NEW.body_id AND b.status='ACTIVE' AND b.body_type='COMMITTEE' AND presider.lifecycle_status='ACTIVE' AND presider.seat_role IN ('CHAIR','SECRETARY') AND presider.appointed_on<=CURRENT_DATE AND (presider.retired_on IS NULL OR presider.retired_on>=CURRENT_DATE))
   OR NOT beyu_current_body_composition_valid(NEW.authority_body_id) THEN RAISE EXCEPTION 'Current independent superior presider required' USING ERRCODE='23514'; END IF;
  IF NEW.status='APPLIED' AND (actor=NEW.proposed_by_user_id OR actor_party=NEW.proposed_by_party_id OR NEW.applied_by_user_id IS DISTINCT FROM actor OR NOT EXISTS(
   SELECT 1 FROM resolutions r WHERE r.id=NEW.resolution_id AND r.body_id=NEW.authority_body_id AND r.status='APPROVED' AND r.category='RESERVED_MATTER' AND r.linked_object_type='GOVERNANCE_MEMBERSHIP_CHANGE' AND r.linked_object_id=NEW.id
   AND r.classification>=NEW.classification AND r.quorum_met AND r.decided_by_member_id IS NOT NULL AND r.decision_date IS NOT NULL)
   OR EXISTS(SELECT 1 FROM resolution_votes v JOIN governance_members affected ON affected.id=v.member_id WHERE v.resolution_id=NEW.resolution_id AND affected.party_id=m.party_id AND v.vote<>'RECUSED')) THEN
   RAISE EXCEPTION 'Exact independent superior decision and affected-party recusal required' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.status='APPLIED' THEN
  IF NEW.applied_by_party_id IS NOT NULL AND NEW.applied_by_party_id IS DISTINCT FROM actor_party THEN RAISE EXCEPTION 'Applied human party must match the current actor' USING ERRCODE='23514'; END IF;
  NEW.applied_by_party_id:=actor_party; NEW.applied_at:=clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER governance_membership_change_guard BEFORE INSERT OR UPDATE ON governance_membership_changes FOR EACH ROW EXECUTE FUNCTION beyu_membership_change_guard();
--> statement-breakpoint
-- The sole UPDATE exception is an exact paired lifecycle projection; all original
-- seat, party, body, voting rights, dates and historical appointment evidence stay immutable.
DROP POLICY governance_members_no_update ON governance_members;
CREATE POLICY governance_members_no_update ON governance_members AS RESTRICTIVE FOR UPDATE USING(true) WITH CHECK (
 EXISTS(SELECT 1 FROM governance_membership_changes c WHERE c.id=current_setting('beyu.membership_change_id',true) AND c.status='APPLIED'
 AND c.member_id=governance_members.id AND c.body_id=governance_members.body_id AND c.to_status=governance_members.lifecycle_status
 AND c.member_revision+1=governance_members.lifecycle_revision AND c.applied_by_user_id=current_setting('beyu.membership_actor',true))
);
CREATE FUNCTION beyu_member_projection_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.lifecycle_status<>'ACTIVE' OR NEW.lifecycle_revision<>0 THEN RAISE EXCEPTION 'Membership must start active with no invented history' USING ERRCODE='23514'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW)-ARRAY['lifecycle_status','lifecycle_revision']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['lifecycle_status','lifecycle_revision']) OR NOT EXISTS(
   SELECT 1 FROM governance_membership_changes c WHERE c.id=current_setting('beyu.membership_change_id',true) AND c.status='APPLIED'
    AND c.member_id=NEW.id AND c.body_id=NEW.body_id AND c.from_status=OLD.lifecycle_status AND c.to_status=NEW.lifecycle_status
    AND c.member_revision=OLD.lifecycle_revision AND c.member_revision+1=NEW.lifecycle_revision AND c.applied_by_user_id=current_setting('beyu.membership_actor',true)) THEN
   RAISE EXCEPTION 'Membership updates require an exact immutable lifecycle decision' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER governance_member_projection_guard BEFORE INSERT OR UPDATE ON governance_members FOR EACH ROW EXECUTE FUNCTION beyu_member_projection_guard();
CREATE FUNCTION beyu_membership_change_atomic() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c governance_membership_changes;
BEGIN
 SELECT * INTO c FROM governance_membership_changes WHERE id=NEW.id;
 IF c.status='APPLIED' AND (NOT EXISTS(SELECT 1 FROM governance_members m WHERE m.id=c.member_id AND m.body_id=c.body_id AND m.lifecycle_revision=c.member_revision+1 AND m.lifecycle_status=c.to_status)
 OR (c.command='REINSTATE' AND NOT beyu_current_body_composition_valid(c.body_id))) THEN
  RAISE EXCEPTION 'Lifecycle evidence and exact canonical membership must commit atomically with valid reinstatement composition' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER governance_membership_change_atomic AFTER INSERT OR UPDATE ON governance_membership_changes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION beyu_membership_change_atomic();

--> statement-breakpoint
-- Preserve all original controls, additionally excluding inactive lifecycle seats.
CREATE OR REPLACE FUNCTION beyu_body_establishment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text := current_setting('beyu.body_establishment_actor',true);
BEGIN
 IF actor IS NULL OR actor='' OR NOT EXISTS(SELECT 1 FROM users u JOIN governance_members m ON m.party_id=u.party_id
   WHERE u.id=actor AND u.status='ACTIVE' AND NOT u.is_service_account AND m.body_id=NEW.parent_body_id
   AND m.seat_role IN ('CHAIR','SECRETARY') AND m.lifecycle_status='ACTIVE' AND m.appointed_on<=CURRENT_DATE AND (m.retired_on IS NULL OR m.retired_on>=CURRENT_DATE)) THEN
  RAISE EXCEPTION 'Current human superior presider required' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' OR NEW.revision<>1 OR NEW.proposed_by_user_id IS DISTINCT FROM actor
   OR NOT EXISTS(SELECT 1 FROM users WHERE id=actor AND party_id=NEW.proposed_by_party_id) THEN
   RAISE EXCEPTION 'Establishment must begin as a non-authorizing proposal' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.status='ESTABLISHED' OR NEW.revision<>OLD.revision+1 OR NOT (
   (OLD.status='DRAFT' AND NEW.status='IN_REVIEW') OR
   (OLD.status='IN_REVIEW' AND NEW.status='APPROVED' AND NEW.approved_by_user_id=actor) OR
   (OLD.status='APPROVED' AND NEW.status='ESTABLISHED')) THEN
   RAISE EXCEPTION 'Invalid establishment transition' USING ERRCODE='23514'; END IF;
  IF ROW(NEW.id,NEW.parent_body_id,NEW.parent_charter_id,NEW.code,NEW.name,NEW.purpose,NEW.document_id,NEW.document_version,NEW.document_checksum,NEW.classification,NEW.rules,NEW.reserved_matters,NEW.proposed_by_user_id,NEW.proposed_by_party_id,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.parent_body_id,OLD.parent_charter_id,OLD.code,OLD.name,OLD.purpose,OLD.document_id,OLD.document_version,OLD.document_checksum,OLD.classification,OLD.rules,OLD.reserved_matters,OLD.proposed_by_user_id,OLD.proposed_by_party_id,OLD.created_at)
    OR (OLD.status='APPROVED' AND ROW(NEW.approved_by_user_id,NEW.resolution_id) IS DISTINCT FROM ROW(OLD.approved_by_user_id,OLD.resolution_id)) THEN
   RAISE EXCEPTION 'Immutable establishment terms changed' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM governance_bodies b JOIN legal_entities le ON le.id=b.legal_entity_id
  JOIN governance_charters c ON c.id=NEW.parent_charter_id AND c.body_id=b.id AND c.status='ADOPTED'
  JOIN documents d ON d.id=NEW.document_id AND d.tenant_id=b.tenant_id
  WHERE b.id=NEW.parent_body_id AND b.status='ACTIVE' AND b.body_type IN ('BOARD','TRUSTEES') AND le.status='ACTIVE' AND le.tenant_id=b.tenant_id
   AND (NEW.rules->>'quorumMinimum')=b.quorum_minimum::text AND (NEW.rules->>'majorityRule')=b.majority_rule AND NEW.reserved_matters=b.reserved_matters
   AND NOT EXISTS(SELECT 1 FROM governance_charters newer WHERE newer.body_id=b.id AND newer.status='ADOPTED' AND newer.version>c.version)
   AND d.version=NEW.document_version AND d.checksum=NEW.document_checksum AND d.classification=NEW.classification
   AND d.authority_status='AUTHORITATIVE' AND d.superseded_by_id IS NULL AND (d.effective_date IS NULL OR d.effective_date<=CURRENT_DATE)
   AND (d.entity_scope IS NULL OR d.entity_scope='*' OR d.entity_scope=le.code) AND (d.jurisdiction_code IS NULL OR d.jurisdiction_code=le.country_code)) THEN
  RAISE EXCEPTION 'Current scoped superior charter and instrument required' USING ERRCODE='23514'; END IF;
 IF NEW.status IN ('APPROVED','ESTABLISHED') THEN
  IF EXISTS(SELECT 1 FROM users WHERE id=actor AND party_id=NEW.proposed_by_party_id) THEN
   RAISE EXCEPTION 'Independent establishment authority required' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM resolutions r WHERE r.id=NEW.resolution_id AND r.body_id=NEW.parent_body_id AND r.status='APPROVED'
    AND r.category='RESERVED_MATTER' AND r.linked_object_type='GOVERNANCE_BODY_ESTABLISHMENT' AND r.linked_object_id=NEW.id
    AND r.quorum_met AND r.decided_by_member_id IS NOT NULL AND r.decision_date IS NOT NULL AND r.classification>=NEW.classification) THEN
   RAISE EXCEPTION 'Superior establishment decision required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

--> statement-breakpoint
-- Preserve all original controls, additionally excluding inactive lifecycle seats.
CREATE OR REPLACE FUNCTION beyu_governance_charter_authority_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text := current_setting('beyu.governance_charter_actor',true);
BEGIN
 IF NEW.authority_body_id IS NULL OR NEW.created_by_party_id IS NULL THEN
  RAISE EXCEPTION 'Recorded charter authority and original author party are required; create a new version' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.created_by_user_id IS DISTINCT FROM actor OR NOT EXISTS(SELECT 1 FROM users u WHERE u.id=actor AND u.party_id=NEW.created_by_party_id) THEN
   RAISE EXCEPTION 'Charter author snapshot must match the current actor' USING ERRCODE='23514'; END IF;
 ELSE
  IF ROW(NEW.authority_body_id,NEW.created_by_party_id) IS DISTINCT FROM ROW(OLD.authority_body_id,OLD.created_by_party_id) THEN
   RAISE EXCEPTION 'Immutable charter authority/author snapshot changed' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM users u JOIN governance_members m ON m.party_id=u.party_id
   JOIN governance_bodies a ON a.id=m.body_id JOIN legal_entities le ON le.id=a.legal_entity_id
   WHERE u.id=actor AND u.status='ACTIVE' AND NOT u.is_service_account AND a.id=NEW.authority_body_id AND a.status='ACTIVE'
    AND le.status='ACTIVE' AND le.tenant_id=a.tenant_id AND m.seat_role IN ('CHAIR','SECRETARY')
    AND m.lifecycle_status='ACTIVE' AND m.appointed_on<=CURRENT_DATE AND (m.retired_on IS NULL OR m.retired_on>=CURRENT_DATE)) THEN
  RAISE EXCEPTION 'Current human charter presider required' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM governance_bodies b WHERE b.id=NEW.body_id AND (
   (b.status='ACTIVE' AND NEW.authority_body_id=b.id AND NEW.status<>'APPROVED') OR
   (b.status='DRAFT' AND b.body_type='COMMITTEE' AND NEW.status<>'ADOPTED' AND EXISTS(
    SELECT 1 FROM governance_body_establishments e JOIN governance_bodies a ON a.id=e.parent_body_id
    JOIN governance_charters c ON c.body_id=a.id AND c.status='ADOPTED'
    JOIN governance_charter_terms t ON t.id=c.id
    WHERE e.body_id=b.id AND e.status='ESTABLISHED' AND a.id=NEW.authority_body_id
     AND a.body_type IN ('BOARD','TRUSTEES') AND a.tenant_id=b.tenant_id AND a.legal_entity_id=b.legal_entity_id
     AND NOT EXISTS(SELECT 1 FROM governance_charters newer WHERE newer.body_id=a.id AND newer.status='ADOPTED' AND newer.version>c.version)
   )))) THEN
  RAISE EXCEPTION 'Recorded superior authority required for a dormant child; no self-bootstrap' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND NOT EXISTS(SELECT 1 FROM governance_charter_terms t
   JOIN governance_bodies b ON b.id=NEW.body_id JOIN legal_entities le ON le.id=b.legal_entity_id
   JOIN documents d ON d.id=t.document_id AND d.tenant_id=b.tenant_id
   WHERE t.id=NEW.id AND d.version=t.document_version AND d.checksum=t.document_checksum AND d.classification=t.classification
    AND d.authority_status='AUTHORITATIVE' AND d.superseded_by_id IS NULL AND (d.effective_date IS NULL OR d.effective_date<=CURRENT_DATE)
    AND (d.entity_scope IS NULL OR d.entity_scope='*' OR d.entity_scope=le.code) AND (d.jurisdiction_code IS NULL OR d.jurisdiction_code=le.country_code)
    AND t.rules->>'quorumMinimum'=b.quorum_minimum::text AND t.rules->>'majorityRule'=b.majority_rule) THEN
  RAISE EXCEPTION 'Current scoped charter instrument and canonical voting rules required' USING ERRCODE='23514'; END IF;
 IF NEW.status IN ('APPROVED','ADOPTED') THEN
  IF NEW.adopted_by_user_id IS DISTINCT FROM actor OR EXISTS(SELECT 1 FROM users u WHERE u.id=actor AND u.party_id=NEW.created_by_party_id) THEN
   RAISE EXCEPTION 'Independent charter approval required' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM resolutions r JOIN governance_charter_terms t ON t.id=NEW.id
   WHERE r.id=NEW.resolution_id AND r.classification>=t.classification) THEN
   RAISE EXCEPTION 'Charter decision must cover classified terms' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

--> statement-breakpoint
-- Preserve all original controls, additionally excluding inactive lifecycle seats.
CREATE OR REPLACE FUNCTION beyu_governance_initial_appointment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.authority_body_id,NEW.initial_charter_id) IS DISTINCT FROM ROW(OLD.authority_body_id,OLD.initial_charter_id) THEN
  RAISE EXCEPTION 'Immutable appointment authority/charter changed' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.authority_body_id IS NULL THEN
  RAISE EXCEPTION 'Recorded appointment authority is required' USING ERRCODE='23514'; END IF;
 IF NEW.initial_charter_id IS NULL THEN
  IF COALESCE(NEW.authority_body_id,NEW.body_id)<>NEW.body_id OR NOT EXISTS(SELECT 1 FROM governance_bodies b WHERE b.id=NEW.body_id AND b.status='ACTIVE') THEN
   RAISE EXCEPTION 'Ordinary appointments require their own active governing body' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.status='ACTIVE' OR NEW.member_id IS NOT NULL OR NEW.activated_by_user_id IS NOT NULL THEN
  IF NOT beyu_body_activation_matches(NEW.body_id,NEW.initial_charter_id) OR NOT EXISTS(
   SELECT 1 FROM governance_body_activations p WHERE p.id=current_setting('beyu.body_activation_id',true)
    AND p.authority_body_id=NEW.authority_body_id AND p.nomination_ids ? NEW.id
    AND NEW.activated_by_user_id=p.activated_by_user_id AND NEW.status='ACTIVE'
  ) THEN RAISE EXCEPTION 'Initial appointments cannot individually activate membership or a body' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 -- Withdrawal is not a grant; stale initial terms cannot trap a nominee in consent.
 IF NEW.status='DECLINED' THEN RETURN NEW; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM governance_bodies b
  JOIN governance_body_establishments e ON e.body_id=b.id AND e.status='ESTABLISHED'
  JOIN governance_bodies a ON a.id=e.parent_body_id AND a.id=NEW.authority_body_id
  JOIN legal_entities le ON le.id=b.legal_entity_id AND le.tenant_id=b.tenant_id AND le.status='ACTIVE'
  JOIN governance_charters c ON c.id=NEW.initial_charter_id AND c.body_id=b.id
  JOIN governance_charter_terms t ON t.id=c.id
  JOIN documents d ON d.id=t.document_id AND d.tenant_id=b.tenant_id
  WHERE b.id=NEW.body_id AND b.status='DRAFT' AND b.body_type='COMMITTEE'
   AND a.status='ACTIVE' AND a.body_type IN ('BOARD','TRUSTEES') AND a.tenant_id=b.tenant_id AND a.legal_entity_id=b.legal_entity_id
   AND c.status='APPROVED' AND c.authority_body_id=a.id AND c.created_by_party_id IS NOT NULL
   AND t.classification<=NEW.classification AND t.rules->>'quorumMinimum'=b.quorum_minimum::text AND t.rules->>'majorityRule'=b.majority_rule
   AND d.version=t.document_version AND d.checksum=t.document_checksum AND d.classification=t.classification
   AND d.authority_status='AUTHORITATIVE' AND d.superseded_by_id IS NULL AND (d.effective_date IS NULL OR d.effective_date<=CURRENT_DATE)
   AND (d.entity_scope IS NULL OR d.entity_scope='*' OR d.entity_scope=le.code) AND (d.jurisdiction_code IS NULL OR d.jurisdiction_code=le.country_code)
   AND NOT EXISTS(SELECT 1 FROM governance_charters newer WHERE newer.body_id=b.id AND newer.status IN ('APPROVED','ADOPTED') AND newer.version>c.version)
   AND EXISTS(SELECT 1 FROM governance_charters pc JOIN governance_charter_terms pt ON pt.id=pc.id WHERE pc.body_id=a.id AND pc.status='ADOPTED')
 ) THEN RAISE EXCEPTION 'Current superior-approved initial charter and scoped establishment required' USING ERRCODE='23514'; END IF;
 IF NEW.status IN ('NOMINATED','APPROVED') AND NOT EXISTS(
  SELECT 1 FROM users u JOIN governance_members m ON m.party_id=u.party_id
  WHERE u.id=current_setting('beyu.governance_appointment_actor',true) AND u.status='ACTIVE' AND NOT u.is_service_account
   AND m.body_id=NEW.authority_body_id AND m.seat_role IN ('CHAIR','SECRETARY')
   AND m.lifecycle_status='ACTIVE' AND m.appointed_on<=CURRENT_DATE AND (m.retired_on IS NULL OR m.retired_on>=CURRENT_DATE)
 ) THEN RAISE EXCEPTION 'Initial nomination/approval needs a current superior presider' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

--> statement-breakpoint
-- Preserve all original controls, additionally excluding inactive lifecycle seats.
CREATE OR REPLACE FUNCTION beyu_current_body_composition_valid(target_body text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE rules jsonb; seat jsonb; n integer; voters integer; b governance_bodies;
BEGIN
 SELECT * INTO b FROM governance_bodies WHERE id=target_body AND status='ACTIVE';
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT t.rules INTO rules FROM governance_charters c JOIN governance_charter_terms t ON t.id=c.id
  WHERE c.body_id=target_body AND c.status='ADOPTED' ORDER BY c.version DESC LIMIT 1;
 IF rules IS NULL OR NOT (rules ?& ARRAY['quorumMinimum','majorityRule','minimumVotingMembers','maximumVotingMembers','requiredSeats'])
  OR jsonb_typeof(rules->'requiredSeats')<>'array' OR rules->>'quorumMinimum'<>b.quorum_minimum::text OR rules->>'majorityRule'<>b.majority_rule THEN RETURN false; END IF;
 IF NOT (rules ?& ARRAY['quorumMinimum','minimumVotingMembers','maximumVotingMembers','requiredSeats','majorityRule'])
  OR jsonb_typeof(rules->'majorityRule')<>'string' OR jsonb_typeof(rules->'requiredSeats')<>'array' OR (rules->>'quorumMinimum')::integer<1
  OR jsonb_typeof(rules->'quorumMinimum')<>'number' OR jsonb_typeof(rules->'minimumVotingMembers')<>'number' OR jsonb_typeof(rules->'maximumVotingMembers')<>'number'
  OR (rules->>'minimumVotingMembers')::integer<1 OR (rules->>'maximumVotingMembers')::integer<(rules->>'quorumMinimum')::integer
  OR (rules->>'maximumVotingMembers')::integer<(rules->>'minimumVotingMembers')::integer
  OR (rules->>'maximumVotingMembers')::integer>1000 OR jsonb_array_length(rules->'requiredSeats') NOT BETWEEN 1 AND 8
  OR (SELECT count(DISTINCT s->>'role') FROM jsonb_array_elements(rules->'requiredSeats') s)<>jsonb_array_length(rules->'requiredSeats') OR rules->>'majorityRule' NOT IN ('SIMPLE','TWO_THIRDS','UNANIMOUS') THEN RETURN false; END IF;
 IF EXISTS(SELECT m.party_id FROM governance_members m WHERE m.body_id=target_body AND m.lifecycle_status='ACTIVE' AND m.appointed_on<=CURRENT_DATE AND (m.retired_on IS NULL OR m.retired_on>=CURRENT_DATE) GROUP BY m.party_id HAVING count(*)>1)
  OR EXISTS(SELECT 1 FROM governance_members m WHERE m.body_id=target_body AND m.lifecycle_status='ACTIVE' AND m.appointed_on<=CURRENT_DATE AND (m.retired_on IS NULL OR m.retired_on>=CURRENT_DATE)
   AND (m.seat_role NOT IN ('CHAIR','VICE_CHAIR','SECRETARY','TREASURER','MEMBER','INDEPENDENT_MEMBER','COMMITTEE_MEMBER','OBSERVER') OR (m.seat_role='OBSERVER' AND m.voting_rights))) THEN RETURN false; END IF;
 SELECT count(DISTINCT m.party_id) INTO voters FROM governance_members m WHERE m.body_id=target_body AND m.voting_rights AND m.lifecycle_status='ACTIVE' AND m.appointed_on<=CURRENT_DATE AND (m.retired_on IS NULL OR m.retired_on>=CURRENT_DATE);
 IF NOT COALESCE(voters>=b.quorum_minimum AND voters>=(rules->>'minimumVotingMembers')::integer AND voters<=(rules->>'maximumVotingMembers')::integer,false) THEN RETURN false; END IF;
 FOR seat IN SELECT jsonb_array_elements(rules->'requiredSeats') LOOP
   IF NOT (seat ?& ARRAY['role','minimum','maximum']) OR seat->>'role' NOT IN ('CHAIR','VICE_CHAIR','SECRETARY','TREASURER','MEMBER','INDEPENDENT_MEMBER','COMMITTEE_MEMBER','OBSERVER')
    OR jsonb_typeof(seat->'role')<>'string' OR jsonb_typeof(seat->'minimum')<>'number' OR jsonb_typeof(seat->'maximum')<>'number' OR (seat->>'maximum')::integer>1000 OR (seat->>'minimum')::integer<0 OR (seat->>'maximum')::integer<(seat->>'minimum')::integer THEN RETURN false; END IF;
  SELECT count(*) INTO n FROM governance_members m WHERE m.body_id=target_body AND m.seat_role=seat->>'role' AND m.lifecycle_status='ACTIVE' AND m.appointed_on<=CURRENT_DATE AND (m.retired_on IS NULL OR m.retired_on>=CURRENT_DATE);
  IF NOT COALESCE(n>=(seat->>'minimum')::integer AND n<=(seat->>'maximum')::integer,false) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN data_exception THEN RETURN false;
END $$;

--> statement-breakpoint
-- Preserve all original controls, additionally excluding inactive lifecycle seats.
CREATE OR REPLACE FUNCTION beyu_body_activation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text := current_setting('beyu.body_activation_actor',true); actor_party text;
BEGIN
 SELECT u.party_id INTO actor_party FROM users u JOIN governance_members m ON m.party_id=u.party_id
  JOIN governance_bodies a ON a.id=m.body_id
  WHERE u.id=actor AND u.status='ACTIVE' AND NOT u.is_service_account AND a.id=NEW.authority_body_id AND a.status='ACTIVE'
   AND u.primary_tenant_id=a.tenant_id AND a.body_type IN ('BOARD','TRUSTEES') AND m.seat_role IN ('CHAIR','SECRETARY') AND m.lifecycle_status='ACTIVE' AND m.appointed_on<=CURRENT_DATE AND (m.retired_on IS NULL OR m.retired_on>=CURRENT_DATE)
  LIMIT 1 FOR SHARE OF u;
 IF NOT EXISTS(SELECT 1 FROM constitution_articles WHERE article_no=1 AND status='ACTIVE') OR NOT beyu_current_body_composition_valid(NEW.authority_body_id) THEN RAISE EXCEPTION 'Current constitution and superior composition required' USING ERRCODE='23514'; END IF;
 IF actor_party IS NULL THEN RAISE EXCEPTION 'Current superior human presider required' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' OR NEW.revision<>1 OR NEW.proposed_by_user_id IS DISTINCT FROM actor OR NEW.proposed_by_party_id IS DISTINCT FROM actor_party THEN
   RAISE EXCEPTION 'Activation plan must start without authority and record its human author' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.status='ACTIVE' OR NEW.revision<>OLD.revision+1 OR NOT ((OLD.status='DRAFT' AND NEW.status='IN_REVIEW') OR (OLD.status='IN_REVIEW' AND NEW.status='APPROVED') OR (OLD.status='APPROVED' AND NEW.status='ACTIVE')) THEN
   RAISE EXCEPTION 'Invalid activation plan transition' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','revision','approved_by_user_id','approved_by_party_id','resolution_id','activated_by_user_id','activated_at'])
     IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','revision','approved_by_user_id','approved_by_party_id','resolution_id','activated_by_user_id','activated_at'])
   OR (OLD.status<>'IN_REVIEW' AND ROW(NEW.approved_by_user_id,NEW.approved_by_party_id,NEW.resolution_id) IS DISTINCT FROM ROW(OLD.approved_by_user_id,OLD.approved_by_party_id,OLD.resolution_id)) THEN
   RAISE EXCEPTION 'Immutable activation plan changed' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM governance_bodies b JOIN governance_bodies a ON a.id=NEW.authority_body_id
   JOIN governance_body_establishments e ON e.body_id=b.id AND e.parent_body_id=a.id AND e.status='ESTABLISHED'
   JOIN legal_entities le ON le.id=b.legal_entity_id AND le.tenant_id=b.tenant_id AND le.status='ACTIVE'
   JOIN governance_charters c ON c.id=NEW.initial_charter_id AND c.body_id=b.id AND c.authority_body_id=a.id AND c.status='APPROVED'
   JOIN governance_charter_terms t ON t.id=c.id JOIN documents d ON d.id=t.document_id AND d.tenant_id=b.tenant_id
   WHERE b.id=NEW.body_id AND b.status='DRAFT' AND b.body_type='COMMITTEE' AND a.tenant_id=b.tenant_id AND a.legal_entity_id=b.legal_entity_id
    AND t.classification<=NEW.classification AND t.rules->>'quorumMinimum'=b.quorum_minimum::text AND t.rules->>'majorityRule'=b.majority_rule
    AND d.version=t.document_version AND d.checksum=t.document_checksum AND d.classification=t.classification
    AND d.authority_status='AUTHORITATIVE' AND d.superseded_by_id IS NULL AND (d.effective_date IS NULL OR d.effective_date<=CURRENT_DATE)
    AND (d.entity_scope IS NULL OR d.entity_scope='*' OR d.entity_scope=le.code) AND (d.jurisdiction_code IS NULL OR d.jurisdiction_code=le.country_code)
    AND NOT EXISTS(SELECT 1 FROM governance_charters newer WHERE newer.body_id=b.id AND newer.status IN ('APPROVED','ADOPTED') AND newer.version>c.version)
 ) OR EXISTS(SELECT 1 FROM governance_members m WHERE m.body_id=NEW.body_id) THEN
  RAISE EXCEPTION 'Current dormant body, approved charter and empty canonical membership required' USING ERRCODE='23514'; END IF;
 IF NOT beyu_initial_composition_valid(NEW.initial_charter_id,NEW.nomination_ids) OR
  (SELECT count(*) FROM governance_appointments a WHERE a.id IN (SELECT jsonb_array_elements_text(NEW.nomination_ids)) AND a.body_id=NEW.body_id
    AND a.authority_body_id=NEW.authority_body_id AND a.initial_charter_id=NEW.initial_charter_id AND a.status='ACCEPTED'
    AND a.accepted_at IS NOT NULL AND a.nominated_by_party_id IS NOT NULL AND a.approved_by_party_id IS NOT NULL AND a.classification<=NEW.classification)<>jsonb_array_length(NEW.nomination_ids) THEN
  RAISE EXCEPTION 'Exact consented and composition-satisfied initial nominations required' USING ERRCODE='23514'; END IF;
 IF NEW.status='ACTIVE' THEN NEW.activated_at := clock_timestamp(); END IF;
 IF TG_OP='INSERT' THEN NEW.created_at := clock_timestamp(); END IF;
 IF NEW.status IN ('APPROVED','ACTIVE') THEN
  IF actor_party=NEW.proposed_by_party_id OR actor=NEW.proposed_by_user_id
   OR EXISTS(SELECT 1 FROM governance_appointments a WHERE a.id IN (SELECT jsonb_array_elements_text(NEW.nomination_ids)) AND (a.party_id=actor_party OR a.nominee_user_id=actor))
   OR (NEW.status='APPROVED' AND (NEW.approved_by_user_id IS DISTINCT FROM actor OR NEW.approved_by_party_id IS DISTINCT FROM actor_party))
   OR (NEW.status='ACTIVE' AND NEW.activated_by_user_id IS DISTINCT FROM actor) THEN
   RAISE EXCEPTION 'Independent superior approval/activation required' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM resolutions r WHERE r.id=NEW.resolution_id AND r.body_id=NEW.authority_body_id AND r.status='APPROVED'
    AND r.category='RESERVED_MATTER' AND r.linked_object_type='GOVERNANCE_BODY_ACTIVATION' AND r.linked_object_id=NEW.id
    AND r.classification>=NEW.classification AND r.quorum_met AND r.decided_by_member_id IS NOT NULL AND r.decision_date IS NOT NULL) THEN
   RAISE EXCEPTION 'Exact superior reserved-matter activation decision required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
-- History stays readable. Only new/changed ballots require an effective seat.
CREATE POLICY resolution_votes_member_live_insert ON resolution_votes AS RESTRICTIVE FOR INSERT WITH CHECK (
 EXISTS(SELECT 1 FROM governance_members m JOIN governance_bodies b ON b.id=m.body_id
 WHERE m.id=member_id AND m.lifecycle_status='ACTIVE' AND b.status='ACTIVE' AND m.voting_rights
 AND m.appointed_on<=CURRENT_DATE AND (m.retired_on IS NULL OR m.retired_on>=CURRENT_DATE))
);
CREATE POLICY resolution_votes_member_live_update ON resolution_votes AS RESTRICTIVE FOR UPDATE USING(true) WITH CHECK (
 EXISTS(SELECT 1 FROM governance_members m JOIN governance_bodies b ON b.id=m.body_id
 WHERE m.id=member_id AND m.lifecycle_status='ACTIVE' AND b.status='ACTIVE' AND m.voting_rights
 AND m.appointed_on<=CURRENT_DATE AND (m.retired_on IS NULL OR m.retired_on>=CURRENT_DATE))
);
