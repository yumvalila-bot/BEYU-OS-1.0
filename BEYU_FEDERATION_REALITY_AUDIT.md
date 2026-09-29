# BEYU FEDERATION & TRUST — REALITY AUDIT (Phase 0)

**Program:** BEYU OS 1.0 — X10THINK Federation, Trust, Interoperability & Jurisdiction Engine
**Audit date:** 2026-09-28 (UTC)
**Auditor position:** autonomous implementation session; every claim below traces to a file, test, or command run in this session — not to prior reports.
**Mode:** audit + implementation. Reality established before a single line of federation code was written.

---

## 1. Repository identity (recorded, not assumed)

| Command | Result |
|---|---|
| `git rev-parse --show-toplevel` | `/home/user/BEYU-OS-1.0` |
| `git rev-parse HEAD` | `cd52cc6298da35edd42dcc80e99b278f9c3115d7` |
| `git branch --show-current` | `arena/01a0e972-beyu-os-1-0` |
| `origin/HEAD` | `origin/main` → same commit (branch created from `main` @ `cd52cc6`) |
| `git status --short` | clean at session start |
| Last merged PR at HEAD | `Merge pull request #92 from yumvalila-bot/arena/01a0e6e7-beyu-os-1-0` |

## 2. Technology stack (verified in `package.json`, `drizzle.config.ts`)

- **Next.js 16** (App Router) + React 19 + Tailwind 4.
- **Drizzle ORM 0.45** over **PostgreSQL 16** (canonical CI and local engines both pinned to PG16).
- **ONE canonical database.** Arena/CI/Production each run the same schema against their own PostgreSQL. Supabase hosts production PostgreSQL; it is not a second database (`.github/workflows/ci.yml` header, `docs/ci/README.md`).
- **Two DB roles:** migration/admin (superuser, `BEYU_ADMIN_DATABASE_URL`) and `beyu_runtime` (NOSUPERUSER, NOBYPASSRLS — RLS subject). Migrations apply ONLY through `scripts/migrate.ts` (checksummed `beyu_migrations` ledger; `drizzle-kit push` forbidden against non-dev).
- **Test:** vitest (root) + Playwright (browser); CI = `.github/workflows/ci.yml` (ephemeral PG16 service, real RLS tests) + Health OS jobs.

## 3. Migration state (authoritative)

- `drizzle/` carries **71 migrations**, `0000_kernel_v1_baseline` … **`0070_ujenzi_service_principal`** (last journal entry, verified in `drizzle/meta/_journal.json`).
- **Next migration number is `0071`.** Nothing higher exists; no conflicts possible for a new additive migration at that number.
- Migration conventions (observed in 0036, 0048, 0062–0070):
  - `--> statement-breakpoint` separators; value-integrity `CHECK` constraints on every status column (closed catalogues); evidence-gated states (e.g. 0036: `UAT_VERIFIED`/`PRODUCTION_READY`/`LIVE` require recorded evidence; `PRODUCTION_READY`/`LIVE` require named `enabled_by` + `approval_reference`); `ACCEPTED` submission requires the government system's own `external_reference`.
  - RLS: `ENABLE` + `FORCE ROW LEVEL SECURITY`, tenant scope via `beyu_tenant_ids()` / `beyu_global_scope()` (SQL functions created in `0001_kernel_gate1_hardening`), classification via `current_setting('beyu.governance_classifications')` where applicable, plus `AS RESTRICTIVE` policies that bind future roles, then a `DO $$` verification block that **fails the migration if RLS is missing** (0036 pattern), and role grants conditioned on `beyu_runtime` existing.
  - Registry reference-data tables (e.g. `government_agencies`, `payment_providers`) are **runtime-immutable**: runtime role holds `SELECT` only; writes arrive exclusively through the governed admin path.

## 4. Existing federation / government-integration work (MUST be extended, not duplicated)

This is the single most important reality finding: **BEYU already has a governed government-integration fabric.** It is the existing primitive that Federation & Trust must build on, not a duplicate of it.

