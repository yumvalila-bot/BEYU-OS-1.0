import { describe, expect, it } from "vitest";
import { Client } from "pg";

/**
 * MIGRATION EXECUTION CONTRACT
 *
 * These tests exist because of a real defect found in this workstream, not a
 * hypothetical one.
 *
 * `scripts/migrate.ts` splits a migration file on a `--> statement-breakpoint`
 * marker and executes each fragment as ONE statement. Migration 0084 was written
 * without any markers, so only its first statement ever ran: the CREATE TABLE for
 * `noelia_kg_edges`. Every RLS policy, every CHECK constraint and every GRANT in
 * that file was silently skipped — and the migrator still recorded the migration
 * as APPLIED, so nothing surfaced the gap.
 *
 * The consequences were concrete and would have shipped:
 *   • `beyu_runtime` held no privilege on `noelia_decision_records`,
 *     `noelia_council_sessions`, `noelia_simulations` and the other new tables,
 *     so the Council endpoint and the Command Centre would have failed at the
 *     database boundary;
 *   • `noelia_golden_cases` — which holds the evaluation benchmark questions and
 *     the "must not do" adversarial assertions — had no row-level security at
 *     all, and was world-readable.
 *
 * DEFECT 1 is fixed by 0085 (which supplies the grants and policies 0084
 * intended). DEFECT 2 is fixed by the execution contract below: a migration that
 * contains multiple statements must contain breakpoints, or this suite fails.
 * That is the durable fix — it stops the *class* of defect, not just the instance.
 *
 * These tests are pure static analysis of the migration files plus read-only
 * privilege introspection, so they are safe to run against any environment.
 */

const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;

