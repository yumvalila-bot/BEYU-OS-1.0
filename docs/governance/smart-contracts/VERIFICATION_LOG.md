# BEYU-SCG-12 — Verification Log

Document ID: `BEYU-SCG-12`
Title: Verification Log
Version: 1.0
Date: 2026-10-15
Status: `INFORMATIONAL`
Classification: `INTERNAL`
Owner (proposed): Chief Governance Officer `[TO BE APPOINTED]`
Related documents: `BEYU-SCG-09` (the standard these checks follow), `BEYU-SCG-01`…`BEYU-SCG-14`
Depends on: nothing

> **WHAT THIS LOG PROVES, AND WHAT IT DOES NOT.** These checks verify that this pack is **internally
> consistent and honest about its own limits**: that its register resolves, that every document
> declares a status from the shared vocabulary, that no completion label is claimed without evidence,
> that no key material or invented address appears, that the machine-readable inventory parses, and
> that the pack did not touch a single file of code.
>
> They prove **nothing** about legal effect, enforceability, statutory compliance, tax treatment,
> security, accounting accuracy, or the existence of any contract, deployment, address, source or
> registration. They are not an audit, a certification or an assurance engagement, and no reader may
> cite them as one. Two of the checks were written **because earlier runs of this log found a
> defect** — that history is kept, not hidden (§3).

---

## 1. Environment and method

All checks were run against the audited working tree (`arena/8fbc8030-beyu-os-1-0`, base commit
`36efbd0` plus this pack), in the disposable sandbox, with no network access to any chain, provider or
registry. Commands are recorded verbatim so they can be re-run and disputed.

## 2. The checks, with observed results

