# Authority Lifecycle Contract — Design & Open Decisions (C-2 … C-5)

**Status:** `[NOT AUTHORITY]` — design and audit artifact only. Nothing here is implemented, and
nothing here decides an open question. No enum value is invented.

**Phase:** 5S · Branch `arena/01a01b69-beyu-os-1-0`

---

## Part 1 — The conceptual authority chain (§5)

Seven states. The system today enforces the first three and can *represent* the fourth.

| # | State | Required authority | Required artifact | Enforcing layer | Audit evidence | Effective date | Scope | Revocation | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | POLICY EXISTS | administrative | row in `policies` | DB | row creation | n/a | tenant / global | delete | `[VERIFIED]` |
| 2 | POLICY ACTIVE | policy owner | `status = 'ACTIVE'` | app (`evaluatePolicy`) | none today | n/a | as row | set non-ACTIVE | `[VERIFIED]` enforced; transition rules `[GOVERNANCE DECISION REQUIRED]` (C-3) |
| 3 | POLICY EFFECTIVE | policy owner | `effective_from` / `effective_to` | app + DB CHECK | dates on row | the field itself | as row | set `effective_to` | `[VERIFIED]` |
| 4 | HAS VALID PROVENANCE | approving body | `approved_by_resolution_id` → existing resolution | DB (FK, 0007/0009) | resolution + its audit trail | resolution decision date | as row | supersede resolution | representable; **mandatory?** `[GOVERNANCE DECISION REQUIRED]` (C-1) |
| 5 | POLICY RATIFIED | Board / CGO | cited resolution with `status = 'APPROVED'` | **none** | resolution audit trail | resolution decision date | as row | new resolution | `[GOVERNANCE DECISION REQUIRED]` (C-5) |
| 6 | AUTHORIZED FOR DOMAIN | Board + domain owner | mapping policy → execution domain | **none — not representable** | — | — | — | — | `[GOVERNANCE DECISION REQUIRED]` (C-5) |
| 7 | MAY CONTROL EXECUTION | Board + CFO | states 5 + 6 together, plus a ratified execution rule | **none** | — | — | — | — | `[GOVERNANCE DECISION REQUIRED]` (C-5) |

**Key architectural finding (unchanged from 5R, re-verified):** states 4 and 5 require **no schema
change**. Every term is already representable — a policy is ratified iff it is ACTIVE, cites a
resolution, and that resolution's status is `APPROVED`. Only the *rule* is missing, and writing
the rule is the governance decision. Only states 6–7 would need new structure, because no join
path exists from `policies` to any capability identifier.

**Deliberately not proposed:** a `RATIFIED` enum value. `beyu_version_status` is an existing
ratified vocabulary; adding to it would create a second, competing authority concept.

---

## Part 2 — C-2 · Capital requests citing non-authoritative resolutions

**Current behaviour — verified empirically, and better than expected.** The capital governance
gate *does* distinguish resolution status. `getGovernanceDecisionAuthorization()` defines a single
authorising status and rejects everything else:

| Capital request | Cited resolution | Result |
|---|---|---|
| `CAP-2025-004` (USD 1.8M) | `BEYU-IC-2025-021` **TABLED** | `authorized=false` — "only an APPROVED resolution authorises this object" |
| `CAP-2025-011` | none | `authorized=false`, provenance `NONE` |
| `CAP-2025-015` | none | `authorized=false`, provenance `NONE` |
| `CAP-2025-019` | none | `authorized=false`, provenance `NONE` |

There is a **second, independent gate**: `provenance` must be `GOVERNED` (the decision has audit
ledger entries). All four seeded resolutions evaluate as `REFERENCE_DATA`, so **even the APPROVED
resolution cannot authorise a capital transition today**. Seeded data cannot move money.

- **Schema:** `capital_requests.resolution_id`, now FK-protected (0009).
- **Service layer:** `capital-governance-service.ts` requires `authorized === true` **and**
  `provenance === "GOVERNED"`.
- **Attack result:** a request citing a nonexistent resolution is rejected by the FK; a request
  citing a TABLED resolution is rejected by the service.
