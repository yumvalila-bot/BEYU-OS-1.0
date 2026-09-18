# BEYU OS — Safe Progressive Delivery Program · Phase 0 Reality Audit

**Date:** 2026-09-18 (UTC)
**Repository:** `github.com/yumvalila-bot/BEYU-OS-1.0`
**Branch audited:** `arena/01a0b459-beyu-os-1-0` @ `ac9b588402b791fc57d800a33d6f41358ab992cb`
**`origin/main`:** `ac9b588` (identical — the session branch is branched from current `main`)
**Mode:** **AUDIT ONLY.** No source, schema, or configuration was modified during this phase.

---

## 0. Verification record (measured, not assumed)

| Check | Result |
|---|---|
| `git status` | clean — no uncommitted work |
| `git rev-parse HEAD` | `ac9b588` |
| `git rev-parse origin/main` | `ac9b588` (same) |
| Clone depth | shallow (1 commit visible) — full history is not present locally; reliance on the canonical remote for history |
| Root package | `beyu-os` v0.3.0 — Next.js 16.3.3, React 19, Drizzle 0.45.2, `pg` 8.20, Zod, Vitest 3, TS 5.9, embedded-postgres 16 (dev) |
| Sector packages | `sectors/health` (Vite SPA) + `sectors/health/backend` (NestJS) — self-contained, excluded from root `tsconfig` |
| Root migrations | **45** SQL migrations in `drizzle/` (`0000`…`0044`) |
| Root tests | **203** Vitest files under `tests/` |
| Health backend tests | **93** Jest specs under `sectors/health/backend` |
| `node_modules` | not installed in this checkout (no local test run performed in audit; CI gates are the authority) |
| Deploy step in CI | **none** — `.github/workflows/ci.yml` is read-only (`permissions: contents: read`); production deploy is Vercel Git integration + governed `scripts/deploy.sh` (explicit authorization boundary) |

---

## 1. Current architecture map

```
                GITHUB  yumvalila-bot/BEYU-OS-1.0   (single source of truth)
                 │  ci.yml · db-release.yml · tls evidence workflows
                 │
        ┌────────┼──────────────────────────┐
        ▼                                     ▼
     VERCEL                                SUPABASE (PostgreSQL 16, eu-west-3)
   application runtime                     persistence + RLS + roles
   (Next.js 16; prod = main)               (beyu_runtime NOSUPERUSER NOBYPASSRLS)
        │                                     │
        └─────────────▼──────────────────────┘
                    BEYU OS  (one constitutional control plane)
              GlobalUserID → Auth → RBAC+ABAC → OS authz → tenant/entity/country → policy → RLS
                              │
        ┌──────────┬──────────┼──────────┬───────────────┬──────────────────┐
        ▼          ▼          ▼          ▼               ▼                  ▼
    FINANCE OS  HEALTH OS  AGRI OS   FOUNDATION OS    UJENZI OS        (shared capabilities:
     (sector)   (sector)   (sector)   (sector)       (sector)          HCM, Family Office,
                                                                       Governance, Risk,
                                                                       Compliance, Legal, Audit,
                                                                       Documents, Events, Noelia/HIVE)
```

- **Canonical OS enumeration** is enforced in code: `src/lib/operating-systems.ts` (`BEYU_CONTROL_PLANE` + `SECTOR_OPERATING_SYSTEMS` = FINANCE, HEALTH, AGRICULTURE, FOUNDATION, UJENZI) and the `os_registry` seed (`src/db/seed.ts`). **Exactly the six canonical OSs; Ujenzi is a Sector OS; Foundation is a Sector OS.** No PVG/DevOps/HCM/`…` OS exists.
- **Shared capabilities are registered as `kind: SHARED_CAPABILITY` / `AI_RUNTIME`** (`SHARED_HCM`, `SHARED_FAMILY_OFFICE`, `SHARED_GOVERNANCE`, `HIVE_RUNTIME`) — the "one BEYU OS, shared capabilities" pattern is already the repository convention.
- **UI/API layout:** BEYU control plane under `/os/*` (registry, identity, capabilities, finance/foundation/agri/ujenzi sector pages); APIs under `/api/v1/<sector>/*`; Health SPA mounted at `/health/os` (built from `sectors/health`); optional Health backend proxy in `next.config.ts` rewrites (OFF by default, fail-closed).
- **No duplicate control plane, no duplicate OS registry, no duplicate authorization system.** These already exist once and are reused across every sector domain.

