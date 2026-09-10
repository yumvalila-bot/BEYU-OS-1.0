/**
 * setup-db-role.ts reconciliation — statement-level regression suite.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The Supabase privilege-boundary suite
 * (tests/security/runtime-role-supabase-boundary.test.ts) proves the
 * remediated script against a real PostgreSQL through a non-superuser
 * CREATEROLE administrator. This companion suite observes the script at the
 * STATEMENT level — with `pg` mocked, every SQL string the script executes is
 * recorded — so the exact contract of the role-exists branch is pinned
 * independently of any database being reachable:
 *
 *   1. an existing SAFE role is reconciled by CATALOG VERIFICATION: the only
 *      ALTER ROLE ever executed is the legal `LOGIN PASSWORD` credential
 *      re-assert — never a superuser-only attribute re-assertion (the
 *      production 42501);
 *   2. an ELEVATED role fails closed BEFORE any credential, grant or ownership
 *      mutation, with a sanitized error naming the violated invariant;
 *   3. the CREATE branch still issues the fully constrained CREATE ROLE;
 *   4. identifiers and the password literal keep flowing exclusively through
 *      format() %I / %L — no string concatenation of secrets.
 *
 * No database is required; the mocked DSN below never leaves the process.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

/**
 * Mocked driver state. `pg.Client` records every executed statement; the
 * catalog answers are configured per test. The module under test self-executes
 * main() on import, so each case imports it fresh (vi.resetModules) after
 * configuring the environment.
 */
const mock = vi.hoisted(() => {
  type Catalog = {
    exists: boolean;
    rolsuper: boolean;
    rolbypassrls: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
    rolreplication: boolean;
  };
  const state: {
    statements: string[];
    catalog: Catalog;
    exitCodes: number[];
    annotations: Array<{ title: string; detail: string }>;
    failures: Array<{ context: string; error: string }>;
    importError: unknown;
    ended: boolean;
    resolveSettled: (() => void) | null;
    settled: Promise<void>;
  } = {
    statements: [],
    catalog: { exists: true, rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false },
    exitCodes: [],
    annotations: [],
    failures: [],
    importError: undefined,
    ended: false,
    resolveSettled: null,
    settled: Promise.resolve(),
  };
  const settle = (): void => state.resolveSettled?.();
  const reset = (catalog: Partial<Catalog> = {}): void => {
    state.statements = [];
    state.exitCodes = [];
    state.annotations = [];
    state.failures = [];
    state.importError = undefined;
    state.ended = false;
    state.catalog = {
      exists: true,
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolreplication: false,
      ...catalog,
    };
    state.settled = new Promise<void>((resolve) => {
      state.resolveSettled = resolve;
    });
  };
  return { state, settle, reset };
});

