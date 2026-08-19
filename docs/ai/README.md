# Noelia AI & the HIVE runtime

**Noelia is the single AI identity of the BEYU ecosystem.** HIVE is the runtime that executes it.
Noelia is not an autonomous agent and holds no independent authority.

## Governed pipeline (`src/lib/noelia.ts`)

```
REQUEST → IDENTITY → AUTHORIZATION → CONTEXT → POLICY → DATA RETRIEVAL → KNOWLEDGE RETRIEVAL
→ ANALYSIS → TOOL EXECUTION → VALIDATION → RISK CHECK → HUMAN REVIEW (if required)
→ RECOMMENDATION → AUDIT → MONITORING
```

- **Identity** — Noelia executes as the requesting principal and inherits exactly their roles,
  tenant, clearance and data scope. It can never exceed them.
- **Authorization** — each intelligence engine maps to a capability
  (FINANCIAL → `finance:capital.read`, RISK → `risk:register.read`, TAX → `finance:tax.read`, …).
  Missing capabilities are returned as `deniedScopes`, never silently bypassed.
- **Policy** — `CONST-AI-001` denies AI-initiated ownership changes, beneficiary changes and
  financial postings, and requires human review over HIGHLY_RESTRICTED data.
- **Retrieval** — RAG over `platform.knowledge_sources`, restricted to `AUTHORITATIVE` sources
  within their review window. Outdated knowledge is never authoritative.
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
