-- CANONICAL NAMESPACE ALIGNMENT — `*.beyuos.co.tz` → `*.beyu.co.tz`.
--
-- WHAT THIS DOES
--   Moves the two PLATFORM NAMESPACE BASES on the governed tenant-domain
--   registry into the canonical apex the rest of BEYU OS uses:
--
--     health.beyuos.co.tz        (OS_BASE)         → health.beyu.co.tz
--     familyoffice.beyuos.co.tz  (CAPABILITY_BASE) → familyoffice.beyu.co.tz
--
--   These two rows are namespace MARKERS. They define the governed namespace
--   (`<tenant>.health.beyu.co.tz`) and carry NO tenant context themselves. The
--   rename therefore changes zero tenant bindings and grants nothing: resolution
--   still only ever RESTRICTS tenant context, and a hostname remains
--   non-authoritative.
--
-- WHY THIS IS A NEW MIGRATION AND NOT AN EDIT TO 0063/0065
--   `scripts/migrate.ts` records a sha256 checksum per applied migration and
--   aborts with `Migration checksum drift` when a file's bytes change. 0063 and
--   0065 are already applied on every existing database, including production,
--   so editing either of them would make `npm run migrate` fail for every
--   deployment. The schema is expand-only and history is immutable: the
--   correction ships FORWARD, as 0082.
--
-- WHY THE NAMESPACE MUST MOVE (the defect this closes)
--   The canonical host contract (`src/lib/canonical-hosts.ts`) resolves
--   `health.beyu.co.tz` → HEALTH_OS, `familyoffice.beyu.co.tz` → FAMILY_OFFICE.
--   The Health OS mount (`src/app/os/health/mount.ts`) then applies a NAMESPACE
--   SCOPE gate: the request host must be platform-neutral OR belong to the
--   HEALTH_OS namespace as PROVEN by a registry row. With the registry naming
--   `beyuos.co.tz` and the canonical hosts using `beyu.co.tz`, the two disagreed,
--   so `health.beyu.co.tz` resolved canonically but was REFUSED by the namespace
--   gate — and the only host the gate accepted was one the product does not use.
--   Aligning the data with the code closes that contradiction. It does not by
--   itself widen access: the gate still refuses every unproven name.
--
-- ORDERING — WHY A FRESH INSTALL UPDATES NOTHING AND STILL ENDS CORRECT
--   Migrations run BEFORE the constitutional seed (`npm run migrate`, then
--   `npm run seed`). On a fresh database `tenants` is still empty at 0082, so both
--   UPDATEs match zero rows and the gated INSERTs insert nothing — the base rows
--   are created afterwards by `src/db/seed.ts`, which as of this change already
--   names the canonical apex. On an EXISTING database the rows are present, so the
--   UPDATEs do the work and the INSERTs are skipped by their `NOT EXISTS` guards.
--   Either way the end state is identical: one base row per namespace, on
--   `beyu.co.tz`. This mirrors how 0063/0065 bootstrap, and is why the verification
--   blocks assert "where a row exists" rather than "a row must exist".
--
-- IDEMPOTENT AND REVERSIBLE
--   Fixed ids, `WHERE hostname = <old>` guards, and `NOT EXISTS`-gated INSERTs. A
--   re-run changes nothing. Rollback is 0083.
--
-- SCOPE — ONLY THE TWO NAMESPACE BASES
--   No tenant BINDING row is touched. Any `<tenant>.health.beyuos.co.tz` row that
--   exists is deployment-specific data that is ALSO auto-suspended when its base
--   is deactivated (see migration 0065): leaving those rows alone is what keeps
--   every tenant binding exactly as authorized, and gives a tenant an explicit,
--   reviewable re-registration path under the new namespace instead of a silent
--   rewrite of the hostname a tenant was verified for.
--
-- NO DESTRUCTIVE STATEMENT
--   Nothing is removed and nothing is dropped: two UPDATEs and a gated
--   INSERT … SELECT. (The absence of destructive SQL is asserted by
--   tests/tenant-domain/canonical-namespace-alignment.test.ts.)

