# NOELIA — Simulation, Prediction & Scenario Integrity

**Status:** IMPLEMENTED
**Implementation:** `src/lib/noelia/cognitive/scenario-engine.ts`
**Tables:** `noelia_simulations` (migration 0084)
**Permission:** `ai:analytics.read`
**Capability:** `noelia.scenario.simulate`

---

## 1. The rule

> **A simulation is never a record, never a balance, and never a transaction.**

Every mechanism below exists to make that rule structurally true, not just stated.

---

## 2. Structural guarantees

| Guarantee | Mechanism |
|---|---|
| Cannot be mistaken for a record | `resultClass: "SIMULATION"` is a required field, not optional metadata |
| Cannot be read as a live figure | Every metric carries `state: "SCENARIO"`; there is no `ACTUAL` value in the output type |
| Cannot be posted | No code path calls any posting capability; `CAP_POSTING` is lock-enforced elsewhere and untouched here |
| Cannot mutate live data | The simulation service only reads; it performs no writes outside `noelia_simulations` |
| Cannot be silently re-labelled | `headline` is prefixed `"Simulated (not a record): "` by the builder |
| Cannot be passed off as fact | The response includes an explicit `disclaimer` and `humanReviewRequired` |
| Cannot be replayed as idempotent truth | Row stores `inputs`, `assumptions`, `asOf` so a repeat is visibly a different run |

---

## 3. What a simulation contains

```ts
{
  scenarioName: string,
  resultClass: "SIMULATION",
  headline: "Simulated (not a record): <finding>",
  metrics: [{ name, before, after, delta, unit, state: "SCENARIO" }],
  assumptions: [{ name, value, basis, sensitivity }],
  variables: [{ name, value, range }],
  confidence: number,
  confidenceBasis: string,
  whatWouldChange: string[],
  disclaimer: string,
  humanReviewRequired: true
}
```

`assumptions` is mandatory — a simulation without stated assumptions is rejected (HTTP test
asserts 422 on an empty variable set), because an unexamined assumption is exactly how a
model becomes a fantasy.

---

## 4. UI treatment

In `/os/noelia/command-centre`, simulations are rendered with a distinct visual frame and a
`SIMULATION` badge; they are never placed in the same list as institutional decisions. The
Command Centre's decision-memory panel and simulation panel are different components reading
different tables, so a visual accident cannot merge them.

---

## 5. Dependency honesty

`noelia.scenario.simulate` depends on analytical capabilities. When those are unavailable the
simulation reports `DEGRADED` with the specific missing input, rather than substituting a
number. A simulation whose inputs are missing is *not run*; it does not fall back to plausible
defaults.

---

## 6. Prediction vs simulation

- **Prediction** — a forward-looking `PREDICTION` claim inside an analysis: "at the current
  burn rate, runway reaches 5 months in Q3." Labelled, never stored as a metric.
- **Simulation** — a whole scenario object with variables, assumptions and sensitivity.

Both are epistemically closed. Neither is ever written into a Finance OS table, and neither can
be used to justify a capital allocation without a separate human decision.

---

## 7. What is NOT claimed

| Not claimed | Reality |
|---|---|
| Monte Carlo at scale | Simple deterministic sensitivity over declared ranges. |
| Trained forecasting models | No ML forecasting. Deterministic analytical engines. |
| "What-if on real balances" | Finance OS values are not read as live inputs; the simulation runs on declared scenario inputs. |
| Regulatory capital modelling | Not implemented and not claimed. |
