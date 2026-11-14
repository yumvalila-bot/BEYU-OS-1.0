-- ============================================================================
-- 0079 — MCM: correct the column order of `mcm_module_links_uidx`
--
-- THIS IS A CORRECTION OF 0078, NOT A NEW REQUIREMENT. 0078 set out to align the
-- uniqueness rule with `src/db/schema/mcm.ts` but transposed two of the four
-- columns, producing
--
--   UNIQUE (legal_entity_id, source_id, source_table, link_role)
--
-- where the declaration is
--
--   UNIQUE (legal_entity_id, source_table, source_id, link_role)
--
-- PostgreSQL treats a constraint's column order as part of the object, so
-- `scripts/migration/schema-drift.ts` continued to report the one blocking
-- difference it had found before. The SET of columns — and therefore the
-- uniqueness actually enforced — was never wrong in either migration; only the
-- declared order was.
--
-- 0078 is left exactly as applied: it is checksummed in `beyu_migrations`, and
-- rewriting an applied migration would break that record on every environment
-- that has run it. The correction is forward. One transposition, corrected once,
-- in a file that says so.
-- ============================================================================

ALTER TABLE "mcm_module_links" DROP CONSTRAINT IF EXISTS "mcm_module_links_uidx";--> statement-breakpoint
ALTER TABLE "mcm_module_links"
  ADD CONSTRAINT "mcm_module_links_uidx"
  UNIQUE("legal_entity_id","source_table","source_id","link_role");--> statement-breakpoint