| # | Check | Command (abbreviated) | Observed result | Verdict |
|---|---|---|---|---|
| V-01 | Every Markdown document in the pack declares a `Document ID` and a `Status` | `grep -L "Document ID" *.md` / `grep -L "Status" *.md` | Only `README.md` lacks a `Document ID` — by design (it is the pack-level file and carries `Pack ID: BEYU-SCG`); **no file lacks `Status`** | **PASS** |
| V-02 | Every registered path resolves on disk, and no document is unregistered | parse `MASTER_DOCUMENT_REGISTER.md` path set vs `os.listdir` | **17 registered paths, 17 present; 0 missing; 0 unregistered** | **PASS** |
| V-03 | No completion label is claimed without evidence | `grep -oE "\`(APPROVED\|EXECUTED\|FILED\|REGISTERED)\`" *.md` and inspection of each occurrence | 24 occurrences, **all inside prohibition, vocabulary or negation statements** (e.g. "may never mean done", "None appears today"); **no document's front-matter status is a completion label** (measured: the only status values are `PRELIMINARY_FRAMEWORK`, `CONDITIONAL_DRAFT`, `TEMPLATE_NOT_EXECUTED`, `INFORMATIONAL`) | **PASS** |
| V-04 | No key material, seed phrase, keystore or hex address/digest value anywhere in the pack | `grep -nE "0x[0-9a-fA-F]{40}\|0x[0-9a-fA-F]{64}\|BEGIN [A-Z ]*PRIVATE KEY" *.md *.json` | **zero matches** | **PASS** |
| V-05 | Every register opens at an explicit zero state | `grep -c "Opening state: ZERO\|open at ZERO\|opens at ZERO\|opens with" REGISTERS_AND_TEMPLATES.md` | 9 register-opening statements — one per register (`R-DEP-01`, `R-CUS-01`, `R-AUT-01`, `R-ORA-01`, `R-INC-01`, `R-REC-01`, `R-EVD-01`, `R-APP-01`, `R-DEC-01`) | **PASS** |
| V-06 | The machine-readable inventory is valid JSON, has unique ids, and grants no authority | `node -e "…require(…AUTOMATION_INVENTORY.json)…"` | **valid**; **23 entries**; **6 human bindings**; ids unique; `grants_authority: false` at file level and no entry sets it true | **PASS** |
| V-07 | Cross-references resolve to real documents | script: pack path references vs disk; `BEYU-LF-*` file references vs `docs/governance/legal-foundations/**` | after correction of one reference (§3): **12 `BEYU-LF` file references resolve** to existing legal-pack files; **0 unresolved in any document**. The single remaining regex hit is this log's own record of defect D-1, which necessarily contains the old, wrong string | **PASS (after fix)** |
| V-08 | No fifth Sector OS or forbidden OS name is asserted | `grep -nE "SMART_CONTRACT_OS\|HCM_OS\|CONTRACT_OS\|BLOCKCHAIN_OS" *.md` | 4 occurrences, **all in prohibition statements** ("No `SMART_CONTRACT_OS`… no fifth Sector OS") and one audit finding that records their absence | **PASS** |
| V-09 | The change set is documentation-only | `git status --porcelain` / `git diff --stat` | **At `8e44971`: PASS** — every changed path was under `docs/`. **At the Phase 2 head: SUPERSEDED** — the Phase 2 change set adds code, tests, a package script and a CI step by design, because the phase's mandate was to enforce the boundary mechanically. The claim is retained as history and is **not** true of the branch as a whole; see `BEYU-SCG-15` §8, `BEYU-SCG-17` §4.1 and `BEYU-SCG-16` `BLK-23` | **SUPERSEDED** |
| V-10 | No unverified statutory reference is asserted | `grep -nE "\b(Cap\.\|Act No\|section [0-9]\|s\.[0-9])" *.md` | one hit, and it is **this row's own command string**; **no document in the pack cites a statute, a section, a regulation or an official requirement**. Where a regime is named as a subject for counsel, it is a question in `BEYU-SCG-10`, never a provision | **PASS** |
| V-11 | Status labels come from the shared vocabulary | `grep -h "^Status:" *.md` | 15 front-matter status lines: `PRELIMINARY_FRAMEWORK` ×6, `INFORMATIONAL` ×6, `CONDITIONAL_DRAFT` ×2, `TEMPLATE_NOT_EXECUTED` ×1 — **all from `BEYU-LF` README §3.1/§11.3**; no `APPROVED`, `EXECUTED`, `FILED` or `REGISTERED`. (`README.md` carries its status inside its header block rather than on a `Status:` line) | **PASS** |
| V-12 | No absolute promise, guarantee or compliance claim | `grep -niE "guarantee[sd]?\|will (always\|never) \|cannot be hacked\|fully compliant\|audited\|approved by" *.md` | hits reviewed individually: a quoted statement about what code *enforces*, an audit-context noun, and prohibitions. One wording was tightened from "what the code already guarantees" to "what the code already enforces" (§3) | **PASS (after tightening)** |
| V-13 | Every core document states what it does not establish | loop over `*.md` for "does not establish" | all present. `README.md` carries §2 "What this pack is not"; `MASTER_DOCUMENT_REGISTER.md` gained §4 during this log | **PASS (after addition)** |
| V-14 | The pack asserts no institutional fact that the audit did not verify | manual review against `BEYU-SCG-PHASE0` §5 findings | every capability claim carries a source path or a measured count; every external fact is marked `[COUNSEL TO CONFIRM]`, `[TO BE DECIDED]` or `REQUIRES VERIFICATION`; the two documentation-drift observations found by the audit are recorded (`BEYU-SCG-04` AU-OPEN-06), **not silently fixed** | **PASS at `8e44971`; AMENDED in Phase 2** — both drifts were then **fixed openly** (`D-5`, `D-6`), not silently: the code change, the inventory note and this log were updated together. "Not silently fixed" was the requirement, and it still holds |

## 3. Defects this log found in its own pack (kept, not hidden)

