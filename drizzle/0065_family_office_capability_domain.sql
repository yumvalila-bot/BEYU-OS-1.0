-- FAMILY OFFICE CAPABILITY DOMAIN — `familyoffice.beyuos.co.tz`.
--
-- ARCHITECTURAL FACT THIS MIGRATION ENCODES
--   BEYU OS has ONE control plane, five SECTOR OSs (Finance, Health,
--   Agriculture, Foundation, Ujenzi) and a set of SHARED CAPABILITIES
--   implemented once inside BEYU OS — Family Office, HCM, Governance,
--   Risk/Compliance, Audit/Events, Workflow, Security and Noelia/HIVE.
--
--   Family Office is a SHARED CAPABILITY. It is NOT an OS:
--     • no FAMILY_OFFICE_OS registry code is created (asserted below),
--     • no Sector OS route is added, and the capability gains no route of its
--       own (`/os/family`, `/os/family/capital`, `/os/family/protection` are
--       control-plane capability pages, exactly as before),
--     • the Sector OS count stays FIVE (asserted below),
--     • the canonical registry entry remains
--       `os_registry.code = 'SHARED_FAMILY_OFFICE'`, `kind = 'SHARED_CAPABILITY'`,
--       whose own purpose text says "never a separate OS".
--
--   This migration therefore records `familyoffice.beyuos.co.tz` as a
--   CAPABILITY_BASE row: a governed NAMESPACE base domain that carries NO tenant
--   context and grants NO authority. It is the exact peer of the Health OS base
--   `health.beyuos.co.tz` (an OS_BASE row) with one difference: its canonical
--   registry entry is a SHARED_CAPABILITY, not a SECTOR_OS — and the resolver
--   enforces that correspondence in BOTH directions (an OS_BASE row for a
--   capability code, or a CAPABILITY_BASE row for an OS code, is refused).
--
-- WHAT IT CHANGES, IN FULL
--   1. the `tenant_domains` RLS policy is broadened so PLATFORM NAMESPACE BASES
--      (OS_BASE and CAPABILITY_BASE) stay readable by every session, exactly as
--      the OS base already was — they are public DNS facts of the platform and
--      carry no tenant data. TENANT rows are unaffected: the USING clause for
--      them is still `tenant_id = ANY (beyu_tenant_ids())`, and the WITH CHECK
--      clause is unchanged (tenant scope only), so the runtime still cannot write
--      this table at all (it holds SELECT only — migration 0063, asserted below);
--   2. the ONE capability base row for Family Office, owned by the enterprise
--      tenant (`BEYU-GROUP`), because the capability's canonical registry entry
--      declares `authorityScope = ENTERPRISE_WIDE`. The row is ACTIVE (the
--      application recognises the namespace) with
--      verification_state = DOCUMENTED + method PLATFORM_DEPLOYMENT_CONFIG:
--      deployment/DNS configuration performed by a human operator, which is NOT a
--      fabricated runtime DNS verification (see
--      docs/architecture/TENANT_DOMAIN_ARCHITECTURE.md);
--   3. verification blocks that fail the migration if the classification, the
--      RLS posture, the runtime grants, the five-OS invariant or the
--      "Family Office is not an OS" invariant is violated.
--
-- NOT DONE HERE — AND NOT CLAIMED
--   No DNS record, no certificate and no deployment-platform domain are created
--   or changed by this migration, and none of them are asserted to exist. See the
--   readiness table in docs/architecture/TENANT_DOMAIN_ARCHITECTURE.md:
--   APPLICATION readiness and DNS/DEPLOYMENT readiness are separate facts.

--> statement-breakpoint
-- Tenant bindings remain tenant-scoped; the platform namespace bases are readable
-- by every session so an unknown name inside a governed namespace can be
-- classified as "unknown tenant host, fail closed" instead of being mistaken for
-- an unrelated host. The write path is tenant scope only, unchanged.
DROP POLICY IF EXISTS tenant_domains_tenant_isolation ON tenant_domains;
CREATE POLICY tenant_domains_tenant_isolation ON tenant_domains
  USING (tenant_id = ANY (beyu_tenant_ids()) OR domain_type IN ('OS_BASE', 'CAPABILITY_BASE'))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
