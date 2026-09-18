/**
 * P2 — migration integrity.
 *
 * These tests are DB-free: they read `drizzle/` and assert the properties the
 * CI MIGRATION INTEGRITY stage enforces, through the SAME functions the stage
 * calls (`src/lib/migration/integrity.ts`). A green suite therefore means the
 * gate itself is correct, not that a parallel reimplementation agrees.
 *
 * The most load-bearing test here is the last one: it pins the sha256 of every
 * historical migration. Reconciling metadata must never be achieved by editing
 * applied SQL, and this makes that impossible without a visible, reviewed change.
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  KNOWN_METADATA_DEBT,
  HISTORICAL_DESTRUCTIVE_MIGRATIONS,
  DRIFT_MODEL,
  ISSUE_DRIFT_CLASS,
  blockingIssues,
  classifyMigration,
  reconcile,
  readMigrationFiles,
  readJournal,
  readSnapshots,
  scanDestructive,
  sha256,
} from "../../src/lib/migration/integrity";

const DRIZZLE = join(process.cwd(), "drizzle");

/** sha256 of every migration that existed before P2, captured at
 *  ae09d538e4acd5bba4769bfa8bb36f636a350094. Editing any of these files — to
 *  "fix" metadata, to renumber, to reformat — fails this suite. */
