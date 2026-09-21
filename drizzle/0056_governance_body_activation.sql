CREATE TABLE "governance_body_activations" (
	"id" text PRIMARY KEY NOT NULL,
	"body_id" text NOT NULL,
	"authority_body_id" text NOT NULL,
	"initial_charter_id" text NOT NULL,
	"nomination_ids" jsonb NOT NULL,
	"rationale" text NOT NULL,
	"classification" "beyu_classification" NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"proposed_by_user_id" text NOT NULL,
	"proposed_by_party_id" text NOT NULL,
	"approved_by_user_id" text,
	"approved_by_party_id" text,
	"resolution_id" text,
	"activated_by_user_id" text,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "governance_body_activations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "governance_body_activations" ADD CONSTRAINT "governance_body_activations_body_id_governance_bodies_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."governance_bodies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_activations" ADD CONSTRAINT "governance_body_activations_authority_body_id_governance_bodies_id_fk" FOREIGN KEY ("authority_body_id") REFERENCES "public"."governance_bodies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_activations" ADD CONSTRAINT "governance_body_activations_initial_charter_id_governance_charters_id_fk" FOREIGN KEY ("initial_charter_id") REFERENCES "public"."governance_charters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_activations" ADD CONSTRAINT "governance_body_activations_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_activations" ADD CONSTRAINT "governance_body_activations_proposed_by_party_id_parties_id_fk" FOREIGN KEY ("proposed_by_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_activations" ADD CONSTRAINT "governance_body_activations_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_activations" ADD CONSTRAINT "governance_body_activations_approved_by_party_id_parties_id_fk" FOREIGN KEY ("approved_by_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_activations" ADD CONSTRAINT "governance_body_activations_resolution_id_resolutions_id_fk" FOREIGN KEY ("resolution_id") REFERENCES "public"."resolutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_activations" ADD CONSTRAINT "governance_body_activations_activated_by_user_id_users_id_fk" FOREIGN KEY ("activated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE governance_body_activations FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_body_activations ADD CONSTRAINT governance_activation_shape CHECK (
 status IN ('DRAFT','IN_REVIEW','APPROVED','ACTIVE') AND revision>0
 AND jsonb_typeof(nomination_ids)='array' AND jsonb_array_length(nomination_ids) BETWEEN 1 AND 100
 AND body_id<>authority_body_id
 AND ((status IN ('APPROVED','ACTIVE') AND approved_by_user_id IS NOT NULL AND approved_by_party_id IS NOT NULL AND resolution_id IS NOT NULL
       AND approved_by_user_id<>proposed_by_user_id AND approved_by_party_id<>proposed_by_party_id)
      OR (status IN ('DRAFT','IN_REVIEW') AND approved_by_user_id IS NULL AND approved_by_party_id IS NULL AND resolution_id IS NULL))
 AND ((status='ACTIVE' AND activated_by_user_id IS NOT NULL AND activated_at IS NOT NULL)
      OR (status<>'ACTIVE' AND activated_by_user_id IS NULL AND activated_at IS NULL))
);
CREATE UNIQUE INDEX governance_activation_one_active ON governance_body_activations(body_id) WHERE status='ACTIVE';
CREATE POLICY governance_activation_scope ON governance_body_activations USING (
 current_setting('beyu.governance_actions_read',true)='on'
 AND classification::text=ANY(string_to_array(current_setting('beyu.governance_classifications',true),','))
 AND EXISTS(SELECT 1 FROM governance_bodies b WHERE b.id=body_id)
) WITH CHECK (
 current_setting('beyu.governance_actions_read',true)='on'
 AND classification::text=ANY(string_to_array(current_setting('beyu.governance_classifications',true),','))
 AND EXISTS(SELECT 1 FROM governance_bodies b WHERE b.id=body_id)
);
CREATE POLICY governance_activation_no_delete ON governance_body_activations AS RESTRICTIVE FOR DELETE USING(false);
--> statement-breakpoint
-- Pure invoker assessment of the exact consented set, including term boundaries.
CREATE FUNCTION beyu_initial_composition_valid(charter_id text, nomination_ids jsonb) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE rules jsonb; checkpoint date; last_day date; seat jsonb; n integer; voters integer;
BEGIN
 SELECT t.rules INTO rules FROM governance_charter_terms t WHERE t.id=charter_id;
 IF rules IS NULL OR jsonb_typeof(nomination_ids)<>'array' OR jsonb_array_length(nomination_ids)=0 THEN RETURN false; END IF;
 IF NOT (rules ?& ARRAY['quorumMinimum','minimumVotingMembers','maximumVotingMembers','requiredSeats','majorityRule'])
  OR jsonb_typeof(rules->'majorityRule')<>'string' OR jsonb_typeof(rules->'requiredSeats')<>'array' OR (rules->>'quorumMinimum')::integer<1
  OR jsonb_typeof(rules->'quorumMinimum')<>'number' OR jsonb_typeof(rules->'minimumVotingMembers')<>'number' OR jsonb_typeof(rules->'maximumVotingMembers')<>'number'
  OR (rules->>'minimumVotingMembers')::integer<1 OR (rules->>'maximumVotingMembers')::integer<(rules->>'quorumMinimum')::integer
  OR (rules->>'maximumVotingMembers')::integer<(rules->>'minimumVotingMembers')::integer
  OR (rules->>'maximumVotingMembers')::integer>1000 OR jsonb_array_length(rules->'requiredSeats') NOT BETWEEN 1 AND 8
  OR (SELECT count(DISTINCT s->>'role') FROM jsonb_array_elements(rules->'requiredSeats') s)<>jsonb_array_length(rules->'requiredSeats') OR rules->>'majorityRule' NOT IN ('SIMPLE','TWO_THIRDS','UNANIMOUS') THEN RETURN false; END IF;
 SELECT count(*),max(a.retired_on) INTO n,last_day FROM governance_appointments a WHERE a.id IN (SELECT jsonb_array_elements_text(nomination_ids));
 IF n<>jsonb_array_length(nomination_ids) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM governance_appointments a WHERE a.id IN (SELECT jsonb_array_elements_text(nomination_ids)) AND
  (a.appointed_on<CURRENT_DATE OR a.retired_on<CURRENT_DATE OR a.seat_role NOT IN ('CHAIR','VICE_CHAIR','SECRETARY','TREASURER','MEMBER','INDEPENDENT_MEMBER','COMMITTEE_MEMBER','OBSERVER') OR (a.seat_role='OBSERVER' AND a.voting_rights))) THEN RETURN false; END IF;
 FOR checkpoint IN
  SELECT CURRENT_DATE UNION SELECT a.appointed_on FROM governance_appointments a WHERE a.id IN (SELECT jsonb_array_elements_text(nomination_ids))
  UNION SELECT a.retired_on FROM governance_appointments a WHERE a.id IN (SELECT jsonb_array_elements_text(nomination_ids))
  UNION SELECT a.retired_on+1 FROM governance_appointments a WHERE a.id IN (SELECT jsonb_array_elements_text(nomination_ids)) AND a.retired_on+1<=last_day
 LOOP
  IF EXISTS(SELECT a.party_id FROM governance_appointments a WHERE a.id IN (SELECT jsonb_array_elements_text(nomination_ids))
   AND a.appointed_on<=checkpoint AND a.retired_on>=checkpoint GROUP BY a.party_id HAVING count(*)>1) THEN RETURN false; END IF;
  SELECT count(DISTINCT a.party_id) INTO voters FROM governance_appointments a WHERE a.id IN (SELECT jsonb_array_elements_text(nomination_ids))
   AND a.appointed_on<=checkpoint AND a.retired_on>=checkpoint AND a.voting_rights;
  IF voters<(rules->>'quorumMinimum')::integer OR voters<(rules->>'minimumVotingMembers')::integer OR voters>(rules->>'maximumVotingMembers')::integer THEN RETURN false; END IF;
  FOR seat IN SELECT jsonb_array_elements(rules->'requiredSeats') LOOP
   IF NOT (seat ?& ARRAY['role','minimum','maximum']) OR seat->>'role' NOT IN ('CHAIR','VICE_CHAIR','SECRETARY','TREASURER','MEMBER','INDEPENDENT_MEMBER','COMMITTEE_MEMBER','OBSERVER')
    OR jsonb_typeof(seat->'role')<>'string' OR jsonb_typeof(seat->'minimum')<>'number' OR jsonb_typeof(seat->'maximum')<>'number' OR (seat->>'maximum')::integer>1000 OR (seat->>'minimum')::integer<0 OR (seat->>'maximum')::integer<(seat->>'minimum')::integer THEN RETURN false; END IF;
   SELECT count(*) INTO n FROM governance_appointments a WHERE a.id IN (SELECT jsonb_array_elements_text(nomination_ids))
    AND a.appointed_on<=checkpoint AND a.retired_on>=checkpoint AND a.seat_role=seat->>'role';
   IF n<(seat->>'minimum')::integer OR n>(seat->>'maximum')::integer THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 RETURN true;
EXCEPTION WHEN data_exception THEN RETURN false;
END $$;
--> statement-breakpoint
CREATE FUNCTION beyu_current_body_composition_valid(target_body text) RETURNS boolean LANGUAGE plpgsql AS $$
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
 IF EXISTS(SELECT m.party_id FROM governance_members m WHERE m.body_id=target_body AND m.appointed_on<=CURRENT_DATE AND (m.retired_on IS NULL OR m.retired_on>=CURRENT_DATE) GROUP BY m.party_id HAVING count(*)>1)
  OR EXISTS(SELECT 1 FROM governance_members m WHERE m.body_id=target_body AND m.appointed_on<=CURRENT_DATE AND (m.retired_on IS NULL OR m.retired_on>=CURRENT_DATE)
   AND (m.seat_role NOT IN ('CHAIR','VICE_CHAIR','SECRETARY','TREASURER','MEMBER','INDEPENDENT_MEMBER','COMMITTEE_MEMBER','OBSERVER') OR (m.seat_role='OBSERVER' AND m.voting_rights))) THEN RETURN false; END IF;
 SELECT count(DISTINCT m.party_id) INTO voters FROM governance_members m WHERE m.body_id=target_body AND m.voting_rights AND m.appointed_on<=CURRENT_DATE AND (m.retired_on IS NULL OR m.retired_on>=CURRENT_DATE);
 IF NOT COALESCE(voters>=b.quorum_minimum AND voters>=(rules->>'minimumVotingMembers')::integer AND voters<=(rules->>'maximumVotingMembers')::integer,false) THEN RETURN false; END IF;
 FOR seat IN SELECT jsonb_array_elements(rules->'requiredSeats') LOOP
   IF NOT (seat ?& ARRAY['role','minimum','maximum']) OR seat->>'role' NOT IN ('CHAIR','VICE_CHAIR','SECRETARY','TREASURER','MEMBER','INDEPENDENT_MEMBER','COMMITTEE_MEMBER','OBSERVER')
    OR jsonb_typeof(seat->'role')<>'string' OR jsonb_typeof(seat->'minimum')<>'number' OR jsonb_typeof(seat->'maximum')<>'number' OR (seat->>'maximum')::integer>1000 OR (seat->>'minimum')::integer<0 OR (seat->>'maximum')::integer<(seat->>'minimum')::integer THEN RETURN false; END IF;
  SELECT count(*) INTO n FROM governance_members m WHERE m.body_id=target_body AND m.seat_role=seat->>'role' AND m.appointed_on<=CURRENT_DATE AND (m.retired_on IS NULL OR m.retired_on>=CURRENT_DATE);
  IF NOT COALESCE(n>=(seat->>'minimum')::integer AND n<=(seat->>'maximum')::integer,false) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN data_exception THEN RETURN false;
END $$;
--> statement-breakpoint
CREATE FUNCTION beyu_body_activation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text := current_setting('beyu.body_activation_actor',true); actor_party text;
BEGIN
 SELECT u.party_id INTO actor_party FROM users u JOIN governance_members m ON m.party_id=u.party_id
  JOIN governance_bodies a ON a.id=m.body_id
  WHERE u.id=actor AND u.status='ACTIVE' AND NOT u.is_service_account AND a.id=NEW.authority_body_id AND a.status='ACTIVE'
   AND u.primary_tenant_id=a.tenant_id AND a.body_type IN ('BOARD','TRUSTEES') AND m.seat_role IN ('CHAIR','SECRETARY') AND m.appointed_on<=CURRENT_DATE AND (m.retired_on IS NULL OR m.retired_on>=CURRENT_DATE)
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
CREATE TRIGGER governance_body_activation_guard BEFORE INSERT OR UPDATE ON governance_body_activations FOR EACH ROW EXECUTE FUNCTION beyu_body_activation_guard();
--> statement-breakpoint
-- The following predicate is only a narrow transaction-local gate. The plan's
-- deferred constraint makes a partially effectuated state impossible to commit.
CREATE FUNCTION beyu_body_activation_matches(target_body text, target_charter text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM governance_body_activations p WHERE p.id=current_setting('beyu.body_activation_id',true)
  AND p.status='ACTIVE' AND p.body_id=target_body AND p.initial_charter_id=target_charter
  AND p.activated_by_user_id=current_setting('beyu.body_activation_actor',true))
$$;
CREATE FUNCTION beyu_body_activation_atomic() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p governance_body_activations;
BEGIN
 SELECT * INTO p FROM governance_body_activations WHERE id=NEW.id;
 IF p.status='ACTIVE' AND (
  NOT EXISTS(SELECT 1 FROM governance_bodies b WHERE b.id=p.body_id AND b.status='ACTIVE')
  OR NOT EXISTS(SELECT 1 FROM governance_charters c WHERE c.id=p.initial_charter_id AND c.body_id=p.body_id AND c.status='ADOPTED' AND c.authority_body_id=p.authority_body_id)
  OR (SELECT count(*) FROM governance_members m WHERE m.body_id=p.body_id)<>jsonb_array_length(p.nomination_ids)
  OR (SELECT count(*) FROM governance_appointments a JOIN governance_members m ON m.id=a.member_id AND m.body_id=a.body_id AND m.party_id=a.party_id
    AND m.seat_role=a.seat_role AND m.voting_rights=a.voting_rights AND m.appointed_on=a.appointed_on AND m.retired_on=a.retired_on
   WHERE a.id IN (SELECT jsonb_array_elements_text(p.nomination_ids)) AND a.status='ACTIVE' AND a.body_id=p.body_id AND a.initial_charter_id=p.initial_charter_id AND a.authority_body_id=p.authority_body_id)<>jsonb_array_length(p.nomination_ids)
  OR NOT beyu_initial_composition_valid(p.initial_charter_id,p.nomination_ids)
 ) THEN RAISE EXCEPTION 'Initial activation must commit exact membership, effective charter and active body atomically' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER governance_body_activation_atomic AFTER INSERT OR UPDATE ON governance_body_activations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION beyu_body_activation_atomic();
--> statement-breakpoint
-- Preserve the historical guards for every existing charter operation. Only the
-- paired APPROVED -> ADOPTED transition is handed to the mandatory plan guard.
DROP TRIGGER governance_charter_guard ON governance_charters;
DROP TRIGGER governance_charter_authority_guard ON governance_charters;
CREATE TRIGGER governance_charter_guard_insert BEFORE INSERT ON governance_charters FOR EACH ROW EXECUTE FUNCTION beyu_governance_charter_guard();
CREATE TRIGGER governance_charter_guard_update BEFORE UPDATE ON governance_charters FOR EACH ROW WHEN (NOT (OLD.status='APPROVED' AND NEW.status='ADOPTED')) EXECUTE FUNCTION beyu_governance_charter_guard();
CREATE TRIGGER governance_charter_authority_guard_insert BEFORE INSERT ON governance_charters FOR EACH ROW EXECUTE FUNCTION beyu_governance_charter_authority_guard();
CREATE TRIGGER governance_charter_authority_guard_update BEFORE UPDATE ON governance_charters FOR EACH ROW WHEN (NOT (OLD.status='APPROVED' AND NEW.status='ADOPTED')) EXECUTE FUNCTION beyu_governance_charter_authority_guard();
CREATE FUNCTION beyu_initial_charter_effectiveness_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status='APPROVED' AND NEW.status='ADOPTED' THEN
  IF NEW.revision<>OLD.revision+1 OR (to_jsonb(NEW)-ARRAY['status','revision']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','revision'])
   OR NOT beyu_body_activation_matches(NEW.body_id,NEW.id) THEN
   RAISE EXCEPTION 'Exact atomic plan required; initial charter approval history is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER governance_initial_charter_effectiveness_guard BEFORE UPDATE ON governance_charters FOR EACH ROW EXECUTE FUNCTION beyu_initial_charter_effectiveness_guard();
--> statement-breakpoint
-- UPDATE is still denied except this exact paired transition. INSERT/DELETE and
-- all membership UPDATE/DELETE/finalized-decision/scope policies are untouched.
DROP POLICY governance_bodies_no_update ON governance_bodies;
CREATE POLICY governance_bodies_no_update ON governance_bodies AS RESTRICTIVE FOR UPDATE USING(true) WITH CHECK (
 status='ACTIVE' AND EXISTS(SELECT 1 FROM governance_body_activations p WHERE p.body_id=governance_bodies.id
  AND beyu_body_activation_matches(p.body_id,p.initial_charter_id))
);
CREATE FUNCTION beyu_initial_body_active_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN RETURN NEW; END IF;
 IF OLD.status<>'DRAFT' OR NEW.status<>'ACTIVE' OR (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status')
  OR NOT EXISTS(SELECT 1 FROM governance_body_activations p WHERE p.body_id=NEW.id AND beyu_body_activation_matches(p.body_id,p.initial_charter_id)) THEN
  RAISE EXCEPTION 'Body updates require exact initial activation; other fields/history remain immutable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
-- Runtime boundary, not a prohibition on privileged maintenance/test fixtures.
CREATE TRIGGER governance_initial_body_active_guard BEFORE UPDATE ON governance_bodies FOR EACH ROW EXECUTE FUNCTION beyu_initial_body_active_guard();

--> statement-breakpoint
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
   AND m.appointed_on<=CURRENT_DATE AND (m.retired_on IS NULL OR m.retired_on>=CURRENT_DATE)
 ) THEN RAISE EXCEPTION 'Initial nomination/approval needs a current superior presider' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
