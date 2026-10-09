# BEYU OS — Production dependency audit: findings, exposure and remediation

**Status:** proposed change, **awaiting human review**. Nothing here was merged, deployed or promoted.
**Baseline investigated:** `main` @ `2bcff13badb26fdd2d71178040c8e85e3c0448ed` (PR #101).
**Date of investigation:** 2026-10-09.
**Relationship to PR #102:** this change is orthogonal to it — no canonical-host, frontend, routing or
authentication code is touched. It was developed and verified in an isolated worktree at `origin/main`
(§11) and then re-verified on top of PR #102's head (§11.3), where it now rides along in the same
pull request at the owner's explicit direction.

---

## 1. What fails, exactly

`.github/workflows/ci.yml` defines one job, `production-dependency-audit`
(`Production dependency audit (critical only)`), with a three-entry matrix. Each entry runs a plain
`npm ci` followed by exactly:

```
npm audit --omit=dev --audit-level=critical
```

| Matrix entry | Path | Lockfile | Result on `main` @ `2bcff13` |
|---|---|---|---|
| `root-beyu-os` | `.` | `package-lock.json` | **FAIL** (exit 1) — 2 critical |
| `health-os-frontend` | `sectors/health` | `sectors/health/package-lock.json` | PASS (exit 0) |
| `health-os-backend` | `sectors/health/backend` | `sectors/health/backend/package-lock.json` | **FAIL** (exit 1) — 1 critical |

Both failures are **time-dependent, not code-dependent**: the advisories were published on
2026-10-05, and `main`'s last green CI run predates them. The manifests and lockfiles involved are
byte-identical to the ones that passed before that date. Reproduced locally on a clean checkout of
`main` (no branch changes applied): `npm ci` → 448 packages → gate exit 1.

## 2. The advisories

Verified against the GitHub Advisory Database (`api.github.com/advisories/<GHSA>`), not against
npm's summarised text.

| Advisory | CVE | Severity | Package | Vulnerable range | First patched |
|---|---|---|---|---|---|
| GHSA-5gmw-xhrv-c9v3 — Prototype Pollution gadget in worker options → RCE | CVE-2026-104848 | **critical** | `tinypool` | `<= 2.1.0` | **2.1.1** |
| GHSA-85c8-ppgw-ccpr — Prototype Pollution gadget to RCE in `run()` options | CVE-2026-104849 | **critical** | `tinypool` | `< 2.1.2` | **2.1.2** |
| GHSA-jqcg-44mw-7w3h — IP spoofing via IPv4-mapped IPv6 trust subnet | CVE-2026-90711 | **critical** | `proxy-addr` | `>= 1.1.0, < 2.0.8` | **2.0.8** |

Non-critical findings that the gate does **not** fail on are inventoried in §8.1 so they are not lost:
`@vitest/mocker` GHSA-82fw-gwwq-j7x9 (moderate, `>= 2.1.0, < 4.1.11`), `sharp` GHSA-wq5f-xc86-pv6w
(high, `< 0.35.5`), `source-map-js` GHSA-68fv-2mgg-jv7q (high, `1.0.0 – 1.2.1`), and in the Health
OS backend tree `handlebars` (critical **but dev-scoped**, via `ts-jest`) plus 14 high / 11 moderate.

## 3. Installed versions and introduction paths (lockfile evidence)

Root `package-lock.json`, 643 entries:

```
beyu-os@0.3.0
├── vitest@3.2.7          ← listed under "dependencies" in root package.json
│   ├── tinypool@1.1.1    ← the only dependent of tinypool in the whole lockfile
│   └── vite@7.3.6
└── tsx@4.23.12           ← listed under "dependencies" in root package.json
```

`sectors/health/backend/package-lock.json`, 934 entries:

```
express@4.22.2                                         requires proxy-addr ~2.0.7
@nestjs/platform-express/node_modules/express@4.22.1   requires proxy-addr ~2.0.7
└── node_modules/proxy-addr@2.0.7  (hoisted; one copy, serves both express installs)
```

`vitest@3.2.7` is the **final 3.x release** (npm dist-tag `V3` = `3.2.7`), and the `tinypool` 1.x
line ends at `1.1.1`. There is therefore **no patched `tinypool` inside `vitest@3.2.7`'s declared
range** (`^1.1.1`): the patched releases (`2.1.1`, `2.1.2`, `2.2.0`) are a different major.

## 4. Actual runtime exposure — measured, not assumed

Two opposite errors are possible here, and both were checked.

### 4.1 `tinypool` is *not* reachable from the deployed application

* Its only dependent is `vitest`; `vitest`'s only dependent is the repository root.
* No file under `src/`, `scripts/`, `next.config.ts` or any build script imports `vitest`, `tsx` or
  `tinypool`. Outside the test suite itself, the only import of the package name in the whole
  repository is `vitest.config.ts:1 → import { defineConfig } from "vitest/config"`, which only the
  test runner loads. (The 329 test files that import `vitest` are inside `tsconfig.json`'s `include`,
  so the package must still be *resolvable* wherever `npm run typecheck` or `npm run build` runs —
  see §6.)
* The production build was executed (`npm run build`, the real command: `brand:check` →
  `build-identity` → `build-health-spa` → `next build`; exit 0). In the resulting artifact:
  * `.next/next-server.js.nft.json` — the deployed server runtime trace — contains **0** occurrences
    of `tinypool`, `vitest`, `@vitest/mocker` and `tsx`. It traces exactly 17 packages from
    `node_modules`: `next`, `react`, `react-dom`, `sharp` (+ `@img/*`, `detect-libc`,
    `@emnapi/runtime`), `styled-jsx`, `semver`, `client-only`, `@next/env`, `@swc/helpers`.
    (`pg`/`drizzle-orm` appear in per-route traces, which confirms the tracing is working rather
    than silently empty.)
  * `grep -r tinypool .next/server .next/static` → **0** files. The only `vitest` strings in
    `.next` are six `*.nft.json` entries naming the *file path* `vitest.config.ts`.
* Exploitation additionally requires a prototype-pollution primitive in the same Node process; no
  other prototype-pollution advisory exists anywhere in the root tree. The exposure is a gadget
  awaiting a primitive, in the **test runner's** process (vitest 3's default `forks` pool constructs
  `new Tinypool(...)`), not in the application's.

