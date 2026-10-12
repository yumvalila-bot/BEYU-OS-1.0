/**
 * BEYU OS — live schema-compatibility classification (read-only diagnostic).
 *
 * WHY THIS EXISTS (evidence, 2026-10-12)
 *   The repository already verifies migration integrity, drift and ledger
 *   reconciliation — but every one of those controls runs in CI, against CI's
 *   own database. Nothing in the RUNNING application compared the schema the
 *   deployed code requires against the schema the production database actually
 *   has, so the one production state that breaks every authenticated view was
 *   indistinguishable from a healthy deployment:
 *
 *     • `GET /api/health` → `{ "database": "UP" }`, because readiness probes a
 *       table-less `select 1` (src/lib/db-health.ts) and knows nothing about
 *       schema revision;
 *     • `GET /api/health/identity` → the RELEASE's expected migration id, a
 *       build-time fact, not a statement about the database;
 *     • the sign-in page → 200, because `resolvePrincipal()` returns before it
 *       touches the database when the request carries no session cookie;
 *     • every view AFTER sign-in → HTTP 500, because the principal resolver
 *       reads columns the missing migration would have created. The browser
 *       renders the route error boundary ("BEYU OS could not load this view"),
 *       which by design says nothing about the cause.
 *
 *   Reproduced locally on 2026-10-12 by removing one column added by a
 *   migration the deployed code reads on every authenticated request: the
 *   unauthenticated sign-in page still returned 200, the login POST still
 *   returned 200, and every post-login page returned 500.
 *
 * WHAT THIS MODULE IS — AND IS NOT
 *   It is a READ-ONLY observation of `public.beyu_migrations` (the canonical
 *   checksummed ledger written by scripts/migrate.ts, whose rows are the SQL
 *   files the runner applies in `<sequence>_<name>` order) compared against the
 *   migration the RUNNING ARTIFACT expects (`latestMigration` in the build's
 *   release identity, derived at build time from `drizzle/meta/_journal.json` —
 *   the register every migration-integrity check reconciles those files
 *   against).
 *
 *   It is NOT an authorization input, NOT a policy, NOT a gate, and NOT a
 *   substitute for a migration. Nothing reads it to decide access; `can()`,
 *   `evaluatePolicy()`, `requireCapability()`, RLS and every destination guard
 *   are untouched by it. It reports a fact and nothing else.
 *
 * FAIL-CLOSED / HONEST DIRECTION
 *   If the ledger cannot be read, or the artifact does not know which migration
 *   it expects, the state is `UNKNOWN` — never `CURRENT`. An unreadable ledger
 *   is never evidence of compatibility, and a missing expectation is never
 *   evidence that the database is up to date.
 *
 * NO SECRETS
 *   The probe reads two non-secret ledger facts (row count, highest version
 *   tag). Migration tags are public repository filenames; the ledger has no
 *   tenant, entity, actor or credential column. The query is issued on the
 *   canonical runtime pool with no privileged role and no RLS/tenant context;
 *   the driver error is never surfaced, logged or returned.
 */
import type { PoolClient } from "pg";
import { pool } from "@/db";
import { getCurrentReleaseIdentity } from "@/lib/release/identity";
/**
 * The canonical migration register, COMPILED INTO this artifact.
 *
 * A static JSON import is a module dependency, so the bundler is required to
 * ship it: unlike a runtime `fs` read of a build artifact, this cannot be
 * missing, untraced or stale relative to the code that is running. It is the
 * same file the migrations themselves come from, so it is the truth about what
 * this artifact expects without a second registry.
 */
import journal from "../../../drizzle/meta/_journal.json";

/** The closed vocabulary of schema states. Nothing else may leave this module. */
export const SCHEMA_STATES = ["CURRENT", "BEHIND", "AHEAD", "UNKNOWN"] as const;
export type SchemaState = (typeof SCHEMA_STATES)[number];

/**
 * The result of reading the canonical migration ledger.
 *
 * `read: false` means the ledger could not be read at all (missing table,
 * unreachable database, privileges withdrawn). It is deliberately distinct
 * from "read successfully, zero migrations applied".
 */
export type SchemaLedgerRead =
  | { read: true; appliedCount: number; appliedLatest: string | null }
  | { read: false };

export type SchemaAssessment = {
  /** `CURRENT` / `BEHIND` / `AHEAD` only when BOTH sides are actually known. */
  state: SchemaState;
  /** Highest version tag applied in the database, or null when unknown. */
  appliedMigration: string | null;
  /** Number of applied migrations recorded in the ledger, or null when unknown. */
  appliedCount: number | null;
  /** The migration the RUNNING ARTIFACT expects, or null when it does not know. */
  expectedMigration: string | null;
};