---

## 2. Current deployment / release map

| Concern | Where | Mechanism | State |
|---|---|---|---|
| Build/lint/typecheck/test/security | `.github/workflows/ci.yml` | PostgreSQL-16 service container; secret scan; root gate; health frontend+backend gates; dependency audit | IMPLEMENTED (green on `main` per repo docs; re-verify in CI at implementation start) |
| Migration apply | `scripts/migrate.ts` (`npm run migrate`) | checksummed, ordered, deterministic, advisory-locked, destructive-migration refusal, `BASELINED_EXISTING` | IMPLEMENTED |
| DB release pipeline | `.github/workflows/db-release.yml` + `scripts/db-release.ts` | preflight (scratch PG) → live preflight → deploy → verify → provenance record → runtime-verify; weekly drift | IMPLEMENTED; production execution gated on two owner secrets (`BEYU_ADMIN_DATABASE_URL`, `BEYU_RUNTIME_DB_PASSWORD`) — fail-closed `EXTERNAL_BLOCKED` |
| App production deploy | Vercel Git integration (platform) | push to `main` → Vercel build/deploy (SHA-tied) | platform-managed; repo has no deploy credentials |
| Governed local deploy | `scripts/deploy.sh` | 8-gate pipeline; deploy step requires `BEYU_DEPLOY_AUTHORIZED=1` **and** live `VERCEL_TOKEN`; otherwise blocked (exit 2) | IMPLEMENTED |
| Release provenance | `db-release.yml` release record + SBOM `scripts/supply-chain/sbom.mjs` | git sha, migration fingerprint, vercel deployment, environment, timestamp, workflow run | IMPLEMENTED |
| Rollback | docs `THREE_WAY_PRODUCTION_ARCHITECTURE.md` §8 + runbooks RB-005/RB-006/RB-022/RB-023 | app = re-deploy previous SHA / `git revert`; database = forward-fix only, never automatic down-migration; Supabase PITR as DR | DOCUMENTED |
| Runtime identity | `SYSTEM_VERSION` (`BEYU-OS/1.0.0`) in `src/lib/constants.ts`; `.next/BUILD_ID`; db-release provenance; schemaVersion in event envelope | **no dedicated runtime-identity endpoint** | PARTIAL (see §Capability matrix row J) |

---

## 3. Capability matrix (reality)

Legend: **EXISTS** = present, enforced, tested · **PARTIAL** = present but incomplete for the stated goal · **MISSING** = not present in any form. "Canonical implementation" = the single existing mechanism the program must extend, never duplicate.

