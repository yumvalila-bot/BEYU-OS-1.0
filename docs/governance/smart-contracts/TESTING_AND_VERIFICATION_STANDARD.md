# BEYU-SCG-09 — Testing and Verification Standard

Document ID: `BEYU-SCG-09`
Title: Testing and Verification Standard
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`PRELIMINARY_FRAMEWORK`** — the standard is drafted. The additional checks `V-3`, `V-4`,
`V-4A`, `V-6` and `V-7` were **implemented in Phase 2** (`src/lib/smart-contracts/checks.ts`,
`npm run verify:scg`, and `tests/smart-contracts/governance-enforcement.test.ts`); `V-5` remains a
human review procedure, for the reason given in §4.2.
Owner (proposed): Chief Governance Officer with the platform engineering owner `[TO BE APPOINTED]`
Approving authority (proposed): BEYU Holding Company board `[NOT REPRESENTED IN THIS REPOSITORY AS LEGALLY CONSTITUTED]`
Next review date: `[SET ON APPROVAL]`
Classification: `INTERNAL`
Related documents: `BEYU-SCG-04`, `BEYU-SCG-04A`, `BEYU-SCG-12`, `BEYU-SCG-13`; legal pack: `BEYU-LF-FIN-09`
Depends on: nothing — the commands in §2 exist today; the checks in §4 are implemented as of Phase 2
(`BEYU-SCG-15` §5.2), except `V-5`, which is a review procedure

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
| Execution gates | Each of the **seven blocker conditions** fires independently — and note that the gate emits **eight distinct blocker codes**, because the production condition raises `MULTISIG_APPROVAL_MISSING` and `TIMELOCK_NOT_READY` together and the state condition is templated per state; production additionally requires multisig + timelock |
| Anchors | Verification requires depth + matching commitment; reorg candidate is reported, never healed |
| Oracles | Each fail-closed axis (stale, expired, disputed, future-dated, deviating, missing authorityRef, open data) |
| Reconciliation | Findings-only; no canonical mutation; `DATA_NOT_AVAILABLE` where no target exists |
| Payments | HMAC + clock skew + dedupe; no trust raise above artefact; no amount plug; review separation of duties |
| Automation | No in-process timer; scheduler tick permissioned and idempotent; approval binds digest + version + expiry |
| Authority verdicts | Only `ACTIVATED` executable; `REFERENCE_DATA` never authorises |
| Simulation | `mutatedProductionState` false; no `RATIFIED`/`APPROVED`/`EFFECTIVE` result |
| Retention | Legal hold blocks; eligibility ≠ destruction; destruction needs approval |
| Boundaries (static) | No key material, no signer import, no web3 dependency, no RPC client, no posting call in the domain modules |

**Additional checks** — proposed in the Phase 1 pack and **implemented in Phase 2** except where the
status column says otherwise. No existing identifier was renumbered, and none was reused.

| # | Check | Why | Implementation status (Phase 2) |
|---|---|---|---|
| V-3 | **Inventory freshness**: `BEYU-SCG-04A` parses, every entry cites source paths that exist, every automation-bearing directory is represented, and the TypeScript register agrees with the JSON inventory | Keeps the inventory true (`BEYU-SCG-04` AU-21) | **IMPLEMENTED** — `checkInventoryFreshness`. Directory-level coverage is a **floor, not a completeness proof** |
| V-4 | **No-secret assertion for registers**: the pack's register templates contain no value matching key/seed/keystore patterns | Enforces `BEYU-SCG-03` K-1 mechanically | **IMPLEMENTED** — `checkNoSecrets`. A pattern named *inside a prohibition* reports as advisory, never silently |
| V-4A | **No signing surface in the governed domain**: no signing or submission call, no wallet/keyring construction, no key-shaped value, no keystore read, and no signing library among the dependencies | The strongest mechanical form of `BEYU-SCG-03` K-1 and `BEYU-SCG-04` AU-2/AU-3 — it detects a **capability**, not merely a secret | **IMPLEMENTED** — `checkNoSigningSurface`, folded into V-7's result. `V-8` was **deliberately not used because it is already a reporting rule** (§5) |
| V-5 | **Documentation-boundary assertion**: a documentation-only change touches no file outside `docs/` | Prevents a docs PR from smuggling a behaviour change | **NOT AUTOMATED — see §4.2.** It is a pull-request property, not an artefact property |
| V-6 | **Prohibited-claim scan**: the pack contains no unsupported `APPROVED`/`EXECUTED`/`FILED`/`REGISTERED`, no invented address, no unverified official citation | Enforces the status rule (`README` §3) | **IMPLEMENTED (in part)** — `checkProhibitedClaims` scans declared status lines and authorization fields; it does not adjudicate every sentence in the pack |
| V-7 | **Refusal test per automation**: every automation in class A3–A6 has at least one test proving it refuses without authority | The rule "a control never run is not a control passed", applied to automation | **IMPLEMENTED** — the suite denies **all 23** automations, which covers A3–A6. This check's result also carries V-4A |

### 4.1 The implemented checks

| Command | What it does | What it cannot do |
|---|---|---|
| `npm run verify:scg` | runs V-3, V-4, V-6 and V-7 (V-4A within it); exits non-zero on any blocking finding | It is a consistency result about **artefacts**. It is not an approval, a certification or an authorization, and a pass does not authorize any automation |
| `npx vitest run tests/smart-contracts` | exercises every denial path, proves the permit path reachable only with injected synthetic evidence, and tests each mechanical check against deliberately broken input | It proves the boundary behaves as documented; it does not prove the control **operated** (V-13) |

### 4.2 Why `V-5` is not automated

`V-5` asks whether a change set is *documentation-only*. That is a property of **intent** expressed in a
pull request, not of an artefact: a diff containing only `docs/` paths satisfies a naive check whether
its author intended a documentation change or not, and a diff that legitimately needs one code fix is
not made safe by being flagged. Automating it would produce a check that is either vacuous or wrong.

It therefore lives where intent actually exists — the review checklist in `BEYU-SCG-17` §4.3 — and it is
recorded as an open item (`BEYU-SCG-16` `BLK-19`). **This matters immediately:** the Phase 2 change set
is not documentation-only, so `BEYU-SCG-12` `V-09` reads **SUPERSEDED**, not PASS.

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