--> statement-breakpoint
-- Fail closed on ambiguity: if a database somehow already carries a row on the
-- target hostname (a hand-registered binding under the canonical namespace), the
-- rename would collide with the GLOBAL unique index. Refuse loudly instead of
-- leaving the registry in a state where one namespace has two bases.
DO $$
DECLARE
  old_health  text := 'health.beyuos.co.tz';
  new_health  text := 'health.beyu.co.tz';
  old_family  text := 'familyoffice.beyuos.co.tz';
  new_family  text := 'familyoffice.beyu.co.tz';
  target_taken int;
BEGIN
  SELECT count(*) INTO target_taken FROM tenant_domains
  WHERE hostname IN (new_health, new_family)
    AND id NOT IN ('TDM_HEALTH_OS_BASE', 'TDM_FAMILY_OFFICE_CAPABILITY_BASE');
  IF target_taken > 0 THEN
    RAISE EXCEPTION
      'Migration 0082 cannot proceed: % row(s) already occupy % or % and are not the canonical namespace bases. Reconcile the registry by hand before re-running; no automatic overwrite is performed.',
      target_taken, new_health, new_family;
  END IF;
END $$;

--> statement-breakpoint
-- The Health OS base. The row identity (TDM_HEALTH_OS_BASE), owner tenant, OS
-- code, domain type, lifecycle status, verification posture, evidence and
-- classification are all PRESERVED — only the namespace string changes.
UPDATE tenant_domains
SET hostname = 'health.beyu.co.tz'
WHERE id = 'TDM_HEALTH_OS_BASE'
  AND hostname = 'health.beyuos.co.tz';

--> statement-breakpoint
-- The Family Office capability base, under the identical rule.
UPDATE tenant_domains
SET hostname = 'familyoffice.beyu.co.tz'
WHERE id = 'TDM_FAMILY_OFFICE_CAPABILITY_BASE'
  AND hostname = 'familyoffice.beyuos.co.tz';

--> statement-breakpoint
-- Bootstrap the canonical namespaces for a database that does not yet carry the
-- two bases at all (for example a predecessor schema that predates 0063/0065, or
-- a fresh install where the constitutional seed runs after the migrations). The
-- INSERT is skipped for any namespace whose base id already exists, so it can
-- never create a second base for the same namespace.
INSERT INTO "tenant_domains" (
  "id", "tenant_id", "os", "hostname", "domain_type", "status",
  "verification_state", "verification_method", "verification_evidence",
  "registered_by", "classification"
)
SELECT
  'TDM_HEALTH_OS_BASE', t.id, 'HEALTH_OS', 'health.beyu.co.tz',
  'OS_BASE', 'ACTIVE',
  'DOCUMENTED', 'PLATFORM_DEPLOYMENT_CONFIG',
  'deployment-platform:DNS + Vercel domain configuration (human-controlled; docs/architecture/TENANT_DOMAIN_ARCHITECTURE.md)',
  'SEED/CONSTITUTIONAL_BOOTSTRAP', 'INTERNAL'
FROM tenants t
WHERE t.code = 'BEYU-HEALTH'
  AND NOT EXISTS (SELECT 1 FROM tenant_domains WHERE id = 'TDM_HEALTH_OS_BASE')
  AND NOT EXISTS (SELECT 1 FROM tenant_domains WHERE hostname = 'health.beyu.co.tz')
ON CONFLICT ("id") DO NOTHING;

--> statement-breakpoint
INSERT INTO "tenant_domains" (
  "id", "tenant_id", "os", "hostname", "domain_type", "status",
  "verification_state", "verification_method", "verification_evidence",
  "registered_by", "classification"
)
SELECT
  'TDM_FAMILY_OFFICE_CAPABILITY_BASE', t.id, 'SHARED_FAMILY_OFFICE', 'familyoffice.beyu.co.tz',
  'CAPABILITY_BASE', 'ACTIVE',
  'DOCUMENTED', 'PLATFORM_DEPLOYMENT_CONFIG',
  'deployment-platform:DNS + Vercel domain configuration (human-controlled; docs/architecture/TENANT_DOMAIN_ARCHITECTURE.md)',
  'SEED/CONSTITUTIONAL_BOOTSTRAP', 'INTERNAL'
