# BEYU-SCG-09 — Testing and Verification Standard

Document ID: `BEYU-SCG-09`
Title: Testing and Verification Standard
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`PRELIMINARY_FRAMEWORK`** — the standard is drafted; the proposed additional checks are not
implemented, and no suite has been extended by this pack.
Owner (proposed): Chief Governance Officer with the platform engineering owner `[TO BE APPOINTED]`
Approving authority (proposed): BEYU Holding Company board `[NOT REPRESENTED IN THIS REPOSITORY AS LEGALLY CONSTITUTED]`
Next review date: `[SET ON APPROVAL]`
Classification: `INTERNAL`
Related documents: `BEYU-SCG-04`, `BEYU-SCG-04A`, `BEYU-SCG-12`, `BEYU-SCG-13`; legal pack: `BEYU-LF-FIN-09`
Depends on: nothing — the commands in §2 exist today; the checks in §4 are proposals

> **CONTROL BLOCK.**
> **This is** the standard for what a verification run must report, what it may claim, and which
> refusal behaviours must be tested before an automation or gate is trusted.
> **This is not** a certification. A green suite is evidence about software behaviour and **nothing
> else**: it is not evidence of legal effect, statutory compliance, tax correctness, accounting
> accuracy, security, or that any control was actually operated.
> **Prohibited:** reporting a skip as a pass; reporting a partial run as a full run; citing a green
> suite as compliance; omitting what was not run.

---

## 1. What an automated test can and cannot establish

| A test **can** establish | A test **cannot** establish |
|---|---|
| That a code path refuses an input, with a specific error, under stated conditions | That the refusal is legally sufficient |
| That a state machine rejects an unlisted transition | That the state has any legal meaning |
| That an authority check blocks execution when missing | That the underlying authority exists |
| That a module contains no signer, no key column and no network call | That a *different* module does not |
| That an idempotency claim prevents a double effect | That a human process around it is followed |
| That an oracle reading is refused when stale, disputed or deviating | That the underlying external fact is true |
| That a document set is internally consistent and honest about its own gaps | That the documents are correct in law |

**Rule V-1 `[MANDATORY]`.** No verification result in this domain may be described as, or cited in
support of, enforceability, statutory compliance, tax correctness, audit readiness, security
certification or regulatory approval.

## 2. The exact commands, in the CI-equivalent order

