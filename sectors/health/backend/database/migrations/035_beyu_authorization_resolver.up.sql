-- 035 — Health-local assertion bootstrap resolver.
-- Apply as the privileged migration role. The runtime role must never own this
-- function or the identity tables; it receives EXECUTE only.
DO $migration$
BEGIN
  IF current_user = 'beyu_health_runtime' THEN
    RAISE EXCEPTION '035 must be applied by the privileged Health migration role, not beyu_health_runtime';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'beyu_health_runtime') THEN
    RAISE EXCEPTION '035 requires the provisioned beyu_health_runtime role';
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
  role text
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
    CASE WHEN decision = 'AUTHORIZED' THEN role END
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

GRANT USAGE ON SCHEMA beyu_identity TO beyu_health_runtime;
GRANT EXECUTE ON FUNCTION beyu_identity.resolve_beyu_authorization(text, text)
  TO beyu_health_runtime;

DO $ownership$
DECLARE
  resolver_owner text;
  users_owner text;
  tenants_owner text;
  memberships_owner text;
  links_owner text;
BEGIN
  SELECT pg_get_userbyid(p.proowner) INTO resolver_owner
    FROM pg_proc p
   WHERE p.oid = 'beyu_identity.resolve_beyu_authorization(text,text)'::regprocedure;
  SELECT pg_get_userbyid(c.relowner) INTO users_owner
    FROM pg_class c WHERE c.oid = 'beyu_identity.users'::regclass;
  SELECT pg_get_userbyid(c.relowner) INTO tenants_owner
    FROM pg_class c WHERE c.oid = 'beyu_identity.tenants'::regclass;
  SELECT pg_get_userbyid(c.relowner) INTO memberships_owner
    FROM pg_class c WHERE c.oid = 'beyu_identity.tenant_memberships'::regclass;
  SELECT pg_get_userbyid(c.relowner) INTO links_owner
    FROM pg_class c WHERE c.oid = 'beyu_identity.beyu_identity_links'::regclass;

  IF resolver_owner = 'beyu_health_runtime'
     OR resolver_owner IS DISTINCT FROM users_owner
     OR resolver_owner IS DISTINCT FROM tenants_owner
     OR resolver_owner IS DISTINCT FROM memberships_owner
     OR resolver_owner IS DISTINCT FROM links_owner THEN
    RAISE EXCEPTION
      '035 blocked: resolver must be owned by the privileged identity-table owner, never beyu_health_runtime';
  END IF;
END
$ownership$;
