-- GOVERNED TENANT-DOMAIN REGISTRY — the ONE source of truth for
-- hostname → tenant mapping (Health OS tenant domains first).
--
-- WHY (Phase 1, governed Health OS tenant domains)
--   A Health OS tenant must be reachable at a hostname that the APPLICATION —
--   not a proxy, not a hostname string comparison, not a deployment hack — can
--   resolve to exactly one canonical tenant. This migration creates that
--   registry: one table, one unique hostname per tenant/OS, governed lifecycle,
--   audit-covered mutations, RLS end to end. No new OS, no new tenant system,
--   no new identity model, no new authorization boundary.
--
-- WHAT A DOMAIN ROW IS
--   id · tenant_id (canonical tenant) · os (canonical OS registry code) ·
--   entity_id (optional legal entity of that tenant) · country_code (canonical
--   country) · hostname (globally unique, normalised) · domain_type
--   (OS_BASE | TENANT_SUBDOMAIN | CUSTOM_DOMAIN) · status (lifecycle) ·
--   verification_state (UNVERIFIED | DOCUMENTED | VERIFIED | DISPUTED) ·
--   verification_method · verification_token_hash (challenge, cleared on
--   verification) · verification_evidence · registered_by · verified_by/at ·
--   classification · timestamps.
--
-- CONSTITUTIONAL INVARIANTS (mirroring 0031/0034/0035/0043/0062)
--   * the table is tenant-owned (tenant_id FK to tenants) with a classification;
--   * ENABLE + FORCE ROW LEVEL SECURITY with a beyu_tenant_ids() policy — RLS
--     stays the final database boundary and is NOT bypassed by any resolution
--     path (there is deliberately NO SECURITY DEFINER escape hatch here);
--   * the runtime role receives SELECT/INSERT/UPDATE and NO DELETE: a domain is
--     retired by lifecycle status, never erased (audit/legal attribution);
--   * a hostname NEVER grants access. Applying this migration is not
--     authorization: every request still re-runs session → federation/OS
--     authorization → tenant/entity/country scope → RBAC/ABAC/policy → RLS.
--
-- HONESTY NOTE ON DNS
--   This migration makes a hostname RECOGNISABLE by the application. It does
--   NOT create DNS records, wildcard certificates or deployment-platform domain
--   configuration, and it does not claim they exist. Those are human-controlled
--   platform steps documented in docs/architecture/TENANT_DOMAIN_ARCHITECTURE.md.
--   The seeded OS_BASE row is recorded as PLATFORM_DEPLOYMENT_CONFIG/DOCUMENTED
--   — deployment configuration, never a fabricated runtime DNS verification.
--
-- Verification blocks at the end FAIL the migration if the table, its RLS
-- posture, its policies, its constraints or the runtime grants are wrong.

--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'beyu_domain_type') THEN
    CREATE TYPE beyu_domain_type AS ENUM ('OS_BASE', 'TENANT_SUBDOMAIN', 'CUSTOM_DOMAIN');
  END IF;
END
$$;

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS tenant_domains (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  os TEXT NOT NULL,
  entity_id TEXT REFERENCES legal_entities(id),
  country_code TEXT REFERENCES countries(code),
  hostname TEXT NOT NULL,
  domain_type beyu_domain_type NOT NULL,
  status beyu_lifecycle_status NOT NULL DEFAULT 'CREATED',
  verification_state beyu_verification_status NOT NULL DEFAULT 'UNVERIFIED',
  verification_method TEXT NOT NULL DEFAULT 'DNS_TXT',
  verification_token_hash TEXT,
  verification_evidence TEXT,
  registered_by TEXT NOT NULL,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  classification beyu_classification NOT NULL DEFAULT 'CONFIDENTIAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_domains_hostname_ck CHECK (
    hostname = lower(hostname)
    AND length(hostname) BETWEEN 4 AND 253
    AND hostname ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  ),
  CONSTRAINT tenant_domains_os_ck CHECK (os ~ '^[A-Z][A-Z0-9_]*$'),
  CONSTRAINT tenant_domains_verified_ck CHECK ((verification_state = 'VERIFIED') = (verified_at IS NOT NULL)),
  CONSTRAINT tenant_domains_token_ck CHECK (verification_state <> 'VERIFIED' OR verification_token_hash IS NULL)
);
-- One hostname, one tenant: globally unique, so a tenant slug cannot collide
-- with another tenant's and no hostname can ever be owned by two OSs at once.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_domains_hostname_uidx ON tenant_domains (hostname);
CREATE INDEX IF NOT EXISTS tenant_domains_tenant_idx ON tenant_domains (tenant_id);
CREATE INDEX IF NOT EXISTS tenant_domains_os_idx ON tenant_domains (os);
CREATE INDEX IF NOT EXISTS tenant_domains_type_status_idx ON tenant_domains (domain_type, status);

