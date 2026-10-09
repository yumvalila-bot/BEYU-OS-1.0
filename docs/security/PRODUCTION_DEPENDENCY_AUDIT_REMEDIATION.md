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
  **Superseded by §13**, which performs that upgrade: `tinypool` is now absent from the resolved
  tree and from the runner process (15 module events → 0), and the root full-tree audit goes
  16 vulnerabilities / 2 critical → **12 / 0 critical**.
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
| `source-map-js@1.2.1` | root, production graph | high (GHSA-68fv-2mgg-jv7q) | Build-time only (via `postcss`, `@tailwindcss/node`) | Yes | **DONE in §13** — re-resolved to `1.2.2` inside `postcss`'s own declared range, which drops the production gate from 2 high to 1. |
| `@vitest/mocker@3.2.7` | root, **dev** graph | moderate (GHSA-82fw-gwwq-j7x9) | Test runner only | Only via Vitest `>= 4.1.11` | **DONE in §13** — resolved at `4.1.11`, nested under `vitest`. |
| `tinypool@1.1.1` | root, **dev** graph | **critical** ×2 | Test runner — loaded by vitest's `forks` pool | Only via Vitest `>= 4`, or the `overrides` lever | **DONE in §13** — removed from the graph entirely (vitest 4 rewrote its pools without it). The `overrides` lever was not used. |
| `handlebars@4.7.9` | backend, **dev** graph | **critical** ×3 titles | `ts-jest` only; absent from the `--omit=dev` image | Yes (`fixAvailable`) | Separate backend change: `npm update handlebars`, or the backend's own `npm audit fix` pass. |
| 14 high / 11 moderate | backend, production graph | high/moderate | mixed | mostly `npm audit fix` | A dedicated backend supply-chain change. `npm audit fix` there is broad (it would also move `joi`, `compression`, `multer`, `brace-expansion`), so it should not ride along with a one-package critical patch. |
| `express-rate-limit` | backend, production graph | none | **unused** — declared but never imported | n/a | Remove in a backend cleanup change. |

## 9. Owner decision required: Vitest 3 → 4 — **DECIDED AND IMPLEMENTED, see §13**

> **Update 2026-10-09.** The owner took this decision. The upgrade to `vitest@4.1.11` is performed
> in §13 as a focused follow-up commit, with the compatibility work, the measured trees and the full
> regression recorded there. This section is kept as the pre-decision analysis it was, with two
> corrections marked inline, because the reasoning is what makes §13 reviewable.

The only maintained remediation that removes `tinypool` from the repository entirely is a **major**
Vitest upgrade. It was **not performed** by the first remediation commit — a major test-runner
upgrade is a deliberate decision that must be validated by a full CI run of its own, and the
instruction governing that work forbade performing one automatically.

Verified facts for that decision (registry + advisory API, 2026-10-09):

| Question | Answer |
|---|---|
| Does `vitest@4.1.11` depend on `tinypool`? | **No.** Its dependency list contains `tinyexec`, `tinybench`, `tinyglobby`, `tinyrainbow`, `obug`, `pathe`, `picomatch`, `magic-string`, `es-module-lexer`, `std-env`, `expect-type`, `why-is-node-running` and the `@vitest/*` 4.1.11 packages — no `tinypool`. |
| Does it fix the moderate `@vitest/mocker` advisory? | **Yes.** GHSA-82fw-gwwq-j7x9 `first_patched_version` = `4.1.11` for both `vitest` and `@vitest/mocker`. |
| Node requirement? | `engines: ^20.0.0 \|\| ^22.0.0 \|\| >=24.0.0`. The repository runs Node 22 in both workflows and locally (v22.22.3) → **no Node upgrade**. |
| Vite requirement? | peer `^6 \|\| ^7 \|\| ^8`; the lockfile has `vite@7.3.6` → **no Vite upgrade**. **Correction (§13.5): wrong in effect.** `vite` is a *required* peer, and vitest 4 also declares it as a dependency, which npm resolves to the newest matching major: `vite@8.3.4` is installed **nested under `vitest`**. The root's own build never used vite (Next.js/Turbopack), and the Health SPA is built by `sectors/health`'s own `vite@7.3.2`, so this is test-runner-only — measured, not assumed, in §13.5 and §13.9. |
| Config surface used by BEYU | `resolve.alias`, `test.environment`, `test.include`, `test.setupFiles`, `test.fileParallelism` — all carried forward in v4, but this is an assertion to *prove* in that change, not to assume. **Proven in §13.3/§13.8:** `vitest.config.ts` is byte-for-byte unchanged by the upgrade and the full suite runs on it. |
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
  and one pure test, and (§13) one manifest version, its lockfile and a single type annotation in a
  test file.