### 4.2 …but the root manifest *did* declare it production scope, and that is a real defect

`npm ci --omit=dev` at the repository root, measured on `main` before any change:

| Present in the production-only tree | Absent from the production-only tree |
|---|---|
| `vitest@3.2.7`, `tinypool@1.1.1`, `vite@7.3.6`, `@vitest/mocker@3.2.7`, `tsx@4.23.12` | `tailwindcss`, `@tailwindcss/postcss`, `typescript`, `eslint` |

106 packages installed. The manifest was **inverted**: a production-scoped install of this
repository shipped the test runner and omitted the toolchain the production build actually requires
(`postcss.config.mjs` → `@tailwindcss/postcss`, `src/app/globals.css` → `@import "tailwindcss"`,
and a TypeScript project whose `tsconfig.json` `include` covers 329 files importing `vitest`).
Consequences beyond the audit gate:

* `scripts/supply-chain/sbom.mjs:63` maps `scope: entry.dev ? "optional" : "required"`, so the
  repository's own CycloneDX SBOM was publishing `vitest` and `tinypool` as **`required`**
  (production) components.
* The audit gate was reporting a test-runner dependency as a production critical, contradicting its
  own documented policy (`docs/ci/README.md:102-106`): *"dev-only advisories in build tooling are
  triaged deliberately and must not redden the pipeline on every upstream publication, while a
  critical vulnerability in shipped runtime code must."*

No install path in the root package actually uses `--omit=dev` — verified by
`git grep -nE '\-\-omit=dev|--production|npm prune'`: the only occurrences in the whole repository
are the audit command itself (`ci.yml:1112`), `sectors/health/backend/Dockerfile:26`, and
`sectors/health/backend/scripts/npm-audit-phase12.mjs`. `scripts/deploy.sh` installs nothing; it
runs its gates against a contributor/CI `npm ci` tree. All five `db-release.yml` jobs — including the
`environment: Production` deploy job — run plain `npm ci`.

> **Correction to a prior record.** `BEYU_ENTERPRISE_INTELLIGENCE_EXPANSION_REPORT.md` §24.4 states
> "Nothing in the repository installs with `--omit=dev`". That is true of the *root* package and
> false of the repository: `sectors/health/backend/Dockerfile:26` runs `RUN npm ci --omit=dev &&
> npm cache clean --force`. This matters, because it is what makes §4.3 a genuine production
> exposure rather than a manifest-only one.