| # | Capability | Status | Canonical implementation | Recommended action | Risk |
|---|---|---|---|---|---|
| A | **DDD** | PARTIAL | Domain modules per sector (`src/lib/finance/*`, `family/*`, `foundation/*`, `ujenzi/*`, `agriculture/*`, `specialist/*`), domain registries (`finance/domains.ts`, `interoperability/domains.ts`, `architecture/completeness.ts`), bounded-boundary rule "a domain must not mutate another domain's aggregates" encoded in interop contract + tests | Codify a machine-checked **domain-ownership map** (owner → aggregates → mutation rights) reusing existing registries; add static "no cross-aggregate mutation" tests where absent. No rewrite of healthy modules | Low–Med |
| B | **Clean Architecture** | PARTIAL | Separation exists naturally: routes (presentation) → `guarded()`/services (application) → domain engines (pure) → `src/db` + `pg` (infrastructure). Pure engines in `src/lib/**` are DB-framework-free | Add an executable **dependency-direction check** (bans `src/db` imports from pure domain engines; bans infra imports into domain). New code follows it; no refactor of healthy modules | Low |
| C | **EDA** | EXISTS | One event ledger `enterprise_events` (CloudEvents-aligned, hash-chained), ONE writer `publishEventTx` in `src/lib/audit.ts`, ONE catalogue `docs/events/README.md`, envelope validation `src/lib/interoperability/contract.ts`, cross-OS ingestion `POST /api/v1/internal/events` (transactional outbox + exactly-once `internal_event_receipts`), governed consumer watermarks `noelia_scheduler_offsets` | Reuse as-is. Formalize consumer registration + per-consumer schema-governance only if the existing watermark/audit path needs it. **Do not add a second bus/broker.** | Med (replay/idempotency discipline) |
| D | **Load balancing / routing** | PARTIAL | Routing is: Vercel (platform) at the edge; Supavisor transaction pooler for DB; in-repo routing = `next.config.ts` rewrites (Health proxy) + `/os/*` + `/api/v1/<sector>/*`. Load balancing is **traffic infrastructure owned by the platform**, never authorization | Document the canonical LB/routing model; confirm authorization is never inferred from routing. No repo-side LB component to add. | Low |
| E | **Blue-Green** | PARTIAL (conceptual) | Deployment-vs-promotion semantics are already encoded: `scripts/deploy.sh` (deploy gate distinct from authorization), `scripts/certify-production.mts` (independent verification), db-release `verify` vs `deploy` jobs; docs §3/§8 use expand/contract + two-release rule | Add the explicit invariant **DEPLOYED ≠ VERIFIED ≠ PROMOTED** as a governed state vocabulary and verify Green via PVG before any traffic. Vercel has no native blue-green; model = separate deployment + promotion decision | Med (platform limits) |
| F | **Canary rollout** | MISSING | — (no rollout/percentage infra anywhere in repo or CI) | Conceptual model only at first (0→1→5→25→50→100 is illustrative). Vercel has no native canary; realistic options: Vercel Deployment Protection domains/rules, or a routing layer (CDN/WAF) — a platform decision, not a repo artifact. **Never** use canary routing as authorization. | Med–High (external platform change) |
| G | **Backward-compatible migration** | EXISTS | `scripts/migrate.ts`: checksummed, ordered, deterministic, advisory lock, refuses destructive migration `0001` on existing schema; `scripts/db-release.ts` preflight/verify/drift with destructive-op scan, RLS inventory, role checks; docs §8 expand/contract two-release rule | Keep. Add an explicit **expand→migrate→verify→contract release checklist** + a pre-merge "no DROP/TRUNCATE in same release that needs the new shape" lint. **Never `drizzle-kit push`** on shared/production DB (already the documented rule). | Low |
| H | **Expand/Contract** | PARTIAL | Present as documented doctrine (two-release contract rule; destructive gate `--allow-destructive`) | Formalize as an executable contract check (migration-classification: ADDITIVE vs CONTRACTING) wired into db-release preflight | Low |
| I | **PVG** | PARTIAL | **`scripts/certify-production.mts`** is a production certification runner already covering: DB reachability, runtime-role privilege constraints, migrations, RLS, tenant/entity/country isolation, audit-chain, event-chain, pooling, HTTP liveness/health, auth+MFA, RBAC, governance deny, Finance authz, Noelia authz. Plus db-release `runtime-verify` | Elevate to a governed **PVG capability**: wrap the existing runner in a state machine (below) with per-stage invocation; add the few missing checks (expected vs runtime git SHA, TLS, critical workflow smoke). Do **not** create a PVG OS or a parallel verifier. | Med (needs a real boundary between "certify" and "promote") |
| J | **Release/runtime identity** | PARTIAL | `SYSTEM_VERSION` (compile-time constant), Next `.next/BUILD_ID`, db-release provenance (git sha, fingerprint, deployment, environment, timestamp), SBOM git provenance, event `schemaVersion` | Add the **smallest safe non-secret runtime identity endpoint** (e.g. `GET /api/health/identity`) exposing only releaseId, gitSha, buildId, environment, deploymentId, runtimeVersion, schemaVersion — values from build-time env baked via `scripts/build` + `next.config.ts` `env`, none secret. Reuse for PVG "runtime is running the artifact we tested." | Low |
| K | **Rollback** | PARTIAL | Forward-fix doctrine + `git revert` for app; no automatic DB down-migration; `scripts/dr-drill.ts` (reconstruct-from-migrations + restore drill); runbooks RB-005/RB-006/RB-022/RB-023 | Add a governed **rollback trigger** in the PVG state machine (FAILED → ROLLED_BACK), and verify the app-revert path produces a new provenance record | Low–Med |
| L | **Telemetry / observability** | PARTIAL | Structured JSON logs with `traceId`/`correlationId`; sanitized failure tokens; Noelia/HIVE observability + continuous-assurance telemetry (`src/lib/noelia/observability.ts`, `continuous-assurance.ts`); platform runtime logs. **No** OTel/Prometheus/Datadog/Sentry | Reuse structured logs + audit ledger + AI telemetry. Add canary-vs-stable signal extraction from existing metrics (Vercel/edge logs) rather than introducing a new monitoring platform | Med |
| M | **Audit evidence** | EXISTS | `audit_log` (immutable, hash-chained) + `enterprise_events` (hash-chained v2) + governed release record + deploy evidence bundle (`tmp/deploy-evidence`, git-ignored) + SBOM + 24 runbooks | Reuse. Add the proposed governed event list (PVG_*, CANARY_*, RELEASE_*) **only where not already in the catalogue**; never record secrets | Low |
| N | **Deployment evidence** | EXISTS | db-release provenance record; `deploy.sh` evidence bundle with per-gate logs + SHA-256; CI artifact uploads | Tie PVG/Canary results into the same evidence chain | Low |

