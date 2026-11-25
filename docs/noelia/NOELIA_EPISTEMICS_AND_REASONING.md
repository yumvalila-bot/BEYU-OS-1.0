# NOELIA — Reason, Epistemics & Anti-Hallucination

**Status:** IMPLEMENTED
**Implementation:** `src/lib/noelia/cognitive/reasoning.ts`, `src/lib/noelia/epistemics.ts`

---

## 1. The epistemic vocabulary

Every material claim carries exactly one label:

| Label | Meaning | May be summed? | May be stored as a metric? |
|---|---|---|---|
| `FACT` | Read directly from a governed record | Yes | Yes |
| `INFERENCE` | Derived by stated logic from facts | Only with derivation shown | Labelled only |
| `ASSUMPTION` | Declared input, not verified | No | No |
| `PREDICTION` | Forward-looking, model-based | No | No |
| `RECOMMENDATION` | Judgement; accountable human required | No | No |
| `UNKNOWN` | Not knowable from available evidence | No | No |
| `SIMULATION` | Scenario output, not a record | No | No |

`epistemics.ts` provides the canonical status set and the helpers; `reasoning.ts` supplies the
claim/hypothesis/contradiction/synthesis primitives that carry the labels.

---

## 2. Hard invariants

These are code-level assertions, each covered by test:

1. **Missing ≠ zero.** A missing value is `UNAVAILABLE`/`UNKNOWN`; it never becomes `0`.
2. **Forecast ≠ actual.** A predicted figure cannot occupy the actual slot; the types differ.
3. **Recommendation ≠ decision.** `RECOMMENDATION` requires `humanReviewRequired: true`.
4. **Simulation ≠ record.** `SIMULATION` results carry `resultClass` and never a record id.
5. **Inference must show its derivation.** An `INFERENCE` without `derivedFrom` is rejected.
6. **No silent upgrade.** A downstream consumer cannot relabel a claim to a stronger status.

---

## 3. Reasoning primitives

| Primitive | Purpose |
|---|---|
| `makeClaim()` | Creates a labelled claim, rejecting empty evidence on FACT |
| `formHypothesis()` | Competing explanation with an explicit `falsifier` |
| `detectContradictions()` | Finds mutually exclusive FACT/INFERENCE pairs |
| `validateFindings()` | Rejects unsupported claims, inference-as-fact, and unsourced numbers |
| `synthesize()` | Produces one accountable answer preserving dissent |
| `scoreConfidence()` | Explainable confidence with named penalties |

### Confidence is explainable, not decorative

```
confidence = base
           − gapPenalty      (missing required evidence)
           − contradictionPenalty (unresolved dissent)
           − stalenessPenalty (evidence older than its class allows)
```

Every adjustment is returned in `confidenceBasis`, so a reader can see *why* a number is 0.58
rather than being told to trust it.

---

## 4. No exposed chain-of-thought

The reasoning chain is internal. What the API returns:

- the conclusion,
- the epistemic label,
- the evidence references (`sourceProvenance`),
- the assumptions,
- the confidence and its basis,
- what would change the answer.

It never returns intermediate deliberation text. This is both a product decision and a
security one: raw reasoning is an injection and leakage surface.

---

## 5. Where this is enforced end-to-end

| Layer | Enforcement |
|---|---|
| Tool outputs | Registry validates output against the declared Zod contract |
| Synthesis | `validateFindings()` rejects unsupported claims |
| API | `cognitiveRoute` parses the response schema; a contract violation is 422 |
| Persistence | `ai_decisions` stores labels with the evidence |
| UI | Badges render the label; a `SIMULATION` cannot look like a `FACT` |

The HTTP suite asserts the contract at the boundary: a malformed output yields `422`, not a
silently degraded success.