/**
 * Migration versions are `<sequence>_<name>` (drizzle journal tags, e.g.
 * `0075_noelia_authority_execution_hardening`). Only the leading numeric
 * sequence is ordered; the name is never compared. A tag that does not carry a
 * sequence is unordered — the caller must not guess.
 */
export function migrationSequence(version: string | null | undefined): number | null {
  if (typeof version !== "string") return null;
  const match = /^(\d+)/.exec(version.trim());
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Classify the database's schema against the artifact's expectation. PURE — no
 * I/O, no clock, no environment — so every branch is directly testable.
 */
export function classifySchemaState(read: SchemaLedgerRead, expectedLatest: string | null): SchemaState {
  // An unreadable ledger proves nothing about compatibility.
  if (!read.read) return "UNKNOWN";
  // Without an expectation the artifact cannot make a true statement.
  if (!expectedLatest) return "UNKNOWN";
  // A readable ledger with nothing applied is a database behind EVERY release.
  if (read.appliedCount === 0 || read.appliedLatest === null) return "BEHIND";

  const applied = migrationSequence(read.appliedLatest);
  const expected = migrationSequence(expectedLatest);
  if (applied === null || expected === null) return "UNKNOWN";
  if (applied === expected) return "CURRENT";
  return applied < expected ? "BEHIND" : "AHEAD";
}

/**
 * Read the canonical migration ledger on the runtime pool and classify it.
 *
 * Never throws: a connection failure, a missing `beyu_migrations` table or a
 * revoked privilege yields `read: false` → `state: "UNKNOWN"`. The driver error
 * is discarded (it can embed host, user and pooler detail).
 */
export async function probeSchemaState(): Promise<SchemaAssessment> {
  const expectedMigration = expectedMigrationOfRunningArtifact();
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
  } catch {
    return { state: "UNKNOWN", appliedMigration: null, appliedCount: null, expectedMigration };
  }
  try {
    // SELECT only, on a table with no tenant/entity column and no RLS. The
    // runtime role is granted SELECT on this table by
    // scripts/runtime-privilege-allowlist.ts; nothing here writes, and no
    // tenant context is established because none is required to read it.
    const result = await client.query<{ applied_count: number; applied_latest: string | null }>(
      "select count(*)::int as applied_count, max(version) as applied_latest from public.beyu_migrations",
    );
    const row = result.rows[0];
    const appliedCount = typeof row?.applied_count === "number" ? row.applied_count : null;
    const appliedLatest = typeof row?.applied_latest === "string" ? row.applied_latest : null;
    if (appliedCount === null) {
      return { state: "UNKNOWN", appliedMigration: null, appliedCount: null, expectedMigration };
    }
    const read: SchemaLedgerRead = { read: true, appliedCount, appliedLatest };
    return {
      state: classifySchemaState(read, expectedMigration),
      appliedMigration: appliedLatest,
      appliedCount,
      expectedMigration,
    };
  } catch {
    return { state: "UNKNOWN", appliedMigration: null, appliedCount: null, expectedMigration };
  } finally {
    client.release();
  }
}

/** Last `<sequence>_<name>` tag in the register compiled into this artifact. */
export function latestJournalTag(): string | null {
  const entries = Array.isArray(journal?.entries) ? journal.entries : [];
  const last = entries[entries.length - 1] as { tag?: unknown } | undefined;
  return typeof last?.tag === "string" && last.tag.trim() !== "" ? last.tag.trim() : null;
}

/**
 * The migration the RUNNING ARTIFACT expects.
 *
 * `scripts/build-identity.mjs` derives `latestMigration` from the last entry of
 * `drizzle/meta/_journal.json` at build time, and the release pipeline compares
 * the artifact's declared expectation with the live database (PVG). That value
 * is authoritative when present, because a governed release may pin it through
 * the documented override.
 *
 * When the identity does not carry one — a build tree without the generated
 * identity, an untraced build artifact at runtime — the register COMPILED INTO
 * this bundle answers instead. It is the same file, from the same build, so it
 * is not a second source of truth; it is the same truth, reached without
 * depending on a runtime file read. Null (⇒ `UNKNOWN`, never `CURRENT`) now
 * requires BOTH sources to be absent, which cannot happen for a bundle that
 * built successfully.
 */
export function expectedMigrationOfRunningArtifact(): string | null {
  try {
    const value = getCurrentReleaseIdentity().latestMigration;
    if (typeof value === "string" && value.length > 0) return value;
  } catch {
    // Fall through to the compiled register.
  }
  return latestJournalTag();
}
