/**
 * BEYU OS — schema/code compatibility classification (PURE — no I/O, no clock).
 *
 * WHY THIS EXISTS (evidence, 2026-10-12 and 2026-10-22)
 *   Twice, a production database that had not applied a migration the running
 *   artifact reads made EVERY authenticated view fail: `resolvePrincipal()`
 *   selects `role_assignments.global_scope` (migration 0075), so the first
 *   session-bearing request after sign-in raised SQLSTATE 42703 and every page
 *   rendered the route error boundary. The boundary is honest about being a
 *   LOAD failure, but a user cannot act on it, and the same screen is what a
 *   genuine denial never renders — so a release state was left looking like an
 *   access outcome.
 *
 *   The database is the thing that must be fixed (the governed database
 *   release). This module exists so that, until it is, the application says so
 *   in governed words on its own screen instead of failing as an anonymous 500.
 *
 * WHAT IS CLASSIFIED
 *   Only SQLSTATEs that mean "this artifact asked the database for an object
 *   the database does not have" — a missing column, table, type or function is
 *   a statement about the RELEASE, not about the caller's authority, the
 *   network, or the database's health. Everything else (connection refused,
 *   permission denied, RLS violation, deadlock, timeout) is deliberately NOT
 *   classified here: those are real failures that must keep failing closed as
 *   errors, and must never be laundered into "a release is pending".
 *
 * WHAT THIS MODULE IS NOT
 *   It is not a compatibility shim. It never rewrites a query, never retries
 *   without a column and never degrades an authorization decision: the missing
 *   object stays missing and the request stays denied. It only decides WHICH
 *   governed surface explains that to the human.
 *
 * NO DISCLOSURE
 *   The SQLSTATE and the missing object name stay server-side (they are logged
 *   as a structured `schema_compatibility` line). The screen this points at
 *   publishes only the migration tags that `GET /api/health/schema` already
 *   publishes unauthenticated.
 */

/** SQLSTATE → the kind of catalog object the running artifact asked for. */
const MISSING_OBJECT_SQLSTATES: Readonly<Record<string, SchemaCompatibilityKind>> = {
  "42703": "COLUMN", // undefined_column
  "42P01": "TABLE", // undefined_table
  "42704": "OBJECT", // undefined_object (type, collation, operator…)
  "42883": "FUNCTION", // undefined_function
};

export type SchemaCompatibilityKind = "COLUMN" | "TABLE" | "OBJECT" | "FUNCTION";

/**
 * Canonical route of the governed "database release pending" screen.
 *
 * A single literal, imported by every caller, so the page path and the
 * redirects that reach it cannot drift apart.
 */
export const SCHEMA_RELEASE_PATH = "/system/database-release";

/**
 * A database that does not have an object this artifact requires.
 *
 * Carries the driver fact for the server log only. Never rendered, never
 * returned to a browser, never used as an authorization input.
 */
export class SchemaCompatibilityError extends Error {
  readonly kind: SchemaCompatibilityKind;
  readonly sqlstate: string;
  /** e.g. `role_assignments.global_scope`. Server-side only; may be null. */
  readonly missingObject: string | null;

  constructor(args: {
    kind: SchemaCompatibilityKind;
    sqlstate: string;
    missingObject: string | null;
    cause?: unknown;
  }) {
    const what = args.missingObject ? ` (${args.missingObject})` : "";
    super(
      `BEYU OS schema incompatibility ${args.sqlstate}: ${args.kind.toLowerCase()}${what} is required by this release and is not present in the database`,
    );
    this.name = "SchemaCompatibilityError";
    this.kind = args.kind;
    this.sqlstate = args.sqlstate;
    this.missingObject = args.missingObject;
    if (args.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = args.cause;
    }
  }
}

/** `column role_assignments.global_scope does not exist` → the object name. */
const MISSING_OBJECT_PATTERN = /^(\w+)\s+"?([^"\s]+)"?\s+does not exist/i;

/**
 * Walk the `cause` chain of a driver error.
 *
 * Drizzle reports a failed statement as `Error: Failed query: …` whose
 * `[cause]` is the PostgreSQL error carrying `code`, so classification has to
 * descend; the depth is bounded so a cyclic chain cannot hang a request.
 */
function causeChain(error: unknown, maxDepth = 5): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = error;
  for (let depth = 0; depth <= maxDepth && current != null; depth += 1) {
    chain.push(current);
    current = (current as { cause?: unknown } | null)?.cause;
    if (current === error) break;
  }
  return chain;
}

/**
 * Classify a failure as schema/code incompatibility, or return null.
 *
 * PURE and total: an unknown, unreadable or unrelated error — including an
 * unreachable database and a permission/RLS refusal — returns null, so the
 * caller's only safe behaviour for those is to keep failing closed.
 */
export function asSchemaCompatibilityError(error: unknown): SchemaCompatibilityError | null {
  for (const node of causeChain(error)) {
    if (typeof node !== "object" || node === null) continue;
    const code = (node as { code?: unknown }).code;
    if (typeof code !== "string") continue;
    const kind = MISSING_OBJECT_SQLSTATES[code];
    if (!kind) continue;
    const message = typeof (node as { message?: unknown }).message === "string"
      ? ((node as { message: string }).message)
      : "";
    const match = MISSING_OBJECT_PATTERN.exec(message.trim());
    return new SchemaCompatibilityError({
      kind,
      sqlstate: code,
      missingObject: match?.[2] ?? null,
      cause: error,
    });
  }
  return null;
}

/** Narrowing helper for `catch` blocks. */
export function isSchemaCompatibilityError(error: unknown): error is SchemaCompatibilityError {
  return error instanceof SchemaCompatibilityError;
}
