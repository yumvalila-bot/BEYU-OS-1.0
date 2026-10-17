/**
 * D2 — production database changes are never automatic, and production secrets
 * exist only inside the gated GitHub `Production` environment.
 *
 * Text-based, dependency-free (matches db-release-guard.test.ts): the repo ships no
 * YAML parser as a dependency. Each assertion targets one job block, extracted by its
 * two-space job key. Adding a job or changing its trigger must update these tests on
 * purpose, not by accident.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOW_DIR = resolve(import.meta.dirname, "..", "..", ".github", "workflows");
const DB_RELEASE = "db-release.yml";
const read = (name: string): string => readFileSync(resolve(WORKFLOW_DIR, name), "utf8");

/** Map of job name → its text, taken from the `jobs:` section (two-space keys). */
function jobsOf(source: string): Map<string, string> {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l === "jobs:");
  if (start < 0) throw new Error("workflow has no jobs: section");
  const out = new Map<string, string>();
  let current: string | null = null;
  let buffer: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const key = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (key) {
      if (current !== null) out.set(current, buffer.join("\n"));
      current = key[1];
      buffer = [];
      continue;
    }
    if (current !== null) buffer.push(line);
  }
  if (current !== null) out.set(current, buffer.join("\n"));
  return out;
}

/** The `if:` expression of a job, folded to one line. Empty string if absent. */
function ifOf(block: string): string {
  const m = /^ {4}if: >-\n((?: {6}.*\n?)+)/m.exec(block) ?? /^ {4}if: (.+)$/m.exec(block);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

const usesProductionSecret = (block: string): boolean => /secrets\.BEYU_(ADMIN_DATABASE_URL|RUNTIME_DB_PASSWORD)/.test(block);
const isEnvironmentScoped = (block: string): boolean => /^ {4}environment: Production\s*$/m.test(block);

describe("D2 · production secrets are environment-scoped, never repository-wide", () => {
  for (const file of readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith(".yml"))) {
    it(`${file}: every job that reads a production secret is bound to the Production environment`, () => {
      const offenders = [...jobsOf(read(file))]
        .filter(([, block]) => usesProductionSecret(block) && !isEnvironmentScoped(block))
        .map(([name]) => name);
      expect(offenders).toEqual([]);
    });
  }

  it("no workflow exposes a secret through a top-level env: block (repository-wide exposure)", () => {
    for (const file of readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith(".yml"))) {
      const lines = read(file).split("\n");
      const start = lines.findIndex((l) => l === "env:");
      if (start < 0) continue;
      const block: string[] = [];
      for (const line of lines.slice(start + 1)) {
        if (line.trim() !== "" && !/^ /.test(line)) break; // next top-level key
        block.push(line);
      }
      const code = block.filter((l) => !l.trim().startsWith("#")).join("\n");
      expect(code, file).not.toMatch(/secrets\./);
    }
  });

  it("CI, TLS evidence and tracing workflows read no production secret", () => {
    for (const file of ["ci.yml", "tls-chain-capture.yml", "tls-trust-evidence.yml"]) {
      expect(read(file), file).not.toMatch(/secrets\.[A-Z_]+/);
    }
  });
});

