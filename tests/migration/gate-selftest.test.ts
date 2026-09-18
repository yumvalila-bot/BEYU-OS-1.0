/**
 * P2 — drift-gate acceptance proof.
 *
 * THE CRITICAL ACCEPTANCE CONDITION
 * ─────────────────────────────────
 * The drift gate must demonstrably distinguish:
 *
 *     VALID             → PASS
 *     DRIFT             → FAIL
 *     AMBIGUOUS / ERROR → FAIL
 *
 * A gate that has only ever been seen to pass proves nothing, and the previous
 * one was green for the entire life of the repository while comparing nothing.
 * So this test does not assert "the gate is green on main". It runs
 * `scripts/migration/gate-selftest.ts`, which exercises eight cases — including
 * deliberately broken ones — against a DISPOSABLE scratch PostgreSQL database
 * that the harness creates and drops itself.
 *
 * Case 7 is the whole point: `drizzle-kit generate` prints
 * `Error: … which is a collision.` and EXITS 0. The harness reproduces that,
 * demonstrates the old file-count gate would have PASSED, and asserts the new
 * rule rejects it.
 *
 * Requires a real PostgreSQL. Skipped when none is configured.
 */
import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { stripAnsi } from "../../src/lib/migration/drift";

const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
const dbConfigured = Boolean(ADMIN_URL);
const run = promisify(execFile);

describe.skipIf(!dbConfigured)("P2 — the drift gate separates VALID from DRIFT from AMBIGUOUS/ERROR", () => {
  it(
    "all eight acceptance cases behave as expected against disposable PostgreSQL",
    async () => {
      let stdout = "";
      let status = 0;
      try {
        const r = await run("npx", ["tsx", "scripts/migration/gate-selftest.ts", "--json"], {
          cwd: process.cwd(),
          env: process.env,
          maxBuffer: 64 * 1024 * 1024,
        });
        stdout = r.stdout;
      } catch (e) {
        const err = e as { code?: number; stdout?: string };
        status = typeof err.code === "number" ? err.code : 1;
        stdout = err.stdout ?? "";
      }

      const jsonStart = stripAnsi(stdout).indexOf("{");
      expect(jsonStart, `self-test emitted no JSON report:\n${stdout.slice(-2000)}`).toBeGreaterThan(-1);
      const report = JSON.parse(stripAnsi(stdout).slice(jsonStart));

      const byId = Object.fromEntries(report.results.map((r: { id: string }) => [r.id, r]));
      const summarise = () =>
        report.results
          .map((r: { id: string; expected: string; actual: string; ok: boolean; detail: string }) =>
            `case ${r.id}: expected ${r.expected}, got ${r.actual} ${r.ok ? "ok" : "MISBEHAVED"} — ${r.detail}`,
          )
          .join("\n");

      // Every case must have run, and every case must have behaved.
      expect(report.results.length, summarise()).toBe(8);
      expect(report.ok, summarise()).toBe(true);
      expect(status, summarise()).toBe(0);

      // VALID states pass.
      expect(byId["1"].actual).toBe("PASS"); // clean apply
      expect(byId["2"].actual).toBe("PASS"); // idempotent re-run
      expect(byId["8"].actual).toBe("PASS"); // incomplete metadata, valid production truth

      // DRIFT and ERROR states fail.
      expect(byId["3"].actual).toBe("FAIL"); // missing migration
      expect(byId["4"].actual).toBe("FAIL"); // checksum mismatch
      expect(byId["5"].actual).toBe("FAIL"); // extra migration
      expect(byId["6"].actual).toBe("FAIL"); // schema drift
      expect(byId["7"].actual).toBe("FAIL"); // metadata collision reported with exit 0

      // Case 7 must show that the OLD gate would have passed on this error. That
      // is the specific defect P2 exists to eliminate.
      expect(byId["7"].detail).toMatch(/OLD gate would have passed: true/);
      expect(byId["7"].detail).toMatch(/reported collision: true/);

      // Case 8 must pass for the documented reason, not by accident: the gate
      // treats design-time metadata as non-authoritative.
      expect(byId["8"].detail).toMatch(/non-authoritative/);
    },
    900_000,
  );
});
