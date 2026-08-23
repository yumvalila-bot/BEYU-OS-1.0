# Pre-Ratification Activation Framework

**Status:** implemented infrastructure. `[NOT AUTHORITY]` — this framework grants nothing and
decides nothing. It is the mechanism by which a *future* authoritative decision becomes executable.
**Phase:** 6C · Branch `arena/01a01b69-beyu-os-1-0`
**Accounting authority:** still `NOT RATIFIED` — every capability is `LOCKED`.

---

## 1. What was built, and why

BEYU OS had reached a standstill: no accounting authority exists, so no accounting capability may
execute, so each phase re-confirmed the same blockage. The blockage is real, but it blocks
**execution**, not **engineering**. This phase built the rails so a future ratification can be
received, verified and activated without redesigning anything — while every unratified capability
stays locked.

**The framework chooses no accounting destination.** It contains no recognition basis, no chart of
accounts, no period, no rate, no threshold, no fiscal year and no treatment. Every
policy-dependent column in the registry is `NULL` and every decision is `PENDING`.

## 2. Components

| Component | Location | Purpose |
|---|---|---|
| Decision registry | `governance_decision_registry` (migration 0010) | Records that P1–P11 and C1–C5 exist, who must decide them, and what would prove them implemented |
| Capability registry | `governance_capability_registry` | Maps 14 future capabilities to the decisions they require |
| Authority verification engine | `src/lib/decision-authority.ts` | Answers "is this decision authoritative and executable?" — never "what is the accounting treatment?" |
| Activation gate | `checkCapabilityActivation()` / `requireCapability()` | The fail-closed choke point every future accounting module must pass |
| Simulator | `simulateActivation()` | Answers "what would unlock if X were ratified?" without mutating anything |

## 3. The authority ladder

`verifyDecisionAuthority()` returns exactly one deterministic verdict. **Only `ACTIVATED` permits
execution:**

```
NOT_FOUND · INVALID · PENDING · APPROVED_NOT_EFFECTIVE · EFFECTIVE_NOT_RATIFIED
   · RATIFIED_NOT_READY · ACTIVATION_READY · EXPIRED · SUPERSEDED · SUSPENDED   -> denied
                                    ACTIVATED                                    -> executable
```

The ladder enforces the three distinctions that Phase 5 proved the system could not previously
make:

> **PENDING ≠ RATIFIED · RATIFIED ≠ ACTIVATED · APPROVED ≠ EXECUTION AUTHORITY**

Empirically demonstrated (positive control, scratch DB):

| Step | Verdict | Capability executable |
|---|---|---|
| nothing | `PENDING` | no |
| + APPROVED resolution with GOVERNED provenance | `APPROVED_NOT_EFFECTIVE` | no |
| + effective date reached | `EFFECTIVE_NOT_RATIFIED` | no |
| + ratified | `ACTIVATION_READY` | no |
| + explicit decision activation | `ACTIVATED` | **no** |
| + explicit capability activation | `ACTIVATED` | **yes** |

Two separate, deliberate activation steps are required. Neither happens implicitly.

## 4. A new enum was necessary — the justification

Adding a status is normally prohibited, so the analysis is recorded:

- `beyu_version_status` describes *document versions*; cannot separate EFFECTIVE from RATIFIED and
  has no activation concept.
- `beyu_decision_status` is the *resolution voting* lifecycle; it ends at the vote.
- `beyu_authority_status` is closest but collapses RATIFIED and ACTIVATED into `AUTHORITATIVE`,
  and is already used by four unrelated tables — widening it would silently change their meaning.

Hence `beyu_decision_activation_state`, scoped solely to the registry.

## 5. Verified attack resistance

Eleven forgery attempts, all denied (isolated scratch database):

| Attack | Blocked by |
|---|---|
| Claim ACTIVATED with no resolution | DB CHECK |
| ACTIVATED citing a nonexistent resolution | DB foreign key |
| `provenance = GOVERNED` on a TABLED resolution | engine — resolution not APPROVED |
| `REFERENCE_DATA` provenance on an APPROVED resolution | engine — seed data never authorises |
| Future effective date | engine — `APPROVED_NOT_EFFECTIVE` |
| Expired authority | engine — `EXPIRED` |
| Superseded / suspended authority | DB CHECK + engine |
| Missing dependency (P7 without P5) | engine — `RATIFIED_NOT_READY` |
| Flip the capability row to ACTIVATED directly | engine re-derives from decisions |
| Invoke an unknown capability | engine — denied by default |

The gate does not trust the registry. A row claiming `status = 'ACTIVATED'` is disbelieved unless
the cited resolution genuinely exists, is APPROVED, and carries GOVERNED provenance.

## 6. Future activation procedure

When the Board or CFO actually decides something:

1. The authority makes the decision and completes the `§3c` block in the ratification package.
2. The decision is enacted **through the governed decision path** — proposal, vote, decision — so
   it acquires a `GOVERNED` audit trail. *A decision inserted as seed data or a direct edit will
   be correctly refused.*
3. The registry row is updated with the resolution id, approving body, decision maker, approval
   date, effective dates, scope, conditions and evidence.
4. `verifyDecisionAuthority()` confirms identity, resolution, authority, provenance, status,
   effective date, expiry, scope, conditions, dependencies and evidence.
5. The verdict climbs to `ACTIVATION_READY` on its own — no code change required.
6. An authorised operator explicitly activates the decision, then the capability.
7. `checkCapabilityActivation()` returns `executable: true` for that capability only.
8. Every other capability remains `LOCKED`. Partial ratification is fully supported.
9. Expiry or supersession automatically returns the capability to non-executable, because the
   verdict is recomputed on every call rather than cached.

**Only then** may the corresponding accounting module be implemented, against a decision that
actually exists.

## 7. What remains locked

All 14 capabilities: recognition, measurement, VAT, FX, fiscal periods, chart of accounts, period
linkage, opening balances, posting, maker/checker, capital accounting, intercompany, treasury
settlement, reversal.

`finance:ledger.approve`, `capital:execute`, `treasury:settle`, `finance:coa.manage` and
`finance:period.manage` have **0 permission definitions**. The capability registry stores those
names as inert strings for future reference; recording a name neither creates nor grants a
permission.

Accounting substrate: 0 ledger accounts, 0 financial periods, 0 journal entries, 0 journal lines,
0 FUNDED capital requests — unchanged.