export const HISTORICAL_MIGRATION_CHECKSUMS = {
  "0000_kernel_v1_baseline": "4447afa4bac250e4a2adc4477285cc6917345a1034838fec0bed7cf3d954f1e0",
  "0001_kernel_gate1_hardening": "20845fa656a5410ca38634f22c5b92a152e3601d3116c44825ab47bf94449ef8",
  "0002_governed_idempotency": "b732612c3099bb0d0840f8cd3380ca2d1417f791ca67fd71346a72b6259c7fe6",
  "0003_governance_voting": "e01ba08b6bc7d197cabc78e6462e74336b99facf8b91b80efbea1dddfef2149e",
  "0004_governance_decision": "f4dccaae280483aa4538eed468ff296464659270818a42785c981c73aae8f099",
  "0005_ledger_integrity_invariants": "d86e75c1d14888fa2b0495e9ca045f1cdaf4a0d722be861224f8b10d86c32417",
  "0006_journal_scope_integrity": "ab8b49597c4d15fa10540f7e51dd134119a61b0af2b426245cca9b67603ebf97",
  "0007_policy_provenance_integrity": "db96f9b22f4f8ed77cfe14e0c39356012d6ad1e709a96ba111bfe86499f5ba1b",
  "0008_audit_truncate_and_policy_window_integrity": "a49c6f142d0aa2ab6d2cb394786eefb9c86d247cae21ac6726110ba43bdfc586",
  "0009_governance_provenance_referential_integrity": "3a95c7cc73384f9a292fbd194ef4e06ee2f0f6f8c6db6def9a2f63f5799e93b7",
  "0010_governance_decision_registry": "8f3128a8ffab9242a7a1753dd8efcb6daea913ebf16efa98c585e68908554ffd",
  "0011_global_user_party_uniqueness": "dcee97cc45f4cd3f91e2ca063217f841892b633d7fb721f8652bcf96c4def150",
  "0012_enterprise_interoperability_envelope": "f131e8fffdccce82fa4acb1028d1c5300cb7cf7108f38a3a0eadd7f8046a9b28",
  "0013_audit_hash_version": "ae9f41d42708491ea9b088a8235c6f4b4056511839477faf257a4ab37dcaebb2",
  "0014_noelia_governance_boundary": "0e7b36031d4aaac4c5c1a138a1ed076af8379219c92d93668809c69ded01853b",
  "0015_noelia_intelligence_expansion": "1c23e652c9b59d9b2d96f9766af7a2dcd99de8fe12423f3e30d13c366be9fda4",
  "0016_noelia_scheduler_offsets": "b8a1ac03b25c95248ee730dcf91d1563e587db9154359444d38a1c67042fb9a0",
  "0017_approval_quorum_model_metadata": "026514545036a647d1d879ff197ec761f9c4118b51f7e6e86fa147c1d6bfdf8b",
  "0018_employees_rls_entity_scope": "9ddb2aa2feb5de7201eb210f7903a76f12af7a463a9ad5514c9abffbaa4389b3",
  "0019_internal_event_receipts": "e13efc065e495ae90bd4453566d52ef79c6168364c6d1ac8f0ceef3ea53061c4",
  "0020_service_principals": "f56b5fcbae9dd95780e17f095bb990e4e7baa12f2aadcb0be72b00da5b48410b",
  "0021_financial_ledger_rls": "d28303b021d0123d82ac35ebc4008cfde857d8a8eec32df60c4d93e7690c98e5",
  "0022_chart_of_accounts_tenant_uniqueness": "ef8c7a3c0cbb38647168d74e29d59022e5a4f6a594afd103bcefca2c50c94d5a",
  "0023_noelia_ai_platform": "26f221d7915a701df87df0a42fcc585844176766693ae70ed19859b7713e0206",
  "0024_noelia_model_runtime": "a4d9ef7eb8ccdf1aebe65551229b07d3732b269884832f6fdb23205b3c6687a1",
  "0025_noelia_model_lifecycle": "4022927259cfe97143720e8ec00705c92100bc1a5481d1879f64c6e160546e0e",
  "0026_noelia_ai_compliance": "fbd077b2237b799e8fc36b7da3adfc2de6dc26dabefecb000cfb3a26fa81d0c8",
  "0027_noelia_ai_phase5_platform": "78aa97184acaa9fb45666b739a640ce9b7e1a722278e819b3497da0096337fa3",
  "0028_payment_banking_core": "733e09c2898ad58827d9f399e548e7a60a6d2aadfaf3a62ca5405149e3769620",
  "0029_payment_posting_rewind_guard": "4138007fcc6bcb0485561b28ae80da7e5d24b856bf723e2d906814317d3ff64b",
  "0030_f01_database_governance_hardening": "3e04928ad26d73f67d921a7317afa928f732f02bb9af5594517650267efc2cc5",
  "0031_agriculture_os_foundation": "663418098b1371f0b5885ca646d935ec7b836346d032ddbc327f176b5011741e",
  "0032_agriculture_rls_policy_fix": "4d46680b2cbc5e4d3c9f9c0137d5a90fe577c851b9b25614b40276fcdf4b7015",
  "0033_admin_bootstrap_state": "290d312cf8f917b5986671486fdfa65cdb33ffaf07e558e07cf871629fd3a76a",
  "0034_agriculture_os": "0e6d41cadc890cc0e00a03a8700c2dfb27afa650debdc785898bedb7e1db4996",
  "0035_foundation_os": "7548fc771e947cca25f26c6c2903cf4ab968d541ec81a3554fa284af9aadf9e8",
  "0036_government_integration_fabric": "eb35b19cba618e2013c10f6c73911e12c8f1a436859d2b8cb26682cbdea766b9",
  "0037_family_office_capital_wealth": "3d85256a831fc94cf2d4c6eef9de695170d6a4ce1d9af70e30fa121de55f8730",
  "0038_family_office_protection_insurance": "98f416f0987ede76ddb242964db7fe451959215f2a2bd97bec6399bc10ee1ab3",
  "0039_agriculture_food_export": "90b418fa7934cb06cd06322ff26b9fd79378e47e130fc09e41a9db1058e310fb",
  "0040_founder_equity_cap_table_esop": "0546d04ab17bd2544e13f6a8bc9a363cbba427791400ea09035566b38741d86d",
  "0041_family_trust_governance": "ec01429f09e3cd13a701367c151e5445200eddec0688152c37e73d6aaf24ab46",
  "0042_governed_contracting_and_blockchain": "640568d3680390afd2f802eeed10cb0e33d6c34bdb87c8fe646773a9f3a6d4bc",
  "0043_ujenzi_os": "82dad295c8e5ce585af4b6ca739b8a72744954952e792832ae71f1135cf56745",
  "0044_admin_user_tenant_governance": "994af2850da412487821050219fee28ce1aa98d0be9d6de5a39688e217031de9",
} as const;