---

## 4. Existing components that can be reused (DO NOT replace)

1. **Authorization primitive** — `guarded()` + `requireAccess()` + `can()` (`src/lib/api.ts`, `src/lib/guard.ts`, `src/lib/authz.ts`).
2. **RLS substrate** — `FORCE ROW LEVEL SECURITY` + `beyu_tenant_ids()` policies across migrations `0021/0031/0032/0034/0035/0043/0044`; `src/lib/tenant-scope.ts`.
3. **OS registry / capability registry / feature flags** — `os_registry`, `governance_capability_registry`, `feature_flags` (+ `/os/registry` reader page).
4. **Event infrastructure** — `enterprise_events`, `publishEventTx`, envelope contract, outbox + exactly-once ingestion.
5. **Audit infrastructure** — `audit_log`, hash chains, chain-head locks.
6. **Migration runner + release guards** — `scripts/migrate.ts`, `scripts/db-release.ts`, `scripts/dr-drill.ts`.
7. **Production certification runner** — `scripts/certify-production.mts`.
8. **Evidence tooling** — `scripts/deploy.sh`, `scripts/supply-chain/sbom.mjs`, CI artifact upload.
9. **CI/CD** — `ci.yml` (full gate incl. real-PG security/RLS/migration suites), `db-release.yml`, TLS evidence workflows.
10. **Runbook library** — RB-001…RB-024.

## 5. Missing components

1. **A governed PVG state machine** with the states BUILD → TESTED → APPROVED → DEPLOYING → DEPLOYED → VERIFYING → VERIFIED | FAILED → ROLLED_BACK, and the rule "platform `Ready` ≠ APPROVED/VERIFIED."
2. **Runtime identity endpoint** exposing the non-secret release identity tuple.
3. **Canary rollout mechanism** (percentage routing) — absent, and requires a **platform-level** decision (Vercel routing rules / CDN / WAF), not a repo invention.
4. **Blue-Green promotion control** as an explicit governed transition (today: platform deploy + human merge).
5. **Canary-stage observability spine** (canary vs stable signal comparison).
6. **OS-specific PVG profiles** (Finance/Health/Agriculture/Ujenzi/Foundation/BEYU) — as *profiles* of the one PVG, not six implementations.

## 6. Duplicate / obsolete components (review items)

