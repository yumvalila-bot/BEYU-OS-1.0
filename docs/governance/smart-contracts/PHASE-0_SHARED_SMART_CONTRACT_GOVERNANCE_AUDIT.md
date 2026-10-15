# PHASE 0 — Shared Smart Contract Governance & Automation Audit

Document ID: `BEYU-SCG-PHASE0`
Version: 1.0
Date: 2026-10-15 (Africa/Dar_es_Salaam)
Status: `INFORMATIONAL`
Classification: `INTERNAL`
Pack: `BEYU-SCG` — **proposed** pack identity (see §10; nothing in this document is approved)
Supersedes: nothing. This is the first document of this engagement.
Preceded by: `docs/governance/legal-foundations/GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` (`BEYU-LF-GATE0`), which audited the repository for the legal pack; this audit re-measures the repository for the smart-contract/automation engagement and does not restate its findings as its own.

> **This is the audit that had to precede any design or edit.** It records what was **actually**
> inspected in the repository, what was **actually** executed in this environment, which findings were
> measured against a real PostgreSQL 16 database, and — the part that matters most — which claims
> about smart contracts, on-chain execution, automation authority and automation safety are **not**
> established by anything in this repository.
>
> Nothing here is legal advice, a security certification, an audit opinion, a deployment record or an
> authorisation to operate. No chain was contacted. No key was read. No wallet was derived. No
> transaction was signed, submitted or broadcast. No production system was accessed. Automated tests
> pass or fail on **software behaviour**; they do not establish enforceability, statutory compliance,
> tax correctness, or that any contract, address, token or registration exists in the world.

---

## 1. Purpose, scope, method and limits

| Item | Value |
|---|---|
| Engagement | BEYU OS — Shared Smart Contract Governance & Automation |
| Question this audit answers | "What already exists in this repository, what is verified about it, what is missing, and what may legitimately be designed on top of it — before a single file is edited?" |
| Repository | `https://github.com/yumvalila-bot/BEYU-OS-1.0` |
| Local checkout | `/home/user/BEYU-OS-1.0` |
| Branch audited | `arena/8fbc8030-beyu-os-1-0` (the session branch), branched from `main` |
| Baseline commits | session branch `36efbd0`; `main` = `05e2fbabb9d2aa5292846e6acc092984d01ea468` |
| Working tree at audit start | **clean** (`git status --porcelain` → no output) |
| Method | Git/GitHub state inspection; file and directory inventory; targeted source reading; identifier and dependency scans; full migration application to a disposable PostgreSQL 16 cluster; role provisioning exactly as CI does it; seeding of synthetic bootstrap data; execution of the repository's own test suites, type-check and lint |
| What was **not** done | No chain/RPC/explorer contact; no key material read, generated or used; no wallet or address derived; no transaction signed, submitted or broadcast; no production or Supabase database touched; no registry, bank, regulator or court contacted; no payment provider contacted; no e-mail/message sent; no deployment |
| Environment | Disposable, per-session: PostgreSQL 16.14 on `127.0.0.1:5432`, cluster in the gitignored `./pgdata/`, synthetic seed data only |

**Honest limitation.** Every "the system does X" statement below is a statement about **code in this
repository and its behaviour in this disposable environment**. It is not a statement about any
deployed system, any live contract, any real asset, any real person, or any legal position.

---

## 2. Environment, commands executed and results

### 2.1 How the environment was brought to a CI-equivalent state

The repository's own harness was used, in the same order CI uses it. CI's own comments state why the
order matters, and this audit reproduced that order after observing the failure mode it describes.

| # | Command | Result |
|---|---|---|
| 1 | `npm ci --no-audit --no-fund` | exit 0 — 342 packages installed |
| 2 | `npm run pg16:start` (long-running harness) | PostgreSQL **16.14** listening on `127.0.0.1:5432`; roles `beyu_runtime` and `beyu_health_runtime` created with `NOSUPERUSER NOBYPASSRLS NOCREATEROLE` |
| 3 | `npx tsx scripts/migrate.ts` (with `BEYU_ADMIN_DATABASE_URL`) | **exit 0** — all 76 migrations applied to `beyu_os`; fingerprint before `e273ab9dc396aa346447cea4d760eeb9` → after `eebc66981c8f176dbd8ef9ba0a43a58b` |
| 4 | `npx tsx scripts/setup-db-role.ts` | exit 0 — runtime role attributes pinned; privilege reconciliation reported |
| 5 | `npm run db:setup-governance-role` | exit 0 — `beyu_governance` reconciled: NOBYPASSRLS, non-owner, finite privileges |
| 6 | `npx tsx src/db/seed.ts` (with `BEYU_BOOTSTRAP_PASSWORD`) | exit 0 — "BEYU OS bootstrap complete (2026-10-15). Bootstrap credentials were not printed." |
| 7 | `npx vitest run` (full suite) | see §2.2 |
| 8 | `npm run typecheck`, `npm run lint` | see §2.2 |