vi.mock("pg", () => {
  /** PostgreSQL format() subset used by the script: %I (quote_ident) / %L (quote_literal). */
  const format = (template: string, params: unknown[]): string => {
    let i = 0;
    return template.replace(/%[IL]/g, (spec) => {
      const value = String(params[i++]);
      if (spec === "%I") return `"${value.replace(/"/g, '""')}"`;
      return `'${value.replace(/'/g, "''")}'`;
    });
  };
  class Client {
    async connect(): Promise<void> {
      /* no real connection is ever made */
    }
    async query(sql: string, params: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }> {
      const s = sql.trim();
      mock.state.statements.push(s);
      if (s.startsWith("select format(")) {
        const m = s.match(/^select format\('(.*)'(?:, .*)?\) as stmt$/);
        if (!m) throw new Error("mock: unrecognised format() template");
        return { rows: [{ stmt: format(m[1], params) }], rowCount: 1 };
      }
      if (s.includes("from pg_roles where rolname = $1")) {
        // Existence probe and final verification share this shape. A CREATE
        // ROLE statement flips the catalog, exactly like the real server.
        if (mock.state.catalog.exists) {
          return {
            rows: [
              {
                rolname: process.env.BEYU_RUNTIME_DB_ROLE ?? "beyu_runtime",
                rolsuper: mock.state.catalog.rolsuper,
                rolbypassrls: mock.state.catalog.rolbypassrls,
                rolcreaterole: mock.state.catalog.rolcreaterole,
                rolcreatedb: mock.state.catalog.rolcreatedb,
                rolreplication: mock.state.catalog.rolreplication,
                rolinherit: true,
                rolcanlogin: true,
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      }
      if (s.startsWith("create role ")) {
        mock.state.catalog = { ...mock.state.catalog, exists: true };
        return { rows: [], rowCount: 0 };
      }
      if (s.startsWith("select current_user")) {
        return { rows: [{ r: "postgres" }], rowCount: 1 };
      }
      // pg_tables presence probes / ownership scan — everything absent.
      return { rows: [], rowCount: 0 };
    }
    async end(): Promise<void> {
      mock.state.ended = true;
      mock.settle();
    }
  }
  return { Client };
});

vi.mock("../../scripts/lib/ci-annotation", () => ({
  annotateError: (title: string, detail: string) => {
    mock.state.annotations.push({ title, detail });
  },
  annotateGateFailures: () => undefined,
  failSanitized: (context: string, e: unknown) => {
    mock.state.failures.push({ context, error: String(e) });
    mock.settle();
  },
}));

const MOCK_DSN = "postgresql://mock:mock@127.0.0.1:5432/mock"; // never a real DSN
const GOVERNED = "unit_governed_runtime_pw_14+";
const MANAGED_ENV_KEYS = [
  "BEYU_ADMIN_DATABASE_URL",
  "DATABASE_URL",
  "BEYU_RUNTIME_DB_PASSWORD",
  "BEYU_RUNTIME_DB_ROLE",
] as const;

describe("setup-db-role — catalog-driven reconciliation (statement level)", () => {
  let exitSpy: MockInstance<(code?: number) => never>;
  let logSpy: MockInstance<(...data: unknown[]) => void>;
  let errSpy: MockInstance<(...data: unknown[]) => void>;
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of MANAGED_ENV_KEYS) originalEnv[key] = process.env[key];
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      mock.state.exitCodes.push(Number(code ?? 0));
      mock.settle();
      // Stop main() where the real process would die, so later statements
      // (grants, verification) are never executed after a fail-closed exit.
      throw new Error(`SCRIPT_EXIT_${code ?? 0}`);
    }) as (code?: string | number | null) => never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
    // Restore the ambient environment exactly (CI exports these to the whole
    // vitest process; later suites depend on them).
    for (const key of MANAGED_ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  async function runScript(
    catalog: Partial<typeof mock.state.catalog> = {},
    password: string = GOVERNED,
  ): Promise<void> {
    process.env.BEYU_ADMIN_DATABASE_URL = MOCK_DSN;
    process.env.BEYU_RUNTIME_DB_PASSWORD = password;
    mock.reset(catalog);
    vi.resetModules();
    try {
      await import("../../scripts/setup-db-role");
    } catch (e) {
      // Import-time validation errors (missing env, short password) — recorded;
      // tests assert on them explicitly.
      mock.state.importError = e;
      mock.settle();
      return;
    }
    await Promise.race([
      mock.state.settled,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("script did not settle (mock)")), 5_000),
      ),
    ]);
  }

  const executedAlterRole = (): string[] => mock.state.statements.filter((s) => /^alter role/i.test(s));
  const attributeAsserts = (): string[] =>
    executedAlterRole().filter((s) => /(nosuperuser|nobypassrls|nocreaterole|nocreatedb|noreplication)/i.test(s));
  const loggedText = (): string => logSpy.mock.calls.map((c) => String(c[0])).join("\n");

  it("TEST 1 — existing SAFE role: no attribute ALTER ROLE; exactly one legal credential re-assert; grants proceed; verification succeeds", async () => {
    await runScript({ exists: true });

    expect(mock.state.importError).toBeUndefined();
    expect(mock.state.exitCodes).toEqual([]);
    expect(mock.state.failures).toEqual([]);

    // THE regression contract: no superuser-only attribute re-assertion.
    expect(attributeAsserts()).toEqual([]);
    // The legal credential reconciliation — exactly once.
    expect(executedAlterRole()).toEqual([`alter role "beyu_runtime" login password '${GOVERNED}'`]);
    // Grants / ownership / default-privilege reconciliation proceed.
    expect(mock.state.statements).toContain('grant usage on schema public to "beyu_runtime"');
    expect(mock.state.statements).toContain(
      "grant select, insert, update, delete on all tables in schema public to beyu_runtime",
    );
    expect(
      mock.state.statements.some((s) => s.startsWith('alter default privileges for role "postgres" in schema public')),
    ).toBe(true);
    // Final verification ran and reported ok.
    expect(mock.state.ended).toBe(true);
    expect(loggedText()).toContain("catalog attributes verified safe");
    expect(loggedText()).toContain('"ok": true');
    // No secret in any output channel.
    expect(loggedText()).not.toContain(GOVERNED);
  });

  const elevatedCases = [
    { label: "TEST 2 — SUPERUSER", elevation: { rolsuper: true }, attribute: "SUPERUSER" },
    { label: "TEST 3 — BYPASSRLS", elevation: { rolbypassrls: true }, attribute: "BYPASSRLS" },
    { label: "TEST 4 — REPLICATION", elevation: { rolreplication: true }, attribute: "REPLICATION" },
    { label: "TEST 5a — CREATEROLE", elevation: { rolcreaterole: true }, attribute: "CREATEROLE" },
    { label: "TEST 5b — CREATEDB", elevation: { rolcreatedb: true }, attribute: "CREATEDB" },
  ] as const;

  it.each(elevatedCases)(
    "$label: fail closed before any mutation, sanitized error names the invariant",
    async ({ elevation, attribute }) => {
      await runScript({ exists: true, ...elevation });

      expect(mock.state.exitCodes).toEqual([1]);
      // The fail-closed error is published as an annotation with fixed
      // vocabulary naming the violated invariant and the human path.
      expect(mock.state.annotations).toHaveLength(1);
      expect(mock.state.annotations[0].title).toBe("runtime role provisioning");
      expect(mock.state.annotations[0].detail).toContain(`ELEVATED (${attribute})`);
      expect(mock.state.annotations[0].detail).toContain("authorized administrative path");
      // Same sanitized JSON on stderr.
      const errOut = errSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(errOut).toContain(`ELEVATED (${attribute})`);
      expect(errOut).not.toContain(GOVERNED);
      // Before the fail-closed exit not a single ALTER ROLE ran — in
      // particular no credential mutation and no attribute mutation.
      expect(executedAlterRole()).toEqual([]);
      // And no grants were issued either.
      expect(mock.state.statements.some((s) => /^grant /i.test(s))).toBe(false);
    },
  );

  it("TEST 6 — role does not exist: CREATE branch still issues the fully constrained CREATE ROLE", async () => {
    await runScript({ exists: false });

    expect(mock.state.importError).toBeUndefined();
    expect(mock.state.exitCodes).toEqual([]);
    expect(mock.state.failures).toEqual([]);
    expect(mock.state.statements).toContain(
      `create role "beyu_runtime" login password '${GOVERNED}' nosuperuser nobypassrls nocreaterole nocreatedb noreplication`,
    );
    // The create path never re-asserts a password via ALTER ROLE.
    expect(executedAlterRole()).toEqual([]);
    expect(mock.state.ended).toBe(true);
    expect(loggedText()).toContain("created role beyu_runtime");
    expect(loggedText()).toContain('"ok": true');
    expect(loggedText()).not.toContain(GOVERNED);
  });

  it("TEST 7 — the password re-assertion survives and is the ONLY ALTER ROLE on the safe path", async () => {
    await runScript({ exists: true });
    expect(executedAlterRole()).toEqual([`alter role "beyu_runtime" login password '${GOVERNED}'`]);
  });

  it("TEST 8 — identifiers and the password literal keep flowing through format() %I / %L only", async () => {
    const hostileRole = `probe"; drop role beyu_runtime; --`;
    const hostilePassword = `p'w${"x".repeat(14)}`; // ≥14 chars, contains a single quote
    const expectedRole = `"${hostileRole.replace(/"/g, '""')}"`;
    const expectedLiteral = `'${hostilePassword.replace(/'/g, "''")}'`;
    process.env.BEYU_RUNTIME_DB_ROLE = hostileRole;

    // CREATE branch: both values render through %I / %L as ONE quoted
    // identifier and ONE escaped literal — not an injection chain.
    await runScript({ exists: false }, hostilePassword);
    const create = mock.state.statements.find((s) => s.startsWith("create role "));
    expect(create).toBe(
      `create role ${expectedRole} login password ${expectedLiteral} nosuperuser nobypassrls nocreaterole nocreatedb noreplication`,
    );
    // The raw password literal must never appear unescaped.
    expect(mock.state.statements.join("\n")).not.toContain(`'${hostilePassword}'`);

    // Role-exists branch: the credential re-assert renders the same way.
    await runScript({ exists: true }, hostilePassword);
    expect(executedAlterRole()).toEqual([`alter role ${expectedRole} login password ${expectedLiteral}`]);
  });
});
