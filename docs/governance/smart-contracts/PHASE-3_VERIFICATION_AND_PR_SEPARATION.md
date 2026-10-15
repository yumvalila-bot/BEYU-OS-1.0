# BEYU-SCG-18 — Phase 3: Evidence Integrity, Blocker Reconciliation and PR Separation Record

Document ID: `BEYU-SCG-18`
Title: Phase 3 — Evidence Integrity, Blocker Reconciliation and PR Separation Record
Version: 1.0
Date: 2026-10-15
Status: `INFORMATIONAL`
Classification: `INTERNAL`
Owner (proposed): Chief Governance Officer `[TO BE APPOINTED]`
Approving authority (proposed): BEYU Holding Company board `[NOT REPRESENTED IN THIS REPOSITORY AS LEGALLY CONSTITUTED]`
Next review date: when `BLK-08` is reviewed at the merge gate, and in any event on the next governance review
Related documents: `BEYU-SCG-15`, `BEYU-SCG-16`, `BEYU-SCG-17`; legal pack `MASTER_DOCUMENT_REGISTER.md`, `BEYU-LF-D76`
Depends on: the Phase 3 commits; nothing else

> **CONTROL BLOCK.**
> **This is** the record of what Phase 3 found, changed and verified: a defect in synthetic fixture data, a
> reconciliation of this pack's blocker register, and a plan for separating a 154-path change set into
> reviewable units. Every number below is an observation with the command that produced it.
> **This is not** an approval, a certification, an authorization, a risk acceptance, or the act the evidence
> checklist in §3 describes. It does not clear a blocker, populate a register, authorize an automation, or
> permit any external execution. `A7` remains prohibited, `grants_authority` remains `false`, and
> `CAP_POSTING` remains `LOCKED`.
> **Nothing in this document was merged, deployed or authorized by writing it.**

---

## 1. Verified state at the time of writing

Everything in this section was re-verified in this session. The Phase 3 brief supplied a reported head,
test results and counts: they were treated as claims and checked, and the two discrepancies found are
recorded in §6 `D-3` and `D-4`.

| Item | Observed value |
|---|---|
| Branch | `arena/8fbc8030-beyu-os-1-0` |
| `main` base | `05e2fba` |
| Head at Phase 3 start | `d153529` — 11 commits over `main` |
| Head after the `BLK-08` fix | `3bb33f6` — **12 commits over `main`** |
| Working tree | clean before and after each commit; no force-push, no history rewrite |
| Pull request | **#108** — OPEN, not draft, base `main`, review decision empty, **not merged** |
| PR size at `d153529` | **151 files, +31,397 / −3** (145 added, 6 modified) |
| PR size after `3bb33f6` | **154 files** (146 added, 8 modified) — the PR counters refresh when the commit is pushed; the post-push CI result is **not** claimed here |

### 1.1 CI at `d153529` — the last fully observed run

| Job | Result |
|---|---|
| Root PostgreSQL gate | **PASS, 49 m 27 s — all 67 steps**, including step 10 (governance checks), step 28 (full root regression), step 30 (browser suite) and step 31 (assert no test suite was silently skipped) |
| Migration validation | PASS, 1 m 3 s |
| Secret scan, P3 governance, three dependency audits, Health OS frontend | PASS |
| Health OS backend | **FAIL at step 2, `Initialize containers` (17 s); steps 3–6 skipped** |
| Skipped jobs | 8 |

The single failure is recorded without spin and is **not** a repository failure. `Initialize containers`
runs **before** `Checkout repository`, so no file in this repository can affect it; the same step has
failed in a different job on each commit while the same jobs pass elsewhere in other runs:

