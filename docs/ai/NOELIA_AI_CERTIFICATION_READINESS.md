# NOELIA AI Certification Readiness

**Status: READY FOR EXTERNAL ASSESSMENT (platform control plane) · ENVIRONMENT LIMITED (generative inference)**

Date: 2026-09-06

This document records Phase 1 and Phase 2 evidence. It does **not** claim ISO, NIST or EU AI Act
certification. Independent external certification has not been performed.

## Evidence vocabulary

- **IMPLEMENTED** — the code and schema exist and are wired into the governed path.
- **TESTED** — automated tests prove the behavior against the real PostgreSQL runtime.
- **VERIFIED** — evidence recorded in `beyu_migrations` / audits / adversarial tests.
- **ENVIRONMENT LIMITED** — the capability requires an external runtime/integration that is not
  present in this environment.
- **BLOCKED** — the capability intentionally does not proceed (fail-closed) or is not yet available.
- **READY FOR EXTERNAL ASSESSMENT** — the implemented control plane is observable by an external
  assessor; certification itself is not claimed.

## Phase 1 — provider-independent AI platform schema

| Item | Status | Evidence |
|---|---|---|
| `noelia_ai_identity` | IMPLEMENTED / TESTED | `drizzle/0023_noelia_ai_platform.sql`; `AII_NOELIA` seeded |
| `noelia_providers` | IMPLEMENTED / TESTED | default `active=false`; external providers optional |
| `model_registry` router metadata | IMPLEMENTED / TESTED | provider/family/type/capabilities/modalities/residency/approval/evaluation |
| `noelia_evaluations` | IMPLEMENTED / TESTED | evidence only; `APPROVED` never a certificate by itself |
| `noelia_risk_register` | IMPLEMENTED / TESTED | 6 baseline AI risks; governance record, not bypass |
| `noelia_incidents` | IMPLEMENTED / TESTED | state machine; containment never deletes evidence |
| `noelia_kill_switch` | IMPLEMENTED / TESTED | ALL/MODEL/PROVIDER/TOOL/OS/TENANT/CAPABILITY/AI_IDENTITY |
| `noelia_routing_decisions` | IMPLEMENTED / TESTED | non-sensitive metadata only; replay-safe |
| Tenant RLS | TESTED / VERIFIED | `FORCE ROW LEVEL SECURITY` through `beyu_tenant_ids()`/`beyu_global_scope()` |

## Phase 2 — governed runtime model execution

| Item | Status | Evidence |
|---|---|---|
| Authoritative `ai.model.route` before execution | IMPLEMENTED / VERIFIED | `NoeliaRuntime.routeAndExecuteModel` |
| AI authorization before routing | IMPLEMENTED / TESTED | `can(principal, engine permission)` fail-closed |
| Fail-closed routing | IMPLEMENTED / TESTED | empty/unapproved/inactive/kill-switch all `FAIL_CLOSED` |
| Kill switch | IMPLEMENTED / TESTED | capability-level containment proven |
| `AIModelProvider` interface | IMPLEMENTED | `generate/stream/embed/healthCheck/getCapabilities/getMetadata/execute` |
| Deterministic BEYU analyst adapter | IMPLEMENTED / TESTED | `DETERMINISTIC_ANALYST` never `FOUNDATION_MODEL`/`GENERATIVE_MODEL` |
| Deterministic control-plane execution | TESTED | full Noelia → HIVE → route → gateway → model → audit pipeline |
| Model gateway `executeRouted` | IMPLEMENTED / TESTED | unknown/unregistered runtime fails closed |
| Request/response attribution | IMPLEMENTED / TESTED | `ai_decisions.provider/model_kind/request_id/routing_decision_id` |
| Audit attribution | IMPLEMENTED / TESTED | `aiDecisions` + `recordAuditTx` + `AI_DECISION_RECORDED` event |
| Provider independence | TESTED | no hard-coded external endpoint; BEYU-owned deterministic default |
| REAL generative inference | **BLOCKED / ENVIRONMENT LIMITED** | no real BEYU-owned, self-hosted, open-weight or external runtime is present |

## Generative inference runtime requirement

The exact runtime requirement for enabling `REAL_GENERATIVE_INFERENCE` is:

> A BEYU-owned, self-hosted, approved open-weight or activated external model runtime with a real
> inference endpoint, hardened model card, evaluation evidence, accountable activation and
> data-residency proof for the intended classification level.

Until that exists, `BeyuDeterministicAnalystProvider.generate()` returns
`GENERATIVE_INFERENCE_BLOCKED` and the platform does **not** fabricate inference.

## Harness

- Migrations: `0023_noelia_ai_platform.sql`, `0024_noelia_model_runtime.sql` (applied).
- Tests: `tests/noelia/ai-platform.test.ts`, `tests/noelia/runtime-governed-model.test.ts`.
- Full regression: 103 passing files / 2274 passing tests before Phase 2; Phase 2 suites added on
  top and re-run in this repository.
- No ISO, NIST or EU AI Act certification is claimed.
