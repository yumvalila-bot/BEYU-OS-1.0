# BEYU OS 2.0 — Post-Merge Verification Report (PR #29 + PR #30 → `main`)

Reporting date: 2026-09-07, Africa/Dar_es_Salaam.
Repository: `yumvalila-bot/BEYU-OS-1.0`. Canonical branch: `main`.
Prepared after the maintainer authorized merging both open pull requests; nothing in this file
asserts a capability that is not measured here or in the documents it cites.

```
SCOPE OF THIS DOCUMENT
  1. record the merge as GitHub reports it            (facts, not interpretation)
  2. verify the merged tree locally: static gates, schema, controls, regression
  3. re-run the payment end-to-end evidence on `main`  (demo, self-test, DR, perf)
  4. preserve every open finding and add the one new finding this verification produced
  5. state what is still NOT claimed
```

## 1. Merge record

| Item | Measured value | How it was measured |
|---|---|---|
| PR #29 | `MERGED`, `mergedAt 2026-09-06T10:01:55Z`, merge commit `0eaa71debb38cb6fc1aa2d9114d5cee0ed85f391`, head `ec8dc40` | `gh pr view 29 --json state,mergedAt,mergeCommit,headRefOid` |
| PR #30 | `MERGED`, `mergedAt 2026-09-07T03:21:54Z`, merge commit `d626fa48eb26958fb349853e11b0e55332dc33d9` | `gh pr merge 30 --merge`, then `gh pr view 30 --json state,mergedAt,mergeCommit` |
| Merge method | normal merge commit (no squash, no rebase, no force-push). Parents of `d626fa4`: `0eaa71d` (previous `main`) and `0a51d2c` (PR head) | `git log --format='%H %P' -1 d626fa4` |
| Remote `main` after merge | `refs/heads/main` = `d626fa48eb26958fb349853e11b0e55332dc33d9` | `git ls-remote origin refs/heads/main` |
| Local canonical `main` | fast-forwarded to `d626fa4` with `git fetch origin main:main` — the checkout was never switched, so unrelated uncommitted work in this worktree was neither committed nor lost | `git rev-parse main` |
| Ancestry preserved | `0eaa71d → 25744c8 → 7b4692d → e71bb19 → 0a51d2c → d626fa4` | `git log --oneline 0eaa71d..d626fa4` |
| **Tree identity** | `git diff 0a51d2c d626fa4` is **empty** → the tree on `main` is byte-identical to the commit CI ran on | `git diff --stat 0a51d2c d626fa4` |

The last row is what makes CI's green run usable as *post-merge* verification rather than merely
pre-merge: GitHub's merge introduced no content change, so the checks that passed on `0a51d2c`
ran against exactly the bytes now on `main`.

### 1.1 Pre-merge gates that were re-checked, not assumed

* `gh pr view 30` → `mergeable=MERGEABLE`, `mergeStateStatus=CLEAN`, no blocking review.
* `gh pr checks 30` on head `0a51d2c` → **10 pass, 6 skipping**. Passing: Root BEYU OS PostgreSQL
  security gate (7 m 54 s, full suite against a scratch PostgreSQL 16), Migration validation
  (scratch-PG16), Committed secret scan, three production dependency audits, Health backend and
  Health frontend gates, Vercel, Vercel Preview Comments. Skipping: production deploy and
  production verification, production drift report, production preflight, runtime verification,
  Three-way release record, Supabase Preview.
* **Skipping jobs are recorded as skipped.** They are unauthorized production actions, not
  verifications, and none of them is counted as a pass anywhere in this document.
* The branch-protection endpoint returned `403 "not accessible by integration"` (the token is not
  a repository admin). That was not treated as a licence to merge: `mergeStateStatus=CLEAN` and
  the required-check rollup were the evidence used, and `gh pr merge` itself refuses when a
  required check is red — it did not.

## 1.2 Which tree this verification ran on, and how that was established

