/**
 * BEYU OS — Shared Search capability: schema declarations.
 *
 * Search is ONE shared BEYU OS capability (kind SHARED_CAPABILITY in
 * os_registry), never a Search OS. It is implemented with native PostgreSQL
 * full-text search on the tables that already exist and are already
 * RLS-protected. This module holds only the Drizzle declaration of the
 * `search_tsv` column so the schema-drift gate (drizzle-kit pull vs generate)
 * sees the same object migration 0066 creates.
 *
 * The column is a REGULAR tsvector column maintained by the 0066
 * `beyu_search_tsv_<table>` BEFORE INSERT OR UPDATE triggers (the
 * repository's convention for row-derived state — SECURITY INVOKER, no
 * SECURITY DEFINER). It is never a source of truth: the triggers read only the
 * row's own display fields and write only this column, and it changes what a
 * row MATCHES, never who may see it. A generated column was rejected after
 * testing: the repository's row-copy fixture idiom explicitly inserts every
 * column, and PostgreSQL rejects explicit values for generated columns
 * (SQLSTATE 428C9) — see docs/architecture/SHARED_SEARCH_CAPABILITY.md.
 *
 * The display expressions are defined once in src/lib/search/resources.ts
 * (ts_headline text) and mirrored by migration 0066.
 */
import { customType } from "drizzle-orm/pg-core";

/** PostgreSQL tsvector column type (trigger-maintained; never authorization-bearing). */
export const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});
