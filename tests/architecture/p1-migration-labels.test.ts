/**
 * P1 reality correction — migration-range labels vs the canonical source.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Phase 0 found CI step names and a production-certification label that quoted
 * a hardcoded migration range ("0000-0032", "001-020", "all 19"). The ACTIVE
 * source had long since moved past those ranges — the runner applies every file
 * under `drizzle/*.sql`, but a reader (or a future audit) could not tell that
 * from the label, and the certification floor silently under-attested the real
 * schema. Relabelling these by hand once is a fix; guarding against the same
 * drift recurring is the point of this test.
 *
 * It enforces two properties with the canonical source as the oracle:
 *   1. every migration-range label in the pipeline agrees with the ACTUAL file
 *      range in the repository (derived, never hardcoded here);
 *   2. the count-verification steps COMPUTE their expected count from the
 *      canonical migration folder at run time (`ls ... | wc -l`) rather than
 *      pinning a number that rots.
 *
 * It makes no database connection: this is a static source-contract gate, so it
 * runs in every environment including one without PostgreSQL.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/**
 * Derive the canonical migration range label (e.g. "0000-0044") from the
 * migration folder itself. Only numbered migration files are considered; the
 * number is the leading zero-padded run before the first `_` or `.`.
 */
function migrationRange(folder: string, suffix: string): string {
  const files = readdirSync(folder).filter((f) => f.endsWith(suffix));
  const tokens = files
    .map((f) => f.replace(new RegExp(`${suffix.replace(".", "\\.")}$`), "").split("_")[0])
    .filter((s) => /^[0-9]+$/.test(s));
  const sorted = tokens
    .map((s) => ({ s, n: parseInt(s, 10) }))
    .sort((a, b) => a.n - b.n);
  expect(sorted.length, `${folder} must contain numbered ${suffix} files`).toBeGreaterThan(0);
  // Padding comes from the stored token (e.g. "0044"), not the parsed integer.
  const pad = sorted[0].s.length;
  const p = (n: number) => String(n).padStart(pad, "0");
  return `${p(sorted[0].n)}-${p(sorted[sorted.length - 1].n)}`;
}

const ROOT_MIG = migrationRange("drizzle", ".sql");
const HEALTH_MIG = migrationRange("sectors/health/backend/database/migrations", ".up.sql");

describe("P1 — migration-range labels agree with the canonical migration source", () => {
  const ci = read(".github/workflows/ci.yml");
  const certify = read("scripts/certify-production.mts");
  const docs = read("docs/ci/README.md");

  it("root CI step names derive from the drizzle/ folder range", () => {
    expect(ci).toContain(`Apply canonical root migrations ${ROOT_MIG}`);
    expect(ci).toContain(`Verify migrations ${ROOT_MIG} are all recorded`);
  });

  it("Health CI step names derive from the Health migrations folder range", () => {
    expect(ci).toContain(`Apply Health migrations ${HEALTH_MIG} against real PostgreSQL`);
    expect(ci).toContain(`Verify Health migrations ${HEALTH_MIG} are all recorded`);
  });

  it("root verify step computes its expected count from the canonical source", () => {
    expect(ci).toContain("expected=$(ls drizzle/*.sql | wc -l | tr -d ' ')");
  });

  it("Health verify step computes its expected count from the canonical source", () => {
    expect(ci).toContain("expected=$(ls database/migrations/*.up.sql | wc -l | tr -d ' ')");
  });

  it("no CI step name carries the historical stale migration range", () => {
    for (const line of ci.split(/\n/)) {
      if (line.trim().startsWith("- name:")) {
        expect(line).not.toMatch(/0000-0032|001-020|001-018|0000-0018/);
      }
    }
  });

  it("production certification attests a governed floor, not a rotting literal", () => {
    // The certification runner must not re-introduce the historical `all 19`
    // display literal; the floor is a named constant with its role documented.
    expect(certify).not.toContain('"all 19 BEYU migrations present in beyu_migrations"');
    expect(certify).toContain("MIN_BEYU_MIGRATIONS");
  });

  it("CI documentation describes the canonical runner, not a frozen range", () => {
    // The doc used to quote "0000–0018" (en-dash) and a fixed Health range for
    // a runner that applies the whole folder. It must describe the canonical
    // source instead.
    expect(docs).not.toContain("migrations 0000–0018");
    expect(docs).not.toContain("migrations 001_identity_foundation → 018_global_reference_fail_closed");
  });
});
