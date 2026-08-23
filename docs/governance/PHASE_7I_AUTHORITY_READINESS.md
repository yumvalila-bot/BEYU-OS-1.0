# Phase 7I — Policy Provenance, Authority Readiness & Execution Gate Preparation

**Branch:** `arena/01a01b69-beyu-os-1-0` · **Date:** 2026-08-22
**Mandate:** BUILD THE RAILS. DO NOT INVENT THE LAW.
**Final gate:** 🟡 **YELLOW — RAILS READY, AUTHORITY ABSENT**

---

## 1. Findings

The rails did not exist as a reusable primitive, and the missing dimension was scope.

`src/lib/decision-authority.ts` already answered the decision-level question well: 11 verdicts, 12
per-decision checks, unknown capabilities denied, an empty `requiredDecisions` list treated as a
registry defect rather than a free pass. But `grep -nE "tenantId|legalEntityId|principal"` over
that file returns **nothing**. `checkCapabilityActivation(capabilityCode)` takes one argument. It
could say "these decisions are activated"; it could not say "…for THIS tenant, THIS entity, THIS
principal". Six of the seven questions §9 requires were collapsed into one.

That is the gap this phase closed, once, in the common platform.

Two defects were found in my own work by fault injection and fixed before completion — both are
documented below rather than quietly patched, because each was a genuine near-miss.

## 2. Authority status — **NOT RATIFIED**

Unchanged from 7H, re-verified from records rather than assumed:

| Resolution | Status | Category | Quorum | Votes | Decision date |
|---|---|---|---|---|---|
| BRD-2025-014 | APPROVED | POLICY | true | 4-0 | 2025-08-14 |
| FC-2025-007 | APPROVED | RESERVED_MATTER | true | 3-0 | 2025-06-02 |
| IC-2025-021 | TABLED | CAPITAL | true | 2-0 | *none* |
| TGC-2025-031 | DRAFT | TAX | false | 0-0 | *none* |

**All 16 decisions are `PENDING` with null `approval_date` and null `effective_from`. Zero are
RATIFIED. All 60 capabilities remain LOCKED.** No new authority arrived. Nothing was ratified,
and nothing in this phase moved a decision one step along its lifecycle.

## 3. Policy architecture — **no migration was required**

§3 demanded I inspect before building. The existing schema already carries almost everything:

`policies` has identity, version, jurisdiction, entity/role scope, status, effective dates, rules,
owner and `approved_by_resolution_id`. `governance_decision_registry` independently carries
`supersedes`, `evidence`, `provenance`, `approval_date`, `effective_from/to`, `scope`,
`conditions`, `dependencies` and `audit_reference`.

The fields absent from `policies` (`checksum`, `revoked_at`, `ratified_at`) are all **derivable or
already present elsewhere**. `checksum` is computed deterministically at read time by
`computePolicyVersion()`; adding a stored column would create a second truth that can drift from
the content it describes. **Phase 7A–7I add no migration. The fingerprint remains
`611865f1aca2f81eeb72a6c418b49732` at 11 migrations.**

## 4. Authority object model

`src/lib/authority/model.ts` — types only, no policy content. `AuthorityRecord` carries all 20
canonical fields §4 requires. The decisive design point is `AuthorityEvaluation`:

```ts
exists: boolean;      // the record is there
effective: boolean;   // ratified, dated, in force today
permits: boolean;     // …and applies to THIS tenant, entity, principal
```

**Three fields, never one boolean.** A test asserts an authority can be `exists: true,
effective: true, permits: false` — real and in force, but out of scope. Collapsing those into one
flag is precisely how a tenant boundary gets crossed by an authority that was genuinely valid
somewhere else.

## 5. Decision lifecycle

`PENDING` was added to `AUTHORITY_STATUS` — **not** as a conventional extra state, but because it
is the status all 16 real registry rows actually hold. Modelling a status the system genuinely
stores is the opposite of inventing one; leaving it to fall into `UNKNOWN` would have made a real
state indistinguishable from a forged one.

Only `RATIFIED` and `EFFECTIVE` are in force. **`APPROVED` does not permit execution** — approval
by one body is not the ratification the constitution requires. `SUPERSEDED`, `REVOKED` and
`EXPIRED` are checked *before* dates, so a revoked authority sitting inside a valid window still
cannot act.

## 6. Policy versioning

