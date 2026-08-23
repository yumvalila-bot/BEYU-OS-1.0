# C-1 — Policy Provenance: Decision Required

**Status:** `PENDING — GOVERNANCE AUTHORITY REQUIRED`
**Classification:** `[GOVERNANCE DECISION REQUIRED]` · `[NOT AUTHORITY]`

This document does **not** decide anything. It exists so that the competent authority can decide.
No option below is recommended. No signature, decision ID, approval date or effective date in this
document is populated, and none may be populated by an engineer.

**Prepared:** Phase 5S · Branch `arena/01a01b69-beyu-os-1-0`
**Decision maker:** Group Board / Chief Governance Officer (see §7)

---

## 1. The question

> **Must every ACTIVE policy that can influence BEYU OS execution carry valid provenance to an
> approved governance resolution or other approved policy authority?**

## 2. Why this is being asked now

BEYU OS enforces *what a policy says* and *when it applies*. It cannot prove *who authorised it*.

Verified facts as at Phase 5S:

| Fact | Evidence |
|---|---|
| All 5 ACTIVE policies have `approved_by_resolution_id = NULL` | direct query, baseline §1 |
| The policy engine never reads that column | `src/lib/policy.ts` select predicate |
| A policy with NULL, TABLED and APPROVED provenance is consumed **identically** | `tests/security/authority-firewall.test.ts` |
| A cited resolution must now exist (FK, `ON DELETE RESTRICT`) | migrations 0007, 0009 |
| Nothing requires a citation, nor that it be APPROVED | no NOT NULL, no status predicate |

So the five policies that currently govern BEYU OS — including `CONST-AI-001`, which denies AI
ledger posting — are enforced without any recorded approving authority.

## 3. What is NOT in question

- The engine's correctness. Lifecycle and effective-window enforcement are verified sound.
- Referential integrity. A fabricated resolution id can no longer be stored.
- Whether provenance data *can* be represented. It can, today, with no schema change.

The only open question is whether provenance is **mandatory**, and what follows if it is.

---

## 4. OPTION A — PROVENANCE REQUIRED

*Every ACTIVE policy must link to an approving governance authority. A policy without valid
provenance may not be relied upon as authoritative.*

**Remediation required before this can take effect**

The five existing ACTIVE policies must each be linked to a real approving resolution. This is a
**data and governance act, not an engineering one**: someone with authority must state which body
approved each policy, when, and under what reference.

| Policy | Level | Currently cited authority |
|---|---|---|
| `CONST-AI-001` | CONSTITUTION | none |
| `DOM-TAX-001` | SECTOR | none |
| `ENT-FIN-002` | ENTERPRISE | none |
| `ENT-FIN-003` | DOMAIN | none |
| `ENT-SEC-004` | ENTERPRISE | none |

If no such approving resolution exists historically, the authority must decide whether to (i)
pass a ratifying resolution now, adopting them prospectively, or (ii) record them as
constitutionally inherited and exempt.

**Migration implications.** Two ordered steps, and the order is not optional:
1. Data remediation populating `approved_by_resolution_id` for all five policies.
2. Only then a migration adding `NOT NULL` (and optionally a constraint that the cited resolution
   be `APPROVED`).

Applying step 2 first would **immediately deactivate all five policies**, including the AI ledger
prohibition, and disable the policy engine. This is the single most dangerous sequencing risk in
the system today.

**Operational risk.** During the window between the decision and remediation, either policies
continue operating without provenance (status quo), or enforcement is switched on and the system
loses its policy layer. A phased approach — enforce for *new* policies, grandfather existing ones
with a recorded exemption — is a third path the authority may prefer, but it is a governance
choice, not a technical default.

**Historical-data implications.** Any retro-linkage asserts a historical fact ("this body approved
this policy"). If no contemporaneous record exists, the linkage is itself a new assertion and
should be recorded as such, with its own date, rather than backdated.

**Reversibility.** High. `NOT NULL` can be dropped without data loss. The linkage data would
remain and would need separate retraction.

---

## 5. OPTION B — PROVENANCE OPTIONAL

*ACTIVE policies may exist without resolution provenance. Authority is evidenced by other means.*

**What must then be documented**

If provenance is optional, the authority must state what *does* make a policy authoritative,
because "it is in the database and marked ACTIVE" is not an audit answer. Candidate alternative
evidence, for the authority to accept or reject:

- **Constitutional inheritance** — the policy implements a constitutional article directly and
  derives authority from it (plausible for `CONST-AI-001`, which mirrors Art. 3/Art. 8 AI limits).
- **Bootstrap/foundational status** — the policy formed part of the ratified initial system
  configuration and was approved by whoever approved that configuration.
- **Owner-role accountability** — `policies.owner_role` names an accountable officer, and their
  role authority is deemed sufficient.

**Audit implications.** An auditor asking "who approved this control?" receives no in-system
answer. Every assurance engagement over a policy-dependent control would carry a scope limitation.
`CTL-FIN-002` is already flagged as an assurance misstatement for a related reason; this would
generalise the pattern rather than contain it.

**How authority is proven without the FK.** It would have to be proven **outside** BEYU OS, in
board minutes or an equivalent register. The system would then be knowingly non-self-evidencing
for policy authority — a defensible position for a young system, but one that must be stated
explicitly rather than arrived at by default.

**Migration implications.** None. This is the current behaviour.
**Historical-data implications.** None.
**Reversibility.** High — Option A remains available later, subject to the same sequencing risk.

---

## 6. What engineering will do under each outcome

| Outcome | Engineering action |
|---|---|
| Option A chosen | Await provenance data; then a migration adding NOT NULL; then tests pinning it |
| Option A phased | Constraint applies to new policies only; recorded exemption for the five |
| Option B chosen | Record the accepted alternative evidence in the gap register; close C-1; no code change |
| No decision | Status quo persists; gate remains YELLOW; C-5 stays blocked behind this |

**Engineering will not choose.** Option B is materially cheaper and Option A is materially safer
in audit terms; that asymmetry is precisely why the choice belongs to the authority and not to the
implementer.

---

## 7. Decision record — to be completed by the competent authority

Nothing below may be filled in by an engineer or generated by a tool.

```
DECISION:            [ ] OPTION A — PROVENANCE REQUIRED
                     [ ] OPTION A (PHASED — new policies only)
                     [ ] OPTION B — PROVENANCE OPTIONAL
                     [ ] OTHER (specify)

CONDITIONS / SCOPE:  ______________________________________________

EXCEPTIONS:          ______________________________________________

DECIDING BODY:       ______________________________________________
RESOLUTION REF:      ______________________________________________
DECISION DATE:       ______________________________________________
EFFECTIVE DATE:      ______________________________________________

SIGNATURE:           ______________________________________________
NAME / ROLE:         ______________________________________________
```

**Until this block is completed and recorded as an APPROVED resolution in BEYU OS, C-1 remains
`PENDING` and the governance gate remains YELLOW.**