1. **`os_registry` DRAFT entry `MINING_OS`** (`src/db/seed.ts`) — registered-before-build proposal with `lifecycle: DRAFT`, empty APIs/events. It is **not** an OS; but it is a registered name that the six-OS canon does not include. Recommend: keep (documented as refused-to-build) or annotate — **not** an action for this program beyond noting.
2. **Stale CI step labels** — root CI step reads "Apply canonical root migrations 0000-0032" while the runner applies all 45; `certify-production.mts` asserts "all 19 BEYU migrations". The *behavior* is correct (applies/counts actual files); the *labels/constants* have drifted. Smallest safe change: update labels/constants to derive from the real migration set.
3. **Previously-recorded findings** (from `CURRENT_STATE.md` §3, dated 2026-09-02) that hardware newer work may already have resolved — must be **re-verified against HEAD before Phase-1 edits**: F-01 (legacy Health Supabase service-role proxy — P0 retirement recommendation); F-02 (identity bridge linkage); F-03 (adapter transport stubs); F-04 (HCM bypass flag ungated); F-05 (outbox dispatcher — note Phase 8 event docs describe a completed dispatcher, so re-verify); F-06 (Finance ledger writer); F-07 (audit chain linkage); F-08 (CI filename-scan false positive — CI comment indicates the pattern was already corrected).

---

## 7. Exact implementation phases (smallest safe change each)

Each phase: inspect `main` → smallest change → run relevant tests → inspect diff → verify no duplicate systems / security boundaries / migration safety → document. Stop at any human-controlled production boundary.

- **P0 — Reality audit** *(this document — DONE, no code changed)*
- **P1 — Architecture & domain contracts:** add the machine-checked domain-ownership map and the Clean-Architecture dependency-direction test (new test files only; no module rewrite). Reconciling stale labels/constants (doctor step).
- **P2 — Backward-compatible migration enforcement:** add expand/contract classification to `db-release.ts` preflight + a pre-merge "no destructive change that breaks the live release" gate. No schema change yet.
- **P3 — Release identity:** bake the identity tuple at build time; add `GET /api/health/identity` (non-secret) + tests.
- **P4 — PVG:** wrap `certify-production.mts` in a governed state machine; add the missing checks (expected vs runtime git SHA, TLS posture, critical workflow smoke); one capability, OS-specific profiles.
- **P5 — Blue-Green integration:** add the DEPLOYED ≠ VERIFIED ≠ PROMOTED transition vocabulary and wire PVG as the promotion gate (repo side); platform routing stays human-governed.
- **P6 — Canary rollout:** conceptual model + stage-state events + canary-vs-stable telemetry extraction; the actual traffic-split remains a Vercel/CDN change requiring operator approval.
- **P7 — Progressive promotion & rollback:** governed promotion/rollback transitions emitting RELEASE_* / CANARY_* evidence events; verify `git revert` promotion path.
- **P8 — Final certification/evidence:** produce the end-to-end evidence chain for one full release.

## 8. Exact files/modules likely to change (per phase)

| Phase | Files |
|---|---|
| P1 | `src/lib/interoperability/domains.ts` (or new `src/lib/architecture/domains.ts`), new `tests/architecture/domain-ownership.test.ts`, `tests/architecture/dependency-direction.test.ts` |
| P2 | `scripts/db-release.ts`, `scripts/migrate.ts` (guard only), `.github/workflows/db-release.yml`, `tests/architecture/db-release-guard.test.ts`, `docs/deployment/THREE_WAY_PRODUCTION_ARCHITECTURE.md` |
| P3 | `scripts/build-identity.mjs` (new), `next.config.ts` (`env`), `src/app/api/health/identity/route.ts` (new), `src/lib/constants.ts`, `tests/api/health-identity.test.ts` |
| P4 | `scripts/pvg/state-machine.ts` (new), `scripts/pvg/run.ts` (new, wraps `certify-production.mts`), `scripts/pvg/profiles/*.ts` (new), `tests/security/pvg-state-machine.test.ts` |
| P5–P7 | `src/lib/pvg/*` or `scripts/pvg/*`, governed event catalogue additions in `src/lib/audit.ts` types + `docs/events/README.md` (reusing existing envelope — no new event tables), runbooks RB-022/RB-023 updates |
| P8 | evidence bundle scripts + docs |

No new OS tables, no new bus, no new authorization path, no new migration mechanism are required.

## 9. Database migration strategy

