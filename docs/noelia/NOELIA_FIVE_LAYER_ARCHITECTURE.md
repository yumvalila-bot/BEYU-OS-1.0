# NOELIA — The Five-Layer Intelligence Architecture

**Status:** IMPLEMENTED (with the scope boundaries stated in §7)
**Identity:** NOELIA (QUEEN BEE) · **Runtime:** HIVE · **Motto:** Intelligence • Governance • Care

---

## 1. Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│ L5  HIVE CAPABILITIES                                                │
│     92 governed capabilities in one registry. 12 workforce           │
│     specialisms are *views* over these, not new engines.             │
├──────────────────────────────────────────────────────────────────────┤
│ L4  INTELLIGENCE RUNTIME                                             │
│     One model gateway · Ollama provider · local embeddings ·         │
│     deterministic analyst fallback · provider-state honesty          │
├──────────────────────────────────────────────────────────────────────┤
│ L3  INSTITUTIONAL MEMORY & KNOWLEDGE FABRIC                          │
│     ai_decisions · noelia_decision_records · enterprise_memory ·     │
│     knowledge_sources · noelia_kg_edges · noelia_digital_twins       │
├──────────────────────────────────────────────────────────────────────┤
│ L2  COGNITIVE BRAINS  (8)                                            │
│     Executive · Institutional · Knowledge · Analytical ·             │
│     Operational · Learning · Collective · Personal Context           │
├──────────────────────────────────────────────────────────────────────┤
│ L1  QUEEN BEE — CENTRAL INTELLIGENCE                                 │
│     Intent → decomposition → context → evidence → hypotheses →       │
│     planning → delegation → validation → contradiction → synthesis   │
├──────────────────────────────────────────────────────────────────────┤
│ L0  GOVERNANCE CONTROL PLANE  (cross-cutting, not a layer above)     │
│     RBAC · ABAC · RLS · GlobalUserID · classification · MFA ·        │
│     consent · audit · SoD · Hermes restriction · kill switch         │
└──────────────────────────────────────────────────────────────────────┘
```

Governance is drawn at the bottom because it is **cross-cutting**: every arrow between any two
layers passes through it. It is not a final approval step.

---

## 2. L1 — Queen Bee central intelligence

`src/lib/noelia/cognitive/queen-bee.ts`

The pipeline is a typed function chain, not a prompt:

| Stage | Function | What it actually does |
|---|---|---|
| Intent | `classifyIntent()` | Maps the question to a goal class (DECIDE / EXPLAIN / MONITOR / PLAN / ASSESS) |
| Decomposition | `decomposeQuestion()` | Splits into sub-questions with required evidence kinds |
| Context | `assembleContext()` | Resolves authorized scope; selects brains by mandate |
| Evidence | `gatherEvidence()` | Calls registered capabilities only |
| Hypotheses | `formHypotheses()` | Competing explanations, each with a falsifier |
| Planning | `planQueenBeeWork()` | Builds the DAG; asserts single identity |
| Delegation | `delegate()` | Assigns stages to brains within effective reach |
| Validation | `validateFindings()` | Rejects unsupported claims and inference-as-fact |
| Contradiction | `detectContradictions()` | Flags mutually exclusive claims |
| Synthesis | `synthesize()` | Single accountable answer, dissents preserved |
| Confidence | `scoreConfidence()` | Explainable, penalised by gaps and contradictions |

**No chain-of-thought is exposed.** The API returns conclusions, evidence references, epistemic
labels and confidence — never intermediate reasoning traces.

---

## 3. L2 — eight brains

Documented in `NOELIA_EIGHT_BRAINS.md`. Key structural fact: a brain holds a *capability
reach declaration*, never an execution path. All execution goes through the registry.

Effective reach:

```
effectiveReach(brain, caller) = brain.reach ∩ registry.authorizedToolNames(caller)
```

There is no widening path, and a test asserts it.

---

## 4. L3 — institutional memory & knowledge fabric

| Store | Purpose | Written by |
|---|---|---|
| `ai_decisions` | AI evidence: what NOELIA concluded, with provenance | Runtime (existing) |
| `noelia_decision_records` | Institutional acts: what BEYU decided | Authorized human path only |
| `enterprise_memory` | Governed organizational memory, 10 classes | Governed memory service |
| `knowledge_sources` | Documents and attributable sources | Knowledge fabric |
| `noelia_kg_edges` | Typed relationships between entities and concepts | Knowledge graph service |
| `noelia_digital_twins` | Auditable snapshots with `asOf` and basis | World model |

Five distinct stores with five distinct semantics — not one overloaded table, and not five
competing ones. The design rule was *"one store per question the institution asks."*

---

## 5. L4 — intelligence runtime

`model-gateway.ts` + `ollama-provider.ts` + `noelia-provider.ts`

### Provider state machine (truthful states only)

```
NOT_CONNECTED ──configure──► CONFIGURED ──reach──► CONNECTED ──verifyInference()──► VERIFIED
                                   │                     │
                                   └──► FAILED           └──► DEGRADED
