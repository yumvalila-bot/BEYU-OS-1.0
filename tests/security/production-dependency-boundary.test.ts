import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Production dependency boundary — the supply-chain remediation guard.
 *
 * FINDING (advisories published 2026-10-05; both audit gates red on `main` from
 * that date against manifests this repository had not changed). The CI gate
 * `production-dependency-audit` runs `npm audit --omit=dev --audit-level=critical`
 * across three packages, and its documented policy (docs/ci/README.md and the
 * comment above the job in .github/workflows/ci.yml) is that dev-only advisories
 * in build tooling are triaged deliberately while a critical vulnerability in
 * SHIPPED RUNTIME CODE must redden the pipeline. Two jobs were red:
 *
 *   1. root-beyu-os — `tinypool@1.1.1`, critical (GHSA-5gmw-xhrv-c9v3 /
 *      CVE-2026-104848 and GHSA-85c8-ppgw-ccpr / CVE-2026-104849), reached only
 *      through `vitest@3.2.7`, which root package.json listed under
 *      `dependencies`. tinypool is not imported by any application, script or
 *      build module and does not appear in the deployed server trace
 *      (`.next/next-server.js.nft.json`); it is test-runner code. Declaring it
 *      production scope also made `scripts/supply-chain/sbom.mjs` publish it as a
 *      `required` SBOM component, and made `npm ci --omit=dev` install the test
 *      runner while omitting typescript/tailwindcss — the toolchain the build
 *      actually needs.
 *   2. health-os-backend — `proxy-addr@2.0.7`, critical
 *      (GHSA-jqcg-44mw-7w3h / CVE-2026-90711), a genuine production exposure:
 *      `sectors/health/backend/Dockerfile` builds the runtime image with
 *      `npm ci --omit=dev`, express requires proxy-addr unconditionally, and
 *      `req.ip` — read by the auth, MFA, CSRF and audit-correlation paths — calls
 *      it on every request.
 *
 * REMEDIATION. `vitest` moved to root `devDependencies` at the same declared
 * range (zero resolved-version drift; 101 scope flags corrected) and
 * `proxy-addr` bumped to 2.0.8 inside express's own declared `~2.0.7`. `tsx`
 * stays in `dependencies` on purpose — `db-release.yml`'s `environment:
 * Production` deploy job executes `npx tsx scripts/migrate.ts` against the
 * production database.
 *
 * WHAT THIS GUARD PROTECTS. That neither half regresses silently, and that the
 * gate is never weakened to obtain a green build: a known-critical version may
 * not re-enter either production graph, test tooling may not be re-declared as
 * production scope, and the audit command, its threshold and its three-package
 * matrix must remain exactly as written.
 *
 * NOT CLAIMED. tinypool itself is NOT fixed — it remains installed, and loaded
 * by vitest's `forks` pool, in the development/test graph. Removing it needs the
 * Vitest 4 major upgrade, which is an owner decision. See
 * docs/security/PRODUCTION_DEPENDENCY_AUDIT_REMEDIATION.md.
 */

const repoRoot = resolve(import.meta.dirname, "..", "..");

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), "utf8"));
}

function readText(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

const rootManifest = readJson("package.json") as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

/** Test-runner/build-time tooling that must never be a root production dependency. */
const TEST_ONLY_TOOLING = [
  "vitest",
  "tinypool",
  "vite",
  "jsdom",
  "happy-dom",
  "playwright",
  "@playwright/test",
] as const;

/**
 * Packages with a published CRITICAL advisory, and the first patched version.
 * A production-scoped lockfile entry below the floor is a red pipeline waiting
 * to happen — and, for anything genuinely shipped, a real exposure.
 */
const CRITICAL_FLOORS: Record<string, string> = {
  // GHSA-5gmw-xhrv-c9v3 (<= 2.1.0) and GHSA-85c8-ppgw-ccpr (< 2.1.2):
  // the effective floor for both is 2.1.2.
  tinypool: "2.1.2",
  // GHSA-jqcg-44mw-7w3h (>= 1.1.0, < 2.0.8).
  "proxy-addr": "2.0.8",
};

type LockEntry = { version?: string; dev?: boolean; optional?: boolean };

/** Every non-dev lockfile entry, i.e. what `npm ci --omit=dev` would install. */
function productionEntries(lockfile: string): Array<{ name: string; version: string; path: string }> {
  const lock = readJson(lockfile) as { packages: Record<string, LockEntry> };
  const out: Array<{ name: string; version: string; path: string }> = [];
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path) continue; // the root manifest mirror
    if (entry.dev) continue; // development-only: outside this gate's scope by policy
    const name = path.split("node_modules/").pop() ?? path;
    if (!entry.version) continue; // link/workspace entries
    out.push({ name, version: entry.version, path });
  }
  return out;
}

/** Minimal numeric semver comparison; no dependency, no prerelease parsing needed here. */
function isBelow(version: string, floor: string): boolean {
  const a = version.split(".").map((part) => Number.parseInt(part.replace(/\D.*$/, ""), 10) || 0);
  const b = floor.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] ?? 0) < (b[i] ?? 0)) return true;
    if ((a[i] ?? 0) > (b[i] ?? 0)) return false;
  }
  return false;
}

const ROOT_LOCKFILE = "package-lock.json";
const HEALTH_BACKEND_LOCKFILE = "sectors/health/backend/package-lock.json";

describe("production dependency boundary — root manifest", () => {
  it("declares no test-only tooling as a production dependency", () => {
    const production = Object.keys(rootManifest.dependencies);
    for (const tool of TEST_ONLY_TOOLING) {
      expect(production, `${tool} must not be a root production dependency`).not.toContain(tool);
    }
    expect(production.some((name) => name.startsWith("@vitest/"))).toBe(false);
  });

  it("keeps vitest as a development dependency at the same declared range", () => {
    // The range is deliberately unchanged by the remediation: only the section
    // it lives in moved, so the resolved tree cannot drift as a side effect.
    expect(rootManifest.devDependencies.vitest).toBe("^3.2.7");
  });

  it("retains tsx in production scope, because the Production release job executes it", () => {
    // db-release.yml's `environment: Production` deploy job runs `npm ci` and then
    // `npx tsx scripts/migrate.ts` / `setup-db-role.ts` / `db-release.ts verify`
    // against the production database; the pvg and drift-report jobs do the same.
    // Moving tsx would couple the production migration path to a full install for
    // no security gain. If that pipeline ever changes, change this assertion with it.
    expect(rootManifest.dependencies.tsx).toBeTruthy();
    const workflow = readText(".github/workflows/db-release.yml");
    expect(workflow).toContain("npx tsx scripts/migrate.ts");
  });

  it("leaves the runtime dependencies the deployed application actually needs intact", () => {
    for (const required of ["next", "react", "react-dom", "pg", "drizzle-orm", "zod", "dotenv"]) {
      expect(rootManifest.dependencies, `${required} is a runtime dependency`).toHaveProperty(required);
    }
  });
});

describe("production dependency boundary — resolved lockfiles", () => {
  it("keeps the whole vitest subtree out of the root production graph", () => {
    const names = productionEntries(ROOT_LOCKFILE).map((entry) => entry.name);
    for (const tool of ["vitest", "tinypool", "vite", "@vitest/mocker"]) {
      expect(names, `${tool} must be development-scoped in the root lockfile`).not.toContain(tool);
    }
  });

  it.each([
    ["root BEYU OS", ROOT_LOCKFILE],
    ["Health OS backend", HEALTH_BACKEND_LOCKFILE],
  ])("ships no known-critical version in the %s production graph", (_label, lockfile) => {
    const offenders = productionEntries(lockfile).filter(
      (entry) => entry.name in CRITICAL_FLOORS && isBelow(entry.version, CRITICAL_FLOORS[entry.name]),
    );
    expect(
      offenders.map((entry) => `${entry.path}@${entry.version} (< ${CRITICAL_FLOORS[entry.name]})`),
    ).toEqual([]);
  });

  it("resolves proxy-addr to the patched release in the Health OS backend image", () => {
    // Dockerfile line: RUN npm ci --omit=dev — so this entry is in the shipped image.
    const entries = productionEntries(HEALTH_BACKEND_LOCKFILE).filter((entry) => entry.name === "proxy-addr");
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(isBelow(entry.version, CRITICAL_FLOORS["proxy-addr"]), `${entry.path}@${entry.version}`).toBe(false);
    }
  });

  it("changes scope, not versions: the lockfile still resolves vitest 3.2.7 for development use", () => {
    const lock = readJson(ROOT_LOCKFILE) as { packages: Record<string, LockEntry> };
    const vitest = lock.packages["node_modules/vitest"];
    expect(vitest?.version).toBe("3.2.7");
    expect(vitest?.dev).toBe(true);
    const tinypool = lock.packages["node_modules/tinypool"];
    expect(tinypool?.version).toBe("1.1.1");
    expect(tinypool?.dev, "tinypool must be development-scoped, not removed and not shipped").toBe(true);
  });
});

describe("production dependency boundary — the CI gate is never weakened", () => {
  const workflow = readText(".github/workflows/ci.yml");
  const jobStart = workflow.indexOf("  production-dependency-audit:");

  it("still defines the production dependency audit job", () => {
    expect(jobStart).toBeGreaterThan(-1);
    expect(workflow).toContain("name: Production dependency audit (critical only)");
  });

  it("still runs the exact audit command, with the documented threshold", () => {
    expect(workflow).toContain("run: npm audit --omit=dev --audit-level=critical");
    expect(workflow).not.toContain("--audit-level=none");
    expect(workflow).not.toContain("npm audit fix --force");
  });

  it("still audits all three packages", () => {
    const job = workflow.slice(jobStart);
    for (const pkg of ["root-beyu-os", "health-os-frontend", "health-os-backend"]) {
      expect(job, `${pkg} must remain in the audit matrix`).toContain(`- name: ${pkg}`);
    }
  });

  it("does not let the audit step fail open", () => {
    const job = workflow.slice(jobStart);
    expect(job).not.toContain("continue-on-error");
    expect(job).not.toMatch(/npm audit[^\n]*\|\|\s*true/);
    // The gate must install before it audits, or it would be auditing nothing.
    expect(job).toContain("run: npm ci");
  });
});
