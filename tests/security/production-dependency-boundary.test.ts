import { existsSync, readFileSync } from "node:fs";
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
 * WHAT THE FIRST REMEDIATION DELIBERATELY DID NOT CLAIM. tinypool itself was
 * NOT fixed by the scope change — it stayed installed in the development graph
 * and was still loaded into the vitest runner process on every test run (proved
 * with an ESM loader hook: 15 tinypool module events per run). Removing it
 * needed the Vitest 4 major upgrade, which was left as an explicit owner
 * decision.
 *
 * THAT OWNER DECISION IS NOW TAKEN. `vitest` is upgraded 3.2.7 -> 4.1.11 in
 * BOTH packages that resolve it — the root and `sectors/health`, which have
 * separate manifests and lockfiles; the Health OS backend runs jest and never
 * carried tinypool. Vitest 4 (a) rewrites its pools without tinypool at all
 * (vitest#8705), so the package leaves the trees entirely rather than being
 * bumped, and (b) is the first release patched for GHSA-82fw-gwwq-j7x9 /
 * CVE-2026-84373 (moderate path traversal via @vitest/mocker redirect mocks,
 * `>= 2.1.0, < 4.1.11`). npm had been rolling the tinypool criticals up onto
 * `vitest` itself as `0.0.95 - 4.1.10`, so this clears both critical entries and
 * the moderate one. 4.1.11 is the highest 4.x (npm dist-tag `V4`), needs Node
 * `^20 || ^22 || >=24` — CI pins 22 — and Vite `^6 || ^7 || ^8`, which
 * `sectors/health` satisfies with its own direct `vite@7.3.2`. At the root, where
 * nothing but vitest consumed vite, npm resolves vitest's own vite dependency to
 * `8.3.4` nested under it: test-runner only, since the root production build is
 * Next.js/Turbopack and the Health SPA artifact stayed byte-identical. 5.0.3 was
 * rejected — a second major that fixes no additional advisory.
 *
 * See docs/security/PRODUCTION_DEPENDENCY_AUDIT_REMEDIATION.md.
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
  // GHSA-82fw-gwwq-j7x9 (>= 2.1.0, < 4.1.11) — and 4.1.11 is the first release
  // whose pools are written without tinypool, so it is also the floor that keeps
  // the two tinypool criticals out of the tree.
  vitest: "4.1.11",
};

type LockEntry = { version?: string; dev?: boolean; optional?: boolean; dependencies?: Record<string, string> };

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

/** Every lockfile entry regardless of scope — the tree `npm ci` actually installs. */
function allEntries(lockfile: string): Array<{ name: string; version: string; path: string; dev: boolean }> {
  const lock = readJson(lockfile) as { packages: Record<string, LockEntry> };
  const out: Array<{ name: string; version: string; path: string; dev: boolean }> = [];
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path || !entry.version) continue;
    out.push({ name: path.split("node_modules/").pop() ?? path, version: entry.version, path, dev: entry.dev === true });
  }
  return out;
}

/** The lowest version a manifest range can resolve to, e.g. "^4.1.11" -> "4.1.11". */
function rangeFloor(range: string): string {
  const match = range.match(/\d+\.\d+\.\d+/);
  return match ? match[0] : range;
}

const ROOT_LOCKFILE = "package-lock.json";
const HEALTH_BACKEND_LOCKFILE = "sectors/health/backend/package-lock.json";
/** The Health OS frontend is the only other package in the repository that resolves vitest. */
const HEALTH_FRONTEND_LOCKFILE = "sectors/health/package-lock.json";
const HEALTH_FRONTEND_MANIFEST = "sectors/health/package.json";