- **Constitutional basis:** Art. 4 (reserved matters require the competent body).
- **Risk:** low today, because capital execution does not exist.
- **Open question:** should a capital request be permitted to *reference* a pending resolution
  while awaiting its outcome (the current `CAP-2025-004` situation), or is that a data error?
  Referencing is arguably legitimate workflow; only *authorising* on it would be wrong, and that
  is already blocked.
- **Decision maker:** Group Board / Group CFO. **Implementation consequence if referencing is
  disallowed:** a CHECK or trigger plus remediation of `CAP-2025-004`. **Migration:** additive.
  **Historical data:** one row affected. **Reversibility:** high. **Exception:** none required.
- **Classification:** `[GOVERNANCE DECISION REQUIRED]` — but the *dangerous* half is already
  `[VERIFIED]` blocked.

---

## Part 3 — C-3 · Policy lifecycle transitions

- **Current behaviour:** every transition succeeds at the DB layer, including `RETIRED→ACTIVE`,
  `SUPERSEDED→ACTIVE`, `DRAFT→ACTIVE`, `ACTIVE→DRAFT`. Only an invalid enum value is rejected.
- **Service layer:** **there is no application or service write path to `policies` at all.**
  Verified by inspection: the only writer is the seed.
- **Attack result:** reachable only by direct SQL, i.e. by a principal who could equally drop any
  constraint added to stop them.
- **Risk:** low in practice, high in principle — an unaudited change to a live control.
- **Options:** (i) leave policies administratively immutable and manage change by
  supersession; (ii) define a legal transition matrix and enforce it in a trigger; (iii) build a
  governed policy-management service with audit.
- **Why not decided here:** whether `SUSPENDED→ACTIVE` is reinstatement or requires re-approval,
  and whether `SUPERSEDED→ACTIVE` is a legitimate incident rollback, are governance judgements.
  Building option (iii) merely because it looks architecturally complete would invent semantics
  and contradict the standing prohibition on new features.
- **Decision maker:** Board / CGO. **Migration consequence:** trigger only, additive.
  **Historical data:** none. **Reversibility:** high. **Exception:** emergency rollback path
  would need explicit definition.
- **Classification:** `[GOVERNANCE DECISION REQUIRED]`.

---

## Part 4 — C-4 · Amendment of approved resolutions

- **Current behaviour:** an APPROVED resolution's `status`, `title` and `decision_date` can be
  rewritten by direct SQL. Deletion is blocked while anything cites it (0007/0009 FKs).
- **Service layer — an important mitigation:** every status write in
  `governance-vote-service.ts` is guarded by a status-scoped `WHERE` clause (tabling requires
  `DRAFT`; deciding requires `TABLED`/`VOTED`), so the application cannot perform an out-of-order
  or concurrent transition.
