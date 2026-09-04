-- Restore the prior definition (unpinned search_path) — behavior identical.
CREATE OR REPLACE FUNCTION beyu_identity.tenant_matches_boundary(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
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