- **Unchanged authority:** `scripts/migrate.ts` (`npm run migrate`) remains the only runner; `drizzle-kit push` is prohibited for shared/production DB (already documented); `db-release.yml` remains the only production mutator.
- **Invariant:** EXPAND → MIGRATE → VERIFY → CANARY → PROMOTE → CONTRACT. Every schema evolution stays compatible with the currently deployed release until it is retired.
- **Contract phase requires two releases:** release N expands (additive) + migrates application to new shape; release N+1 contracts old schema after N is verified in production. Destructive changes (`DROP/TRUNCATE/ALTER…DROP`) stop the pipeline for human approval (`--allow-destructive`), and migration `0001` is refused on any existing schema.
- **Required properties preserved:** ordered + deterministic execution, checksum drift detection, per-migration transactional application + advisory lock, rollback analysis (forward-fix; no automatic down-migration), data preservation, RLS preservation, tenant-isolation preservation, fingerprint verification against a clean scratch install, real PostgreSQL 16 testing in CI.
- **New work for P2:** explicit ADDITIVE vs CONTRACTING classification surfaced in preflight, and a gate that refuses a destructive change in the same release that requires the new schema.

## 10. Blue-Green strategy

- Deploy **Green** as a separate, independently verifiable deployment (Vercel deployment of the release SHA, or a Preview/alias deployment) without moving production traffic.
- Green passes **PVG** (P4) before any traffic. Blue stays preserved until promotion.
- The **promotion decision is governed and human-controlled** (merge to `main` / explicit promote transition), never automatic on platform `Ready`.
- Enforce **DEPLOYED ≠ VERIFIED ≠ PROMOTED** in the state machine, so a "deployed but unverified" Green cannot be treated as release.

## 11. Canary strategy

- After Green passes initial PVG, progressive exposure is **illustrative** (0→1→5→25→50→100%); actual percentages must follow the audited platform capability (Vercel routing rules / CDN / WAF) — **not hard-coded**.
- Every stage change is governed, audited, reversible, observable; PVG runs at each meaningful stage; canary-vs-stable telemetry (errors, latency, DB errors, authn/authz failures, RLS failures, workflow failures) is compared.
- **Failure:** CANARY → FAILED → 0% traffic → stable release (Blue) → ROLLBACK/investigation. A failed canary release can never progress.
- **Canary routing is never an authorization mechanism** — the GlobalUserID → RBAC+ABAC → OS → tenant → entity → country → policy → RLS chain is unchanged.

## 12. PVG strategy

- One governed **BEYU OS capability** (not an OS), composing the existing `scripts/certify-production.mts` checks plus the new identity/TLS/workflow checks.
- Checks: deployment status · expected Git SHA · runtime Git SHA · release identity · environment · health · DB connectivity · TLS · critical APIs · authentication · RBAC · ABAC · tenant/entity/country isolation · RLS · audit · event processing · critical workflows · deployment/runtime consistency.
- States: BUILD · TESTED · APPROVED · DEPLOYING · DEPLOYED · VERIFYING · VERIFIED · FAILED · ROLLED_BACK. Platform `Ready` never implies APPROVED/VERIFIED.
- OS-specific profiles (BEYU, Finance incl. CAP_POSTING-stays-locked, Health, Agriculture, Ujenzi, Foundation) are **profiles over the one PVG**, never six implementations.
- **Fail-closed:** cannot prove a mandatory condition → DO NOT PROMOTE.

## 13. Rollback strategy

- App: re-deploy previous SHA / `git revert` on `main` (keeps GitHub the authority, produces a new provenance record).
- Database: **forward-fix only** — no in-place history rewrite (checksummed), no automatic down-migration; corrective migration for a bad change; Supabase PITR retained as DR path (unverified at owner level → treated as unproven).
- PVG FAILED / canary telemetry failure → governed `RELEASE_ROLLED_BACK` evidence event, Blue restored.

## 14. Testing strategy

- Add tests per phase (domain boundaries, dependency direction, event contract/authorization, release identity, migration compatibility/ordering/rollback, health, DB, TLS, authn, RBAC, ABAC, tenant/entity/country isolation, RLS, critical APIs/workflows, canary routing, promotion controls, rollback, audit evidence).
- Use **real PostgreSQL 16** for security/RLS/migration verification (existing CI pattern). Never weaken tests to go green; never skip existing suites; never replace real-infra checks with mocks where the guarantee depends on live behavior.

## 15. Security / RLS verification strategy

