# NOELIA — Epistemics Matrix (Iteration 10)

**Status: 🟢 IMPLEMENTED / VERIFIED**
**Single source of truth for epistemic states:** `src/lib/finance/epistemics.ts` (Phase 7J §5).
**Noelia consumption layer:** `src/lib/noelia/epistemics.ts` (this iteration).
**Tests:** `tests/noelia/epistemics.test.ts` (36), `tests/noelia/epistemics-integration.test.ts` (3).

---

## 1. Canonical epistemic states

The program brief referenced "12 canonical epistemic states". The canonical
model actually defines **13** states (the 12th state of the original
vocabulary plus `REQUIRES_POLICY`, which Phase 7J added to distinguish
policy-pending from authority-pending datums). All 13 are shared with
Finance OS — Noelia does not invent a parallel vocabulary.

| # | State | Meaning | Carries value? |
|---|-------|---------|----------------|
| 1 | `POSTED` | Booked accounting truth (posted journal line) | yes |
| 2 | `OBSERVED` | Directly measured from a real source | yes |
| 3 | `DERIVED` | Computed from POSTED/OBSERVED by deterministic rule | yes |
| 4 | `FORECAST` | Projection; never a fact about the past | yes |
| 5 | `ASSUMPTION` | Input someone chose | yes |
| 6 | `SCENARIO` | Hypothetical world | yes |
| 7 | `REFERENCE_DATA` | Static lookup data; never authority | yes |
| 8 | `SYNTHETIC` | Test fixture; never production truth | yes |
| 9 | `REQUIRES_AUTHORITY` | Cannot be determined without ratified authority | **no** |
| 10 | `REQUIRES_POLICY` | Cannot be determined without resolved policy | **no** |
| 11 | `GOVERNANCE_REVIEW_REQUIRED` | Ownership/attribution unclear | **no** |
| 12 | `DATA_NOT_AVAILABLE` | Data genuinely does not exist — explicitly **not zero** | **no** |
| 13 | `DATA_CONFLICT` | Sources disagree, no ratified winner | **no** |

## 2. Transition matrix (verified: 13×13 = 169 transitions)

`canPromote(from, to)` in `finance/epistemics.ts` is the one enforcement
point. Rule order (all deny-by-default):

1. `from === to` → allowed.
2. `SYNTHETIC` in either direction → denied.
3. `to === POSTED` → allowed only from `OBSERVED` (genuine booking).
4. `from === REFERENCE_DATA` → denied (never authority, never fact).
5. `from` is a non-value state → denied (a missing value cannot become a value).
6. Otherwise allowed only when `rank(to) > rank(from)` (weakening only).

The complete matrix is exercised cell-by-cell in
`tests/noelia/epistemics.test.ts › canonical epistemic model › enforces the
complete 13×13 promotion matrix`.

Key prohibitions (adversarially tested):

- `FORECAST → POSTED` denied — **forecast ≠ actual**
- `FORECAST → OBSERVED` denied
- `ASSUMPTION → POSTED`, `SCENARIO → POSTED` denied
- `DATA_NOT_AVAILABLE → OBSERVED/POSTED` denied — **missing ≠ zero**
- `SYNTHETIC → *` denied
- `REFERENCE_DATA → *` denied
- Weakening (`POSTED → FORECAST`, `OBSERVED → SCENARIO`, …) allowed.

## 3. The 7 honesty rules — enforcement and tests

| Rule | Enforced by | Test |
|------|-------------|------|
| 1. missing ≠ zero | `classifiedValue`/`unavailable` (finance), `assertNoValueCoercion` (noelia) | honesty rule 1; A6 |
| 2. forecast ≠ actual | `canPromote`, `buildRecommendation` (FORECAST_PRESENTED_AS_ACTUAL) | honesty rule 2; A4 |
| 3. inference ≠ fact | `resolveOutputClass` (INFERENCE findings / non-direct evidence ⇒ never FACT) | honesty rule 3; A5 |
| 4. stale ≠ current | `isSourceStale` + `assessEvidence` (cap 0.7, STALE_IS_NOT_CURRENT factor) | honesty rule 4; A2; A8; integration |
| 5. unverified ≠ authoritative | `assessEvidence` (authorityStatus ≠ AUTHORITATIVE ⇒ cap 0.6) | honesty rule 5; A7; integration |
| 6. unavailable ≠ negative | `assessEvidence` (no evidence ⇒ DATA_NOT_AVAILABLE, cap 0.5) | honesty rule 6 |
| 7. absence of evidence ≠ evidence of absence | `assessEvidence` + `resolveOutputClass` (no sources ⇒ UNCERTAINTY, never FACT of absence); absence findings phrased as scoped retrieval statements | honesty rule 7; A1; A12 |

## 4. Answer pipeline (SOURCE → … → OUTCOME)

```
SOURCE (tool output sources[])
  → DATA QUALITY (authorityStatus, validity window: effectiveFrom/reviewDate/expiresAt)
  → PROVENANCE (kind/ref/label/authority required; missing ⇒ downgrade 0.6)
  → EPISTEMIC STATE (per-source epistemicClass; answer claims weakest link)
  → CONFIDENCE (weakest-link: min(tool self-report, evidence cap))
  → UNCERTAINTY (explicit NoeliaAnswer.uncertainty block: classification,
    confidenceCap, factors[], 6 flags)
  → RECOMMENDATION (NoeliaRecommendation envelope, §5)
  → ACTION (only through governed noelia_action_requests; approval by a
    separate human; execution re-checks authority — see workflow matrix)
  → OUTCOME (persisted atomically with audit + event in ai_decisions.output)
```