COMMENT ON TABLE tenant_domains IS 'Governed tenant-domain registry: one hostname → one canonical tenant/OS/capability. Platform namespace bases (OS_BASE, CAPABILITY_BASE) name a governed namespace and carry no tenant context; resolution only RESTRICTS tenant context, and a hostname is never authorization.';

--> statement-breakpoint
COMMENT ON COLUMN tenant_domains.os IS 'Canonical os_registry.code for the OS or shared capability this hostname belongs to (e.g. HEALTH_OS / SHARED_FAMILY_OFFICE). os_registry.kind remains the single source of truth for whether that code is a SECTOR_OS or a SHARED_CAPABILITY.';

--> statement-breakpoint
-- Bootstrap the Family Office capability base for EXISTING databases. Guarded on
-- the owner tenant's existence and idempotent by fixed id, so a fresh install
-- (where the constitutional seed creates the identical row after the migrations)
-- and an existing database converge on exactly one row.
INSERT INTO "tenant_domains" (
  "id", "tenant_id", "os", "hostname", "domain_type", "status",
  "verification_state", "verification_method", "verification_evidence",
  "registered_by", "classification"
)
SELECT
  'TDM_FAMILY_OFFICE_CAPABILITY_BASE', t.id, 'SHARED_FAMILY_OFFICE', 'familyoffice.beyuos.co.tz',
  'CAPABILITY_BASE', 'ACTIVE',
  'DOCUMENTED', 'PLATFORM_DEPLOYMENT_CONFIG',
  'deployment-platform:DNS + Vercel domain configuration (human-controlled; docs/architecture/TENANT_DOMAIN_ARCHITECTURE.md)',
  'SEED/CONSTITUTIONAL_BOOTSTRAP', 'INTERNAL'
FROM tenants t WHERE t.code = 'BEYU-GROUP'
ON CONFLICT ("id") DO NOTHING;

--> statement-breakpoint
-- Verification 1: the classification is present and the platform-base visibility
-- clause covers BOTH base types, so a capability base cannot silently become
-- invisible (which would make an unproven name under it look like an unrelated
-- host and weaken the fail-closed classification).
DO $$
DECLARE
  labels text[];
  policy_using text;
BEGIN
  SELECT array_agg(enumlabel) INTO labels
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'beyu_domain_type';
  IF NOT ('CAPABILITY_BASE' = ANY (labels)) THEN
    RAISE EXCEPTION 'Migration 0065 verification failed: CAPABILITY_BASE missing from beyu_domain_type (%)', labels;
  END IF;

  SELECT pg_get_expr(polqual, polrelid) INTO policy_using
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
  WHERE c.relname = 'tenant_domains' AND p.polname = 'tenant_domains_tenant_isolation';
  IF policy_using IS NULL THEN
    RAISE EXCEPTION 'Migration 0065 verification failed: tenant_domains_tenant_isolation policy missing';
  END IF;
  IF policy_using NOT LIKE '%beyu_tenant_ids()%'
     OR policy_using NOT LIKE '%OS_BASE%'
     OR policy_using NOT LIKE '%CAPABILITY_BASE%' THEN
    RAISE EXCEPTION 'Migration 0065 verification failed: policy must keep tenant isolation AND platform-base visibility (got %)', policy_using;
  END IF;
END $$;

--> statement-breakpoint
-- Verification 2: Family Office is a SHARED CAPABILITY, never an OS — and the
-- Sector OS set is still exactly the canonical five. This block fails the
-- migration if a future edit ever promotes Family Office (or any other shared
-- capability) into an operating system, or if a capability base row is bound to
-- a code the registry does not declare as a SHARED_CAPABILITY.
DO $$
DECLARE
  sector_count int;
  forbidden_os int;
  fo_kind text;
  base_kind text;
