/**
 * db-release.yml — production secret guard regression.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The `deploy` job ("Production database deploy + verify") is the single gate
 * that applies migrations, provisions the NOSUPERUSER `beyu_runtime` role, and
 * verifies schema/RLS/role state against production Supabase. Everything
 * downstream of it (three-way release record, production /api/health runtime
 * verification, drift report) is `needs: [deploy]`.
 *
 * The step that guards its secrets was written as a trailing AND-OR list:
 *
 *     [ "$missing" = "1" ] && exit 1
 *
 * GitHub Actions executes `run:` steps with `bash -e {0}`. When both secrets
 * ARE configured, the test is false, the AND-OR short-circuits, and the list's
 * own exit status is 1. Because it is the final command of the script and is
 * not in a condition context, `set -e` terminates the step with status 1.
 *
 * The observable failure was therefore maximally misleading: the production
 * deploy failed at the *secret guard* with NO `EXTERNAL_BLOCKED` annotation —
 * exactly the signature of a missing secret, while both secrets were in fact
 * present. It blocked the whole governed release chain and invited the wrong
 * remediation (chasing a secret that was never missing).
 *
 * These tests execute the ACTUAL step body parsed out of the workflow file —
 * not a copy — under GitHub's exact shell semantics, so a re-introduction of
 * the defect class fails the build.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const WORKFLOW = ".github/workflows/db-release.yml";
const GUARD_STEP = "Fail closed if production secrets are not configured";

/**
 * Extract the `run:` block scalar for a named step.
 *
 * Deliberately dependency-free: the repo ships no YAML parser as a runtime
 * dependency, and pulling one in just to test a shell guard would add supply
 * chain surface to a security-critical workflow. Block scalars are unambiguous
 * here — content is indented strictly deeper than the `run:` key.
 */
function runBlockFor(stepName: string): string {
  const lines = readFileSync(WORKFLOW, "utf8").split("\n");
  const nameIdx = lines.findIndex((l) => l.trim() === `- name: ${stepName}`);
  expect(nameIdx, `step "${stepName}" not found in ${WORKFLOW}`).toBeGreaterThan(-1);

  const keyIndent = lines[nameIdx].match(/^\s*/)![0].length;
  let runIdx = -1;
  for (let i = nameIdx + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "" || t.startsWith("#")) continue;
    if (t.startsWith("run:")) {
      runIdx = i;
      break;
    }
    // A new key at the step's own indentation (or shallower) ends the step.
    const ind = lines[i].match(/^\s*/)![0].length;
    if (ind <= keyIndent) break;
  }
  expect(runIdx, `no run: block for step "${stepName}"`).toBeGreaterThan(-1);
  expect(lines[runIdx].trim(), `step "${stepName}" must use a block scalar`).toMatch(/^run:\s*\|/);

  const bodyIndent = lines[runIdx].match(/^\s*/)![0].length;
  const body: string[] = [];
  for (let i = runIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      body.push("");
      continue;
    }
    const ind = line.match(/^\s*/)![0].length;
    if (ind <= bodyIndent) break;
    body.push(line.slice(bodyIndent + 2));
  }
  return body.join("\n");
}

/**
 * Run a script exactly the way GitHub Actions does: `bash -e {0}`.
 *
 * The child environment starts from process.env (matching the precedent in
 * build-without-database-url.test.ts and satisfying the repo's ProcessEnv
 * augmentation), then the two secrets under test are DELETED before the
 * caller-supplied values are applied. Without that explicit delete, a
 * developer or CI runner that happens to export BEYU_ADMIN_DATABASE_URL would
 * silently turn the "missing secret" cases into false passes.
 */
function runAsActions(script: string, env: Record<string, string>) {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  delete childEnv.BEYU_ADMIN_DATABASE_URL;
  delete childEnv.BEYU_RUNTIME_DB_PASSWORD;
  Object.assign(childEnv, env);
  try {
    const stdout = execFileSync("bash", ["-e", "-c", script], {
      encoding: "utf8",
      env: childEnv,
    });
    return { code: 0, stdout };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? -1, stdout: err.stdout ?? "" };
  }
}

const SET = "postgresql://role@host:5432/postgres?sslmode=require";

describe("db-release deploy secret guard", () => {
  const script = runBlockFor(GUARD_STEP);

  it("PASSES when both production secrets are configured (the regression)", () => {
    const r = runAsActions(script, {
      BEYU_ADMIN_DATABASE_URL: SET,
      BEYU_RUNTIME_DB_PASSWORD: "runtime-password",
    });
    expect(
      r.code,
      "guard failed with both secrets present — this is the `set -e` " +
        "trailing AND-OR defect that blocked the production deploy",
    ).toBe(0);
  });

  it("fails closed and names the secret when BEYU_ADMIN_DATABASE_URL is missing", () => {
    const r = runAsActions(script, { BEYU_RUNTIME_DB_PASSWORD: "runtime-password" });
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("EXTERNAL_BLOCKED");
    expect(r.stdout).toContain("BEYU_ADMIN_DATABASE_URL");
  });

  it("fails closed and names the secret when BEYU_RUNTIME_DB_PASSWORD is missing", () => {
    const r = runAsActions(script, { BEYU_ADMIN_DATABASE_URL: SET });
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("EXTERNAL_BLOCKED");
    expect(r.stdout).toContain("BEYU_RUNTIME_DB_PASSWORD");
  });

  it("reports BOTH secrets when neither is configured", () => {
    const r = runAsActions(script, {});
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("BEYU_ADMIN_DATABASE_URL");
    expect(r.stdout).toContain("BEYU_RUNTIME_DB_PASSWORD");
  });

  it("never echoes a secret value", () => {
    const r = runAsActions(script, {
      BEYU_ADMIN_DATABASE_URL: SET,
      BEYU_RUNTIME_DB_PASSWORD: "runtime-password",
    });
    expect(r.stdout).not.toContain("runtime-password");
    expect(r.stdout).not.toContain(SET);
    expect(r.stdout).not.toContain("sslmode");
  });

  it("is structurally if/then/fi, not a trailing AND-OR list", () => {
    const body = script.trim();
    const lastLine = body.split("\n").filter((l) => l.trim() !== "")[body.trim().split("\n").filter((l) => l.trim() !== "").length - 1];
    expect(
      /^\s*\[.*\]\s*&&/.test(lastLine ?? ""),
      "final command of a `run:` step must not be a bare AND-OR list under `set -e`",
    ).toBe(false);
  });
});

describe("workflow defect class: trailing AND-OR list as final run: command", () => {
  it("no db-release.yml step ends its run block on `[ ... ] && ...`", () => {
    const src = readFileSync(WORKFLOW, "utf8");
    const stepNames = [...src.matchAll(/^\s*- name: (.+)$/gm)].map((m) => m[1].trim());
    const offenders: string[] = [];

    for (const name of stepNames) {
      // Only steps that actually own a run block.
      const re = new RegExp(`^\\s*- name: ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m");
      if (!re.test(src)) continue;
      let body: string;
      try {
        body = runBlockFor(name);
      } catch {
        continue; // action-only step (uses:), no run block
      }
      const code = body
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l !== "" && !l.startsWith("#"));
      if (code.length === 0) continue;
      const last = code[code.length - 1];
      if (/^\[.*\]\s*&&/.test(last) || /&&\s*\{[^}]*\}\s*$/.test(last)) {
        offenders.push(`${name} → ${last}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
