# HEALTH OS `proxy-addr` Remediation Report

**Assessment date:** 2026-10-07 (UTC)  
**Advisory:** GHSA-jqcg-44mw-7w3h / CVE-2026-90711  
**Base:** `main` at `9b4c792f3759b7aa757d236216e1aeff172873fe`  
**Session branch:** `arena/01163bf1-beyu-os-1-0`  
**Scope:** Health OS backend dependency remediation only

## 1. Advisory

GitHub rates GHSA-jqcg-44mw-7w3h **Critical** (CVSS 3.1: 9.1). Affected `proxy-addr` releases incorrectly trust IPv4 clients when an IPv4-mapped IPv6 trust subnet is configured with a short prefix (for example, `::ffff:10.0.0.0/8`). Express can then take a spoofed `X-Forwarded-For` value as the client address, affecting IP-based controls and records.

Advisory details: <https://github.com/advisories/GHSA-jqcg-44mw-7w3h>

## 2. Vulnerable package and version

- **Package:** `proxy-addr` (transitive; not a direct root dependency)
- **Before:** `2.0.7`
- **Vulnerable range:** `>=1.1.0 <2.0.8`
- **First patched version:** `2.0.8`
- **After:** `2.0.8`

The Health OS lockfile had one hoisted `proxy-addr` package record at `node_modules/proxy-addr`. It was marked as a production dependency (`dev: false`).

## 3. Dependency chain

The baseline `npm ls proxy-addr --all` and `npm explain proxy-addr` showed both Express instances resolving to the same vulnerable hoisted package:

```text
beyu-health-os-backend
├─ express@4.22.2
│  └─ proxy-addr@2.0.7
└─ @nestjs/platform-express@10.4.22
   └─ express@4.22.1
      └─ proxy-addr@2.0.7 (deduped)
```

Both Express manifests request `proxy-addr` using `~2.0.7`. That range admits the compatible patch release `2.0.8` and does not require an Express or Nest upgrade.

## 4. Production reachability and runtime use

The package is **production-reachable**: it is a non-development dependency of both runtime Express paths used by the Health OS Nest Express adapter. Express imports `proxy-addr`; its `req.ip` getter calls `proxyaddr(req, trust)`, and `req.ips` calls `proxyaddr.all`. Health OS runtime code reads `req.ip` for correlation logging, CSRF/rate-limit event records, authentication, and MFA-related handling.

No explicit `trust proxy` setting was found in the Health OS source/configuration. Express therefore retains its default `trust proxy: false` in the reviewed code, so the advisory's specific malformed-trust-subnet precondition was not configured at this base revision. The dependency is nevertheless loaded by runtime HTTP handling, and the patch prevents the vulnerable trust behavior if a trust subnet is introduced or configured later.

## 5. Minimum safe fix and compatibility

Only the Health OS backend lockfile resolution was updated from `proxy-addr@2.0.7` to **`2.0.8`**. The package manifest was not changed because the existing Express `~2.0.7` ranges already include the minimum fixed patch. No Express, Nest, authentication, authorization, tenant/RLS, API, migration, CORS, security-header, rate-limiting, or proxy configuration changes were made.

`proxy-addr@2.0.8` retains the same Node engine floor (`>=0.10`) and the same runtime dependencies (`forwarded@0.2.0`, `ipaddr.js@1.9.1`) as the locked version. The patch corrects IPv4 matching for IPv4-mapped IPv6 trust subnets; it does not change Express's default trust-proxy setting.

After installation, `npm ls proxy-addr --all` showed:

```text
beyu-health-os-backend
├─ @nestjs/platform-express@10.4.22
│  └─ express@4.22.1
│     └─ proxy-addr@2.0.8 deduped
└─ express@4.22.2
   └─ proxy-addr@2.0.8
```

A direct behavior check with the patched package also passed: the malformed `::ffff:10.0.0.0/8` subnet did **not** trust an unrelated IPv4 peer (`203.0.113.9`) or replace it with the supplied forwarded address; the correctly written `/104` subnet trusted an in-range `10.1.2.3` peer and did not trust the unrelated peer.

