# Policy & Resolution Lifecycle — Hostile Audit Findings (Phase 5Q)

**Status:** FINDINGS ONLY — NOT AUTHORITY. Nothing in this document has been ratified.
**Method:** direct attack against the running database and the policy engine. Destructive
probes ran in an isolated scratch database (`beyu_hostile_q`) or inside always-rolled-back
transactions. The main database was verified byte-identical before and after.

---

## 1. The question this phase asked

Can BEYU OS distinguish between a policy that **exists**, one that is **active**, one that is
**effective**, one that is **approved**, one that is **ratified**, and one that is **allowed to
control execution**?

**Answer: partially, and the distinction is enforced by exactly one mechanism.**

| Concept | Represented? | Enforced by |
| --- | --- | --- |
| EXISTS | yes | row in `policies` |
| ACTIVE | yes | `status = 'ACTIVE'` |
| EFFECTIVE | yes | `effective_from` / `effective_to` window (fixed in Phase 5O) |
| APPROVED | **column only** | `approved_by_resolution_id`, nullable, unenforced |
| RATIFIED | **no** | no representation anywhere in the schema |
| ALLOWED TO CONTROL EXECUTION | **no** | no such concept exists |

`evaluatePolicy()` consumes a policy if and only if it is `ACTIVE` **and** inside its effective
window. Verified empirically: of nine fixtures spanning every lifecycle status, exactly one was
consumed. DRAFT, IN_REVIEW, APPROVED, SUPERSEDED, SUSPENDED and RETIRED policies are all inert,
as are ACTIVE policies outside their window.

**Consequence:** "approved" and "ratified" are documentation, not enforcement. A policy that no
governance body ever approved controls the engine identically to one that was approved.

---

## 2. Fixed in this phase (policy-independent defects)

These required no business judgement — they were internal inconsistencies or violations of
already-ratified constitutional text.

### 2.1 Audit ledger could be erased by TRUNCATE — **FIXED**

Constitution Art. 8, verbatim: *"All material actions are recorded in an append-only,
hash-chained audit ledger. No component may alter or delete audit history."*

The controls installed in migration 0001 are `FOR EACH ROW` triggers on `UPDATE OR DELETE`.
Row-level triggers **do not fire for TRUNCATE**. A single `TRUNCATE enterprise_events CASCADE`
succeeded against 49 rows, erasing the entire event history and its sequence high-water mark.
UPDATE and DELETE were correctly blocked, which is exactly why this gap was easy to miss.

Fixed in `drizzle/0008_...sql` with statement-level `BEFORE TRUNCATE` triggers on both
`audit_log` and `enterprise_events`, reusing the existing guard function's error contract.

### 2.2 Incoherent policy effective windows — **FIXED**

`policies` accepted `effective_to < effective_from`, producing a policy that is nominally ACTIVE
but can never be in force. The same codebase already enforces the equivalent rule on
`financial_periods` (`financial_period_dates_ordered`), so this was inconsistent enforcement of
an idea the system had already settled. Zero existing rows violated it; the constraint is
additive and non-destructive.

---

## 3. NOT fixed — `[GOVERNANCE DECISION REQUIRED]`

Each of the following is a real gap. **None can be closed without inventing a business rule**,
which is prohibited. Each is recorded here rather than implemented.

### 3.1 No policy status state machine

Every illegal lifecycle transition succeeded at the database layer, including
`RETIRED -> ACTIVE`, `SUPERSEDED -> ACTIVE`, `DRAFT -> ACTIVE` and `ACTIVE -> DRAFT`. Only an
invalid *enum value* was rejected.

**Mitigating fact, established by inspection:** there is **no API route and no service function
anywhere in the codebase that writes to `policies`.** The only write path is the seed. These
transitions are therefore reachable only by an actor who already holds direct SQL access — a
principal who can equally drop the constraint that would forbid them.

**Why not fixed:** nobody has defined which transitions are legal. Is `SUSPENDED -> ACTIVE`
reinstatement (legitimate) or is a suspended policy required to be re-approved first? Is
`SUPERSEDED -> ACTIVE` a rollback (legitimate during an incident) or forgery? These are
governance questions, not engineering ones. Guessing would encode a rule no body ratified.

**Decision needed from:** Board / Chief Governance Officer.

### 3.2 Policy approval linkage remains optional and unvalidated

Carried forward unchanged from Phase 5P. `approved_by_resolution_id` is nullable, and when set,
is not required to reference an `APPROVED` resolution — a `TABLED` or `DRAFT` resolution is
accepted as the basis for an ACTIVE policy.

**Why not fixed:** **all five seeded ACTIVE policies have `approved_by_resolution_id = NULL`.**
Enforcing linkage would immediately deactivate `CONST-AI-001` — the article that denies AI
`finance:ledger.post` — and disable the policy engine entirely. The fix is more dangerous than
the defect until the five policies are retro-linked to real resolutions by the competent body.

Phase 5P did add the missing foreign key with `ON DELETE RESTRICT`, so the column can no longer
reference a fabricated resolution id.

### 3.3 Approved resolutions are freely mutable after the fact

An `APPROVED` resolution's `status`, `title` and `decision_date` can all be rewritten by direct
SQL. Its **deletion** is blocked (Phase 5P foreign key), but its **content** is not frozen.
Art. 8 freezes the *audit ledger*; it does not, on its plain text, freeze the resolution record.

**Mitigating fact:** the service layer does enforce legal transitions. Every status write in
`governance-vote-service.ts` is guarded by a status-scoped `WHERE` clause (e.g. tabling requires
`status = 'DRAFT'`; deciding requires `TABLED` or `VOTED`), so concurrent or out-of-order
transitions cannot be applied through the application.

**Why not fixed:** freezing approved resolutions would forbid legitimate corrections
(typographical fixes, clerical amendment) with no ratified amendment procedure to replace them.
Art. 5 prescribes "controlled reversal or adjustment" for *financial* history; no equivalent
procedure exists for governance records. Building one is a new feature, not an audit fix.

**Decision needed from:** Board / Chief Governance Officer — specifically, whether resolution
amendment requires a superseding resolution.

---

## 4. Verified sound (attacked, held)

- **Precedence is deterministic.** Deny-overrides holds regardless of policy level: a
  `WORKFLOW_RULE` DENY beats a `CONSTITUTION` ALLOW, and a same-level ALLOW/DENY conflict
  returned DENY on 20 consecutive evaluations.
- **Effective-window boundaries are inclusive and unambiguous** at both ends;
  `effective_from` is NOT NULL, so no policy has an undefined start.
- **The AI boundary cannot be spoofed.** `aiInitiated` is hardcoded server-side at every call
  site and appears in no request body. Noelia is the single AI entry point and cannot reach
  `finance:ledger.post`, which is denied for AI principals holding *any* role combination.
- **Audit and event rows remain immutable** against row-level UPDATE and DELETE, and now
  against TRUNCATE.
- **Approved resolutions cannot be deleted** while a policy references them.

---

## 5. Standing risk statement

The governance layer can prove *what a policy says* and *when it applies*. It cannot yet prove
*who authorised it*. Until finding 3.2 is resolved by the competent body, no policy in BEYU OS
should be cited as evidence of ratified authority in an assurance or audit context.