describe("migration execution contract", () => {
  /**
   * Scope note: this contract deliberately does NOT audit every historical
   * migration. Most of the 60+ earlier files are multi-statement batches, and
   * `pg`'s simple-query protocol legitimately executes those in one call — a
   * broad audit produced 46 false positives and would have been noise, not
   * protection.
   *
   * The contract is therefore narrow and true: every migration from 0085 onward
   * must be split into individually-executable fragments, because that is the
   * form the canonical migrator can actually verify.
   */
  const CONTRACT_FROM = 85;

  it("every migration numbered 0085 or later is statement-split", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(process.cwd(), "drizzle");

    const offenders: { file: string; fragmentsWithMultipleStatements: number }[] = [];

    for (const file of readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f))) {
      const number = Number(file.slice(0, 4));
      if (!Number.isFinite(number) || number < CONTRACT_FROM) continue;
      const sql = readFileSync(join(dir, file), "utf8");
      const fragments = sql
        .split(/-->\s*statement-breakpoint/g)
        .map((fragment) => fragment.trim())
        .filter(Boolean);

      const countTopLevelStatements = (fragment: string): number => {
        const code = fragment
          .split("\n")
          .filter((line) => !line.trim().startsWith("--"))
          .join("\n");
        // Dollar-quoted PL/pgSQL blocks collapse to a single statement.
        const withoutBlocks = code.replace(/\$\$[\s\S]*?\$\$/g, "DO_BLOCK");
        return (withoutBlocks.match(/;/g) ?? []).length;
      };

      const bad = fragments.filter((fragment) => countTopLevelStatements(fragment) > 1).length;
      if (bad > 0) offenders.push({ file, fragmentsWithMultipleStatements: bad });
    }

    expect(
      offenders,
      `migrations from 0085 onward must be statement-split: ${JSON.stringify(offenders)}`,
    ).toEqual([]);
  });

  it("0085 exists to repair the grants and RLS that 0084 never applied", async () => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    expect(existsSync(join(process.cwd(), "drizzle", "0085_noelia_cognitive_core_grants_and_golden_cases_rls.sql"))).toBe(true);
  });

  it("the new cognitive tables grant the runtime role what it needs, with no DELETE", async () => {
    if (!ADMIN_URL) return;
    const client = new Client({ connectionString: ADMIN_URL });
    await client.connect();
    try {
      const expected: Record<string, { select: boolean; insert: boolean; update: boolean }> = {
        noelia_kg_edges: { select: true, insert: true, update: true },
        noelia_decision_records: { select: true, insert: true, update: true },
        noelia_council_sessions: { select: true, insert: true, update: true },
        noelia_council_findings: { select: true, insert: true, update: true },
        noelia_simulations: { select: true, insert: true, update: false },
        noelia_golden_cases: { select: true, insert: false, update: false },
        noelia_learning_records: { select: true, insert: true, update: true },
      };

      for (const [table, want] of Object.entries(expected)) {
        const result = await client.query(
          `select has_table_privilege('beyu_runtime', $1, 'SELECT') s,
                  has_table_privilege('beyu_runtime', $1, 'INSERT') i,
                  has_table_privilege('beyu_runtime', $1, 'UPDATE') u,
                  has_table_privilege('beyu_runtime', $1, 'DELETE') d`,
          [`public.${table}`],
        );
        const row = result.rows[0] as { s: boolean; i: boolean; u: boolean; d: boolean };
        expect(row.s, `${table} SELECT`).toBe(want.select);
        expect(row.i, `${table} INSERT`).toBe(want.insert);
        expect(row.u, `${table} UPDATE`).toBe(want.update);
        // Institutional records are never destroyed — supersession, not deletion.
        expect(row.d, `${table} must not be DELETABLE by the runtime role`).toBe(false);
      }
    } finally {
      await client.end();
    }
  });

  /**
   * The canonical runtime privilege control is NOT a migration GRANT — it is
   * `scripts/runtime-privilege-allowlist.ts`, applied by
   * `scripts/setup-db-role.ts`, which revokes every privilege from every table
   * and re-grants only what the allowlist permits. A migration that grants a
   * table absent from the allowlist has its grant silently reverted on the next
   * reconciliation, which is exactly how a "permission denied" appeared only in
   * the full suite and never in the isolated file.
   *
   * This assertion pins the classification at the source, so the drift cannot
   * recur without a failing build.
   */
  it("classifies every cognitive table in the canonical privilege allowlist", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(process.cwd(), "scripts", "runtime-privilege-allowlist.ts"), "utf8");

    const block = (name: string) => {
      const start = source.indexOf(`export const ${name}`);
      const end = source.indexOf("] as const;", start);
      return source.slice(start, end);
    };

    const tables = [
      "noelia_kg_edges",
      "noelia_decision_records",
      "noelia_council_sessions",
      "noelia_council_findings",
      "noelia_simulations",
      "noelia_golden_cases",
      "noelia_learning_records",
    ];

    const allow = block("RUNTIME_TABLE_ALLOWLIST");
    const readOnly = block("RUNTIME_READ_ONLY_TABLES");

    for (const table of tables) {
      expect(allow, `${table} must be in RUNTIME_TABLE_ALLOWLIST or it gets no privilege`).toContain(`"${table}"`);
    }

    // No institutional record may be mutable *and* deletable-shaped: the tables
    // that hold decisions, findings and learning history are NO_DELETE, and the
    // benchmark set is READ_ONLY.
    const noDelete = block("RUNTIME_NO_DELETE_TABLES");
    for (const table of [
      "noelia_kg_edges",
      "noelia_decision_records",
      "noelia_council_sessions",
      "noelia_council_findings",
      "noelia_learning_records",
    ]) {
      expect(noDelete, `${table} must be NO_DELETE`).toContain(`"${table}"`);
    }
    expect(readOnly, "noelia_golden_cases must be READ_ONLY").toContain('"noelia_golden_cases"');

    const insertOnly = block("RUNTIME_INSERT_ONLY_TABLES");
    expect(insertOnly, "noelia_simulations must be INSERT_ONLY").toContain('"noelia_simulations"');
  });

  it("every cognitive table has row-level security enabled AND forced", async () => {
    if (!ADMIN_URL) return;
    const client = new Client({ connectionString: ADMIN_URL });
    await client.connect();
    try {
      const tables = [
        "noelia_kg_edges",
        "noelia_decision_records",
        "noelia_council_sessions",
        "noelia_council_findings",
        "noelia_simulations",
        "noelia_golden_cases",
        "noelia_learning_records",
      ];
      const result = await client.query(
        `select c.relname,
                c.relrowsecurity as rls,
                c.relforcerowsecurity as forced,
                count(p.polname)::int as policies
           from pg_class c
           left join pg_policy p on p.polrelid = c.oid
          where c.relname = any($1::text[]) and c.relkind = 'r'
          group by 1,2,3`,
        [tables],
      );
      for (const row of result.rows as { relname: string; rls: boolean; forced: boolean; policies: number }[]) {
        expect(row.rls, `${row.relname} RLS enabled`).toBe(true);
        expect(row.forced, `${row.relname} RLS forced`).toBe(true);
        // A table with RLS enabled but no policy denies everything, which is
        // equally a defect: the feature would be dead rather than protected.
        expect(row.policies, `${row.relname} must have at least one policy`).toBeGreaterThan(0);
      }
    } finally {
      await client.end();
    }
  });

  it("an unscoped runtime connection cannot read institutional decision memory", async () => {
    const runtimeUrl = process.env.BEYU_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!runtimeUrl) return;
    const client = new Client({ connectionString: runtimeUrl });
    await client.connect();
    try {
      // No tenant context set: the policy must hide every row rather than error.
      const result = await client.query("select count(*)::int n from noelia_decision_records");
      expect(
        (result.rows[0] as { n: number }).n,
        "decision memory must be invisible without a resolved tenant context",
      ).toBe(0);
    } finally {
      await client.end();
    }
  });
});