### 4.3 `proxy-addr@2.0.7` *was* in a production image, and is genuinely loaded

`sectors/health/backend/Dockerfile` builds the Health OS backend runtime image with
`npm ci --omit=dev`. `proxy-addr` is a production dependency of `express`, so the vulnerable `2.0.7`
build was present in that image — and unlike `tinypool` it is loaded:

* `express/lib/request.js:24` does `var proxyaddr = require('proxy-addr')` **unconditionally**, at
  module load.
* `req.ip` is `proxyaddr(this, this.app.get('trust proxy fn'))` — so the package is invoked on every
  `req.ip` read, and the backend reads `req.ip` in security-relevant paths:
  `src/modules/auth/auth.controller.ts:61,78,171` (login IP and `boundIp` session binding),
  `src/modules/auth/mfa.controller.ts:74,92,105`,
  `src/common/security/csrf-double-submit.guard.ts:174` and
  `src/common/observability/correlation-id.middleware.ts:42` (audit/observability).

The **specific vulnerable branch** — IPv4-mapped IPv6 trust-subnet matching — only executes when
`trust proxy` is configured with a subnet. This backend configures no `trust proxy` (verified: no
`trust proxy` / `trustProxy` / `X-Forwarded-For` handling anywhere in `src/`, `main.ts` or
`app.module.ts`), so express's trust function returns false and `proxyaddr` returns the socket
address without walking `X-Forwarded-For`. The exploit path is therefore **not reachable as
currently configured** — but the vulnerable code ships in the production image and is one
configuration line away from being reachable (putting the service behind a load balancer and setting
`trust proxy`, which is the normal thing to do). With a critical advisory, a supported in-range patch
and no manifest change required, patching is the correct call rather than accepting it.

Incidental observation, not acted on: `express-rate-limit` is declared in the backend's
`dependencies` but is never imported anywhere in `src/` or `test/` — the rate limiter is the
repository's own `src/common/security/rate-limiter.ts`. Removing an unused production dependency is a
separate decision and is deliberately not bundled into this change.

## 5. Remediation options, evaluated in the mandated order

| # | Option | Verdict | Evidence |
|---|---|---|---|
| **A** | A patched version compatible with the existing Vitest | **Not available.** `vitest@3.2.7` declares `tinypool ^1.1.1`; the 1.x line ends at `1.1.1`; patches exist only at `2.1.1`/`2.1.2`/`2.2.0`. `3.2.7` is the last 3.x (dist-tag `V3`). `npm audit fix` (non-force) has nothing to do in this range. | npm registry + advisory API |
| **B** | The manifest places test-only tooling under production dependencies | **Confirmed defect.** `vitest` sits in root `dependencies`; its sibling `sectors/health/package.json` already places the same `vitest@^3.2.7` in `devDependencies`. | §4.2 |
| **C** | Moving it to `devDependencies` is safe for build/CI/Docker/deploy | **Verified safe.** Every install path in the repository uses a full `npm ci`; the only `--omit=dev` install is the Health OS backend image, a different package. The root build already requires `devDependencies` (`typescript`, `tailwindcss`, `@tailwindcss/postcss`, `eslint`), so no new coupling is created. `scripts/deploy.sh` and `db-release.yml` run `npx vitest`/`npx tsx` against full installs. | §4.2, §6, §7 |
| **D** | Another minimal supported remediation | **Yes, for the backend:** `proxy-addr` `2.0.7 → 2.0.8` is inside express's declared `~2.0.7` — lockfile-only, no manifest edit, non-breaking, and it removes the vulnerable code. For the root, the only remaining *true* elimination of `tinypool` is the Vitest 4 major upgrade (§9), which is **not** performed here. | §4.3, §6 |

Explicitly **rejected**:

* `npm audit fix --force` — resolves to `vitest@5.0.3`, a two-major jump with a higher Node floor.
  Not evaluated as safe, not run, and it would have been run only with owner approval.
* `overrides: { "tinypool": "^2.1.2" }` under `vitest@3.2.7` — forces a major outside the declared
  range, raises `tinypool`'s Node floor to ≥ 20, and pins a package that Vitest 4 removes entirely.
  A viable emergency lever (measured working in §24.6 of
  `BEYU_ENTERPRISE_INTELLIGENCE_EXPANSION_REPORT.md`), not a default.