## 6. Files changed

1. `sectors/health/backend/package-lock.json` — resolves the existing transitive dependency to `2.0.8` and records the published integrity hash.
2. `HEALTH_OS_PROXY_ADDR_REMEDIATION_REPORT.md` — this audit and verification report.

No `.env` files, credentials, application source, production configuration, migrations, or other lockfiles were changed.

## 7. Tests and checks executed

### Dependency and advisory verification

- `npm ci --no-audit` — succeeded against the baseline lock and again against the patched lock.
- `npm ls proxy-addr --all` and `npm explain proxy-addr` — verified both Express paths resolve to `2.0.8`.
- Lockfile inspection — one `proxy-addr` record at `2.0.8`; no vulnerable `proxy-addr` version remains in the Health OS lockfile.
- Patched-package trust-subnet behavior check — passed for the malformed `/8`, the correctly specified `/104`, and an out-of-range IPv4 peer.
- Full `npm audit --json` and production `npm audit --omit=dev --audit-level=critical --json` — run before and after; details are in Sections 9–11.

### Health OS regression checks

The complete Health OS Jest suite was run from the baseline and again after the dependency update, with all database URLs cleared so the suite used its non-production PGlite harness:

- **Baseline:** 101 suites passed; 2 suites skipped; 622 tests passed; 15 skipped; 0 failures.
- **After:** 101 suites passed; 2 suites skipped; 622 tests passed; 15 skipped; 0 failures.
- The suite includes Health OS unit/security specs, PGlite integration coverage, authentication/authorization and tenant/RLS cases, and the `src/test/e2e` API workflows.

Additional post-change checks:

- `npm run test:integration -- --runInBand` — serial retry passed: 1 suite, 24 tests.
- `./node_modules/.bin/tsc --noEmit -p tsconfig.json` — passed.
- `npm run build` — passed.
- Non-mutating ESLint invocation used by the Health backend CI pattern — passed across 284 files, 0 errors and 0 warnings. The package `lint` script was not used because it includes `--fix`.
- `src/common/security/phase12-coverage.spec.ts` and `src/test/e2e/app-boot.spec.ts` ran and passed as part of the full suite. No dedicated HTTP response-header/CORS E2E spec was found, so a non-mutating middleware-level HTTP smoke used Express with the same current `main.ts` Helmet/CORS options: GET and OPTIONS passed; CSP, HSTS, referrer, content-type, CORS-origin, and credentials headers were asserted; a supplied `X-Forwarded-For` value was not trusted under Express's default trust setting. This smoke validates middleware behavior, not the full production bootstrap. The application configuration remains unchanged.

**Local environment limitation:** Docker, `psql`, and `pg_isready` are not installed/available in this sandbox. Therefore the repository's separate real-PostgreSQL migration/RLS gate and production-mode readiness boot gate were not run locally. The full PGlite suite did run. The canonical real-PostgreSQL Health OS CI job must still pass on the PR before merge. No production database or service was contacted.

One isolated `test:integration` attempt was run concurrently with typecheck/build/lint and hit Jest's 5-second PGlite `beforeAll` timeout (24 tests consequently reported failed). An immediate serial retry, with no competing jobs, passed all 24 tests; both complete PGlite suite runs also passed. This was resource contention during the isolated run, not a persistent failure or code/test change.

## 8. Security results

- Target advisory **removed** from the full npm audit result after the lockfile update.
- No `proxy-addr` instance below `2.0.8` remains in the Health OS dependency tree or lockfile.
- Production critical audit gate passes after the change (exit code 0).
- Full `npm audit` remains nonzero due to pre-existing, out-of-scope advisories; it was nonzero on the audited baseline as well. No unrelated dependencies were updated.

## 9. Before/after dependency and audit state

