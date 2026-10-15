# BEYU-SCG-17 — Phase 2 Verification Report

Document ID: `BEYU-SCG-17`
Title: Phase 2 Verification Report
Version: 1.0
Date: 2026-10-15
Status: `INFORMATIONAL`
Classification: `INTERNAL`
Owner (proposed): Chief Governance Officer `[TO BE APPOINTED]`
Approving authority (proposed): BEYU Holding Company board `[NOT REPRESENTED IN THIS REPOSITORY AS LEGALLY CONSTITUTED]`
Next review date: when any blocker in `BEYU-SCG-16` clears
Related documents: `BEYU-SCG-15` (traceability and enforcement), `BEYU-SCG-16` (blockers), `BEYU-SCG-01`…`BEYU-SCG-14`; legal pack amendment proposal
Depends on: the commit range named in §2

> **CONTROL BLOCK.**
> **This is** the report of what was actually run in this phase, what it returned, what it did not
> cover, and what a human still has to decide.
> **This is not** an approval, a certification, a legal opinion, or evidence that anything was
> deployed. **Nothing in this report authorizes any automation.** `R-AUT-01` is ZERO, authorization is
> unavailable, and this report is written to make that state easy to verify rather than easy to skip.

---

## 1. Executive summary

| Question | Answer |
|---|---|
| Is the authority boundary enforced in code? | **Yes, for the paths tested.** `authorizeAutomation()` denies by default and cannot be unlocked by configuration, data or posture |
| Is any automation authorized? | **No.** `R-AUT-01` is ZERO, and a test asserts it stays empty |
| Can anything sign, submit, broadcast, post, pay or transfer? | **No.** No key material, no signing dependency, no signing call in the governed domain |
| Is the inventory trustworthy? | **Internally consistent and mechanically checked.** Its coverage is a floor, not a completeness proof |
| Did the pack's numbers match the code? | **Almost.** One precision defect found and corrected (`P-1`, 7 gates vs 8 codes) |
| How many blockers remain? | **26 open, 0 cleared** (`BEYU-SCG-16`) |
| Was anything deployed, migrated in production, or approved? | **No.** Nothing was merged, deployed, approved or authorized |
| What must a human decide now? | The **PR split** (§4) and whether to merge at all. Both are human decisions |

---

## 2. Exact evidence

Environment: an **isolated, ephemeral, non-production** PostgreSQL 16.14 instance,
`data_directory=/home/user/BEYU-OS-1.0/pgdata` (gitignored), created for this phase and disposable.
Synthetic seed data only. No credentials were printed, committed or copied. No `.env` file exists in
the repository; only `.env.example`.

| Command | Result | Notes |
|---|---|---|
| `npx tsx scripts/migrate.ts` | **exit 0** | fingerprint `eb5f5cac0b5b825e17abe1a6f9a9f18a` → `63d4a9a9fe33b9cfa043134e33333f61` |
| `npx tsx scripts/setup-db-role.ts` | **exit 0** | runtime role reconciled: `rolsuper false`, `rolbypassrls false` |
| `npm run db:setup-governance-role` | **exit 0** | governance role reconciled `NOBYPASSRLS`, non-owner, finite privileges |
| `npx tsx src/db/seed.ts` | **exit 0** | "Bootstrap credentials were not printed." |
| `npm run verify:scg` | **4 checks, 0 blocking, 0 advisory** | V-3, V-4, V-6, V-7 |
| `npx vitest run tests/smart-contracts` | **54 passed, 0 failed** | new enforcement suite |
| `npx vitest run tests/{contracts,blockchain,payments,hcm,family,registry,security,governance,architecture,smart-contracts}` | **140 files passed, 18 skipped; 2,364 tests passed, 126 skipped, 0 failed** (130.4 s) | the 18 skipped files are all `-http.test.ts` suites needing a running server |
| `npx vitest run tests/security/search-rls-isolation.test.ts` (twice) | **12 passed, 12 passed** | the second run is the decisive evidence for `D-7` |
| `npx tsc --noEmit` | **exit 0** | with `NODE_OPTIONS=--max-old-space-size=3072`; the sandbox OOMs without it |
| `npx eslint .` | **0 errors** | one pre-existing `no-img-element` warning in an unrelated component |

