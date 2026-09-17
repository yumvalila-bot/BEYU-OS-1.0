# UJENZI OS — REALITY AUDIT

**Audit date:** 2026-09-17
**Auditor:** X10THINK autonomous program (Arena agent session)
**Baseline commit:** `8d2e3a23cb0918709e121004cabd5f34aed5071e` (branch `arena/01a0b078-beyu-os-1-0`, identical tree to `origin/main`)
**Working tree at audit start:** clean (`git status` — nothing to commit)

> **Method.** Every classification below was derived from repository evidence
> (code, migrations, tests, CI, seed) — never from README or certification-report
> claims. Where a report claims a capability, the code was inspected to confirm.
> Classifications use the constitutional scale: `IMPLEMENTED` (code exists),
> `VERIFIED` (tests/evidence confirm behavior), `PARTIAL`, `SCAFFOLDED`,
> `MISSING`, `BROKEN`, `UNVERIFIED`, `EXTERNAL-BLOCKED`.

---

## A. Repository state

| Fact | Evidence |
|---|---|
| Product | BEYU OS — Next.js 16 (App Router, RSC) monolith + federated Health sector backend |
| Stack | TypeScript 5.9, Drizzle ORM 0.45, `pg` 8.20, Zod 3, Tailwind 4, Vitest 3 |
| Database | PostgreSQL 16 (canonical). CI/arena use ephemeral PostgreSQL; production target is Supabase-managed PostgreSQL (`scripts/deploy.sh`, `config/tls/supabase/`) |
| Migrations | 43 hand-governed SQL files in `drizzle/` applied by `scripts/migrate.ts` (checksum ledger `beyu_migrations`) |
| Tests | 195 vitest files under `tests/` (DB-backed suites run against real PostgreSQL) |
| API routes | 237 `route.ts` files under `src/app/api/` |
| OS pages | 52 `page.tsx` under `src/app/os/` + `/health` SPA |
| CI | `.github/workflows/ci.yml` (secret scan, root PostgreSQL gate, Health gates, dependency audit), `db-release.yml` (GitHub → Supabase production migration pipeline), runtime diagnostics |

## B. Current branch / commit

- Session branch `arena/01a0b078-beyu-os-1-0` at `8d2e3a2` — **identical to `origin/main`** at audit time (single-commit history, tag `db-release-8d2e3a23-178`).
- No dirty state, no stashes, no unrelated in-flight work to preserve.

## C. Ujenzi discovery

```
grep -ri "ujenzi" .  →  0 matches (excluding .git)
```

**ZERO Ujenzi references exist anywhere in the repository** — no schema, no
migration, no API route, no frontend route, no registry entry, no seed row, no
test, no document. **UJENZI OS is entirely MISSING.** This is the single
dominant finding of the audit: every Ujenzi capability classifies `MISSING`
until remediation lands.

## D. OS registry (as found)

The canonical registry is `src/db/schema/platform.ts` → table `os_registry`,
seeded from `src/db/seed.ts` (lines 1490–1503). Registered OSs at baseline:

| Code | Kind | Lifecycle |
|---|---|---|
| `BEYU_OS` | CONTROL_PLANE | (default ACTIVE) |
| `SHARED_HCM` | SHARED_CAPABILITY | — |
| `SHARED_FAMILY_OFFICE` | SHARED_CAPABILITY | — |
| `FINANCE_OS` | SECTOR_OS | — |
| `HEALTH_OS` | SECTOR_OS | — |
| `AGRICULTURE_OS` | SECTOR_OS | ACTIVE |
| `FOUNDATION_OS` | SECTOR_OS | ACTIVE |
| `HIVE_RUNTIME` | AI_RUNTIME | — |
| `MINING_OS` | SECTOR_OS | DRAFT (reserved, not built) |

