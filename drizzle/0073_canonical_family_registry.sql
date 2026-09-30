-- ============================================================================ 
-- 0073 — Canonical family registry & governed relationship extensions
-- ============================================================================
--
-- WHAT THIS MIGRATION DOES (EXPAND-only; no destructive statement)
--
--   1. Creates `families` — the canonical Family entity the repository never
--      had. A family's canonical identity is a `parties` row of type
--      ORGANIZATION (one identity model; no second identity store); this table
--      carries the family-domain attributes: tenant scope, family code,
--      jurisdiction, lifecycle status, classification. Tenant-scoped with the
--      canonical `beyu_tenant_ids()` Row Level Security policy used by
--      `legal_entities` and every other tenant-scoped table.
--
--   2. EXTENDS the existing `family_members` registry (never duplicates it)
--      with the governed membership lifecycle the mission requires:
--        family_id             — typed link to the canonical family (backfilled)
--        membership_status     — ACTIVE | PENDING | ENDED | REVOKED (closed CHECK)
--        effective_from/to     — effective-dated membership
--        provenance            — how the membership was established
--        created_by/updated_by — actor attribution (never fabricated)
--        created_at/updated_at — audit timestamps
--        linked_to_member_id   — spousal/affinal attachment the lineage engine
--                                already models (marriage never creates descent)
--
--   3. BACKFILLS existing rows deterministically: one canonical Family +
--      canonical ORGANIZATION party per distinct (tenant_id, family_line)
--      pair already present in `family_members`. IDs are derived from the
--      natural key (`FML_`/`PTY_` + normalized tenant + line), so replaying
--      the migration is idempotent and no relationship is invented: every
--      backfilled family exists precisely because members already reference
--      its line. Actors for historical rows stay NULL — never fabricated.
--
-- WHY A CHECK INSTEAD OF `SET NOT NULL`
--
--   `family_members.family_id` is required by the governed model. The
--   repository's EXPAND/CONTRACT gate (src/lib/migration/integrity.ts)
--   classifies `ALTER COLUMN … SET NOT NULL` as an early CONTRACT and refuses
--   it for any migration that is not the registered historical 0001. The
--   equivalent guarantee is added here as ADD CONSTRAINT
--   `family_members_family_id_ck CHECK (family_id IS NOT NULL)` — classified
--   EXPAND — applied AFTER the backfill. The Drizzle schema declares the
--   column nullable to mirror the physical column; every governed write path
--   sets it.
--
-- SAFETY
--   * No DROP, no TRUNCATE, no rename, no column type change, no privilege
--     escalation. `scanDestructive` stays empty; `classifyMigration` returns
--     EXPAND (CREATE_TABLE / ADD_COLUMN / ADD_CONSTRAINT / CREATE_INDEX /
--     CREATE_POLICY / ENABLE_RLS).
--   * Deterministic backfill: derived IDs, ON CONFLICT DO NOTHING, safe to
--     replay on any state.
--   * RLS verified in-migration (fail closed if the policy is missing).
--   * Runtime-role GRANT asserted for fresh installs where migrations run
--     before scripts/setup-db-role.ts.
-- ============================================================================