### 2.1 What was NOT run, and is therefore not claimed

* **No HTTP suite.** Every `-http.test.ts` suite **skipped** for want of a running server. No HTTP
  result is claimed anywhere in this report.
* **No full suite.** The migration-drift and gate-self-test suites spawn real `drizzle-kit`
  sub-processes and take roughly fifteen minutes; they were not run in this phase.
* **No browser or Playwright specifications.**
* **No build.** `npm run build` was not run in this phase.
* **No production migration, no deployment, no network call to any chain, and no migration applied
  anywhere except the isolated instance described above.**

A skipped suite is not a passing suite. The counts above distinguish the two, and no reader should add
them together.

---

## 3. Phase 2A — audit table

Findings from tracing every claimed control to code and tests. **Documentation-only** means the rule
exists as text with no mechanical enforcement, which is recorded rather than treated as failure.

| # | Finding | Evidence (path) | Risk | Status | Action taken | Test coverage | Approval needed |
|---|---|---|---|---|---|---|---|
| `A-01` | `risk.ts` header said "Four rules" while `RULE_WEIGHTS` held five and five signals were emitted | `src/lib/payments/risk.ts` L78/113/147/175/192 | LOW — code correct, header understated the control set | **FIXED** | Header corrected to "Five rules" | `tests/payments/payment-controls-db.test.ts` | none — no behaviour change |
| `A-02` | `ingest.ts` line 2 was an import stranded inside the leading block comment; a live duplicate sat at L42 | `src/lib/payments/ingest.ts` | LOW–MEDIUM — a reader auditing imports would read a comment as authority; deleting the live import later would leave the comment looking live | **FIXED** | Line moved out of the comment; exactly one import remains | `tests/payments` (185 tests), re-run | none |
| `A-03` | `search-rls-isolation.test.ts` bound the tenant id to `code`, which is globally unique on a **deletion-proof** table | `tests/security/search-rls-isolation.test.ts` | **MEDIUM** — silently breaks a security control on any persistent database; invisible to CI because CI's database is ephemeral | **FIXED** | Bindings aligned to the column list; immutability trigger untouched | suite now passes twice consecutively | none — test-only |
| `A-04` | The pack said "7 execution gates"; the code has 7 conditions but **8 distinct blocker codes** | `src/lib/blockchain/model.ts` L979–988 | LOW — understated gate set | **CORRECTED** | Recorded as `P-1`; pack wording amended | `tests/blockchain/model.test.ts` | none |
| `A-05` | `AUTOMATION_INVENTORY.json` recorded `A-01` as an open drift | inventory AUT-08 | LOW — doc/code divergence would reverse if only one side were fixed | **FIXED both sides** | Inventory now records `D-5` as fixed, and `A-02` as `D-6` | V-3 | none |
| `A-06` | All nine `BEYU-SCG-08` registers open at ZERO | `REGISTERS_AND_TEMPLATES.md` | — | **CORRECT AS WRITTEN** | None. Honest emptiness | V-05 sweep | governance body |
| `A-07` | 16 authority-check kinds exist; how many were ever performed is recorded nowhere | `src/lib/contracts/vocabulary.ts` L238 | MEDIUM — a vocabulary is not a performance record | **RECORDED** | `BEYU-SCG-15` `C-4`; `BLK-21` | — | engineering + governance |
| `A-08` | `src/db/seed.ts` writes demo family members with fabricated `verifiedBy: "FAMILY_COUNCIL"`, `verificationMethod: "DOCUMENTARY_AND_COUNSEL_REVIEW"`, `verifiedAt: 2025-06-02` | `src/db/seed.ts` ~L1114–1132 | **HIGH if misread** — synthetic verification metadata could be read as legal evidence | **RECORDED** | `BLK-08`; no fixture change (beyond mandate) | family suites | privacy owner + counsel |
| `A-09` | Family Office membership is **not modelled** in schema or service | `src/db/schema/people.ts`, `src/lib/family/**` | MEDIUM | **RECORDED** | `BLK-05`, `BLK-06` | — | governance + privacy |
| `A-10` | Minority, guardian and date of birth are **not modelled anywhere** | schema, service and test search | **HIGH for child protection** | **RECORDED** | `BLK-06`; drafting rules in §6 | — | privacy + counsel |
| `A-11` | `registerFamilyMember` correctly creates **no** user, password, session or role, and refuses `directDescendant` without verification | `src/lib/admin/registry-service.ts` | — | **VERIFIED GOOD** | None — cited as existing strength | `tests/registry/family-registration.test.ts` | none |
| `A-12` | The environment was verified isolated before migrating or seeding | ephemeral PG 16.14; `pgdata/` gitignored; no `.env`; `tests/setup-env.ts` redirects when `BEYU_TEST_DATABASE_URL` is set | — | **VERIFIED** | None | — | none |
| `A-13` | The pack's `V-09` ("documentation-only change set") is **SUPERSEDED** by this phase | `VERIFICATION_LOG.md` V-09; this change set contains code | MEDIUM — a stale claim about the PR's own nature | **RECORDED** | §4; `BLK-23` | — | human reviewer |
| `A-14` | Three defects were found in the new guards themselves while writing them | `BEYU-SCG-15` `P-2`, `P-3`, `P-4` | LOW | **FIXED** | Comments stripped before matching; policy module exempted; `KEY_VALUE` widened | 54 tests, including can-the-check-fail cases | none |