**`UJENZI_OS` is absent** (gap UJ-G01). The in-repo launch registry
(`src/lib/operating-systems.ts` → `SECTOR_OPERATING_SYSTEMS`) lists exactly
Finance, Health, Agriculture, Foundation. Ujenzi is absent there too.

## E. Architecture (as found — the constitution Ujenzi must join)

Verified, working, and to be **consumed, not duplicated**, by Ujenzi:

- **Control plane:** `/os` executive control centre; launcher resolves authorized OSs from governed facts only (`authorizedOperatingSystems`).
- **Sector OS pattern (in-app):** Agriculture OS and Foundation OS are the canonical templates — Drizzle schema file + numbered SQL migration with `FORCE ROW LEVEL SECURITY` + `beyu_tenant_ids()` policies + `beyu_runtime` GRANT + in-migration verification DO-block; permission pair `<sector>:data.read` / `<sector>:data.manage`; sector tenant (e.g. `BEYU-AGRI`) + sector legal entity; deep-link layout guard (`operatingSystemTenantInScope`) + per-page `requireAccess`; API via `guarded()`; audit + enterprise events via `withAuditTransaction`; Noelia observe tool; interop domain registry entry.
- **Identity/Session/RBAC/ABAC:** `src/lib/authz.ts` (`Principal`, `can()` — RBAC + ABAC: classification, tenant, entity, risk), `src/lib/session.ts`, `src/lib/guard.ts`.
- **RLS:** final database boundary; `beyu.current_tenant_ids` / `beyu.global_scope` GUCs set transaction-locally per request (`withTenantDatabaseContext`); runtime role is `NOSUPERUSER NOBYPASSRLS`.
- **Finance boundary:** Finance OS is the only journal writer; `CAP_POSTING` capability is LOCKED and fail-closed (proven by `tests/agriculture/os.test.ts`, `CAP_POSTING_AUDIT_REPORT.md`); sectors emit events, never post.
- **Audit/SIEM:** `src/lib/audit.ts` hash-chained audit log + `enterprise_events` interoperability envelope.
- **Noelia/HIVE:** single AI identity; governed tool registry (`src/lib/noelia/tool-registry.ts`, `default-tools.ts`); every tool declares permission/classification/risk/audit.
- **Documents/Workflow/Notifications/Events:** shared capabilities (`documents` registry, approvals/workflow tables, notifications, `internal/events` outbox).
- **CI/CD:** root gate runs typecheck/lint/migrations/tests against real PostgreSQL 16; `db-release.yml` is the only production schema pipeline (GitHub → Supabase); Vercel runtime.

**No architectural conflict exists** between this prompt's constitutional model and
the repository: the repository already implements it. Ujenzi remediation is
therefore an *extension through the existing pattern*, not a rewrite.

## F–H. Database / Migrations / Domain model (Ujenzi construction domain)

All construction-domain tables are **MISSING**. Existing shared tables that
Ujenzi MUST reference rather than duplicate (verified in `src/db/schema/`):
`tenants`, `legal_entities`, `countries`, `users`/`parties`, `documents`,
`contracts` (governed contracting domain, migration 0042), `employees`,
`journal_entries` (Finance-only), `audit_log`, `enterprise_events`,
`notifications`, `approvals`/`workflows`.

## I. API — `MISSING` (no `/api/v1/ujenzi/*` routes exist).

## J–O. Authorization / RBAC / ABAC / Tenant / Entity / Country / Classification isolation

The enforcement machinery is **VERIFIED** (tests: `tests/security/rls-isolation.test.ts`,
`tests/security/entity-isolation.test.ts`, `tests/tenant-isolation/`, `tests/authorization/`,
`tests/security/foundation-api-target-scope.test.ts`), but it has **zero Ujenzi
routes/permissions to enforce** — the Ujenzi authorization surface is `MISSING`.

## P–Q. Classification ceilings / RLS (Ujenzi)