This sandbox had been re-cloned while the merges were being prepared, so the checked-out
**index** sits at `0eaa71d` (PR #29's merge commit) while the **working tree** still carries the
whole payments programme as untracked and modified files. Two consequences were handled explicitly
rather than assumed:

* `git diff <commit>` and `git status` are misleading in that state — present-but-untracked files
  are reported as deleted. Every identity claim below was therefore made by **hash comparison**:
  for each of the 79 files PR #30 put on `main`, `git rev-parse d626fa4:<path>` was compared with
  the SHA-1 of the file on disk. Result: **78 of 79 byte-identical**, the only difference being
  `FINAL_REPORT.md`, whose difference *is* the post-merge documentation patch written after the
  measurements. Zero files were missing, so no payment file on disk diverges from `main`.
* All 1250 files of `main` were then compared against the worktree the same way. **Nine** differ,
  and only one of them is in scope here: `FINAL_REPORT.md` (this patch). The other eight are the
  concurrent, unrelated workstream's uncommitted edits — `.env.example`, `.github/workflows/ci.yml`,
  `src/app/api/v1/system/self-test/route.ts` and five files under `src/lib/noelia/` — which were
  deliberately excluded from both PRs. Nothing under `drizzle/`, `src/db/schema/payments.ts`,
  `src/lib/payments/`, `src/app/api/v1/payments/` or `tests/payments/` differs from `main`; that is
  what makes the numbers below statements about the merged tree. No payment file is missing from the
  worktree either — the earlier observation that some looked absent was an artifact of splitting
  `git ls-tree` output on whitespace, which breaks the legitimately space-named
  `sectors/health/beyu health os/beyu health os.sqlproj`; that file is present and identical.
  The only in-scope exception to "the concurrent files are not exercised" is
  `tests/security/runtime-privilege-guard.test.ts` (that workstream's own suite, untracked, 6 tests),
  which the four-directory run did collect — §4 reports the totals both with and without it.

So: the verification below describes `main`'s content, executed on this machine, with the concurrent
workstream's overlay present in the same directory and accounted for.

## 2. Static gates on the merged tree

Each row is the command actually run in this sandbox against `d626fa4`, with its exit code.

Re-run for this document set, so the numbers below are the ones attached to these files:

| Command | Result | Exit |
|---|---|---|
| `npm run typecheck` (`tsc --noEmit`) | no errors | 0 |
| `npm run lint` (`eslint .`) | no errors | 0 |
| `npm run build` | production build compiled in 8 s (`○ Static` / `ƒ Dynamic` summary printed, no errors) | 0 |
| `npm run scan:secrets` | "Secret scan clean: scanned 1180 tracked files. No literal credentials found." — see the caveat below | 0 |
| `npx drizzle-kit generate --name=postmerge_docs_drift_check` | `No schema changes, nothing to migrate`; `drizzle/*.sql` still **30** files; `drizzle/meta/_journal.json` blob identical to `main`'s | 0 |
| `npm audit --omit=dev --audit-level=critical` | `found 0 vulnerabilities` (production dependency set) | 0 |

The secret-scan caveat, stated rather than glossed: the scanner walks the **git index**, and in the
worktree state described in §1.2 that index holds 1180 files — it did **not** include this report or
the three new evidence transcripts. Two things cover that: a targeted pattern sweep over the five
changed paths (connection-string passwords, `postgres:postgres`, bearer/JWT shapes, GitHub and AWS
key formats, PEM headers) returned **0 hits**, and CI's own "Committed secret scan" job runs against
the pushed tree, which is the authoritative version of this gate.

## 3. Post-merge database verification

### 3.1 Environment, stated plainly

`apt-get install postgresql` is impossible in this sandbox: `deb.debian.org` and the
`bookworm-security` mirror are unreachable (`W: Failed to fetch … Connection failed`), and no
system cluster survived the environment reset. Verification therefore used the repository's own
harness, `scripts/infra/pg16-server.mjs`, backed by the `embedded-postgres` /
`@embedded-postgres/linux-x64` devDependencies (PostgreSQL **16.14**, `x86_64-pc-linux-gnu`).
It provisions the same role and database model as `.github/workflows/ci.yml`: databases `beyu_os`
and `beyu_health`, roles `beyu_runtime` (non-superuser, `NOBYPASSRLS`) and
`beyu_health_runtime`, with the superuser DSN used only for DDL and seeding. `.env` was recreated
from the CI env block (`ci.yml` lines 185–206) and is git-ignored
(`.gitignore:15`); the credentials in it are the CI placeholders, not secrets.

Health-sector packages were **not** installed in this sandbox (`sectors/health/*/node_modules`
absent), so Health suites were not re-run locally; they are covered by the two Health CI gates
that passed on `0a51d2c` (§1.1). This is an environment limit, not a pass.

### 3.2 Schema applied from an empty cluster

| Step | Command | Measured outcome |
|---|---|---|
| init cluster | `node scripts/infra/pg16-server.mjs start --port 5432 --data pgdata` | `PG16 accepting connections: PostgreSQL 16.14 …`, databases created |
| migrate from nothing | `npm run migrate` | `fingerprintBefore 2d759ce6f0d6d4883f4dfa4899e28ff0` → `fingerprintAfter 567b78bfe038b7d191dfd81d8ef3c42c`, **30 migrations applied** (`public.beyu_migrations`) |
| idempotency | `npm run migrate` (second run) | fingerprint before = after (`567b78bf…`), nothing applied |
| runtime role | `npx tsx scripts/setup-db-role.ts` | `{"ok":true,"runtimeRole":"beyu_runtime"}` with `rolsuper=false`, `rolbypassrls=false`, `rolcreaterole=false`, `rolcreatedb=false`, `rolreplication=false` |
| seed | `npm run seed` | `BEYU OS bootstrap complete (2026-09-07). Bootstrap credentials were not printed.` |

### 3.3 Structural facts, counted from the live catalog (not from the docs)

| Fact | Measured |
|---|---|
| base tables in `public` | **132** |
| payment tables | **14** — `payment_account_mappings`, `payment_accounts`, `payment_corrections`, `payment_exceptions`, `payment_matches`, `payment_policies`, `payment_provider_connections`, `payment_providers`, `payment_risk_signals`, `payment_settlement_items`, `payment_settlements`, `payment_transaction_states`, `payment_transactions`, `payment_webhook_events` |
| RLS enabled **and** forced | **14 / 14** payment tables (`pg_class.relrowsecurity` ∧ `relforcerowsecurity`) |
| RLS policies on payment tables | **14** — one per table. The five configuration tables carry `r:` (SELECT) policies named `*_read_only` with USING only; the nine transactional tables carry `*` policies with both USING and WITH CHECK for tenant/entity isolation (`pg_policy.polqual`, `polwithcheck`) |
| CHECK constraints on payment tables | **70** (per table: 1, 2, 4, 4, 4, 4, 5, 10, 3, 1, 6, 3, 20, 3) |
| unique indexes on payment tables | **24**, including the four ingestion identity keys: `payment_transactions_idempotency_uidx (connection_id, idempotency_key)`, `payment_transactions_provider_uidx (connection_id, provider_transaction_id)`, `payment_webhook_events_inbox_uidx (connection_id, provider_event_…)`, `payment_settlements_uidx (connection_id, provider_settlement_id)` and `payment_settlement_items_uidx (settlement_id, provider_transaction_id)` |
| money typing | **0** `real`/`double precision` columns in any payment table; **19** columns are `numeric(18,0)` (minor units) |
| tenant scope | 13 of 14 payment tables carry `tenant_id`; `payment_providers` is deliberately global (a registry, `country_code` scoped, primary key `code`) |
| domain triggers | `payment_transaction_states_append_only`, `payment_transactions_posting_rewind` (the 0029 unposting guard), `payment_transactions_accounting_lineage`, `payment_matches_decision_frozen`, `payment_webhook_events_immutable_identity` |
| Finance OS substrate | `journal_entries` and `journal_lines` are the pre-existing Finance OS tables; the payment schema adds **no** parallel ledger and no second journal |
| capability registry | `governance_capability_registry`: **57 capabilities, all `activation_status = LOCKED`**, including `CAP_POSTING` (`execution_permission = finance:ledger.post`, `implementation_status = NOT_IMPLEMENTED`) |
| provider registry on a fresh install | `payment_providers` = **0 rows**. The `MOCK_SANDBOX` row is created by the sandbox/demo configuration path through the governed writer, not by migration or seed — a fresh installation therefore has an empty registry, which is the intended governed stop |

### 3.4 Effective privileges of the runtime role, measured two ways

`has_table_privilege('beyu_runtime', …)` and a live probe as that role. Columns were read from
`information_schema` first, because PostgreSQL resolves column references before privilege checks:
a probe written against a non-existent column returns `42703` and can be mistaken for a
refusal-verified result when it is really an inconclusive query.

| Table group | SELECT | INSERT | UPDATE | DELETE | TRUNCATE | Live probe as `beyu_runtime` |
|---|---|---|---|---|---|---|
| `payment_providers`, `payment_provider_connections`, `payment_accounts`, `payment_account_mappings`, `payment_policies` | ✔ | ✘ | ✘ | ✘ | ✘ | `42501 permission denied` for DELETE, TRUNCATE and UPDATE (28 probes) |
| the nine transactional payment tables | ✔ | ✔ | ✔ | ✔ | ✘ | statements execute; scope comes from RLS and from the domain triggers, not from table grants |
| schema-level | `USAGE` ✔, `CREATE` ✘ | — | — | — | — | `create table …` → `42501 permission denied for schema public` |

The transactional row is the one worth reading twice: append-only state history and the posting
rewind guard are enforced by **triggers and RLS**, and the `DELETE … WHERE 1 = 0` form of probe
proves nothing about either (no row is scanned). What proves them is the functional test set
(§4) and the append-only / rewind triggers listed in §3.3, plus the self-test check in §5.1.

## 4. Regression suites on the merged tree

All runs: `npx vitest run …`, Node 22.22.3, PostgreSQL 16.14, the live Next server at
`http://127.0.0.1:3100` for HTTP suites (`BEYU_TEST_BASE_URL` set), single-tenant fixture DB as
created in §3.2.

| Run | Files | Tests | Passed | Failed | Skipped | Duration | Exit |
|---|---|---|---|---|---|---|---|
| `npx vitest run tests/payments` | 6 / 6 | 70 | 70 | 0 | 0 | 5.55 s | 0 |
| `npx vitest run tests/payments tests/finance tests/security tests/api` | 37 / 37 | 615 | 615 | 0 | 0 | 29.37 s | 0 |
| same four directories with the concurrent workstream's suite excluded (`--exclude tests/security/runtime-privilege-guard.test.ts`) — i.e. **main's files only** | 36 / 36 | 609 | 609 | 0 | 0 | 28.83 s | 0 |
| `npx vitest run` (whole suite) | 130 / 131 | 2536 | 2532 | 4 | 0 | 357.86 s | 1 |
| `npx vitest run tests/finance/capital-governance-http.test.ts` (isolation re-run) | 1 / 1 | 14 | 14 | 0 | 0 | 1.68 s | 0 |

The four failures in the whole-suite run are `expected 429 to be 200` inside
`tests/finance/capital-governance-http.test.ts`: the run reused one application process in which
two earlier HTTP suites had already consumed the rate-limit buckets for the same principal, and
the limiter answered 429 before the assertion could be reached. The isolation re-run of that
exact file on the same tree passes 14 / 14, and the CI full-suite run — which executes the suites
in its own order against a freshly built server — passed (§1.1). The failure is therefore recorded
as a run-sequencing artifact of this sandbox, **not** as a code defect, and not silently: both
numbers, including exit code 1, are above.

The 615 figure includes `tests/security/runtime-privilege-guard.test.ts` (6 tests), which belongs
to the concurrent workstream described in §1.2 and is not part of `main`; the restricted run on
`main`'s files alone is 36 files / 609 tests, all passing. Both numbers are reported so neither
overstates nor understates what the merged tree covers.

`tests/finance/accounting-substrate-boundary.test.ts` (7 tests), which had previously been
`ECONNREFUSED 127.0.0.1:5432` in this environment, ran and passed here. The earlier
`ENVIRONMENT_LIMITED` status for the DB-gated suites is therefore **lifted** by measurement, not by
assertion.

## 5. Payment end-to-end evidence re-run on `main`

### 5.1 Self-test, governed demo

`npx tsx scripts/payments-demo.ts --mode=sandbox --failures` → exit **0** (23.2 s, then re-run
22.8 s to capture the transcript). Stage results, from the captured output:

```
ingest                         outcome=INGESTED      reconciliationStatus=RECONCILIATION_REQUIRED
re-delivery                    outcome=DUPLICATE   code=ALREADY_RECEIVED
reconciliation                 RECONCILED
accounting bridge              outcome=BLOCKED      reason="No financial period covers 2026-09-07
                                                    for entity LEN_BEYU_MINING_LTD. Creating one
                                                    requires finance:period.manage authority and
                                                    is not this bridge's to exercise."
second ingest duplicate        outcome=DUPLICATE   code=ALREADY_INGESTED
posting attempt (no principal) outcome=BLOCKED
demo summary                   selfTest=BLOCKED  postingAttempted=false  productionActivation=BLOCKED
fixture cleanup                ledger accounts removed 4, mappings 4, policies 1, connections 1,
                               journalEntries=0, journalLines=0, guardsEnabledAfter=true, residuals 0
```

Committed transcript: `docs/audit/evidence/POST_MERGE_PAYMENTS_DEMO_TRANSCRIPT.txt` (redacted as
described in its header; exit code 0).

Self-test contract output: `{"status":"BLOCKED","ok":true}` over **13 checks** —
`migration` PASS (`version=0028_payment_banking_core mode=APPLIED`), `tables` PASS (14/14),
`rls` PASS (14/14 enabled+forced), five `config-write:*` PASS
("refused by privilege revocation … SQLSTATE 42501 permission denied"), `append-only` PASS
("DELETE refused (42501) by the immutability trigger"), `signature` PASS
("invalid→refused; valid→accepted; detail=SIGNATURE_MISMATCH"), `state-machine` PASS
(terminal=true, unknown-state yields no transitions, vocabulary aligned), `provider-status` PASS
("9 providers assessed; live claims: 0; violations: 0") and `posting-authority` **BLOCKED**
("CAP_POSTING is locked pending P1, P6, P7, P9").

`BLOCKED` with `ok:true` is the intended result of a correctly governed installation. It is not a
pass for production readiness and is not described as one anywhere in this document.

### 5.2 HTTP behaviour of the deployed build (control plane)

Against `next start -p 3100` built from the merged tree, unauthenticated:

| Request | Response |
|---|---|
| `GET /api/v1/system/payments-self-test` | `HTTP 401 {"code":"UNAUTHENTICATED"}` |
| `GET /api/v1/payments/transactions?limit=1` | `HTTP 401 {"code":"UNAUTHENTICATED"}` |
| `GET /api/v1/payments/providers` | `HTTP 401 {"code":"UNAUTHENTICATED"}` |
| `POST /api/v1/payments/webhook/MOCK_SANDBOX` (bad signature, no configured connection) | `HTTP 503 {"code":"NO_ACTIVE_CONNECTION","message":"The event was recorded and refused."}` |
| `POST /api/v1/payments/webhook/NO_SUCH_PROVIDER` | `HTTP 400 {"code":"UNKNOWN_PROVIDER","message":"The event was recorded and refused."}` |

Two honest limitations of this probe: (i) the 503 row shows refusal-because-no-connection, **not**
signature verification — signature behaviour is proven by the self-test `signature` check and by
`tests/payments/webhook-security-and-provider-honesty.test.ts` (19 tests), not by this curl; (ii)
"recorded" in the refusal message is the inbox write that deduplication and audit depend on, so a
refusal is not a no-op and is intentionally visible.

### 5.3 Disaster recovery

`npx tsx scripts/dr-drill.ts --payments` → exit **0** (28.0 s).

```
source snapshot      30 migrations, fingerprint d5ab78be9a4d7c42a64bac57416d7079, 132 tables,
                     58 RLS-enabled tables, enterprise-event chain ok=true
scratch rebuild      beyu_dr_drill_… reconstructed from repository migrations only, via the
                     real migrate runner; fingerprint parity OK
runtime grants       source=513, scratch=513, missingOnScratch=[], extraOnScratch=[]
data restore         1 table (payment_exceptions) deferred by domain guards and reloaded with
                     triggers skipped; invariants agree in BOTH databases:
                     posted_without_entry=0, empty_entries=0, unbalanced_entries=0, orphan_states=0
post-restore         131 tables restored with count parity, RLS set preserved (58 tables),
                     audit heads 2, service principals 5
payment checks 9/9   transactions, inbox rows, state trail length+content, settlement batch,
                     journal entry balance+lineage, audit evidence, exceptions carried,
                     0029 unposting guard active after restore, posted state unchanged after
                     the guard refused the unpost
replay               duplicate delivery → DUPLICATE / ALREADY_RECEIVED, digest matches original,
                     transactionsForProviderId=1, journalEntriesForThisPayment=1, no second booking,
                     amount unchanged (250000 minor, TZS)
tampered replay      → REJECTED / DUPLICATE_CONFLICT and a CRITICAL OPEN exception
teardown             fixture removed (unwindOfDrillPosting=true), scratch database destroyed
```

Committed transcript: `docs/audit/evidence/POST_MERGE_DR_PAYMENTS_DRILL_TRANSCRIPT.txt` (exit 0).
The pre-merge failing drill run remains committed alongside the passing one at
`docs/audit/evidence/DR_PAYMENTS_DRILL_FAILED_RUN.txt`, as counter-evidence; nothing was replaced.

This is evidence about **this repository's restore procedure on one machine**. It is not a
production DR test: no RPO, no RTO, no off-site backup, no provider-side replay, no partial-failure
injection.

### 5.4 Performance probe, and its comparison with the pre-merge numbers

`npx tsx scripts/payments-perf-probe.ts --events=400 --concurrency=25` → exit **0** (34.2 s),
`classification.status = LOCAL_MEASURED`, `productionCapacityClaim = false`. Post-merge output is
committed as `docs/audit/evidence/POST_MERGE_PAYMENT_PERF_PROBE.json`; the pre-merge file
`docs/audit/evidence/PAYMENT_PERF_PROBE.json` is left exactly as merged.

| Measurement | Pre-merge (`docs/audit/evidence/PAYMENT_PERF_PROBE.json`) | Post-merge, this run |
|---|---|---|
| 400 sequential ingest — p50 / p95 / p99 (ms) | 15.80 / 21.24 / 26.51 | 14.86 / 21.01 / 27.73 |
| 400 at concurrency 25 — p50 / p95 / p99 (ms) | 205.35 / 268.05 / 371.08 | 209.37 / 274.95 / 365.32 |
| whole-run throughput at concurrency 25 (events/s) | 116.5 | 114.4 |
| 100 byte-identical re-deliveries | 100 / 100 `DUPLICATE`, p50 6.02 ms | 100 / 100 `DUPLICATE`, p50 6.19 ms |
| review queue p50 / draft assembly p50 (ms) | 4.96 / 4.90 | 6.94 / 5.75 |
| draft outcomes, policy version | `DRAFT_READY` 50/50, `SANDBOX-DEMO-1.0.0` | `DRAFT_READY` 50/50, `SANDBOX-DEMO-1.0.0` |
| teardown residual rows (transactions, inbox, entries, policies) | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |

The concurrency ceiling is the connection pool, not the queries: `src/db/index.ts` leaves
node-postgres at its default maximum of 10 connections and every ingest holds one transaction for
its RLS context, so a burst of 25 is bounded by pool acquisition. Recorded as measured; changing
it is a deployment decision, not a code change to celebrate. Nothing here supports a capacity,
SLA or provider-latency claim, and the deltas above are within single-node noise on a 2-CPU
sandbox with a cold cache and a mock in-process provider.

## 6. New finding produced by this verification

| ID | Severity | Finding | Status |
|---|---|---|---|
| **F-NEW-2** | P3 | `src/db/schema/payments.ts:40` — the inline comment describing `payment_providers.code` lists `AIRTELAIRTEL_MONEY_TZ`, `NMB_IPP` and `CRDB_GTTRANSFER` and omits `TIGO_PESA_TZ`. None of those three tokens is a registered code: `src/lib/payments/providers/index.ts:77-87` defines the authoritative nine (`MOCK_SANDBOX`, `MPESA_TZ`, `AIRTEL_MONEY_TZ`, `HALOPESA_TZ`, `TIGO_PESA_TZ`, `MIXX_YAS_TZ`, `TTCL_PESA_TZ`, `NMB_BANK_TZ`, `CRDB_BANK_TZ`). `NMB_IPP`/`CRDB_GTTRANSFER` are product names taken from secondary research, not platform codes | **OPEN** — comment-only. `payment_providers.code` has no CHECK constraint (measured against `pg_constraint`), so the drift cannot affect validation, ingest, or any migration; it misleads a reader only. Deliberately **not** fixed inside this merge: the merged tree was already CI-verified byte-identically (§1), so a code edit here would invalidate the evidence being cited. It goes to a separate follow-up commit with its own CI run |

Found after the merge, and reported as such. It is not a reason to reopen or downgrade the merge:
no test, route, migration, constraint or control reads that comment.

## 7. Findings preserved — nothing was closed because a PR merged

| ID | Severity | Status after merge | Note |
|---|---|---|---|
| **F-01** — runtime role holds blanket DML across the whole schema | **P1** | **OPEN, authoritative** | The five payment-table revocations (§3.4) are a domain-scoped mitigation and are *not* a closure. `npm run scan:secrets`, CI and these merges change nothing about the rest of the schema's exposure |
| **F-NEW-1a** — provider ledger double-lists `TIGO_PESA_TZ` and `MIXX_YAS_TZ` as two rails | P2 | **OPEN** | One rebranded operator (MIC Tanzania → Mixx by Yas); deleting a code that historical rows may reference is worse than the double count |
| **F-NEW-1b** — ledger prose still asserts that no provider documentation was retrieved | P3 | **OPEN** | `docs/audit/PAYMENT_PROVIDER_RESEARCH_TANZANIA.md` has overtaken that sentence; statuses correctly remain `UNVERIFIED` |
| `tests/api` payment-route coverage | P2 | **OPEN** | `tests/api` contains only `validation-boundary.test.ts` and `validation-http.test.ts` (measured). Payment HTTP behaviour is covered by the self-test/demo paths in §5 and by `tests/payments`; there are **no** `tests/api` payment route tests, and none is claimed |
| `CAP_POSTING` | — | **LOCKED** | 57 / 57 registry capabilities `LOCKED` (§3.3); no posting was performed by any payment flow in §5 (`journalEntries=0`, `postingAttempted=false`); the DR drill's fixture posting is the labelled sandbox path and was unwound by its own teardown |
| Agriculture OS | — | documentation / registry state only | Not upgraded by these merges; no implementation is inferred from registry rows or architecture documents |
| Noelia / HIVE, external certification | — | unchanged | `ACTUAL_CERTIFICATION_STATUS = NOT_CERTIFIED`, `EXTERNAL_ASSURANCE = NOT_ASSESSED`, `NOELIA_REAL_GENERATIVE_INFERENCE = ENVIRONMENT_LIMITED` |
| Regulatory | — | unchanged | `REGULATORY AUTHORIZATION = NOT_APPLIED`, `LEGAL_REVIEW_REQUIRED`, Bank of Tanzania licensing neither held nor sought; r.41 ten-year records, r.42 in-country primary data centre, r.39 fee disclosure and PDPA obligations remain unmet (F-P2-12) |

## 8. What this verification does not establish

* No real provider, bank, mobile-money operator, switch or national interplatform is integrated.
  `REAL_PROVIDER_INTEGRATION = BLOCKED_EXTERNAL_DEPENDENCY`; live claims in the registry: 0.
* No money moves anywhere. Nothing was posted to the ledger by the merge or by this verification.
* No production, staging, deployment, capacity, latency or durability claim. No RPO/RTO.
* No security certification, penetration test, external audit, or regulatory opinion.
* No statement that any prior finding is resolved; §7 lists them as open.
* `PRODUCTION_LAUNCH` remains **BLOCKED**, and CI being green does not change that.

## 9. Reproducing this verification

```bash
npm install
node scripts/infra/pg16-server.mjs start --port 5432 --data pgdata   # prints PG16 / accepts connections
# .env must mirror .github/workflows/ci.yml lines 185-206 (see §3.1); it is git-ignored
set -a && . ./.env && set +a
npm run migrate && npm run migrate                                   # second run must apply nothing
npx tsx scripts/setup-db-role.ts
npm run seed
npm run typecheck && npm run lint && npm run build && npm run scan:secrets
npx drizzle-kit generate --name=drift_check                          # expect: no new migration
npx vitest run tests/payments
npx vitest run tests/payments tests/finance tests/security tests/api
PORT=3100 npx next start -p 3100 &                                   # for the HTTP suites and §5.2
npx vitest run tests/payments tests/finance tests/security tests/api
npx tsx scripts/payments-demo.ts --mode=sandbox --failures
npx tsx scripts/dr-drill.ts --payments
npx tsx scripts/payments-perf-probe.ts --events=400 --concurrency=25
node scripts/infra/pg16-server.mjs stop
```

Catalog notes that save a future verifier from wrong conclusions, all learned in this run: the
migration ledger is `public.beyu_migrations` (not `drizzle.__drizzle_migrations`); the capability
table is `governance_capability_registry` keyed by `capability_code`/`activation_status`; RLS
policy expression columns are `pg_policy.polqual` and `polwithcheck`; uniqueness index definitions
start with `CREATE UNIQUE INDEX`, so `indexdef LIKE 'UNIQUE%'` silently returns nothing; and
`SELECT … FROM x WHERE 1 = 0` proves only privilege, never a trigger or an RLS filter.

---

## 10. Final status

```
PR_29:                 MERGED — merge commit 0eaa71debb38cb6fc1aa2d9114d5cee0ed85f391, main
PR_30:                 MERGED — merge commit d626fa48eb26958fb349853e11b0e55332dc33d9, main
                       tree byte-identical to the CI-verified head (git diff 0a51d2c d626fa4 empty)
MAIN_STATE:            VERIFIED — 30 migrations, 132 tables, 14 payment tables, RLS 14/14
                       enabled+forced, 70 CHECKs, 24 unique indexes, 0 float money columns,
                       drift-free, secret-scan clean, prod dependency audit 0 criticals
POST_MERGE_GATE:       typecheck 0 · lint 0 · build 0 · scan:secrets 0 · drizzle no-drift 0 ·
                       tests/payments 6 files/70 tests PASS · payments+finance+security+api
                       37 files/615 tests PASS (0 skipped) · full suite 2532/2536 with 4 failures
                       isolated to a rate-limit-window artifact (same file 14/14 alone) · CI green
PAYMENT_E2E:           VERIFIED_LOCAL — demo exit 0, self-test 13 checks (12 PASS, 1 BLOCKED by
                       design), DR drill exit 0 (9/9 payment checks, no second booking, tampered
                       replay refused + CRITICAL exception), perf probe exit 0 LOCAL_MEASURED
PROVIDER_INTEGRATION:  NOT_INTEGRATED — 9 registry codes, 0 credentials, 0 verified contracts;
                       BLOCKED_EXTERNAL_DEPENDENCY; live claims 0
FINDINGS:              F-01 OPEN (P1) · F-NEW-1a OPEN (P2) · F-NEW-1b OPEN (P3) ·
                       F-NEW-2 OPEN (P3, new: provider-code comment drift) ·
                       tests/api payment-route coverage gap OPEN
POSTING_AUTHORITY:     CAP_POSTING LOCKED — 57/57 registry capabilities LOCKED; 0 ledger rows
                       written by any payment flow in this verification
REGULATORY:            NOT_APPLIED · LEGAL_REVIEW_REQUIRED · no licence held or sought
CERTIFICATION:         NOT_CERTIFIED · EXTERNAL_ASSURANCE NOT_ASSESSED
PRODUCTION_LAUNCH:     BLOCKED — unchanged by either merge
OVERALL_BEYU_OS_2_STATUS: PARTIAL — payment subsystem merged and verified locally against a mock
                       provider on a real PostgreSQL 16; platform production launch blocked;
                       no production, certification, provider or licensing claim is made here
```

The last line of the block above is the final word of this report. Any summary that reads more
favourably than these lines is a misreading of them.