* As of §13 the `tinypool` advisories **are** closed at the root: the package is absent from the
  resolved tree and from the runner process, with the audit and module-load evidence in §13.6. The
  first remediation commit (§6) deliberately did not claim that, and this document preserved the
  distinction until the upgrade had actually been performed and measured.
* Nothing is merged and nothing is promoted. The merge gate stays closed until a person opens it.

## 13. The owner decision taken: `vitest` 3.2.7 → 4.1.11, `tinypool` removed from the tree

Performed 2026-10-09 as a focused follow-up commit on the same branch, on top of §6. One manifest
line, its lockfile, one type annotation in one test file, the guard test of §10 strengthened, and
this document. No workflow, threshold, migration, secret or application source changed.

### 13.1 What was inspected before anything was touched

| Item | Finding |
|---|---|
| `origin/main` | `2bcff13b`, unchanged since the first audit |
| PR #102 | OPEN, `mergeStateStatus: CLEAN`, head `8b72984b` (the §6 commit), `mergedAt: null` |
| `Noelia-AI-features` | tip `08dfe70` (2026-09-30). `compare` reports **ahead_by 0, behind_by 24** — fully contained in `main`, no unique work. Its manifest still shows `vitest` under `dependencies` and `tinypool@1.1.1` production-scoped, i.e. it is simply `main` from before §6; nothing to preserve and nothing to fix separately. |
| PR #98 (`arena/01163bf1…`) | OPEN, head `bad77383`, 2026-10-07. Independently patches the *same* advisory GHSA-jqcg-44mw-7w3h in `sectors/health/backend/package-lock.json` (`2.0.7 → 2.0.8`) — the same edit §6 made. Whichever merges second will conflict on that lockfile. Flagged, not touched. |
| Package manager | npm, `lockfileVersion: 3`, no `packageManager` field, no `overrides`, no `resolutions`, no `.npmrc`. **13 `npm ci` invocations** across `ci.yml` (5), `db-release.yml` (5), `runtime-dsn-diagnostic.yml` (1) and the Health OS backend `Dockerfile` (2). No workflow or Dockerfile runs `npm install`. |
| Node | CI pins `node-version: 22` at all five root/sector jobs; local v22.22.3, npm 10.9.8 (the npm bundled with Node 22) |
| Vitest configuration | `vitest.config.ts` (root) uses `resolve.alias`, `test.environment: "node"`, `test.include`, `test.setupFiles`, `test.fileParallelism: false`. `sectors/health/vitest.config.ts` is a separate package's config. No `vitest.workspace.*`, no projects, no coverage provider, no vitest browser mode (`npm run test:browser` is `playwright test`). |
| Actual CI failure | **None for `tinypool` as of `8b72984b`.** §6 turned both red gates green, and CI run `37892442070` confirmed all three `Production dependency audit` jobs passing. What remained was the *full-tree* audit (`npm audit`, no `--omit=dev`) exiting 1 with 2 criticals, the SBOM's dev-scope entry, and the fact that the package was still loaded on every test run. |

### 13.2 Root cause, and the version chosen

`vitest@3.2.7` declares `tinypool: ^1.1.1`. The `tinypool` 1.x line **ends at 1.1.1**; the patched
releases are `2.1.1` (GHSA-5gmw-xhrv-c9v3) and `2.1.2` (GHSA-85c8-ppgw-ccpr). `^1.1.1` admits
neither, so there is no patched tinypool reachable from any vitest 3.x — and `3.2.7` is the final
3.x (npm dist-tag `V3`). `npm audit fix` consequently offers nothing in range; its only suggestion
is `--force`, which targets `vitest@5.0.3`.

Vitest 4 does not bump tinypool, it deletes it: the v4.0.0 release notes list **"Rewrite pools
without `tinypool`"** (vitest-dev/vitest#8705). `vitest@4.1.11`'s dependency list contains no
tinypool, and `4.1.11` is also the exact `first_patched_version` for GHSA-82fw-gwwq-j7x9.

