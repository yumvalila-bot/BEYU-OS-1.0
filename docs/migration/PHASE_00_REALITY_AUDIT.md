# PHASE 00 — REPOSITORY REALITY AUDIT

Date: 2026-09-05
Package versions and repository state were captured by running the actual toolchains in this sandbox. Every number below was measured, not quoted from prior reports.

Re-producible evidence command:

```bash
node scripts/migration/capture-reality.mjs --json
```

---

## 1. Repositories audited

| Field | SOURCE | DESTINATION / CANONICAL |
|---|---|---|
| URL | `https://github.com/yumvalila-bot/BEYU-OS-` | `https://github.com/yumvalila-bot/BEYU-OS-1.0` |
| Remote HEAD SHA | `b9c94d4f8ce7c3466cc3c27242eaa6a1650f0b72` | `6c2ec2663c4f704fd6ca4054d0f9ddedb8fb3878` |
| Branches available | `main`, `Feature/health-os` (origin) | `main`, `arena/01a072db-beyu-os-1-0` |
| Working tree at audit | clean at clone time | clean at baseline capture time (later modified only by this migration evidence work) |
| Package manager | **pnpm** 9.12.3 (`pnpm-workspace.yaml`, `pnpm-lock.yaml`) | **npm** 10.9.8 (`package-lock.json`) |
| Node given | v22.22.3 (repo requires >=20.11.0) | v22.22.3 |

Both repos are single-typechecked monorepos in their own way:

- Source = pnpm workspaces + Turborepo (`apps/`, `services/`, `packages/`).
- Destination = single Next.js project at root plus self-contained sector packages under `sectors/health/` and `mobile/flutter/`.

---

## 2. SOURCE repository (`BEYU-OS-`, SHA `b9c94d4`)

### 2.1 Layered repositories

| Directory | Purpose | Evidence |
|---|---|---|
| `apps/beyu-web/` | Control-plane web app (Next.js 14.2.15, React 18.3.1) | `package.json`; 26 routes; pages mostly read-only dashboards; roughly 32 KB of page source |
| `apps/beyu-health-web/` | Health OS web app (Next.js 16.3.0, React 18.3.1) | `package.json`; 22 routes incl. patients/ophthalmology/laboratory/pharmacy/radiology/telemedicine/ambulance |
| `apps/beyu-console/` | Static operator console (`index.html`, `server.mjs`) | no package.json; minimal |
| `apps/beyu-health-mobile/` | Flutter scaffold | **only** `pubspec.yaml` + `README.md`; no Dart source |
| `services/beyu-api/` | NestJS 11 control-plane API | 9 SQL migrations; modules auth, organizations, os-registry, waterfall, noelia, audit, health; NestJS common core |
| `services/beyu-health-api/` | NestJS 11 Health API | 11 SQL migrations + `prisma/schema.prisma`; 28 module directories; Supabase integration |
| `packages/` | shared `types`, `config`, `events`, `auth`, `security`, `health-types`, `health-api-client` | compiled TS packages with `tsconfig` + `build` |
| `infra/` | Docker, Kubernetes, Terraform, Supabase, Vercel for health | health-api.Dockerfile, health-web.Dockerfile, K8s deployment, Terraform, `project-identity.json`, Vercel project file |
| `docs/` | architecture/status/test/federation | claims only — see §2.5 |
| CI | **none** (no `.github/workflows`) | filesystem check |

### 2.2 Source toolchain and commands measured

| Command | Result |
|---|---|
| `pnpm install` | OK; **Prisma client engine download failed** (`binaries.prisma.sh` unreachable). Install still completed because Prisma engine is a postinstall that does not fail the lockfile resolution. |
| `pnpm typecheck` | **PASS** — 17/17 tasks |
| `pnpm lint` | **FAIL** — `298 problems (69 errors, 229 warnings)`; errors concentrated in `services/beyu-health-api/` (`no-unused-vars`, `no-case-declarations`, `consistent-type-imports`) |
| `pnpm build` | **PASS** — 11/11 tasks (both Next apps, both NestJS services, shared packages) |
| `pnpm test` | **PASS** — 14/14 tasks; **299 tests pass / 0 fail / 0 skipped** |