- Preserve, without modification, the chain: GlobalUserID → Authentication → RBAC+ABAC → OS authorization → Tenant → Entity → Country → Policy → Application use case → Domain rules → Repository → PostgreSQL RLS.
- Deep links are never authorization (server re-checks OS/tenant/entity/country/role/permission); RLS remains the final data-isolation boundary (FORCE RLS, `beyu_tenant_ids()`).
- PVG re-proves RLS + role constraints at every promotion (runtime NOSUPERUSER/NOBYPASSRLS/NOCREATEROLE/NOCREATEDB, no table ownership, no `SET ROLE` escalation) using the existing `certify-production.mts` checks.
- **CAP_POSTING stays permanently fail-closed/LOCKED** — `requireCapability('CAP_POSTING')` and the locked registry behavior are preserved; no deployment/canary/PVG/migration/rollback path may bypass finance controls.

## 16. Audit / evidence strategy

- Reuse `audit_log` + `enterprise_events` + governed release record + deploy evidence bundle + SBOM.
- Add governed events (only where absent): `PVG_STARTED`, `PVG_CHECK_STARTED/PASSED/FAILED`, `PVG_COMPLETED`, `CANARY_STARTED/STAGE_CHANGED/FAILED`, `RELEASE_PROMOTED`, `RELEASE_ROLLED_BACK`, `PRODUCTION_VERIFIED` — using the existing envelope/catalogue naming, never duplicate schemas, never secrets.

## 17. Human-controlled production boundaries (Arena must stop)

- Entering production secrets or credentials; approving production credentials.
- Changing sensitive Vercel production settings (routing/canary/domains) requiring human confirmation.
- Changing cloud IAM/permissions requiring owner approval.
- Irreversible production database operations.
- Promoting a release where organizational approval is required (DB deploy is already gated on the Supabase secrets; platform routing is owner-controlled).
- **Never** ask the user to paste production secrets into chat — configured secret stores only.

## 18. Risk register

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| RSK-01 | Vercel has no native blue-green/canary; over-engineering routing in-repo | High | Med | Conceptual model + platform decision; no repo-side routing invention |
| RSK-02 | PVG duplicated instead of composing `certify-production.mts` | Med | Med | P4 wraps the existing runner; add architecture test asserting one PVG |
| RSK-03 | Contract-phase migration after release N not enforced | Med | High | Additive/contracting classification + two-release gate in preflight |
| RSK-04 | Runtime identity leaks a secret (DB URL, token) | Med | High | Static allowlist of non-secret fields + test that rejects secret-shaped values |
| RSK-05 | Canary routing mistaken for authorization | Low | High | Authorization chain untouched; explicit negative test |
| RSK-06 | Stale CI labels/constants (0000-0032 vs 45; "19 migrations") drift further | Med | Low | Doctor pass in P1; derive counts from files |
| RSK-07 | Prior findings (F-01…F-08) re-verified too late | Med | High | Re-verify each against HEAD before P1 |
| RSK-08 | CAP_POSTING accidentally unlocked by a new path | Low | Critical | Posting remains single-gated via `requireCapability`; regression test in every PVG run |
| RSK-09 | Green promoted on platform "Ready" without PVG | Med | High | State machine refuses auto-promotion; human promotion gate |
| RSK-10 | Secrets requested in chat | Low | Critical | Hard rule: stop at human boundary; secret stores only |

## 19. Recommended implementation order

**P0 (done) → P3 (release identity, has no dependencies) → P1 (architecture contracts) → P2 (migration enforcement) → P4 (PVG) → P5 (Blue-Green) → P6 (Canary) → P7 (progressive promotion/rollback) → P8 (certification/evidence).**

Rationale: P3 unlocks P4's "runtime is running what we tested" proof with the smallest, least risky change; P1/P2 harden the substrate PVG depends on; P4 then composes existing verification into a promote-gate; P5–P7 add the delivery mechanics; P8 closes the evidence loop. P6's percentage routing stays a platform-level, human-governed action independent of repo readiness.

---

## 20. Implementation authorization

Per the program's Phase-gate rule, **no further code changes were made in this audit phase.** On approval, implementation proceeds incrementally starting with **P1 (architecture/domain contracts + doctor pass)**, committing each phase to `arena/01a0b459-beyu-os-1-0` with tests green and evidence recorded, and stopping at any human-controlled production boundary.