Runtime wiring: `NoeliaRuntime.ask()` builds `EvidenceRecord[]` from tool
sources (undeclared `epistemicClass` defaults to **DERIVED**, never
OBSERVED — conservative), runs `assessEvidence`, clamps confidence, and
resolves `outputClass` via `resolveOutputClass`.

**Conflict preservation (finding from this iteration):** the previous runtime
deduplicated sources by `kind:ref` *before* assessment, silently collapsing
contradictory claims about the same subject. Deduplication now collapses only
identical claims (same authority + same epistemic class); distinct claims
survive to be classified as `conflictingSources` ⇒ REQUIRES_HUMAN_REVIEW.

**Single-datum preservation:** a single OBSERVED evidence record stays
OBSERVED (the finance `combineClasses` demotes even one observed input,
which is correct for arithmetic composition but wrong for evidence
classification — the Noelia layer special-cases single records).

## 5. Recommendation envelope (required fields)

`NoeliaRecommendation` (built by `buildRecommendation`, audited by
`verifyRecommendation`):

| Field | Requirement |
|-------|-------------|
| `id`, `engine`, `statement` | mandatory (INCOMPLETE_ENVELOPE) |
| `epistemicStatus` | canonical class; factual status ⇒ evidence required (fail-closed) |
| `evidence` | cited sources; provenance-complete (ref + authority) |
| `assumptions` | explicit list |
| `confidence` | 0..1, ≤ evidence cap (clamped; clamp recorded) |
| `uncertainty` | classification + confidenceCap + factors |
| `limitations` | explicit list |
| `alternatives` | explicit list |
| `changeConditions` | when the recommendation would change |
| `provenance` | sourceOfTruth, retrievedAt, traceId, decisionId |
| `freshness` | asOf + stale flag |
| `classification` | ABAC classification of the record |
| `scope` | tenantId / legalEntityId / countryCode |
| `materiality` | LOW / MEDIUM / HIGH (HIGH ⇒ authorizationRequired) |
| `risk` | LOW / HIGH (HIGH ⇒ authorizationRequired) |
| `authorizationRequired` | forced true for humanReview / HIGH materiality / HIGH risk |
| `authorizationBasis` | policy reference when authorization is required |
| `humanReviewRequired` | from policy obligations + engine rules |

`verifyRecommendation` violation codes: `INCOMPLETE_ENVELOPE`,
`MISSING_EVIDENCE_FOR_FACTUAL_CLAIM`, `CONFIDENCE_EXCEEDS_CAP`,
`FORECAST_AS_ACTUAL`, `MISSING_PROVENANCE`,
`MATERIALITY_WITHOUT_AUTHORIZATION`, `FABRICATED_CERTAINTY`,
`ABSENCE_ASSERTED_AS_EVIDENCE`.

## 6. The 12 adversarial scenarios — coverage

| # | Scenario | Coverage |
|---|----------|----------|
| 1 | missing source | A1 + runtime "missing source ⇒ UNCERTAINTY" + rule 7 |
| 2 | stale source | A2 + runtime "downgrades a stale source" + integration (tax) |
| 3 | conflicting sources | A3 + runtime "conflicting sources fail closed" (post-fix) |
| 4 | forecast presented as actual | A4 + honesty rule 2 + matrix |
| 5 | inference presented as fact | A5 + honesty rule 3 + runtime FACT-only test |
| 6 | unavailable data | A6 + honesty rule 1 |
| 7 | low-quality data | A7 + integration (REJECTED position excluded) |
| 8 | expired authority | A8 + integration (stale tax review window excluded, visible) |
| 9 | contradictory evidence | A9 (DATA_CONFLICT dominance in combineClasses) |
| 10 | insufficient confidence | A10 (confidence < 0.5 ⇒ UNCERTAINTY) |
| 11 | missing provenance | A11 (cap 0.6 + MISSING_PROVENANCE on verify) |
| 12 | fabricated certainty | A12 (clamp to 0.5 + FABRICATED_CERTAINTY on verify) |

## 7. Consumers of the epistemic model

- `NoeliaRuntime.ask()` — outputClass + confidence + uncertainty block.
- `BeyuNoeliaEvidenceService.recordDecision` — persists
  `output.{uncertainty, assumptions, limitations}` in `ai_decisions` (jsonb; no migration needed) plus audit + `AI_DECISION_RECORDED` event.
- `BeyuNoeliaReadService` — every domain read service now emits provenance
  sources (`FINANCE_OS`, `RISK`, `OBLIGATION`, `RESOLUTION`, `TAX_STRATEGY`,
  `HCM`, `WATERFALL_RUN`, `KNOWLEDGE_SOURCE`) with `epistemicClass`,
  `authorityStatus` and validity windows where the schema carries them.
- Absence findings are phrased as **scoped retrieval statements**
  ("no … retrieved in the authorized scope"), never bare negations.
- Tax service: excluded (stale/rejected/non-authoritative) positions are
  **counted and disclosed** in the narrative (previously silent).

## 8. Residuals / classification

- `PREDICTION` output class: reserved (no engine currently emits it; the
  canonical `FORECAST` state exists for data). 🟢 by design.
- Specialist engines (fpna/risk/treasury/forecast/compliance/audit) keep
  their legacy vocabularies mapped through `normalizeEpistemicClass` —
  unchanged, still tested by their own suites.
- Live-HTTP verification of the uncertainty block in API responses is
  covered by the existing (server-gated) `tests/noelia/http.test.ts` and the
  live-HTTP workstream of Iteration 13.
