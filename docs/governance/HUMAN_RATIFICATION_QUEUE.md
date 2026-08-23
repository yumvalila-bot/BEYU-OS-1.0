# Human Ratification Queue

**Status:** `[NOT AUTHORITY]` — a work queue for named humans. Decides nothing, approves nothing.
**Phase:** 6 · Branch `arena/01a01b69-beyu-os-1-0` · Baseline commit `f0f90ab`
**Outcome of Phase 6 authority intake:** `PATH A — NO NEW RATIFICATION EXISTS`

---

## 1. Authority intake result

Phase 6 searched for genuinely new authority and found none. Evidence:

| Source checked | Result |
|---|---|
| Commits since Phase 5T | 0 |
| Uncommitted governance artifacts | 0 |
| Resolutions in the database | 4, unchanged (2 APPROVED, 1 TABLED, 1 DRAFT) |
| APPROVED resolutions covering any P or C decision | **0** — they cover waterfall config v2.1 and beneficiary-class verification |
| ACTIVE policies granting accounting authority | **0** — `CONST-AI-001` contains only DENY rules and one HUMAN_REVIEW obligation; zero ALLOW rules touching ledger, posting or accounts |
| Signed ratification documents | **0** — every `STATUS:` in the ratification register reads `PENDING`, every `SIGNATORY:` and `DATE:` is blank |
| Resolutions that could authorise execution | **0** — all four evaluate to `provenance = REFERENCE_DATA`, which the capital gate refuses |

**ACCOUNTING AUTHORITY = NOT RATIFIED.** C-1…C-5 remain governance decisions. P1–P11 remain
pending except P4's previously documented partial authorisation.

**Nothing was implemented.** Verified after intake: 0 ledger accounts, 0 financial periods, 0
journal entries, 0 journal lines, 0 FUNDED capital requests; `finance:ledger.approve`,
`capital:execute` and `treasury:settle` have 0 definitions; no posting, recognition or FX engine
exists in `src/lib/`.

---

## 2. The queue

Ordered by dependency. Each item blocks everything beneath it that names it as a dependency.

### Q1 — Policy provenance (C-1)

| Field | Value |
|---|---|
| **Required authority** | Group Board / Chief Governance Officer |
| **Current status** | `PENDING` — decision-ready |
| **Exact decision required** | Must every ACTIVE policy that can influence execution carry provenance to an approving resolution? Choose Option A (required), Option A phased (new policies only), or Option B (optional). |
| **Evidence required** | A completed decision block in `docs/governance/C1_POLICY_PROVENANCE_DECISION.md`, enacted as an APPROVED resolution |
| **Dependencies** | none — this is the critical path |
| **Unlocks** | C-5, and the ability to state that any BEYU policy is ratified |

> **Sequencing hazard.** If Option A is chosen, remediation must be **data first, constraint
> second**. Applying `NOT NULL` before retro-linking would deactivate all five ACTIVE policies —
> including `CONST-AI-001`, which denies AI ledger posting — and disable the policy engine.

### Q2 — CFO governance-approval authority

| Field | Value |
|---|---|
| **Required authority** | Group Board |
| **Current status** | `PENDING` |
| **Exact decision required** | `GROUP_CFO` does not hold `governance:resolution.approve`, yet is named approving authority for ten of eleven P-decisions. Choose: (a) CFO determines and an authorised body records the resolution; (b) Board ratifies directly on the CFO's determination; (c) grant the CFO approval authority. |
| **Evidence required** | Board resolution recording the chosen route |
| **Dependencies** | none |
| **Unlocks** | a followable ratification path for P1–P11 |

> Option (c) collapses separation of duties — one principal would both authorise a policy and
> execute money under it. Engineering has deliberately made no permission change.

### Q3 — Independent accounting decisions: P1, P5, P7, P9

| Field | Value |
|---|---|
| **Required authority** | Group CFO · **Group Board** for P7's fiscal year · CFO + Architecture Review Board for P5 (Art. 11) |
| **Current status** | `PENDING — NOT RATIFIED` |
| **Exact decision required** | P1 recognition basis and recognition event · P5 chart-of-accounts scope model, numbering scheme and owner · P7 fiscal year-end, period frequency and period-open authority · P9 maker/checker model and whether the CFO may self-approve |
| **Evidence required** | Completed `§3c` blocks in `docs/finance/DRAFT_ACCOUNTING_POLICY_RATIFICATION_PACKAGE.md`, each enacted through the governed decision path |
| **Dependencies** | Q2 (route), and Q1 if policy provenance is to be relied upon |
| **Unlocks** | P2, P3, P6, P8 — and the first migration that may legitimately create accounting structure |

### Q4 — Specialist reviews: P3 (VAT), P4 (IAS 21 FX)