| Artifact | Location | What it is |
|---|---|---|
| `government_agencies` table | `drizzle/0036_government_integration_fabric.sql`, `src/db/schema/government.ts` | Canonical registry of government systems BEYU may speak to. Columns record SEPARATE verified facts: `integration_status` (14-state closed catalogue incl. `NOT_STARTED…LIVE`, `EXTERNAL_BLOCKED`, `SUSPENDED`), `interface_kind`, `auth_model`, `credential_status`, `sandbox/uat/production_evidence`, `blocked_reason`, `enabled_by` + `approval_reference` (human activation gate). Global reference data, runtime `SELECT`-only, FORCE RLS. |
| `government_submissions` table | same | Tenant + legal-entity-scoped governed outbound operations (fiscal receipts, claims, verifications, reports). FAIL-CLOSED: cannot be `ACCEPTED` without `external_reference` + `response_digest` (CHECK). Stores digests + storage refs, never raw government data. Tenant/entity RLS; no DELETE grant. |
| Gateway engine | `src/lib/government/` (`createDefaultGovernmentGateway()`, adapter self-reports, policy/idempotency/fail-closed states) | The ONE boundary through which sector systems reach government systems. |
| API | `src/app/api/v1/government/agencies/route.ts`, `.../submissions/route.ts` | `guarded()` with `government:integration.read` / `government:submission.manage`, audit, rate limits. |
| UI | `src/app/os/government-integrations/page.tsx` | "Shared capability · Government Integration Fabric" — registry + submissions, no invented "integrated" boolean. |
| Tests | `tests/government/` (`architecture-boundary.test.ts`, `gateway.test.ts`, `security-adversarial.test.ts`) | Boundary + pipeline + adversarial security suites. |
| Seeded agencies | `src/db/seed.ts` (~line 1640) | **11 honest rows:** `TRA_VFD` (EXTERNAL_BLOCKED — TRA certificate not issued), `NHIF` (EXTERNAL_BLOCKED — per-facility credentials not issued), `DHIS2` (EXTERNAL_BLOCKED — MoH authorization not issued), `NIDA` (CONTRACT_PENDING — signed agreement required, GovESB), `BRELA`, `TMDA`, `NSSF`, `WCF`, `OSHA`, `PSSSF` (PORTAL_ONLY, CONTRACT_PENDING), `MOCK_GOV_SANDBOX` (SANDBOX_READY — pipeline-proving mock). |

**Existing Tanzanian authority records: exactly the 11 above. No other jurisdiction profiles, no authority inventory beyond these, no jurisdiction engine, no cost model, no evidence registry, no reconciliation, no capability negotiation, no jurisdiction transitions.** That is the gap this program fills.

## 5. Canonical architecture to preserve (verified in code)

- **Identity & Access:** `src/db/schema/identity.ts` — parties, users, sessions, roles, permissions, role_permissions. **GlobalUserID is canonical** (identity module doc header). No duplicate identity system exists or will be created.
- **Organization/tenancy:** `tenants`, `legal_entities`, ownership register in `src/db/schema/core.ts`; `countries` table (TZ seeded). Tenant isolation everywhere via `beyu_tenant_ids()`.
- **RBAC/ABAC:** `src/lib/authz.ts` (`can(principal, permission, context)`), `src/lib/guard.ts` (server-component guard with classification context + Foundation deep-link re-check), `src/lib/api.ts` (`guarded()` — every API: session, permission, classification, rate limit, audit). Permissions are a **typed catalogue in `src/lib/constants.ts` (`PERMISSIONS`, `ROLES`, `HIGH_RISK_PERMISSIONS`)** and seeded into `permissions`/`roles`/`role_permissions` by `seed.ts`. High-risk permissions require MFA step-up (`security.step_up_mfa` feature flag).
- **RLS as final boundary:** every sensitive table `FORCE ROW LEVEL SECURITY`; tenant + entity + classification scoping; restrictive policies bind future roles; migration verification blocks fail closed (0036/0048/0069 patterns).
- **Audit/events:** hash-chained append-only `audit_log` (`src/db/schema/platform.ts`, `ADR4` in seed) + `enterprise_events`; actor types HUMAN | SERVICE | AI; Noelia outputs land in `ai_decisions` / `noelia_action_requests`. Federation events MUST reuse these, never create a second event system.
- **Classification ceilings:** `Classification` in `src/lib/constants.ts` (seed uses CONFIDENTIAL / RESTRICTED / HIGHLY_RESTRICTED on data assets); `classificationsAtOrBelow(principal.clearance)` gates reads.
- **Noelia/HIVE:** one AI identity `NOELIA` (agent default in `ai_decisions`), migrations 0014–0027 (governance boundary, intelligence expansion, scheduler, model runtime/lifecycle, compliance), `docs/noelia/`. Noelia **recommends; humans approve** (`ai_decisions.human_review_required`, `noelia_action_requests`). Federation monitoring by Noelia must respect this boundary (see `docs/` Noelia conformance notes).
- **ID system:** `src/lib/ids.ts` — prefixed Crockford-base32 immutable IDs (`fixedId` for seed reproducibility); new domains add prefixes here. **No conflicting identifier architecture.**
- **Sector OS catalogue:** OS registry seeded (`FINANCE_OS`, `HEALTH_OS`, `AGRICULTURE_OS`, `UJENZI_OS`, foundation as governed surface); Family Office and HCM are **shared capabilities** (ADR2), never OSes. Federation is likewise a shared capability — no Federation OS.
- **CAP_POSTING:** remains LOCKED and fail-closed (`tests/`, finance module). Federation MUST NOT unlock journal posting; nothing in this program touches the ledger writer path.
- **Deployment:** Vercel production (`beyu-os-1-0.vercel.app`) per repo docs; `scripts/deploy.sh`; TLS preflight; SBOM; secret scan (`scripts/scan-secrets.mjs`). `.env.example` holds placeholders only — **no secrets in source, migrations or fixtures** (verified: 0036 stores env-var NAMES only).