| Measure | Baseline `main` | Candidate |
|---|---:|---:|
| Lockfile package records (`packages`, including root) | 934 | 934 |
| `proxy-addr` lock records | 1 × 2.0.7 | 1 × 2.0.8 |
| Express versions | 4.22.2 and 4.22.1 | unchanged |
| `@nestjs/platform-express` | 10.4.22 | unchanged |
| `npm ci` | passed; 927 packages added | passed; 927 packages added |
| Full `npm audit` vulnerable package entries | 75 | 74 |
| Full audit severity totals | 3 low, 16 moderate, 55 high, **1 critical** | 3 low, 16 moderate, 55 high, **0 critical** |
| `npm audit --omit=dev --audit-level=critical` entries | 26: 11 moderate, 14 high, **1 critical** (exit 1) | 25: 11 moderate, 14 high, **0 critical** (exit 0) |
| Full Health OS PGlite Jest suite | 101 passed / 2 skipped suites; 622 passed / 15 skipped tests | same |

The lockfile package-record count and dependency graph size did not change; only the existing `proxy-addr` package record moved to its fixed patch version. The audit count fell by exactly one, the target critical entry.

## 10. Remaining advisories

The candidate full audit reports **74 other vulnerable package entries**: 3 low, 16 moderate, 55 high, and 0 critical. The production-only audit reports **25 entries**: 11 moderate and 14 high. These findings were present on the baseline before this remediation and were not introduced by this lockfile-only change. They include existing advisories in packages such as `@apollo/server`, `@nestjs/*`, `compression`, `joi`, `nestjs-i18n`, and `uuid`, plus development-tool transitive dependencies. They are explicitly left for separate, scoped remediation rather than broadening this PR or applying `npm audit fix --force`.

## 11. Production impact assessment

This change has no production effect until a human-approved release installs the updated Health OS backend lockfile. It changes no APIs, data, migrations, credentials, production environment settings, Vercel/Supabase configuration, or deployment process. Migration 0074 was not re-run or altered. No production database or deployment was touched. Production deployment remains a human-controlled action after merge.

## 12. Merge recommendation

**NOT READY for overall PR merge as of the CI update below.** The Health OS `proxy-addr` fix and Health OS-specific PostgreSQL/security gates pass, but a separate repository-root critical dependency audit fails and the root BEYU OS PostgreSQL gate remains in progress. That root tree is unchanged from `origin/main` and is the separate Vitest/tinypool dependency tree explicitly outside this remediation. It must be handled through its own scoped security work; it is not changed here. Do not auto-merge or deploy.

## 13. Merge-gate status — PR #98 CI update

PR: <https://github.com/yumvalila-bot/BEYU-OS-1.0/pull/98>

CI run: <https://github.com/yumvalila-bot/BEYU-OS-1.0/actions/runs/37590261102>

**Dependency-change commit tested:** `6db44b4a6726758727c2d7b66b9cb61c32fe12af`. The follow-up report update changes no dependency or runtime files.

At the time of this report update:

- **Health OS backend — real PostgreSQL gate: PASS.** The GitHub job completed typecheck, migration application/verification/idempotence, PGlite regression, real-PostgreSQL security suite (including RLS/auth/integration), build, compiled production-mode readiness/unauthenticated API checks, and non-mutating lint.
- **Health OS production critical dependency audit: PASS.**
- Health OS frontend verification, migration scratch-PostgreSQL validation, secret scan, and P3 release-governance checks: **PASS**.
- **Separate root BEYU OS production dependency audit: FAIL.** Running that root audit against the unchanged root manifest/lock reports 5 vulnerable package entries (1 moderate, 2 high, 2 critical); the critical entries are `tinypool` and `vitest`. `package.json` and the root `package-lock.json` are identical to `origin/main`. This is not the Health OS backend tree and is not addressed by this PR.
- **Root BEYU OS — PostgreSQL security gate: PENDING** at the time of this update.
- Production database deploy/verify and production verification jobs: **SKIPPED**; no production action was taken.

The Health OS remediation itself is verified, but the PR is classified **NOT READY** while the repository-wide required root audit is failing and the root PostgreSQL gate is pending. Final merge remains a human decision after required checks are green.