---

## 4. Phase 2J — PR hygiene, and the split recommendation

### 4.1 Observed state of PR #108

| Property | Observed |
|---|---|
| State | **OPEN**, not draft, not merged |
| Head | `arena/8fbc8030-beyu-os-1-0` at `8e44971` when inspected; this phase added commits on top |
| Base | `main` @ `05e2fba` |
| Mergeability | MERGEABLE / mergeState UNSTABLE |
| Size at inspection | 137 files, **+28,363 / −0**, entirely under `docs/` |
| Review decision | empty — **no human review recorded** |

**After this phase the change set is no longer documentation-only.** It contains code, tests, a
package script and a CI step. The pack's own verification statement `V-09` asserted the documentation-
only property, and that assertion is now false for the branch as a whole. This is stated plainly
because a stale claim of that kind is exactly the sort of thing that gets trusted later.

### 4.2 Recommendation — split into two pull requests (a recommendation, not an action)

**Recommended: split, with the documentation pack first.**

| PR | Contents | Why it stands alone |
|---|---|---|
| **PR A — the documentation pack** | the 17 paths of `BEYU-SCG` (`8e44971`), unchanged, plus this phase's four new/updated documents | It is self-contained drafting work product. It changes no behaviour, so reviewing it requires no test evidence and no migration reasoning |
| **PR B — governance enforcement** | `src/lib/smart-contracts/**`, `tests/smart-contracts/**`, `scripts/scg-checks.ts`, the `verify:scg` script, the CI step, the `verify.mjs` step, and the two payment fixes | It changes behaviour, so it must be reviewed as code: test evidence, failure modes, and the question "can this check be defeated?" |

Reasons, in order of weight:

1. **Different reviewers, different questions.** The documentation pack asks "is this the right
   governance position?" The enforcement change asks "can this boundary be defeated?" One review with
   both questions produces an answer to neither.
2. **Different rollback costs.** Reverting a document is free. Reverting a CI gate silently removes
   enforcement, so it must be reverted deliberately and visibly.
3. **`V-09` can be true again.** With the split, PR A is genuinely documentation-only and its own
   verification statement holds without amendment — the cleanest possible outcome.
4. **The enforcement change is reviewable on its own merits.** 54 tests, four mechanical checks, and
   every denial path exercised. That is a small, coherent change set that a reviewer can finish.

**Not recommended:** merging the two as one unit, unless the board expressly wants the governance
position and its enforcement to move together — which would require a reviewer qualified for both and
a recorded rationale for coupling them.

**Explicitly not done:** this recommendation has **not** been executed. PR #108 has not been split,
rewritten, closed or merged, and no force-push or history rewrite was performed. Splitting is a human
decision at the review gate, and executing it without instruction would destroy review history.

### 4.3 Review checklist for whichever shape is chosen