```

**CONFIGURED ≠ VERIFIED.** The Ollama adapter is *configured* when `OLLAMA_BASE_URL` is set;
it becomes *VERIFIED* only when `verifyInference()` actually round-trips an inference and
validates the response. Merely pointing at a host never yields VERIFIED — this is asserted by
test.

### Zero-cost, local-first, with no silent paid fallback

- Ollama on `localhost` is the only model provider.
- If Ollama is unavailable, the system falls to the **deterministic analyst** and reports
  `DEGRADED` with the reason. It does not call a paid API.
- Embeddings: no paid embedding service exists in this repository. The `embedding_status`
  columns are present; nothing computes vectors via a third party.

### Degraded mode behaviour

When the model is unavailable, NOELIA still answers from deterministic analytical engines and
governed retrieval, and **states** that it is degraded. It never presents degraded output as a
full model answer. Test: `tests/noelia/cognitive-http.test.ts` asserts the provider-state
honesty path.

---

## 6. L5 — HIVE capabilities

**92 registered capabilities**, verified by constructing the real registry
(`createDefaultNoeliaToolRegistry().list()` — 92 entries, executed, not estimated):

| Family | Count | | Family | Count |
|---|---|---|---|---|
| finance | 12 | | noelia | 8 |
| mcm | 10 | | ai | 8 |
| family | 8 | | hcm | 7 |
| agriculture | 7 | | foundation | 6 |
| knowledge | 4 | | viz | 3 |
| compliance / governance / legal / memory / risk / tax | 2 each | | analytics / cross / government / health / model / pricing / ujenzi | 1 each |

`finance` includes the read-only treasury/FP&A surface; `noelia` is the 8 new cognitive
capabilities. Full inventory: `NOELIA_CAPABILITY_INVENTORY.md`.

The **12 workforce specialists** (`src/lib/noelia/cognitive/workforce.ts`) are profiles that
select a subset of these capabilities. None introduces a new engine, a new permission system or
a new execution path. `resolveWorkforceReach` computes a three-way intersection — declared reach
∩ registered capability ∩ caller authorization — so a specialist can never display or exercise
authority the caller does not hold.

---

## 7. Honest scope boundaries

The mission's five layers are implemented as described **with these limits stated plainly**:

| Area | Limit |
|---|---|
| Local embeddings | Schema present; no embedding model wired. Retrieval is keyword + governed memory, not vector search. |
| Model diversity | One local provider. "Multi-model" would overstate it. |
| Autonomy | L6 (unattended autonomous action) is **disabled** and has no activation path. |
| Physical twin | No asset telemetry source exists; not claimed. |
| Real-time voice/video/OCR | Not implemented; not claimed. |
| Cross-institution federation of NOELIA | Not implemented; a single tenant-scoped instance. |