* Any advisory allowlist, `--audit-level` change, `continue-on-error`, or workflow edit. The gate is
  untouched, and the new invariant test in §10 **pins the gate command** so it cannot be weakened
  silently later.

## 6. The change

Three manifest/lockfile files. No source, schema, migration, workflow, configuration or secret is
touched.

**1. `package.json`** — two lines moved, nothing else:

```diff
     "tsx": "^4.19.2",
-    "vitest": "^3.2.7",
     "zod": "^3.24.1"
   },
   "devDependencies": {
-    "typescript": "5.9.3"
+    "typescript": "5.9.3",
+    "vitest": "^3.2.7"
   }
```

The version range is unchanged (`^3.2.7`). `tsx` is **deliberately retained** in `dependencies`:
`db-release.yml`'s `environment: Production` deploy job runs `npm ci` and then executes
`npx tsx scripts/migrate.ts`, `npx tsx scripts/setup-db-role.ts` and
`npx tsx scripts/db-release.ts verify` against the production database, and the `pvg` and
`drift-report` jobs do the same. `tsx` is production-release tooling for this repository and carries
no advisory; moving it would create a new failure mode in the production migration path for no
security gain.

**Why the build is unaffected.** `tsconfig.json`'s `include` is `**/*.ts`, so `npm run typecheck` and
Next's build-time type check both resolve `vitest/config` (from `vitest.config.ts` and the 329 test
files). That resolution already depends on `devDependencies` being installed — `typescript` itself is
a devDependency — and both were verified to pass with `vitest` in `devDependencies` (§11). Were any
install path ever to omit dev dependencies, the root build would already fail on `typescript`,
`tailwindcss` or `@tailwindcss/postcss` (§4.2) long before it failed on `vitest`: **no new coupling
is created**. On Vercel there is no root `vercel.json`, so the install is the platform default, and
the green Vercel check on a build that requires those devDependencies is the evidence that dev
dependencies are installed there.

**2. `package-lock.json`** — regenerated; 103 insertions, 4 deletions, and every changed line is
either the manifest mirror or a scope flag:

| Check | Result |
|---|---|
| Lockfile entries before / after | 643 / 643 |
| Entries added / removed | **none** / **none** |
| Resolved-version drift | **none — every version byte-identical** |
| Scope flag changes | 101 (`prod → dev` 47, `optional → devOptional` 52, `devOptional → dev` 2) |

**3. `sectors/health/backend/package-lock.json`** — one package, via
`npm update proxy-addr --package-lock-only`: 7 insertions, 3 deletions, confined to the
`node_modules/proxy-addr` entry (`2.0.7 → 2.0.8`, new `resolved`/`integrity`, plus the `funding`
block that 2.0.8 publishes). 934 entries before and after, `proxy-addr` the **only** version change.
No manifest edit was needed: express declares `~2.0.7`, which admits `2.0.8`. Both express copies
(4.22.2 and the nested 4.22.1) resolve to the single hoisted `proxy-addr`; there is no nested
duplicate.

## 7. Before / after audit evidence

Exact CI command, `npm audit --omit=dev --audit-level=critical`:

| Gate | Before (`main` @ `2bcff13`) | After |
|---|---|---|
| `root-beyu-os` | **exit 1** — 5 vulnerabilities (1 moderate, 2 high, **2 critical**) | **exit 0** — 2 high, **0 critical** |
| `health-os-frontend` | exit 0 | exit 0 (untouched) |
| `health-os-backend` | **exit 1** — 26 vulnerabilities (11 moderate, 14 high, **1 critical**) | **exit 0** — 25 (11 moderate, 14 high), **0 critical** |

Production-only install footprint at the root, `npm ci --omit=dev`:

| | Before | After |
|---|---|---|
| Packages installed | 106 | **53** |
| `vitest` / `tinypool` / `vite` / `@vitest/mocker` | present | **absent** |
| `tsx` | present | present (deliberate, §6) |
| `next`, `react`, `react-dom`, `pg`, `drizzle-orm`, `zod`, `dotenv` | present | present |

Installation reproducibility after the change: root `npm ci` → 448 packages, exit 0;
`sectors/health/backend` `npm ci --omit=dev` (the Dockerfile command) → 445 packages, exit 0, with
`node_modules/proxy-addr/package.json` reporting `2.0.8` on disk.

