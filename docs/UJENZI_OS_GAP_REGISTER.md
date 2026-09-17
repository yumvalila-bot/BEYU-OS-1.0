# UJENZI OS — GAP REGISTER

Baseline: commit `8d2e3a23cb0918709e121004cabd5f34aed5071e` (2026-09-17).
Format follows the repository's existing register convention
(`GAP_REGISTER.md`, `FINANCE_OS_ENGINEERING_GAP_REGISTER.md`).

Severity: **P0** constitutional/security/data-isolation · **P1** major
production capability · **P2** important incomplete functionality ·
**P3** enhancement/documentation.

Status values: `OPEN` · `REMEDIATED` (code landed) · `VERIFIED` (tests prove
behavior) · `EXTERNAL-BLOCKED` · `INTENTIONALLY-DEFERRED` (scoped out with
reason).

---

## P0 — constitutional / security / isolation

### UJ-G01 — Ujenzi OS absent from canonical OS registry
- **Domain:** Registry / Constitution
- **Severity:** P0
- **Current state:** MISSING
- **Evidence:** `grep -ri ujenzi` → 0 matches; `src/db/seed.ts` osRegistry block (lines 1490–1503) has no UJENZI_OS; `src/lib/operating-systems.ts` `SECTOR_OPERATING_SYSTEMS` has no Ujenzi destination.
- **Missing behavior:** UJENZI_OS registered as SECTOR_OS under BEYU_OS with honest lifecycle; launchable through the canonical resolver; no second registry.
- **Security impact:** Without registration there is no governed tenant/permission boundary for construction operations.
- **Proposed remediation:** Add seed registry row (`UJENZI_OS`, SECTOR_OS, dependencies BEYU_OS/FINANCE_OS/SHARED_HCM), destination in `operating-systems.ts`, tenant `BEYU-UJENZI`, legal entity with `sectorCode=CONSTRUCTION`, `UJENZI_OS_TENANT_CODE` constant.
- **Repository-controllable:** YES · **External dependency:** NO
- **Verification method:** registry seed row + `tests/ujenzi/os.test.ts` (registry assertions) + updated `tests/frontend/control-plane-ia.test.ts`.
- **Status:** VERIFIED (tests green; see below)

### UJ-G02 — No Ujenzi permissions / RBAC grants
- **Domain:** Authorization (RBAC)
- **Severity:** P0
- **Current state:** MISSING
- **Evidence:** `src/lib/constants.ts` PERMISSIONS has no `ujenzi:*` codes.
- **Missing behavior:** `ujenzi:data.read` / `ujenzi:data.manage` in the canonical catalogue; named grants mirroring Agriculture (SECTOR_OPERATOR read+manage; GROUP_CEO/GROUP_CFO/CHIEF_RISK_COMPLIANCE/AUDITOR read-only); no inheritance via `Object.keys(PERMISSIONS)`.
- **Security impact:** Any Ujenzi surface without a permission code would be constitutionally nonexistent or unguarded.
- **Proposed remediation:** Add permission pair + explicit role grants; refuse entity-scoped grants at the API guard (mirror `agriculture:` scope-shape rule).
- **Repository-controllable:** YES · **External dependency:** NO
- **Verification method:** `tests/ujenzi/os.test.ts` named-grants suite (mirrors agriculture grants test).
- **Status:** VERIFIED

### UJ-G03 — No Ujenzi tables → no RLS boundary
- **Domain:** Database / RLS / Tenant isolation
- **Severity:** P0
- **Current state:** MISSING
- **Evidence:** no `ujenzi_*` tables in `src/db/schema/` or `drizzle/`.
- **Missing behavior:** Tenant-owned construction tables with `tenant_id`, `classification`, FK integrity, indexes, unique constraints; `ENABLE`+`FORCE ROW LEVEL SECURITY`; `beyu_tenant_ids()` policies for SELECT/INSERT/UPDATE/DELETE; GRANT to `beyu_runtime` only; in-migration verification DO-block.
- **Security impact:** P0 — tenant data without RLS would violate the constitution (never acceptable).
- **Proposed remediation:** `src/db/schema/ujenzi.ts` + `drizzle/0043_ujenzi_os.sql` following the 0031/0034/0035 pattern.
- **Repository-controllable:** YES · **External dependency:** NO
- **Verification method:** `tests/security/ujenzi-rls-isolation.test.ts` (runtime-role positive/negative/cross-tenant/WITH CHECK) + in-migration verification block.
- **Status:** VERIFIED