## 6. What is MISSING (the actual build list)

1. **Jurisdiction engine** — no jurisdiction profiles exist (only `countries` rows). Tanzania is treated ad hoc.
2. **Comprehensive authority registry** — 11 agency rows ≠ Tanzania federation inventory (directory baseline: 325 MDA entries + 26 regions + 126 LGAs, per the X10THINK program baseline; the live official directory could not be fetched from this environment — see §9).
3. **Domain taxonomy** — no canonical sector/domain taxonomy for federation.
4. **Service / dataset / schema registries** — no per-authority service registry (today authority-level status is the only status), no dataset registry, no schema versioning.
5. **Cost/access classification** — no `access_cost_status` model; risk of "public website ⇒ FREE" conflation if not built explicitly.
6. **Evidence & provenance registry** — evidence strings exist on `government_agencies`; no structured, typed, expiring evidence registry.
7. **Verification levels** — no REGISTERED/VERIFIED/SANDBOX/LIVE/LIVE_VERIFIED ladder with who/when/what/test/result artifacts.
8. **Legal basis / consent / agreement engines** — none exist as federation structures (legal obligations exist in compliance domain, but not federation-scoped bases/consents/agreements).
9. **Capability negotiation & jurisdiction transition** — none exist.
10. **Data residency controls** — none exist.
11. **Reconciliation & coverage audit** — none exist; no repeatable directory reconciliation.
12. **Federation UI** — no `/os/federation` (only `/os/government-integrations`, which remains the submission-plane surface).
13. **Federation RBAC permissions** — only `government:integration.read` / `government:submission.manage` exist.

## 7. Duplicate-concept risk register (checked, not assumed)

| Concept | Existing canonical home | Action |
|---|---|---|
| Agency/authority registry | `government_agencies` (0036) | EXTEND: cross-link from new `federation_authorities.legacy_agency_code`; no second registry. The two serve different planes (trust/discovery plane vs outbound submission plane) and are linked, not duplicated. |
| Outbound government operations | `government_submissions` + `src/lib/government/` | REUSE unchanged. Federation connectors route through the existing gateway for actual traffic. |
| Identity | `identity.ts` (GlobalUserID) | REUSE. External identity links remain external identifiers; no BEYU identity is created from them. |
| Tenants/entities | `core.ts` | REUSE. All tenant-scoped federation tables FK `tenants.id` / `legal_entities.id`. |
| Events/audit | `audit_log` + `enterprise_events` | REUSE. Federation event names are new *values* in the existing ledger, not a new table family. |
| AI | Noelia/HIVE (`ai.ts`, `ai-phase5.ts`) | REUSE. Noelia observes federation health; cannot approve (boundary: human_review_required + no approval permission granted to AI). |
| Classifications | `constants.ts` Classification | REUSE + extend vocabulary only where the existing enum lacks tiers (see plan §6). |
| Countries | `core.ts countries` | REUSE as jurisdiction FK target. |

