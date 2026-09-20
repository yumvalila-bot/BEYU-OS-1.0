ALTER TABLE "governance_charters" ADD COLUMN "authority_body_id" text;--> statement-breakpoint
ALTER TABLE "governance_charters" ADD COLUMN "created_by_party_id" text;--> statement-breakpoint
ALTER TABLE "governance_charters" ADD CONSTRAINT "governance_charters_authority_body_id_governance_bodies_id_fk" FOREIGN KEY ("authority_body_id") REFERENCES "public"."governance_bodies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_charters" ADD CONSTRAINT "governance_charters_created_by_party_id_parties_id_fk" FOREIGN KEY ("created_by_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Preserve pre-0053 history without guessing the original author party or
-- superior. Missing snapshots are readable history, not new transition authority.
ALTER TABLE governance_charters DROP CONSTRAINT governance_charters_status_check;
ALTER TABLE governance_charters ADD CONSTRAINT governance_charters_status_check CHECK(status IN ('DRAFT','IN_REVIEW','APPROVED','ADOPTED'));
ALTER TABLE governance_charters DROP CONSTRAINT governance_charter_adoption;
ALTER TABLE governance_charters ADD CONSTRAINT governance_charter_adoption CHECK (
 (status IN ('APPROVED','ADOPTED') AND adopted_by_user_id IS NOT NULL AND adopted_by_user_id<>created_by_user_id AND resolution_id IS NOT NULL AND adopted_at IS NOT NULL)
 OR (status NOT IN ('APPROVED','ADOPTED') AND adopted_by_user_id IS NULL AND resolution_id IS NULL AND adopted_at IS NULL));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION beyu_governance_charter_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' OR NEW.revision<>1 THEN RAISE EXCEPTION 'Charter must start DRAFT' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.status IN ('ADOPTED','APPROVED') OR NEW.revision<>OLD.revision+1 OR NOT ((OLD.status='DRAFT' AND NEW.status='IN_REVIEW') OR (OLD.status='IN_REVIEW' AND NEW.status IN ('ADOPTED','APPROVED'))) THEN
   RAISE EXCEPTION 'Invalid charter transition or revision' USING ERRCODE='23514';
  END IF;
  IF ROW(NEW.body_id,NEW.version,NEW.created_by_user_id,NEW.created_at)
   IS DISTINCT FROM ROW(OLD.body_id,OLD.version,OLD.created_by_user_id,OLD.created_at) THEN
   RAISE EXCEPTION 'Charter terms are immutable; create a new version' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND NOT EXISTS (
  SELECT 1 FROM governance_charter_terms t JOIN governance_bodies b ON b.id=NEW.body_id JOIN documents d ON d.tenant_id=b.tenant_id
  WHERE t.id=NEW.id AND d.id=t.document_id AND d.version=t.document_version AND d.checksum=t.document_checksum AND d.classification=t.classification
 ) THEN RAISE EXCEPTION 'Current readable charter snapshot required' USING ERRCODE='23514'; END IF;
 IF NEW.status IN ('ADOPTED','APPROVED') THEN
  IF NOT EXISTS (SELECT 1 FROM resolutions r WHERE r.id=NEW.resolution_id AND r.body_id=NEW.authority_body_id AND r.status='APPROVED'
   AND r.category='POLICY' AND r.linked_object_type='GOVERNANCE_CHARTER' AND r.linked_object_id=NEW.id AND r.quorum_met AND r.decided_by_member_id IS NOT NULL AND r.decision_date IS NOT NULL) THEN
   RAISE EXCEPTION 'Charter-specific governed decision required' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM governance_charters c WHERE c.body_id=NEW.body_id AND c.status='ADOPTED' AND c.version>=NEW.version) THEN
   RAISE EXCEPTION 'Cannot supersede with an older charter' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
-- Additional invoker guard; no SECURITY DEFINER, body/member write relaxation,
-- policy removal or historical backfill. APPROVED is expressly NOT EFFECTIVE.
CREATE FUNCTION beyu_governance_charter_authority_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
    AND m.appointed_on<=CURRENT_DATE AND (m.retired_on IS NULL OR m.retired_on>=CURRENT_DATE)) THEN
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
CREATE TRIGGER governance_charter_authority_guard BEFORE INSERT OR UPDATE ON governance_charters
 FOR EACH ROW EXECUTE FUNCTION beyu_governance_charter_authority_guard();