--> statement-breakpoint
COMMENT ON TABLE tenant_domains IS 'Governed tenant-domain registry: one hostname → one canonical tenant/OS. Resolution only RESTRICTS tenant context; a hostname is never authorization.';

--> statement-breakpoint
DO $$
DECLARE
  t text := 'tenant_domains';
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
  -- Tenant rows are visible only inside the session's tenant scope. OS_BASE rows
  -- additionally describe the platform's own OS namespaces: their hostnames are
  -- public DNS facts and are needed to classify an unknown tenant name as
  -- "inside a registered OS namespace, therefore fail closed" instead of
  -- silently treating it as an unrelated host. They carry no tenant context and
  -- no data: the row-level check below still governs every tenant row, and the
  -- write path (WITH CHECK) is tenant scope only.
  EXECUTE format(
    'CREATE POLICY %I ON %I USING (tenant_id = ANY (beyu_tenant_ids()) OR domain_type = ''OS_BASE'') WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))',
    t || '_tenant_isolation', t);
END
$$;

--> statement-breakpoint
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    -- SELECT ONLY. The tenant→hostname binding is configuration that governs the
    -- runtime, so the runtime credential must not be able to change it (F-01
    -- direction: os_registry / role_assignments are runtime-immutable). Governed
    -- lifecycle mutations run through the EXISTING admin-DSN boundary inside the
    -- audited administrative service, exactly like role grants.
    EXECUTE format('GRANT SELECT ON tenant_domains TO %I', r.rolname);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON tenant_domains FROM %I', r.rolname);
  END LOOP;
END
$$;

--> statement-breakpoint
/* ---- Canonical permission catalogue mirror (fresh rows for existing DBs;
   fresh installs get the identical rows from the seed). ---- */
INSERT INTO "permissions" ("code", "domain", "action", "description", "classification_ceiling", "requires_mfa", "high_risk")
VALUES
  ('organization:tenantdomain.read', 'organization', 'tenantdomain.read', 'Read the governed tenant-domain registry (hostname → tenant mapping) within scope', 'CONFIDENTIAL', false, false),
  ('organization:tenantdomain.register', 'organization', 'tenantdomain.register', 'Register a hostname for an existing operational tenant (creates no tenant)', 'CONFIDENTIAL', false, false),
  ('organization:tenantdomain.verify', 'organization', 'tenantdomain.verify', 'Record proof of control of a registered hostname (live DNS TXT verification, fail-closed)', 'CONFIDENTIAL', false, false),
  ('organization:tenantdomain.manage', 'organization', 'tenantdomain.manage', 'Transition a tenant domain lifecycle (activate, suspend, retire)', 'CONFIDENTIAL', false, false),
  ('organization:tenantdomain.reassign', 'organization', 'tenantdomain.reassign', 'Move a suspended tenant domain to another in-scope tenant (never while ACTIVE)', 'CONFIDENTIAL', true, true)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
