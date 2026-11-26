# NOELIA — Capability Inventory

**Verified by execution:** constructing the real registry —
`createDefaultNoeliaToolRegistry().list()` → **92 capabilities**.
This file is generated from that inventory, not hand-written from aspiration.

---

## 1. Totals

| Metric | Value |
|---|---|
| Registered capabilities | **92** |
| Added by this workstream (cognitive core) | **8** |
| Added by this workstream (HTTP routes) | **5** routes over the 8 capabilities |
| Capabilities with `sideEffects: "NONE"` | 100% of the 8 new ones |
| Capabilities that can post a ledger entry | **0** |

---

## 2. Families

| Family | Count | Notes |
|---|---|---|
| `finance` | 12 | Read-only treasury, FP&A, position, variance. No posting. |
| `mcm` | 10 | Multi-company portfolio intelligence, read-only (PR #117 lineage). |
| `ai` | 8 | Existing AI-surface reads (model registry, evaluations, governance). |
| `family` | 8 | Family Office capital/protection, read-only. |
| `noelia` | 8 | **New cognitive core** (see §3). |
| `hcm` | 7 | Unified employee master reads. |
| `agriculture` | 7 | AGRICULTURE_OS reads. |
| `foundation` | 6 | Foundation (separate nonprofit sister) reads. |
| `knowledge` | 4 | Governed retrieval and source health. |
| `viz` | 3 | Digital twin / spatial reads. |
| `compliance` | 2 | Obligations, controls. |
| `governance` | 2 | Resolutions, strategic objectives. |
| `legal` | 2 | Legal and liability reads. |
| `memory` | 2 | Governed memory reads. |
| `risk` | 2 | Risk register reads. |
| `tax` | 2 | Tax computation explanation (read-only). |
| `analytics` | 1 | Cross-domain analytics. |
| `cross` | 1 | Cross-OS context, scope-limited. |
| `government` | 1 | Regulatory correspondence reads. |
| `health` | 1 | HEALTH_OS runtime status. |
| `model` | 1 | Model registry read. |
| `pricing` | 1 | Pricing reference reads. |
| `ujenzi` | 1 | UJENZI_OS reads. |

---

## 3. The eight cognitive capabilities (new)

All eight are `sideEffects: "NONE"`, `idempotent: true`, `risk: "LOW"`, and **none declares an
`approverRole`** — because none can materially act.

| Capability | Permission | Purpose |
|---|---|---|
| `noelia.world_model.query` | `ai:noelia.query` | Authorized institutional world state; financial values reported `UNAVAILABLE` |
| `noelia.knowledge_graph.query` | `ai:noelia.query` | Typed entity/concept relationships in scope |
| `noelia.decision_memory.query` | `ai:noelia.query` | Institutional decisions with provenance and status |
| `noelia.council.deliberate` | `ai:executive.read` | Independent findings; dissent preserved; always `humanReviewRequired` |
| `noelia.scenario.simulate` | `ai:analytics.read` | Scenario output labelled `SIMULATION`; never a record |
| `noelia.evaluation.status` | `ai:evaluation.read` | Evaluation/golden-case posture |
| `noelia.personal_context.read` | `ai:noelia.query` | Caller's **own** context only |
| `noelia.operations.status` | `ai:noelia.query` | Operational workflow awareness, read-only |

---

## 4. What is deliberately absent

The absence is the control. Each of these was searched for and confirmed to have **no** NOELIA
dispatch path:

| Absent capability | Why it must stay absent |
|---|---|
| Post a journal / ledger entry | `CAP_POSTING` locked; Finance OS owns the ledger |
| Move funds | NOELIA is not a payment authority |
| Approve an investment | Requires a human accountable role |
| Execute capital allocation / waterfall | BEYU OS is a control plane, not an executor |
| Alter a trust arrangement | Family Office constitutional domain |
| Override a financial control | Control evaluation is read-only |
| Create/modify a user or grant | Identity is outside NOELIA's reach |
| Run shell / SQL / arbitrary code | `agent-surface-guard.test.ts` asserts no such name exists |

---

## 5. How the inventory stays honest

`tests/noelia/agent-surface-guard.test.ts` freezes the 92 names. Adding a capability fails the
suite until the frozen list is deliberately amended with a reviewed-change comment — which is
exactly what was done for the 8 `noelia.*` names (see the comment block above them).

The guard also asserts:
- every declared tool is *registered* (declaration alone is not a dispatch path),
- no tool name matches `/(shell|bash|exec|sql|raw_query|agent_run|hermes|tool_call)/i`.

---

## 6. Routes over capabilities

| Route | Capability | Permission |
|---|---|---|
| `POST /api/v1/ai/noelia/cognitive/world-model` | `noelia.world_model.query` | `ai:noelia.query` |
| `POST /api/v1/ai/noelia/cognitive/knowledge-graph` | `noelia.knowledge_graph.query` | `ai:noelia.query` |
| `POST /api/v1/ai/noelia/cognitive/decision-memory` | `noelia.decision_memory.query` | `ai:noelia.query` |
| `POST /api/v1/ai/noelia/cognitive/council` | `noelia.council.deliberate` | `ai:executive.read` |
| `POST /api/v1/ai/noelia/cognitive/simulation` | `noelia.scenario.simulate` | `ai:analytics.read` |

All five: `.strict()` Zod input, `guarded()` wrapper, audit `objectType: AI_DECISION`,
transaction-scoped tenant context, `apiOk(...)` success, `apiError(...)` failure.
