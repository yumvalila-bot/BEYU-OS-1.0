# Noelia AI & the HIVE runtime

**Noelia is the single AI identity of the BEYU ecosystem.** HIVE is the runtime that executes it.
Noelia is not an autonomous agent and holds no independent authority.

## Governed pipeline (`src/lib/noelia.ts`)

```
REQUEST → IDENTITY → AUTHORIZATION → CONTEXT → POLICY → DATA RETRIEVAL → KNOWLEDGE RETRIEVAL
→ ANALYSIS → TOOL EXECUTION → VALIDATION → RISK CHECK → HUMAN REVIEW (if required)
→ RECOMMENDATION → AUDIT → MONITORING
```

The enforceable data boundary is:

```
Noelia intelligence
  → registered capability/tool (`noelia/tool-registry.ts`)
  → named BEYU service (`noelia/read-services.ts`)
  → canonical context-aware `db`
  → transaction-scoped tenant context (`SET LOCAL`)
  → PostgreSQL
  → atomic decision/audit/event evidence
```

Noelia runtime and tool registry import no database handle. Tool names are not authority: unknown,
unregistered, unauthorized, cross-tenant, cross-entity, cross-country, context-free and unapproved
high-risk invocations fail closed before a service handler runs.

- **Identity** — Noelia executes as the requesting principal and inherits exactly their roles,
  tenant, clearance and data scope. It can never exceed them.
- **Authorization** — each intelligence engine maps to a capability
  (FINANCIAL → `finance:capital.read`, RISK → `risk:register.read`, TAX → `finance:tax.read`, …).
  Missing capabilities are returned as `deniedScopes`, never silently bypassed.
- **Policy** — `CONST-AI-001` denies AI-initiated ownership changes, beneficiary changes and
  financial postings, and requires human review over HIGHLY_RESTRICTED data.
- **Retrieval** — RAG over `knowledge_sources`, restricted in SQL to `AUTHORITATIVE` sources
  within their review window, classification ceiling and finite scope. Scope is explicit:
  `GLOBAL`, `ENTERPRISE`, `TENANT`, `ENTITY` or `COUNTRY`. `ENTERPRISE` requires an enterprise
  principal and an in-subtree tenant; it is never treated as global. Outdated knowledge is never
  authoritative.
- **Output classification** — every answer is labelled FACT, INFERENCE, RECOMMENDATION,
  PREDICTION, UNCERTAINTY or REQUIRES_HUMAN_REVIEW, with a confidence score and cited sources.
- **Audit** — every interaction writes `platform.ai_decisions` (user, agent, model, model version,
  prompt version, inputs, retrieved sources, tools, output, confidence, policy decision, denied
  scopes, human review state, latency) plus an audit entry and an `AI_DECISION_RECORDED` event.

## Model & prompt governance

`model`, `modelVersion` and `promptVersion` are recorded on every decision. Model routing is
deterministic and inspectable (`routeEngine`). Provider abstraction keeps the runtime portable; the
default analyst is deterministic so that behaviour is reproducible and evaluable. External model
providers are registered as governed integrations with secrets held by reference only.

## Human accountability (Constitution Art. 6)

AI may analyse, summarise, detect, classify, predict, calculate and automate authorised low-risk
workflows. Human accountability is **mandatory** for legal rights, major financial commitments,
governance decisions, employment consequences, beneficiary rights, healthcare decisions,
regulatory declarations, high-risk compliance decisions, major capital allocation, ownership,
trust/family governance and irreversible actions.

Governed action intent is stored in `noelia_action_requests`; it is evidence, not authority. The
identities remain separate throughout the lifecycle:

- `requesting_human_id` — whose authority and scope Noelia inherits;
- `executing_ai = NOELIA` — the AI identity preparing/executing through HIVE;
- `approving_human_id` — a separate accountable maker/checker, recorded only by a HUMAN action.

A denied request and its audit evidence commit together while no tool handler runs. A prepared
high-risk request creates only a pending approval. Approval is a HUMAN audit action and performs no
domain mutation. Approved execution runs authorization → registered BEYU service/domain mutation →
completion → AI audit in one transaction; a failure rolls the domain mutation back and records only
a safe failure outcome.

## Hallucination and authority controls

- No answer asserts legal, financial, clinical, regulatory, governance or compliance authority.
- Where no authoritative source is retrieved, confidence is capped and the class becomes
  `UNCERTAINTY`.
- Tax answers always route to the Tax Governance workflow and are marked
  `REQUIRES_HUMAN_REVIEW`.
- Compliance answers never assert a state that is not evidenced by a recorded assessment.

## Evaluation & monitoring

`ai_decisions` provides the evaluation corpus: output class distribution, confidence calibration,
denied-scope frequency, human-review backlog, latency and policy-decision mix. The control centre
surfaces "AI awaiting human review" as a first-class executive KPI.
