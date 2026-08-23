# PHASE 8 — BEYU GOVERNANCE MODULE
# CANONICAL COMPLETION & ENGINEERING HARDENING

**Branch:** `arena/01a01b69-beyu-os-1-0` · **Date:** 2026-08-23
**Mandate:** EXAMINE FIRST · BUILD ONLY GENUINE GAPS · DO NOT INVENT THE LAW
**Final gate:** 🟡 **YELLOW — CONTROL PLANE COMPLETE, AUTHORITY NOT RATIFIED**

---

## 1. Baseline

No re-clone this session. HEAD `4707dd9`, tree clean, environment intact.

| Check | Result |
|---|---|
| Fingerprint | `611865f1aca2f81eeb72a6c418b49732`, 11 migrations ✅ |
| Full suite | **1288/1288, 42 files, 0 skipped** ✅ |
| State | all 33 values captured ✅ |
| Decisions / Capabilities | 16/16 PENDING · 60/60 LOCKED ✅ |
| Triggers | 9, **0 disabled** ✅ |

New governance facts recorded at baseline: **12 constitution articles, 6 governance bodies,
19 members, 48 permissions, 160 role grants, 0 delegations, 0 approvals.**

## 2. Current governance architecture

Governance was already substantial — ~4,555 lines across `governance.ts`,
`governance-vote-service.ts`, `governance-authorization.ts`, `governance-voting.ts`,
`decision-authority.ts`, `capital-governance-service.ts` and `src/lib/authority/`. **None of it
was rebuilt.**

## 3. Canonical model

17 of 29 layers were already COMPLETE. The audit found four genuine gaps and left everything else
in place.

## 4. Genuine gaps found

**GAP 1 — RESERVED MATTERS WERE DECLARED BUT NEVER RESOLVED.** Six bodies declare fourteen
reserved matters as raw JSON strings:

| Body | Reserved matters |
|---|---|
| GROUP_BOARD | `CAPITAL>1M`, OWNERSHIP_CHANGE, NEW_SECTOR_OS, POLICY_CONSTITUTION, DISTRIBUTIONS |
| INVESTMENT_COMMITTEE | `CAPITAL>250K` |
| RISK_AUDIT_COMMITTEE | RISK_ACCEPTANCE, AUDIT_FINDING_CLOSURE |
| TAX_GOVERNANCE_COMMITTEE | AGGRESSIVE_TAX_POSITION |
| FAMILY_COUNCIL | BENEFICIARY_ELIGIBILITY, SUCCESSION, FAMILY_CONSTITUTION |
| TRUSTEE_BOARD | TRUST_DISTRIBUTION, TRUST_AMENDMENT |

The **only** code touching them was `governance.ts:303`:

```ts
if (category === "RESERVED_MATTER" && governingBody.reservedMatters.length === 0) throw
```

That asks whether a body has *some* reserved matter. It never asks which matter an operation
triggers, whether *this* body is competent for *that* matter, or whether an operation plainly
engaging a reserved matter was routed through the reserved-matter path at all. **A capital
allocation of 5,000,000 could be categorised `CAPITAL` instead of `RESERVED_MATTER` and pass.**

**GAP 2 — DELEGATION HAD A TABLE AND NO ENGINE.** `delegations` exists with the right columns and
holds zero rows. No code read it. Nobody could prove a delegation exceeding the issuer's own
authority would be refused.

**GAP 3 — NO EXCEPTION FRAMEWORK.** Grep for "exception" found only compliance findings. Any
real-world deviation would have to be handled by editing the policy — destroying the record that
it ever said otherwise.

**GAP 4 — NO DETERMINISTIC ESCALATION.** Blocked operations had no defined state.

## 5. Components completed

`src/lib/governance/` — four new modules, no new tables, no migration:

| Module | Closes |
|---|---|
| `reserved-matters.ts` | Gap 1 — parses and enforces the 14 ratified matters |
| `delegation.ts` | Gaps 2 & 4 — delegation bounds + escalation states |
| `exceptions.ts` | Gap 3 — exception framework |
| `maturity.ts` | Machine-readable 29-layer registry |

## 6. Constitution — honestly PARTIAL

12 articles exist and policies reference them, but **no engine evaluates article hierarchy**. The
maturity registry reports this as PARTIAL with `missing: [engine, faultInjection]`, and a test
asserts it. Encoding constitutional *content* would be inventing the law, so only the gap is
recorded.

## 7. Authority · 8. Policy · 9. Decisions

Unchanged. Authority is REQUIRES_AUTHORITY (16/16 PENDING); policy and provenance are
DATA_NOT_AVAILABLE (C-1: 5/5 policies unprovenanced).

## 10. Reserved matters — **now enforced**

`CAPITAL>1M` is parsed to a threshold **because that is what the ratified string says** — the
threshold is read, not chosen. Three anti-bypass controls:

