/**
 * RLS coverage matrix: every health.* table has RLS enabled and at least one
 * policy; future migrations that forget RLS cause this spec to fail. Also
 * verifies fail-closed default (zero rows without tenant GUC) and writes a
 * machine-readable rls-matrix.json artifact.
 */
import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import { buildTestBed } from "../../common/testing/test-bed";

describe("RLS coverage matrix — every health.* table has RLS + fail-closed isolation", () => {
  let bed: any;
  beforeAll(async () => {
    bed = await buildTestBed();
  });

  it("every health.* table in migrations has RLS enabled and at least one policy", async () => {
    await bed.run(async () => {
      const migDir = path.resolve(
        __dirname,
        "..",
        "..",
        "..",
        "database",
        "migrations",
      );
      const files = fs
        .readdirSync(migDir)
        .filter((f) => f.endsWith(".up.sql"))
        .sort();
      const tableSet = new Set<string>();
      for (const f of files) {
        const sql = fs.readFileSync(path.join(migDir, f), "utf8");
        const re =
          /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?health\.([a-z0-9_]+)/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(sql))) tableSet.add(m[1]);
      }
      expect(tableSet.size).toBeGreaterThan(0);

      const rows: any[] = await bed.conn.query(
        `SELECT c.relname AS table_name,
                c.relrowsecurity AS rls_enabled,
                (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'health' AND c.relkind = 'r'`,
      );
      const byName = new Map<string, any>();
      for (const r of rows) byName.set(r.table_name, r);
      const uncovered: string[] = [];
      const missingPolicy: string[] = [];
      for (const t of tableSet) {
        const r = byName.get(t);
        if (!r) {
          uncovered.push(t);
          continue;
        }
        if (!r.rls_enabled) uncovered.push(t);
        if (Number(r.policy_count) < 1) missingPolicy.push(t);
      }
      if (uncovered.length)
        throw new Error("health.* tables missing RLS: " + uncovered.join(","));
      if (missingPolicy.length)
        throw new Error(
          "health.* tables without a policy: " + missingPolicy.join(","),
        );
    });
  });

  it("without app.tenant_id GUC, selecting representative tenant-scoped tables returns 0 rows (fail-closed default)", async () => {
    await bed.conn.exec(
      "RESET app.tenant_id; RESET app.entity_code; RESET app.country_code;",
    );
    const probes = ["patients", "encounters", "audit_events"];
    for (const t of probes) {
      try {
        const rows = await bed.conn.query(
          `SELECT count(*)::int AS n FROM health.${t}`,
        );
        expect(rows[0].n).toBe(0);
      } catch (e: any) {
        if (/does not exist/.test(e.message)) continue;
        throw e;
      }
    }
  });

  it("emits machine-readable RLS coverage report", async () => {
    await bed.run(async () => {
      const rows: any[] = await bed.conn.query(
        `SELECT c.relname AS table_name,
                c.relrowsecurity AS rls_enabled,
                (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'health' AND c.relkind = 'r'
          ORDER BY c.relname`,
      );
      const report = rows.map((r: any) => ({
        table: r.table_name,
        rls: r.rls_enabled,
        policies: Number(r.policy_count),
      }));
      expect(report.length).toBeGreaterThan(60);
      const uncovered = report.filter((r: any) => !r.rls || r.policies === 0);
      expect(uncovered).toEqual([]);
      try {
        fs.mkdirSync(path.resolve(__dirname, "..", "..", "..", "coverage"), {
          recursive: true,
        });
        fs.writeFileSync(
          path.resolve(
            __dirname,
            "..",
            "..",
            "..",
            "coverage",
            "rls-matrix.json",
          ),
          JSON.stringify(
            { generated: new Date().toISOString(), tables: report },
            null,
            2,
          ),
        );
      } catch {}
    });
  });
});