## 8. Environment reality (implementation constraints)

| Constraint | Evidence | Consequence |
|---|---|---|
| **No general outbound network** from the sandbox | `curl` to `www.go.tz`, `www.tra.go.tz`, `example.com` all fail DNS (HTTP 000). `web_search` proxy and npm registry (PONG) work. | The official Tanzania Government Directory (go.tz) **could not be fetched live**. Reconciliation baseline = (a) the program's documented directory baseline (325 MDAs / 26 regions / 126 LGAs), (b) search-index snapshots captured with provenance, (c) the repeatable reconciliation engine, which ingests the live directory when connectivity exists. Per failure policy: unverified ⇒ `UNCERTAIN` / `PENDING_RECONCILIATION`, never invented. |
| npm registry reachable | `npm ping` PONG 97ms | `npm ci`, typecheck, lint, vitest, embedded PG16 all runnable locally. |
| Real PostgreSQL 16 available | `embedded-postgres` devDependency + `scripts/infra/pg16-server.mjs` | Migration 0071 + RLS tests can be executed against a real engine in this session. |
| No government credentials, anywhere | repo secret-scan policy; `.env.example` placeholders only | No live connector, no real credential, no `LIVE`/`LIVE_VERIFIED` claim possible or made. All seeded integration state stays ≤ `SANDBOX` (only the existing mock sandbox is `SANDBOX_READY`). |

## 9. Risks & blockers (honest register)

| # | Risk/Blocker | Disposition |
|---|---|---|
| R1 | Live official directory unreachable in this environment | Documented; reconciliation engine + baseline records carry the gap; counts are explicitly non-permanent. |
| R2 | District (LGA) enumeration varies across sources (directory baseline 126; public references enumerate 184–195 districts incl. Zanzibar) | LGA seed is a **reconciliation baseline, not permanent truth**: every LGA row carries `reconciliation_state` and the coverage audit reports the count mismatch as `MANUAL_REVIEW`. |
| R3 | Zanzibar: 26-region baseline is mainland; the union adds 5 Zanzibar regions (Mjini Magharibi, Unguja North, Unguja South, Pemba North, Pemba South) | Recorded as separate `REGIONAL_GOVERNMENT` authorities with `record_status = UNCERTAIN (outside 26-region directory baseline; federal interface to be reconciled)`. |
| R4 | Official website URLs: only seeded where high-confidence and stable; otherwise `null` + directory source reference | Failure policy: do not fabricate. |
| R5 | `FREE_CONFIRMED` risk | DB CHECK: `FREE_CONFIRMED` requires a cost-evidence row; engine refuses otherwise; UI never renders "FREE" without it. |
| R6 | Inventing `LIVE` | DB CHECK: `LIVE`/`LIVE_VERIFIED`/`PRODUCTION_APPROVAL` require production evidence FK + named approver + approval reference (0036 pattern extended); engine re-checks evidence validity (type, subject, expiry). |
| R7 | Duplicate federation system | ADR recorded in plan + `architectureDecisions` seed (new ADR): Federation & Trust is ONE shared BEYU OS capability extending the 0036 fabric; no sector federation cores, no Federation OS. |
| R8 | Noelia self-authorization | No `federation:approve` / `federation:production.*` permission granted to any AI role; `noelia_action_requests` remains the only AI path (human executes). |
| R9 | CAP_POSTING unlock | Untouched by design; no federation table or route references journal posting. Negative test asserts. |

## 10. Verdict

- **No prior federation program was merged at HEAD** — the 0036 fabric is the only existing piece, and it is sound, evidence-gated, and tenant-isolated. **Extend it.**
- Everything else listed in the program brief is genuinely missing and safe to build additively: one shared capability, additive migration at `0071`, data-driven inventory (never hard-coded in core), new `federation:*` permissions, `/api/v1/federation/*`, `/os/federation`, tests, documentation.
- Production state after this program: **IMPLEMENTED, TESTED, AUDITED, DOCUMENTED, PR_CREATED, HUMAN_REVIEW_REQUIRED.** No `LIVE`, no `LIVE_VERIFIED`, no `FREE_CONFIRMED`, no "GovESB connected" claim anywhere — all fail-closed by database invariants, not by discipline alone.