Per-package source test counts (from `pnpm exec turbo run test --force`):

| Package | tests |
|---|---|
| `packages/config` | 18 |
| `packages/types` | 30 |
| `packages/events` | 18 |
| `packages/auth` | 43 |
| `packages/security` | 34 |
| `services/beyu-health-api` | **7** |
| `services/beyu-api` | 149 |
| `packages/health-types` | **0** |
| `health-api-client`, `beyu-web`, `beyu-health-web`, `beyu-console` | **0** |
| **total** | **299** |

### 2.3 Source implementation depth — what is real vs claimed

- **Health API**: 28 module directories and 11 migrations exist. It compiles and builds. But only **7 tests** exist (`test/connection-target.test.ts`). The domain logic (lab, pharmacy, radiology, ophthalmology, ambulance, telemedicine, billing, insurance, etc.) is **not covered by the source's own test suite**. Source docs explicitly call Health OS testing "PARTIALLY IMPLEMENTED" — yet the source `README` later claims "Complete Healthcare Operating System". The code exists; the **verification does not**.
- **Control-plane API (`beyu-api`)**: 149 tests. This is the strongest verified part of the source repository. It covers auth, organization, os-registry, waterfall, noelia, audit, http-layer and concurrency.
- **Web apps**: build and render, but have **zero tests**.
- **Flutter mobile**: only a `pubspec.yaml`; no Dart.
- **CI/CD**: no GitHub Actions, no commits-scan, no database-backed gate.

### 2.4 Source docs claims vs measured reality

| Claim | Measured reality |
|---|---|
| "292 automated tests pass" (`docs/IMPLEMENTATION_STATUS.md`) | Actual current run = **299 tests** across 7 packages. The count is stale (292 != 299), not currently reproducible from the document. |
| "27 NestJS modules" for Health OS | **28 module directories** measured. Minor stale count. |
| "10 migrations" for Health OS | **11 SQL migrations** measured. Minor stale count. |
| "Mobile/Tablet/Desktop — SCAFFOLDED" | True — only `pubspec.yaml`. |
| "HIVE service — DEFERRED" | True — no HIVE service; `packages/auth` `ai-governance` is a policy layer, not a runtime. |
| "Production Readiness — IMPLEMENTED" | **Not supported by evidence in this repo**: no production secrets, no real provider, no CI/CD, no mobile build, only partial infra config. |

### 2.5 Source strengths (candidates to preserve/adopt)

1. **Monorepo package boundaries** (`apps/services/packages`) — genuinely better physical separation.
2. **Shared type/contract packages** (`packages/types`, `packages/health-types`, `packages/health-api-client`) — reusable, typed, compiled.
3. **Shared security package** (`packages/security`) — audit-chain, crypto, tokens; 34 tests.
4. **Shared events package** (`packages/events`) — 18 tests.
5. **Shared auth/ABAC policy engine** (`packages/auth`) — 43 tests.
6. **Control-plane API runtime** (NestJS) with 149 tests — an alternative control-plane runtime, but it is a **duplicate** of destination control-plane capabilities, not a superset.

### 2.6 Source weaknesses

- No CI/CD at all.
- Health OS testing is extremely thin (7 tests for 28 modules).
- Mobile is a scaffold.
- No production-grade secrets/credentials/env.
- Lint fails (69 errors).
- Prisma engine cannot be downloaded in this sandbox (network access to Prisma binaries blocked) — matters for reproducible Health-API DB bootstrap.
- The source's Health OS, despite its architecture, is not independently demonstrated to preserve the destination's interoperability/regulatory depth (FHIR, HL7v2, DICOM, MTUHA, dialysis, incidents, terminology, consent).

---

## 3. DESTINATION repository (`BEYU-OS-1.0`, SHA `6c2ec26`)

### 3.1 Layered repositories