/*
 * The role-permission mirror is written with INSERT … SELECT guarded on the
 * role's existence, NOT a bare VALUES insert: on a FRESH install the runner
 * executes migrations BEFORE the constitutional seed creates the roles, so a
 * bare insert would violate the roles foreign key. Fresh installs therefore
 * skip these rows entirely and receive the IDENTICAL rows from the seed
 * (identical fixed ids, onConflictDoNothing); EXISTING databases — where the
 * roles pre-date this migration — receive the mirror here so the parity check
 * (assertPermissionCatalogParity) stays truthful without a re-seed.
 *
 * Distribution mirrors organization:tenant.* — PLATFORM_ADMIN holds the complete
 * administrative set including reassignment; GROUP_CEO (the enterprise
 * administrator) holds read/register/verify/manage but NOT reassignment, the same
 * way it holds tenant.register/manage but not tenant.remove.
 */
INSERT INTO "role_permissions" ("id", "role_id", "permission_code")
SELECT 'RPM_PLATFORM_ADMIN_ORGANIZATION_TENANTDOMAIN_READ', r.id, 'organization:tenantdomain.read' FROM roles r WHERE r.code = 'PLATFORM_ADMIN'
UNION ALL SELECT 'RPM_PLATFORM_ADMIN_ORGANIZATION_TENANTDOMAIN_REGISTER', r.id, 'organization:tenantdomain.register' FROM roles r WHERE r.code = 'PLATFORM_ADMIN'
UNION ALL SELECT 'RPM_PLATFORM_ADMIN_ORGANIZATION_TENANTDOMAIN_VERIFY', r.id, 'organization:tenantdomain.verify' FROM roles r WHERE r.code = 'PLATFORM_ADMIN'
UNION ALL SELECT 'RPM_PLATFORM_ADMIN_ORGANIZATION_TENANTDOMAIN_MANAGE', r.id, 'organization:tenantdomain.manage' FROM roles r WHERE r.code = 'PLATFORM_ADMIN'
UNION ALL SELECT 'RPM_PLATFORM_ADMIN_ORGANIZATION_TENANTDOMAIN_REASSIGN', r.id, 'organization:tenantdomain.reassign' FROM roles r WHERE r.code = 'PLATFORM_ADMIN'
UNION ALL SELECT 'RPM_GROUP_CEO_ORGANIZATION_TENANTDOMAIN_READ', r.id, 'organization:tenantdomain.read' FROM roles r WHERE r.code = 'GROUP_CEO'
UNION ALL SELECT 'RPM_GROUP_CEO_ORGANIZATION_TENANTDOMAIN_REGISTER', r.id, 'organization:tenantdomain.register' FROM roles r WHERE r.code = 'GROUP_CEO'
UNION ALL SELECT 'RPM_GROUP_CEO_ORGANIZATION_TENANTDOMAIN_VERIFY', r.id, 'organization:tenantdomain.verify' FROM roles r WHERE r.code = 'GROUP_CEO'
UNION ALL SELECT 'RPM_GROUP_CEO_ORGANIZATION_TENANTDOMAIN_MANAGE', r.id, 'organization:tenantdomain.manage' FROM roles r WHERE r.code = 'GROUP_CEO'
ON CONFLICT ("id") DO NOTHING;

--> statement-breakpoint
/*
 * Bootstrap the ONE OS base domain that exists today: the Health OS base
 * `health.beyuos.co.tz`, owned by the canonical Health OS tenant
 * (BEYU-HEALTH). It defines the tenant-subdomain NAMESPACE
 * (<tenant-slug>.health.beyuos.co.tz) and carries NO tenant context itself.
 *
 * Status ACTIVE = "the application recognises this OS namespace".
 * verification_state DOCUMENTED + method PLATFORM_DEPLOYMENT_CONFIG = the base
 * is deployment/DNS configuration performed by a human operator — NOT a
 * fabricated runtime DNS verification (see the honesty note in the header).
 *
 * Guarded on the tenant's existence and idempotent by fixed id, so a fresh
 * install (where the seed creates the identical row) and an existing database
 * converge on one row.
 */
INSERT INTO "tenant_domains" (
  "id", "tenant_id", "os", "hostname", "domain_type", "status",
  "verification_state", "verification_method", "verification_evidence",
  "registered_by", "classification"
)
SELECT
  'TDM_HEALTH_OS_BASE', t.id, 'HEALTH_OS', 'health.beyuos.co.tz', 'OS_BASE', 'ACTIVE',
  'DOCUMENTED', 'PLATFORM_DEPLOYMENT_CONFIG',
  'deployment-platform:DNS + Vercel domain configuration (human-controlled; docs/architecture/TENANT_DOMAIN_ARCHITECTURE.md)',
  'SEED/CONSTITUTIONAL_BOOTSTRAP', 'INTERNAL'
