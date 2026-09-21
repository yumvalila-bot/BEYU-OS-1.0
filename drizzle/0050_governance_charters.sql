-- Additive charter versioning; 0048 authority-table write protections unchanged.
CREATE TABLE governance_charters (
 id text PRIMARY KEY,
 body_id text NOT NULL REFERENCES governance_bodies(id),
 version integer NOT NULL CHECK(version>0),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','IN_REVIEW','ADOPTED')),
 created_by_user_id text NOT NULL REFERENCES users(id),
 adopted_by_user_id text REFERENCES users(id),
 resolution_id text REFERENCES resolutions(id),
 adopted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT governance_charter_adoption CHECK (
 (status='ADOPTED' AND adopted_by_user_id IS NOT NULL AND adopted_by_user_id<>created_by_user_id AND resolution_id IS NOT NULL AND adopted_at IS NOT NULL)
 OR (status<>'ADOPTED' AND adopted_by_user_id IS NULL AND resolution_id IS NULL AND adopted_at IS NULL))
);
CREATE TABLE governance_charter_terms (
 id text PRIMARY KEY REFERENCES governance_charters(id) ON DELETE RESTRICT,
 document_id text NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
 document_version text NOT NULL,
 document_checksum text NOT NULL CHECK(document_checksum ~ '^[a-fA-F0-9]{64}$'),
 purpose text NOT NULL,
 rules jsonb NOT NULL,
 classification beyu_classification NOT NULL
);
ALTER TABLE governance_charter_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_charter_terms FORCE ROW LEVEL SECURITY;
CREATE POLICY governance_charter_terms_read ON governance_charter_terms FOR SELECT USING (
 classification::text=ANY(string_to_array(current_setting('beyu.governance_classifications',true),','))
 AND EXISTS(SELECT 1 FROM governance_charters c WHERE c.id=governance_charter_terms.id)
);
CREATE POLICY governance_charter_terms_insert ON governance_charter_terms FOR INSERT WITH CHECK (
 classification::text=ANY(string_to_array(current_setting('beyu.governance_classifications',true),','))
 AND EXISTS(SELECT 1 FROM governance_charters c WHERE c.id=governance_charter_terms.id AND c.status='DRAFT')
);
-- Immutable terms: no runtime UPDATE/DELETE policy.
CREATE UNIQUE INDEX governance_charters_body_version_uidx ON governance_charters(body_id,version);
ALTER TABLE governance_charters ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_charters FORCE ROW LEVEL SECURITY;
-- All versions of a visible body's charter must remain visible to the control
-- evaluator. Filtering the current charter away would silently disable rules.
-- Detail disclosure is separately checked against its own classification.
CREATE POLICY governance_charters_scope ON governance_charters USING (
 current_setting('beyu.governance_actions_read',true)='on' AND EXISTS (SELECT 1 FROM governance_bodies b WHERE b.id=body_id)
) WITH CHECK (current_setting('beyu.governance_actions_read',true)='on' AND EXISTS (SELECT 1 FROM governance_bodies b WHERE b.id=body_id));
CREATE POLICY governance_charters_no_delete ON governance_charters AS RESTRICTIVE FOR DELETE USING(false);
CREATE POLICY governance_charters_immutable ON governance_charters AS RESTRICTIVE FOR UPDATE USING(true) WITH CHECK(true);
--> statement-breakpoint
CREATE FUNCTION beyu_governance_charter_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' OR NEW.revision<>1 THEN RAISE EXCEPTION 'Charter must start DRAFT' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.status='ADOPTED' OR NEW.revision<>OLD.revision+1 OR NOT ((OLD.status='DRAFT' AND NEW.status='IN_REVIEW') OR (OLD.status='IN_REVIEW' AND NEW.status='ADOPTED')) THEN
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
 IF NEW.status='ADOPTED' THEN
  IF NOT EXISTS (SELECT 1 FROM resolutions r WHERE r.id=NEW.resolution_id AND r.body_id=NEW.body_id AND r.status='APPROVED'
   AND r.linked_object_type='GOVERNANCE_CHARTER' AND r.linked_object_id=NEW.id AND r.quorum_met AND r.decided_by_member_id IS NOT NULL AND r.decision_date IS NOT NULL) THEN
   RAISE EXCEPTION 'Charter-specific governed decision required' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM governance_charters c WHERE c.body_id=NEW.body_id AND c.status='ADOPTED' AND c.version>=NEW.version) THEN
   RAISE EXCEPTION 'Cannot supersede with an older charter' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER governance_charter_guard BEFORE INSERT OR UPDATE ON governance_charters FOR EACH ROW EXECUTE FUNCTION beyu_governance_charter_guard();
--> statement-breakpoint
CREATE FUNCTION beyu_governance_charter_terms_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM governance_charters c JOIN governance_bodies b ON b.id=c.body_id
  JOIN legal_entities le ON le.id=b.legal_entity_id JOIN documents d ON d.tenant_id=b.tenant_id
  WHERE c.id=NEW.id AND c.status='DRAFT' AND d.id=NEW.document_id AND d.version=NEW.document_version AND d.checksum=NEW.document_checksum
  AND d.classification=NEW.classification AND d.authority_status='AUTHORITATIVE' AND d.superseded_by_id IS NULL
  AND (d.effective_date IS NULL OR d.effective_date<=CURRENT_DATE)
  AND (d.entity_scope IS NULL OR d.entity_scope='*' OR d.entity_scope=le.code)
  AND (d.jurisdiction_code IS NULL OR d.jurisdiction_code=le.country_code)) THEN
  RAISE EXCEPTION 'Scoped authoritative charter document required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER governance_charter_terms_guard BEFORE INSERT ON governance_charter_terms FOR EACH ROW EXECUTE FUNCTION beyu_governance_charter_terms_guard();