The patch was confirmed to be the real fix, not a version bump in name only — the 2.0.7 → 2.0.8
tarball diff adds the canonicalisation of IPv4-mapped IPv6 candidates (`ip = ip.toIPv4Address()`)
and the cross-family guards in both trust-matching paths, and those lines are present verbatim in
the installed module.

## 8. What this change does **not** do

Stated plainly, because the distinction is the whole point:

* **The `tinypool` advisories are NOT fixed.** `tinypool@1.1.1` remains in the tree as a
  *development* dependency and remains **loaded** wherever the test suite runs (vitest 3's default
  `forks` pool instantiates it). The root full-tree audit is unchanged at
  **16 vulnerabilities (5 moderate, 9 high, 2 critical)** before and after. What changed is that the
  package is no longer misdeclared as production scope, so the *production* gate measures the
  production graph and the SBOM reports it correctly. Eliminating the code requires §9.
* **The backend's `handlebars` critical is not addressed.** It is dev-scoped (via `ts-jest`),
  absent from the `npm ci --omit=dev` image (verified on disk), and therefore not a gate failure.
  Backend full-tree audit goes 76 → 75 vulnerabilities, 2 → 1 critical, purely from `proxy-addr`.
* **Two high findings remain in the root production graph.** `sharp@0.35.4` — which *is* traced into
  the deployed server runtime — and `source-map-js@1.2.1` (build-time, via `postcss`). Both are
  below the gate's `critical` threshold and both have in-range fixes; they are inventoried in §8.1
  rather than bundled into a security PR, to keep this diff reviewable.
* No advisory was suppressed, no threshold lowered, no workflow edited.

### 8.1 Remaining findings, with the exact follow-up for each

None of these fails a gate today. Each is listed so it can be scheduled deliberately instead of
being discovered again by accident.

| Package | Where | Severity | Reachability | In-range fix | Suggested follow-up |
|---|---|---|---|---|---|
| `sharp@0.35.4` | root, production graph | high (GHSA-wq5f-xc86-pv6w) | **Runtime** — traced into `.next/next-server.js.nft.json`; Next.js image optimisation | Yes: `next` declares `^0.35.4`, so `>= 0.35.5` is in range | Separate change: `npm update sharp`, then re-run the build and the image/branding suites. Native binaries in the runtime path deserve their own review. |
| `source-map-js@1.2.1` | root, production graph | high (GHSA-68fv-2mgg-jv7q) | Build-time only (via `postcss`, `@tailwindcss/node`) | Yes | Same change as `sharp`, or fold into the Vitest 4 work. |
| `@vitest/mocker@3.2.7` | root, **dev** graph | moderate (GHSA-82fw-gwwq-j7x9) | Test runner only | Only via Vitest `>= 4.1.11` | Removed automatically by the §9 upgrade. |
| `tinypool@1.1.1` | root, **dev** graph | **critical** ×2 | Test runner — loaded by vitest's `forks` pool | Only via Vitest `>= 4`, or the `overrides` lever | **§9 — owner decision.** |
| `handlebars@4.7.9` | backend, **dev** graph | **critical** ×3 titles | `ts-jest` only; absent from the `--omit=dev` image | Yes (`fixAvailable`) | Separate backend change: `npm update handlebars`, or the backend's own `npm audit fix` pass. |
| 14 high / 11 moderate | backend, production graph | high/moderate | mixed | mostly `npm audit fix` | A dedicated backend supply-chain change. `npm audit fix` there is broad (it would also move `joi`, `compression`, `multer`, `brace-expansion`), so it should not ride along with a one-package critical patch. |
| `express-rate-limit` | backend, production graph | none | **unused** — declared but never imported | n/a | Remove in a backend cleanup change. |

## 9. Owner decision required: Vitest 3 → 4

The only maintained remediation that removes `tinypool` from the repository entirely is a **major**
Vitest upgrade. It is **not performed here** — a major test-runner upgrade is a deliberate decision
that must be validated by a full CI run of its own, and the instruction governing this work forbids
performing one automatically.

Verified facts for that decision (registry + advisory API, 2026-10-09):