| Commit | Job that failed at `Initialize containers` | Evidence that the same work passed |
|---|---|---|
| `8e44971` | Health OS backend | root gate PASS in the same run |
| `1758607` | Migration validation (20 s) **and** root gate (14 s) | root job was **CANCELLED** by `cancel-in-progress` (steps 1–16 passed, 17 cancelled) — cancelled is neither a pass nor a failure |
| `9e7ed4a` | Health OS backend (12 s) | root gate PASS in the same run |
| `d153529` | Health OS backend (17 s) | root gate PASS, 49 m 27 s, all 67 steps |

It is an infrastructure flake at the container-start step. It is reported as an observation, never as a
skip and never as a pass.

---

## 2. `BLK-08` — synthetic fixtures could be read as verified identity, appointment and legal approval

### 2.1 The defect

`src/db/seed.ts` wrote invented people, beneficiaries and resolutions into a real database carrying
verification **metadata**: a status, a method, a verifying actor, a date, an approving resolution and a
named evidence pack. It looked like the output of a process. No such process ran. Nobody verified
anything, no resolution approved anyone, and no evidence pack exists.

| # | Location | What it asserted | Why it is false |
|---|---|---|---|
| 1 | `seed.ts` family-member rows | `verificationStatus: "VERIFIED"`, `verificationMethod: "DOCUMENTARY_AND_COUNSEL_REVIEW"`, `verifiedBy: "FAMILY_COUNCIL"`, `verifiedAt: 2025-06-02` | No family council reviewed anything; there is no documentary review, no counsel and no verifier. `FAMILY_COUNCIL` is a legitimate body code everywhere else in the repository — its use as a **verifier** was the fabrication |
| 2 | `seed.ts` beneficiary rows | `eligibility: "ELIGIBLE"`, `entitlementPct: 40`, `verifiedBy: "TRUSTEE_BOARD"`, `approvedByResolutionId: R2025_007` | No trustee board acted, no resolution approved these rows, and no percentage has been determined. `R2025_007` concerns the **third-generation contingent class**; `B1`/`B2` are `PRIMARY`, generation-1 and spouse — the link was not merely unverified but internally inconsistent |
| 3 | `seed.ts` resolution `R2025_007` | `dataBasis: "Family registry lineage verification pack FV-2025-03"`, rationale asserting lineage "verified by documentary evidence and independent counsel review", `proposedBy: "FAMILY_OFFICE_PRINCIPAL"` | The pack does not exist, counsel did not review, and the proposer is a fabricated human actor |
| 4 | `seed.ts` party rows | `kycStatus: "VERIFIED"`, `kycMethod: "NIDA_DOCUMENT_VERIFICATION"` on every seeded party | Fictional people have no identity documents. The repository's own federation registry records NIDA as `CONTRACT_PENDING`, `NONE_PUBLISHED`, `UNVERIFIED` — **the check could not have been performed at all** |
| 5 | `seed.ts` family-member rows | `directDescendant: true` on the founding line | Descent is a verified claim; the governed registration path refuses to assert it (`DIRECT_DESCENDANT_REQUIRES_VERIFICATION`) |

**Root cause.** Not a schema gap. The schema already distinguishes synthetic from verified: `kyc_status`
and `verification_status` default to `UNVERIFIED`, `beneficiaries.eligibility` defaults to `UNDER_REVIEW`,
and `verification_method` / `verified_by` / `verified_at` / `entitlement_pct` / `approved_by_resolution_id`
are all nullable. The defect was an **authoring choice** that filled in columns the schema correctly
leaves empty. The file already contained the honest pattern in three places: the tenant-domain rows use
`verificationState: "DOCUMENTED"` with `verificationMethod: "PLATFORM_DEPLOYMENT_CONFIG"` and say outright
that this is "NOT a runtime-verified DNS fact"; the decision registry seeds the **existence** of each
decision with authority columns `NULL` and every row `PENDING`/`LOCKED`; and `createdBy` is deliberately
null because historical actors are never fabricated.

### 2.2 The fix

Removal, not softening. No new mechanism, no new status, **no migration** — the distinction is expressible
with the vocabulary and nullability that already exist.