**Two failed intermediate attempts, recorded because they are evidence about the environment, not
defects in the repository.** (a) Running a DB-backed suite before `npm run seed` failed with
`seed user ASHA_NDULU missing` (the suites require the seeded synthetic principals to exist —
expected, and exactly what CI's documented ordering prevents). (b) Running the payments control
suites before `setup-db-role.ts` failed three assertions about the runtime role's privileges on the
payment configuration tables; those assertions **pass** once the role is provisioned the way CI
provisions it. Neither failure indicates a code defect; both were environment-ordering artefacts and
are re-measured green in §2.2.

### 2.2 Measured results

| Check | Command | Result |
|---|---|---|
| Engine suites (no DB needed) | `npx vitest run tests/blockchain/model.test.ts` | **46 passed** (386 ms) |
| Contract + blockchain + payments + HCM, CI-equivalent env | `npx vitest run tests/contracts tests/blockchain tests/payments tests/hcm` | **16 files passed, 1 file skipped; 262 tests passed, 5 skipped, 0 failed** |
| Full suite | `npx vitest run` | **307 files passed, 38 skipped (345); 5,292 tests passed, 348 skipped, 31 todo, 0 failed** (5,671 total), 910.67 s. Every skipped file is an HTTP suite that needs a running server (`BEYU_TEST_BASE_URL`); none was made to pass |
| Types | `npm run typecheck` (`tsc --noEmit`) | **exit 0 — clean.** See §11 for the heap note on the first attempt |
| Lint | `npm run lint` (eslint) | **0 errors, 1 warning** — a pre-existing `@next/next/no-img-element` warning in `src/components/noelia-cross-os-visual.tsx`, untouched by this engagement |
| Browser suite | `npm run test:browser` | **NOT RUN** — requires a running server and `BEYU_TEST_BASE_URL`; out of scope for this audit and not claimed |

Contract/blockchain test inventory measured: `tests/contracts/service.test.ts` 21 tests,
`tests/blockchain/eip712.test.ts` 17, `tests/blockchain/model.test.ts` 46,
`tests/blockchain/service.test.ts` 18 — **102 contract/blockchain tests, all passing** in the
CI-equivalent run.

### 2.3 What was deliberately not run

Not run, and therefore not claimed: production build parity checks (`npm run build` twice, once
without secrets), the DR drill, the runtime-privilege audit script's full output, the certification
script, secret scanning, supply-chain SBOM, TLS preflight, browser/Playwright tests, and any
deployment. This audit is not a certification and does not substitute for CI.

---

## 3. Baseline repository state

### 3.1 Verified git and GitHub facts

| Fact | Measurement |
|---|---|
| Repository, default branch | `yumvalila-bot/BEYU-OS-1.0`, default `main` |
| `main` commit observed | `05e2fbabb9d2aa5292846e6acc092984d01ea468` |
| Session branch | `arena/8fbc8030-beyu-os-1-0`, HEAD `36efbd0`, working tree clean |
| Open pull requests | 10: #108, #107, #103, #68, #67, #61, #54, #41, #31, #20, #14 |
| PR #108 | **OPEN**, base `main`, head `36efbd0`, MERGEABLE/UNSTABLE, 120 files, +25,197/−0 — the legal-foundations documentation pack. **Nothing merged.** |
| Is there an open smart-contract / ledger feature PR? | **No.** None of the open PRs is a smart-contract, on-chain or ledger feature change; the smart-contract-labelled PRs (#102, #92, #23, #88, #73, #79, #89, #96) are all **merged** documentation/infrastructure changes |
| Other branches | None besides `main` and the session branch (local and remote) |
| Code frozen for this audit? | Yes — no file was edited during Phase 0 |

### 3.2 Branch and PR decision (recorded before editing)

The engagement rule is: audit first; never push to `main`; never force-push; never merge; if a
documentation PR is open, continue its branch; if it has merged, raise a clearly linked follow-up.

**Decision taken and recorded now, before any edit:**

- `PR #108` is **open** and its head **is** this session's branch. Therefore this engagement
  **continues the session branch** `arena/8fbc8030-beyu-os-1-0` and its commits land in the same
  pull request as the legal pack, as an **additional, clearly labelled workstream**.
- The two workstreams are kept separable by **path** (`docs/governance/legal-foundations/**`
  untouched by this engagement; new work under `docs/governance/smart-contracts/**`) and by
  **commit message prefix** (`docs(smart-contract-governance):`), so either workstream can be
  reviewed, reverted or split without touching the other.
- **Nothing is merged.** Merge remains a human act at the gate.

---

## 4. Verified capability inventory (what already exists)

All line counts and file counts below were measured in this audit; they describe code, not
governance.

### 4.1 Governed contracting engine — **exists**

`src/lib/contracts/` — 10 modules, **4,386 lines**: `model.ts` (deterministic lifecycle, authority
determination, obligation timing, health, anchor-commitment domain), `service.ts` (governed
mutation: scope → RBAC → ABAC → policy → business rules → mutate → audit → event), `vocabulary.ts`,
`obligations.ts`, `signing.ts`, `documents.ts`, `parties.ts`, `disputes.ts`, `pure.ts`, `errors.ts`.

Encoded properties, read from the module headers and code (not inferred):

- **DENY is final.** An unlisted lifecycle transition is refused; a missing mandatory authority
  check blocks execution; an absent evidence reference is "not proven", never "assumed ok".
- **No legal conclusions.** Jurisdiction-sensitive outcomes are emitted as `REQUIRES_LEGAL_REVIEW`
  metadata. `LEGAL_REVIEW_CLOSED` exists as a state that only a human closes.
- **Signature posture.** `contracts/signing.ts` records *who* signed, *in what order*, *by which
  method*, against *which content hash*, with *which authentication evidence* — and states that
  **a signature binds a hash, never the document**, and that signature method is **metadata**:
  enforceability is never inferred from a wallet signature, an e-mail confirmation or a hash.
  Supported methods include `QUALIFIED_ELECTRONIC`, `ADVANCED_ELECTRONIC`, `SIMPLE_ELECTRONIC`,
  `WET_INK_SCANNED`, `BOARD_RESOLUTION_ATTESTED`, `BLOCKCHAIN_ADDRESS_ATTESTED`,
  `COUNTERSIGNED_WET_INK` — modelled, **not** legally verified (see §5 F-SCG-18).
- **Authority thresholds exist as policy data** (`DEFAULT_AUTHORITY_THRESHOLDS`), with reserved-matter
  and finance-approval gates triggered by contract family, value and personal-data involvement.

### 4.2 Smart-contract registry and blockchain evidence substrate — **exists**

Migration `drizzle/0042_governed_contracting_and_blockchain.sql` creates **18 tables**:
`contract_parties`, `contract_records`, `contract_lifecycle_events`, `contract_authority_checks`,
`contract_obligations`, `contract_obligation_events`, `contract_sla_measurements`,
`contract_execution_links`, `contract_signatures`, `contract_disputes`, `legal_document_lifecycle`,
`blockchain_anchors`, `smart_contract_registry`, `blockchain_events`, `blockchain_oracle_sources`,
`blockchain_oracle_readings`, `blockchain_token_positions`, `blockchain_reconciliation_runs`.

`smart_contract_registry` carries, per contract: network key and chain id, address, **status**,
network-production flag, repository ref and **full source commit**, compiler version, optimizer runs,
**ABI hash**, **bytecode hash**, explorer verification flag, proxy kind, implementation address,
**upgrade authority**, multisig address, timelock address and delay, **audit status** and audit
report document reference, **legal review status** (default `REVIEW_OPEN`), enforceability note,
purpose, oracle dependencies, governance body reference, risk classification, and provenance
columns (`recorded_by`, classification, timestamps).

`src/lib/blockchain/` — 3 modules, **3,590 lines**: `model.ts` (pure engines), `eip712.ts` (typed
commitments), `service.ts` (governed service). Network catalogue: `local-anvil` (chainId 31337),
`sepolia`, `base-sepolia` (both marked `production: false`), and `ethereum`, `base`, `polygon`
(marked `production: true`, 12/12/64 required confirmations). Anchor methods include
`EVM_TRANSACTION_CALLDATA`, `EVM_LOG_INDEXED`, `ONCHAIN_REGISTRY_COMMITMENT` and
`BEYU_HASH_CHAIN_ONLY`. Anchor statuses: `PENDING`, `RECORDED`, `VERIFIED`, `SUPERSEDED`,
`REVOKED`, `FAILED`, `BLOCKED`, with a defined progression in which verification requires a
registry-checked on-chain record.

### 4.3 "May this be executed on-chain right now?" — **exists, and is a read-only gate**

`GET /api/v1/blockchain/execution-posture` computes, from the governed registers and never from
stored state: the contract's lifecycle state, whether a dispute pauses execution, whether the
contract address is registry-verified on that network, whether a `VERIFIED` anchor exists, whether
an oracle reading is usable for the feed, the multisig/timelock posture, and whether the network is
production at all. The route's own comment is the governance boundary:

> `permitted: true` means the gates are open, nothing more. This endpoint does not sign, submit or
> broadcast; BEYU holds no keys and the decision to execute still belongs to a human in the treasury
> and legal workflow.

### 4.4 Automation substrate — **exists, with human binding**

| Module | What it is | Measured property |
|---|---|---|
| `src/lib/noelia/human-approval.ts` (164 lines) | Human approval that binds a payload digest, target, required role, permission, **version and expiry** | An approval whose digest or version does not match the current payload is refused (`APPROVAL_DIGEST_MISMATCH`) |
| `src/lib/noelia/scheduler-service.ts` (467 lines) | DB-backed schedules (`DAILY`…`HORIZON`), runs and offsets, executed under `NOELIA_SCHEDULER_IDENTITY` | Scheduling is a governed write with audit + event, and human-control commands are verified through `human-approval` |
| `src/lib/decision-authority.ts` (421 lines) | "Is this governance decision authoritative and executable right now?" | Fail-closed verdict ladder; **only `ACTIVATED`** is executable; `REFERENCE_DATA` (seed/hand-inserted) **never authorises**; no env var, config flag, seed row or UI state can bypass it |
| `src/lib/execution/simulate.ts` (393 lines) | End-to-end governed-execution **simulation** | Structurally sets `mutatedProductionState: false`; never imports the DB, never posts; never returns `RATIFIED`/`APPROVED`/`EFFECTIVE` as a result status |
| `src/lib/idempotency.ts` (199 lines) | Durable idempotency ledger | Scoped to tenant + acting user + endpoint; same key with a different payload is a conflict; in-flight claims are deliberately never auto-reclaimed |
| `src/lib/authority/` (3 modules, 1,338 lines) | Authority readiness model, engines, service | Scoped authority primitives (tenant/entity/principal), not a blanket "decision applies everywhere" |
| `drizzle/0075_noelia_authority_execution_hardening.sql` | Latest migration | "**This migration grants no new authority and activates no provider.**" Inseparable approval bindings; immutable plans/content; tenant+entity AI-decision isolation; terminal-state safety |

No in-process timer, cron expression, worker thread or queue consumer was found in `src/`
(searches for `setInterval`, `node-cron`, cron-style scheduling returned nothing). Schedules are
database rows; **whether any external process actually invokes them is not verified** (§5 F-SCG-29).

### 4.5 Money and authority boundaries — **enforced, fail-closed**

- `CAP_POSTING` remains **LOCKED**; `src/app/api/v1/finance/journal/route.ts` refuses with
  "Accounting governance ratification is pending", and dozens of route headers state the same
  boundary.
- `src/lib/finance/truth.ts` records AR/AP as `canonicalTable: null` — there is **no** AR/AP
  substrate, so there is nothing for an automation to post against by mistake.
- The blockchain service documents five hard boundaries: **no keys, ever** (no signer import, no
  credential column — `signerRef` names an *external* custody arrangement); **no money path**
  (never calls the posting engine, never marks a payment settled); **no canonical overwrite**
  (reconciliation reports findings, never updates a cap table, contract or obligation);
  **no authority from chain data** (`createsAuthority: false` / `grantsAuthority: false` are
  structural, default false, with no write path to true); **legal effect is never implied**
  (`enforceabilityNote` / `legalReviewStatus` stay `REQUIRES_LEGAL_REVIEW` until a human closes it).
- **No web3 dependency exists anywhere.** `package.json` dependencies are exactly: `dotenv`,
  `drizzle-orm`, `next`, `pg`, `react`, `react-dom`, `tsx`, `zod`. No `viem`, `ethers`, `web3`, no
  RPC client, no `eth_call`, no `RPC_URL`. Consequence: the repository **cannot** sign or broadcast,
  by construction, not by policy alone.
- `src/lib/contracts/*` and `src/lib/blockchain/*` contain **no network call of any kind**.

### 4.6 Catalogue, permissions and schema — measured

- **Permission codes** exist and separate reading from authority: `contracts:read`,
  `contracts:manage`, `contracts:authority` ("MFA step-up; human only"), `blockchain:read`,
  `blockchain:manage` ("never chain key custody, never a posting route").
- **Capability IA** (`src/app/os/capabilities.ts`) exposes "Contract Lifecycle"
  ("Governed contract register, review gates, obligations, disputes, execution evidence and
  amendments") and "Blockchain Registry & Evidence" ("Governed smart-contract provenance, evidence
  anchors and non-authoritative reconciliation").
- **Architecture is respected:** four Sector OSs only (`FINANCE_OS`, `HEALTH_OS`,
  `AGRICULTURE_OS`, `UJENZI_OS`) plus `BEYU_OS` control plane and the HIVE AI runtime; HCM appears
  as `SHARED_HCM` (a shared capability, never an OS); the Foundation appears as
  `SHARED_FOUNDATION_OPERATIONS`, never a subsidiary or a fifth Sector OS. **No `SMART_CONTRACT_OS`
  and no `HCM_OS` exist.**
- **Scale:** 76 migrations; 377 API route files; 345 test files; `src/lib` = 417 TypeScript modules,
  ~110,500 lines.
- **Shared-capability gap:** `os_registry` contains no entry classifying contracting/blockchain as a
  shared capability (§5 F-SCG-13).

---

## 5. Findings register

Classification vocabulary: **VERIFIED** (measured in this audit), **PARTIAL** (real but incomplete),
**UNVERIFIED** (asserted somewhere, not established), **BLOCKED** (cannot be established from here),
**NOT PRESENT** (does not exist).

| ID | Finding | Class |
|---|---|---|
| F-SCG-01 | Governed contracting engine exists with a defined lifecycle, authority determinations and a deny-final policy | **VERIFIED** |
| F-SCG-02 | Smart-contract registry exists with provenance, integrity hashes, proxy/upgrade/multisig/timelock and legal-review columns | **VERIFIED** |
| F-SCG-03 | On-chain execution posture is a **computed, read-only gate**; the endpoint cannot sign, submit or broadcast | **VERIFIED** |
| F-SCG-04 | The repository holds **no keys and no signing capability**; zero web3 dependencies; `signerRef` is a reference to external custody | **VERIFIED** |
| F-SCG-05 | Chain data cannot create or grant authority: `createsAuthority: false`, `grantsAuthority: false`, default false, no write path to true | **VERIFIED** |
| F-SCG-06 | Legal effect is never inferred: signature method is metadata; enforceability/legal-review states remain open until a human closes them | **VERIFIED** |
| F-SCG-07 | Automation is bound to humans where it matters: digest + version + expiry-bound approvals; fail-closed authority verdicts; simulation can never mutate production state | **VERIFIED** |
| F-SCG-08 | `CAP_POSTING` is enforced fail-closed; there is no AR/AP substrate; blockchain code has no money path | **VERIFIED** |
| F-SCG-09 | No in-process timers, cron jobs, workers or queue consumers exist in `src/` | **VERIFIED** |
| F-SCG-10 | Contract/blockchain suites pass on a real PostgreSQL 16 cluster with CI-equivalent roles and seed: **102 tests** across four files, 0 failures | **VERIFIED** |
| F-SCG-11 | Contract and blockchain permission codes separate read, manage and authority; authority operations are MFA step-up and human-only | **VERIFIED** |
| F-SCG-12 | Canonical architecture holds in code and data: four Sector OSs; HCM a shared capability; Foundation a separate nonprofit tenant; no `SMART_CONTRACT_OS` | **VERIFIED** |
| F-SCG-13 | **No shared-capability registration for contracting/blockchain exists in `os_registry`** — the surfaces are catalogued in the UI capability IA only | **PARTIAL** |
| F-SCG-14 | **There is no smart-contract or automation governance document** in `docs/`; the only prior mentions are HISTORICAL narrative reports and one IP-policy clause | **PARTIAL** |
| F-SCG-15 | Oracle substrate exists (feeds, source kinds, deviation limits in basis points, max age, manual evidence) but **no oracle source register, no verification of any external source, and no documented escalation** | **PARTIAL** |
| F-SCG-16 | Key custody is named, not governed: `signerRef` points outward, and **no custody standard, key register, rotation, revocation or dual-control procedure exists** | **PARTIAL** |
| F-SCG-17 | Upgrade/pause/incident handling is **recorded as data** (proxy kind, upgrade authority, multisig, timelock, `PAUSED`/`UNPAUSED` events) but **no runbook, no dual-control procedure and no post-incident review process exists** | **PARTIAL** |
| F-SCG-18 | Electronic-signature and evidence law for Tanzania is **not researched**; signature methods are modelled software metadata, not verified legal routes | **BLOCKED** (§7) |
| F-SCG-19 | Reconciliation is findings-only (`CAP_TABLE_MISMATCH`, `UNAUTHORIZED_TRANSFER`, `UNKNOWN_HOLDER`, stale state, …) with **no documented escalation or decision procedure** | **PARTIAL** |
| F-SCG-20 | Personal data and immutability: the design commits **hashes**, not content, but this is not documented as a data-protection governance position | **PARTIAL** |
| F-SCG-21 | No investment-order, redemption or investment-proposal capability exists (grep: zero hits in `src/` and `drizzle/`); capital execution is blocked elsewhere in governance | **NOT PRESENT** |
| F-SCG-22 | No proof that any smart contract is deployed on any network: the registry's verified rows in a fresh cluster are **zero**, and no explorer or RPC is reachable from here | **UNVERIFIED** |
| F-SCG-23 | No verified token positions, on-chain equity or share holdings exist; the legal pack's cap table opens at zero verified shares | **UNVERIFIED** |
| F-SCG-24 | Whether BEYU uses any production network (`ethereum`, `base`, `polygon`) is **not established by the repository** — the networks are catalogued capabilities, not deployment records | **UNVERIFIED** |
| F-SCG-25 | External registry/oracle verification (e.g. the `UTT_AMIS` federation row, which carries `uncertain: true` and the mandate text "As discussed in BEYU architecture work") is **not verifiable** | **UNVERIFIED** |
| F-SCG-26 | Tanzanian primary-source legal research for this engagement is **blocked**: the sandbox has no route to `rita.go.tz`, `brela.go.tz`, `tra.go.tz`, `pdpc.go.tz` or other government hosts | **BLOCKED** |
| F-SCG-27 | Production state (chain, database, custody) is **not inspectable** from this environment; the audited database is disposable and synthetic | **BLOCKED** |
| F-SCG-28 | No signing, broadcasting, key-generation or address-derivation capability exists anywhere in the repository | **NOT PRESENT** (by design) |
| F-SCG-29 | Whether any external runner invokes the DB-backed schedules is **not established**; the repository contains no runner and no deployment evidence | **UNVERIFIED** |
| F-SCG-30 | Coverage limits measured in this audit: the browser/Playwright suite was not run; the full suite skips 38 files (348 tests) because they need a running server, and 31 tests are `todo` (`tests/communications/security.test.ts`); upgrade/pause/incident procedures have no test at all because they are not written yet | **PARTIAL** |

---

## 6. Governance gaps this engagement exists to close

The audit's central conclusion: **the engineering substrate is well ahead of the written governance
for it.** The code already refuses to sign, refuses to post, refuses to grant authority from chain
data, and refuses to let an approval float free of a payload digest. What does not exist is the
**documented human authority framework** that says who may exercise the capabilities that *are*
modelled — and what evidence is required when they do.

| Gap | Statement | Consequence if left open |
|---|---|---|
| G-1 | No written authority framework for smart contracts: who may author, approve, register, deploy, upgrade, pause, revoke, decommission, and under which quorum and evidence | The registry can be populated without a recorded decision; "governed body" stays a free-text reference |
| G-2 | No key-custody governance: no custody standard, no key register, no rotation/revocation, no separation of duties, no attestation of who holds what | A future custodian arrangement is unaccountable; `signerRef` is a string with no governed referent |
| G-3 | No **automation register**: which automations exist, what each may do unattended, which are forbidden, which require a human digest-bound approval, and what happens when one fails | Automation authority exists only inside 43 modules of code; nobody can review it as a whole |
| G-4 | No oracle source governance: feed → source mapping, verification status per source, uncertainty flags, freshness/deviation policy, manual-evidence rules | An unverified feed could be treated as authoritative input to a decision |
| G-5 | No incident/pause/upgrade runbook with roles, dual control, notification and post-incident review | The events exist (`PAUSED`, `UNPAUSED`, `PARAMETER_CHANGED`, `CONTRACT_UPGRADED`) but the act is ungoverned prose-free |
| G-6 | No documented escalation/decision procedure for reconciliation findings (`UNAUTHORIZED_TRANSFER`, `UNKNOWN_HOLDER`, `CAP_TABLE_MISMATCH`) | Findings are produced and then nobody is obliged to act |
| G-7 | No documented evidentiary character of anchors and on-chain records relative to written instruments, and no Tanzania-specific legal research | Someone will eventually mistake a verified anchor for legal effect |
| G-8 | No data-protection position for hash commitments, personal data references, oracle-derived personal data, or cross-border handling of them | Immutability and data-subject obligations are reconciled nowhere |
| G-9 | No register of deployed contracts, custody arrangements, automation decisions, incidents, or oracle sources as **documents** with owners, evidence and review dates | The register is an index; the instrument is the evidence — a principle the legal pack states and this engagement must honour |
| G-10 | No verification standard stating what a passing test does and does not prove for this domain | "All tests pass" becomes a proxy for a compliance claim nobody made |

---

## 7. Legal research position — deliberately blocked

This engagement is **Tanzania-first** and may not invent law. The research this domain needs is
**not** obtainable from this environment: outbound access is limited to GitHub, npm and PyPI, so
`rita.go.tz`, `brela.go.tz`, `tra.go.tz` and `pdpc.go.tz` are unreachable. Verified Tanzanian
provisions already gathered for the legal pack (companies, trusts, NGO, tax, data protection,
trademarks, succession) are recorded in
`docs/governance/legal-foundations/LEGAL_SOURCES_REGISTER.md` and are **not** re-researched here.

Consequently, the following are recorded as **counsel questions to be researched by a qualified
Tanzanian advocate**, not as findings:

1. The legal effect of electronic signatures and advanced/qualified electronic signatures, and of
   transaction-hash attestations, under Tanzanian law.
2. Whether, and how, a distributed-ledger record is admissible and what weight it carries as
   evidence of a commitment, an obligation, a payment or a delivery.
3. The interaction between the immutability of hash commitments and Tanzanian data-protection
   obligations (including any erasure/correction rights) where personal data is referenced on-chain.
4. Tax characterisation of on-chain positions, token holdings or settlement flows, if any ever
   exist.
5. Regulated-activity analysis (payments/AML/securities) before any token or settlement use is
   contemplated.
6. Cross-border data-transfer conditions where an on-chain commitment is, or references, personal
   data.

**Nothing in this document may be cited as establishing any of the above.**

---

## 8. What this audit does not establish

- It does **not** establish that any entity, trust, company, contract, address, token or registration
  exists, is deployed, is registered, is filed, is approved or is enforceable.
- It does **not** certify security, correctness, compliance, accounting treatment or audit
  readiness. No auditor, regulator, registry, bank, custodian or chain was contacted.
- It does **not** validate external data sources; the seeded integration and federation rows are
  reference data, never evidence.
- It does **not** authorise any of: signing, deploying, upgrading, pausing, executing, transferring,
  issuing, paying, filing or listing.
- It does **not** claim that passing tests prove legal effect, statutory compliance, tax correctness
  or operational safety.
- It does **not** modify, and has not modified, a single file: **Phase 0 produced no edits**.

---

## 9. Proposed Phase 1 scope — for explicit confirmation before drafting

The audit supports a **documentation-first** Phase 1. It does **not** justify new execution code:
every execution primitive this domain would need already exists and is fail-closed (§4.4–4.5), and
adding a parallel authority path would be a second source of truth for authority — the exact failure
mode the platform's own design forbids.

**Option A (recommended, proposed):** a `BEYU-SCG` governance pack under
`docs/governance/smart-contracts/`, documentation only, consisting of:

1. `SCG-01` Smart Contract Authority Framework — who may do what, evidence required, no authority
   from chain data, NOELIA_AI is not an authority.
2. `SCG-02` Contract & Smart-Contract Lifecycle Governance — states, gates, decision records,
   separation from the legal pack's instruments.
3. `SCG-03` Signing, Key Custody & Attestation Governance — external custody, registers, rotation,
   revocation, dual control; no keys in the repository, ever.
4. `SCG-04` Automation Governance — the automation register: what may act unattended, what is
   forbidden, human-approval binding, idempotency, fail-closed defaults, CAP_POSTING stays locked.
5. `SCG-05` Oracle & External Data Governance — feed/source mapping with explicit verification
   status, freshness/deviation, manual evidence, escalation.
6. `SCG-06` On-Chain Evidence & Reconciliation Governance — anchors as evidence, findings-only
   reconciliation, escalation and decision procedure.
7. `SCG-07` Incident, Pause, Upgrade & Rollback Runbook — roles, dual control, evidence,
   notification, post-incident review.
8. `SCG-08` Registers & Templates — deployment, custody, automation, oracle, incident, reconciliation,
   evidence-archive registers, opening at explicit zeros.
9. `SCG-09` Testing & Verification Standard — exact commands, what a test proves and does not prove.
10. `SCG-10` Counsel Questions — the six Tanzanian questions in §7, structured for instruction.
11. `SCG-11` Request-to-Document Matrix, `SCG-12` Verification Log (Gate 9 checks), `SCG-13`
    Deliverables & Change Log, `SCG-14` README.

Every document: `DRAFT FOR PROFESSIONAL REVIEW`, statuses that never reach `APPROVED` without a
recorded human decision, `[COUNSEL TO CONFIRM]` / `[USER TO SUPPLY]` placeholders where facts are
unknown, and a stated non-establishment section.

**Option B:** Option A **plus** narrowly scoped governance-surface code — and only where the audit
shows a genuine gap that documentation cannot close (candidate: registering the contracting and
blockchain capabilities in `os_registry` as shared capabilities; an automation-register read model).
Any such change would be additive, fail-closed, migration-reversible, accompanied by tests, and
would still move no authority and activate nothing.

**Option C:** stop after Phase 0 (this document) and take the audit no further.

**Not proposed, and not to be undertaken without a separate, explicit instruction:** deploying or
upgrading anything, holding or generating keys, contacting a chain, enabling CAP_POSTING, or
building a parallel authority engine.

---

## 10. Proposed pack identity and location

| Field | Proposed value | Rationale |
|---|---|---|
| Pack ID | `BEYU-SCG` | Distinct from `BEYU-LF` (legal foundations); no collision with existing `REG-*` IDs |
| Location | `docs/governance/smart-contracts/` | Sibling of `docs/governance/legal-foundations/`; the legal pack is not modified by this engagement |
| Document ID form | `BEYU-SCG-<DOC>` (e.g. `BEYU-SCG-01`) | Matches the `BEYU-LF-<DOC>` convention |
| Cross-references | By **path and ID**, never by renumbering the legal pack | The 103 registered legal-pack paths stay frozen |
| Status vocabulary | Borrowed from the legal pack's taxonomy | One status language across both packs |

These are **proposals**. Nothing is registered anywhere until the pack itself creates its register.

---

## 11. Verification log

| # | Command | Observed |
|---|---|---|
| 1 | `git status --porcelain` | no output (clean tree) |
| 2 | `gh pr list --state open` | 10 open PRs; none is a smart-contract/ledger feature |
| 3 | `gh pr view 108 --json state,mergeable,headRefOid,files,additions,deletions` | `OPEN`, `MERGEABLE`/`UNSTABLE`, head `36efbd0`, 120 files, +25,197/−0 |
| 4 | `grep -rn "investment_order\|redemption\|investment_proposal" src/ drizzle/` | zero hits |
| 5 | `grep -rn "viem\|ethers\|web3\.\|jsonrpc\|eth_call\|RPC_URL" package.json src/ drizzle/ scripts/` | zero hits |
| 6 | `grep -rn "setInterval\|node-cron\|cron(" src/` | zero hits |
| 7 | `npm ci --no-audit --no-fund` | exit 0, 342 packages |
| 8 | `npm run pg16:start` | PostgreSQL 16.14 on 127.0.0.1:5432; roles non-superuser, NOBYPASSRLS |
| 9 | `npx tsx scripts/migrate.ts` | exit 0; 76 migrations; fingerprint `e273ab9d…` → `eebc6698…` |
| 10 | `npx tsx scripts/setup-db-role.ts` && `npm run db:setup-governance-role` | exit 0; runtime and governance roles reconciled |
| 11 | `npx tsx src/db/seed.ts` | exit 0; bootstrap complete; no credentials printed |
| 12 | `npx vitest run tests/contracts tests/blockchain tests/payments tests/hcm` | 16 files passed, 1 skipped; **262 passed, 5 skipped, 0 failed** |
| 13 | `npx vitest run` (full) | **ADDENDUM — measured after drafting; see below** |
| 14 | `npm run typecheck` / `npm run lint` | **ADDENDUM — measured after drafting; see below** |
| 15 | `find tests -name "*.test.ts" \| wc -l` | 345 |
| 16 | `ls drizzle/*.sql \| wc -l` | 76 |
| 17 | `find src/app/api -name route.ts \| wc -l` | 377 |

### Addendum — full suite, typecheck and lint (recorded at the end of Phase 0)

**Full suite — `npx vitest run` (CI-equivalent environment, code unchanged):**

| Measure | Value |
|---|---|
| Test files | **307 passed, 38 skipped** (345 total) |
| Tests | **5,292 passed, 348 skipped, 31 todo, 0 failed** (5,671 total) |
| Duration | 910.67 s |
| Exit code | 0 |

All 38 skipped files are HTTP/UI suites that require a running application server through
`BEYU_TEST_BASE_URL` (they carry the `↓` marker and skip by design when no server is configured);
they were **not** made to pass, and a skip is not a pass. The Playwright browser suite
(`npm run test:browser`) was **not run at all**.

**Types — `npm run typecheck`:**

- First attempt was run concurrently with the full test suite and **aborted with a Node heap
  out-of-memory condition** ("Aborted" after `AllocateRawWithRetryOrFailSlowPath`). This is an
  environment limitation (≈3.9 GB RAM, 2 vCPU), not a repository defect, and it is recorded rather
  than hidden.
- Re-run alone with `NODE_OPTIONS=--max-old-space-size=3072`: **exit 0, no diagnostics**.

**Lint — `npm run lint`:** **0 errors, 1 warning** — `@next/next/no-img-element` in
`src/components/noelia-cross-os-visual.tsx`, a pre-existing warning in a file this engagement does
not touch (this engagement changes no code at all).

**Baseline integrity statement.** Two independent runs were used: a targeted run over
`tests/contracts tests/blockchain tests/payments tests/hcm` (262 passed / 5 skipped / 0 failed) and
the full run above (5,292 passed / 0 failed). Between them, the environment was brought to a
CI-equivalent state (§2.1). No source file was modified to obtain any result.

---

## 12. Phase 0 exit statement

- The repository was audited before anything was edited, and **nothing was edited**.
- The state of `main`, the session branch and the open pull requests was **measured**, not assumed.
- The capabilities a "smart contract governance and automation" engagement would touch were
  **located, read, and exercised** against a real PostgreSQL 16 database with CI-equivalent roles.
- The gaps were stated as gaps, the unknowns as unknowns, and the blocked research as blocked.
- **No legal proposition, no registration, no deployment, no approval and no authority is asserted
  by this document or created by it.**
- The next step is a **human decision on Phase 1 scope (§9)** — not more code.

*End of Phase 0 audit.*