| Question | Answer |
|---|---|
| Does `vitest@4.1.11` depend on `tinypool`? | **No.** Its dependency list contains `tinyexec`, `tinybench`, `tinyglobby`, `tinyrainbow`, `obug`, `pathe`, `picomatch`, `magic-string`, `es-module-lexer`, `std-env`, `expect-type`, `why-is-node-running` and the `@vitest/*` 4.1.11 packages — no `tinypool`. |
| Does it fix the moderate `@vitest/mocker` advisory? | **Yes.** GHSA-82fw-gwwq-j7x9 `first_patched_version` = `4.1.11` for both `vitest` and `@vitest/mocker`. |
| Node requirement? | `engines: ^20.0.0 \|\| ^22.0.0 \|\| >=24.0.0`. The repository runs Node 22 in both workflows and locally (v22.22.3) → **no Node upgrade**. |
| Vite requirement? | peer `^6 \|\| ^7 \|\| ^8`; the lockfile has `vite@7.3.6` → **no Vite upgrade**. |
| Config surface used by BEYU | `resolve.alias`, `test.environment`, `test.include`, `test.setupFiles`, `test.fileParallelism` — all carried forward in v4, but this is an assertion to *prove* in that change, not to assume. |
| Risk | Major-version test-runner change across 329 test files; the repository's HTTP/E2E and browser layers, its skip-count guard and its serial `fileParallelism: false` ledger determinism all need a full green CI run before merge. |
| Alternative | `vitest@5.0.3` (npm's `audit fix --force` target) — a larger jump than necessary. `4.1.11` is the `V4` dist-tag and the smallest upgrade that removes the package. |

If the owner wants the exposure closed **before** that upgrade, the emergency lever is
`overrides: { "tinypool": "^2.1.2" }` in root `package.json`. It was measured working against the
full suite in `BEYU_ENTERPRISE_INTELLIGENCE_EXPANSION_REPORT.md` §24.6, but it forces a major
outside `vitest@3.2.7`'s declared range and raises `tinypool`'s Node floor to ≥ 20. It should be a
conscious, time-boxed decision, not a side effect.

## 10. Regression guard added

`tests/security/production-dependency-boundary.test.ts` (pure, DB-free, 13 tests) pins what this
change established, so neither half can silently regress:

1. no test-only tooling (`vitest`, `@vitest/*`, `tinypool`, `vite`, `playwright`, `jsdom`, …) may
   appear in root `dependencies`;
2. no lockfile entry matching a known-critical advisory range (`tinypool < 2.1.2`,
   `proxy-addr < 2.0.8`) may be **production-scoped** in either lockfile;
3. `tsx` stays in root `dependencies` with its reason recorded, so moving it forces a confrontation
   with `db-release.yml`;
4. the CI gate itself is pinned: `npm audit --omit=dev --audit-level=critical` must remain in
   `ci.yml` for all three matrix packages, with no `--audit-level=none`, no `continue-on-error` and
   no `|| true` escape on the audit step.

**Proven discriminating, in the style of the repository's own drift-gate self-test:** run against
the *unmodified* `main` manifests in a scratch tree, **7 of its 13 assertions fail** — naming
`vitest` as a root production dependency, `tinypool` in the root production graph and
`proxy-addr@2.0.7` in the backend production graph — while the four gate-integrity assertions and
the `tsx`/runtime-dependency assertions still pass, exactly as they should. After the change,
**13/13 pass**.

## 11. Verification record (isolated worktree at `origin/main`)

All commands run in a `git worktree` at `origin/main` (`2bcff13`, detached HEAD), so PR #102's
working tree was never touched while the remediation was developed and measured. Environment:
Node v22.22.3, npm 10.9.8, 2 vCPU / 3.9 GB, disposable embedded PostgreSQL 16.14
(`scripts/infra/pg16-server.mjs`, loopback only).

| Step (mirrors `ci.yml`'s root job order) | Result |
|---|---|
| `npm ci` (baseline) | 448 packages, exit 0 |
| `npm audit --omit=dev --audit-level=critical` (baseline) | **exit 1**, 2 critical — failure reproduced |
| `npx tsx scripts/migration/integrity.ts` | MIGRATION INTEGRITY PASSED (0 blocking; acknowledged debt unchanged) |
| `npm run typecheck` (`tsc --noEmit`) | **0 errors** |
| `npm run lint` (`eslint .`) | **0 errors**, 1 pre-existing `<img>` warning in `src/components/noelia-cross-os-visual.tsx` |
| `npm run migrate` | 75/75 APPLIED, head `0074_enterprise_intelligence_expansion`, fingerprint `f304a5178e44e0dd91e539161064b8d9` (unchanged; no migration touched) |
| `npx tsx scripts/setup-db-role.ts` + role assertion | `beyu_runtime`: NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE, NOCREATEDB |
| `npm run seed` | bootstrap complete; no credentials printed |
| `npm run build` (real command, incl. Health SPA compile) | **exit 0**; `src/app/health/os/spa-content.ts` reproduced byte-identically (sha256 `f491cb88…`) |
| `next start` + `/api/health` | `{"ok":true,"checks":{"database":"UP"}}` |
| `npx vitest run tests/finance` (CAP_POSTING, journal POST, ledger write authority) | **16 files / 431 tests passed** |
| Full root regression, PostgreSQL-backed + HTTP/E2E against the live server | see §11.1 |
| `npm ci --omit=dev` reproducibility (root and backend) | exit 0 both |
| Health OS backend: `npm ci`, typecheck, `nest build`, security + e2e jest layer | see §11.2 |
| Post-change gate command in all three matrix paths | **exit 0 / exit 0 / exit 0** |

### 11.1 Full regression

Run against the live server exactly as CI does — `next start -H 127.0.0.1 -p 3100` with
`BEYU_CANONICAL_DOMAIN=beyu.co.tz`, and the suite given `BEYU_TEST_BASE_URL=http://127.0.0.1:3100`
plus `BEYU_TEST_CANONICAL_DOMAIN=beyu.co.tz`, which is what makes `tests/helpers/http.ts` treat an
unreachable server as a failure instead of skipping every transport-level assertion:

```
Test Files  323 passed | 3 skipped (326)
     Tests  5398 passed | 11 skipped (5409)
  Duration  1445.43s (24m05s)          exit code 0
```

**0 failed.** The 3 skipped files are `tests/bootstrap/{enrollment-http,foundation,preparation}`,
which skip by design on `main` as well; the 11 skipped tests are inside them, well under the CI guard
that fails the run if the skip count climbs (≤ 15). That run collected 326 files rather than 327
because the new guard test was written after vitest had collected; it was run separately (13/13) and
then re-run together with the source-scan and invariant suites that could conceivably object to a new
file — `tests/architecture/{invariants,completeness,p1-invariants,p1-release-invariants}.test.ts` and
`tests/frontend/admin-frontend-preview.test.ts`: **6 files / 88 tests passed**.

Playwright browser tests were not executed locally: this sandbox has no browser binary and the
download CDN is outside its network allowlist. CI runs them.

### 11.2 Health OS backend

| Step | Result |
|---|---|
| `npm ci` (full) | **927 packages, exit 0** — lockfile consistent with the manifest, reproducible |
| `npm ci --omit=dev` (the Dockerfile command) | **445 packages, exit 0**; `node_modules/proxy-addr/package.json` reports **2.0.8** on disk; one hoisted copy, no nested duplicate, serving both `express@4.22.2` and `@nestjs/platform-express`'s nested `express@4.22.1` |
| `./node_modules/.bin/tsc --noEmit -p tsconfig.json` | **exit 0** |
| `npm run build` (`nest build`) | **exit 0** |
| jest, security + e2e layer, PGlite branch (`DATABASE_URL`/`TEST_DATABASE_URL`/`TEST_DATABASE_URL_SUPERUSER` cleared exactly as CI does) | **31 suites passed, 1 skipped (32) · 194 tests passed, 10 skipped (204) · 0 failed · exit 0 · 70s** — including `rate-limit-adversarial`, `csrf-adversarial`, `csrf-origin.guard`, `csrf-route-inventory`, `auth-wiring`, `auth-context.middleware`, `permissions`, `boot-validation`, `clinical-safety.guard` and `src/test/e2e/{app-boot,concurrency}` |

**Environment limit, reported not hidden:** the backend's *entire* jest suite could not be completed
in this sandbox. It was killed twice by the OOM killer (exit 137) — once with no heap cap and once
with `--max-old-space-size=2048` — at 3.6 GB RSS against a 3.9 GB machine, because the PGlite
in-process database's WASM allocation sits outside the V8 heap the flag limits. Roughly 60 suites
had passed before the first kill. This is a sandbox memory limit, not a code failure: the security
and e2e layers most relevant to `proxy-addr` (express request handling, IP-derived rate limiting,
CSRF, auth wiring) were run to completion instead, and CI's
`Health OS backend — real PostgreSQL gate` executes the whole suite against real PostgreSQL.

The real-PostgreSQL security layer (`rls-isolation`, `isolation-boundaries`, `identity.integration`,
`migration-consistency`, `beyu-bridge`, `identity-federation`, `auth-wiring`,
`auth-context.middleware`, `audit-chain-integrity`, `outbound-audit-integrity`) and the Health
migrations 001–045 were **not** re-run locally: this change touches no Health schema, no migration
and no backend source file — one transitive lockfile version inside its declared range. Those steps
are CI's to run on the pull request.

Two further honest notes. Running the backend jest suite **rewrites the tracked
`sectors/health/coverage/*.json` evidence artifacts** (21 files: a refreshed `generated` timestamp
plus regenerated matrices that are incomplete when only a subset of the suite runs). Those were
restored with `git checkout --` and are **not** part of this change. And
`node scripts/scan-secrets.mjs` exits 1 with **2 pre-existing findings** in
`tests/frontend/noelia-shell-http.test.ts:136,143` — a file last touched by `2bcff13` and untouched
here; the CI `Committed secret scan` job uses different patterns and passes.

### 11.3 Re-verification on the combined tree

Because this change now shares a pull request with PR #102's canonical-destination work, it was
re-applied on top of PR #102's head (`faa6ab66`) and re-verified there rather than assumed to carry
over:

| Step | Result |
|---|---|
| `npm ci` | 448 packages, exit 0 |
| The three audit gates, exact CI command | **exit 0 / exit 0 / exit 0** — root 2 high 0 critical, backend 25 (11 moderate, 14 high) 0 critical, frontend 0 |
| New guard test | **13/13 passed** |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors**, the same 1 pre-existing `<img>` warning |
| Migration integrity → `npm run migrate` → `setup-db-role` → `npm run seed` | PASSED; 75/75 APPLIED, head `0074_enterprise_intelligence_expansion`, fingerprint `f304a5178e44e0dd91e539161064b8d9`; `beyu_runtime` NOSUPERUSER / NOBYPASSRLS / NOCREATEROLE / NOCREATEDB |
| `npm run build` | **exit 0**; PR #102's `/sign-in` route registered; `src/app/health/os/spa-content.ts` byte-identical (sha256 `f491cb88…`), so the build added nothing to the diff |
| `/api/health` | `{"ok":true,"system":"BEYU-OS/1.0.0","checks":{"database":"UP"}}` |
| Targeted regression against the live server — `tests/{finance,architecture,security,sector-domains,frontend,release}` | **105 files passed (105) · 1704 tests passed, 1 skipped (1705) · 0 failed · exit 0 · 4m08s** |

That targeted set deliberately spans both halves of the combined branch: PR #102's
`destination-frontends` (32 tests), `destination-signin-http` (16, with its one by-design skip) and
`canonical-host-http` (16), and this change's Finance CAP_POSTING / journal POST / ledger-write
authority suites (`posting-engine` 21, `journal-scope-integrity` 6, `ledger-write-authority` 6,
`capital-governance` 26, `private-capital-refusals` 27) plus the new guard and the source-scan
invariants (`p1-release-invariants` 10, `admin-frontend-preview` 31). The full 326-file regression
was measured on the isolated `origin/main` worktree (§11.1); CI re-runs it, the HTTP/E2E layer and
the Playwright browser layer on the combined branch.

## 12. Non-claims and the human gate

* No production system was contacted. Every DSN used is loopback against a disposable embedded
  PostgreSQL that dies with the sandbox. No Supabase host, no Vercel project, no DNS record, no
  secret and no migration was touched.
* No authentication, authorization, RLS, MFA, session, tenant-isolation, audit or canonical-host
  routing code was modified — the diff is two manifest/lockfile scope corrections plus documentation
  and one pure test.
* This document does not claim `tinypool` is fixed. It claims the production dependency graph no
  longer contains it, with the evidence above, and that closing the advisory itself needs §9.
* Nothing is merged and nothing is promoted. The merge gate stays closed until a person opens it.