| Column | Was | Is now | Authority for the change |
|---|---|---|---|
| `family_members.verification_status` | `VERIFIED` | `UNVERIFIED` | The schema default, and the only accurate value for a synthetic row |
| `family_members.verification_method` / `verified_by` / `verified_at` | populated | **omitted (null)** | Columns are nullable; an unverified row must not name a method, an actor or a date |
| `family_members.direct_descendant` | `true` | `false` | The governed path refuses to assert descent; a seed may not assert what the governed path refuses to |
| `beneficiaries.eligibility` | `ELIGIBLE` | `UNDER_REVIEW` | The enum's honest state when no determination exists |
| `beneficiaries.entitlement_pct` | `40` | **omitted (null)** | A percentage is a claimed share of trust property; recording one would invent an entitlement |
| `beneficiaries.verified_by` / `approved_by_resolution_id` | populated | **omitted (null)** | Nobody verified these and no resolution approved them |
| `beneficiaries.eligibility_rationale` | "Named primary beneficiary in the trust deed schedule 3" | "SYNTHETIC DEMONSTRATION ROW — no eligibility determination has been made…" | `NOT NULL` column, so it carries the honest statement instead of a claim about an operative instrument |
| `resolutions.data_basis` / `rationale` / `proposed_by` | evidence pack, counsel review, named proposer | `NONE — synthetic demonstration data…`, `SYNTHETIC_FIXTURE` | The resolution is labelled as a synthetic fixture rather than quietly rendered authoritative. Its `APPROVED` status is retained **only** because the demonstration needs an approved resolution to exercise governance paths — and the rows that confer authority are elsewhere and untouched |
| `parties.kyc_status` / `kyc_method` | `VERIFIED` / `NIDA_DOCUMENT_VERIFICATION` | `UNVERIFIED` / **omitted** | The claim could not have been performed |

### 2.3 Runtime consequence — stated, not hidden

The lineage engine requires `verification_status = 'VERIFIED'` on every node of a chain before
`unbrokenDescentToFounder` can be true (`src/lib/family/lineage.ts`), and emits `LINEAGE_NOT_VERIFIED`
otherwise. Observed against the corrected fixtures:

```
FAM_FM_G1_FOUNDER: unbrokenDescentToFounder=false gen=1
   status=INDETERMINATE direct=false blockers=["LINEAGE_NOT_VERIFIED: FAM_FM_G1_FOUNDER","DESCENT_CHAIN_NOT_UNBROKEN"]
FAM_FM_G1_SPOUSE:  unbrokenDescentToFounder=false gen=1
   status=INDETERMINATE direct=false blockers=["LINEAGE_NOT_VERIFIED: FAM_FM_G1_SPOUSE","DESCENT_CHAIN_NOT_UNBROKEN"]
```

This is the intended result. Before the fix the founding row satisfied the chain check, so demonstration
data evaluated as verified descent. The fix closes that path. A control that refuses is not a regression.

### 2.4 Evidence

| Evidence | Result |
|---|---|
| `tests/security/synthetic-fixture-integrity.test.ts` (new, 15 tests) | **15 passed.** Asserts both directions: every synthetic row carries `UNVERIFIED` / no actor, **and** the machinery refuses — the lineage engine returns `INDETERMINATE` with a `LINEAGE_NOT_VERIFIED` blocker, and no seeded row yields a governance verdict |
| Can-it-fail proof (string level) | The suite asserts the exact defect strings are caught while the honest replacement is not. The corrected fixtures read "no documentary evidence, counsel review or verification pack exists" — a naive substring scan flags that denial as the claim it denies, so the guard matches **evidence attributions** (`verified by`, `pack FV-…`, `by counsel`) rather than words |
| Can-it-fail proof (database level) | The suite was run against a database **containing the original defect**: **2 failures**. Run against the fixed data: **15 passed**. A guard that cannot fail is not a guard |
| `tests/family/office/trust-governance.test.ts` | **24 passed** after the fixture repair described below |
| Family/security/governance/registry/foundation sweep | **113 files passed, 18 skipped; 1,978 passed, 139 skipped, 0 failed** |

