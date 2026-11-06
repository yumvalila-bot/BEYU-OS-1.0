/**
 * Schema/code incompatibility classification and routing — regression suite.
 *
 * WHAT THIS LOCKS DOWN
 *   On 2026-10-12, and again on 2026-10-22, a production database that had not
 *   applied migration 0075 made every AUTHENTICATED view fail while every probe
 *   the deployment owned reported health:
 *
 *     GET /api/health          → 200 (readiness is a table-less `select 1`)
 *     GET /   (no session)     → 200 (the sign-in page never queries the DB)
 *     POST /api/v1/auth/login  → 200 + session cookie (sign-in succeeds)
 *     GET /os                  → 500 → the route error boundary
 *
 *   The cause was SQLSTATE 42703 — `role_assignments.global_scope` does not
 *   exist — raised by the first statement of `resolvePrincipal()`. The user saw
 *   a screen that (rightly) disclaimed being an access decision but named no
 *   cause, on the surface a genuine denial never uses.
 *
 *   These tests pin the two properties that keep that from recurring:
 *
 *     1. ONLY a missing-object SQLSTATE is classified as a release state. An
 *        unreachable database, a refused privilege, an RLS violation, a
 *        deadlock — anything else — stays a hard failure. A release screen must
 *        never launder a real error into a reassuring one.
 *     2. The classified condition is ROUTED, not swallowed: pages reach the
 *        governed release screen, APIs get 503 `SCHEMA_RELEASE_PENDING`, and
 *        the authorization decision itself remains fail-closed (no grants are
 *        synthesised, no query is retried without the missing column).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SCHEMA_RELEASE_PATH,
  SchemaCompatibilityError,
  asSchemaCompatibilityError,
  isSchemaCompatibilityError,
} from "@/lib/schema-compatibility";
import { requirePrincipal, resolvePrincipalForPage } from "@/lib/guard";
import { resolvePrincipal } from "@/lib/session";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * The production failure, exactly as the server logged it: drizzle reports the
 * statement as `Error: Failed query: …` and carries the PostgreSQL error (with
 * `code`) as its `cause`.
 */
function drizzleFailure(sqlstate: string, message: string): Error {
  const cause = Object.assign(new Error(message), { code: sqlstate, severity: "ERROR" });
  return Object.assign(
    new Error(
      `Failed query: select "role_assignments"."id", "role_assignments"."global_scope" from "role_assignments"`,
    ),
    { cause },
  );
}

describe("asSchemaCompatibilityError — classification", () => {
  it("classifies the production 42703 failure and names the missing column", () => {
    const drift = asSchemaCompatibilityError(
      drizzleFailure("42703", "column role_assignments.global_scope does not exist"),
    );
    expect(drift).not.toBeNull();
    expect(drift?.kind).toBe("COLUMN");
    expect(drift?.sqlstate).toBe("42703");
    expect(drift?.missingObject).toBe("role_assignments.global_scope");
    expect(isSchemaCompatibilityError(drift)).toBe(true);
  });

  it("descends a nested cause chain", () => {
    const inner = drizzleFailure("42703", "column role_assignments.global_scope does not exist");
    const outer = new Error("principal resolution failed");
    (outer as Error & { cause?: unknown }).cause = inner;
    expect(asSchemaCompatibilityError(outer)?.missingObject).toBe("role_assignments.global_scope");
  });

  it("classifies a missing table, function and type", () => {
    expect(asSchemaCompatibilityError(drizzleFailure("42P01", 'relation "noelia_workflows" does not exist'))?.kind).toBe("TABLE");
    expect(asSchemaCompatibilityError(drizzleFailure("42883", "function beyu_global_scope() does not exist"))?.kind).toBe("FUNCTION");
    expect(asSchemaCompatibilityError(drizzleFailure("42704", 'type "beyu_classification" does not exist'))?.kind).toBe("OBJECT");
  });

  it("classifies even when the object name cannot be parsed", () => {
    const drift = asSchemaCompatibilityError(drizzleFailure("42703", ""));
    expect(drift?.kind).toBe("COLUMN");
    expect(drift?.missingObject).toBeNull();
  });

  /**
   * The important negative: everything below is a REAL failure. Presenting any
   * of it as "a database release is pending" would hide an outage, a privilege
   * problem or a bug behind a reassuring screen.
   */
  it.each([
    ["permission denied (42501)", "42501"],
    ["RLS / insufficient privilege (42501)", "42501"],
    ["connection failure (08006)", "08006"],
    ["query cancelled (57014)", "57014"],
    ["deadlock (40P01)", "40P01"],
    ["unique violation (23505)", "23505"],
    ["syntax error (42601)", "42601"],
  ])("does NOT classify %s as a release state", (_label, sqlstate) => {
    expect(asSchemaCompatibilityError(drizzleFailure(sqlstate, "some failure"))).toBeNull();
  });

  it("does not classify a driver error with no SQLSTATE, or a non-error value", () => {
    expect(asSchemaCompatibilityError(new Error("connect ECONNREFUSED"))).toBeNull();
    expect(asSchemaCompatibilityError(null)).toBeNull();
    expect(asSchemaCompatibilityError(undefined)).toBeNull();
    expect(asSchemaCompatibilityError("42703")).toBeNull();
  });
});

