ALTER TABLE "governance_appointments" ADD COLUMN "nominated_by_party_id" text;--> statement-breakpoint
ALTER TABLE "governance_appointments" ADD COLUMN "approved_by_party_id" text;--> statement-breakpoint
ALTER TABLE "governance_appointments" ADD CONSTRAINT "governance_appointments_nominated_by_party_id_parties_id_fk" FOREIGN KEY ("nominated_by_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_appointments" ADD CONSTRAINT "governance_appointments_approved_by_party_id_parties_id_fk" FOREIGN KEY ("approved_by_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Preserve historical identities as unknown; no inferred backfill, state rewrite,
-- policy change or SECURITY DEFINER. The existing 0051 guards remain in force.
CREATE FUNCTION beyu_governance_appointment_origin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text := current_setting('beyu.governance_appointment_actor',true);
DECLARE actor_party text;
BEGIN
 SELECT u.party_id INTO actor_party FROM users u JOIN governance_bodies b ON b.id=NEW.body_id
  WHERE u.id=actor AND u.status='ACTIVE' AND NOT u.is_service_account AND u.primary_tenant_id=b.tenant_id
  FOR SHARE OF u;
 IF actor_party IS NULL THEN
  RAISE EXCEPTION 'Current human appointment actor required' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.nominated_by_party_id IS DISTINCT FROM actor_party OR NEW.nominated_by_user_id IS DISTINCT FROM actor
   OR NEW.nominated_by_party_id=NEW.party_id OR NEW.approved_by_party_id IS NOT NULL THEN
   RAISE EXCEPTION 'Original nominating party must match the independent human actor' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.nominated_by_party_id IS DISTINCT FROM OLD.nominated_by_party_id
   OR (OLD.status<>'NOMINATED' AND NEW.approved_by_party_id IS DISTINCT FROM OLD.approved_by_party_id) THEN
   RAISE EXCEPTION 'Immutable appointment party provenance changed' USING ERRCODE='23514'; END IF;
  -- A legacy nominee can still decline; missing evidence cannot grant authority.
  IF NEW.status<>'DECLINED' AND NEW.nominated_by_party_id IS NULL THEN
   RAISE EXCEPTION 'Original nominating party is unknown; create a new nomination' USING ERRCODE='23514'; END IF;
  IF NEW.status='APPROVED' THEN
   IF NEW.approved_by_party_id IS DISTINCT FROM actor_party OR NEW.approved_by_user_id IS DISTINCT FROM actor
    OR actor_party=NEW.nominated_by_party_id OR actor_party=NEW.party_id THEN
    RAISE EXCEPTION 'Approval must be independent of the original nominating party and nominee' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.status IN ('ACCEPTED','ACTIVE') AND NEW.approved_by_party_id IS NULL THEN
   RAISE EXCEPTION 'Original approving party is unknown; create a new nomination' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER governance_appointment_origin_guard BEFORE INSERT OR UPDATE ON governance_appointments
 FOR EACH ROW EXECUTE FUNCTION beyu_governance_appointment_origin_guard();