**A test that had come to depend on the fabrication.** `trust-governance.test.ts` exercised the
distribution path using the seeded beneficiary, which was `ELIGIBLE` only because the seed said so. With
honest fixture data the service correctly refuses (`Beneficiary eligibility is UNDER_REVIEW; only an
ELIGIBLE beneficiary may receive a distribution`). The suite now creates its **own** `ELIGIBLE` probe
beneficiary — with `verified_by` and `approved_by_resolution_id` left null, because nobody verified it and
no resolution approved it — and removes it in `afterAll`. The test now owns its fixture instead of
inheriting a fabrication.

### 2.5 Residual findings — recorded, not resolved

| # | Finding | Status |
|---|---|---|
| `F-1` | **A re-seed does not repair a database that was seeded before the fix.** Proven in the isolated environment: fabricated rows were reintroduced by simulation, a re-seed was run (`exit 0`, "bootstrap complete"), and the rows survived — the seed uses `onConflictDoNothing`. **Every environment seeded before this fix therefore still holds the fabricated rows**, and remediation is an authorised, evidenced operator action per environment. No row was deleted from any shared or production database by this work, and none should be without that authorisation | **OPEN — operator decision** |
| `F-2` | The `R2025_007` ↔ `B1`/`B2` link was internally inconsistent (§2.1 row 2). It is now **removed** rather than repointed: choosing a different resolution would have substituted one unsupported claim for another | **CORRECTED by removal** |
| `F-3` | `family_members.relationship_to_parent` defaults to `"CHILD"`, which is **not** a member of `LINEAGE_RELATIONSHIPS` (`src/lib/family/model.ts`: `BIRTH_DESCENDANT`, `ADOPTED_CHILD`, `STEPCHILD`, `SPOUSE_OF_MEMBER`, `FORMER_SPOUSE_OF_MEMBER`, `OTHER_AFFINAL`, `NON_FAMILY`). The engine fails closed on it, so it is not exploitable, but a schema default outside the engine's vocabulary is a latent defect. **Not changed here**: altering the default changes behaviour for every family row and is a schema decision, not a fixture repair | **OPEN — schema decision** |
| `F-4` | The seed remains synthetic data. Correcting its metadata makes it *honest*; it does not make it evidence, and it must never be cited as identity, lineage, eligibility or legal evidence | **Standing rule** |

### 2.6 Schema decision requested

**None required.** The distinction between synthetic, unverified and verified data is expressible today
with the existing columns, defaults and enum values, and the fix uses only those. `BLK-14`, `BLK-15` and
`BLK-05` remain the open schema questions — they concern *who may verify*, which is an authority question
this phase cannot answer, not a missing column.

---

## 3. `BLK-01` — authority remains unavailable

**Re-verified:** no legitimate approving body or delegated authority is evidenced anywhere in this
repository as constituted. `authorizeAutomation()` denies by default with
`GOVERNANCE_BODY_NOT_CONSTITUTED` because `bodyEvidenced` defaults to `false`. Authorization is
**unavailable**, not merely unused.

Nothing was constituted, no member was appointed, no approval was invented, and `R-AUT-01` was not
populated. The class labels `A1`–`A6` do **not** grant per-automation authorization; `A7` external
execution remains prohibited; `grants_authority: false` remains in force; `CAP_POSTING` remains `LOCKED`.
`decision-authority.ts` still requires `provenance = GOVERNED`, and every seeded registry row is `PENDING`
with activation `LOCKED`, so no seeded row can confer authority.

### 3.1 What an authorized human governance process must supply

