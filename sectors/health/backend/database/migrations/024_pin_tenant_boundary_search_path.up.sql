-- Migration 024: pin the search_path on the SECURITY DEFINER boundary function
--
-- Phase 8.5 RLS/privilege audit: beyu_identity.tenant_matches_boundary() is
-- SECURITY DEFINER but did not pin its search_path. The body is fully
-- schema-qualified (beyu_identity.tenants), so there is no exploitable
-- resolution today — but an unpinned search_path on a definer function is a
-- standing hazard (any future edit that adds an unqualified reference becomes
-- hijackable by a hostile schema earlier in the caller's search_path).
-- CREATE OR REPLACE with the pinned path; no behavior change.
CREATE OR REPLACE FUNCTION beyu_identity.tenant_matches_boundary(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = beyu_identity, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM beyu_identity.tenants t
     WHERE t.tenant_id = p_tenant
       AND (
             t.beyu_tenant_id IS NULL
          OR (t.country_code = current_setting('app.country_code', true)
              AND t.entity_code = current_setting('app.entity_code', true))
       )
  );
$function$;
