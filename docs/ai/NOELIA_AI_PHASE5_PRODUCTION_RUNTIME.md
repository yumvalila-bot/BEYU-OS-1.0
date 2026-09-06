# Phase 5 — Noelia AI Production Runtime, HIVE, RAG, Observability, Evaluation, Resilience & Continuous Assurance

**Date:** 2026-09-06
**Program:** Beyu OS 2.0/3.0 — Noelia AI / HIVE production fabric
**Status:** IMPLEMENTATION IN PROGRESS — environment-limited real generative inference honestly reported.

This document records what Phase 5 adds on top of Phases 1–4. It is not a
certification claim. Where the environment has no real generative endpoint or
embeddings runtime, the status is `BLOCKED`/`ENVIRONMENT_LIMITED`, never `PASS`.

## Principle

Phase 5 is a **runtime fabric**, not a new authority:

- HIVE is a governed execution boundary, not a second authorization system.
  BEYU governance remains canonical.
- Model output is untrusted. RAG is not authorization. Tools independently
  authorize.
- No prompts, model outputs, retrieved document content, provider credentials,
  API keys or passwords are persisted in the Phase 5 tables.
- All new tenant-scoped tables are RLS-enforced through
  `beyu_tenant_ids()` / `beyu_global_scope()`.
- Real generative inference remains fail-closed until a real endpoint and
  credential reference are mounted by an accountable human and a registry row is
  approved.

## Schema (migration `0027` — additive only)

| Table/column | Purpose |
|---|---|
| `noelia_ai_telemetry` | Non-sensitive request telemetry (status, latency, token count, policy decision, safety flags; no prompt/output). |
| `noelia_ai_spans` | Distributed tracing spans for request chains. |
| `noelia_ai_evaluation_runs` | Continuous evaluation run records. |
| `noelia_ai_red_team_results` | Red-team/adversarial case results (honest `MISSED`/`BLOCKED`/`ENVIRONMENT_LIMITED`). |
| `noelia_rag_retrieval_events` | RAG retrieval audit: authorization decision, source code, excerpt hash. No retrieved content. |
| `knowledge_sources` additions | `contentDigest`, `sourceType`, `osId`, `embeddingStatus`, `embeddingModelId`, `embeddingDimensions`, `chunkCount`, `lastIndexedAt`. |

## Implemented components

### 5B — Production generative runtime boundary

- `src/lib/noelia/hive-runtime.ts` — `resolveHiveExecutionContext()` resolves
  identity/classification/policy/kill-switch/residency server-side and
  `HiveRuntimeBoundary.execute()` wraps a producer with fail-closed telemetry.
- `src/lib/noelia/model-operations.ts` — `verifyModelSupplyChain()` (fail-closed
  provenance/artifact/checksum verification) and `resolveGovernedFallback()`
  (only ACTIVE/APPROVED/APPROVED registry models, activated providers, kill
  switches and classification limits respected; otherwise `FAIL_CLOSED`).

### 5C — HIVE runtime

- HIVE is intentionally a boundary, not a namespace. `HiveExecutionContext`
  carries `permission`, `classification`, `killSwitchOk`, `humanOversight`
  and `residencyConstraint`. It records `FAIL_CLOSED` telemetry on any guard
  failure.

### 5D — RAG knowledge fabric

- `src/lib/noelia/knowledge-fabric.ts` — digest-verified governed knowledge
  ingestion, tamper verification, authorized retrieval and retrieval-event audit.
- RAG remains SQL-pushdown in this environment; vector/embedding state is
  `NOT_EMBEDDED` when no real embedding runtime is mounted.

### 5E — AI observability

- `src/lib/noelia/observability.ts` — `BeyuNoeliaObservabilityService` records
  telemetry/spans and provides guarded metrics. Read queries require
  `ai:compliance.metrics`.

### 5F — AI evaluation engine

- `src/lib/noelia/evaluation-engine.ts` — records continuous evaluation runs
  and red-team results with honest outcomes; never promotes a model.

### 5H — Model supply chain

- Supply-chain verification requires provenance, license, source, artifacts and
  a checksum match. Missing evidence is `PARTIAL`/`FAILED`, never `VERIFIED`.

### 5I — Production resilience

- `src/lib/noelia/resilience.ts` — `BeyuNoeliaCircuitBreaker` closed/open/half-open
  state machine plus `BeyuNoeliaProductionResilience.guardedCall()` with
  fail-closed telemetry and honest health summary.

### 5J — Continuous assurance

- `src/lib/noelia/continuous-assurance.ts` — observable attestation across kill
  switches, model/provider registry health, controls, evidence currency,
  red-team coverage, telemetry posture and evaluation evidence. `PASS` requires
  all gates; no mountable real generative endpoint → `ENVIRONMENT_LIMITED`.

### 5K — Real generative inference

- **BLOCKED / ENVIRONMENT_LIMITED.** `NOELIA_GENERATIVE_ENDPOINT` and
  `NOELIA_GENERATIVE_CREDENTIAL_REF` are not present. The `OpenAICompatibleAdapter`
  (Phase 3) continues to fail closed (`NOT_CONFIGURED`) until a real deployment
  exposes them.

## API

- `GET /api/v1/ai/noelia/phase5` — honest Phase 5 status block.
- `POST /api/v1/ai/noelia/phase5/actions` — governed Phase 5 actions
  (`hive.context`, `knowledge.*`, `telemetry.*`, `evaluation.*`,
  `model.*`, `resilience.*`, `assurance.attest`).

## Security posture

- RLS is enabled and forced on all tenant-scoped Phase 5 tables.
- Telemetry and retrieval events never store prompt/output/content.
- The HIVE boundary and resilience guard both fail closed before provider
  execution.
- Arbitrary provider execution is intentionally NOT exposed over the Phase 5
  action API — `resilience.guarded-call` returns a fail-closed refusal.

## Acceptance / verification

- `npm run typecheck` — PASS.
- `npx vitest run tests/noelia/phase5-platform.test.ts` — PASS (9 tests).
- Targeted `npm run lint` on all new/changed files — PASS.
- Migration `0027` applied to local DB; migration count suites updated to 28.

## Honest status block

See `src/lib/noelia/phase5-status.ts` and the live endpoint. The block reports:

- `REAL_GENERATIVE_INFERENCE`: `ENVIRONMENT_LIMITED` (no endpoint/credential).
- `EXTERNAL_ASSESSMENT_STATUS`: `NOT_CERTIFIED`.
- `ACTUAL_CERTIFICATION_STATUS`: `NOT_CERTIFIED`.
- Other Phase 5 engineering items: `IMPLEMENTED`/`PARTIAL`/`IN_PROGRESS`.