* Confirm no human-approval claim appears anywhere — no self-approval, no auto-merge, no deployment.
* Confirm `R-AUT-01` is still ZERO and authorization is still unavailable.
* Confirm the change set contains no key material, no address and no credential.
* Confirm every test count quoted in this report matches the run the reviewer performed.
* Confirm the skipped HTTP suites are reported as skipped, not as passed.
* Read the can-the-check-fail tests before trusting the checks.

---

## 5. Security and privacy findings

| # | Finding | Impact | Disposition |
|---|---|---|---|
| `S-1` | A security suite was non-idempotent against a persistent database because a globally-unique column received a non-unique value on a deletion-proof table | A security control silently stops running and reports as *skipped* while its suite reports as *failed* | **FIXED** (`A-03`), proven by two consecutive passing runs |
| `S-2` | CI cannot detect that class of defect: its PostgreSQL service is ephemeral and run-scoped, so CI only ever performs the first run | A control can be green in CI and broken everywhere else | **RECORDED** — recommend a persistence-based check or an explicit note that CI performs a first-run-only validation |
| `S-3` | The naïve signing-surface scan flagged a protection (`FORBIDDEN_EVENT_FIELDS`) as the danger it prevents | A check that punishes a safeguard applies pressure to remove the safeguard | **FIXED** (`P-3`); the distinction is now pinned by a test |
| `S-4` | Denials carry a named reason and no secret, payload body or personal data | — | **VERIFIED GOOD** |
| `S-5` | A minor's data is classified `HIGHLY_RESTRICTED` and no login, role or session is created from membership | — | **VERIFIED GOOD**, but minority is not modelled (`BLK-06`) |
| `S-6` | Seed data contains fabricated verification metadata (`A-08`) | Synthetic "counsel review" metadata could be mistaken for legal evidence | **RECORDED** (`BLK-08`); never cite seed data as evidence |
| `S-7` | No secret, credential or address was printed, committed or exposed in this phase | — | **VERIFIED** — `verify:scg` V-4 passes with zero findings, including advisory |

---

## 6. Phase 2E / 2F — family roles and child safety

The full position is recorded in the legal-pack proposal
`family-office/BEYU-LF-D76_PROPOSED_FAMILY_ROLE_AND_CHILD_PROTECTION_AMENDMENT.md`, marked `PROPOSED`.
Summary of what matters here:

**The user-supplied family facts are drafting inputs, not identity records.** Both parents are intended
joint settlors and Family Office members; the daughter is **one of several** intended beneficiaries and
a Family Office member. Her age is *reported*, not verified; no date of birth, identity document,
address, signature, citizenship or trustee identity exists, none was invented, and **no birth date was
derived from a reported age**. The other beneficiaries are **expressly not identified** and are not
guessed at here or anywhere else in this phase.

**Separate roles, never merged.** Family relationship, Family Office membership, settlor status,
beneficiary status, trustee status, representative/delegate status, operational access, and legal
signing powers are **eight distinct things**. In particular:

* Family Office membership confers **no** trustee status, no beneficiary right, no directorship, no
  signing authority, no bank mandate, no investment authority and no distribution approval — which is
  consistent with the existing code and with `BEYU-LF-D31` §4 (the Family Office owns nothing and
  holds only an instruction-authority rule).
* Neither settlor is assumed to be a trustee, and neither is assumed to hold sole authority.
* The daughter is **not** assumed to be a sole beneficiary and holds **no** decision-making or signing
  authority from membership.
* The guardian and the trustee identities are **not assumed** to be anyone.

**Child-safety rules, stated as requirements:**

1. No login credentials, authentication factor or session for the minor, now or on any transition to
   majority without a fresh, evidenced decision.
2. No signature capability and no cryptographic key of any kind, ever, from membership alone.
3. No payment, investment, redemption or transfer authority, direct or delegated.
4. No administrative permissions and no direct control of trust assets from membership alone.
5. Identity minimisation: the minimum data necessary, and **never** in logs, public blockchain data,
   analytics or unnecessary user interface.
6. Synthetic data only in every test, fixture and demonstration.