`computePolicyVersion()` emits two checksums: `contentChecksum` over body+rules, and `checksum`
over content plus scope, dates and authority. The pair makes silent substitution detectable —
same code, same version, different content yields `SAME_CODE_DIFFERENT_CONTENT` rather than a
quiet overwrite. Proven reproducible (identical input → identical checksum) and sensitive to all
five identity-bearing fields.

## 7. Temporal authority

All 10 required cases are tested. Bounds are **inclusive at both ends**, consistent with 7H.
Future authority does not act early; expired and revoked authority does not remain effective; the
same record evaluated at three dates gives three different answers, and `evaluatedAt` is recorded
so any decision is replayable. A malformed `asOf` throws rather than being coerced.

## 8. Conflict detection

Nine conflict codes. Every conflict lists **every participant** and sets `requiresAuthority: true`.
There is no `winner` field — a test asserts the key does not exist, so no future change can quietly
add precedence. Precedence requires a ratified hierarchy, and none exists.

Semantic contradiction between rule bodies is **deliberately not attempted**. Deciding that two
rules contradict is a legal judgement, not a computation.

## 9. P1–P11 readiness matrix

`buildReadinessMatrix()` covers all 16 decisions. **None is READY.** Every one is blocked by the
same root cause: `AUTHORITY_NOT_RATIFIED`, `NO_APPROVING_RESOLUTION`, `NO_APPROVAL_DATE`,
`NO_EFFECTIVE_DATE`, `NOT_ACTIVATED`. The matrix reports; it changes nothing.

## 10. Capability binding

`checkScopedCapability()` **composes** `checkCapabilityActivation()` rather than replacing it —
adding a parallel authority engine would create exactly the second-source problem the constitution
forbids. It layers on the principal's own tenant assertion, entity scope, and per-decision scope
evaluation. Verified: **all 60 capabilities are denied today**, each with a specific reason code.

## 11. Dependency graph

`traceCapabilityChain()` walks CAPABILITY → PERMISSION → DECISION → AUTHORITY in reverse. Any
missing link sets `complete: false` and populates `brokenAt`. The explanation states explicitly
that **a complete chain is not authorisation** — traceability and permission are different claims.

## 12–13. Security model and hostile attacks

**20 attack vectors, all fail closed.** Forged status strings, lowercase `ratified`, empty status,
backdated approval, inverted date windows, wildcard-looking permissions (`*`, `finance:*` do
**not** match a required permission), replayed evaluations, scope escalation, silent version
substitution, simulation self-reporting as ratified. Explainability carries an evidence
**reference** only — never evidence content.

## 14–15. Fault injection — 17 faults, all detected

Every control was mutated and proven load-bearing; all files restored **byte-identical by md5**.

| # | Fault | Result |
|---|---|---|
| 1 | APPROVED treated as in force | 2 failed ✓ |
| 2 | Tenant scope check removed | 3 failed ✓ |
| 3 | Entity scope check removed | 1 failed ✓ |
| 4 | Principal permission check removed | 3 failed ✓ |
| 5 | REVOKED no longer terminal | 1 failed ✓ |
| 6 | Future authority acts early | 3 failed ✓ |
| 7 | Expiry boundary made exclusive | 1 failed ✓ |
| 8 | Conflict detection returns nothing | 8 failed ✓ |
| 9 | Empty requiredDecisions = free pass | 2 failed ✓ |
| 10 | Chain always complete | 3 failed ✓ |
| 11 | Readiness always READY | 2 failed ✓ |
| 12 | Group-wide policies excluded | 2 failed ✓ |
| 13 | Unknown status → RATIFIED | **NOT DETECTED** → fixed → 3 failed ✓ |
| 13b | Unknown status → EFFECTIVE | 3 failed ✓ |
| 14 | Gate default-allow on unknown capability | 1 failed ✓ |
| 15 | Principal tenant assertion removed | 1 failed ✓ |
| 16 | Provenance gap never reported | 2 failed ✓ |
| 17 | Status mapping normalises case | 1 failed ✓ |

### The two defects fault injection found in my own work

**FI-12 — group-wide policies were invisible.** `loadPolicyVersions()` filtered
`tenant_id = :tenant`. But **all five policies have `tenant_id IS NULL`** — they are
constitutional and bind every tenant. The query returned zero rows, and conflict detection
reported a clean bill of health for a policy set it had never examined. A vacuous pass on the
provenance check. Fixed to `IS NULL OR = :tenant`; the test now asserts a specific count of 5.