This checklist is the **evidence** `BLK-01` needs. It cannot be completed by the platform, by a document,
or by this phase, and **this technical task is not the approval it describes**. Each item is a document or
a recorded decision that exists outside this repository or is made by an authority that has not acted.

| # | Evidence required | Why the platform cannot supply it |
|---|---|---|
| 1 | **The instrument of constitution** of the approving body: its name, legal form, registered identifier where applicable, date of constitution, and the instrument conferring its powers | Legal constitution is an act of the body and its members under applicable law, not a database row |
| 2 | **Appointment evidence per seat**, recorded in `R-APP-01`: the person, the office, the appointing instrument reference, the appointment date, the term, and acceptance where the instrument requires it | Naming a holder is an appointment; software cannot appoint |
| 3 | **Competence over the specific matter**: the reserved-matter schedule showing the decision type falls within that body's authority, plus any delegation instrument relied on | Authority exists only where an instrument grants it |
| 4 | **A quorum and majority determination** against the body's own rules, with the voting record — who voted, how, when — and recusals where the rules require them | A vote count in the seed is synthetic data; a real one comes from a real meeting |
| 5 | **A `GOVERNED`-provenance decision record in `R-DEC-01` for each approval**, with scope, version, validity window and revocation route | `provenance = GOVERNED` is a claim about how the decision was made, which only the body can make |
| 6 | **Identity assurance for each individual** (see `BLK-14`, `BLK-15`): a verifier with evidenced authority, the method, and the date — never a seeded row | Verification is an act by an authority able to perform it |
| 7 | **A human legal-review closure** where the matter carries legal effect; software must not fabricate closure | §48 of the pack's standard; closure is a human act |
| 8 | **The instrument references** for anything the automation would execute, including the on-chain authority schedule addition where applicable | An execution without its instrument is an unauthorised act |
| 9 | **An explicit statement of which automations are being authorised**, and to what class, acknowledging that class labels alone authorise nothing | The whole point of `BLK-02`: `R-AUT-01` is populated by decision, never by inference |
| 10 | **Written counsel confirmation** on the matters still marked `[COUNSEL TO CONFIRM]` that bear on the decision | Twenty counsel questions remain open (`BLK-10`) |

**Until items 1–10 exist, the correct posture is refusal**, and `BLK-01` stays `BLOCKED`. Recording this
checklist does not advance it.

---

## 4. PR separation — recommended boundaries

### 4.1 What is in the change set

| Unit | Concern | Paths | Count |
|---|---|---|---|
| **A** | Existing legal documentation pack (`docs/governance/legal-foundations/`) | every path under that directory | **121** |
| **B** | BEYU-SCG documentation pack (`docs/governance/smart-contracts/`) | every path under that directory | **20** |
| **C1** | SCG runtime enforcement + its CI wiring | `src/lib/smart-contracts/registry.ts`, `src/lib/smart-contracts/checks.ts`, `scripts/scg-checks.ts`, `tests/smart-contracts/governance-enforcement.test.ts`, `.github/workflows/ci.yml`, `package.json`, `scripts/verify.mjs` | 7 |
| **C2** | Payment-record defects found in the Phase 2A audit | `src/lib/payments/ingest.ts`, `src/lib/payments/risk.ts` | 2 |
| **C3** | Re-runnable RLS isolation probe | `tests/security/search-rls-isolation.test.ts` | 1 |
| **C4** | `BLK-08` evidence integrity (Phase 3) | `src/db/seed.ts`, `tests/family/office/trust-governance.test.ts`, `tests/security/synthetic-fixture-integrity.test.ts` | 3 |
| **D** | Unrelated or unclassified | — | **0** |

**Total 154 paths** = 121 A + 20 B + 13 C, with 0 unclassified. C1–C4 partition the 13 code paths with **no
path appearing in two units**, which is what makes a clean separation possible at all.

### 4.2 The one hard dependency