BEGIN
  -- A FRESH database has no `os_registry` rows yet: migrations run BEFORE the
  -- constitutional seed, which is the only thing that inserts them. There is then
  -- nothing to contradict — and the invariants below are asserted again on every
  -- later run of this migration and by tests/tenant-domain. On a populated
  -- database every check is unconditional.
  IF EXISTS (SELECT 1 FROM os_registry) THEN
    SELECT count(*) INTO sector_count
    FROM os_registry WHERE kind = 'SECTOR_OS' AND lifecycle = 'ACTIVE';
    IF sector_count <> 5 THEN
      RAISE EXCEPTION 'Migration 0065 verification failed: expected exactly 5 ACTIVE SECTOR_OS entries, found %', sector_count;
    END IF;

    SELECT count(*) INTO forbidden_os
    FROM os_registry
    WHERE code IN ('FAMILY_OFFICE_OS', 'FAMILY_OS', 'SHARED_FAMILY_OFFICE_OS') OR code LIKE 'FAMILY%OS';
    IF forbidden_os <> 0 THEN
      RAISE EXCEPTION 'Migration 0065 verification failed: Family Office must never be registered as an OS';
    END IF;

    SELECT kind INTO fo_kind FROM os_registry WHERE code = 'SHARED_FAMILY_OFFICE';
    IF fo_kind IS NULL THEN
      RAISE EXCEPTION 'Migration 0065 verification failed: canonical registry entry SHARED_FAMILY_OFFICE is missing';
    END IF;
    IF fo_kind <> 'SHARED_CAPABILITY' THEN
      RAISE EXCEPTION 'Migration 0065 verification failed: SHARED_FAMILY_OFFICE must be a SHARED_CAPABILITY (found %)', fo_kind;
    END IF;

    -- Every CAPABILITY_BASE row must point at a SHARED_CAPABILITY, and every
    -- OS_BASE row at a SECTOR_OS. A mismatch would let a capability present itself
    -- as an operating system (or the reverse) through the domain registry alone.
    SELECT r.kind INTO base_kind
    FROM tenant_domains d JOIN os_registry r ON r.code = d.os
    WHERE d.domain_type = 'CAPABILITY_BASE' AND r.kind <> 'SHARED_CAPABILITY'
    LIMIT 1;
    IF base_kind IS NOT NULL THEN
      RAISE EXCEPTION 'Migration 0065 verification failed: a CAPABILITY_BASE row is bound to a % code', base_kind;
    END IF;

    SELECT r.kind INTO base_kind
    FROM tenant_domains d JOIN os_registry r ON r.code = d.os
    WHERE d.domain_type = 'OS_BASE' AND r.kind <> 'SECTOR_OS'
    LIMIT 1;
    IF base_kind IS NOT NULL THEN
      RAISE EXCEPTION 'Migration 0065 verification failed: an OS_BASE row is bound to a % code', base_kind;
    END IF;
  END IF;
END $$;

--> statement-breakpoint
-- Verification 3: the capability base row is present on a database that already
-- has the enterprise tenant (a FRESH install legitimately has no tenants yet and
-- receives the identical row from the constitutional seed immediately after the
-- migrations), and the runtime role still holds exactly SELECT on the registry.
DO $$
DECLARE
  r record;
  privileges text;
  enterprise_exists boolean;
  base_owner text;
  base_type text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM tenants WHERE code = 'BEYU-GROUP') INTO enterprise_exists;
  IF enterprise_exists THEN
    SELECT t.code, d.domain_type INTO base_owner, base_type
    FROM tenant_domains d JOIN tenants t ON t.id = d.tenant_id
    WHERE d.id = 'TDM_FAMILY_OFFICE_CAPABILITY_BASE';
    IF base_owner IS NULL THEN
      RAISE EXCEPTION 'Migration 0065 verification failed: familyoffice.beyuos.co.tz capability base row is missing';
    END IF;
    IF base_owner <> 'BEYU-GROUP' OR base_type <> 'CAPABILITY_BASE' THEN
      RAISE EXCEPTION 'Migration 0065 verification failed: capability base must be owned by the enterprise tenant as CAPABILITY_BASE (owner %, type %)', base_owner, base_type;
    END IF;
  END IF;

  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) INTO privileges
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'tenant_domains' AND grantee = r.rolname;
    IF privileges IS DISTINCT FROM 'SELECT' THEN
      RAISE EXCEPTION 'Migration 0065 verification failed: % must hold SELECT only on tenant_domains (found %)', r.rolname, privileges;
    END IF;
  END LOOP;
END $$;