**Why the change is documentation-only.** Family Office membership, minority, guardianship and date of
birth are **not modelled** in the schema or services (`BLK-05`, `BLK-06`). There is therefore no
correct existing record in which to place these facts, and no schema home for them. The phase mandate
permits a new migration only where it is necessary and audit-supported; a schema change to model
minority is a privacy decision first, so it is **recommended and not made**. The operative instruments
— `BEYU-LF-D02` (which has a single `[SETTLOR NAME]` slot and an undefined `[BENEFICIARY CLASS]`) and
`BEYU-LF-D05` (which defines no family, beneficiary or entitlement) — were **inspected and not
edited**. Editing an operative instrument could alter legal rights, so the output is a plainly marked
proposal plus counsel questions.

---

## 7. Gaps, and what would close each

| # | Gap | Closes when |
|---|---|---|
| `G-1` | No HTTP suite was executed; 126 tests skipped | CI runs them with a server, or a reviewer runs them and records the result |
| `G-2` | No full-suite run, no build, no browser specifications this phase | A full `npm run verify` |
| `G-3` | `V-3` proves a directory-level floor, not behaviour-level coverage | A per-behaviour inventory method, or explicit acceptance of the floor |
| `G-4` | Static scans cannot prove absence of a capability | Nothing fully closes this; state it whenever the check is cited as assurance |
| `G-5` | `V-5` remains a human review step | Applied by a reviewer at the gate |
| `G-6` | The wider application surface was not re-audited; this phase examined the governance domain | A separate, scoped audit |
| `G-7` | Authorization remains unavailable | `BLK-01` clears — a constituted body, evidenced |

---

## 8. Remediation proposals (proposed, not performed)

| # | Proposal | Owner class | Note |
|---|---|---|---|
| `R-1` | Split the branch into PR A (documents) and PR B (enforcement), documents first | Human reviewer | Recommendation only; not executed |
| `R-2` | Amend the pack wording "7 execution gates" to "7 listed gates / 8 distinct codes" | Documentation | Mechanical precision; no governance effect |
| `R-3` | Add a persistence-based CI check, or record explicitly that CI validates first-run behaviour only | Engineering | Closes `S-2` |
| `R-4` | Mark the fabrication in `seed.ts` at the point of use, so synthetic verification metadata cannot be read as evidence | Engineering + privacy owner | Closes `A-08` without changing fixtures |
| `R-5` | Model minority, guardianship and Family Office membership **only after** the privacy and role decisions are made, as an additive, isolated, reviewed migration in a non-production environment | Privacy owner + counsel, then engineering | Deliberately **not** done in this phase |
| `R-6` | Populate the determination store, or record that the sixteen authority-check kinds have never been exercised | Governance body | `C-4`, `BLK-21` |
| `R-7` | Bring `V-3` from a floor to a behaviour-level check, if the board wants completeness rather than consistency | Engineering + governance | Otherwise record the floor as the accepted standard |

---

## 9. Status of the change set, and the stop condition

| Item | State |
|---|---|
| Branch | `arena/8fbc8030-beyu-os-1-0` |
| Commits added this phase | three, separated by concern: the two payment fixes; the enforcement implementation; the security-test fix — plus a documentation commit |
| Merged | **no** |
| Deployed | **no** |
| Approved | **no** — this report is not an approval |
| Authorization granted to any automation | **no** — `R-AUT-01` remains ZERO |
| Production touched | **no** |

**This phase stops at the human review and merge gate.** No self-approval, no auto-merge, no
deployment, no production migration. The next act is a human decision, and §4.3 is the checklist for
it.

---

## What this report does not establish

* It is not an approval, a certification, an assurance opinion or legal advice.
* It does not establish that any control **operated** — only that it exists and that its refusal paths
  were exercised.
* It does not establish that the inventory is complete, that the pack's numbers are all correct, or
  that the wider application has no authorization defects outside the audited domain.
* It does not authorize any automation, resolve any counsel question, or identify any custodian,
  trustee, guardian, beneficiary or address.
* It does not claim that a skipped suite passed, and it does not claim that CI validates anything
  beyond the first run of an ephemeral database.
* It does not decide the PR split. It recommends, and stops.
