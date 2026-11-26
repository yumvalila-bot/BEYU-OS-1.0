# NOELIA — Institutional Decision Memory

**Status:** IMPLEMENTED
**Implementation:** `src/lib/noelia/cognitive/decision-memory.ts`
**Table:** `noelia_decision_records` (migration 0084)
**Capability:** `noelia.decision_memory.query`
**Tests:** `tests/noelia/cognitive-core.test.ts`, `tests/noelia/cognitive-http.test.ts`

---

## 1. The distinction that justifies a new table

`ai_decisions` already exists and records **what NOELIA concluded**: recommendations,
confidence, evidence, model used. It is an AI evidence store.

`noelia_decision_records` records **what the institution decided**: a human accountable act,
its rationale, its authority, its effective period and its supersession chain. It is an
institutional act store.

Conflating them would mean an AI recommendation could be mistaken for a governance decision.
They are separated, cross-referenced by `sourceDecisionId`, and neither is derivable from the
other.

| Aspect | `ai_decisions` | `noelia_decision_records` |
|---|---|---|
| Who is accountable | The system (provenance) | A named human role |
| Mutability | Append-only evidence | Supersede, never overwrite |
| Question answered | "What did NOELIA infer?" | "What did BEYU decide?" |
| Feeds governance | No | Yes |

---

## 2. Lifecycle

```
PROPOSED ──► EFFECTIVE ──► SUPERSEDED
    └──────► WITHDRAWN
```

- **PROPOSED** — raised through the governed path, awaiting authority.
- **EFFECTIVE** — an authorized human act. Only `EFFECTIVE` records are treated as
  institutional precedent by the Institutional Brain.
- **SUPERSEDED** — replaced by a newer decision; `supersededBy` points forward, and the
  original is retained verbatim.
- **WITHDRAWN** — never became precedent.

`effectiveTo` is never used to hide history; the row survives every transition.

---

## 3. Provenance

Every record carries:

- `decidedByRole` — the accountable role (not "the AI"),
- `decidedAt` — a real timestamp,
- `authority` — the instrument under which the decision was taken,
- `rationale` — the reasoning as recorded by the decision-maker,
- `evidenceRefs` — pointers to `ai_decisions`, documents and knowledge sources,
- `domain` / `entityId` / `countryCode` — the scope it binds,
- `classification` — inherited classification, enforced by RLS on read.

A decision with no accountable role cannot be created: the column is `NOT NULL` and the
service rejects empty roles.

---

## 4. Retrieval rules

`noelia.decision_memory.query` returns decisions **in the caller's authorized scope only**,
filtered by:

- entity and country scope (from grants, never from the request),
- classification ≤ caller clearance,
- domain and status when specified.

Two honesty behaviours are asserted by HTTP test:

1. When nothing matches, the response returns an explicit `whatIsMissing` explanation rather
   than an empty success object.
2. When records exist, each carries its status and provenance — never a bare summary that
   loses the fact/decision distinction.

---

## 5. Supersession integrity

- A record may be superseded only by a later record in the same domain and scope.
- `supersededBy` must reference an existing record; the FK enforces it.
- Superseding does not delete or edit the original. Tests assert the original row is still
  readable with status `SUPERSEDED`.

---

## 6. Continuity

The mission asks for institutional continuity — the institution should still know what it
decided after staff change. This is satisfied structurally: decisions are rows, not
conversation state, they are scoped to entities rather than to users, and retrieval is by
domain rather than by who asked last time.

---

## 7. What is NOT claimed

| Not claimed | Reality |
|---|---|
| "NOELIA makes decisions" | NOELIA cannot create an `EFFECTIVE` record. Only an authorized human path can. |
| "Decision quality is scored" | Not yet. Scoring is a Learning Brain proposal with no automatic application. |
| "Every historical decision is captured" | No. Only decisions recorded through this surface exist here. |