**B must merge before C1** — or arrive in the same pull request. This was verified, not assumed: C1's gate
reads the SCG pack from disk (`src/lib/smart-contracts/checks.ts` loads
`docs/governance/smart-contracts/AUTOMATION_INVENTORY.json` and every pack document), and
`scripts/scg-checks.ts` enumerates that directory. With the pack absent:

```
$ npm run verify:scg
Error: ENOENT: no such file or directory, scandir '.../docs/governance/smart-contracts'
exit code 1
```

`verify:scg` runs in `.github/workflows/ci.yml` before the migrations step and inside `scripts/verify.mjs`.
Merging C1 without B therefore turns CI **red**, not merely incomplete.

The pack was restored immediately and re-verified (`4 checks, 0 blocking, 0 advisory`; working tree clean).
No other unit has a dependency: **A has zero code dependencies** — nothing in `src/`, `tests/`, `scripts/`
or any JSON file reads the legal pack — and C2, C3 and C4 are independent of A, B and each other.

### 4.3 Recommended boundaries and order

| Order | Unit | Base | Head | Rationale |
|---|---|---|---|---|
| 1 | **A** — legal pack | `main` | path extract | Documentation only, no code dependency in either direction. Reviewable on its own as the legal-foundations record |
| 2 | **B** — SCG pack | `main` | path extract | Documentation only. Must precede C1 |
| 3 | **C1** — SCG enforcement | B's merge commit | path extract | Depends on B (§4.2) |
| 4 | **C2** — payment defects | `main` | path extract | Independent; small and self-contained |
| 5 | **C3** — RLS probe | `main` | path extract | Independent; a single test file |
| 6 | **C4** — `BLK-08` evidence integrity | `main` | path extract | Independent. Reviewing it separately keeps a *data-honesty* change out of a documentation review, and lets the review ask the two questions that matter here: is the removal complete, and does the new suite actually fail against the old data |

### 4.4 Extraction mechanics, and why path extraction beats cherry-picking

The units own disjoint **paths** but the history is interleaved. Commit attribution:

| Commit | Subject | Unit(s) |
|---|---|---|
| `e1f6b4a` | legal pack foundation | A |
| `36efbd0` | legal pack expansion | A |
| `0f8d436` | Phase 0 audit before design | B |
| `8e44971` | BEYU-SCG pack | B |
| `7fd064f` | payment defects | C2 |
| `7a38cfc` | SCG enforcement | C1 |
| `ba7b5db` | RLS probe re-runnable | C3 |
| `1758607` | Phase 2 traceability, blockers, evidence, family position | **A + B (mixed: 3 legal, 9 SCG)** |
| `baa311e` | audit reconciliation, inventory formatting | B |
| `9e7ed4a` | PR state and CI result | B |
| `d153529` | green CI record | B |
| `3bb33f6` | `BLK-08` evidence integrity | C4 |

**`1758607` spans both documentation packs.** A commit-level cherry-pick therefore cannot separate A from
B: it would drag 3 legal-pack files into the SCG pull request or leave 9 SCG files behind in the legal one.
The safe operation is **path extraction** — create each branch from its base and check out the unit's
paths, e.g. `git checkout <phase-3-branch> -- docs/governance/legal-foundations` for A — which is additive
and rewrites nothing. Commits `7fd064f`, `7a38cfc`, `ba7b5db`, `3bb33f6`, `baa311e`, `9e7ed4a` and
`d153529` are single-unit and would cherry-pick cleanly if the reviewer prefers that route.

**`BLK-08`'s three paths sit in a pre-existing state.** `src/db/seed.ts` and
`tests/family/office/trust-governance.test.ts` exist on `main` unmodified; `3bb33f6` is the only commit
that touches them, plus one new test file. So C4 is separable with a clean base, and its diff is small
enough to review line by line.

### 4.5 Risks

