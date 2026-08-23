# Governance decision authority — model and configuration audit

Raised by: governance authority completion phase (2026-08-20), continuing from `7cd65a9`.

---

## 1. The invariant

A resolution may be closed **only** when the acting principal satisfies **all** of:

| # | Condition | Enforced by |
| --- | --- | --- |
| 1 | Authenticated principal | `guarded()` → `resolvePrincipal()` |
| 2 | Resolution inside the caller's tenant scope | `loadResolutionContext()` → `tenantScopeIds()`, plus `assertWithinScope()` |
| 3 | Holds `governance:resolution.approve` | `authorizeGovernanceAction()` → `can()` |
| 4 | Holds an eligible **presiding seat** (`CHAIR`/`SECRETARY`) on the **owning** body | `decideResolutionClosure()` → `DECISION_SEATS` check against `ctx.seat` |
| 5 | Classification ceiling respected | `authorizeGovernanceAction()` → `classificationRank()` |
| 6 | ABAC / entity authorization | `can()` with `entityId` from the owning body |
| 7 | Policy authorization (DENY is final) | `authorizeGovernanceAction()` → `evaluatePolicy()` |
| 8 | Resolution state is decidable (`TABLED` or `VOTED`) | pre-check **and** re-check inside the transaction |
| 9 | Not already closed | terminal-status check inside the transaction |

Conditions 3 and 4 are **independent and both required**. Holding the capability
without a presiding seat is refused; holding a presiding seat without the
capability is refused. There is no global administrative override, and UI
visibility is never the authority — `canDecideResolutions()` is a read model only.

---

## 2. Capability grant: how `governance:resolution.approve` is actually acquired

There are two distinct paths, and this is the root of the configuration gap.

**Explicit grant.** In `src/lib/constants.ts`, exactly **one** role lists
`governance:resolution.approve` in its `permissions` array:

- `CHIEF_GOVERNANCE_OFFICER` — "Custodian of the Constitution, policy hierarchy
  and governance execution."

**Implicit wildcard grant.** `GROUP_CEO` is defined as
`Object.keys(PERMISSIONS).filter(p => !["platform:config.manage",
"identity:emergency.activate", "finance:ledger.post"].includes(p))` — every
permission except three. The CEO therefore holds `governance:resolution.approve`
as a side effect of the wildcard, **not** as a deliberate governance appointment.

So the only *intentional* holder of closure authority is the Chief Governance
Officer.

---

## 3. Audit of the seeded configuration

Live query against the seeded database (`tmp/authority.ts`, since removed):

| BODY | CURRENT CHAIR | CURRENT SECRETARY | APPROVE CAPABILITY | ELIGIBLE DECISION AUTHORITY | ROOT CAUSE |
| --- | --- | --- | --- | --- | --- |
| GROUP_BOARD | `ceo@beyu.os` (GROUP_CEO) | `governance@beyu.os` (CGO) | chair ✅ (wildcard) · secretary ✅ (explicit) | **Yes — 2** | — |
| FAMILY_COUNCIL | `family@beyu.os` (FAMILY_OFFICE_PRINCIPAL) | `governance@beyu.os` (CGO) | chair ❌ · secretary ✅ | **Yes — 1** | — |
| TRUSTEE_BOARD | `family@beyu.os` (FAMILY_OFFICE_PRINCIPAL) | *none* | chair ❌ | **NONE** | CGO is seated as `MEMBER`, not `SECRETARY` |
| INVESTMENT_COMMITTEE | `cfo@beyu.os` (GROUP_CFO) | *none* | chair ❌ | **NONE** | CGO is **not seated on this body at all** |
| RISK_AUDIT_COMMITTEE | `risk@beyu.os` (CHIEF_RISK_COMPLIANCE) | *none* | chair ❌ | **NONE** | CGO is seated as `MEMBER`, not `SECRETARY` |
| TAX_GOVERNANCE_COMMITTEE | `cfo@beyu.os` (GROUP_CFO) | *none* | chair ❌ | **NONE** | CGO is seated as `MEMBER`, not `SECRETARY` |

**Observed pattern.** The two bodies that work are exactly the two where the
Chief Governance Officer holds the `SECRETARY` seat. In the four broken bodies
the CGO is either a plain `MEMBER` (three bodies) or absent (Investment
Committee). No body relies on its chair for closure except GROUP_BOARD, and even
there the chair's capability is incidental to the CEO wildcard.

---

## 4. Is this technical or constitutional?

**Constitutional — human appointment input is required.** It was NOT corrected.

What the repository *does* establish:

- `governance:resolution.approve` exists and means "Record a resolution outcome".
- The Chief Governance Officer is the constitutional "custodian of governance
  execution" and is the only role explicitly granted the capability.
- Where a body has a working closure path, it is because the CGO sits as
  `SECRETARY`.

What the repository does **not** establish, in the Constitution
(`constitution_articles`), the ADRs (`architecture_decisions`, 4 records), the
body records (`governance_bodies` — no charter document is attached to any body;
`charter_document_id` is null for all six) or any document under `docs/`:

- that every governance body **must** have a closure authority;
- that the CGO **must** be seated as secretary on every body;
- that a chair is **entitled** to closure authority;
- who is competent to appoint a secretary to a body.

Constitution Article 4 ("Governance of Material Decisions") states only that
"reserved matters require the competent governance body", with the authority
statement "Group Board and Family Council within their charters". It names
bodies, not seats, and the charters themselves are not present in the repository.

