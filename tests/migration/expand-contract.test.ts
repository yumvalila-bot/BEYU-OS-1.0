/**
 * P2 — Expand/Contract enforcement.
 *
 * THE INVARIANT
 * ─────────────
 *   the NEW database schema must remain compatible with the CURRENT release and
 *   the NEXT release for the whole expansion window.
 *
 *   EXPAND → MIGRATE → VERIFY → CANARY → PROMOTE → CONTRACT
 *
 * P2 implements the DATABASE-COMPATIBILITY portion only. There is no canary
 * traffic, no percentage rollout and no blue/green routing here — those are
 * later phases, and nothing in this file implies otherwise.
 *
 * What this suite proves:
 *   • the classifier permits every genuinely safe expansion;
 *   • it rejects every unsafe EARLY contraction (the operations that would break
 *     a release still running against the old schema);
 *   • two patterns that dominate BEYU's real history are NOT contraction, so the
 *     gate is not permanently red and reviewers do not learn to ignore it;
 *   • applied to the real repository, exactly one migration is a contraction,
 *     and it is the historical one already guarded at runtime.
 *
 * DB-free: this is a policy test over SQL text.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HISTORICAL_DESTRUCTIVE_MIGRATIONS,
  classifyMigration,
  readMigrationFiles,
  scanDestructive,
} from "../../src/lib/migration/integrity";

const DRIZZLE = join(process.cwd(), "drizzle");

// ─────────────────────────────────────────────────────────────────────────────
// SAFE EXPANSIONS — must be permitted
// ─────────────────────────────────────────────────────────────────────────────

const SAFE_EXPANSIONS: Array<{ name: string; sql: string }> = [
  { name: "add a nullable column", sql: `ALTER TABLE tenants ADD COLUMN nickname TEXT;` },
  { name: "add a nullable column with a default", sql: `ALTER TABLE tenants ADD COLUMN tier TEXT NOT NULL DEFAULT 'STANDARD';` },
  { name: "create a new table", sql: `CREATE TABLE IF NOT EXISTS ujenzi_sites (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL);` },
  { name: "create a compatible index", sql: `CREATE INDEX IF NOT EXISTS ujenzi_sites_tenant_idx ON ujenzi_sites USING btree (tenant_id);` },
  { name: "create a unique index", sql: `CREATE UNIQUE INDEX IF NOT EXISTS ujenzi_sites_tenant_code_uidx ON ujenzi_sites (tenant_id, code);` },
  { name: "add a constraint", sql: `ALTER TABLE ujenzi_sites ADD CONSTRAINT ujenzi_sites_code_ck CHECK (char_length(code) > 0);` },
  { name: "enable row level security", sql: `ALTER TABLE ujenzi_sites ENABLE ROW LEVEL SECURITY; ALTER TABLE ujenzi_sites FORCE ROW LEVEL SECURITY;` },
  { name: "add an RLS policy", sql: `CREATE POLICY ujenzi_sites_tenant_isolation ON ujenzi_sites USING (tenant_id = current_setting('beyu.tenant_id'));` },
  {
    name: "re-declare an RLS policy idempotently (the dominant BEYU pattern)",
    sql: `DROP POLICY IF EXISTS ujenzi_sites_tenant_isolation ON ujenzi_sites;
          CREATE POLICY ujenzi_sites_tenant_isolation ON ujenzi_sites USING (tenant_id = current_setting('beyu.tenant_id'));`,
  },
  {
    name: "tighten a constraint by re-declaring it under the same name",
    sql: `ALTER TABLE financial_periods DROP CONSTRAINT IF EXISTS financial_period_dates_ordered;
          ALTER TABLE financial_periods ADD CONSTRAINT financial_period_dates_ordered CHECK (start_date <= end_date);`,
  },
  {
    name: "install a guard trigger that PREVENTS truncation",
    sql: `CREATE TRIGGER audit_log_immutable_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION beyu_prevent_audit_truncate();`,
  },
];

describe("P2 — Expand/Contract permits safe expansion", () => {
  for (const c of SAFE_EXPANSIONS) {
    it(`permits: ${c.name}`, () => {
      const r = classifyMigration(c.sql);
      expect(r.verdict, `expected EXPAND, got CONTRACT because of ${r.contract.join(", ")}`).toBe("EXPAND");
      expect(r.contract).toEqual([]);
    });
  }

  it("reports the concrete expand reasons so a review can see WHAT expanded", () => {
    const r = classifyMigration(`CREATE TABLE t(id int); CREATE INDEX t_idx ON t(id); ALTER TABLE t ADD COLUMN c text;`);
    expect(r.expand).toContain("CREATE_TABLE");
    expect(r.expand).toContain("CREATE_INDEX");
    expect(r.expand).toContain("ADD_COLUMN");
  });

  it("permits P2's corrective migration 0045 — a purely additive index", () => {
    const sql = readFileSync(join(DRIZZLE, "0045_payment_webhook_events_tenant_index.sql"), "utf8");
    const r = classifyMigration(sql);
    expect(r.verdict).toBe("EXPAND");
    expect(r.contract).toEqual([]);
    expect(r.expand).toContain("CREATE_INDEX");
    expect(scanDestructive(sql)).toEqual([]);
    // Idempotent: a re-run must not fail, which is what makes it replay-safe.
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UNSAFE EARLY CONTRACTION — must be rejected
// ─────────────────────────────────────────────────────────────────────────────

const UNSAFE_CONTRACTIONS: Array<{ name: string; sql: string; reason: string }> = [
  {
    name: "drop a column an older release still reads",
    sql: `ALTER TABLE payment_webhook_events DROP COLUMN tenant_id;`,
    reason: "DROP_COLUMN",
  },
  {
    name: "rename a column without a compatibility layer",
    sql: `ALTER TABLE tenants RENAME COLUMN name TO display_name;`,
    reason: "RENAME_COLUMN",
  },
  {
    name: "rename a table an older release still queries",
    sql: `ALTER TABLE tenants RENAME TO tenant_registry;`,
    reason: "RENAME_TABLE",
  },
  {
    name: "drop a table an older release still accesses",
    sql: `DROP TABLE ujenzi_sites;`,
    reason: "DROP_TABLE",
  },
  {
    name: "make a nullable field mandatory before every writer has migrated",
    sql: `ALTER TABLE tenants ALTER COLUMN nickname SET NOT NULL;`,
    reason: "SET_NOT_NULL",
  },
  {
    name: "perform a destructive type conversion with no compatibility phase",
    sql: `ALTER TABLE tenants ALTER COLUMN created_at TYPE date;`,
    reason: "ALTER_COLUMN_TYPE",
  },
  {
    name: "truncate a table",
    sql: `TRUNCATE TABLE audit_log;`,
    reason: "TRUNCATE",
  },
  {
    name: "truncate without the TABLE keyword",
    sql: `TRUNCATE audit_log;`,
    reason: "TRUNCATE",
  },
  {
    name: "remove a constraint without replacing it",
    sql: `ALTER TABLE journal_lines DROP CONSTRAINT journal_line_single_sided;`,
    reason: "DROP_CONSTRAINT_NOT_REPLACED",
  },
  {
    name: "remove an RLS policy without replacing it",
    sql: `DROP POLICY ujenzi_sites_tenant_isolation ON ujenzi_sites;`,
    reason: "DROP_POLICY_NOT_REPLACED",
  },
  {
    name: "drop a schema",
    sql: `DROP SCHEMA public CASCADE;`,
    reason: "DROP_SCHEMA",
  },
  {
    name: "drop the database",
    sql: `DROP DATABASE beyu_os;`,
    reason: "DROP_DATABASE",
  },
];

describe("P2 — Expand/Contract rejects unsafe early contraction", () => {
  for (const c of UNSAFE_CONTRACTIONS) {
    it(`rejects: ${c.name}`, () => {
      const r = classifyMigration(c.sql);
      expect(r.verdict).toBe("CONTRACT");
      expect(r.contract).toContain(c.reason);
    });
  }

  it("flags the same operations as destructive where data would be lost", () => {
    expect(scanDestructive(`DROP TABLE t;`)).toContain("DROP TABLE");
    expect(scanDestructive(`ALTER TABLE t DROP COLUMN c;`)).toContain("DROP COLUMN");
    expect(scanDestructive(`TRUNCATE TABLE t;`)).toContain("TRUNCATE");
    expect(scanDestructive(`DROP DATABASE d;`)).toContain("DROP DATABASE");
  });

  it("treats privilege escalation as destructive — RLS must never be bypassed", () => {
    // A migration that grants BYPASSRLS or SUPERUSER would defeat the final
    // data-isolation boundary, so it is a stop-the-line operation even though it
    // destroys no rows. Both spellings are covered: GRANT … and ALTER ROLE ….
    expect(scanDestructive(`ALTER ROLE beyu_runtime BYPASSRLS;`)).toContain("ALTER ROLE BYPASSRLS");
    expect(scanDestructive(`ALTER ROLE beyu_runtime WITH SUPERUSER;`)).toContain("ALTER ROLE SUPERUSER");
    // The GRANT spelling is retained for defence in depth. Note that the word
    // "superuser" inside a COMMENT is correctly ignored — comments are stripped
    // before matching, so documentation cannot trip the gate.
    expect(scanDestructive(`GRANT superuser TO beyu_runtime;`)).toContain("GRANT SUPERUSER");
    expect(scanDestructive(`GRANT ALL ON SCHEMA public TO beyu_runtime; -- not superuser`)).toEqual([]);
  });

  it("does not flag the hardening direction NOSUPERUSER / NOBYPASSRLS", () => {
    // setup-db-role.ts constrains the runtime role with exactly these tokens.
    // Flagging them would punish the safe direction and train reviewers to
    // reach for --allow-destructive.
    expect(scanDestructive(`ALTER ROLE beyu_runtime NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;`)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Identifier quoting — a scanner that handles one style silently misreads other
// ─────────────────────────────────────────────────────────────────────────────

describe("P2 — classification is correct for both identifier quoting styles", () => {
  it("matches a paired DROP/CREATE POLICY whether or not identifiers are quoted", () => {
    const quoted = `DROP POLICY IF EXISTS "t_isolation" ON "t"; CREATE POLICY "t_isolation" ON "t" USING (true);`;
    const bare = `DROP POLICY IF EXISTS t_isolation ON t; CREATE POLICY t_isolation ON t USING (true);`;
    expect(classifyMigration(quoted).contract).not.toContain("DROP_POLICY_NOT_REPLACED");
    expect(classifyMigration(bare).contract).not.toContain("DROP_POLICY_NOT_REPLACED");
  });

  it("still catches an unpaired DROP POLICY in either style", () => {
    expect(classifyMigration(`DROP POLICY IF EXISTS "t_isolation" ON "t";`).contract).toContain("DROP_POLICY_NOT_REPLACED");
    expect(classifyMigration(`DROP POLICY IF EXISTS t_isolation ON t;`).contract).toContain("DROP_POLICY_NOT_REPLACED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Applied to the REAL repository — real migrations are the fixtures
// ─────────────────────────────────────────────────────────────────────────────

describe("P2 — Expand/Contract applied to the real migration history", () => {
  const files = readMigrationFiles(DRIZZLE);
  const classified = files.map((f) => ({ f, c: classifyMigration(f.sql) }));
  const contractions = classified.filter((x) => x.c.verdict === "CONTRACT");

  it("every migration classifies as EXPAND or CONTRACT — never unknown", () => {
    for (const x of classified) expect(["EXPAND", "CONTRACT"]).toContain(x.c.verdict);
  });

  it("exactly one migration in the whole history is a contraction", () => {
    // That single contraction is 0001, the candidate-sandbox hardening that
    // truncates the pre-hardening audit and event ledgers. Everything BEYU has
    // shipped since is expansion — which is precisely why the Expand/Contract
    // invariant is enforceable here rather than aspirational.
    expect(contractions.map((x) => x.f.version)).toEqual([...HISTORICAL_DESTRUCTIVE_MIGRATIONS]);
  });

  it("the only contraction is also the only destructive migration", () => {
    const destructive = files.filter((f) => scanDestructive(f.sql).length > 0).map((f) => f.version);
    expect(destructive).toEqual(contractions.map((x) => x.f.version));
  });

  it("no migration since 0001 drops a column, renames anything, or tightens nullability", () => {
    const recent = classified.filter((x) => x.f.seq > "0001");
    for (const x of recent) {
      expect(x.c.contract, `${x.f.version} should not contract`).not.toContain("DROP_COLUMN");
      expect(x.c.contract).not.toContain("RENAME_COLUMN");
      expect(x.c.contract).not.toContain("RENAME_TABLE");
      expect(x.c.contract).not.toContain("SET_NOT_NULL");
      expect(x.c.contract).not.toContain("ALTER_COLUMN_TYPE");
      expect(x.c.contract).not.toContain("DROP_TABLE");
    }
  });

  it("the RLS re-declaration pattern is not mistaken for contraction", () => {
    // Dozens of BEYU migrations DROP POLICY then CREATE POLICY under the same
    // name. If that read as contraction the gate would be permanently red and
    // worthless as a signal.
    const redeclaring = classified.filter((x) => /DROP POLICY/i.test(x.f.sql));
    expect(redeclaring.length).toBeGreaterThan(10);
    for (const x of redeclaring) expect(x.c.contract).not.toContain("DROP_POLICY_NOT_REPLACED");
  });

});

describe("P2 — the Expand/Contract lifecycle is documented, not implied", () => {
  it("the pipeline records the full EXPAND → … → CONTRACT sequence", () => {
    const invariants = readFileSync(join(process.cwd(), "tests", "architecture", "p1-release-invariants.test.ts"), "utf8");
    expect(invariants).toContain("EXPAND → MIGRATE → VERIFY → CANARY → PROMOTE → CONTRACT");
  });

  it("destructive pending migrations still require explicit human approval", () => {
    const dbRelease = readFileSync(join(process.cwd(), "scripts", "db-release.ts"), "utf8");
    expect(dbRelease).toContain("REQUIRES_HUMAN_APPROVAL");
    expect(dbRelease).toContain("--allow-destructive");
    expect(dbRelease).toContain("databaseEmpty");
  });
});
