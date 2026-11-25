# NOELIA — Intelligence Council

**Status:** IMPLEMENTED
**Implementation:** `src/lib/noelia/cognitive/council.ts`
**Tables:** `noelia_council_sessions`, `noelia_council_findings` (migration 0084)
**Permission:** `ai:executive.read`
**Capability:** `noelia.council.deliberate`

---

## 1. Purpose

The Council produces **independent specialist findings on one question**, then records where
they agree and where they do not. Its value is the disagreement, not a tidy summary.

Enabled positions: Executive, Institutional, Knowledge, Analytical, Operational, Learning,
Collective, Personal Context — each sourced from the brain contract, so a position's declared
reach is the brain's declared reach. There is no ad-hoc member list.

---

## 2. The anti-synthesis rules

These are the core of the design, and each is asserted by test:

| Rule | Implementation |
|---|---|
| **No manufactured consensus.** | Findings are never averaged into one voice. |
| **Duplicates collapse.** | Two positions asserting the identical claim become one finding with multiple `supportedBy` names, not fake corroboration. |
| **Contradictions are preserved.** | Opposing `FACT` claims are emitted as `dissent`, not resolved by vote. |
| **Confidence is penalised for disagreement.** | `sessionConfidence < max(memberConfidence)` whenever dissent exists. Disagreement can only lower confidence. |
| **Every finding is attributable.** | Each carries `position`, `claim`, `epistemicStatus`, `confidence`, `basis`. |
| **The Council does not decide.** | `humanReviewRequired: true` always; narrative always contains "not a decision". |

The last rule is enforced in three independent places — the return type, the narrative
string and the HTTP test — so a future refactor cannot quietly drop it.

---

## 3. Deliberation flow

```
question ──► scope resolution ──► position eligibility (brain reach ∩ caller authz)
         ──► per-position findings (epistemic status required)
         ──► dedupe (identical claim + status ⇒ one finding, multiple supporters)
         ──► contradiction pass (opposing FACTs ⇒ dissent entry)
         ──► confidence aggregation (penalised by dissent)
         ──► persist session + findings (auditable) ──► return
```

Nothing is retrieved that the caller is not authorized to see: positions only run
capabilities in the effective-reach intersection.

---

## 4. Persistence and audit

Every session writes a `noelia_council_sessions` row and one `noelia_council_findings` row per
finding, including dissents. This means:

- a past deliberation can be re-read exactly as it happened,
- dissent cannot be edited out later,
- the audit trail shows which question produced which findings.

Sessions are scoped by tenant/entity/country and protected by RLS.

---

## 5. What the Council is not

| Not | Reality |
|---|---|
| A voting body | No votes. Disagreement is recorded, not outvoted. |
| A decision-making organ | `humanReviewRequired` is unconditional. |
| A multi-model ensemble | One gateway, several *roles*, not several vendors. |
| A consensus generator | Its explicit design goal is the opposite. |

---

## 6. Example response shape

```json
{
  "question": "Should BEYU expand hospital operations into Rwanda?",
  "findings": [
    { "position": "Analytical", "claim": "...", "epistemicStatus": "INFERENCE",
      "confidence": 0.62, "basis": ["finance.fpa.statement"] },
    { "position": "Institutional", "claim": "...", "epistemicStatus": "FACT",
      "confidence": 0.9, "basis": ["governance.resolution.query"], "supportedBy": ["Knowledge"] }
  ],
  "dissent": [
    { "topic": "capital adequacy", "positions": ["Analytical", "Operational"],
      "detail": "Analytical models surplus; Operational reports committed capex." }
  ],
  "confidence": 0.58,
  "humanReviewRequired": true,
  "narrative": "Independent findings recorded. This is not a decision..."
}
```