| Directory | Purpose | Evidence |
|---|---|---|
| `src/` (root Next.js app) | BEYU OS control plane UI + API routes (`/api/v1/...`) and domain engines | 100+ source files under `src/lib` |
| `drizzle/` | Canonical root PostgreSQL schema/migrations (0000–0022) | 23 SQL migrations + snapshots + journal |
| `tests/` | Root regression suite | **111 test files** |
| `sectors/health/` | **Mature Health OS sector** (Vite/React frontend + NestJS/TypeORM backend) | 24 backend SQL migrations, 90 backend spec files, 3 frontend test files |
| `mobile/flutter/` | **Real Flutter client** | Dart source: main, auth, MFA, router, launcher, os-shell, api-client, secure-storage |
| `scripts/` | verify/evidence/migrate helpers | present |
| `.github/workflows/ci.yml`, `db-release.yml` | **CI/CD with real PostgreSQL service containers + committed-secret scans** | present |
| `.env.example` | documented credential model (runtime vs admin vs test role) | present |
| `docs/` | large documentation tree | present |
| `infra/` | **No top-level infra directory** | only `sectors/health/backend/Dockerfile` + `docker-compose.yml` and `sectors/health/vercel.json` |

### 3.2 Destination toolchain and commands measured

Environment: Node v22.22.3, npm 10.9.8, PostgreSQL **not installed** (apt-debian mirrors unreachable), Flutter SDK **not installed**.

| Command | Result |
|---|---|
| `npm install` (root) | OK (442 packages) |
| `npm run typecheck` | **PASS** (0 errors) |
| `npm run lint` | **PASS** (0 errors) |
| `npm run build` | **PASS** (Next 16.3.3; full route inventory emitted) |
| `npm test` (root, no DATABASE_URL) | **1109 passed / 450 failed / 816 skipped** in 111 files (41 files passed, 58 files failed, 12 skipped). Failures are DB-backed suites that require `DATABASE_URL`. |
| `sectors/health/backend npm install` | OK (927 packages) |
| `sectors/health/backend npm run build` | **PASS** |
| `sectors/health/backend npm test` | **PASS** — 88 suites passed / 2 skipped; **488 passed / 15 skipped** (503 total) |
| `sectors/health npm install` | OK (128 packages) |
| `sectors/health npm run typecheck` | **PASS** |
| `sectors/health npm test` | **PASS** — 3 files / **14 tests** |
| Flutter | unavailable — build **BLOCKED**, static analysis only |

### 3.3 Destination domain depth

- **Root control plane**: identity graph, RBAC/ABAC, MFA, sessions, audit hash chain, governance voting/resolutions/decisions, reserved matters, family office (lineage/eligibility/capital/loan/constitution/decision-gate), Finance OS (posting engine, ledger integrity, immutability, double entry, waterfall, reconciliation, intercompany, FX, tax, forecasting), HCM, Noelia/HIVE governance, interoperability envelope (service principals, events, outbox receipts), specialist engines.
- **Health OS (sector)**: 24 migrations; modules include `pharmacy`, `laboratory`, `radiology`, `ophthalmology`, `dialysis`, `fhir`, `interop` (HL7v2, DICOM), `compliance`, `mtuha`, `incidents`, `terminology`, `search`, `consent`, `telehealth`, `ambulance`, `records`, `events`, `reporting`, `ai`, `billing`, `appointments`, `encounters`, `notifications`, `tenants`, `identity`, `auth`.
- **Mobile (Flutter)**: real Dart client for auth, MFA, launcher, OS shell, secure storage, API client.
- **CI/CD**: real PostgreSQL-backed gates for root and Health OS, committed-secret scans, production dependency audit.

### 3.4 Destination weaknesses / risks

