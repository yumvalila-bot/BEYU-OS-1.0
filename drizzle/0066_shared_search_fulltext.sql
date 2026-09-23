-- 0066 — Shared BEYU OS Search capability: native PostgreSQL full-text search.
--
-- Search is ONE shared BEYU OS capability (kind SHARED_CAPABILITY in
-- os_registry), never a Search OS. It is implemented with the database BEYU OS
-- already runs: PostgreSQL 16 full-text search. No new dependency, no new
-- service, no duplicated index store.
--
-- DESIGN
--   * Every searched table gets ONE regular tsvector column (search_tsv)
--     maintained by a BEFORE INSERT OR UPDATE trigger built from the table's
--     display fields only. A trigger-maintained derived column is the
--     repository's established pattern for row-derived state (0056/0057
--     maintain derived timestamp/state columns the same way), and the function
--     follows the canonical `beyu_*` SECURITY INVOKER trigger convention
--     (the repository deliberately avoids SECURITY DEFINER — see 0053/0054/
--     0059/0063).
--   * A regular column (not GENERATED) is a deliberate, tested decision: the
--     repository's row-copy fixture idiom —
--       insert into <t> select (jsonb_populate_record(null::<t>,
--         to_jsonb(r)||overrides).* ) from <t> r where …
--     (used by 16 existing test fixtures across 9 suites) explicitly inserts
--     every column, and PostgreSQL rejects explicit values for generated
--     columns (SQLSTATE 428C9). The trigger overwrites any explicitly supplied
--     value on write, so the column is recomputed from the display fields on
--     every INSERT/UPDATE and can never drift from the data — no separate
--     index store, no event bus, no stale-index failure mode.
--   * One GIN index per table makes the normal search path indexed.
--   * The trigger is an index maintenance mechanism only. It reads NEW display
--     fields and writes NEW.search_tsv — nothing else. It grants no access,
--     reads no other row, and cannot bypass authorization: the search vector is
--     a representation of already-authorized source data. The authoritative
--     access boundary is unchanged — GlobalUserID → tenant → country → entity →
--     OS → RBAC/ABAC → classification → RLS. These tables are already
--     RLS-protected by the canonical policies (0001/0021/0031/0034/0035/0043/
--     0048/…), so a search SELECT is filtered exactly like any other read; the
--     vector changes what a row MATCHES, never who may see it.
--   * Classification ceilings are enforced by the search service (the same
--     app-layer convention used by every list endpoint); RLS stays the
--     database backstop for tenant/entity isolation.
--   * CAP_POSTING is untouched: search has no write path and grants no
--     capability beyond the existing per-source read permissions.
--
-- EXPAND-ONLY / DETERMINISTIC
--   * ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION, DROP TRIGGER IF
--     EXISTS + CREATE TRIGGER, DROP INDEX IF EXISTS + CREATE INDEX, and an
--     idempotent deterministic backfill UPDATE for pre-existing rows.
--     Re-running is a no-op (same function body, same trigger, same value).
--     Nothing pre-existing is dropped, narrowed or rewritten; the
--     expand/contract scanner passes.
--   * The display expressions below are the canonical search surface. They are
--     mirrored in src/lib/search/resources.ts (ts_headline text) and declared
--     in src/db/schema (drift gate).
--
-- SEARCHABLE TABLES (v1 registry — every row must exist in the current schema):
--   tenants, legal_entities, documents, resolutions,
--   ujenzi_projects, ujenzi_boqs,
--   agriculture_farms, agriculture_projects,
--   foundations, knowledge_sources
--
-- NOTE ON ENUM COLUMNS: PostgreSQL enum output functions are STABLE, not
-- IMMUTABLE, so enum-typed columns (type, status, entity_type, classification)
-- cannot appear in a generated column expression. The search surface is
-- therefore the table's free-text display fields (names, codes, descriptions,
-- titles). Status/type facets remain available as post-match metadata on the
-- result; they are not full-text search targets.

