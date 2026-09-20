CREATE TABLE "governance_body_establishments" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_body_id" text NOT NULL,
	"parent_charter_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"purpose" text NOT NULL,
	"document_id" text NOT NULL,
	"document_version" text NOT NULL,
	"document_checksum" text NOT NULL,
	"classification" "beyu_classification" NOT NULL,
	"rules" jsonb NOT NULL,
	"reserved_matters" jsonb NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"proposed_by_user_id" text NOT NULL,
	"proposed_by_party_id" text NOT NULL,
	"approved_by_user_id" text,
	"resolution_id" text,
	"body_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "governance_body_establishments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "governance_bodies" ADD COLUMN "classification" "beyu_classification" DEFAULT 'PUBLIC' NOT NULL;--> statement-breakpoint
ALTER TABLE "governance_body_establishments" ADD CONSTRAINT "governance_body_establishments_parent_body_id_governance_bodies_id_fk" FOREIGN KEY ("parent_body_id") REFERENCES "public"."governance_bodies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_establishments" ADD CONSTRAINT "governance_body_establishments_parent_charter_id_governance_charters_id_fk" FOREIGN KEY ("parent_charter_id") REFERENCES "public"."governance_charters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_establishments" ADD CONSTRAINT "governance_body_establishments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_establishments" ADD CONSTRAINT "governance_body_establishments_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_establishments" ADD CONSTRAINT "governance_body_establishments_proposed_by_party_id_parties_id_fk" FOREIGN KEY ("proposed_by_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_establishments" ADD CONSTRAINT "governance_body_establishments_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_body_establishments" ADD CONSTRAINT "governance_body_establishments_resolution_id_resolutions_id_fk" FOREIGN KEY ("resolution_id") REFERENCES "public"."resolutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "governance_body_establishments_body_uidx" ON "governance_body_establishments" USING btree ("body_id");--> statement-breakpoint
ALTER TABLE governance_body_establishments FORCE ROW LEVEL SECURITY;
CREATE POLICY governance_body_establishments_scope ON governance_body_establishments USING (
 current_setting('beyu.governance_actions_read',true)='on'
 AND classification::text=ANY(string_to_array(current_setting('beyu.governance_classifications',true),','))
 AND EXISTS(SELECT 1 FROM governance_bodies b WHERE b.id=parent_body_id)
) WITH CHECK (
 current_setting('beyu.governance_actions_read',true)='on'
 AND classification::text=ANY(string_to_array(current_setting('beyu.governance_classifications',true),','))
 AND EXISTS(SELECT 1 FROM governance_bodies b WHERE b.id=parent_body_id)
);
CREATE POLICY governance_body_establishments_no_delete ON governance_body_establishments AS RESTRICTIVE FOR DELETE USING(false);
-- Legacy body identities were unclassified reference metadata. Preserve their
-- existing PUBLIC visibility; newly established identities inherit classification.
CREATE POLICY governance_bodies_classification ON governance_bodies AS RESTRICTIVE USING (
 classification='PUBLIC' OR classification::text=ANY(string_to_array(current_setting('beyu.governance_classifications',true),','))
) WITH CHECK (
 classification='PUBLIC' OR classification::text=ANY(string_to_array(current_setting('beyu.governance_classifications',true),','))
);
ALTER TABLE governance_body_establishments ADD CONSTRAINT governance_body_establishment_shape CHECK (
 status IN ('DRAFT','IN_REVIEW','APPROVED','ESTABLISHED') AND revision>0
 AND document_checksum ~ '^[a-fA-F0-9]{64}$' AND jsonb_typeof(rules)='object' AND jsonb_typeof(reserved_matters)='array'
 AND ((status IN ('DRAFT','IN_REVIEW') AND approved_by_user_id IS NULL AND resolution_id IS NULL)
   OR (status IN ('APPROVED','ESTABLISHED') AND approved_by_user_id IS NOT NULL AND resolution_id IS NOT NULL AND approved_by_user_id<>proposed_by_user_id))
 AND ((status='ESTABLISHED' AND body_id IS NOT NULL) OR (status<>'ESTABLISHED' AND body_id IS NULL))
);
--> statement-breakpoint
CREATE FUNCTION beyu_body_establishment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text := current_setting('beyu.body_establishment_actor',true);
BEGIN
 IF actor IS NULL OR actor='' OR NOT EXISTS(SELECT 1 FROM users u JOIN governance_members m ON m.party_id=u.party_id
   WHERE u.id=actor AND u.status='ACTIVE' AND NOT u.is_service_account AND m.body_id=NEW.parent_body_id
   AND m.seat_role IN ('CHAIR','SECRETARY') AND m.appointed_on<=CURRENT_DATE AND (m.retired_on IS NULL OR m.retired_on>=CURRENT_DATE)) THEN
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
CREATE TRIGGER governance_body_establishment_guard BEFORE INSERT OR UPDATE ON governance_body_establishments FOR EACH ROW EXECUTE FUNCTION beyu_body_establishment_guard();
--> statement-breakpoint
-- Only an exact, independently approved dormant committee may now be inserted.
-- No UPDATE/DELETE gate, member gate or finalized-decision policy is relaxed.
DROP POLICY governance_bodies_read_only ON governance_bodies;
CREATE POLICY governance_bodies_read_only ON governance_bodies AS RESTRICTIVE FOR INSERT WITH CHECK (
 EXISTS(SELECT 1 FROM governance_body_establishments e JOIN governance_bodies p ON p.id=e.parent_body_id
 WHERE e.id=current_setting('beyu.body_establishment_id',true) AND e.status='ESTABLISHED' AND e.body_id=governance_bodies.id
  AND e.approved_by_user_id IS NOT NULL AND current_setting('beyu.body_establishment_actor',true) IS NOT NULL
  AND governance_bodies.status='DRAFT' AND governance_bodies.body_type='COMMITTEE'
  AND governance_bodies.tenant_id=p.tenant_id AND governance_bodies.legal_entity_id=p.legal_entity_id
  AND governance_bodies.code=e.code AND governance_bodies.name=e.name AND governance_bodies.classification=e.classification
  AND governance_bodies.charter_document_id=e.document_id AND governance_bodies.quorum_minimum::text=e.rules->>'quorumMinimum'
  AND governance_bodies.majority_rule=e.rules->>'majorityRule' AND governance_bodies.reserved_matters=e.reserved_matters)
);
CREATE FUNCTION beyu_body_establishment_atomic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM governance_body_establishments e WHERE e.id=NEW.id AND e.status='ESTABLISHED' AND NOT EXISTS(
  SELECT 1 FROM governance_bodies b JOIN governance_bodies p ON p.id=e.parent_body_id WHERE b.id=e.body_id
   AND b.status='DRAFT' AND b.body_type='COMMITTEE' AND b.tenant_id=p.tenant_id AND b.legal_entity_id=p.legal_entity_id
   AND b.code=e.code AND b.name=e.name AND b.classification=e.classification AND b.charter_document_id=e.document_id
   AND b.quorum_minimum::text=e.rules->>'quorumMinimum' AND b.majority_rule=e.rules->>'majorityRule' AND b.reserved_matters=e.reserved_matters)) THEN
  RAISE EXCEPTION 'Established proposal requires its exact dormant canonical body' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER governance_body_establishment_atomic AFTER INSERT OR UPDATE ON governance_body_establishments
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION beyu_body_establishment_atomic();