| Field | Value |
|---|---|
| **Required authority** | Group CFO plus the named specialists |
| **Current status** | `PENDING — SPECIALIST REQUIRED` |
| **Exact decision required** | P3 measurement basis, materiality threshold, rounding, VAT-inclusive/exclusive · P4 reporting currency and named FX rate source with rate-date convention |
| **Evidence required** | Specialist sign-off in the `§3c` blocks |
| **Dependencies** | P3 depends on P1 |
| **Unlocks** | measurement, and any cross-currency posting. **P4 is deferrable** if the first pilot is single-functional-currency |

> Seeded treasury balances imply three inconsistent USD/TZS rates and must never be used as a rate
> source.

### Q5 — Dependent decisions, then P10 and P11

| Field | Value |
|---|---|
| **Required authority** | Group CFO under `ENT-FIN-002`; **Group Board** for any new capability |
| **Current status** | `BLOCKED BY DEPENDENCY` |
| **Exact decision required** | P2 capital treatment · P6 initial CoA tranche · P8 period lifecycle · P10 pilot transaction · P11 execution boundary |
| **Evidence required** | Completed `§3c` blocks |
| **Dependencies** | P2←P1 · P6←P1,P5 · P8←P7 · P10←P1–P9 · P11←P10 |
| **Unlocks** | the accounting substrate, then the posting service, then capital execution |

### Q6 — Lower-urgency governance questions: C-2, C-3, C-4

| Field | Value |
|---|---|
| **Required authority** | Group Board / Chief Governance Officer |
| **Current status** | `PENDING` |
| **Exact decision required** | C-2 may a capital request reference a pending resolution? · C-3 which policy lifecycle transitions are legal? · C-4 may an approved resolution be amended, and under what procedure? |
| **Evidence required** | Board/CGO resolution per question |
| **Dependencies** | none |
| **Unlocks** | optional hardening only |

> Lower risk than they appear: C-2's dangerous half is already blocked (a TABLED resolution cannot
> authorise), C-3 has no application write path to `policies`, and C-4's audit trail is immutable
> so tampering is detectable.

---

## 3. Standing instruction to engineering

Until an item in this queue is ratified **and** verifiable as `provenance = GOVERNED`:

- Do not create a chart of accounts, financial periods, a posting service, recognition rules, an
  FX engine, tax posting, CAPEX treatment, opening balances, maker/checker permissions,
  `finance:ledger.approve`, `capital:execute`, `treasury:settle`, or treasury settlement.
- Do not populate any decision field in any ratification artifact.
- Do not treat a prompt, an AI-generated document, a DRAFT, a RECOMMENDATION or a TABLED
  resolution as authority.
- A ratification supplied as seed data or a direct database edit will be **correctly ignored** by
  the system, because the capital gate refuses `REFERENCE_DATA`. Each ratification must be enacted
  through the governed decision path so it acquires a `GOVERNED` audit trail.

**The next legitimate engineering phase is Phase 6B — Ratified Accounting Substrate**, valid only
once Q3's P1, P5, P6 and P7 are ratified and verified. Until then there is no further
policy-independent engineering to perform.

---

## 4. Phase 6B re-verification (independent re-run of the intake gate)

Phase 6B re-ran the authority intake gate from scratch rather than trusting the Phase 6 result.
The outcome is unchanged: **PATH A — NO NEW RATIFICATION EXISTS.** No accounting substrate was
implemented, and this queue stands as written.

Every candidate was put through the full twelve-point provenance test. All four resolutions
failed at the same two points:

| Resolution | Status | Approval date | Provenance | Can control execution |
|---|---|---|---|---|
| `BEYU-BRD-2025-014` | APPROVED | 2025-08-14 | `REFERENCE_DATA` | **no** |
| `BEYU-FC-2025-007` | APPROVED | 2025-06-02 | `REFERENCE_DATA` | **no** |
| `BEYU-IC-2025-021` | TABLED | — | `REFERENCE_DATA` | **no** |
| `BEYU-TGC-2025-031` | DRAFT | — | `REFERENCE_DATA` | **no** |

Two structural facts that constrain any future ratification, both re-confirmed here:

1. **The `resolutions` table has no signatory, effective-date, scope or conditions column.** A
   resolution alone therefore cannot carry the full provenance the ratification package requires;
   the completed `§3c` decision block is the artifact that supplies those fields, and the
   resolution is the governance record that enacts it. Both are needed.
2. **Every resolution currently evaluates to `REFERENCE_DATA`**, which the capital gate refuses.
   Seeded and directly-edited records cannot authorise execution. A ratification must be enacted
   through the governed decision path to acquire a `GOVERNED` audit trail.

Other channels: 0 new commits · 0 uncommitted governance artifacts · 0 ALLOW rules granting
accounting authority across all five ACTIVE policies (`CONST-AI-001` carries three DENY rules and
one HUMAN_REVIEW obligation, and grants nothing) · 22 ratification `STATUS:` lines all reading
`PENDING` · 0 populated signatory, date, effective-date or selected-option fields anywhere in
`docs/`.

Boundary re-verified intact after the gate: 0 ledger accounts, 0 financial periods, 0 journal
entries, 0 journal lines; `finance:ledger.approve`, `capital:execute` and `treasury:settle` have
0 definitions; no posting, recognition or FX module exists.