| Risk | Assessment |
|---|---|
| **Missing dependency (B absent, C1 merged)** | **High impact, verified, avoidable.** CI fails at `verify:scg` with `ENOENT` (§4.2). Ordering is not stylistic here — it is mechanical |
| **Duplication across units** | **Low.** No path belongs to two units. The only shared files are the three CI/script wiring files (`ci.yml`, `package.json`, `verify.mjs`), and each contains **only** SCG wiring — a single hunk each — so they belong unambiguously to C1 |
| **Duplication across documentation packs** | **Medium.** A and B each carry a `MASTER_DOCUMENT_REGISTER.md` and cross-reference each other. Splitting them means each PR's register references the other pack, which is already the pack convention (SCG-14 §2 lists legal-pack documents by path) but must be reviewed so neither register claims a document the other PR has not merged |
| **Partially-split review** | **Medium.** If A merges and B does not, the legal pack's register will list SCG documents that are absent from `main`. The register convention already treats a listed-but-missing document as "a defect to be raised, not a document to be assumed", so the failure mode is discoverable rather than silent — but the reviewer should decide whether the two packs merge together |
| **`BLK-08` reviewed as a docs change** | **Low, but the point of splitting it out.** Its content is data honesty with a runtime consequence (`LINEAGE_NOT_VERIFIED` on the synthetic line). It deserves a reviewer who looks at the seed, not a reviewer skimming Markdown |
| **Post-merge environment state** | **Open — see `F-1`.** Merging the fix does not repair already-seeded databases |

### 4.6 Not executed

**Nothing was split, closed, force-pushed, rewritten or re-based.** PR #108 remains open with all 154
paths on one branch. This section is a **plan and its evidence, for human review**. Creating or mutating
pull requests requires explicit authorisation that this phase did not receive and did not assume.

---

## 5. Verification evidence

All commands were run in this session against the isolated local environment. Nothing here is inferred
from a prior run.

| Check | Command | Result |
|---|---|---|
| Isolated database | PostgreSQL **16.14** from `npm run pg16:start`, cluster at `pgdata/` (gitignored, disposable) | running on `:5432`; no shared or production database was touched |
| Migrations | `npx tsx scripts/migrate.ts` | **exit 0**; first run `fingerprintBefore e273ab9dc396aa346447cea4d760eeb9` → `fingerprintAfter eebc66981c8f176dbd8ef9ba0a43a58b`. A second run reported `eee62965fa8d37540b56493265ff241d` → `eee62965fa8d37540b56493265ff241d` — **no drift** |
| Role reconciliation | `npx tsx scripts/setup-db-role.ts`, `npm run db:setup-governance-role` | governance role reconciled: `NOBYPASSRLS, non-owner, finite privileges` |
| Seed | `npx tsx src/db/seed.ts` | **exit 0** — "BEYU OS bootstrap complete. Bootstrap credentials were not printed." |
| `BLK-08` suite | `npx vitest run tests/security/synthetic-fixture-integrity.test.ts` | **15 passed** (and **2 failed** when run against a database containing the defect) |
| Trust governance | `npx vitest run tests/family/office/trust-governance.test.ts` | **24 passed** |
| Sweep | `npx vitest run tests/family tests/security tests/governance tests/registry tests/foundation` | **113 files passed, 18 skipped; 1,978 passed, 139 skipped, 0 failed** (101 s) |
| Typecheck | `npx tsc --noEmit` | **exit 0** at 6 GB heap. At the default heap the same command **aborted with a Node out-of-memory crash** — a sandbox limit, reported because a crash is not a pass |
| Lint | `npm run lint` | **exit 0**, 0 errors, 1 pre-existing warning (`@next/next/no-img-element`, `noelia-cross-os-visual.tsx`) — untouched by this phase |
| SCG gate | `npm run verify:scg` | **4 checks, 0 blocking, 0 advisory, exit 0** |
| Migration fingerprint (repeatability) | see above | a repeated run reports `before == after` |

