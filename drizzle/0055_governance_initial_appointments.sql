ALTER TABLE "governance_appointments" ADD COLUMN "authority_body_id" text;--> statement-breakpoint
ALTER TABLE "governance_appointments" ADD COLUMN "initial_charter_id" text;--> statement-breakpoint
ALTER TABLE "governance_appointments" ADD CONSTRAINT "governance_appointments_authority_body_id_governance_bodies_id_fk" FOREIGN KEY ("authority_body_id") REFERENCES "public"."governance_bodies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_appointments" ADD CONSTRAINT "governance_appointments_initial_charter_id_governance_charters_id_fk" FOREIGN KEY ("initial_charter_id") REFERENCES "public"."governance_charters"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Preserve all prior guard predicates; only the immutable decision-body reference extends.
CREATE OR REPLACE FUNCTION beyu_governance_appointment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
 IF NEW.status<>'NOMINATED' AND NOT EXISTS(SELECT 1 FROM resolutions r WHERE r.id=NEW.resolution_id AND r.body_id=COALESCE(NEW.authority_body_id,NEW.body_id) AND r.status='APPROVED'
  AND r.category='APPOINTMENT' AND r.classification>=NEW.classification AND r.linked_object_type='GOVERNANCE_APPOINTMENT' AND r.linked_object_id=NEW.id
  AND r.quorum_met AND r.decided_by_member_id IS NOT NULL AND r.decision_date IS NOT NULL) THEN
  RAISE EXCEPTION 'Nomination-specific decision required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
-- No body/member policy change. In particular a dormant appointment may NEVER
-- individually activate. Atomic initial composition is a separate future gate.
CREATE FUNCTION beyu_governance_initial_appointment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
  RAISE EXCEPTION 'Initial appointments cannot individually activate membership or a body' USING ERRCODE='23514'; END IF;
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
CREATE TRIGGER governance_initial_appointment_guard BEFORE INSERT OR UPDATE ON governance_appointments
 FOR EACH ROW EXECUTE FUNCTION beyu_governance_initial_appointment_guard();