| Candidate | Verdict |
|---|---|
| `tinypool@2.1.2` via `overrides` | **Rejected.** Outside vitest 3's declared range; raises tinypool's Node floor; and §10's guard now asserts `package.json` has no `overrides` at all. |
| `vitest@4.1.11` | **Chosen.** npm dist-tag `V4`, highest 4.x (2026-08-18). Removes tinypool from the graph, patches the moderate `@vitest/mocker` advisory, needs no Node upgrade (`^20 \|\| ^22 \|\| >=24`) and no Vite major from the consumer. |
| `vitest@5.0.3` | **Rejected.** npm's `audit fix --force` target. Fixes no advisory that 4.1.11 does not already fix, is a second major with its own breaking-change set, and raises the Node floor to `^22.12.0`. |

No `@vitest/*` companion package is installed anywhere (no `coverage-v8`, `ui`, `browser-*`), so
there was nothing to keep in lockstep; no coverage command appears in any workflow.

### 13.3 Compatibility established before the change

Checked against the v4.0.0 release notes' breaking-change list, not against memory:

| v4 removal / change | Used by this repository? |
|---|---|
| `'basic'` reporter removed | No — default reporter, plus `--reporter=verbose` in the P3 job (verbose is kept) |
| `workspace` option removed for `projects` | No workspace file exists |
| `environmentMatchGlobs` / `poolMatchGlobs` removed | Not used |
| Vite 5 support removed | Lockfile has Vite 7 |
| `vite-node` replaced by module-runner | Never imported directly |
| Node types moved out of the main entry (`vitest/node`) | `vitest.config.ts` imports only `vitest/config` |
| Pools rewritten without tinypool | **The point of the upgrade** |
| `chai`-based `assert` | No test imports `assert` or `chai` from vitest (named imports across 329 files: `it`, `expect`, `describe`, `afterAll`, `beforeAll`, `beforeEach`, `afterEach`, `vi`, one type import) |
| Snapshots: obsolete snapshots fail on CI | No `.snap` file and no inline snapshot anywhere |
| `test()` with no function becomes `todo` | No such call exists |
| Spy implementation rewritten | One file uses `mockReset`/`mockRestore`/`restoreAllMocks`/`vi.hoisted`/`vi.mock` — `tests/api/health-classification.test.ts`, run explicitly: **44/44 passed** |
| Fake-timer defaults | One file uses `vi.useFakeTimers({ toFake: ["Date"] })` — explicit, so default changes are inert |
| Browser mode provider factory | Vitest browser mode is not used; Playwright runs through `playwright test` |

CI output coupling was checked specifically, because a gate greps the runner's stdout: `ci.yml`
extracts the skip count with `grep -oE '[0-9]+ skipped'` from the default reporter and tolerates
≤ 15 skips. Vitest 4 still prints `Tests  N passed | M skipped (T)`; the full run in §13.8 is
grepped for exactly that pattern.

### 13.4 The npm arborist crash, and the three trees that were measured

`npm install --save-dev vitest@4.1.11` under **npm 10.9.8** — the npm CI actually uses — dies with

```
TypeError: Cannot read properties of null (reading 'edgesOut')
    at #loadPeerSet (@npmcli/arborist/lib/arborist/build-ideal-tree.js:1289)
    … unfinished npm timer idealTree:node_modules/vitest
```

reproduced from a clean `node_modules` and from a hand-edited manifest. The trigger is vitest 4
declaring `vite` as **both** a dependency and a *required* peer
(`peerDependenciesMeta.vite.optional === false`). No `--force`, `--legacy-peer-deps` or `overrides`
was used to get past it. Three candidate trees were built and each was tested with the command CI
runs (`npm ci`, npm 10.9.8):

| Tree | Manifest | Lockfile authored by | Entries | `npm ci` under npm 10.9.8 |
|---|---|---|---|---|
| A | `vitest ^4.1.11` **+ `vite 7.3.6`** | npm 10.9.8 | 694 | exit 0 — but installs **two** vites: an unused `7.3.6` at the top level *and* `8.3.4` nested under vitest, which still runs the tests. +51 entries of dead weight. Rejected. |
| B | `vitest ^4.1.11` | npm 11.21.0 | 610 | **exit 1 — `EUSAGE`: "package.json and package-lock.json are not in sync"**. Would break all 13 `npm ci` sites. Rejected. |
| **C** | `vitest ^4.1.11` | npm 11 resolves, then **npm 10.9.8 `npm install` rewrites** | **637** | **exit 0 — chosen** |