Both plausible corrections are **appointments**, and each changes who wields
constitutional power:

1. **Seat the CGO as `SECRETARY`** on the four bodies (matches the observed
   working pattern, concentrates closure authority in the governance custodian);
2. **Grant `governance:resolution.approve` to the chair roles** — `GROUP_CFO`,
   `CHIEF_RISK_COMPLIANCE`, `FAMILY_OFFICE_PRINCIPAL` (distributes closure
   authority to the domain executives, and notably would give the CFO closure
   power over the Tax and Investment committees that authorise his own spending).

Option 2 has an obvious separation-of-duties consequence. Choosing between them
is a governance decision, not an engineering one, so **no data or permission was
changed**. Instead the refusal is proven safe by regression tests
(`tests/governance/decision-authority.test.ts`): every body without an eligible
authority refuses closure with `FORBIDDEN`, and the resolution remains `VOTED`
with no audit, no event and no state change.

**Deliberately not done:** no new permission, no new role, no global-admin
bypass, no relaxation of the presiding-seat rule, and no "any capability holder
may decide" shortcut. Any of those would dissolve the separation between voting
and decision authority that this phase exists to protect.

### Required human decision

> For TRUSTEE_BOARD, INVESTMENT_COMMITTEE, RISK_AUDIT_COMMITTEE and
> TAX_GOVERNANCE_COMMITTEE: appoint a presiding officer holding
> `governance:resolution.approve` — either by seating the Chief Governance
> Officer as `SECRETARY`, or by granting the capability to the chairing role.
> Until this is recorded, resolutions of those four bodies can be proposed,
> tabled and voted, and will reach `VOTED`, but cannot be closed.

This is a **safe failure mode**: the system refuses to act rather than allowing
an unauthorised closure.

---

## 5. Governance authorization signal (read-only consumer)

`getGovernanceDecisionAuthorization()` in `src/lib/governance-authorization.ts`
answers, for a governed object, whether an approved BEYU OS resolution authorises
it — deriving the answer solely from persisted governance state.

**It is a prerequisite, never a bypass.** It performs no mutation and grants
nothing by itself: a caller must still pass authentication, tenant scope, RBAC,
ABAC, classification and policy for whatever action they are attempting. A future
capital execution would require *its own* security authorization **and** this
governance authorization.

Authorization is reported only when the linked resolution is `APPROVED`. Every
other state — `DRAFT`, `TABLED`, `VOTED`, `REJECTED`, `DEADLOCKED`, `DEFERRED`,
`WITHDRAWN` — reports `authorized: false` with the actual status as the reason.

**No expiry or revocation semantics are claimed.** The constitution defines none,
so the stored decision is reported as-is rather than being decorated with an
invented validity window.

`provenance` distinguishes `GOVERNED` (the decision has audit-ledger entries, so
it was produced by a real governed transaction) from `REFERENCE_DATA` (a seeded
historical record with no ledger provenance), reusing the existing
`auditTrailsFor()` mechanism already used by the governance workbench.

---

## 6. Downstream consumption: the capital governance gate

`authorizeCapitalRequestGovernance()` in `src/lib/capital-governance-service.ts`
is the first consumer that performs a **real domain mutation** on the strength of
a governed decision.

### The invariant

> A capital request may become `GOVERNANCE_AUTHORIZED` only when a **GOVERNED**,
> **APPROVED** resolution, within the correct tenant and entity reach,
> authorises it.
>
> **GOVERNANCE AUTHORIZED ≠ CAPITAL APPROVED ≠ EXECUTED ≠ FUNDED.**

Governance authorization is a *prerequisite*. Reaching it moves no money, posts
no journal entry, writes no ledger record, issues no treasury instruction and
calls no external system. Execution remains a separate authority and a separate
future phase.

### Separation of layers

| Layer | Authority | Question answered |
| --- | --- | --- |
| Governance | `governance:resolution.approve` + presiding seat | Did the competent body decide? |
| Capital | `finance:capital.manage` + entity scope | May this actor act on this request? |
| Execution | *not implemented* | May money actually move? |

Both governance and capital authority are required; neither substitutes for the
other. The capital service never re-derives governance state — it asks
`getGovernanceDecisionAuthorization()`, which remains the single source of truth.

### Two rules worth recording

**1. Only `GOVERNED` provenance authorises.** An `APPROVED` resolution with no
audit-ledger entries is seeded `REFERENCE_DATA`. It reports `authorized: true`
to the read-only signal (which honestly describes stored state) but is
**refused** as authority for a domain transition. Otherwise unaudited fixture
data could move the enterprise.

**2. Entity reach is ancestry, not equality.** Governance bodies sit at holding
and trust entities while capital is raised at operating subsidiaries: the seeded
Investment Committee governs `LEN_BEYU_HOLDINGS` yet authorises capital for
`LEN_BEYU_HEALTH_LTD` (Health → TZ Holding → Holdings). Requiring
`body.entity == request.entity` would have rejected the canonical example, so a
body governs its own entity and every descendant. A body with no entity is
enterprise-wide within its tenant.

An early implementation of this check compared `authorization.entityId` — which
describes the *object inspected*, i.e. the capital request itself — against the
request's own entity, so it always passed. The regression test
"refuses when the governing body has no authority over the entity" caught it;
the governing entity is now read from the deciding body.