- Root DB-backed suites cannot run without a real PostgreSQL. In this sandbox `apt`/deb.debian.org and Prisma binaries are unreachable, so we could **not** provision PostgreSQL; DB-backed root tests (RLS, ledger immutability, CAP_POSTING, audit concurrency, Entity/Country/OS isolation) remain **BLOCKED** here.
- `sectors/health/backend` has documented pre-existing lint debt (2800+ findings: mostly Prettier formatting, some unused-vars/require/const). The CI deliberately runs lint and **fails** on it; it is a known P1/P2 debt, not a security violation.
- Flutter SDK unavailable — mobile build can be statically verified only.
- No `.env` with real secrets; production readiness requires real credentials.
- `sectors/health/backend` uses Apollo Server v4 (EOL Jan 2026), `uuid@9`, `eslint@8` — a maintenance backlog.
- The root control plane and the sector health framework are **physically separate**; there is no shared package layer (`packages/shared`, `packages/health-types`, `packages/events`) yet — that is the architectural gap the migration should close.

### 3.5 Destination API surface (root, measured from build)

Control-plane routes present in the build output: `/api/v1/auth/*`, `/api/v1/authorization/context`, `/api/v1/finance/*`, `/api/v1/governance/*`, `/api/v1/hcm/*`, `/api/v1/internal/*`, `/api/v1/ai/noelia/*`, `/api/v1/system/self-test`, `/health`, plus app routes `/os/*`, `/launcher`, etc.

---

## 4. Duplication / overlap

| Capability | Source | Destination | Risk |
|---|---|---|---|
| Control plane auth/identity | `services/beyu-api` (NestJS) | root Next.js API routes + `src/lib/identity.ts` | Duplicate runtimes; both cannot be canonical simultaneously |
| Governance/capital | source has `waterfall.engine.ts`, `organizations`, `os-registry` | destination has full governance + family office + capital + risk + compliance | Destination is a superset; source does **not** replace it |
| Finance/ledger | source has no finance module | destination has Finance OS + CAP_POSTING | Source does **not** implement finance; must not overwrite |
| Health OS | source `beyu-health-api` (28 modules, 7 tests, 11 migrations) | destination `sectors/health/backend` (28+ modules, 488 tests, 24 migrations, FHIR/HL7v2/DICOM/MTUHA/dialysis) | Destination is the stronger verified Health OS |
| Flutter | source: only pubspec | destination: real Dart client | Destination is the stronger verified mobile client |
| Events/federation | source `packages/events` | destination `internal events/receipts`, `interoperability`, `src/lib/interoperability` | Source has richer shared package; destination has runtime integration |
| AI/HIVE | source has `ai-governance` + noelia module + health AI, but model provider is stubbed | destination has Noelia governance boundary, workflows, scheduler, enterprise-memory, model-gateway, AI audit, and a stubbed/absent provider | Neither fully verified end-to-end with a real provider |

---

## 5. Critical environment blockers (measured)

1. **PostgreSQL unavailable** in this sandbox (no `psql`, no server binaries, `apt` reach was blocked). Destination root DB-backed suites and source/destination real-DB Health security suites cannot be executed here.
2. **Flutter SDK unavailable** — no `flutter` binary. Mobile builds cannot be produced.
3. **Prisma engine download blocked** from `binaries.prisma.sh` — source Health-API Prisma path is not fully reproducible here.
4. **No production secrets/env** in either repo (only `.env.example` templates). Any production/deployment claim is BLOCKED.
5. **No real AI provider** in either repo. Noelia/HIVE end-to-end can only be verified against a stubbed/absent provider.

---

## 6. Phase 0 conclusion

- Destination `BEYU-OS-1.0` is the **stronger, more mature and more heavily verified** repository overall (governance, finance, CAP_POSTING, family office, Health OS, mobile, audit, CI, RLS migrations).
- Source `BEYU-OS-` is the **better physically organized monorepo** and offers **shareable package/contracts** and a clean NestJS control-plane runtime, but its Health OS is far less tested and its mobile UI is a scaffold.
- The migration must therefore be **KEEP_1_0** for all mature destination subsystems, with **selective/vetted adoption** of source shared-package boundaries and contracts — never blind replacement.

Auto-stop conditions met: DB-backed finance/ledger/RLS/CAP_POSTING and Flutter build cannot be verified in this sandbox → the migration program is **BLOCKED at boundary/contract stage**, not certified.