-- 1. tenants — BEYU OS control plane (org:entity.read).
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION beyu_search_tsv_tenants() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := to_tsvector('english',
    coalesce(NEW.name, '') || ' ' ||
    coalesce(NEW.code, '')
  );
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tenants_search_tsv ON "tenants";
--> statement-breakpoint
CREATE TRIGGER tenants_search_tsv BEFORE INSERT OR UPDATE ON "tenants" FOR EACH ROW EXECUTE FUNCTION beyu_search_tsv_tenants();
--> statement-breakpoint
DROP INDEX IF EXISTS "tenants_search_tsv_idx";
--> statement-breakpoint
CREATE INDEX "tenants_search_tsv_idx" ON "tenants" USING gin ("search_tsv");
--> statement-breakpoint
UPDATE "tenants" SET search_tsv = to_tsvector('english',
  coalesce(name, '') || ' ' ||
  coalesce(code, '')
);
--> statement-breakpoint
-- 2. legal_entities — BEYU OS control plane (org:entity.read).
ALTER TABLE "legal_entities" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION beyu_search_tsv_legal_entities() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := to_tsvector('english',
    coalesce(NEW.legal_name, '') || ' ' ||
    coalesce(NEW.trading_name, '') || ' ' ||
    coalesce(NEW.code, '')
  );
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS legal_entities_search_tsv ON "legal_entities";
--> statement-breakpoint
CREATE TRIGGER legal_entities_search_tsv BEFORE INSERT OR UPDATE ON "legal_entities" FOR EACH ROW EXECUTE FUNCTION beyu_search_tsv_legal_entities();
--> statement-breakpoint
DROP INDEX IF EXISTS "legal_entities_search_tsv_idx";
--> statement-breakpoint
CREATE INDEX "legal_entities_search_tsv_idx" ON "legal_entities" USING gin ("search_tsv");
--> statement-breakpoint
UPDATE "legal_entities" SET search_tsv = to_tsvector('english',
  coalesce(legal_name, '') || ' ' ||
  coalesce(trading_name, '') || ' ' ||
  coalesce(code, '')
);
--> statement-breakpoint
-- 3. documents — BEYU OS shared document registry (documents:registry.read).
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION beyu_search_tsv_documents() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := to_tsvector('english',
    coalesce(NEW.file_name, '') || ' ' ||
    coalesce(NEW.description, '') || ' ' ||
    coalesce(NEW.category, '') || ' ' ||
    coalesce(NEW.version, '') || ' ' ||
    coalesce(NEW.source, '')
  );
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS documents_search_tsv ON "documents";
--> statement-breakpoint
CREATE TRIGGER documents_search_tsv BEFORE INSERT OR UPDATE ON "documents" FOR EACH ROW EXECUTE FUNCTION beyu_search_tsv_documents();
--> statement-breakpoint
DROP INDEX IF EXISTS "documents_search_tsv_idx";
--> statement-breakpoint
CREATE INDEX "documents_search_tsv_idx" ON "documents" USING gin ("search_tsv");
--> statement-breakpoint
UPDATE "documents" SET search_tsv = to_tsvector('english',
  coalesce(file_name, '') || ' ' ||
  coalesce(description, '') || ' ' ||
  coalesce(category, '') || ' ' ||
  coalesce(version, '') || ' ' ||
  coalesce(source, '')
);
--> statement-breakpoint
-- 4. resolutions — BEYU OS governance (governance:resolution.read).
ALTER TABLE "resolutions" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION beyu_search_tsv_resolutions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.reference, '') || ' ' ||
    coalesce(NEW.summary, '') || ' ' ||
    coalesce(NEW.category, '')
  );
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS resolutions_search_tsv ON "resolutions";
--> statement-breakpoint
CREATE TRIGGER resolutions_search_tsv BEFORE INSERT OR UPDATE ON "resolutions" FOR EACH ROW EXECUTE FUNCTION beyu_search_tsv_resolutions();
--> statement-breakpoint
DROP INDEX IF EXISTS "resolutions_search_tsv_idx";
--> statement-breakpoint
CREATE INDEX "resolutions_search_tsv_idx" ON "resolutions" USING gin ("search_tsv");
--> statement-breakpoint
UPDATE "resolutions" SET search_tsv = to_tsvector('english',
  coalesce(title, '') || ' ' ||
  coalesce(reference, '') || ' ' ||
  coalesce(summary, '') || ' ' ||
  coalesce(category, '')
);
--> statement-breakpoint
-- 5. ujenzi_projects — Ujenzi OS (ujenzi:data.read).
ALTER TABLE "ujenzi_projects" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION beyu_search_tsv_ujenzi_projects() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := to_tsvector('english',
    coalesce(NEW.name, '') || ' ' ||
    coalesce(NEW.code, '') || ' ' ||
    coalesce(NEW.client, '') || ' ' ||
    coalesce(NEW.status, '') || ' ' ||
    coalesce(NEW.location, '') || ' ' ||
    coalesce(NEW.region, '')
  );
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ujenzi_projects_search_tsv ON "ujenzi_projects";
--> statement-breakpoint
CREATE TRIGGER ujenzi_projects_search_tsv BEFORE INSERT OR UPDATE ON "ujenzi_projects" FOR EACH ROW EXECUTE FUNCTION beyu_search_tsv_ujenzi_projects();
--> statement-breakpoint
DROP INDEX IF EXISTS "ujenzi_projects_search_tsv_idx";
--> statement-breakpoint
CREATE INDEX "ujenzi_projects_search_tsv_idx" ON "ujenzi_projects" USING gin ("search_tsv");
--> statement-breakpoint
UPDATE "ujenzi_projects" SET search_tsv = to_tsvector('english',
  coalesce(name, '') || ' ' ||
  coalesce(code, '') || ' ' ||
  coalesce(client, '') || ' ' ||
  coalesce(status, '') || ' ' ||
  coalesce(location, '') || ' ' ||
  coalesce(region, '')
);
--> statement-breakpoint
-- 6. ujenzi_boqs — Ujenzi OS (ujenzi:data.read).
-- The row itself carries no free-text name (project + version), so the
-- capability's own vocabulary ("boq", "bill of quantities") is indexed as a
-- constant token set; the display title is composed from the parent project
-- at query time. Notes carry the rest.
ALTER TABLE "ujenzi_boqs" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION beyu_search_tsv_ujenzi_boqs() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := to_tsvector('english',
    'boq bill of quantities ' ||
    coalesce(NEW.status, '') || ' ' ||
    coalesce(NEW.currency, '') || ' ' ||
    coalesce(NEW.notes, '')
  );
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ujenzi_boqs_search_tsv ON "ujenzi_boqs";
--> statement-breakpoint
CREATE TRIGGER ujenzi_boqs_search_tsv BEFORE INSERT OR UPDATE ON "ujenzi_boqs" FOR EACH ROW EXECUTE FUNCTION beyu_search_tsv_ujenzi_boqs();
--> statement-breakpoint
DROP INDEX IF EXISTS "ujenzi_boqs_search_tsv_idx";
--> statement-breakpoint
CREATE INDEX "ujenzi_boqs_search_tsv_idx" ON "ujenzi_boqs" USING gin ("search_tsv");
--> statement-breakpoint
UPDATE "ujenzi_boqs" SET search_tsv = to_tsvector('english',
  'boq bill of quantities ' ||
  coalesce(status, '') || ' ' ||
  coalesce(currency, '') || ' ' ||
  coalesce(notes, '')
);
--> statement-breakpoint
-- 7. agriculture_farms — Agriculture OS (agriculture:data.read).
ALTER TABLE "agriculture_farms" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION beyu_search_tsv_agriculture_farms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := to_tsvector('english',
    coalesce(NEW.name, '') || ' ' ||
    coalesce(NEW.code, '') || ' ' ||
    coalesce(NEW.region, '') || ' ' ||
    coalesce(NEW.soil_type, '') || ' ' ||
    coalesce(NEW.status, '')
  );
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS agriculture_farms_search_tsv ON "agriculture_farms";
--> statement-breakpoint
CREATE TRIGGER agriculture_farms_search_tsv BEFORE INSERT OR UPDATE ON "agriculture_farms" FOR EACH ROW EXECUTE FUNCTION beyu_search_tsv_agriculture_farms();
--> statement-breakpoint
DROP INDEX IF EXISTS "agriculture_farms_search_tsv_idx";
--> statement-breakpoint
CREATE INDEX "agriculture_farms_search_tsv_idx" ON "agriculture_farms" USING gin ("search_tsv");
--> statement-breakpoint
UPDATE "agriculture_farms" SET search_tsv = to_tsvector('english',
  coalesce(name, '') || ' ' ||
  coalesce(code, '') || ' ' ||
  coalesce(region, '') || ' ' ||
  coalesce(soil_type, '') || ' ' ||
  coalesce(status, '')
);
--> statement-breakpoint
-- 8. agriculture_projects — Agriculture OS (agriculture:data.read).
ALTER TABLE "agriculture_projects" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION beyu_search_tsv_agriculture_projects() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := to_tsvector('english',
    coalesce(NEW.name, '') || ' ' ||
    coalesce(NEW.code, '') || ' ' ||
    coalesce(NEW.status, '')
  );
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS agriculture_projects_search_tsv ON "agriculture_projects";
--> statement-breakpoint
CREATE TRIGGER agriculture_projects_search_tsv BEFORE INSERT OR UPDATE ON "agriculture_projects" FOR EACH ROW EXECUTE FUNCTION beyu_search_tsv_agriculture_projects();
--> statement-breakpoint
DROP INDEX IF EXISTS "agriculture_projects_search_tsv_idx";
--> statement-breakpoint
CREATE INDEX "agriculture_projects_search_tsv_idx" ON "agriculture_projects" USING gin ("search_tsv");
--> statement-breakpoint
UPDATE "agriculture_projects" SET search_tsv = to_tsvector('english',
  coalesce(name, '') || ' ' ||
  coalesce(code, '') || ' ' ||
  coalesce(status, '')
);
--> statement-breakpoint
-- 9. foundations — Foundation OS (foundation:registry.read).
ALTER TABLE "foundations" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION beyu_search_tsv_foundations() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := to_tsvector('english',
    coalesce(NEW.legal_name, '') || ' ' ||
    coalesce(NEW.operating_name, '') || ' ' ||
    coalesce(NEW.code, '') || ' ' ||
    coalesce(NEW.legal_vehicle, '') || ' ' ||
    coalesce(NEW.status, '') || ' ' ||
    coalesce(NEW.mission, '') || ' ' ||
    coalesce(NEW.purpose, '')
  );
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS foundations_search_tsv ON "foundations";
--> statement-breakpoint
CREATE TRIGGER foundations_search_tsv BEFORE INSERT OR UPDATE ON "foundations" FOR EACH ROW EXECUTE FUNCTION beyu_search_tsv_foundations();
--> statement-breakpoint
DROP INDEX IF EXISTS "foundations_search_tsv_idx";
--> statement-breakpoint
CREATE INDEX "foundations_search_tsv_idx" ON "foundations" USING gin ("search_tsv");
--> statement-breakpoint
UPDATE "foundations" SET search_tsv = to_tsvector('english',
  coalesce(legal_name, '') || ' ' ||
  coalesce(operating_name, '') || ' ' ||
  coalesce(code, '') || ' ' ||
  coalesce(legal_vehicle, '') || ' ' ||
  coalesce(status, '') || ' ' ||
  coalesce(mission, '') || ' ' ||
  coalesce(purpose, '')
);
--> statement-breakpoint
-- 10. knowledge_sources — approved governed knowledge (ai:noelia.query).
-- Search MATCHES on content/keywords for findability, but the search service
-- returns the title only — content excerpts never cross the search boundary.
-- Visibility itself is governed by the existing knowledge scope rules
-- (GLOBAL/ENTERPRISE/TENANT/ENTITY/COUNTRY) plus the classification ceiling.
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION beyu_search_tsv_knowledge_sources() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.code, '') || ' ' ||
    coalesce(NEW.domain, '') || ' ' ||
    coalesce(NEW.content, '') || ' ' ||
    coalesce(NEW.keywords::text, '')
  );
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS knowledge_sources_search_tsv ON "knowledge_sources";
--> statement-breakpoint
CREATE TRIGGER knowledge_sources_search_tsv BEFORE INSERT OR UPDATE ON "knowledge_sources" FOR EACH ROW EXECUTE FUNCTION beyu_search_tsv_knowledge_sources();
--> statement-breakpoint
DROP INDEX IF EXISTS "knowledge_sources_search_tsv_idx";
--> statement-breakpoint
CREATE INDEX "knowledge_sources_search_tsv_idx" ON "knowledge_sources" USING gin ("search_tsv");
--> statement-breakpoint
UPDATE "knowledge_sources" SET search_tsv = to_tsvector('english',
  coalesce(title, '') || ' ' ||
  coalesce(code, '') || ' ' ||
  coalesce(domain, '') || ' ' ||
  coalesce(content, '') || ' ' ||
  coalesce(keywords::text, '')
);