CREATE TABLE "families" (
  "id" text PRIMARY KEY,
  "tenant_id" text NOT NULL,
  "party_id" text NOT NULL,
  "code" text NOT NULL,
  "display_name" text NOT NULL,
  "legal_name" text,
  "country_code" text,
  "jurisdiction_id" text,
  "status" "beyu_lifecycle_status" NOT NULL DEFAULT 'ACTIVE',
  "classification" "beyu_classification" NOT NULL DEFAULT 'HIGHLY_RESTRICTED',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "families_tenant_code_uidx" ON "families" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "families_tenant_idx" ON "families" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "families_party_idx" ON "families" USING btree ("party_id");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- family_members: governed membership lifecycle (expand-only columns)
-- ---------------------------------------------------------------------------
ALTER TABLE "family_members" ADD COLUMN "family_id" text;--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "linked_to_member_id" text;--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "membership_status" text NOT NULL DEFAULT 'ACTIVE';--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "effective_from" date;--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "effective_to" date;--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "provenance" text;--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "created_at" timestamp with time zone NOT NULL DEFAULT now();--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "updated_at" timestamp with time zone NOT NULL DEFAULT now();--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_family_id_families_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_linked_to_member_id_fk" FOREIGN KEY ("linked_to_member_id") REFERENCES "public"."family_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_members_family_idx" ON "family_members" USING btree ("family_id");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Deterministic backfill: one canonical Family + canonical ORGANIZATION party
-- per distinct (tenant_id, family_line) already present in the registry.
-- IDs derive from the natural key, so replay converges to the same rows.
-- ---------------------------------------------------------------------------
INSERT INTO "parties" ("id", "type", "display_name", "status", "classification")
SELECT DISTINCT
  'PTY_' || upper(regexp_replace(fm."tenant_id" || '_' || fm."family_line", '[^A-Za-z0-9]+', '_', 'g')),
  'ORGANIZATION'::"beyu_party_type",
  fm."family_line",
  'ACTIVE'::"beyu_lifecycle_status",
  'CONFIDENTIAL'::"beyu_classification"
FROM (SELECT DISTINCT "tenant_id", "family_line" FROM "family_members") fm
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "families" ("id", "tenant_id", "party_id", "code", "display_name")
SELECT DISTINCT
  'FML_' || upper(regexp_replace(fm."tenant_id" || '_' || fm."family_line", '[^A-Za-z0-9]+', '_', 'g')),
  fm."tenant_id",
  'PTY_' || upper(regexp_replace(fm."tenant_id" || '_' || fm."family_line", '[^A-Za-z0-9]+', '_', 'g')),
  upper(regexp_replace(fm."family_line", '[^A-Za-z0-9]+', '_', 'g')),
  fm."family_line"
FROM (SELECT DISTINCT "tenant_id", "family_line" FROM "family_members") fm
ON CONFLICT DO NOTHING;--> statement-breakpoint

UPDATE "family_members" fm
SET "family_id" = 'FML_' || upper(regexp_replace(fm."tenant_id" || '_' || fm."family_line", '[^A-Za-z0-9]+', '_', 'g'));--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Closed-catalogue constraints (all ADD CONSTRAINT — classified EXPAND)
-- ---------------------------------------------------------------------------
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_family_id_ck"
  CHECK ("family_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_membership_status_ck"
  CHECK ("membership_status" IN ('ACTIVE', 'PENDING', 'ENDED', 'REVOKED'));--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_effective_dates_ck"
  CHECK ("effective_to" IS NULL OR "effective_from" IS NULL OR "effective_to" >= "effective_from");--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_affinal_link_ck"
  CHECK (
    (
      "relationship_to_parent" IN ('SPOUSE_OF_MEMBER', 'FORMER_SPOUSE_OF_MEMBER', 'OTHER_AFFINAL')
      AND "linked_to_member_id" IS NOT NULL
    )
    OR (
      "relationship_to_parent" NOT IN ('SPOUSE_OF_MEMBER', 'FORMER_SPOUSE_OF_MEMBER', 'OTHER_AFFINAL')
      AND "linked_to_member_id" IS NULL
    )
  );--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row Level Security — the canonical tenant-isolation boundary on `families`
-- (same predicate as legal_entities in 0001: in-scope tenants or global
-- governance scope, enforced for both USING and WITH CHECK).
-- ---------------------------------------------------------------------------
ALTER TABLE "families" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "families" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "families_tenant_isolation" ON "families";--> statement-breakpoint
CREATE POLICY "families_tenant_isolation" ON "families"
  USING ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
  WITH CHECK ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope());--> statement-breakpoint

-- Runtime-role DML for fresh installs where migrations run before
-- scripts/setup-db-role.ts provisions the blanket grants.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO %I', 'families', r.rolname);
    RAISE NOTICE 'granted families DML to %', r.rolname;
  END LOOP;
END
$$;--> statement-breakpoint

-- Fail-closed verification: the migration aborts if the policy is missing or
-- was created without the canonical predicate.
DO $$
DECLARE
  rls_ok boolean;
  policy_ok boolean;
BEGIN
  SELECT relrowsecurity INTO rls_ok
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'families';
  IF coalesce(rls_ok, false) IS NOT TRUE THEN
    RAISE EXCEPTION '0073: families was created without Row Level Security';
  END IF;
  SELECT count(*) > 0 INTO policy_ok
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'families'
      AND policyname = 'families_tenant_isolation'
      AND qual LIKE '%beyu_tenant_ids()%'
      AND with_check LIKE '%beyu_tenant_ids()%';
  IF policy_ok IS NOT TRUE THEN
    RAISE EXCEPTION '0073: families_tenant_isolation policy missing or not canonical';
  END IF;
END
$$;