| # | Defect | How it was found | Disposition |
|---|---|---|---|
| D-1 | `BEYU-SCG-10` referenced the counsel-questions file as `BEYU-LF-LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL.md`, but the legal-pack file is `LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL.md` (no `BEYU-LF-` prefix) | V-07 | **Fixed** in this revision; the check now passes |
| D-2 | `BEYU-SCG-14` listed the dispute-policy document under `holding/`; it lives under `family/` | V-07 (manual confirmation of the same check) | **Fixed**; corrected to `family/BEYU-LF-D17_DISPUTE_RESOLUTION_POLICY.md` |
| D-3 | `BEYU-SCG-06` said "what the code already **guarantees**" — a stronger word than the evidence supports | V-12 | **Tightened** to "what the code already **enforces**" |
| D-4 | `BEYU-SCG-14` had no non-establishment statement | V-13 | **Added** §4 |
| D-5 | `src/lib/payments/risk.ts` module header said "Four rules" while `RULE_WEIGHTS` held five and five signals were emitted (L78/113/147/175/192) | Phase 2 audit vs `AUTOMATION_INVENTORY.json` AUT-08 | **Fixed** — header reads "Five rules"; no behaviour changed. The inventory note was updated in the same change set so the two sides cannot diverge in either direction |
| D-6 | `src/lib/payments/ingest.ts` line 2 was an import stranded inside the leading block comment, with a live duplicate at L42 | Phase 2 audit | **Fixed** — the line was moved out of the comment; exactly one import remains. Note that typecheck, lint and the payment suites passed **before** the fix: a comment cannot fail them, which is exactly why this class of defect needs a mechanical check |
| D-7 | `tests/security/search-rls-isolation.test.ts` bound the tenant id to `code` on a globally-unique column of a **deletion-proof** table, so the first run succeeded and **every later run failed** (`duplicate key value violates unique constraint "knowledge_sources_code_uidx"`), with the 12 tests then reporting as skipped. CI could not see it: its PostgreSQL service is ephemeral and run-scoped, so CI only ever performed the first run | Running the suite twice | **Fixed** — bindings aligned to the column list; the immutability trigger was **not** weakened and no row was deleted. Verified by two consecutive passing runs on a database recreated from scratch (4 probe rows, 4 distinct codes, 0 rows with a probe code in `title`, 0 rows with a tenant id in `code`) |
| D-8 | The pack said "7 execution gates"; the code has seven conditions but **eight distinct blocker codes** (the production condition raises two; the state condition is templated) | Phase 2 traceability read of `src/lib/blockchain/model.ts` L979–988 | **Corrected** — recorded as `BEYU-SCG-15` `P-1`; the wording was also corrected in `BEYU-SCG-09` §4 |
| D-9 | The new V-6 check rejected the pack banner `DRAFT FOR PROFESSIONAL REVIEW` as a status outside the vocabulary | Writing the check | **Fixed in the check** — the vocabulary now separates a document status from the pack-level banner, and confines the banner to the pack `README.md` so it cannot launder a document status |
| D-10 | The new signing-surface check matched its own example comment, and a token-level version matched the `FORBIDDEN_EVENT_FIELDS` denylist in `blockchain/model.ts` — i.e. it flagged a **protection** as the danger it prevents | Writing the check | **Fixed** — comments are stripped before matching; the policy module is exempt from its own scan by an explicit one-file list; a test pins the distinction between a capability and prose about it |
| D-11 | `V-8` was initially proposed in Phase 2 as the signing-surface check, but **`V-8` already exists** as a reporting rule in `BEYU-SCG-09` §5 | Collision check before writing | **Corrected before publication** — the check is registered as **`V-4A`** and the collision is recorded in `BEYU-SCG-09` §4. Nothing was renumbered |

**Why this section exists.** A verification log that only ever reports passes is a marketing
document. These four defects were real, found by the pack's own checks, and are recorded with the
check that found them so the method can be judged rather than trusted.

## 4. Limitations of this verification (stated, not implied)

| Limitation | Consequence |
|---|---|
| No chain, provider, registry, bank, regulator or court was contacted | Nothing here verifies any external fact |
| No legal review occurred | Nothing here states or implies a legal position |
| The checks are content checks (grep, parse, compare), not semantic proofs | A statement can be internally consistent and still be wrong in the world; only review by a competent professional addresses that |
| The `BEYU-SCG-09` §4 proposed checks (V-3…V-7) are **not implemented** | Inventory freshness, register secret-scanning, prohibited-claim automation and refusal-test coverage remain manual |
| The repository's own test suite is not a legal control | `BEYU-SCG-09` §3 records what was run (5,292 passed, 0 failed, 38 files skipped) and what that does **not** mean |

## 5. Re-run instruction

To reproduce every result above: run the commands in the "Command" column from
`docs/governance/smart-contracts/`, on a checkout at the recorded commit, with no network access
required. If a result differs, **the difference is the finding** — report it in this log rather than
editing the expectation.