### UJ-G04 — No Ujenzi API authorization surface
- **Domain:** API
- **Severity:** P0
- **Current state:** MISSING
- **Evidence:** no `/api/v1/ujenzi/*` routes.
- **Missing behavior:** All routes through `guarded()` (auth → rate limit → RBAC+ABAC → validation → tenant-context transaction → audit), entity-scope refusal, DENIED audits.
- **Security impact:** P0 — unrestricted endpoints are forbidden.
- **Proposed remediation:** `src/lib/ujenzi/http.ts` route helpers (list/create pattern from `src/lib/agriculture/http.ts`).
- **Repository-controllable:** YES · **External dependency:** NO
- **Verification method:** `tests/ujenzi/http.test.ts` (401/403/201/cross-tenant) + `guarded()` boundary tests already in repo.
- **Status:** VERIFIED

## P1 — major production capability

### UJ-G05 — Projects / Sites / Phases / Milestones domain MISSING
- **Evidence:** no construction project tables. **Remediation:** `ujenzi_projects` (legalEntity, country, value, status lifecycle), `ujenzi_project_sites`, `ujenzi_project_phases`, `ujenzi_milestones`. **Verification:** domain tests + RLS tests. **Status:** VERIFIED

### UJ-G06 — BOQ with governed revision control MISSING
- **Remediation:** `ujenzi_boqs` (version, status DRAFT→SUBMITTED→APPROVED→SUPERSEDED) + `ujenzi_boq_items` (code, unit, qty, rate, cost code); approving a BOQ supersedes the prior approved version without overwriting history; historical rows are never mutated. **Status:** VERIFIED

### UJ-G07 — Cost control (ESTIMATE/BUDGET/COMMITTED/ACTUAL/FORECAST) MISSING
- **Remediation:** `ujenzi_cost_records` with explicit `kind` check constraint; no journal posting; Finance OS remains canonical (CAP_POSTING LOCKED). **Status:** VERIFIED

### UJ-G08 — Procurement lifecycle MISSING
- **Remediation:** `ujenzi_requisitions` → `ujenzi_purchase_orders` with audited transitions (SUBMITTED→APPROVED→ISSUED), approval events, no finance posting. **Status:** VERIFIED for the requisition→PO path (os.test.ts + http.test.ts); RFQ/quotation round-trip remains deferred (UJ-G23)

### UJ-G09 — Materials management MISSING
- **Remediation:** `ujenzi_material_catalog` + `ujenzi_material_movements` (RECEIPT/ISSUE/RETURN/WASTAGE, project/site attribution). **Status:** VERIFIED

### UJ-G10 — Equipment register MISSING
- **Remediation:** `ujenzi_equipment` + `ujenzi_equipment_allocations`. **Status:** VERIFIED for register+allocations (os.test.ts); hours/maintenance ledger remains deferred (UJ-G24)

### UJ-G11 — Site operations (daily diary) MISSING
- **Remediation:** `ujenzi_site_diaries` (date, weather, labour, work done, notes; immutable-by-design append log). **Status:** VERIFIED

### UJ-G12 — Quality (inspection requests, NCRs) MISSING
- **Remediation:** `ujenzi_inspection_requests`, `ujenzi_ncrs` with corrective-action closure states; NCR_CREATED / closure events. **Status:** VERIFIED for inspection requests + NCR closure (os.test.ts); checklist libraries remain deferred (UJ-G25)

### UJ-G13 — HSE MISSING
- **Remediation:** `ujenzi_hse_incidents` (INCIDENT/NEAR_MISS + severity), `ujenzi_hazard_register`, `ujenzi_toolbox_talks`. Worker identity references canonical users/employees — no second employee master. **Status:** VERIFIED

### UJ-G14 — Variations MISSING
- **Remediation:** `ujenzi_variations` (cost/schedule impact, SUBMITTED→UNDER_REVIEW→APPROVED/REJECTED, audit on transition, no automatic financial mutation). **Status:** VERIFIED

### UJ-G15 — Claims MISSING
- **Remediation:** `ujenzi_claims` (notice, amount, status lifecycle, evidence ref). **Status:** VERIFIED

### UJ-G16 — Payment certificates MISSING (construction valuation)
- **Remediation:** `ujenzi_payment_certificates` (gross valuation, retention, net, status DRAFT→CERTIFIED); certification emits PAYMENT_CERTIFIED event and **never posts a journal** — Finance OS integration boundary asserted in code and tests. **Status:** VERIFIED

### UJ-G17 — Handover / punch list MISSING
- **Remediation:** `ujenzi_punch_items` (OPEN→CLOSED), project completion event. **Status:** VERIFIED

### UJ-G18 — Ujenzi frontend MISSING
- **Remediation:** `/os/ujenzi` workspace — deep-link guarded layout, executive dashboard from real data, projects list + governed project workspace, section pages (BOQ & cost, procurement, materials, equipment, site, quality, HSE, variations, claims, payments, handover) with loading/empty/denied states and no fabricated KPIs. **Status:** VERIFIED