/**
 * Routing. `redirect()` throws in Next.js; the mock throws a marked error so a
 * redirect is distinguishable from a rethrow.
 */
const redirectMock = vi.hoisted(() => ({ calls: [] as string[], error: null as Error | null }));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirectMock.calls.push(url);
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/session", () => ({
  resolvePrincipal: vi.fn(),
}));

const resolvePrincipalMock = resolvePrincipal as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  redirectMock.calls.length = 0;
  redirectMock.error = null;
  resolvePrincipalMock.mockReset();
});

describe("page guards — routing on a release state", () => {
  it("sends a classified 42703 to the governed database-release screen", async () => {
    resolvePrincipalMock.mockRejectedValueOnce(
      new SchemaCompatibilityError({ kind: "COLUMN", sqlstate: "42703", missingObject: "role_assignments.global_scope" }),
    );
    await expect(requirePrincipal()).rejects.toThrow(`NEXT_REDIRECT:${SCHEMA_RELEASE_PATH}`);
    expect(redirectMock.calls).toEqual([SCHEMA_RELEASE_PATH]);
  });

  it("rethrows an unclassified failure instead of routing it", async () => {
    const outage = new Error("connect ETIMEDOUT");
    resolvePrincipalMock.mockRejectedValueOnce(outage);
    await expect(requirePrincipal()).rejects.toBe(outage);
    expect(redirectMock.calls).toEqual([]);
  });

  it("still sends an unauthenticated visitor to sign-in (no drift, no query)", async () => {
    resolvePrincipalMock.mockResolvedValueOnce(null);
    await expect(requirePrincipal()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(redirectMock.calls).toEqual(["/"]);
  });

  it("routes drift on pages that also render for signed-out visitors", async () => {
    resolvePrincipalMock.mockRejectedValueOnce(
      new SchemaCompatibilityError({ kind: "COLUMN", sqlstate: "42703", missingObject: "role_assignments.global_scope" }),
    );
    await expect(resolvePrincipalForPage()).rejects.toThrow(`NEXT_REDIRECT:${SCHEMA_RELEASE_PATH}`);
  });
});

describe("database release screen", () => {
  it("exists at the path the guards redirect to", () => {
    const page = join(ROOT, "src/app", SCHEMA_RELEASE_PATH.replace(/^\//, ""), "page.tsx");
    expect(existsSync(page)).toBe(true);
  });

  /**
   * The screen is reached BY an authorization failure, so it must not itself
   * require a principal — that would redirect back into the failing path.
   */
  it("resolves no principal and makes no authorization decision", () => {
    const source = read("src/app/system/database-release/page.tsx");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
    for (const forbidden of ["requirePrincipal", "resolvePrincipal(", "can(", "requireAccess"]) {
      expect(code).not.toContain(forbidden);
    }
  });

  it("publishes only the facts /api/health/schema already publishes", () => {
    const source = read("src/app/system/database-release/page.tsx");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
    for (const leaked of ["42703", "sqlstate", "missingObject", "DATABASE_URL", "stack"]) {
      expect(code).not.toContain(leaked);
    }
  });

  it("answers the API boundary with 503 SCHEMA_RELEASE_PENDING", () => {
    const source = read("src/lib/api.ts");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
    expect(code).toContain('"SCHEMA_RELEASE_PENDING"');
    expect(code).toMatch(/schemaReleasePending[\s\S]{0,400}?\b503\b/);
  });
});