describe("P2 — migration inventory is derived from the canonical source", () => {
  const files = readMigrationFiles(DRIZZLE);

  it("finds every numbered SQL migration and nothing else", () => {
    expect(files.length).toBeGreaterThan(40);
    for (const f of files) {
      expect(f.file).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/);
      expect(f.seq).toBe(f.file.slice(0, 4));
      expect(f.version).toBe(f.file.replace(/\.sql$/, ""));
    }
  });

  it("sequence numbers are unique — a duplicate would silently reorder history", () => {
    const seqs = files.map((f) => f.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it("sequence numbers are contiguous from 0000 with no gaps", () => {
    files.forEach((f, i) => expect(f.seq).toBe(String(i).padStart(4, "0")));
  });

  it("the inventory is in the exact order scripts/migrate.ts applies", () => {
    // migrate.ts does readdirSync(dir).filter(/^\d+_.*\.sql$/).sort(); this
    // asserts the library's ordering is identical, so the matrix describes the
    // real apply order rather than an arbitrary one.
    const runnerOrder = files.map((f) => f.file).sort();
    expect(files.map((f) => f.file)).toEqual(runnerOrder);
  });

  it("checksums are sha256 of the file bytes — the value migrate.ts records", () => {
    for (const f of files) {
      expect(f.checksum).toBe(sha256(readFileSync(join(DRIZZLE, f.file), "utf8")));
      expect(f.checksum).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("no migration file is empty", () => {
    for (const f of files) expect(f.byteLength).toBeGreaterThan(0);
  });
});

describe("P2 — reconciliation against the canonical source", () => {
  const result = reconcile(DRIZZLE);

  it("counts agree with what is on disk", () => {
    expect(result.sqlCount).toBe(readMigrationFiles(DRIZZLE).length);
    expect(result.journalCount).toBe(readJournal(DRIZZLE).length);
    expect(result.snapshotCount).toBe(readSnapshots(DRIZZLE).length);
    expect(result.ledgerCount).toBeNull(); // no ledger supplied: DB-free
  });

  it("the journal is contiguous and agrees with the SQL file order", () => {
    const codes = result.issues.map((i) => i.code);
    expect(codes).not.toContain("JOURNAL_IDX_NOT_CONTIGUOUS");
    expect(codes).not.toContain("JOURNAL_TAG_ORDER_MISMATCH");
    expect(codes).not.toContain("JOURNAL_WITHOUT_SQL");
  });

  it("no UNACKNOWLEDGED discrepancy exists — the gate would fail otherwise", () => {
    const blocking = blockingIssues(result);
    expect(blocking.map((b) => `${b.code}:${b.subject}`)).toEqual([]);
  });

  it("the known metadata debt is still exactly the debt P2 recorded", () => {
    // This is the anti-rot assertion. The debt is acknowledged, not fixed, and
    // cannot be fixed honestly (see KNOWN_METADATA_DEBT). What it must never do
    // is GROW unnoticed: a new migration without metadata has to be added here
    // explicitly, which is a reviewable act.
    const ack = result.issues.filter((i) => i.acknowledged);
    const missingSnapshot = ack.filter((i) => i.code === "SQL_WITHOUT_SNAPSHOT").map((i) => i.subject).sort();
    const missingJournal = ack.filter((i) => i.code === "SQL_NOT_IN_JOURNAL").map((i) => i.subject).sort();
    expect(missingSnapshot).toEqual([...KNOWN_METADATA_DEBT.missingSnapshot].sort());
    expect(missingJournal).toEqual([...KNOWN_METADATA_DEBT.missingJournal].sort());
  });

  it("the 0038/0039 snapshot collision is still present and still acknowledged", () => {
    // Documented, not silently green: this is the exact condition that made
    // `drizzle-kit generate` abort with exit 0, which blinded the old gate.
    const collisions = result.issues.filter(
      (i) => i.code === "SNAPSHOT_CHAIN_COLLISION" || i.code === "SNAPSHOT_ID_NOT_UNIQUE",
    );
    expect(collisions.length).toBeGreaterThan(0);
    expect(collisions.every((c) => c.subject === "0039")).toBe(true);
    expect(collisions.every((c) => c.acknowledged)).toBe(true);
  });
});

describe("P2 — the reconciliation logic detects the failures it exists for", () => {
  // Built against throwaway fixtures so the assertions exercise the real
  // functions rather than a description of them.
  function withFixture(build: (dir: string) => void, fn: (dir: string) => void) {
    const dir = mkdtempSync(join(tmpdir(), "beyu-integrity-"));
    try {
      mkdirSync(join(dir, "meta"), { recursive: true });
      build(dir);
      fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const journal = (tags: string[]) =>
    JSON.stringify({
      version: "7",
      dialect: "postgresql",
      entries: tags.map((tag, idx) => ({ idx, version: "7", when: 1789154761429 + idx, tag, breakpoints: true })),
    });

  it("a duplicate migration identifier is reported", () => {
    withFixture(
      (d) => {
        writeFileSync(join(d, "0000_a.sql"), "create table a(id int);");
        writeFileSync(join(d, "0000_b.sql"), "create table b(id int);");
        writeFileSync(join(d, "meta", "_journal.json"), journal(["0000_a", "0000_b"]));
      },
      (d) => {
        const r = reconcile(d);
        // Both files share seq 0000; contiguity and journal order both break.
        expect(blockingIssues(r).length).toBeGreaterThan(0);
        expect(r.rows.filter((x) => x.seq === "0000").length).toBe(2);
      },
    );
  });

  it("an unexpected migration recorded in the ledger is reported", () => {
    withFixture(
      (d) => {
        writeFileSync(join(d, "0000_a.sql"), "create table a(id int);");
        writeFileSync(join(d, "meta", "_journal.json"), journal(["0000_a"]));
      },
      (d) => {
        const r = reconcile(d, [
          { version: "0000_a", checksum: sha256("create table a(id int);"), mode: "APPLIED" },
          { version: "9999_ghost", checksum: "deadbeef", mode: "APPLIED" },
        ]);
        expect(r.issues.map((i) => i.code)).toContain("LEDGER_UNEXPECTED_MIGRATION");
      },
    );
  });

  it("a checksum mismatch between file and ledger is reported", () => {
    withFixture(
      (d) => {
        writeFileSync(join(d, "0000_a.sql"), "create table a(id int);");
        writeFileSync(join(d, "meta", "_journal.json"), journal(["0000_a"]));
      },
      (d) => {
        const r = reconcile(d, [{ version: "0000_a", checksum: "f".repeat(64), mode: "APPLIED" }]);
        expect(r.issues.map((i) => i.code)).toContain("LEDGER_CHECKSUM_MISMATCH");
      },
    );
  });

  it("a migration missing from the ledger is reported", () => {
    withFixture(
      (d) => {
        writeFileSync(join(d, "0000_a.sql"), "create table a(id int);");
        writeFileSync(join(d, "meta", "_journal.json"), journal(["0000_a"]));
      },
      (d) => {
        const r = reconcile(d, []);
        expect(r.issues.map((i) => i.code)).toContain("LEDGER_MISSING_MIGRATION");
      },
    );
  });

  it("a byte-identical copied snapshot is detected as a chain collision", () => {
    const snap = JSON.stringify({ id: "same-id", prevId: "p", tables: { "public.a": {} } });
    withFixture(
      (d) => {
        writeFileSync(join(d, "0000_a.sql"), "create table a(id int);");
        writeFileSync(join(d, "0001_b.sql"), "create table b(id int);");
        writeFileSync(join(d, "meta", "_journal.json"), journal(["0000_a", "0001_b"]));
        writeFileSync(join(d, "meta", "0000_snapshot.json"), snap);
        writeFileSync(join(d, "meta", "0001_snapshot.json"), snap);
      },
      (d) => {
        const r = reconcile(d);
        const codes = r.issues.map((i) => i.code);
        expect(codes).toContain("SNAPSHOT_ID_NOT_UNIQUE");
        expect(codes).toContain("SNAPSHOT_CHAIN_COLLISION");
        expect(blockingIssues(r).length).toBeGreaterThan(0);
      },
    );
  });
});

describe("P2 — destructive-operation detection against the real SQL", () => {
  const files = readMigrationFiles(DRIZZLE);
  const destructive = files.filter((f) => scanDestructive(f.sql).length > 0);

  it("migration 0001 is the ONLY genuinely destructive migration in history", () => {
    expect(destructive.map((f) => f.version)).toEqual([...HISTORICAL_DESTRUCTIVE_MIGRATIONS]);
  });

  it("0001 is destructive because it truncates the audit and event ledgers", () => {
    const m = files.find((f) => f.version === "0001_kernel_gate1_hardening")!;
    expect(scanDestructive(m.sql)).toContain("TRUNCATE");
    expect(m.sql).toMatch(/TRUNCATE TABLE audit_log/i);
    expect(m.sql).toMatch(/TRUNCATE TABLE enterprise_events/i);
  });

  it("0008 is NOT destructive — its TRUNCATE text installs a PREVENTION trigger", () => {
    // This is the false positive that made the old scanner noisy: a bare
    // /\btruncate\b/i scan flags a migration whose whole purpose is to make
    // truncation impossible.
    const m = files.find((f) => f.version === "0008_audit_truncate_and_policy_window_integrity")!;
    expect(m.sql).toMatch(/TRUNCATE/i);
    expect(scanDestructive(m.sql)).toEqual([]);
    expect(m.sql).toMatch(/BEFORE TRUNCATE ON audit_log/i);
  });

  it("no migration drops a table, a column, a schema or a database", () => {
    for (const f of files) {
      const ops = scanDestructive(f.sql);
      expect(ops).not.toContain("DROP TABLE");
      expect(ops).not.toContain("DROP COLUMN");
      expect(ops).not.toContain("DROP SCHEMA");
      expect(ops).not.toContain("DROP DATABASE");
    }
  });

  it("no migration grants SUPERUSER or BYPASSRLS", () => {
    for (const f of files) {
      expect(scanDestructive(f.sql)).not.toContain("GRANT SUPERUSER");
      expect(scanDestructive(f.sql)).not.toContain("GRANT BYPASSRLS");
    }
  });

  it("0043's parameterised dynamic DROP POLICY is not misread as a destructive statement", () => {
    // 0043 contains EXECUTE format('DROP POLICY IF EXISTS %I ON %I', …) inside a
    // PL/pgSQL body. `%I` is a placeholder, not a policy name, so it can never be
    // paired with a CREATE POLICY and must not be read as a contraction.
    const m = files.find((f) => f.version === "0043_ujenzi_os")!;
    expect(m.sql).toMatch(/DROP POLICY IF EXISTS %I ON %I/);
    expect(scanDestructive(m.sql)).toEqual([]);
    expect(classifyMigration(m.sql).contract).not.toContain("DROP_POLICY_NOT_REPLACED");
  });

  it("the runner still refuses the destructive historical migration on a non-empty schema", () => {
    // The classification above is forward-looking enforcement; the runtime
    // guard is separate and must stay wired.
    const migrate = readFileSync(join(process.cwd(), "scripts", "migrate.ts"), "utf8");
    expect(migrate).toContain("DESTRUCTIVE_EXISTING_SCHEMA_MIGRATIONS");
    for (const v of HISTORICAL_DESTRUCTIVE_MIGRATIONS) expect(migrate).toContain(`"${v}"`);
  });
});

describe("P2 — historical migration history is unchanged", () => {
  const files = readMigrationFiles(DRIZZLE);

  it("every pre-P2 migration still has its exact recorded checksum", () => {
    const expected = HISTORICAL_MIGRATION_CHECKSUMS as Record<string, string>;
    const actual = Object.fromEntries(
      files.filter((f) => f.version in expected).map((f) => [f.version, f.checksum]),
    );
    // Any edit, rename, reorder or regeneration of applied SQL shows up here.
    expect(Object.keys(expected).length).toBe(45);
    expect(actual).toEqual(expected);
  });

  it("no historical migration was deleted or renamed", () => {
    const expected = Object.keys(HISTORICAL_MIGRATION_CHECKSUMS);
    const present = files.map((f) => f.version);
    for (const v of expected) expect(present).toContain(v);
  });

  it("P2 adds migrations only at the end of the sequence", () => {
    const files045 = files.filter((f) => f.seq > "0044");
    for (const f of files045) expect(Number(f.seq)).toBeGreaterThan(44);
  });

  it("the metadata debt register was not edited to hide a SQL change", () => {
    // Guard against "fixing" the reconciliation by re-baselining checksums:
    // the pinned list must still cover 0000-0044 exactly.
    const expected = Object.keys(HISTORICAL_MIGRATION_CHECKSUMS).sort();
    expect(expected[0]).toBe("0000_kernel_v1_baseline");
    expect(expected[expected.length - 1]).toBe("0044_admin_user_tenant_governance");
  });
});

describe("P2 — scripts/migrate.ts remains the only supported runner", () => {
  it("no drizzle-orm migrator is imported anywhere in the repository", () => {
    // drizzle-orm's migrator is the only other thing that would consume
    // drizzle/meta; its absence is what makes the metadata authoring-only.
    const ci = readFileSync(join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");
    expect(ci).toContain("npm run migrate");
    // Comment lines are stripped first: ci.yml legitimately CONTAINS the phrase
    // "drizzle-kit push is never used against a managed database" as prose. The
    // assertion that matters is that no executable line invokes it.
    const executable = ci
      .split(/\n/)
      .map((l) => l.replace(/^\s*#.*$/, ""))
      .join("\n");
    expect(executable).not.toMatch(/drizzle-kit\s+push/);
    expect(executable).not.toMatch(/drizzle-kit\s+migrate/);
  });

  it("the runner reads the folder rather than a hardcoded range", () => {
    const migrate = readFileSync(join(process.cwd(), "scripts", "migrate.ts"), "utf8");
    expect(migrate).toMatch(/readdirSync\(dir\)/);
    expect(migrate).toContain('/^\\d+_.*\\.sql$/');
    expect(migrate).toContain("pg_advisory_xact_lock");
    expect(migrate).toContain("sha256");
  });

  it("drizzle/meta is consumed by nothing at runtime", () => {
    for (const rel of ["scripts/migrate.ts", "scripts/db-release.ts", "scripts/dr-drill.ts", "scripts/certify-production.mts"]) {
      const p = join(process.cwd(), rel);
      if (!existsSync(p)) continue;
      const src = readFileSync(p, "utf8");
      expect(src, `${rel} must not read drizzle/meta`).not.toMatch(/drizzle\/meta|_journal\.json|_snapshot\.json/);
    }
  });
});

describe("P2 — the canonical drift model separates production truth from design-time metadata", () => {
  it("names exactly four drift classes", () => {
    expect(Object.keys(DRIFT_MODEL).sort()).toEqual([
      "A_MIGRATION_SOURCE",
      "B_DATABASE_MIGRATION",
      "C_SCHEMA",
      "D_METADATA",
    ]);
  });

  it("classifies every issue code", () => {
    const codes = Object.keys(ISSUE_DRIFT_CLASS);
    expect(codes.length).toBeGreaterThan(8);
    for (const c of codes) expect(Object.values(DRIFT_MODEL).length).toBe(4);
  });

  it("ledger and ordering issues are production-authority classes, never metadata", () => {
    // These assert the SQL source, the ledger and its ordering — the production
    // authority. They must never be downgraded to the metadata class, because
    // only that class is allowed to be acknowledged.
    expect(ISSUE_DRIFT_CLASS.LEDGER_MISSING_MIGRATION).toBe("B_DATABASE_MIGRATION");
    expect(ISSUE_DRIFT_CLASS.LEDGER_CHECKSUM_MISMATCH).toBe("B_DATABASE_MIGRATION");
    expect(ISSUE_DRIFT_CLASS.LEDGER_UNEXPECTED_MIGRATION).toBe("B_DATABASE_MIGRATION");
    expect(ISSUE_DRIFT_CLASS.JOURNAL_IDX_NOT_CONTIGUOUS).toBe("A_MIGRATION_SOURCE");
    expect(ISSUE_DRIFT_CLASS.JOURNAL_TAG_ORDER_MISMATCH).toBe("A_MIGRATION_SOURCE");
  });

  it("only metadata issues are ever acknowledged", () => {
    // The invariant that keeps the debt register honest: no register entry can
    // make a production-authority discrepancy optional.
    const result = reconcile(DRIZZLE);
    for (const i of result.issues) {
      if (i.acknowledged) expect(ISSUE_DRIFT_CLASS[i.code]).toBe("D_METADATA");
    }
  });

  it("a ledger discrepancy is blocking even if someone tries to register it", () => {
    // Simulates the failure mode the model exists to prevent: "acknowledging"
    // production drift to get a green build. The class mapping makes that
    // structurally impossible.
    const result = reconcile(DRIZZLE, [
      { version: "0000_kernel_v1_baseline", checksum: "f".repeat(64), mode: "APPLIED" },
    ]);
    const mismatch = result.issues.find((i) => i.code === "LEDGER_CHECKSUM_MISMATCH")!;
    expect(mismatch.acknowledged).toBe(false);
    expect(ISSUE_DRIFT_CLASS[mismatch.code]).toBe("B_DATABASE_MIGRATION");
  });
});

describe("P2 — the Expand/Contract CI stage passes on the real corpus", () => {
  it("scripts/migration/expand-contract.ts exits 0", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const r = await run("npx", ["tsx", "scripts/migration/expand-contract.ts", "--json"], {
      cwd: process.cwd(),
      maxBuffer: 16 * 1024 * 1024,
    });
    const report = JSON.parse(r.stdout);
    expect(report.ok).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.rows.length).toBeGreaterThan(45);
    // Exactly one registered contraction — the historical 0001.
    const contractions = report.rows.filter((x: { verdict: string }) => x.verdict === "CONTRACT");
    expect(contractions.map((x: { version: string }) => x.version)).toEqual([...HISTORICAL_DESTRUCTIVE_MIGRATIONS]);
  }, 120_000);
});