Tree C's lockfile is authored by the same npm version that installs it in CI, which is what makes it
safe. npm 10's rewrite differs from npm 11's only by re-adding the 27 platform-specific `@esbuild/*`
optional binaries npm 11 had pruned; there is **no version difference** between B and C.

### 13.5 Exact before / after

Manifest — one line:

```diff
-    "vitest": "^3.2.7"
+    "vitest": "^4.1.11"
```

Lockfile: **643 → 637 entries**, 62 added / 68 removed (52 of the additions and 51 of the removals
are platform-specific native binaries), **14 version changes, 0 scope changes**, and
**production-scope entries unchanged at 106 → 106**.

| Package | Before | After | Scope |
|---|---|---|---|
| `vitest` | 3.2.7 | **4.1.11** | dev |
| `@vitest/expect`, `pretty-format`, `runner`, `snapshot`, `spy`, `utils` | 3.2.7 | **4.1.11** | dev |
| `@vitest/mocker` | 3.2.7 (top level) | **4.1.11** (nested under `vitest`) | dev |
| **`tinypool`** | **1.1.1** | **REMOVED** | — |
| `vite` | 7.3.6 (top level) | **8.3.4 nested under `vitest`** | dev |
| `vite-node` | 3.2.4 | **REMOVED** (module-runner replaces it) | — |
| `rollup` + 26 `@rollup/rollup-*` binaries | 4.63.0 | **REMOVED** | — |
| `rolldown` + 16 bindings, `@oxc-project/types`, `@rolldown/pluginutils` | — | **ADDED** 1.2.13 (vite 8's bundler) | dev |
| `lightningcss` + 12 binaries | — | **ADDED** 1.33.0 | dev |
| `obug`, `@standard-schema/spec` | — | **ADDED** 2.2.1 / 1.1.0 | dev |
| `chai` | 5.3.3 | 6.3.0 | dev |
| `es-module-lexer`, `std-env`, `tinyexec`, `tinyrainbow` | 1.7.0 / 3.10.0 / 0.3.2 / 2.0.0 | 2.3.2 / 4.3.0 / 1.3.1 / 3.2.0 | dev |
| `tinyspy`, `strip-literal`, `cac`, `check-error`, `deep-eql`, `loupe`, `pathval` | present | **REMOVED** | — |
| **`source-map-js`** | **1.2.1** | **1.2.2** | **production** |
| **`nanoid`** | **3.3.18** | **3.3.20** | **production** |

The two production-scope rows are the only change to the shipped graph, and they are *incidental*:
npm re-resolved `postcss`'s own declared ranges (`source-map-js ^1.2.1`, `nanoid ^3.3.x`) while
rebuilding the tree. No manifest declares either package. `source-map-js@1.2.2` clears
GHSA-68fv-2mgg-jv7q (high), which is why the production gate's high count drops from 2 to 1. Both
were verified by a full production build and the whole regression suite (§13.8).

`sectors/health` — the same one-line manifest change against its own package and lockfile:

```diff
-    "vitest": "^3.2.7"
+    "vitest": "^4.1.11"
```

| | Before | After |
|---|---|---|
| Lockfile entries | 235 | **227** |
| `tinypool` | **1.1.1** (dev) | **REMOVED** |
| `vitest` + the seven `@vitest/*` | 3.2.7 | **4.1.11** |
| `vite` | 7.3.2 (direct devDependency) | **7.3.2 unchanged, nothing nested** |
| `chai`, `es-module-lexer`, `std-env`, `tinyexec`, `tinyrainbow` | 5.3.3 / 1.7.0 / 3.10.0 / 0.3.2 / 2.0.0 | 6.3.0 / 2.3.2 / 4.3.0 / 1.3.1 / 3.2.0 |
| Scope changes | — | **0** (production-scope entries 5 → 5) |
| Full-tree audit | **exit 1 — 13 (1 low, 2 moderate, 8 high, 2 critical)** | **exit 0 — 10 (1 low, 1 moderate, 8 high, 0 critical)** |
| `npm audit --omit=dev --audit-level=critical` (the `health-os-frontend` gate) | exit 0 — 0 vulnerabilities | **exit 0 — 0 vulnerabilities** |

The same npm-10 arborist crash applies here, and the same recipe was used: npm 11 resolves, npm 10.9.8
rewrites, then `npm ci` under npm 10.9.8 exits 0 (157 packages). For this package npm 11 and npm 10
produced the **same 227 entries**, and re-deriving the lockfile from the manifest reproduced it
byte-for-byte (`git hash-object` = `ed5a0951de665adbde8290782b5425caac5241f7` twice) — a useful
independent check that the resolution is deterministic.

### 13.6 Audit and runtime evidence

The guard test of §10 was strengthened *first*, so the fix is proven by a test that fails without it.
Three new assertions (tinypool absent at any scope; no `vitest`/`@vitest/*` below 4.1.11; no
`overrides`/`resolutions`/`.npmrc` suppression) and two rewritten ones (the declared range and the
resolved version):

| Run | Before the upgrade | After |
|---|---|---|
| 1 | **4 failed \| 12 passed (16)**, exit 1 | **16 passed (16)**, exit 0 |
| 2 | **4 failed \| 12 passed (16)**, exit 1 | **16 passed (16)**, exit 0 |
| 3 | **4 failed \| 12 passed (16)**, exit 1 | **16 passed (16)**, exit 0 |

The 12 that passed before include every pre-existing assertion, so nothing was loosened to obtain
the green — the 4 failures are exactly the new tinypool/version invariants.

Audits:

| Command | Before | After |
|---|---|---|
| `npm audit --omit=dev --audit-level=critical` (the CI gate) | exit 0 — 2 high, 0 critical | **exit 0 — 1 high, 0 critical** |
| `npm audit --audit-level=critical` (full tree) | **exit 1 — 16 (5 moderate, 9 high, 2 critical)** | **exit 0 — 12 (4 moderate, 8 high, 0 critical)** |
| Cleared | — | `tinypool`, `vitest`, `@vitest/mocker`, `source-map-js` |
| Introduced | — | **none** |

npm had been rolling the two tinypool criticals up onto `vitest` itself as `0.0.95 - 4.1.10`, so one
version change clears both critical entries *and* the moderate one.

Runtime exposure, measured with an ESM loader hook (`module.registerHooks` on Node 22) that logs
every resolve/load whose specifier is `tinypool`, around a real `vitest run`:

| | Before | After |
|---|---|---|
| tinypool module events during one test run | **15** (`RESOLVE tinypool ← vitest/dist/chunks/coverage…`, then `LOAD` of `tinypool/dist/index.js`, `entry/process.js`, `common-*.js`, `utils-*.js`) | **0** — the hook's log file is never even created |
| `require.resolve('tinypool')` from the repository | resolves to `node_modules/tinypool` | **MODULE_NOT_FOUND** |
| Runner banner | `RUN v3.2.7` | `RUN v4.1.11` |

### 13.7 The one source change Vitest 4 required

`npx tsc --noEmit` reported exactly one error after the upgrade:

```
tests/api/health-classification.test.ts(74,42): error TS7006: Parameter 'c' implicitly has an 'any' type.
```

Vitest 3 typed `vi.spyOn` such that the un-instantiated `ReturnType<typeof vi.spyOn>` still yielded a
mock whose `mock.calls` element type was `any[]`. Vitest 4 types `spyOn` as **three generic
overloads** (`get` / `set` / method), so that same `ReturnType<…>` no longer resolves to a concrete
mock type and the callback parameter at line 74 became implicitly `any` under `strict`.

Fixed by naming the spied procedure rather than by annotating the callback or loosening the config:

```diff
-import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
+import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
…
-let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
+let consoleErrorSpy: MockInstance<typeof console.error>;
```

This is valid because `@vitest/spy` declares `type Mock<T> = MockInstance<T> & …`, so
`vi.spyOn(console, "error").mockImplementation(…)` remains assignable. It is *more* precise than the
Vitest 3 form: `.mock.calls` is now typed from `console.error`'s real signature. Typecheck went from
1 error to **0 errors**. No test, expectation, assertion or `it.skip` was added, removed or weakened.

### 13.8 Verification record

Environment: Node v22.22.3, npm 10.9.8, embedded PostgreSQL 16.14, this branch's working tree.

| Step | Result |
|---|---|
| `npm ci` (the command all 13 CI/Docker sites run) | **exit 0**, 443 packages (was 448) |
| The three audit gates, exact CI command | **exit 0 / exit 0 / exit 0** |
| Strengthened guard test | **16/16 passed**, three consecutive runs |
| `tsc --noEmit` | **0 errors** (after §13.7) |
| `npm run lint` | **0 errors**, the same 1 pre-existing `<img>` warning |
| Migration integrity → `npm run migrate` → `setup-db-role` → `npm run seed` | PASSED; fingerprint after migration `f304a5178e44e0dd91e539161064b8d9` — **identical to §11.3**, so the schema is untouched; `beyu_runtime` `rolsuper=false`, `rolbypassrls=false`, `rolcreaterole=false`, `rolcreatedb=false`, `rolcanlogin=true`, plus the payment/governance/tenant-domain/federation DML revocations; seed exit 0 |
| `npm run build` | **exit 0** — `✓ Compiled successfully`, 170/170 static pages, `/api/health`, `/health`, `/sign-in` registered; `src/app/health/os/spa-content.ts` **byte-identical** (sha256 `f491cb88c89b16939ad6e7a91194a666735513bdf8b315623dd64be6e9915680`, the same digest recorded in §11.3), so the nested Vite 8 did **not** perturb the Health SPA artifact |
| `/api/health` on `next start -H 127.0.0.1 -p 3100` with `BEYU_CANONICAL_DOMAIN=beyu.co.tz` | `{"ok":true,"system":"BEYU-OS/1.0.0","checks":{"database":"UP"},"latencyMs":12}` |
| Full root regression, CI parity (`npm test`, `BEYU_TEST_BASE_URL=http://127.0.0.1:3100`, `BEYU_TEST_CANONICAL_DOMAIN=beyu.co.tz`) | **326 files passed \| 3 skipped (329) · 5461 tests passed \| 12 skipped (5473) · 0 failed · exit 0 · 1498.53 s (24 m 59 s)**. The vitest 3 baseline at `HEAD` (§11.1, isolated `main`) was 323 files / 5398 tests / 0 failed / 24 m 05 s; the +3 files and +63 tests are PR #102's own suites, not tests added by this change. CI's skip-count guard was re-applied to this log: `12 ≤ 15` → PASS, and the `[0-9]+ skipped` pattern that `ci.yml` greps is still what vitest 4 prints (`Tests  5461 passed \| 12 skipped (5473)`) |
| Finance CAP_POSTING / journal POST / ledger-write authority | **16 files / 431 tests passed, 0 failed** — `posting-engine` 21, `journal-scope-integrity` 6, `ledger-write-authority` 6, `capital-governance` 26, `capital-governance-http` 14, `private-capital-refusals` 27, `finance-os` 95, `finance-os-domains` 72, `finance-os-rails` 68. CAP_POSTING fail-closed and the journal POST protection are unchanged. In the same run PR #102's suites stayed green: `destination-frontends` 32, `destination-signin-http` 16 (its 1 by-design skip), `canonical-host-http` 16, `admin-frontend-preview` 31, `p1-release-invariants` 10, and the strengthened guard 16 |
| `sectors/health`: `npm ci` → `npm run typecheck` → `npm test` → audits | **exit 0** at every step; 157 packages; `RUN v4.1.11`; **4 files / 16 tests passed** (incl. the jsdom `App.render` suite); both audits as tabulated in §13.5 |
| Root `npm run build` re-run *after* the sector upgrade | **exit 0**, `✓ Compiled successfully`, and `spa-content.ts` still sha256 `f491cb88…` — the sector's `vite build` still runs on vite 7.3.2 |
| Health OS backend (`npm ci` → `nest build` → jest `src/common/security src/test/e2e`) | **exit 0 / exit 0 / exit 0**; 927 packages, `proxy-addr@2.0.8` on disk (§6 intact); **31 suites passed (1 skipped), 194 tests passed, 10 skipped, 0 failed**; gate exit 0 with 25 vulnerabilities (11 moderate, 14 high), 0 critical. The full backend jest suite still cannot run in this sandbox — OOM-killed, exit 137, because PGlite's WASM sits outside the capped V8 heap (§11.2); CI runs it. |
| `npm run sbom` (CycloneDX, `scripts/supply-chain/sbom.mjs`) | 636 components, **106 `required`** (unchanged count). **`tinypool` is absent from the SBOM entirely**; `vitest@4.1.11`, `@vitest/mocker@4.1.11` and `vite@8.3.4` are `optional`; `tsx@4.23.12` remains `required` by design; `source-map-js` is now `1.2.2` and `nanoid` `3.3.20` |
| `node scripts/scan-secrets.mjs` | exit 1 on the **same 2 pre-existing findings** (`tests/frontend/noelia-shell-http.test.ts:136,143`), a file this commit does not touch; **no new finding** in any changed file. CI's `Committed secret scan` job uses different patterns and passed at `8b72984b` |

Build-memory note, measured rather than assumed. `next build`'s type-check step OOMs on this sandbox
(`FATAL ERROR: Reached heap limit` → `Failed to type check.`) because the box has 3.9 GB of RAM and
Node's default heap limit here is **1954 MB**, while `tsc` needs more than that *at HEAD too*:

| `tsc --noEmit --extendedDiagnostics` | vitest 3.2.7 (pristine `HEAD` tree) | vitest 4.1.11 |
|---|---|---|
| Files / Types | 2380 / 854,710 | 2405 / 870,243 |
| Memory used | 2,159,428 K (2.06 GB) | 2,239,468 K (**2.14 GB, +78 MB / +3.7 %**) |
| Total time | 58.90 s | 64.86 s (+6.0 s) |

With `NODE_OPTIONS=--max-old-space-size=3072` the build exits 0. CI's runners have 8 GB, where
Node's default heap is roughly 4 GB, and CI's `Production build` step passed at `HEAD` — a +3.7 %
type-check footprint does not change that materially, but it is recorded here because it is the one
resource axis on which this upgrade makes anything heavier.

### 13.9 Risks, side effects and follow-ups

* **Vitest 4 pulls Vite 8.3.4 (rolldown-based) into the dev tree**, plus `rolldown` and
  `lightningcss` native binaries. Test-runner only: the root production build is Next.js/Turbopack
  and the Health SPA is compiled by `sectors/health`'s own `vite@7.3.2`, which is why
  `spa-content.ts` reproduced byte-identically. Tree A (§13.4) shows that declaring `vite` at the
  root to keep v7 does **not** prevent vitest from using its own nested v8 — it only adds a second,
  unused copy — so it was rejected.
* **Vite 8 emits a forward-compatibility warning** about `vitest.config.ts`: *"ESM syntax in a file
  loaded as CommonJS … Use a `.mjs` extension or set `"type": "module"`"*, because
  `configLoader: 'native'` is planned to become Vite's default. Inert today (the run is green). The
  rename is deliberately **not** bundled into a security change; it belongs in a follow-up.
* **`sectors/health` was upgraded in the same commit**, because it is the only other package in the
  repository that resolves vitest; leaving it would have left `tinypool@1.1.1` installed somewhere and
  the job half done. Its tree came out *cleaner* than the root's: the package already declares
  `vite@7.3.2` directly, so vitest's required peer is satisfied in place and **no second vite is
  installed at all** — no rolldown, no lightningcss, and the SPA build keeps using vite 7.3.2. Measured
  in §13.5 and §13.8. The Health OS backend runs jest and has never carried tinypool; its lockfile is
  untouched by this commit.
* **Not addressed here** (all still inventoried in §8.1): `sharp@0.35.4` high, which *is* traced into
  the deployed server runtime; the backend's dev-scoped `handlebars` critical; the backend's 14 high /
  11 moderate; and the backend's declared-but-never-imported `express-rate-limit`.
* **Playwright could not run in this sandbox** (no browser binary, and the download CDN is not
  reachable from it), so `npm run test:browser` is delegated to CI exactly as in §11.3.

### 13.10 Non-claims and the human gate

* No advisory was suppressed, no `--force`, no `--legacy-peer-deps`, no `overrides`, no
  `resolutions`, no `.npmrc`, no audit threshold changed, no workflow edited, no test skipped or
  loosened.
* No authentication, authorization, RLS, MFA, session, tenant-isolation, audit or canonical-host
  routing code was modified; `vitest.config.ts` is unchanged; no migration was added or altered and
  the post-migration fingerprint is identical to §11.3.
* No production system was contacted: loopback DSNs against a disposable embedded PostgreSQL, no
  Supabase host, no Vercel project, no DNS record, no secret.
* Nothing is merged, promoted or deployed. PR #102 remains OPEN with `mergedAt: null`, and the merge
  gate stays closed until a person opens it.