**FI-13 — unknown status could be laundered into RATIFIED, undetected.** Mutating the fallback
from `UNKNOWN` to `RATIFIED` broke *no test*. It survived only because every real decision is
`PENDING` with null dates, so a later date check denied anyway. **Defence in depth is not
coverage.** The day a record gains dates, that vector opens silently. Fixed by exporting
`toAuthorityStatus()` and testing it at its own boundary (7 new tests), and by making the mapping
**case-sensitive** — a controlled enum value is not a spelling to be normalised.

## 16. Platform defects — none newly introduced

No pre-existing platform defect was found requiring remediation in this phase. Standing findings
from earlier phases are unchanged and reported in §20.

## 17. Simulation

`simulate()` answers "if ratified, what would become eligible?" over values passed by value,
reading no live activation state. `classification: "SIMULATION"`, `mutatedState: false`
structurally. Verified by counting non-LOCKED capabilities and non-PENDING decisions before and
after: **0 → 0 both times.** The output uses "eligible", never "activated", and states plainly
that eligibility is not activation. A capability declaring no required decisions is not eligible
even in simulation.

## 18. BEFORE → AFTER

All 27 tracked values **identical**:

```
la 0 · je 0 · jl 0 · tp 5 · tsum 11783000.00 · cap 4 · funded 0 · ent 8 · ten 6
pol 5 · polactive 5 · polnoprov 5 · res 4 · usr 9 · rol 9 · rperm 160
dreg 16 · dpend 16 · creg 60 · clock 60 · oblig 8 · risks 6
aud 0 · ev 0 · mig 11 · triggers 9 · disabled 0
```

Zero ledger, journal, treasury, capital or policy mutation. No decision advanced, no capability
activated, no permission granted, no trigger disabled.

## 19. Validation

| Check | Result |
|---|---|
| Typecheck | ✅ clean |
| Lint | ✅ clean |
| Build | ✅ 21 routes |
| Full suite | ✅ **1053/1053, 39 files, 0 skipped** (161s) |
| Authority suite | ✅ 95/95 |
| Deterministic second run | ✅ 95/95 identical |
| Fault injection | ✅ 17/17 detected, all files md5-restored |
| Clean-install parity | ✅ `beyu_clean_7i` → all 27 values identical, dropped |
| Migration parity | ✅ `611865f1aca2f81eeb72a6c418b49732`, 11 migrations |
| Capability seed parity | ✅ 60/60 LOCKED |
| Health | ✅ 200 |

Suite grew 958 → 1053 (+95). No regressions.

## 20. Remaining blockers

1. **No ratified authority exists.** The single blocker for P1–P11. Not a software defect.
2. **C-1 provenance gap — all 5 ACTIVE policies have `approved_by_resolution_id IS NULL`.** Every
   live policy is unprovenanced. Now *detected and reported* as `MISSING_PROVENANCE`; repairing it
   requires ratification, not code.
3. GROUP_CFO holds only `governance:policy.read` yet is named approver for 10/11 P-decisions.
4. Cross-tenant treasury attribution defect (3/5 positions) — **reported, never repaired**.
5. Latent `finance:ledger.approve` wildcard; `ENT-FIN-005` missing; `CTL-FIN-002` EFFECTIVE over a
   nonexistent mechanism; disable-trigger owner-privilege gap.
6. Legacy stubs `src/lib/specialist/{forecasting,audit-intelligence}.ts` remain unreconciled with
   their 7G/7H replacements.
7. 7B–7H API routes still deferred. **CI configuration present · CI execution unverified.**

## 21. Next production build

Wire `checkScopedCapability()` into `runSpecialist()` as the capability step, so every specialist
inherits scoped authority rather than each re-deriving it. Then reconcile the legacy stubs, then
the deferred API surface.

## 22. Final gate — 🟡 YELLOW

**The rails are built and proven. The law has not been written.**

GREEN is not available and claiming it would be false: no authority is ratified, and all five
policies remain unprovenanced. What can be claimed is that when ratification does occur, the
system can now receive, version, validate, bind, audit and enforce it — and until then it denies
everything, for a specific and explainable reason.

Nothing was ratified. Nothing was activated. No financial state moved.
