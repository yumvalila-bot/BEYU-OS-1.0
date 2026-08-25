# NOELIA — Data Governance & Epistemics

**Status:** IMPLEMENTED (2026-08-25)

## Canonical epistemic statuses (12)

`OBSERVED · DERIVED · FORECAST · SCENARIO · INFERENCE · RECOMMENDATION ·
PREDICTION · UNCERTAINTY · UNAVAILABLE · UNVERIFIED · STALE ·
REQUIRES_HUMAN_REVIEW`

Mapped deterministically from every BEYU basis in `epistemics.ts`:

| BEYU basis | canonical status |
|---|---|
| OBSERVED / POSTED | OBSERVED |
| DERIVED | DERIVED |
| FORECAST | FORECAST |
| SCENARIO / SIMULATION_ONLY | SCENARIO |
| ASSUMPTION / ASSUMED / POTENTIAL_ANOMALY | INFERENCE |
| PREDICTION | PREDICTION |
| DATA_NOT_AVAILABLE | UNAVAILABLE |
| DATA_CONFLICT | UNCERTAINTY |
| UNVERIFIED | UNVERIFIED |
| STALE | STALE |
| REQUIRES_POLICY / AUTHORITY / HUMAN_REVIEW / GOVERNANCE_REVIEW | REQUIRES_HUMAN_REVIEW |

## Rules enforced in code

1. **Missing ≠ zero**: `DATA_NOT_AVAILABLE` is never rendered as `0`; e.g.
   treasury maturity profile (no maturity column) returns UNAVAILABLE with an
   explanation; empty scope headcount returns UNAVAILABLE, not 0.
2. **Forecast ≠ actual**: FORECAST/SCENARIO outputs are tagged and narrated as
   never-actuals; forecasts without observed history are UNAVAILABLE.
3. **Inference ≠ fact**: `NoeliaFinding.kind` is coarse
   (FACT/INFERENCE/RECOMMENDATION); the canonical epistemic truth is `status`.
4. **Stale ≠ current**: authoritative-in-window filtering
   (`effectiveFrom ≤ today ≤ reviewDate`, `expiry ≥ today`, supersession) in
   legal/knowledge/tax; expired authority is never treated as current.
5. **Unverified ≠ authoritative**: knowledge sources only eligible as FACT
   when AUTHORITATIVE + in-window; otherwise UNVERIFIED/REQUIRES_HUMAN_REVIEW.
6. **Unknown authority fails closed**: unknown legal/tax citation →
   `REQUIRES_AUTHORITY` (legal-service `authorityStatus`).
7. **Health**: no registered integration → UNAVAILABLE; clinical data is
   never fabricated.
8. **Confidence is explainable**: `explainableConfidence` = 0.7·mean +
   0.3·strongest (cap 0.97; ×0.85 without sources); never a constant max.
9. **Recommendations carry the full contract**: rationale, evidence,
   assumptions, uncertainty, limitations, confidence, sourceProvenance,
   whatWouldChange, risks, alternatives, humanDecisionRequired.

## Data-quality propagation

- Variance without a budget substrate → REQUIRES_HUMAN_REVIEW (never an
  invented budget).
- Turnover rates without a ratified denominator policy → counts only,
  UNAVAILABLE for rates.
- FX without a ratified rate → REQUIRES_AUTHORITY (SAME_CURRENCY identity
  resolves; cross-currency does not).
- Reconciliation without both sides → its honest state
  (DATA_NOT_AVAILABLE / REQUIRES_AUTHORITY), never "reconciled".
- Anomaly detection requires ≥4 samples (|z|>2); otherwise UNAVAILABLE.
- Trend classification has a 2% deadband (FLAT).