- **Miscategorisation** — an operation engaging a reserved matter cannot be declared as ordinary
  business (`MISCATEGORISED_RESERVED_MATTER`).
- **Wrong body** — routing a capital decision to the Tax Committee returns
  `RESERVED_MATTER_BYPASS` and names GROUP_BOARD as competent.
- **Omitted amount** — leaving the amount out does **not** escape a monetary reservation.

An unparseable matter engages **every** operation: an unreadable constraint must restrict more,
never less.

## 11. Delegation — **the escalation vector closed**

**A delegation can never exceed the issuer's own authority.** If U1 may approve 100k and delegates
500k to U2, U1 granted authority U1 never held. Also refused: unbounded delegation from a bounded
issuer; delegation by an issuer with *no* recorded limit (absence is not an unlimited licence);
self-delegation; cross-tenant delegation; chains deeper than 2.

**Non-delegable powers** — reserved matters, constitution, succession, trust amendment,
ownership change and authority-delegation itself. These are vested in a body under quorum; an
individual cannot delegate a collective power they do not personally hold. That is structural, not
invented.

## 12. Segregation of duties

Unchanged from the previous phase, where FI-1 found the one-directional lookup. Bidirectional with
a symmetry assertion.

## 13. Workflow · 14. Exceptions

**An exception never modifies its policy** — it sits alongside it, and the policy checksum is
proven byte-identical. **An expired exception ceases to apply automatically** from its dates at
read time; one requiring revocation to stop working would be a backdoor with a reminder attached.

**Emergency override is the most constrained kind:** hard expiry required (no open-ended
emergency), capped at 30 days, and **refused on repeat** — a second emergency for the same policy
is an unacknowledged policy gap, not an emergency.

The five kinds are not interchangeable: `PERMANENT_POLICY_CHANGE` is explicitly *not* an
exception, `BREACH` permits nothing, `WAIVER` forgives the past but authorises no future deviation.

## 15. Escalation · 16. Policy conflict

11 deterministic states ordered by fundamentality; `autoApproved` is structurally `false`.
Conflict detection unchanged — no winner field exists, so precedence cannot be quietly added.

## 17–20. Provenance, lineage, domain registry, cross-OS, Finance integration

Unchanged and reused. Finance OS was **not** rebuilt. Cross-OS governance is honestly PARTIAL —
one enforcement order exists, but no sector OS is built yet.

## 21. Simulation

Unchanged: `mutatedState` structurally false, output says ELIGIBLE, never ACTIVATED.

## 22–23. Security attacks & fault injection — 26 faults, 2 misses

All files restored **byte-identical by md5**.

| # | Fault | Result |
|---|---|---|
| 1–6 | Reserved matters: unparseable ignored, threshold inverted, omitted amount, bypass detection, miscategorisation, unknown body | all ✓ |
| 7–9 | Delegation bounds: exceed issuer, unbounded, absent issuer limit | all ✓ |
| 10 | Non-delegable list emptied | **MUTATION FAILED** → corrected → 3 failed ✓ |
| 11–16 | Self/cross-tenant delegation, revoked, expired, escalation auto-approve, missing authority | all ✓ |
| 17 | Exception modifies policy silently | **NOT DETECTED** → fixed → 2 failed ✓ |
| 18–24 | Expired/revoked exception, open-ended emergency, cap removed, repeat emergency, unapproved, permanent change | all ✓ |
| 25–26 | Maturity: failed criteria, authority blockers ignored | all ✓ |

### FI-17 — a vacuous tripwire

**Symptom:** disabling `if (before !== after) throw` inside `applyException()` broke no test.
**Cause:** nothing in that function mutates the policy, so the guard can never fire there.
**Systemic:** a tripwire for a mutation that does not yet exist is vacuous *in place* and cannot
be tested where it sits.
**Root:** the invariant had no independent assertion.
**Fix:** extracted `assertPolicyUnmodified(before, after, policyId)`.
**Regression test:** 3 tests — differing checksums MUST throw; the error names the policy and both
checksums; identical checksums must not throw.
**Fault injection:** now 2 failed ✓ (plus a variant neutering the function itself, 2 failed ✓).

This is the **fifth consecutive phase** where fault injection found a control tests could not see.
The variants differ but the lesson is identical: *a control that only runs behind another control —
or guards a path that cannot yet occur — is untested by construction.*

FI-10 is recorded honestly as a **failed mutation, not a passing test**: my perl expression didn't
match. Re-run correctly, it produced 3 failures.

## 24–25. Platform defects & remediation

No pre-existing platform defect found requiring remediation. Both findings were in this phase's own
code and were fixed before completion.

## 26. Governance completeness matrix

*Generated from the live registry, not hand-written.*

