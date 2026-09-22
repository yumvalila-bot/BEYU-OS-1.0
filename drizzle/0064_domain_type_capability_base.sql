-- SHARED-CAPABILITY BASE DOMAINS — the domain-type classification only.
--
-- WHY THIS IS A SEPARATE, SINGLE-STATEMENT MIGRATION
--   `beyu_domain_type` gains one value: CAPABILITY_BASE. PostgreSQL permits
--   `ALTER TYPE … ADD VALUE` inside a transaction block, but FORBIDS USING the
--   new value before that transaction commits (`unsafe use of new value … of
--   enum type`). The migration runner applies each file in its own transaction
--   (scripts/migrate.ts), so the classification is added here and USED by the
--   next migration (0065), which is a different transaction. Folding both into
--   one file would make the migration fail on every database.
--
-- WHAT IT MEANS
--   OS_BASE          → the base origin of a SECTOR OS (e.g. health.beyuos.co.tz)
--   CAPABILITY_BASE  → the base origin of a SHARED CAPABILITY
--                      (e.g. familyoffice.beyuos.co.tz)
--   TENANT_SUBDOMAIN → a tenant's name inside one of those namespaces
--   CUSTOM_DOMAIN    → an externally owned name mapped to one tenant
--
--   OS_BASE and CAPABILITY_BASE are the PLATFORM NAMESPACE BASES. Both answer
--   "which governed namespace is this?" and NEVER "which tenant?": neither ever
--   yields a tenant context, and neither can be reached as an OS. The canonical
--   distinction between an operating system and a shared capability is NOT made
--   here — it is made by `os_registry.kind` (`SECTOR_OS` vs `SHARED_CAPABILITY`),
--   which remains the single source of truth for OS identity. This migration only
--   lets a registry row SAY which kind of namespace a hostname belongs to, so a
--   capability base can never be mistaken for an OS base and vice versa.
--
-- ADDITIVE AND ORDER-PRESERVING
--   The value is appended (that is what ADD VALUE does), so no existing label
--   moves, no existing row changes meaning, and no behaviour of the three
--   pre-existing types is touched. `IF NOT EXISTS` makes the migration
--   re-runnable against a database where the value already exists.
--
-- NO AUTHORITY IS GRANTED HERE
--   A hostname is not a permission. Classifying a namespace grants nothing: every
--   request still passes session authentication, identity federation, RBAC, ABAC,
--   the policy engine, tenant/entity/country scope and RLS before any data is
--   read.

--> statement-breakpoint
ALTER TYPE beyu_domain_type ADD VALUE IF NOT EXISTS 'CAPABILITY_BASE';

--> statement-breakpoint
-- Verification: the classification exists, and the three original labels are
-- untouched (a destructive edit to this enum would change what every existing
-- row means, so it is asserted explicitly).
DO $$
DECLARE
  labels text[];
BEGIN
  SELECT array_agg(enumlabel ORDER BY enumsortorder) INTO labels
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'beyu_domain_type';

  IF labels IS NULL THEN
    RAISE EXCEPTION 'Migration 0064 verification failed: enum beyu_domain_type does not exist';
  END IF;
  IF NOT ('CAPABILITY_BASE' = ANY (labels)) THEN
    RAISE EXCEPTION 'Migration 0064 verification failed: CAPABILITY_BASE was not added (labels: %)', labels;
  END IF;
  IF NOT (labels[1:3] = ARRAY['OS_BASE', 'TENANT_SUBDOMAIN', 'CUSTOM_DOMAIN']) THEN
    RAISE EXCEPTION 'Migration 0064 verification failed: the original domain-type labels changed order or name (labels: %)', labels;
  END IF;
END $$;
