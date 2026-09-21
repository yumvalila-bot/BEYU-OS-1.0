-- Core shared governance RLS. No new OS, tables, or denormalized tenant truth.
-- Child records inherit scope through their existing authoritative parents.
-- No global-scope bypass: enterprise callers receive an explicit tenant subtree.
-- Request context is set transaction-locally by withTenantDatabaseContext.
CREATE FUNCTION beyu_governance_entity_visible(entity_id text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT current_setting('beyu.governance_context', true) = 'on'
    AND (coalesce(current_setting('beyu.governance_entity_ids', true), '') = ''
         OR entity_id = ANY(string_to_array(current_setting('beyu.governance_entity_ids', true), ',')))
$$;
--> statement-breakpoint
ALTER TABLE governance_bodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_bodies FORCE ROW LEVEL SECURITY;
CREATE POLICY governance_bodies_scope ON governance_bodies
  USING (tenant_id = ANY(beyu_tenant_ids()) AND beyu_governance_entity_visible(legal_entity_id))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids()) AND beyu_governance_entity_visible(legal_entity_id));
--> statement-breakpoint
ALTER TABLE governance_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_members FORCE ROW LEVEL SECURITY;
CREATE POLICY governance_members_scope ON governance_members
  USING (EXISTS (SELECT 1 FROM governance_bodies b WHERE b.id = body_id))
  WITH CHECK (EXISTS (SELECT 1 FROM governance_bodies b WHERE b.id = body_id));
--> statement-breakpoint
ALTER TABLE resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE resolutions FORCE ROW LEVEL SECURITY;
CREATE POLICY resolutions_scope ON resolutions
  USING (tenant_id = ANY(beyu_tenant_ids())
    AND classification::text = ANY(string_to_array(current_setting('beyu.governance_classifications', true), ','))
    AND EXISTS (SELECT 1 FROM governance_bodies b WHERE b.id = body_id AND b.tenant_id = resolutions.tenant_id))
  WITH CHECK (tenant_id = ANY(beyu_tenant_ids())
    AND classification::text = ANY(string_to_array(current_setting('beyu.governance_classifications', true), ','))
    AND EXISTS (SELECT 1 FROM governance_bodies b WHERE b.id = body_id AND b.tenant_id = resolutions.tenant_id));
--> statement-breakpoint
ALTER TABLE resolution_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE resolution_votes FORCE ROW LEVEL SECURITY;
CREATE POLICY resolution_votes_scope ON resolution_votes
  USING (EXISTS (SELECT 1 FROM resolutions r JOIN governance_members m ON m.body_id = r.body_id
                WHERE r.id = resolution_id AND m.id = member_id))
  WITH CHECK (EXISTS (SELECT 1 FROM resolutions r JOIN governance_members m ON m.body_id = r.body_id
                WHERE r.id = resolution_id AND m.id = member_id));
--> statement-breakpoint
-- Scope is not a license to appoint oneself, rewrite the body rules or erase
-- history. Existing APIs do not manage body/membership changes; those remain
-- controlled administrative operations until an appointment workflow exists.
-- Restrictive policies also bind roles provisioned AFTER this migration.
CREATE POLICY governance_bodies_read_only ON governance_bodies AS RESTRICTIVE FOR INSERT WITH CHECK (false);
CREATE POLICY governance_bodies_no_update ON governance_bodies AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);
CREATE POLICY governance_bodies_no_delete ON governance_bodies AS RESTRICTIVE FOR DELETE USING (false);
CREATE POLICY governance_members_read_only ON governance_members AS RESTRICTIVE FOR INSERT WITH CHECK (false);
CREATE POLICY governance_members_no_update ON governance_members AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false);
CREATE POLICY governance_members_no_delete ON governance_members AS RESTRICTIVE FOR DELETE USING (false);
CREATE POLICY resolutions_no_delete ON resolutions AS RESTRICTIVE FOR DELETE USING (false);
CREATE POLICY resolution_votes_no_delete ON resolution_votes AS RESTRICTIVE FOR DELETE USING (false);
--> statement-breakpoint
-- Only live resolutions may be mutated. Final records require a new resolution,
-- not a silent overwrite. RLS supplements, never replaces, service authorization.
CREATE POLICY resolutions_live_update ON resolutions AS RESTRICTIVE FOR UPDATE
  USING (status IN ('DRAFT', 'TABLED', 'VOTED')) WITH CHECK (true);
CREATE POLICY resolution_votes_live_insert ON resolution_votes AS RESTRICTIVE FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM resolutions r WHERE r.id = resolution_id AND r.status IN ('DRAFT', 'TABLED', 'VOTED')));
CREATE POLICY resolution_votes_live_update ON resolution_votes AS RESTRICTIVE FOR UPDATE
  USING (EXISTS (SELECT 1 FROM resolutions r WHERE r.id = resolution_id AND r.status IN ('DRAFT', 'TABLED', 'VOTED')))
  WITH CHECK (EXISTS (SELECT 1 FROM resolutions r WHERE r.id = resolution_id AND r.status IN ('DRAFT', 'TABLED', 'VOTED')));