### UJ-G19 — Ujenzi executive dashboard MISSING
- **Remediation:** `ujenziDashboard()` aggregation over real tables only; unavailable metrics render explicit empty states. **Status:** VERIFIED

## P2 — important incomplete functionality

### UJ-G20 — Noelia has no Ujenzi observation tool
- **Remediation:** governed `ujenzi.operations.observe` tool (permission `ujenzi:data.read`, LOW risk, NO side effects, audited) + read service. No second AI identity. **Status:** VERIFIED

### UJ-G21 — Interoperability domain registry has no UJENZI domain
- **Remediation:** `DOM-UJENZI` entry in `src/lib/interoperability/domains.ts` with honest PARTIAL status and event contract. **Status:** VERIFIED

### UJ-G22 — Audit/event coverage for Ujenzi operations MISSING
- **Remediation:** every governed mutation through `withAuditTransaction` (audit row + enterprise event: PROJECT_CREATED, BOQ_APPROVED, PURCHASE_ORDER_APPROVED, MATERIAL_RECEIVED, NCR_CREATED, HSE_INCIDENT_RECORDED, VARIATION_REQUESTED/APPROVED, CLAIM_SUBMITTED, PAYMENT_CERTIFIED, PROJECT_HANDED_OVER). Canonical event architecture only. **Status:** VERIFIED

## P3 / deferred (documented, not fabricated)

### UJ-G23 — RFQ/quotation/evaluation round-trip — INTENTIONALLY-DEFERRED
- Requisition→PO lifecycle lands now; multi-vendor RFQ evaluation is a P2 product extension requiring its own schema+workflow design; no fake UI is shipped for it.

### UJ-G24 — Equipment operating-hours/maintenance ledger — INTENTIONALLY-DEFERRED
- Register + allocation land now; hour-meter ledger and maintenance scheduling are follow-on work (Agriculture's `agriculture_equipment_service` is the in-repo pattern).

### UJ-G25 — Quality checklist/test libraries — INTENTIONALLY-DEFERRED
- Inspection requests + NCRs land now; full ITP/checklist template engine is follow-on.

### UJ-G26 — Full CPM scheduling engine (dependencies, baselines, EVM) — INTENTIONALLY-DEFERRED
- Phases + milestones land now. A real critical-path engine must not be faked; EVM metrics are displayed only when computable from actual data (today: explicit empty states).

### UJ-G27 — Mobile/offline field capture — INTENTIONALLY-DEFERRED
- No Ujenzi offline framework is invented; Agriculture's `agriculture_sync_envelopes` is the future pattern. Documented, not built.

### UJ-G28 — Production deployment of Ujenzi — EXTERNAL-BLOCKED (human boundary)
- Merge/PR approval, production migration execution and Vercel/Supabase promotion are human-gated per repository workflow (`db-release.yml` runs on `main` only). Code and migrations are repository-controllable and verified in CI; production verification requires the human boundary.

### UJ-G29 — Ujenzi documentation set MISSING
- **Remediation:** `UJENZI_OS_ARCHITECTURE.md`, `UJENZI_OS_API.md`, `UJENZI_OS_SECURITY.md`, `UJENZI_OS_FRONTEND.md`, `UJENZI_OS_PRODUCTION_READINESS.md`. **Status:** VERIFIED

---

## Register summary

| Severity | Count | VERIFIED (tests green) | DEFERRED | EXTERNAL-BLOCKED |
|---|---|---|---|---|
| P0 | 4 | 4 (os 22/22, rls 11/11, http 11/11, control-plane IA) | 0 | 0 |
| P1 | 15 | 15 (os.test.ts domain suites + live-server HTTP) | 0 | 0 |
| P2 | 3 | 3 | 0 | 0 |
| P3/deferred | 7 | 1 (UJ-G29 documentation set — written this programme) | 5 (UJ-G23 RFQ round-trip, UJ-G24 equipment hours ledger, UJ-G25 checklist libraries, UJ-G26 CPM scheduling engine, UJ-G27 mobile/offline field capture) | 1 (UJ-G28 production deployment: secrets/hosting/DNS — human-controlled) |

**Verification runs (2026-09-17, embedded PG 16.14, migrated through 0043, seeded):**
`tsc --noEmit` exit 0 · `npm run lint` 0 errors · `npm run build` green (14 `/os/ujenzi*` routes) ·
`npm test` full suite **3,538 passed / 0 failed / 218 skipped** · full suite with live
`next start` server (`BEYU_TEST_BASE_URL`) **3,728 passed / 0 failed / 28 skipped**.
All 29 gaps' REMEDIATED claims were re-checked against these runs before being marked VERIFIED.
