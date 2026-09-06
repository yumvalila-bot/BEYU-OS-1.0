# NEW REPOSITORY BASELINE (`BEYU-OS-`, measured)

Date: 2026-09-05
Commit: `b9c94d4f8ce7c3466cc3c27242eaa6a1650f0b72`
Clone location used for audit: `/tmp/BEYU-OS-src`

---

## 1. Environment

| Component | Value |
|---|---|
| Node | v22.22.3 |
| pnpm | 9.12.3 (repo declares `packageManager: pnpm@9.12.3`) |
| Turbo | 2.10.9 |
| NestJS (services) | 11.x |
| Next.js | 14.2.15 (`beyu-web`) and 16.3.0 (`beyu-health-web`) |
| React | 18.3.1 |
| Database | raw SQL migrations + Prisma (`beyu-health-api`) + optional `@electric-sql/pglite` / `pg` |
| CI/CD | none in repo |
| Flutter | source has only `pubspec.yaml`; SDK unavailable in sandbox |

---

## 2. Commands and results

### 2.1 Install

```bash
cd /tmp/BEYU-OS-src
pnpm install --no-frozen-lockfile
```
Result: lockfile resolved, 394 packages. **Prisma client engine postinstall failed** (`binaries.prisma.sh` network unreachable). Install completed.

### 2.2 Typecheck

```bash
pnpm typecheck
```
Result: **PASS** — 17/17 tasks (packages + both services + both Next apps).

### 2.3 Lint

```bash
pnpm lint
```
Result: **FAIL** — `298 problems (69 errors, 229 warnings)`. Errors mostly in `services/beyu-health-api`:
- `@typescript-eslint/no-unused-vars` (e.g. `reporting.controller.ts`, `telemedicine.controller.ts`, `workforce.controller.ts`)
- `@typescript-eslint/consistent-type-imports`
- `no-case-declarations`
- many `@typescript-eslint/no-explicit-any` warnings across repository/service layers

### 2.4 Build

```bash
pnpm build
```
Result: **PASS** — 11/11 tasks. Both Next apps and both NestJS services compiled; route inventories emitted for `beyu-web` (26 routes) and `beyu-health-web` (22 routes).

### 2.5 Test

```bash
pnpm test
pnpm exec turbo run test --force
```
Result: **PASS** — 14/14 tasks; **299 tests pass / 0 fail / 0 skipped**.

Per-package test counts:

| package | tests |
|---|---|
| `@beyu/config` | 18 |
| `@beyu/types` | 30 |
| `@beyu/events` | 18 |
| `@beyu/auth` | 43 |
| `@beyu/security` | 34 |
| `@beyu/health-api` | **7** |
| `@beyu/api` | 149 |
| `@beyu/health-types` | **0** |
| `@beyu/health-api-client` | **0** |
| `@beyu/web`, `@beyu/health-web` | **0** |
| Total | **299** |

---

## 3. Actual implemented capability status (measured)

| Capability | Source status (measured) | Evidence |
|---|---|---|
| Monorepo boundaries (`apps/services/packages`) | **IMPLEMENTED** | pnpm workspace + turbo + package boundaries |
| Shared type packages (`types`, `health-types`) | **IMPLEMENTED** | source present, builds |
| Shared security package | **IMPLEMENTED** (34 tests) | `packages/security` |
| Shared events package | **IMPLEMENTED** (18 tests) | `packages/events` |
| Auth/ABAC policy engine | **IMPLEMENTED** (43 tests) | `packages/auth` |
| Control-plane API (`beyu-api`) | **IMPLEMENTED** (149 tests) | NestJS + migrations |
| Control-plane web | **PARTIAL** | 26 routes, 0 tests |
| Operator console | **PARTIAL/SCAFFOLD** | static `index.html` + `server.mjs`, no package.json |
| Health API | **IMPLEMENTED code / weak test evidence** | 28 modules, 11 migrations, **7 tests** |
| Health web | **IMPLEMENTED code / 0 tests** | 22 routes, builds |
| Health mobile | **SCAFFOLD** | only `pubspec.yaml` + README |
| Flutter/general mobile | **MISSING** | no Dart source |
| Finance OS | **MISSING** | no finance module in source |
| CAP_POSTING | **MISSING** | not present |
| Family Office | **MISSING** | not present |
| Governance/Constitution | **PARTIAL** | organizations/os-registry/waterfall/noelia module only; no mature constitution/family/reserved-matters engine |
| Audit chain | **IMPLEMENTED in control plane** | `beyu-api` audit tests; source health audit has app-layer chain + trigger but minimal tests |
| Interoperability (FHIR/HL7/DICOM) | **PARTIAL** | health-types/docs mention; no FHIR/HL7/DICOM parser modules in `beyu-health-api` (only integration configs) |
| MTUHA / Tanzania regulatory pack | **PARTIAL** | reports/compliance modules; docs claim; no tests |
| Dialysis | **MISSING** | not a module in source health-api |
| CI/CD | **MISSING** | no `.github/workflows` |
| Deployment infra | **PARTIAL** | Docker/K8s/Terraform/Supabase/Vercel configs exist; no real env/secrets |
| Observability | **PARTIAL** | structured/log/health endpoints; no real monitoring/alerting |

---

## 4. Source vs destination — direct comparison

| Dimension | Source `b9c94d4` | Destination `6c2ec26` | Winner (evidence) |
|---|---|---|---|
| Physical package boundaries | **Strong** | root + sectors | Source (adopt pattern) |
| Shared package contracts | **Strong** | absent | Source (adopt selectively) |
| Root control-plane tests | 149 | 1109 (non-DB pass) | Destination |
| Finance / CAP_POSTING | missing | mature, tested | Destination |
| Family Office | missing | mature, tested | Destination |
| Governance / constitution | partial | mature | Destination |
| Health OS tests | 7 | 488 | Destination |
| Health OS migrations | 11 | 24 | Destination |
| Health interoperability/regulatory depth | partial | FHIR/HL7v2/DICOM/MTUHA/dialysis | Destination |
| Flutter | scaffold | real client | Destination |
| CI/CD + DB-backed security gate | missing | present | Destination |
| Lint | 69 errors | 0 root errors | Destination |
| Production env/secrets | none | none | neither (BLOCKED) |

---

## 5. New-repository baseline verdict

The source repository is **architecturally well partitioned** and provides **reusable shared packages** and a **clean NestJS control-plane runtime**. It is **not** a drop-in replacement for the destination: it lacks Finance OS, CAP_POSTING, Family Office, mature governance, the deep/verified Health OS, the real Flutter client, and CI/CD.

Migration decision for each source capability is recorded in `BEYU_OS_2_0_CAPABILITY_MATRIX.md`.