FROM tenants t
WHERE t.code = 'BEYU-GROUP'
  AND NOT EXISTS (SELECT 1 FROM tenant_domains WHERE id = 'TDM_FAMILY_OFFICE_CAPABILITY_BASE')
  AND NOT EXISTS (SELECT 1 FROM tenant_domains WHERE hostname = 'familyoffice.beyu.co.tz')
ON CONFLICT ("id") DO NOTHING;

--> statement-breakpoint
-- Verification 1 — WHERE A BASE ROW EXISTS, IT NAMES THE CANONICAL APEX.
--
-- The condition "where a row exists" is not a weakened assertion, it is the only
-- correct one at migration time. Migrations run BEFORE the constitutional seed and
-- the base rows are created by an INSERT … SELECT from `tenants`, so on a fresh
-- install the tenant rows do not exist yet and the bases are legitimately absent —
-- exactly how 0063 and 0065 already behave. Asserting presence here would make a
-- clean install un-migratable. What must never be tolerated is a base row that
-- still names the retired namespace, and that is what this block refuses.
--
-- The `ELSE` branches exist so the migration cannot pass by silently skipping: if a
-- row is present its identity, lifecycle and type are all re-asserted, and the
-- Family Office capability can never be promoted to an OS base by a namespace move.
DO $$
DECLARE
  health_row record;
  family_row record;
BEGIN
  SELECT hostname, os, domain_type, status INTO health_row
  FROM tenant_domains WHERE id = 'TDM_HEALTH_OS_BASE';
  IF FOUND THEN
    IF health_row.hostname <> 'health.beyu.co.tz' THEN
      RAISE EXCEPTION 'Migration 0082 verification failed: Health OS base is % (expected health.beyu.co.tz)', health_row.hostname;
    END IF;
    IF health_row.os <> 'HEALTH_OS' OR health_row.domain_type <> 'OS_BASE' THEN
      RAISE EXCEPTION 'Migration 0082 verification failed: Health base identity drifted (os=%, type=%)', health_row.os, health_row.domain_type;
    END IF;
    IF health_row.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'Migration 0082 verification failed: Health base is not ACTIVE (%)', health_row.status;
    END IF;
  END IF;

  SELECT hostname, os, domain_type INTO family_row
  FROM tenant_domains WHERE id = 'TDM_FAMILY_OFFICE_CAPABILITY_BASE';
  IF FOUND THEN
    IF family_row.hostname <> 'familyoffice.beyu.co.tz' THEN
      RAISE EXCEPTION 'Migration 0082 verification failed: Family Office base is % (expected familyoffice.beyu.co.tz)', family_row.hostname;
    END IF;
    -- Family Office must remain a SHARED CAPABILITY base; it can never become an
    -- OS base through a namespace move.
    IF family_row.os <> 'SHARED_FAMILY_OFFICE' OR family_row.domain_type <> 'CAPABILITY_BASE' THEN
      RAISE EXCEPTION 'Migration 0082 verification failed: Family Office identity drifted (os=%, type=%)', family_row.os, family_row.domain_type;
    END IF;
  END IF;
END $$;

--> statement-breakpoint
-- Verification 2 — no base row survives on the retired namespace. This is the
-- assertion that proves the alignment rather than assuming it. Tenant BINDING rows
-- under the old namespace are deliberately out of scope (see the header) and are
-- NOT asserted here.
DO $$
DECLARE
  leftover int;
BEGIN
  SELECT count(*) INTO leftover FROM tenant_domains
  WHERE domain_type IN ('OS_BASE', 'CAPABILITY_BASE')
    AND hostname IN ('health.beyuos.co.tz', 'familyoffice.beyuos.co.tz');
  IF leftover <> 0 THEN
    RAISE EXCEPTION 'Migration 0082 verification failed: % platform namespace base(s) still name the retired beyuos.co.tz namespace', leftover;
  END IF;
END $$;

--> statement-breakpoint
COMMENT ON TABLE tenant_domains IS 'Governed tenant-domain registry: one hostname → one canonical tenant/OS/capability. Platform namespace bases (OS_BASE, CAPABILITY_BASE) name a governed namespace and carry no tenant context; resolution only RESTRICTS tenant context, and a hostname is never authorization. As of 0082 the platform bases live on the canonical apex beyu.co.tz.';
