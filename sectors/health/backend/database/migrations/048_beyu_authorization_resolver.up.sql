-- 048 — Health-local assertion bootstrap resolver.
-- Apply as the privileged migration role. The runtime role must never own this
-- function or the identity tables; it receives EXECUTE only.
DO $migration$
BEGIN
  IF current_user = 'beyu_health_runtime' THEN
    RAISE EXCEPTION '048 must be applied by the privileged Health migration role, not beyu_health_runtime';
  END IF;
END
$migration$;

CREATE OR REPLACE FUNCTION beyu_identity.resolve_beyu_authorization(
  p_beyu_user_id text,
  p_beyu_tenant_id text
)
RETURNS TABLE (
  decision_code text,
  global_user_id uuid,
  email text,
  display_name text,
  security_version integer,
  tenant_id uuid,
  role text,
  country_code text,
  entity_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, beyu_identity
AS $function$
  WITH resolved AS (
    SELECT
      l.global_user_id AS linked_user_id,
      l.status AS link_status,
      u.global_user_id AS user_id,
      u.email,
      u.display_name,
      u.security_version,
      u.account_status,
      t.tenant_id,
      t.status AS tenant_status,
      t.country_code,
      t.entity_code,
      m.status AS membership_status,
      m.role
    FROM (SELECT 1) AS seed
    LEFT JOIN beyu_identity.beyu_identity_links AS l
      ON l.beyu_user_id = p_beyu_user_id
    LEFT JOIN beyu_identity.users AS u
      ON u.global_user_id = l.global_user_id
    LEFT JOIN beyu_identity.tenants AS t
      ON t.beyu_tenant_id = p_beyu_tenant_id
    LEFT JOIN beyu_identity.tenant_memberships AS m
      ON m.global_user_id = u.global_user_id
     AND m.tenant_id = t.tenant_id
  ),
  evaluated AS (
    SELECT *,
      CASE
        WHEN linked_user_id IS NULL OR link_status IS DISTINCT FROM 'active'
          THEN 'HEALTH_IDENTITY_LINK_NOT_ACTIVE'
        WHEN user_id IS NULL OR account_status IS DISTINCT FROM 'active'
          THEN 'HEALTH_LOCAL_ACCOUNT_NOT_ACTIVE'
        WHEN tenant_id IS NULL OR tenant_status IS DISTINCT FROM 'active'
          THEN 'HEALTH_TENANT_NOT_ACTIVE_OR_LINKED'
        WHEN membership_status IS DISTINCT FROM 'active'
          THEN 'HEALTH_LOCAL_MEMBERSHIP_NOT_ACTIVE'
        ELSE 'AUTHORIZED'
      END AS decision
    FROM resolved
  )
  SELECT
    decision,
    CASE WHEN decision = 'AUTHORIZED' THEN user_id END,
    CASE WHEN decision = 'AUTHORIZED' THEN email END,
    CASE WHEN decision = 'AUTHORIZED' THEN display_name END,
    CASE WHEN decision = 'AUTHORIZED' THEN security_version END,
    CASE WHEN decision = 'AUTHORIZED' THEN tenant_id END,
    CASE WHEN decision = 'AUTHORIZED' THEN role END,
    CASE WHEN decision = 'AUTHORIZED' THEN country_code END,
    CASE WHEN decision = 'AUTHORIZED' THEN entity_code END
  FROM evaluated;
$function$;

REVOKE ALL ON FUNCTION beyu_identity.resolve_beyu_authorization(text, text) FROM PUBLIC;
DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'beyu_health_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA beyu_identity TO beyu_health_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION beyu_identity.resolve_beyu_authorization(text, text) TO beyu_health_runtime';
  END IF;
END
$grant$;


DO $ownership$
DECLARE
  resolver_owner text;
  resolver_owner_bypass boolean;
BEGIN
  SELECT pg_get_userbyid(p.proowner), (r.rolsuper OR r.rolbypassrls)
    INTO resolver_owner, resolver_owner_bypass
    FROM pg_proc p
    JOIN pg_roles r ON r.oid = p.proowner
   WHERE p.oid = 'beyu_identity.resolve_beyu_authorization(text,text)'::regprocedure;

  -- The resolver is a narrow SECURITY DEFINER boundary. Its owner must be a
  -- privileged migration principal with RLS bypass, never the application role.
  IF resolver_owner = 'beyu_health_runtime'
     OR resolver_owner_bypass IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      '048 blocked: resolver owner must be a privileged BYPASSRLS migration principal, never beyu_health_runtime';
  END IF;
END
$ownership$;