- **Constitutional basis:** Art. 8 freezes the *audit ledger* ("No component may alter or delete
  audit history") and that **is** enforced — UPDATE, DELETE and TRUNCATE are all blocked. Art. 8
  does not, on its plain text, freeze the resolution record itself. Art. 5 prescribes "controlled
  reversal or adjustment" for *financial* history only.
- **Risk:** the decision record could drift from the audit trail that evidences it. Note the audit
  trail remains immutable, so tampering would be **detectable**, not silent.
- **Options:** (i) freeze approved resolutions with a trigger and require a superseding
  resolution for any change; (ii) permit clerical correction under a defined amendment procedure
  with mandatory audit; (iii) status quo.
- **Why not decided here:** option (i) forbids fixing a typo with no replacement procedure;
  option (ii) requires an amendment procedure that does not exist. Either way the *procedure* must
  be authored by governance first.
- **Decision maker:** Board / CGO. **Migration consequence:** trigger, additive.
  **Historical data:** none. **Reversibility:** high. **Exception:** clerical correction must be
  explicitly addressed.
- **Classification:** `[GOVERNANCE DECISION REQUIRED]`.

---

## Part 5 — C-5 · Representing RATIFIED / AUTHORIZED / EXECUTION-ELIGIBLE

- **Current behaviour:** none of the three is represented. The policy engine is indifferent to
  provenance, proven by test: policies with NULL, TABLED and APPROVED provenance are consumed
  identically.
- **Risk:** the system cannot answer "is this control ratified?" — the core YELLOW condition.
- **Design note (not a proposal to implement):** states 5 needs no schema change; state 6 needs a
  policy→domain mapping that does not exist; state 7 is the conjunction plus a ratified execution
  rule.
- **Why not decided here:** defining what ratification *means* and who confers it **is** the
  governance decision. Implementing it would manufacture authority — the one thing this phase
  forbids.
- **Dependency:** C-5 cannot sensibly be answered before C-1. If provenance is optional
  (Option B), "ratified" needs a different evidentiary basis entirely.
- **Decision maker:** Group Board. **Classification:** `[GOVERNANCE DECISION REQUIRED]`.

---

## Part 6 — Summary

| ID | Question | Dangerous half blocked? | Status |
|---|---|---|---|
| C-1 | Is policy provenance mandatory? | n/a | `PENDING` — see `C1_POLICY_PROVENANCE_DECISION.md` |
| C-2 | May capital cite a non-approved resolution? | **yes** — TABLED cannot authorise | `PENDING` (referencing only) |
| C-3 | Are policy lifecycle transitions governed? | partly — no write path exists | `PENDING` |
| C-4 | May an approved resolution be amended? | partly — deletion blocked, audit immutable | `PENDING` |
| C-5 | How is ratification represented? | n/a — nothing consumes it | `PENDING`, blocked behind C-1 |

**C-1 is the critical path.** C-5 depends on it directly, and C-2/C-3/C-4 are all lower-risk than
they appear because the execution surface they would guard does not yet exist.

---

## Part 7 — Phase 5T hostile finding: who can actually enact a ratification?

`§3c` of the ratification package instructs that each ratification be enacted through the
governed decision path so it acquires a `GOVERNED` audit trail. That instruction is only
followable if a competent seat can actually pass the resolution. Verified empirically:

| Body | Seats | Seats mapped to a login | Seats holding `governance:resolution.approve` |
|---|---|---|---|
| GROUP_BOARD | 5 | 5 | 2 (CEO, CGO) |
| FAMILY_COUNCIL | 3 | 3 | 2 (CEO, CGO) |
| INVESTMENT_COMMITTEE | 3 | 3 | 1 (CEO) |
| RISK_AUDIT_COMMITTEE | 3 | 3 | 1 (CGO) |
| TAX_GOVERNANCE_COMMITTEE | 3 | 3 | 1 (CGO) |
| TRUSTEE_BOARD | 2 | 2 | 1 (CGO) |

**Every body has at least one eligible decider, so the ratification path is executable.**
This supersedes the earlier "four bodies lack eligible decision authority" concern at the level
of *approval capability*; quorum and majority remain governed by the existing engine.

**The finding that matters for the handoff:** `GROUP_CFO` does **not** hold
`governance:resolution.approve` — verified from the canonical role definitions. Yet §7 of the
ratification package names the **Group CFO** as the approving authority for ten of the eleven
P-decisions.

**Classification: `[GOVERNANCE DECISION REQUIRED]` — not a defect, and deliberately not "fixed".**

This is coherent separation of duties, not an oversight: the CFO holds financial execution
authority (`finance:ledger.post`, `finance:capital.manage`) while the CGO holds governance
approval authority. Granting the CFO `governance:resolution.approve` would collapse that
separation and hand one principal both the power to authorise a policy and the power to execute
money under it. **That must not be done to make a workflow convenient.**

Consequence the authority must resolve when ratifying P1–P11 — the choices are governance
choices, and engineering must not pick one:

1. **CFO decides, CGO/Board records.** The CFO's accounting determination is minuted, and the
   corresponding resolution is passed by a body whose seats hold approval authority. Preserves
   separation; adds a recording step.
2. **The Board ratifies directly**, taking the CFO's determination as input.
3. **Grant the CFO governance approval authority.** Available, but it collapses the separation
   described above and would itself require Board ratification under Art. 4.

**Engineering consequence:** none until chosen. No permission change is proposed or made.
