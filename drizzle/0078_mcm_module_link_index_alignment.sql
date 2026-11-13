-- ============================================================================
-- 0078 — MCM: align `mcm_module_links_uidx` column order with its declaration
--
-- WHY THIS MIGRATION EXISTS. 0076 created this uniqueness rule as an inline
-- table constraint:
--
--   CONSTRAINT "mcm_module_links_uidx"
--     UNIQUE("legal_entity_id","source_table","source_id","link_role")
--
-- while `src/db/schema/mcm.ts` declares the same rule as a Drizzle unique index
-- whose column list follows the physical column order:
--
--   unique("mcm_module_links_uidx").on(
--     t.legalEntityId, t.sourceId, t.sourceTable, t.linkRole)
--
-- PostgreSQL treats a constraint's column ORDER as part of the object, so
-- `scripts/migration/schema-drift.ts` — correctly — reports one blocking
-- difference while the other nineteen MCM unique rules agree. The two statements
-- enforce the same set of columns and therefore the same uniqueness; only the
-- declared order differs.
--
-- This migration recreates the constraint with the declaration's order so the
-- two snapshots agree exactly, instead of teaching the drift gate to ignore a
-- dimension it checks on purpose. Dropped and recreated in one transaction: the
-- table is left with precisely one uniqueness rule on these four columns.
--
-- `mcm_module_links` is additive here (no data migration): the constraint is
-- revalidated against existing rows on creation, so a pre-existing duplicate
-- would abort this migration rather than be silently accepted.
-- ============================================================================

ALTER TABLE "mcm_module_links" DROP CONSTRAINT IF EXISTS "mcm_module_links_uidx";--> statement-breakpoint
ALTER TABLE "mcm_module_links"
  ADD CONSTRAINT "mcm_module_links_uidx"
  UNIQUE("legal_entity_id","source_id","source_table","link_role");--> statement-breakpoint
