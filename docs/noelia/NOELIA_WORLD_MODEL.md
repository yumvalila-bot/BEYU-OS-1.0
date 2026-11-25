# NOELIA — Institutional World Model & Digital Twin

**Status:** IMPLEMENTED (PostgreSQL-native, evidence-only)
**Implementation:** `src/lib/noelia/cognitive/world-model.ts`, `drizzle/0084_noelia_cognitive_core.sql`
**Capability:** `noelia.world_model.query`
**Tests:** `tests/noelia/cognitive-core.test.ts`, `tests/noelia/cognitive-http.test.ts`

---

## 1. Why there is no graph database

The mission allowed a graph database only with a documented evaluation. The evaluation was
performed and the answer is **no**, for three reasons:

1. **The graph already exists.** `legal_entities.parent_entity_id`, `entity_ownership`, the
   ownership/waterfall tables and `governance_*` already encode the corporate hierarchy with
   enforced referential integrity and row-level security.
2. **A second datastore would break the security model.** RLS policies, `GlobalUserID` scoping
   and the `beyu_runtime` least-privilege role apply to PostgreSQL. A graph database would
   need a parallel authorization implementation, and *any* divergence is a cross-tenant leak.
3. **The workload does not justify it.** Institutional relationship queries are bounded
   (dozens of entities, hundreds of edges), which PostgreSQL recursive CTEs handle without
   measurable cost.

**Decision recorded:** typed edges live in `noelia_kg_edges`, in the same database, under the
same RLS. If volume ever exceeds the CTE approach, the edge table is the migration source for
a purpose-built store — but that is a future, evidence-driven decision, not a default.

---

## 2. Evidence-only construction

The world model has exactly one rule: **it reports what the database holds, and says so when
the database holds nothing.**

```ts
{
  entities: [...],          // from legal_entities in the caller's authorized scope
  relationships: [...],     // from noelia_kg_edges
  capabilities: {...},      // from the registry, filtered by authorization
  metrics: [{
     name: "Institutional financial position",
     classification: "FINANCIAL_VALUES",
     state: "UNAVAILABLE",
     source: "FINANCE_OS",
     note: "Finance OS is the operational source of truth. NOELIA does not
            estimate, infer or restate financial values."
  }]
}
```

There is no code path that fills a financial metric with a computed or estimated number.
`FINANCIAL_VALUES` is *always* reported as `UNAVAILABLE` in the world model, because the
authoritative value is a Finance OS record that this surface does not read directly.

---

## 3. Digital twin

`noelia_digital_twins` (migration 0084) records a twin as a **snapshot of a real entity
hierarchy plus declared metrics**, with:

- `basis` — what the snapshot was derived from,
- `asOf` — the instant the snapshot describes (never "now" by implication),
- `confidence` and `confidenceBasis`,
- `sourceTables` — the tables actually read,
- `metricStates` — per-metric state, including `UNAVAILABLE`.

A twin is a *historical artifact*. It is regenerated, never mutated in place, so a past
snapshot cannot silently change to match a present narrative.

The pre-existing `src/lib/viz/digital-twin.ts` 12-facet abstraction remains the rendering
layer for `/os/viz`. It is **not** the institutional twin and is not claimed to be. The
distinction is deliberate: one is a visualization model, the other is an auditable snapshot.

---

## 4. Cross-entity and cross-OS isolation

The world model resolves scope through `resolveNoeliaAuthorizedScope()`, the same service the
query runtime uses. Consequences, each asserted by test:

- An entity outside the caller's authorized entity set is **absent from the result**, not
  masked.
- A country outside the caller's authorized country set contributes nothing.
- A `HEALTH_OS`-scoped caller cannot see `FINANCE_OS` entities.
- There is no "view all" parameter. Scope is derived from grants, not from the request.

---

## 5. What is explicitly NOT claimed

| Not claimed | Why |
|---|---|
| "Real-time twin of the whole institution" | Snapshots are taken on demand and stamped `asOf`. |
| "Predictive twin" | Prediction is `scenario-engine.ts`, labelled `SIMULATION`, and never written back. |
| "Physical/asset twin" | No asset-telemetry source exists in this repository. |
| "Twin reflects Finance OS balances" | Finance values are `UNAVAILABLE` by design. |
