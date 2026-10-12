/**
 * Live schema-compatibility diagnosis — regression suite.
 *
 * WHAT THIS LOCKS DOWN
 *   On 2026-10-12 a production state was reproduced in which every
 *   AUTHENTICATED view fails while every probe the deployment owns reports
 *   health:
 *
 *     GET /api/health         → 200 (readiness is a table-less `select 1`)
 *     GET /  (no session)     → 200 (the sign-in page never queries the DB)
 *     POST /api/v1/auth/login → 200 + session cookie (sign-in succeeds)
 *     every view after that   → 500 → the route error boundary
 *
 *   The cause was a database missing a migration the running artifact reads on
 *   every authenticated request. These tests pin the classification that makes
 *   that state visible, and the honesty rules that stop the diagnostic from
 *   collapsing into a reassuring answer:
 *
 *     1. UNKNOWN is never CURRENT — an unreadable ledger and an artifact that
 *        does not know its own expectation are both reported honestly;
 *     2. BEHIND is detected from the canonical ledger, by numeric sequence, so
 *        a database one migration short cannot present as compatible;
 *     3. the expectation is derived from the SAME journal the migration runner
 *        orders by — never from a stale checked-in literal;
 *     4. the route leaks nothing: no credential, DSN, driver message or tenant
 *        data, and no authorization input is read or returned.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SCHEMA_STATES,
  classifySchemaState,
  expectedMigrationOfRunningArtifact,
  latestJournalTag,
  migrationSequence,
} from "@/lib/health/schema-state";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Strip block and line comments so a structural assertion is made against the
 * CODE, not against prose. A comment that explains why a module never touches
 * sessions must not read as the module touching sessions.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");

describe("migration sequence ordering", () => {
  it("orders by the numeric sequence prefix, never by name", () => {
    expect(migrationSequence("0075_noelia_authority_execution_hardening")).toBe(75);
    expect(migrationSequence("0076_anything_at_all")).toBe(76);
    expect(migrationSequence("0000_kernel_v1_baseline")).toBe(0);
  });

  it("refuses to guess when the tag carries no sequence", () => {
    expect(migrationSequence(null)).toBeNull();
    expect(migrationSequence(undefined)).toBeNull();
    expect(migrationSequence("")).toBeNull();
    expect(migrationSequence("release_approvals")).toBeNull();
  });
});

describe("schema classification fails honest, never reassuring", () => {
  it("an unreadable ledger is UNKNOWN — never CURRENT", () => {
    expect(classifySchemaState({ read: false }, "0075_x")).toBe("UNKNOWN");
  });

  it("an artifact with no expectation is UNKNOWN — never CURRENT", () => {
    expect(classifySchemaState({ read: true, appliedCount: 76, appliedLatest: "0075_x" }, null)).toBe(
      "UNKNOWN",
    );
  });

  it("an unordered tag on either side is UNKNOWN", () => {
    expect(classifySchemaState({ read: true, appliedCount: 1, appliedLatest: "not_a_version" }, "0075_x")).toBe(
      "UNKNOWN",
    );
    expect(classifySchemaState({ read: true, appliedCount: 1, appliedLatest: "0075_x" }, "not_a_version")).toBe(
      "UNKNOWN",
    );
  });

  it("a readable ledger with nothing applied is BEHIND every release", () => {
    expect(classifySchemaState({ read: true, appliedCount: 0, appliedLatest: null }, "0075_x")).toBe("BEHIND");
  });

  it("the exact expected migration is CURRENT", () => {
    expect(classifySchemaState({ read: true, appliedCount: 76, appliedLatest: "0075_x" }, "0075_x")).toBe(
      "CURRENT",
    );
  });

  it("one migration short is BEHIND, and the reproduced state is named as such", () => {
    // This is the 2026-10-12 production shape: the deployed artifact reads a
    // column added by 0075 while the database is still at 0074.
    expect(
      classifySchemaState(
        { read: true, appliedCount: 75, appliedLatest: "0074_enterprise_intelligence_expansion" },
        "0075_noelia_authority_execution_hardening",
      ),
    ).toBe("BEHIND");
  });

  it("a database ahead of the artifact is AHEAD, not CURRENT", () => {
    expect(classifySchemaState({ read: true, appliedCount: 77, appliedLatest: "0076_x" }, "0075_x")).toBe("AHEAD");
  });

  it("the state vocabulary is closed", () => {
    expect([...SCHEMA_STATES]).toEqual(["CURRENT", "BEHIND", "AHEAD", "UNKNOWN"]);
  });
});

describe("the artifact's expectation is derived, not asserted", () => {
  it("the derivation is behavioural: last register entry, or an honest null", async () => {
    // @ts-expect-error — the build script is plain ESM JavaScript (no .d.ts);
    // its exported pure parsers are typed here at the call site.
    const script = (await import("../../scripts/build-identity.mjs")) as {
      latestMigrationFromJournal: (journal: unknown) => string | null;
      migrationCountFromJournal: (journal: unknown) => number | null;
    };
    expect(
      script.latestMigrationFromJournal({ entries: [{ tag: "0074_a" }, { tag: "0075_noelia" }] }),
    ).toBe("0075_noelia");
    expect(script.migrationCountFromJournal({ entries: [{ tag: "0074_a" }, { tag: "0075_noelia" }] })).toBe(2);
    // A register we cannot read yields null — never a stale literal.
    expect(script.latestMigrationFromJournal({})).toBeNull();
    expect(script.latestMigrationFromJournal(null)).toBeNull();
    expect(script.migrationCountFromJournal({})).toBeNull();
    // Importing the script must not perform the capture (no writes on import).
    expect(Object.keys(script).sort()).toEqual(["latestMigrationFromJournal", "migrationCountFromJournal"]);
  });

  it("the build script no longer publishes a frozen migration literal", () => {
    const buildScript = code("scripts/build-identity.mjs");
    expect(buildScript).toContain("latestMigration: getLatestMigration(),");
    expect(buildScript).not.toContain("latestMigration: getEnv(");
    expect(buildScript).not.toContain("0047_release_approvals");
    expect(buildScript).toContain("_journal.json");
  });

  it("the register the expectation comes from is the one the integrity gate reconciles against", () => {
    expect(existsSync(join(ROOT, "drizzle", "meta", "_journal.json"))).toBe(true);
    expect(read("src/lib/migration/integrity.ts")).toContain("_journal.json");
    // The runner applies `drizzle/<sequence>_<name>.sql` in filename order, so
    // the register's sequence and the applied order cannot disagree.
    expect(read("scripts/migrate.ts")).toMatch(/\^\\d\+_/);
  });

  it("the compiled register carries the head of the migration sequence", () => {
    const journal = JSON.parse(read("drizzle/meta/_journal.json")) as { entries: Array<{ tag: string }> };
    const lastTag = journal.entries[journal.entries.length - 1]!.tag;
    // The bundle imports the tracked register, so the expectation survives a
    // runtime that cannot read a build artifact.
    expect(latestJournalTag()).toBe(lastTag);
    // And the accessor reports a real expectation, never null, in this build.
    expect(expectedMigrationOfRunningArtifact()).toBe(lastTag);
    expect(migrationSequence(expectedMigrationOfRunningArtifact())).toBe(
      Math.max(...journal.entries.map((entry) => migrationSequence(entry.tag) ?? -1)),
    );
  });
});

describe("the diagnostic endpoint leaks nothing and authorizes nothing", () => {
  const route = read("src/app/api/health/schema/route.ts");
  const routeCode = code("src/app/api/health/schema/route.ts");
  const probe = read("src/lib/health/schema-state.ts");
  const probeCode = code("src/lib/health/schema-state.ts");

  it("is unauthenticated, information-free and never touches a session or tenant", () => {
    // No principal, no session, no tenant/entity scope, no guard: this route
    // answers a deployment question and reads no governed data.
    for (const forbidden of [
      "requirePrincipal",
      "resolvePrincipal",
      "session",
      "tenant",
      "entityScope",
      "guarded(",
      "withTenantDatabaseContext",
      "cookies(",
    ]) {
      expect(routeCode.toLowerCase()).not.toContain(forbidden.toLowerCase());
      expect(probeCode.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("reads only the migration ledger, and only with SELECT", () => {
    expect(probeCode).toContain("from public.beyu_migrations");
    expect(probeCode.toLowerCase()).toContain("select");
    for (const forbidden of ["insert ", "update ", "delete ", "alter ", "drop ", "truncate "]) {
      expect(probeCode.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("never returns a credential, DSN, driver message or raw exception", () => {
    for (const forbidden of [
      "DATABASE_URL",
      "password",
      "postgres://",
      "postgresql://",
      "e.message",
      "String(e)",
      "err.stack",
      "console.error(e",
    ]) {
      expect(routeCode).not.toContain(forbidden);
      expect(probeCode).not.toContain(forbidden);
    }
  });

  it("is not wired into authorization, readiness or the error boundary", () => {
    // The diagnostic must not become a gate: no policy module reads it.
    for (const path of [
      "src/lib/authz.ts",
      "src/lib/guard.ts",
      "src/lib/db-health.ts",
      "src/app/api/health/route.ts",
    ]) {
      expect(read(path)).not.toContain("schema-state");
      expect(read(path)).not.toContain("probeSchemaState");
    }
  });

  it("reports the state in the body with a stable envelope and a traceable log line", () => {
    expect(route).toContain("force-dynamic");
    expect(route).toContain("checks: {");
    expect(route).toContain("schema: assessment.state");
    expect(route).toContain("schema_state_probe");
  });
});

describe("the error boundary tells the truth about a load failure", () => {
  const boundary = read("src/app/error.tsx");

  it("does not claim a permissions decision for a load failure", () => {
    expect(boundary).not.toContain("Access remains subject to your existing permissions");
    expect(boundary).toContain("not an access decision");
  });

  it("surfaces the digest as the support reference and logs nothing governed", () => {
    expect(boundary).toContain("error.digest");
    expect(boundary).toContain("reference");
    // The raw exception message is never echoed into the page or the console.
    expect(boundary).not.toContain("error.message");
    expect(boundary).not.toContain("{error}");
  });

  it("keeps the branded, accessible reset affordance", () => {
    expect(boundary).toContain("BeyuOsLogo");
    expect(boundary).toContain("reset");
    expect(boundary).toContain("min-h-11");
  });
});