`MISSING` for Ujenzi — no Ujenzi tables exist to carry `classification` columns
or RLS policies. The pattern to follow is fully specified by
`drizzle/0031`/`0034`/`0035` (per-table `ENABLE`+`FORCE ROW LEVEL SECURITY`,
`USING/WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))`, grant to
`beyu_runtime`, in-migration verification loop).

## R. Frontend — `MISSING`. No `/os/ujenzi` tree exists.

## S–AI. Construction capability domains

| Capability | State at baseline |
|---|---|
| S. Dashboard | MISSING |
| T. Projects | MISSING |
| U. Contracts | Shared governed contracting domain **VERIFIED** (migration 0042, `src/lib/contracts/`) — Ujenzi must link, not duplicate |
| V. BOQ | MISSING |
| W. Cost management | MISSING (Finance OS owns journals — VERIFIED; Ujenzi may hold estimates/budgets/commitments/actuals-metadata/forecasts) |
| X. Procurement | Foundation OS has nonprofit procurement (shared pattern); construction procurement MISSING |
| Y. Materials | MISSING (agriculture inventory is sector-specific, not shared) |
| Z. Equipment | Agriculture equipment is sector-specific; construction equipment MISSING |
| AA. Scheduling | MISSING |
| AB. Site operations | MISSING |
| AC. Quality | MISSING |
| AD. HSE | Agriculture has hazard/safety records (sector-specific); construction HSE MISSING |
| AE. Documents | Shared `documents` registry **VERIFIED** — Ujenzi adds metadata/linkage only |
| AF. Variations | MISSING |
| AG. Claims | Family-office protection claims exist (different domain); construction claims MISSING |
| AH. Payments | Finance OS owns payments **VERIFIED** (`src/lib/payments/`); construction payment *certificates* (valuation records) MISSING — must be non-posting |
| AI. Handover | MISSING |

## AJ–AN. Analytics / Workflow / Notifications / Events / Noelia (Ujenzi)

All `MISSING` for Ujenzi; shared engines are VERIFIED and must be reused
(`withAuditTransaction` events, `notifications`, Noelia tool registry,
`DOMAIN_REGISTRY` interop fabric).

## AO–AQ. Audit / Compliance / Testing / CI (Ujenzi)

Shared audit/SIEM VERIFIED; Ujenzi audit coverage, compliance frameworks,
tests: `MISSING`. CI gate is generic (typecheck/lint/tests/build) and will
automatically pick up Ujenzi tests — no new pipeline needed.

## AR–AS. CI/CD & Deployment

Root CI **VERIFIED** (runs against real PostgreSQL 16 with role separation).
Production deployment chain: GitHub `main` → `db-release.yml` (Supabase
migration + RLS/role verification) and Vercel runtime. Ujenzi will deploy
through the same chain once merged to `main` — **deployment is
HUMAN/EXTERNAL-gated** (merge to `main` + production secrets already
configured as repository secrets; no new secrets are introduced by Ujenzi).

## AT–AW. Observability / Mobile / Security / Performance (Ujenzi)

Health endpoints exist (`/api/health/live`); no Ujenzi schema health surface.
No Ujenzi mobile/offline scope (Agriculture has `agriculture_sync_envelopes`;
a Ujenzi offline framework would be a new architecture — documented as gap, not
invented). Security review of Ujenzi code: not applicable at baseline (no
code); must be performed post-implementation.

## AX–AZ. Documentation / Production readiness / External blockers

Ujenzi documentation: `MISSING`. Production readiness: `MISSING` (no code).
External blockers at baseline: none specific to Ujenzi beyond the standard
human-gated production deployment boundary.

---

## Verdict

**UJENZI OS does not exist in the canonical repository in any form.**
The repository's constitution, security model, registry, audit, finance
boundary and sector-OS pattern are real and verified — Ujenzi must be built
*through* them. See `docs/UJENZI_OS_GAP_REGISTER.md` for the classified gap
register and `docs/UJENZI_OS_IMPLEMENTATION_REPORT.md` for the remediation
outcome.
