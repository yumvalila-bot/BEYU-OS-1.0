/**
 * Deployment-platform import safety (production deploy remediation).
 *
 * Vercel — and any platform that builds without runtime secrets — imports
 * route modules while collecting page data. When `src/db` required
 * DATABASE_URL at module load, `next build` failed with
 * "Failed to collect page data ... DATABASE_URL is required" in every
 * environment where the variable is only configured at runtime, which is
 * exactly how the production platform builds. That made EVERY production
 * deployment fail regardless of application correctness.
 *
 * This test executes the import in a clean subprocess WITHOUT DATABASE_URL
 * and asserts both invariants:
 *   1. BUILD SAFETY  — `src/db` imports cleanly without DATABASE_URL
 *      (module evaluation performs no connection and throws nothing), and
 *   2. RUNTIME LOUDNESS — the first real database use still fails with the
 *      canonical "DATABASE_URL is required" error, so a misconfigured
 *      runtime is never silently degraded.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const tsxCli = join(dirname(require.resolve("tsx/package.json")), "dist", "cli.mjs");
const repoRoot = resolve(import.meta.dirname, "..", "..");

const probeScript = `
  const mod = await import(${JSON.stringify(join(repoRoot, "src", "db", "index.ts"))});
  if (typeof mod.db !== "object" || mod.db === null) throw new Error("db export missing");
  if (typeof mod.pool !== "object" || mod.pool === null) throw new Error("pool export missing");
  let queryError = "";
  try {
    await mod.pool.query("select 1");
  } catch (error) {
    queryError = String((error as Error)?.message ?? error);
  }
  if (!/DATABASE_URL is required/.test(queryError)) {
    throw new Error("expected canonical DATABASE_URL error, got: " + queryError);
  }
  console.log("IMPORT_SAFE_RUNTIME_LOUD");
`;

const scratch = mkdtempSync(join(tmpdir(), "beyu-import-safety-"));
const probeFile = join(scratch, "probe.mts");
writeFileSync(probeFile, probeScript);

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("deployment import safety (build without runtime secrets)", () => {
  it("src/db imports without DATABASE_URL and the first query fails loudly", () => {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.DATABASE_URL;
    delete env.BEYU_ADMIN_DATABASE_URL;
    delete env.BEYU_TEST_DATABASE_URL;
    const stdout = execFileSync(process.execPath, [tsxCli, probeFile], {
      cwd: repoRoot,
      env,
      encoding: "utf8",
      timeout: 120_000,
    });
    expect(stdout).toContain("IMPORT_SAFE_RUNTIME_LOUD");
  });
});