FROM tenants t WHERE t.code = 'BEYU-HEALTH'
ON CONFLICT ("id") DO NOTHING;

--> statement-breakpoint
-- Verification 1: the table exists with ENABLE + FORCE RLS and the isolation
-- policy present; a missing policy would leave the registry unprotected.
DO $$
DECLARE
  rls_enabled boolean;
  rls_forced boolean;
  policy_count int;
  base_read_clause int;
BEGIN
  SELECT c.relrowsecurity, c.relforcerowsecurity INTO rls_enabled, rls_forced
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'tenant_domains' AND c.relkind = 'r';
  IF rls_enabled IS NULL THEN
    RAISE EXCEPTION 'Migration 0063 verification failed: tenant_domains does not exist';
  END IF;
  IF NOT rls_enabled OR NOT rls_forced THEN
    RAISE EXCEPTION 'Migration 0063 verification failed: tenant_domains must have ENABLE + FORCE ROW LEVEL SECURITY';
  END IF;
  SELECT count(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'tenant_domains' AND qual LIKE '%beyu_tenant_ids()%';
  IF policy_count = 0 THEN
    RAISE EXCEPTION 'Migration 0063 verification failed: tenant_domains missing beyu_tenant_ids() policy';
  END IF;
  SELECT count(*) INTO base_read_clause
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'tenant_domains' AND qual LIKE '%OS_BASE%';
  IF base_read_clause = 0 THEN
    RAISE EXCEPTION 'Migration 0063 verification failed: tenant_domains OS_BASE namespace visibility clause missing';
  END IF;
END $$;

--> statement-breakpoint
-- Verification 2: the discriminating constraints and the global hostname
-- uniqueness exist, so an unprotected or ambiguous registry cannot ship.
DO $$
DECLARE
  expected_count int;
  actual_count int;
  hostname_unique int;
BEGIN
  SELECT count(*) INTO expected_count FROM unnest(ARRAY[
    'tenant_domains_hostname_ck',
    'tenant_domains_os_ck',
    'tenant_domains_verified_ck',
    'tenant_domains_token_ck'
  ]);
  SELECT count(*) INTO actual_count
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND t.relname = 'tenant_domains' AND c.contype = 'c'
    AND c.conname IN (
      'tenant_domains_hostname_ck', 'tenant_domains_os_ck',
      'tenant_domains_verified_ck', 'tenant_domains_token_ck'
    );
  IF actual_count <> expected_count THEN
    RAISE EXCEPTION 'Migration 0063 verification failed: expected % CHECK constraints on tenant_domains, found %', expected_count, actual_count;
  END IF;
  SELECT count(*) INTO hostname_unique
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'tenant_domains'
    AND indexname = 'tenant_domains_hostname_uidx'
    AND indexdef LIKE 'CREATE UNIQUE INDEX%';
  IF hostname_unique <> 1 THEN
    RAISE EXCEPTION 'Migration 0063 verification failed: tenant_domains_hostname_uidx missing or not unique';
  END IF;
END $$;

--> statement-breakpoint
-- Verification 3: the runtime role holds SELECT ONLY on the registry. The
-- hostname binding governs the runtime, so the runtime credential must not be
-- able to insert, update or delete it; a broader grant is a failure, not a
-- warning.
DO $$
DECLARE
  r record;
  privileges text;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) INTO privileges
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'tenant_domains' AND grantee = r.rolname;
    IF privileges IS NULL THEN
      RAISE EXCEPTION 'Migration 0063 verification failed: no grants on tenant_domains for %', r.rolname;
    END IF;
    IF privileges <> 'SELECT' THEN
      RAISE EXCEPTION 'Migration 0063 verification failed: % must hold SELECT only on tenant_domains (found %)', r.rolname, privileges;
    END IF;
  END LOOP;
END $$;