**Skipped, and why:** 139 tests in 18 files are skipped in this environment — the `-http.test.ts` suites
require a running application server. They are **not** claimed as passing. The full `verify` pipeline,
the production build and the browser specs were **not** run locally; they run in CI, and the CI evidence
in §1.1 is the last observed result at `d153529`.

**Environment limits.** The fingerprint values are read-only catalogue digests, so they move when role
grants are applied (`verify:scg`'s own `Initialize containers`-adjacent steps were not involved). The
change between the first and second migration run is consistent with the role-reconciliation scripts that
ran in between; that explanation is consistent with the digest's SQL (it covers owners, ACLs, policies,
constraints and defaults) but was **not** isolated by an A/B test.

---

## 6. Findings and remaining decisions

| # | Finding | For whom |
|---|---|---|
| `D-1` | `BLK-05` and `BLK-08` were **cited by three documents** (`BEYU-SCG-15` `C-5`, `BEYU-SCG-17` `A-08`/`A-09`, legal pack `BEYU-LF-D76`) while having **no row** in `BEYU-SCG-16`, whose own total claimed 26 blockers against 24 rows | **Repaired in this phase**: both rows restored in `BEYU-SCG-16` from the cross-references that cite them, summary and count reconciled to 26. No blocker was invented |
| `D-2` | `BEYU-SCG-15` `C-5` and `BEYU-SCG-17` `A-08` still say "no fixture change (beyond mandate)" | **Stale as of this phase.** Annotated as superseded rather than rewritten — the Phase 2 records stay as they were written, and `BEYU-SCG-18` is the record of the change |
| `D-3` | The Phase 3 brief's counts were verified against the repository: **151 files at `d153529` reconciled exactly** as 145 added + 6 modified | No discrepancy |
| `D-4` | The working tree arrived at `main` (`05e2fba`) with branch content present as local modifications. Before any reset, **all 145 branch-only paths were byte-compared against `origin/arena/8fbc8030-beyu-os-1-0`: 145 identical, 0 differing, 0 missing** | Recorded: a fresh sandbox's local state must be verified before it is trusted or discarded |
| `D-5` | `F-1`: pre-existing seeded databases still hold the fabricated rows; a re-seed does not repair them | **Operator decision** — an authorised, evidenced remediation per environment |
| `D-6` | `F-3`: `relationship_to_parent` defaults to `"CHILD"`, outside the engine's relationship vocabulary | **Schema decision** |
| `D-7` | The `BEYYU-LF-D02` typo at `LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL.md:54` remains, deliberately, as a pre-existing record | Reviewer, if a fix is wanted |

### 6.1 Decisions that remain human

1. **Merge or not.** PR #108 stays open, unmerged, awaiting review.
2. **Split or not.** §4 is a plan. Executing it needs explicit authorisation.
3. **`BLK-08` review.** Confirm the removal is complete and the guard can fail — then decide whether to
   accept the corrective change set.
4. **`BLK-01`.** No approving body is evidenced. The checklist in §3.1 is what a lawful process must
   supply; the platform cannot supply any item of it.
5. **Environment remediation (`F-1`)** and the **schema question (`F-3`)**.

---

## 7. What this document does not establish

* It is not an approval, a certification, an authorization or a legal opinion.
* It does not clear any blocker. `BLK-08` carries a corrective change set that is **pending human review**;
  its clearing authority is engineering under review, and that review has not happened. `BLK-01` and the
  twenty-five others remain as recorded in `BEYU-SCG-16`.
* It does not make synthetic data true, and corrected seed data **is still not evidence**.
* It does not authorize any external execution, on-chain act, payment, investment, redemption, payroll
  run, production migration or deployment. `A7` remains prohibited, `grants_authority` remains `false`, and
  `CAP_POSTING` remains `LOCKED`.
* A green check is a consistency result about artefacts. **A control that has never run is not a control
  passed**, and a control that refuses is not a control that failed.