describe("production dependency boundary — root manifest", () => {
  it("declares no test-only tooling as a production dependency", () => {
    const production = Object.keys(rootManifest.dependencies);
    for (const tool of TEST_ONLY_TOOLING) {
      expect(production, `${tool} must not be a root production dependency`).not.toContain(tool);
    }
    expect(production.some((name) => name.startsWith("@vitest/"))).toBe(false);
  });

  it("keeps vitest a development dependency, at a range that cannot resolve below the patched floor", () => {
    // The scope half is unchanged from the first remediation: vitest must stay a
    // devDependency. The declared range is now deliberately raised. vitest 3.2.7
    // declares `tinypool ^1.1.1` and the tinypool 1.x line ends at 1.1.1, so no
    // patched tinypool (>= 2.1.2) is reachable from any 3.x release; 4.1.11
    // declares no tinypool dependency at all.
    const range = rootManifest.devDependencies.vitest;
    expect(rootManifest.dependencies.vitest, "vitest must not be a production dependency").toBeUndefined();
    expect(range).toMatch(/^\^4\./);
    expect(isBelow(rangeFloor(range), CRITICAL_FLOORS.vitest), `${range} can resolve below ${CRITICAL_FLOORS.vitest}`).toBe(
      false,
    );
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

  it("resolves a patched, tinypool-free vitest for development use", () => {
    const lock = readJson(ROOT_LOCKFILE) as { packages: Record<string, LockEntry> };
    const vitest = lock.packages["node_modules/vitest"];
    expect(vitest?.dev, "vitest stays development-scoped — this is a version fix, not a re-scope").toBe(true);
    expect(isBelow(vitest?.version ?? "0.0.0", CRITICAL_FLOORS.vitest), `vitest ${vitest?.version}`).toBe(false);
    // Vitest 4 rewrote its pools without tinypool, so the runner must no longer
    // declare it at any version.
    expect(Object.keys(vitest?.dependencies ?? {})).not.toContain("tinypool");
  });
});

describe("test-runner supply chain — the vulnerable package is gone from every tree", () => {
  // Both packages that resolve vitest. The Health OS backend runs jest and has
  // never carried tinypool, so it is covered by the production-graph tests above.
  const VITEST_TREES = [
    ["root BEYU OS", ROOT_LOCKFILE],
    ["Health OS frontend", HEALTH_FRONTEND_LOCKFILE],
  ] as const;

  it.each(VITEST_TREES)("has removed tinypool from the resolved %s tree, not merely re-scoped it", (_label, lockfile) => {
    // Re-scoping moved tinypool out of `npm ci --omit=dev` but left it installed
    // and loaded into the runner process. This asserts it is no longer resolved
    // at ANY scope, at ANY version.
    const offenders = allEntries(lockfile).filter((entry) => entry.name === "tinypool");
    expect(
      offenders.map((entry) => `${entry.path}@${entry.version}`),
      "tinypool <= 2.1.1 carries GHSA-5gmw-xhrv-c9v3 and GHSA-85c8-ppgw-ccpr (both critical)",
    ).toEqual([]);
  });

  it.each(VITEST_TREES)("ships no vitest or @vitest/* package below the patched floor in %s", (_label, lockfile) => {
    const offenders = allEntries(lockfile).filter(
      (entry) =>
        (entry.name === "vitest" || entry.name.startsWith("@vitest/")) && isBelow(entry.version, CRITICAL_FLOORS.vitest),
    );
    expect(
      offenders.map((entry) => `${entry.path}@${entry.version}`),
      "@vitest/mocker < 4.1.11 carries GHSA-82fw-gwwq-j7x9",
    ).toEqual([]);
  });

  it("declares a patched vitest range in both manifests, as a devDependency", () => {
    for (const manifestPath of ["package.json", HEALTH_FRONTEND_MANIFEST]) {
      const manifest = readJson(manifestPath) as {
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
      };
      const range = manifest.devDependencies.vitest;
      expect(range, `${manifestPath} must declare vitest as a devDependency`).toBeTruthy();
      expect(manifest.dependencies.vitest, `${manifestPath} must not declare vitest in production scope`).toBeUndefined();
      expect(isBelow(rangeFloor(range), CRITICAL_FLOORS.vitest), `${manifestPath}: ${range}`).toBe(false);
    }
  });

  it("did not obtain the result with an override, a forced resolution or a suppressed audit", () => {
    for (const manifestPath of ["package.json", HEALTH_FRONTEND_MANIFEST]) {
      const manifest = readJson(manifestPath) as Record<string, unknown>;
      expect(manifest.overrides, `${manifestPath}: npm overrides must not pin a version outside the declared range`).toBeUndefined();
      expect(manifest.resolutions, `${manifestPath}: resolutions must not pin a version outside the declared range`).toBeUndefined();
      const npmrc = manifestPath === "package.json" ? ".npmrc" : "sectors/health/.npmrc";
      if (existsSync(resolve(repoRoot, npmrc))) {
        const contents = readText(npmrc);
        expect(contents, npmrc).not.toMatch(/^\s*audit\s*=\s*false/m);
        expect(contents, npmrc).not.toMatch(/^\s*legacy-peer-deps\s*=\s*true/m);
        expect(contents, npmrc).not.toMatch(/^\s*force\s*=\s*true/m);
      }
    }
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
