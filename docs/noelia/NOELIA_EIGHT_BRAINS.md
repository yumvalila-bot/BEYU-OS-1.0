# NOELIA — The Eight Cognitive Brains

**Status:** IMPLEMENTED (schema declaration + registry-bound capabilities)
**Implementation:** `src/lib/noelia/cognitive/brain-contracts.ts`
**Tests:** `tests/noelia/cognitive-core.test.ts` (34 tests), `tests/noelia/cognitive-registry.test.ts` (9)

---

## 1. What a "brain" is

A brain is a **declaration**, not a process, a model or an assistant. It states:

- a mandate,
- an input contract,
- an output contract (which epistemic kinds it may emit),
- a **capability reach** (the maximum set of registered capabilities it may use),
- the permissions a caller must hold,
- memory classes it may read,
- evaluation criteria,
- and that it may not alter authoritative records.

It contains **no execution path**. A brain cannot invoke a capability; only
`NoeliaToolRegistry` can, and the registry re-checks RBAC/ABAC/tenant/entity/country/
classification/approval on every call.

### The effective-reach rule

```
effectiveReach(brain, caller) = brain.capabilityReach ∩ registry.authorizedToolNames(caller)
```

There is no way to widen this from inside a brain. `effectiveBrainReach()` is the single
implementation, and it is asserted by test to never return an unauthorized capability.

---

## 2. The roster

| # | Brain | Mode | Declared reach | Mandate summary |
|---|---|---|---|---|
| 01 | Executive | ADVISORY | 15 | Strategic options, priorities, decision-ready briefings |
| 02 | Institutional | READ_ONLY | 6 | Constitution, hierarchy, entities, governance, decision history |
| 03 | Knowledge | READ_ONLY | 3 | Ingest/index/retrieve with permission filtering before assembly |
| 04 | Analytical | READ_ONLY | 5 | Quantitative, financial, operational analysis |
| 05 | Operational | READ_ONLY | 1 | Workflow and execution coordination (through registry) |
| 06 | Learning | READ_ONLY | 1 | Evaluation against golden cases; verified corrections |
| 07 | Collective | ADVISORY | 2 | Independent specialist analysis; disagreement preserved |
| 08 | Personal Context | READ_ONLY | 1 | Authorized preferences; role-aware assistance |

`GOVERNED_WRITE` exists as a mode in the type system but **no brain declares it**; a
brain that wanted to mutate would have to say so explicitly rather than drifting into it.

---

## 3. Brain by brain

### BRAIN 01 — Executive
Consumes an authorized question, a horizon, the resolved scope and governing objectives.
Produces strategic options, priorities and briefings — always as `RECOMMENDATION` with a
stated `whatWouldChange`. It composes Finance, Risk, Compliance, Governance and Workforce
evidence; it does not replace any of them. It never decides.

### BRAIN 02 — Institutional
The voice of the Constitution and the record. It answers "what does BEYU require, forbid,
or have already decided?" from `legal_entities`, `governance_*`, `knowledge_sources` and
`noelia_decision_records`. It distinguishes recorded from derived state and refuses to
invent a relationship.

### BRAIN 03 — Knowledge
Governed retrieval. Authorization and classification filtering happen **in SQL** before
rows leave PostgreSQL, so unauthorized text never enters model context — the requirement
that "unauthorized information must not enter the model context" is enforced at the query,
not by redaction afterwards.

### BRAIN 04 — Analytical
Runs over the existing canonical specialist engines (treasury, risk, FP&A, forecast). Its
contract enforces: missing data is `UNAVAILABLE` not zero; forecasts are never actuals;
confidence is explainable.

### BRAIN 05 — Operational
Coordinates workflows and execution **through** `noelia.operations.status` and the existing
workflow endpoints. It cannot run a step itself; workflow execution re-checks authorization
at each step boundary.

### BRAIN 06 — Learning
Scores answers against golden cases, compares to a recorded baseline, and may raise a
**correction proposal**. A proposal is always `PENDING_APPROVAL`; there is no code path that
applies one automatically, and a proposal that mentions permissions, roles, policy or RLS is
rejected outright.

### BRAIN 07 — Collective
Convenes the Intelligence Council. Its defining property is that it does **not** manufacture
consensus: duplicate opinions are collapsed to one, contradictions between FACT claims are
preserved as dissent, and confidence is penalised for disagreement rather than smoothed.

### BRAIN 08 — Personal Context
Reads the caller's **own** resolved context (role, tenant, clearance, entity scope). It
cannot read another user's context and cannot widen authorization. Personal context is not
institutional evidence.

---

## 4. Single-identity invariant

```ts
assertSingleIdentity("NOELIA")   // ok
assertSingleIdentity("HEALTH-ASSISTANT") // throws
```

No brain may introduce a competing identity. The Command Centre renders every brain as
`NOELIA · <Brain title>`, never as a separate assistant. `planQueenBeeWork()` calls the guard
on every plan so a future edit cannot quietly rename the system into a second persona.

---

## 5. What is NOT implemented (stated plainly)

| Claim sometimes made | Reality here |
|---|---|
| "Eight independent LLMs" | No. Eight logical capabilities over one model gateway. |
| "Brains learn autonomously" | No. Learning is measurement + human-approved correction. |
| "Brains can act" | No. All eight are observation/advisory. L6 autonomy remains disabled and has no activation path. |
| "Brains have separate memory stores" | No. They declare memory *access classes*; the store is the one governed memory fabric. |
