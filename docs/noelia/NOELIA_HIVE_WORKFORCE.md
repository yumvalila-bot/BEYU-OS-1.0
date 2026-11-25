# NOELIA — HIVE Workforce (12 specialist capabilities)

**Status:** IMPLEMENTED (profiles over the existing registry)
**Implementation:** `src/lib/noelia/cognitive/workforce.ts` (`HIVE_WORKFORCE_PROFILES`, `resolveWorkforceReach`, `intersectDelegationReach`, `assertWorkforceIntegrity`)
**Rendered by:** `/os/noelia/command-centre` → Hive Workforce module
**Tests:** `tests/noelia/cognitive-workforce.test.ts` (14 tests)

---

## 1. Design rule: no new engines

Every specialist is a **capability profile**: a name, a mandate, an ordered capability subset,
and supervision requirements. It dispatches through `NoeliaToolRegistry` like everything else,
so it inherits RBAC, ABAC, tenant/entity/country scope, classification, approval gating and
audit with no additional code.

The rule: **a specialist may not introduce a capability that does not already exist, and may
not bypass the registry.** Both are asserted.

---

## 2. Roster

| # | Specialist | Brain | Declares | Supervision |
|---|---|---|---|---|
| 01 | Financial Analyst | Analytical | `finance.cash.position`, `finance.treasury.aggregate`, `finance.reconciliation.status`, `analytics.run` | ADVISORY_HUMAN_REVIEW |
| 02 | Risk Analyst | Analytical | `risk.register.query`, `risk.analysis` | ADVISORY |
| 03 | Compliance Officer | Institutional | `compliance.obligation.query`, `compliance.analysis` | ADVISORY_HUMAN_REVIEW |
| 04 | Governance Analyst | Institutional | `governance.resolution.query`, `governance.strategic.objectives`, `legal.knowledge.query` | ADVISORY_HUMAN_REVIEW |
| 05 | Knowledge Librarian | Knowledge | `knowledge.rag.search`, `legal.knowledge.query`, `tax.knowledge.query` | READ_ONLY |
| 06 | Operations Coordinator | Operational | `noelia.operations.status`, `noelia.personal_context.read` | READ_ONLY |
| 07 | Strategic Planner | Executive | `governance.strategic.objectives`, `noelia.scenario.simulate`, `risk.register.query`, `finance.capital.pipeline` | ADVISORY_HUMAN_REVIEW |
| 08 | Institutional Historian | Institutional | `noelia.decision_memory.query`, `noelia.knowledge_graph.query`, `governance.resolution.query`, `noelia.world_model.query` | READ_ONLY |
| 09 | Treasury Observer | Analytical | `finance.cash.position`, `finance.maturity.profile`, `finance.treasury.aggregate`, `finance.fx.view` | READ_ONLY |
| 10 | Workforce Analyst | Personal Context | `hcm.workforce.observe`, `hcm.employee.aggregate`, `hcm.turnover.analyze` | READ_ONLY |
| 11 | Sector Specialist | Analytical | `cross.os.intelligence`, `analytics.run`, `agriculture.export.analytics` | READ_ONLY |
| 12 | Evidence Auditor | Learning | `noelia.evaluation.status`, `noelia.decision_memory.query`, `noelia.knowledge_graph.query`, `memory.read`, `noelia.world_model.query` | READ_ONLY |

Every capability name above is verified to exist in the live 92-capability registry — the test
`cognitive-workforce.test.ts` asserts this, so the roster cannot drift into names that do not
resolve.

Fields that matter: `supervision`, `riskCeiling` (`LOW` for all twelve), `mayProposeWorkflow`,
`mayPost`. For all twelve, `mayPost` is **false** and `riskCeiling` is **`LOW`** — no specialist
can reach `CAP_POSTING`, `knowledge.ingest`, `knowledge.publish`, `knowledge.replace` or any
other `HIGH`-risk capability.

---

## 3. Delegation and supervision

Delegation is a governed act, not a function call:

1. The delegating brain emits a `DelegationRequest` naming the specialist, the sub-question and
   the required capability.
2. The registry checks the *delegator's* authorization **and** the specialist's declared reach.
3. The result returns to the delegator with `delegatedFrom` recorded.
4. A specialist cannot escalate its own privileges by re-delegating; delegation chains are
   depth-limited and the effective set is the intersection, never the union.

Supervision rules:
- Advisory findings always carry `humanReviewRequired` where the specialist's `supervision`
  demands it.
- An `EVIDENCE_AUDITOR` finding may annotate but never suppress another specialist's finding.

---

## 4. Conflict detection

When two specialists return incompatible claims:

- both are retained,
- a `specialistConflict` record is produced naming the pair and the topic,
- confidence for the combined result is reduced,
- the conflict surfaces in the Council's `dissent` when the council is convened.

There is no tie-breaker that silently picks a winner.

---

## 5. Workforce is NOT

| Not | Reality |
|---|---|
| 12 autonomous agents | 12 profiles over one dispatcher. No loops, no self-scheduling. |
| An HCM system | The employee master is unchanged and unified elsewhere. |
| Able to act independently | All 12 are read/advisory; `mayPost` false for all. |
| Personas | They are not separate NOELIA identities; the single-identity guard covers them. |

---

## 6. Evidence

- `HIVE_WORKFORCE_PROFILES` — the roster and its declared fields.
- `tests/noelia/cognitive-workforce.test.ts` (14 tests) — asserts 12 unique codes, the integrity
  guard, no posting authority, every capability resolves in the real registry, no `HIGH`-risk
  capability anywhere, and that delegation is an intersection (a low-privilege specialist cannot
  proxy to a high-privilege one).
- Command Centre → Hive Workforce module renders `reach/declared` per specialist from
  `resolveWorkforceReach`, plus a `NO POSTING` badge. Verified in rendered HTML by
  `cognitive-http.test.ts`, which fails if the string `MAY POST` ever appears.