describe("D2 · a push to main never runs a production migration", () => {
  const source = read(DB_RELEASE);
  const jobs = jobsOf(source);

  it("the job set is exactly the approved one", () => {
    expect([...jobs.keys()].sort()).toEqual(
      ["deploy", "drift-report", "live-preflight", "pvg", "preflight-repo", "release-record", "runtime-verify"].sort(),
    );
  });

  it("only the deploy job applies migrations to the production database", () => {
    const applying = [...jobs].filter(([, b]) => b.includes("npx tsx scripts/migrate.ts")).map(([n]) => n);
    // preflight-repo runs the same command against the ephemeral scratch database only.
    expect(applying.sort()).toEqual(["deploy", "preflight-repo"]);
    expect(jobs.get("preflight-repo")!).toContain("BEYU_ADMIN_DATABASE_URL: ${{ env.SCRATCH_ADMIN_URL }}");
    expect(usesProductionSecret(jobs.get("preflight-repo")!)).toBe(false);
  });

  it("deploy is dispatch-only, main-only, deploy-mode-only, and never a push", () => {
    const cond = ifOf(jobs.get("deploy")!);
    expect(cond).toContain("github.event_name == 'workflow_dispatch'");
    expect(cond).toContain("github.ref == 'refs/heads/main'");
    expect(cond).toContain("inputs.mode == 'deploy'");
    expect(cond).not.toMatch(/event_name == 'push'/);
    expect(cond).not.toMatch(/schedule/);
  });

  it("deploy sits behind the Production environment gate and the plan job", () => {
    const block = jobs.get("deploy")!;
    expect(isEnvironmentScoped(block)).toBe(true);
    expect(block).toMatch(/needs: \[live-preflight, preflight-repo\]/);
  });

  it("every job that depends on deploy repeats the same dispatch-only conditions", () => {
    for (const name of ["release-record", "runtime-verify", "pvg"]) {
      const cond = ifOf(jobs.get(name)!);
      expect(cond, name).toContain("github.event_name == 'workflow_dispatch'");
      expect(cond, name).toContain("github.ref == 'refs/heads/main'");
      expect(cond, name).not.toMatch(/event_name == 'push'/);
    }
  });

  it("the pre-plan job is dispatch-only and main-only as well", () => {
    const cond = ifOf(jobs.get("live-preflight")!);
    expect(cond).toContain("github.event_name == 'workflow_dispatch'");
    expect(cond).toContain("github.ref == 'refs/heads/main'");
    expect(cond).not.toMatch(/event_name == 'push'/);
    expect(isEnvironmentScoped(jobs.get("live-preflight")!)).toBe(true);
  });

  it("the drift report is scheduled or manually dispatched, never a push, and is environment-gated", () => {
    const block = jobs.get("drift-report")!;
    expect(ifOf(block)).not.toMatch(/event_name == 'push'/);
    expect(isEnvironmentScoped(block)).toBe(true);
  });

  it("preflight-repo (scratch database) is the only job that runs on push, and it holds no secret", () => {
    const block = jobs.get("preflight-repo")!;
    expect(usesProductionSecret(block)).toBe(false);
    expect(block).not.toMatch(/secrets\./);
    expect(block).not.toMatch(/environment:/);
  });

  it("the pvg job keeps its documented dependency chain", () => {
    expect(source).toMatch(/pvg:[\s\S]*needs: \[deploy, runtime-verify, preflight-repo\]/);
  });

  it("the workflow exposes the human attestation inputs", () => {
    expect(source).toMatch(/^ {6}change_reference:/m);
    expect(source).toMatch(/^ {6}backup_reference:/m);
  });
});

describe("D2 · deploy refuses to start without change and backup references", () => {
  const block = jobsOf(read(DB_RELEASE)).get("deploy")!;

  it("checks both references before the production secret guard and before any migration", () => {
    const attest = block.indexOf("Require a change reference and a backup / recovery reference");
    const guard = block.indexOf("Fail closed if production secrets are not configured");
    const migrate = block.indexOf("npx tsx scripts/migrate.ts");
    expect(attest).toBeGreaterThan(-1);
    expect(attest).toBeLessThan(guard);
    expect(guard).toBeLessThan(migrate);
  });

  it("passes inputs through env, never by interpolating them into the shell script", () => {
    const attest = block.slice(block.indexOf("Require a change reference"));
    const script = attest.slice(attest.indexOf("run: |"), attest.indexOf("Fail closed if production secrets"));
    expect(script).not.toMatch(/\$\{\{/);
    expect(attest.slice(0, attest.indexOf("run: |"))).toContain("CHANGE_REFERENCE: ${{ inputs.change_reference }}");
    expect(attest.slice(0, attest.indexOf("run: |"))).toContain("BACKUP_REFERENCE: ${{ inputs.backup_reference }}");
  });

  it("the attestation step exits non-zero when either reference is empty", () => {
    expect(block).toContain('if [ -z "$CHANGE_REFERENCE" ]; then');
    expect(block).toContain('if [ -z "$BACKUP_REFERENCE" ]; then');
    expect(block).toMatch(/if \[ "\$missing" = "1" \]; then\s*\n\s*exit 1/);
  });
});

describe("D2 · the runtime DSN diagnostic is environment-gated and main-only", () => {
  const source = read("runtime-dsn-diagnostic.yml");
  const block = jobsOf(source).get("diagnose")!;

  it("is bound to the Production environment and refuses non-main refs", () => {
    expect(isEnvironmentScoped(block)).toBe(true);
    expect(ifOf(block)).toBe("github.ref == 'refs/heads/main'");
  });

  it("remains dispatch-only", () => {
    expect(source).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(source).not.toMatch(/^ {2}(push|pull_request|schedule):/m);
  });
});