Prerequisites: a disposable PostgreSQL 16 instance (the repository's own harness), then migrations,
then role provisioning, then the synthetic seed. **The order is not cosmetic** — the Phase 0 audit
observed both failure modes it prevents: DB-backed suites fail with `seed user … missing` before the
seed runs, and the payments control suite reports three privilege-assertion failures before the
runtime role is provisioned the way CI provisions it.

```bash
npm ci --no-audit --no-fund                    # install
npm run pg16:start                             # disposable PostgreSQL 16 harness (git-ignored cluster)
npx tsx scripts/migrate.ts                     # with BEYU_ADMIN_DATABASE_URL set
npx tsx scripts/setup-db-role.ts               # runtime role attributes + privilege reconciliation
npm run db:setup-governance-role               # least-privileged governed-mutation role
npx tsx src/db/seed.ts                         # synthetic bootstrap data (never evidence)
npx vitest run                                 # the full suite
npx vitest run tests/contracts tests/blockchain tests/payments tests/hcm   # the domain subset
npm run typecheck                              # tsc --noEmit
npm run lint                                   # eslint
```

**Credentials in this environment are ephemeral local literals for a disposable cluster and are not
secrets** (`scripts/infra/pg16-server.mjs` generates `ephemeral_*_password_not_secret` values). None
may be reused, and none appears in any committed file.

**Rule V-2 `[MANDATORY]`.** The report states, for each command: the exact command, the environment
prerequisites, the observed result, the exit code where meaningful, and **what was not run**.

## 3. Baseline measurement (Phase 0, code unchanged)

| Check | Result |
|---|---|
| Full suite (`npx vitest run`) | **307 files passed, 38 skipped (345); 5,292 tests passed, 348 skipped, 31 todo, 0 failed**, 910.67 s |
| Domain subset (`tests/contracts tests/blockchain tests/payments tests/hcm`) | **16 files passed, 1 skipped; 262 passed, 5 skipped, 0 failed** |
| Engine-only (`tests/blockchain/model.test.ts`) | 46 passed, 386 ms |
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 errors, 1 pre-existing warning (`noelia-cross-os-visual.tsx`) |
| Playwright browser suite | **NOT RUN** |
| Build parity (no-secret build), DR drill, certification, SBOM, TLS preflight | **NOT RUN** |

**All 38 skipped files are HTTP/UI suites that require a running server via `BEYU_TEST_BASE_URL`. A
skip is not a pass, and this pack does not report them as one.**

## 4. Required tests for changes in this domain

**Existing behaviour that must stay covered** (all of it currently is, per §3):

| Area | What must be asserted |
|---|---|
| Contract lifecycle | Unlisted transitions refused; terminal states accept nothing; gates never self-close |
| Authority | Missing check blocks; `NOT_REQUIRED` needs a reason; thresholds blank → restrictive |
| Signing posture | `enforceability` stays `REQUIRES_LEGAL_REVIEW`; a signature binds a hash, not a document |
| Registry | Testnet-first enforced; no revival of deployed/compromised; provenance fields required |
| Execution gates | Each of the seven blockers fires independently; production additionally requires multisig + timelock |
| Anchors | Verification requires depth + matching commitment; reorg candidate is reported, never healed |
| Oracles | Each fail-closed axis (stale, expired, disputed, future-dated, deviating, missing authorityRef, open data) |
| Reconciliation | Findings-only; no canonical mutation; `DATA_NOT_AVAILABLE` where no target exists |
| Payments | HMAC + clock skew + dedupe; no trust raise above artefact; no amount plug; review separation of duties |
| Automation | No in-process timer; scheduler tick permissioned and idempotent; approval binds digest + version + expiry |
| Authority verdicts | Only `ACTIVATED` executable; `REFERENCE_DATA` never authorises |
| Simulation | `mutatedProductionState` false; no `RATIFIED`/`APPROVED`/`EFFECTIVE` result |
| Retention | Legal hold blocks; eligibility ≠ destruction; destruction needs approval |
| Boundaries (static) | No key material, no signer import, no web3 dependency, no RPC client, no posting call in the domain modules |

**Proposed additional checks `[PROPOSED]`** (none implemented by this documentation-only change set):

| # | Check | Why |
|---|---|---|
| V-3 | **Inventory freshness**: `BEYU-SCG-04A` parses, every entry cites source paths that exist, and every automation-bearing source path is represented | Keeps the inventory true (`BEYU-SCG-04` AU-21) |
| V-4 | **No-secret assertion for registers**: the pack's register templates contain no value matching key/seed/keystore patterns | Enforces `BEYU-SCG-03` K-1 mechanically |
| V-5 | **Documentation-boundary assertion**: a documentation-only change touches no file outside `docs/` | Prevents a docs PR from smuggling a behaviour change |
| V-6 | **Prohibited-claim scan**: the pack contains no unsupported `APPROVED`/`EXECUTED`/`FILED`/`REGISTERED`, no invented address, no unverified official citation | Enforces the status rule (`README` §3) |
| V-7 | **Refusal test per automation**: every automation in class A3–A6 has at least one test proving it refuses without authority | The rule "a control never run is not a control passed", applied to automation |

## 5. Reporting rules `[MANDATORY]`

| Rule | Statement |
|---|---|
| V-8 | Report the exact commands and the exact results. Never summarise a partial run as a full run. |
| V-9 | Report **skips, todos and not-run suites explicitly**, with the reason. |
| V-10 | A failing test is reported as failing, with the failure text, even where the failure is believed to be environmental. The belief is stated as a belief and the measurement is stated as a measurement. |
| V-11 | Never claim that a registry, a bank, a regulator, a court, a chain or a production environment was checked unless it actually was. |
| V-12 | Never re-run a green suite to launder a red one; a re-run is reported with both results and the reason for the re-run. |
| V-13 | Distinguish "the code passes" from "the control operates". A test proves the code path; only an operating record proves the control. |

## 6. What this document does not establish

It certifies nothing, extends no suite, and proves no behaviour beyond the baseline measurement it
records. It defines how this domain's changes must be verified — and what such verification is
allowed to mean.
