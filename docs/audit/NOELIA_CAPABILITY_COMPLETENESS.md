# NOELIA — Capability Completeness Report

**Date:** 2026-08-25 · **Gate:** 🟢 GREEN (implementation) / ⚪ BLOCKED (production deployment)
**Regression:** 1600/1600 PASS · **Machine-readable:** `noelia-capability-completeness-matrix.json`

## Summary of expansion (from Phase 15 baseline)

1. **Intent architecture** — 12-engine deterministic routing (`routeEngine`)
   replacing keyword-only dispatch for material requests; engine → registered
   tool plans; no free-form tool selection.
2. **Executive Intelligence** — `synthesizeExecutiveBriefing` (20-section
   contract), 6 canonical horizons (metadata only), structured
   recommendations with the full §20 contract; `POST /brief`.
3. **Enterprise Analytics** — 16 analysis types over canonical specialist
   engines (treasury/risk/fpna/forecast reused, never duplicated);
   `POST /analyze`.
4. **Epistemics** — canonical 12-status model with deterministic basis
   mapping, explainable confidence, anomaly/trend detection.
5. **Finance OS intelligence** — treasury/capital/waterfall/cash/maturity/FX/
   reconciliation adapters; read/analyze/explain/recommend only; no posting,
   no approval, no policy change (REQUIRES_AUTHORITY preserved).
6. **HCM intelligence** — observe/organization/quality/turnover/succession
   signals over the canonical employee master + employment events; no second
   employee master; no autonomous employment decisions.
7. **Health OS boundary** — adapter + registered-source gate; UNAVAILABLE
   without a real integration; clinical data never fabricated.
8. **Tax + Legal intelligence** — FACT/INFERENCE/RECOMMENDATION/
   REQUIRES_AUTHORITY; unknown authority fails closed; jurisdiction explicit;
   advice remains with counsel.
9. **Knowledge/RAG** — governed ingestion (supersession, windows, authority),
   governed retrieval with provenance/citation; content is DATA, never
   SYSTEM AUTHORITY; semantic layer BLOCKED (no fake vectors).
10. **Long-term enterprise memory** — 10 classes, full governance envelope
    (owner/provenance/confidence/classification/scope/retention/expiry/
    supersession/deletion/legal hold/audit); memory is never a second source
    of truth.
11. **Agentic workflows** — PLAN→VALIDATE→AUTHORIZE→EXECUTE→OBSERVE→REASSESS→
    CONTINUE/ESCALATE/STOP→AUDIT; durable, traceable, idempotent, bounded,
    cancellable, recoverable; 6-step HTTP loop proven end-to-end.
12. **Human approval orchestration** — maker/checker enforced server-side;
    approval ≠ execution; self-approval denied (HTTP 403 proven); risk/
    role/amount/classification/entity/country/jurisdiction gates via the
    registry contract.
13. **Cross-OS intelligence** — per-domain independent authorization; denied
    domains reported; cross-tenant aggregation DENY by default.
14. **Scheduler** — OUTBOX→CONSUMER with durable watermark (offsets table),
    run-once idempotency, dead-letter evidence (OWNER_INACTIVE), no
    in-process timers, no cron endpoints.
15. **Model Gateway / HIVE** — registry with classification limits,
    jurisdiction, timeout/retry/cost fields; deterministic internal analyst
    until a provider is ratified; no data leaves the boundary.
16. **Tool registry** — full governed contract (stableId, version, owner,
    domain, permission, classification, risk, approver, Zod in/out, side
    effects, idempotency, audit/event, timeout, retry, jurisdiction, entity,
    model restrictions); declaration/registration contract equality; unknown/
    unregistered DENY.
17. **API** — 11 governed routes with guarded(), strict Zod, rate limits,
    sanitized errors, idempotency, audit; live HTTP validation.
18. **Database** — migrations 0015–0016 (additive, checksummed, RLS on every
    new tenant table); no `drizzle-kit push`; fresh-install applied.

## File inventory

- New services: `analytics-service.ts`, `workforce-service.ts`,
  `legal-service.ts`, `health-boundary.ts`, `enterprise-memory.ts`,
  `model-gateway.ts`, `workflows.ts`, `scheduler-service.ts`,
  `epistemics.ts`, `executive.ts`.
- New API routes: `brief/`, `analyze/`, `workflows/*` (5 routes),
  `schedules/*` (3 routes).
- New permissions (9): `ai:executive.read`, `ai:analytics.read`,
  `ai:workflow.run`, `ai:workflow.approve`, `ai:memory.read`,
  `ai:memory.write`, `ai:knowledge.ingest`, `ai:schedule.manage`,
  `ai:model.registry.read` — granted in ROLES and re-synced to
  `role_permissions` (parity test PASS).
- Migrations: `0015_noelia_intelligence_expansion.sql`,
  `0016_noelia_scheduler_offsets.sql` (+ meta snapshots).
- Tests added: `workflow-integration.test.ts` (8), `scheduler-integration.test.ts` (3);
  existing suites extended with governed metadata.

## Phase 1 — provider-independent AI platform registry (2026-09-06)

`0023_noelia_ai_platform.sql` + `src/db/schema/ai.ts` add the governed AI platform
substrate without changing the existing HIVE/tool authorization boundary:

- `noelia_ai_identity` (`AII_NOELIA`) — separate from human `GlobalUserID`; no role grants.
- `noelia_providers` — `BEYU_OWNED` / `SELF_HOSTED` / `OPEN_WEIGHT` / `EXTERNAL`, default `active=false`.
- Router metadata on `model_registry` — provider/family/type/capabilities/modalities/context,
  deployment/residency, risk/approval/evaluation/security, model card/licence/source.
- `noelia_evaluations`, `noelia_risk_register`, `noelia_incidents`, `noelia_kill_switch`,
  `noelia_routing_decisions`.

Tenant-scoped AI tables enforce `FORCE ROW LEVEL SECURITY` via `beyu_tenant_ids()` /
`beyu_global_scope()`. `BeyuNoeliaAiPlatformService` (`src/lib/noelia/ai-platform.ts`) adds a
deterministic fail-closed model router and read tools for identity/providers/evaluations/risk/
incidents/kill-switch/routing. External providers remain optional and BLOCKED until activated.

## Final classification

| Class | Items |
|---|---|
| PASS | all implemented capability rows in `noelia-capability-completeness-matrix.json` |
| BLOCKED | semantic retrieval, external model providers, Health OS data, production deployment |
| DEFERRED | TEAM/LEGACY memory classes, quorum/delegation chains in approval UI |
| REQUIRES_AUTHORITY | all business/legal/tax/clinical/ownership decisions, cross-tenant aggregation, autonomy L6 |