| Layer | Status | Evidence | Blocker |
|---|---|---|---|
| Audit | **COMPLETE** | 7/7 | — |
| Authority | REQUIRES_AUTHORITY | 7/7 | 16/16 decisions PENDING |
| Capability binding | REQUIRES_AUTHORITY | 7/7 | 60/60 LOCKED |
| Conflict detection | **COMPLETE** | 7/7 | — |
| Constitution | PARTIAL | 5/7 | articles stored, not evaluated |
| Cross-OS governance | PARTIAL | 6/7 | no sector OS exists yet |
| Decision registry | REQUIRES_AUTHORITY | 7/7 | all decisions PENDING |
| Delegation | DATA_NOT_AVAILABLE | 7/7 | delegations table empty |
| Domain registry | **COMPLETE** | 7/7 | — |
| Entity scope | DATA_NOT_AVAILABLE | 7/7 | 3 attribution conflicts |
| Escalation | **COMPLETE** | 7/7 | — |
| Event | **COMPLETE** | 7/7 | — |
| Exceptions | **COMPLETE** | 7/7 | — |
| Execution readiness | REQUIRES_AUTHORITY | 7/7 | no capability passes the gate |
| Historical immutability | **COMPLETE** | 7/7 | — |
| Lineage | **COMPLETE** | 7/7 | — |
| Permission binding | **COMPLETE** | 7/7 | — |
| Policy | DATA_NOT_AVAILABLE | 7/7 | C-1: 5/5 unprovenanced |
| Policy versioning | **COMPLETE** | 7/7 | — |
| Provenance | DATA_NOT_AVAILABLE | 7/7 | C-1 |
| Reserved matters | **COMPLETE** | 7/7 | — |
| Resolution registry | REQUIRES_AUTHORITY | 7/7 | none ratified |
| Reversibility | PARTIAL | 5/7 | 0 journal entries |
| Segregation of duties | **COMPLETE** | 7/7 | — |
| Simulation | **COMPLETE** | 7/7 | — |
| Temporal governance | **COMPLETE** | 7/7 | — |
| Tenant scope | **COMPLETE** | 7/7 | — |
| Trace | **COMPLETE** | 7/7 | — |
| Workflow | **COMPLETE** | 7/7 | — |

**COMPLETE 17 · PARTIAL 3 · REQUIRES_AUTHORITY 5 · DATA_NOT_AVAILABLE 4 · NOT_AVAILABLE 0**

## 27. Execution readiness

The chain resolves deterministically end to end and denies at every point today. Verified: no
capability passes the gate, no decision is ratified, no delegation exists.

## 28. BEFORE → AFTER

All 33 values **identical**. `je 0 · jl 0 · fp 0 · tsum 11783000.00 · dpend 16/16 · clock 60/60 ·
cart 12 · gbody 6 · deleg 0 · appr 0 · disabled 0 · mig 11 · tables 76`. Zero deltas — only code,
tests and documentation changed.

## 29. Validation

| Check | Result |
|---|---|
| Typecheck / Lint / Build | ✅ clean |
| Full suite | ✅ **1369/1369, 43 files, 0 skipped** (164s) |
| Governance suite | ✅ 81/81 |
| Deterministic second run | ✅ 248/248 identical |
| Fault injection | ✅ **26/26 detected**, md5-restored |
| Clean-install parity | ✅ `beyu_clean_g8` 33/33; dropped |
| Migration parity | ✅ `611865f1…`, **no new migration** |
| Capability seed parity | ✅ 60/60 LOCKED |

## 30. Remaining blockers

**Authority:** 16/16 PENDING; C-1 provenance (5/5); no ratified precedence hierarchy.
**Data:** 0 delegations, 0 approvals, 0 journal entries, 0 periods; 3 attribution conflicts.
**Engineering:** constitution engine (articles not evaluated); no sector OS to govern; reversal
untestable against real data.

## 31. Next engineering step

1. Wire `checkBodyCompetence()` into the resolution-proposal path so miscategorisation is refused
   at the API boundary, not only detectable.
2. Build the constitution engine — evaluate article hierarchy so a lower authority cannot override
   a higher constraint. This is the last PARTIAL that code alone can close.
3. Extend fault injection to the tax specialist.

## 32. Final gate — 🟡 YELLOW

**The governance control plane is complete. The authority it exists to enforce has not been
granted.**

GREEN is unavailable: nothing is ratified, five policies are unprovenanced, the constitution engine
does not evaluate articles, and no sector OS exists to govern. RED is not warranted: no security or
integrity defect is unresolved, 26/26 faults are detected, and 1369 tests pass with zero skipped.

What is now provable: a reserved matter cannot be relabelled as ordinary business or routed to a
friendly committee; a delegation cannot exceed its issuer; an exception cannot edit its policy or
outlive its expiry; an emergency cannot become permanent; and escalation never approves.

Nothing was ratified. Nothing was activated. No financial state moved.
