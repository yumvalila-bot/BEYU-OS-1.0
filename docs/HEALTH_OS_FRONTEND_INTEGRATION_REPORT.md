# Health OS — Frontend Integration Report

**Companion to** `docs/HEALTH_OS_FRONTEND_INTEGRATION_AUDIT.md` (the reality audit; every claim there is traced to a file, CI workflow, or production URL).
**Branch:** `arena/01a0adcf-beyu-os-1-0` (Arena session-pinned branch, branched from `main` @ `51f50b8`, the merged PR #65 state).
**One-line summary:** the EXISTING Health OS single-file SPA (`sectors/health`) is now mounted at `/health/os` inside the BEYU authenticated shell, behind the unchanged BEYU session + canonical federation-link gate (fail-closed); the placeholder "Coming Soon" card at `/health` is gone; no new OS, no new authorization model, no schema change, no RLS change, no CAP_POSTING change.

---

## A. Files changed

| File | Change | Why |
| --- | --- | --- |
| `src/app/health/page.tsx` | Authorized branch: information card ("Launch Health OS (Coming Soon)") replaced with `redirect("/health/os")`. Unauthenticated redirect + both denial branches (incl. "This availability state does not prove…" and `name={unavailable ? "health" : "security"}`) are **byte-identical** to before. | Replace ONLY the placeholder with the existing implementation (mission §VI). |
| `next.config.ts` | Added `async rewrites()`: when `HEALTH_API_URL` is set at build time, `/health-os/auth/:path*` → `${HEALTH_API_URL}/auth/:path*`. Without the env var the function returns `[]` (no rewrite; paths 404; SPA sign-in fails closed). | Smallest governed adapter for the SPA's existing `VITE_API_BASE_URL` knob (mission §XVII). Off by default; no BEYU route occupied; no browser-facing credentials. |
| `package.json` | `build` → `node scripts/build-health-spa.mjs && next build`; new `build:health-spa` alias. | Compile the existing sector SPA during the canonical root build (one repo → main → Vercel → `/health`, mission §XVIII). No CI change needed: the build-parity step runs the same script. |
| `eslint.config.mjs` | `globalIgnores` += `src/app/health/os/spa-content.ts` (generated data artifact, like `.next/**`; generated content is never committed). | Keep lint stable across build states. |
| `.env.example` | New OPTIONAL, commented-out `HEALTH_API_URL` section with truthful-state documentation (proxy target for the sector's own API; off by default; backend deployment human-controlled). | Operator documentation; CI's template secret-pattern check passes (no `PASSWORD|SECRET|TOKEN|KEY` patterns). |
| `sectors/health/INTEGRATION.md` | Added "Frontend mount in BEYU OS (done 2026-09-17)" section; refined the "Sector API exposure" bullet (same-origin proxy exists; BEYU-governed-API wrapping remains an architectural decision). | Keep the sector boundary contract truthful. |
| `docs/HEALTH_OS_FRONTEND_INTEGRATION_AUDIT.md` | NEW — the required audit (sections A–L). | Mission §XXIV. |
| `docs/HEALTH_OS_FRONTEND_INTEGRATION_REPORT.md` | NEW — this report. | Mission §XXIV. |

**No other files were modified.** Zero changes to: `src/lib/health-os-authorization.ts`, `src/lib/session.ts`, `src/lib/authz.ts`, `src/lib/operating-systems.ts`, RBAC/ABAC/MFA code, audit code, policy engine, Noelia/HIVE shared features, Foundation scope resolvers, CAP_POSTING registry, all drizzle migrations, all `src/app/api/**` routes.

## B. Files reused (existing implementations — nothing rebuilt)

- **The Health OS SPA itself:** `sectors/health/src/**` (React 19/Vite 7/Tailwind 4, `vite-plugin-singlefile`), built unchanged by its own lockfile/toolchain; its only source-level input from this integration is the documented build-time env `VITE_API_BASE_URL=/health-os` (already defined in `sectors/health/.env.example` and consumed by `sectors/health/src/services/auth.ts`).
- **BEYU gates:** `resolvePrincipal()` (`src/lib/session.ts`), `checkHealthOSAuthorization()` (`src/lib/health-os-authorization.ts`) — called by the new mount route exactly as the page calls them.
- **Launcher/nav:** `src/lib/operating-systems.ts` (`SECTOR_OPERATING_SYSTEMS`, HEALTH → `/health`), `src/app/launcher/page.tsx` — untouched; the launcher's Health card now leads to a real implementation.
- **Sector backend API surface** (`sectors/health/backend/src/modules/auth/**`, `auth/mfa`) — untouched; reachable only through the optional same-origin proxy when an operator configures `HEALTH_API_URL`.

## C. Routes exposed

| Route | Behaviour (verified live, §G/§J) |
| --- | --- |
| `/health` (existing, edited) | Unauthenticated → 307 `/`. Authenticated, no federation link → 200 truthful "Health OS access denied". Authenticated, link unavailable/unreadable → 200 truthful "authorization unavailable" (fail-closed). Authenticated + linked → 307 `/health/os`. |
| `/health/os` (NEW, `force-dynamic` GET) | Re-runs the identical two-gate check per request (deep link cannot bypass `/health`). Authorized → 200 `text/html; charset=utf-8`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, body = the compiled single-file SPA (measured 1,035,922 bytes, `<title>BEYU Health OS — Enterprise Healthcare Operating Platform</title>`). Any failure → 307 (`/` or `/health`). |
| `/health-os/auth/:path*` (NEW, conditional) | Only when `HEALTH_API_URL` is set at build time: proxied to the sector backend's `/auth/*`. Default (unset): 404 → SPA sign-in fails closed. |
| `/api/health`, `/api/health/live` | **Untouched** — still the BEYU liveness/readiness probes (verified: 200 `{"checks":{"database":"UP"}}` post-change). |

## D. APIs consumed

- **By the mounted SPA:** `POST /health-os/auth/login`, `POST /health-os/auth/refresh`, `POST /health-os/auth/restore`, `POST /health-os/auth/logout`, `GET /health-os/auth/me` — the SPA's complete, pre-existing network surface (`sectors/health/src/services/auth.ts` is the only file in the SPA with a network call; all other services are static reference data).
- **By the BEYU app at `/health`/`/health/os`:** the canonical `beyu_identity.beyu_identity_links` read (`checkHealthOSAuthorization`, unchanged) and the BEYU session tables (unchanged).
- **Not consumed/fabricated:** no `/api/v1/health/*` governed API was created; sector `/api/*`, `/fhir/R4`, `/reporting` surfaces are not proxied (the SPA does not call them); DHIS2 is **not** wired (it is not implemented in the sector code — config env vars only).

## E. Authorization preserved

- BEYU session gate, RBAC, ABAC (`tenantScopeIds`), MFA/step-up, clearance ceilings, emergency permissions: **untouched** (no source change; full root suite green).
- `/health/os` re-checks the full gate server-side per request (verified: unauthenticated deep link → 307 `/`; authenticated-unlinked deep link → 307 `/health`).
- No second authorization model: the sector's own JWT/MFA stack is the sector's pre-existing implementation, reached only after the BEYU gate; the BEYU session is NOT bridged into sector credentials (that integration remains the documented architectural decision in `sectors/health/INTEGRATION.md`).
- Noelia: unchanged — one canonical BEYU Noelia; sector AI still flows through `NoeliaAdapter` (fail-closed BLOCKED when HIVE unconfigured); the SPA's `AICoPilot` remains a deterministic canned demo with its truthful in-UI label (no generative provider claimed).
- Hidden-navigation reliance: none — the mount is a server-rendered route with server-side checks; the SPA is not reachable by any unauthenticated or unlinked identity (verified live).

## F. RLS preserved

- Zero DDL, zero migration, zero role change, zero GUC usage added. `drizzle/*.sql` untouched (CI's drift check and the 30 sector migrations re-verify in the PR pipeline).
- Sector RLS (001 tenant GUC policies; 003 `tenant_matches_boundary` country/entity fail-closed; 025/029–030 ophthalmology tenant-FK integrity) re-executed against real PostgreSQL 16 in the PR gate (`rls-isolation`, `isolation-boundaries`, `beyu-bridge`, `migration-consistency`, `auth-wiring`, `auth-context.middleware`, `audit-chain-integrity`, `outbound-audit-integrity` — local pre-PR run: **10 suites / 94 tests passed**).
- BEYU runtime role remains NOSUPERUSER NOBYPASSRLS; the live smoke test additionally demonstrated fail-closed behaviour when the BEYU runtime role could NOT read the link table (permission denied → "authorization unavailable", never a 500, never an open door).
- No service-role browser access, no unscoped queries, no client-side database credentials introduced (the only new client-visible value is the SPA's own build-time path prefix `/health-os`).

## G. Tests (all run in this environment, PG16 harness mirroring CI)

| Suite | Result |
| --- | --- |
| Root baseline (pre-change): typecheck, lint, migrate, seed, build, full vitest, secret scan | GREEN — 3515 passed / 190 skipped (176 files); scan clean (1785 files) |
| Root post-change: typecheck | GREEN (exit 0) |
| Root post-change: lint | GREEN (exit 0; 1 pre-existing warning in `src/components/noelia-cross-os-visual.tsx` from PR #65, unrelated) |
| Root post-change: full vitest (run 1) | 3521 passed / 1 failed / 190 skipped — the single failure was `tests/specialist/audit-intel.test.ts` (DB-state-dependent correlation assertion) |
| Root post-change: full vitest (run 2, full re-run) | **3522 passed / 190 skipped / 0 failed** (177 files) — confirms the run-1 failure was a pre-existing state-dependent flake, not a regression |
| New mount tests (`tests/frontend/health-spa-mount.test.ts`, 6 tests) | PASS (part of the 3522) |
| Health frontend (`sectors/health`): typecheck, vitest, build | GREEN — 14/14 tests; build 1,035.9 kB single file (unchanged source → identical to baseline) |
| Health backend: `tsc --noEmit` | GREEN (exit 0) |
| Health backend: real-PG16 security set (CI's exact spec list) | **10 suites / 94 tests passed** |
| Health backend: migrations 001–030 against real PG16 | 30/30 applied (idempotent runner) |
| Health backend: full PGlite suite | sandbox-constrained: 80 suites passed before the sandbox OOM-killed the long `--runInBand` run (RC 137); the single failure in that run (`app-boot.spec.ts` 5 s boot timeout) passes 3/3 in a standalone re-run — environmental, not a regression (no backend file was touched). The authoritative full-PGlite + real-PG layer executes in the CI `Health OS backend — real PostgreSQL gate` job of this PR. |
| Health backend: production build (`nest build`) | GREEN (exit 0) |
| E2E live smoke (`next start`, real DB, MFA login) | unauth `/health` → 307 `/`; unauth `/health/os` → 307 `/`; `/api/health` → 200 `database: UP`; authenticated+unlinked → denial page (truthful copy) + `/health/os` 307 `/health`; authenticated+linked → `/health` 307 `/health/os` → 200 real SPA (1,035,922 B, nosniff, no-store); `/health-os/auth/restore` (backend unconfigured) → 404 (fail-closed, truthful) |
| Secret scan (post-change) | CLEAN (1785 files) |

No test was weakened, deleted, or skipped by this change. One observed pre-existing flake (`tests/specialist/audit-intel.test.ts`) is documented, not fixed (it belongs to the specialist audit-intel state model, not to this integration; CI runs it on a fresh database).

## H. Build

- `npm run build` (post-change): GREEN — `scripts/build-health-spa.mjs` (sector `npm ci` + `vite build` with `VITE_API_BASE_URL=/health-os` → 1,009.3 kB document emitted to `src/app/health/os/spa-content.ts`) + Next.js 16.3.3 (Turbopack) production build, 123 static pages, `/health/os` compiled.
- **Deployment parity (no runtime secrets):** GREEN — identical to CI's step (env cleared, `.env` moved aside): SPA compile + Next build succeed with zero credentials.
- Artifact hygiene: the generated 1 MB module is **not committed** (checked-in state is the 1.8 kB truthful placeholder; ESLint ignores the path; the build script prints a do-not-commit reminder).
- Sector build outputs (`sectors/health/dist/`, `pgdata/`, `.next/`, `.env`) remain gitignored; the 21 `sectors/health/coverage/*.json` files rewritten by local backend test runs were **restored** (`git checkout`) — they are test side effects, not part of this change.

## I. Deployment

- Architecture: unchanged single project — GitHub `BEYU-OS-1.0` → `main` → Vercel → BEYU OS → `/health` → (authorized) `/health/os` → existing Health implementation. **No second Vercel project, no second deployment architecture** (mission §XVIII). `sectors/health/vercel.json` (standalone project config) remains in the tree but is not referenced by the root project.
- On merge to `main`, Vercel auto-deploys via the root build (the same script chain verified above, including the no-secrets parity path).
- `HEALTH_API_URL` is NOT set in the repository/CI/Vercel config today. Until an operator provisions a deployed sector backend and sets the variable, the mounted SPA's sign-in fails closed (404 on `/health-os/auth/*`) — the truthful "awaiting backend deployment" state. No connectivity is claimed.

## J. Production verification

**Pre-merge production observation (2026-09-17, unauthenticated):** `https://beyu-os-1-0.vercel.app/health` fails closed — it redirects unauthenticated visitors to the BEYU sign-in page (the existing placeholder gate behaviour), and `https://beyu-os-1-0.vercel.app/` serves the control-plane sign-in surface normally. This is the expected state before the mount ships.

**Post-merge production observation (2026-09-17 12:31–12:35 UTC, unauthenticated, after squash merge `8d2e3a2` at 12:30:43Z):**
- `GET /api/health` → **200 `{"ok":true,"system":"BEYU-OS/1.0.0","checks":{"database":"UP"},"latencyMs":844}`** — production database UP after the migration.
- `GET /health` → **307 redirect to `/` (sign-in)** — fails closed, unchanged from the pre-merge baseline.
- `GET /health/os` → **404** — expected at this moment: the Vercel production deployment of the merge (`dpl_3KeBNzcsrkFMW2BXZFtbvsBa4fvL`) was rejected at **T+15 s (no build ran)**, so production is still serving the pre-merge build, where the route does not exist. Once the Vercel-side issue (§K.1) is resolved and `main` redeploys, unauthenticated `/health/os` will behave as verified in the §G live smoke: 307 → `/`.
- `main` CI (run 35221528409): **7/7 jobs green**. `main` db-release pipeline (run 35221528352): all jobs green — "Production preflight (read-only)", "Production database deploy + verify" (migrations 001–030 applied to the production Supabase database, including the `beyu_identity` schema/tables + RLS policies; schema-fingerprint, RLS and role-constraint verification passed), "Three-way release record" (provenance), "Runtime verification (production /api/health)".
- **Vercel account-side failure (not a code defect):** the last successful Vercel deployment was 2026-09-16 22:16 UTC; afterwards BOTH PR preview deployments (heads `5cb19a1`, `c4691d9`) and the `main` production deployment were rejected within 11–16 s with no build logs, while the identical code builds green in CI (full build + no-secrets parity build). No Vercel credentials exist in this environment, so `npx vercel inspect dpl_3KeBNzcsrkFMW2BXZFtbvsBa4fvL --logs` cannot be run here — human-controlled (§K.1).

**Authenticated production verification requires human-controlled credentials** (mission §XXVIII) and cannot be claimed by this integration. The exact human checklist (all steps verified locally against the identical code path):

1. BEYU login (MFA) for an identity that has a `beyu_identity.beyu_identity_links` row in the production database.
2. Launcher shows Health OS as AUTHORISED; click through to `/health` → 307 → `/health/os`.
3. `/health/os` serves the Health SPA (single document, BEYU navy/gold identity, system-font fallback under the BEYU CSP).
4. With `HEALTH_API_URL` unconfigured: SPA sign-in fails closed with a connection error (expected truthful state).
5. With `HEALTH_API_URL` configured (after the sector backend is deployed): SPA sign-in reaches the sector `/auth` API; role is derived from the server-issued JWT (never client state).
6. Unlinked authenticated user → denial page ("Health OS access denied"); unavailable schema → availability page ("…does not prove…"); unauthenticated → redirect to sign-in.
7. Wrong tenant / wrong entity / wrong country: enforced by the sector's own RLS + `tenant_matches_boundary` (migrations 001/003/025/029–030) — unchanged; re-verified by the CI real-PG isolation specs in the PR run.
8. Audit: BEYU audit continues (root suite); sector `health.audit_log` chain continues (CI real-PG `audit-chain-integrity`).
9. Noelia remains governed (no code path added or changed).

## K. Remaining human-controlled items

1. **Resolve the Vercel account-side deployment failure and redeploy `main`.** On 2026-09-17, both PR preview deployments and the `main` production deployment were rejected within 11–16 s with no build logs, immediately after the last successful deployment (2026-09-16 22:16 UTC). The Vercel dashboard (project `beyu-os-1-0`) or `npx vercel inspect dpl_3KeBNzcsrkFMW2BXZFtbvsBa4fvL --logs` is required to read the failure. Until then, production serves the pre-merge build — fail-closed, no regression (§J).
2. **Confirm the production runtime grant on the link table.** The `beyu_identity` schema/tables + RLS policies were provisioned in production by the merge-time db-release pipeline (migrations 001–030, run 35221528352, schema-fingerprint/RLS/role-constraint verification green). The pipeline's role provisioning (`scripts/setup-db-role.ts`) does not grant the BEYU runtime role `SELECT` on `beyu_identity.beyu_identity_links`; until a DBA confirms that grant (`USAGE` on the schema + `SELECT` on the table), the gate correctly fails closed (demonstrated locally: permission denied → "authorization unavailable", never a 500, never an open door).
3. **Populate canonical federation links** for production identities (set-once `linkTenant`/link flow — sector `beyu-bridge.ts`).
4. **Deploy the sector NestJS backend** (database role `beyu_health_runtime`, JWT secrets) and set `HEALTH_API_URL` in the Vercel project; only then does the SPA's sign-in reach the sector auth API.
5. **Integration credentials** (all human-controlled, none requested or printed by this integration): NHIF, TMDA, TRA, PACS/DICOM, MTUHA, FHIR endpoint, HIVE/Noelia endpoint + token; **DHIS2 requires an implementation decision first** (currently env vars only).
6. **Runtime auth-flow bridging** (BEYU-asserted identity into the sector session — single sign-on): architectural decision recorded in `sectors/health/INTEGRATION.md`; deliberately not implemented here.
7. Production clinical data provisioning and vendor activations.
