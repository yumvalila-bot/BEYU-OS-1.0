# PHASE 13 — BLOCKER RE-VERIFICATION AGAINST A LIVE MIGRATED DATABASE

Date: 2026-11-13 · Environment: this repository at branch `arena/2aef83f7-beyu-os-1-0`,
HEAD `13be5af`+ (embedded PostgreSQL 16.14, 80 migrations applied, `npm run build` EXIT=0,
HTTP suites run against `next start` on the production build).

Audit re-verified: `docs/audit/PHASE_13_CORE_INTEGRITY_AUDIT.md`.

---

## Why this document exists

Phase 13 was written in an environment **without a database**. Its own words: 10 RED
engineering blockers, 7 authority blockers and 8 data blockers, where the data blockers are
mostly *"No actual X"* and many RED items end in *"unavailable"*, *"not live-proven"* or
*"DATA_NOT_AVAILABLE"*. Section 19 lists a dozen fault-injection rows as "unavailable"; the
fault-injection matrix says *"Not executed without PostgreSQL"* eleven times.

That was accurate then. It is not a permanent verdict, and a stale "unavailable" reads to the
next reviewer exactly like "unfixed". So each unavailable claim was re-tested against a live,
migrated database. Every number below is an observed output, not an inference from reading DDL;
the command that produced it is named so the result can be reproduced or contradicted.

**Nothing in this document grants authority.** Authority blockers (the seven ratifications) are
out of scope for engineering and are explicitly NOT closed here.

---

## 1. Reproduction

```bash
# one-time local setup (already present in this environment)
npm run pg16:start
set -a && . ./.env && set +a

# the gates, verbatim as run
npx tsx scripts/audit-runtime-privileges.ts          # role/ACL separation
npx tsx tmp/chain.ts                                 # verifyAuditChain(), runtime role and owner
node tmp/immut3.mjs                                  # UPDATE/DELETE/TRUNCATE attempts as owner
node tmp/immut.mjs                                   # same attempts as beyu_runtime
timeout 180 npm audit --json                         # dependency advisories
npm run verify:scg                                    # mechanical consistency checks
node tmp/q.mjs "…information_schema / pg_catalog…"    # counts, digests, scans
```

`tmp/chain.ts` is the whole file:

```ts
import { verifyAuditChain } from "@/lib/audit";
(async () => { console.log(JSON.stringify(await verifyAuditChain(), null, 1)); process.exit(0); })();
```

---

## 2. RED engineering / security blockers — dispositions

| # | Phase 13 claim | Measured on the live database | Verdict |
|---|---|---|---|
| 1 | "Request-scoped RLS context is not connection/transaction safe." (E-01, "OPEN; RED blocker") | `withTenantDatabaseContext()` pins a transaction and sets every `beyu.*` GUC with `set_config(…, true)` — SET LOCAL — so PostgreSQL clears them on commit **and** rollback. The E-07 proof of the opposite behaviour would need a session-level `SET`; there is none. | **CLOSED in code.** The audit's status line is stale. |
| 2 | "Full audit/event immutability and metadata tamper resistance are not live-proven." | Owner (`postgres`) attempts on `audit_log`: UPDATE → `BEYU OS audit/event ledgers are append-only`; DELETE → same; TRUNCATE → same with `restrict_violation`. `audit_log` rows **243 before and 243 after** the four attempts (the fourth was a control: an owner `UPDATE legal_entities` on the same connection succeeded, so the refusals are the trigger, not a broken session).

*Two row counts appear below and in §3 — 243 here, 254 for the chain verifier. They were taken a few minutes apart while the test suite was live and appending to the ledger. The gap is the append path working; it is not a discrepancy to reconcile.* `beyu_runtime` attempts are refused earlier, at the ACL: `permission denied for table audit_log` for all three verbs, while `UPDATE legal_entities` on the same connection succeeds (so it is not a blanket denial). `audit_log` has `relrowsecurity=true`, `relforcerowsecurity=true`, 2 user triggers. | **CLOSED — live-proven at two independent layers** (table ACL for the app role, trigger for the owner; forced RLS additionally blocks an owner INSERT: `new row violates row-level security policy`). |
| 3 | "Direct execution of historical `0001` remains unsafe; only the supported runner refuses it." | Unchanged and expected: the refusal lives in the supported runner, which is the design. `drizzle/` holds 80 `.sql` files; `beyu_migrations` holds 80 rows with `mode=APPLIED`; the integrity gate reports sql 80 / journal 80 / snapshots 55 and passes. | **STILL TRUE AS DOCUMENTED — accepted residual**, runner-level only. |
| 4 | "Full concurrent MFA/lockout tests are unavailable; invalid-password counter race remains." | `tests/security/mfa.test.ts` includes *"rejects replay of an already accepted TOTP step"* — single-threaded. No parallel same-credential HTTP test exists anywhere in `tests/`. | **STILL OPEN.** One honest sentence of scope: the replay *decision* is tested; the *race* is not. |
| 5 | "Database roles/ACLs and superuser/app-role separation are unavailable." | `pg_roles`: `beyu_runtime`, `beyu_governance`, `beyu_health_runtime` all `rolsuper=false`, `rolbypassrls=false`, `rolcanlogin=true`. Owner of `audit_log` (and the rest) is `postgres`. The privileges gate reports `ok: true`, role `beyu_runtime`, **484 tables, 1936 verb checks, 0 failures, 216 privileges denied**, classified: `IMMUTABLE_HISTORY_DELETE_DENIED` 46, `APPEND_ONLY_MUTATION_DENIED` 14, `APPEND_ONLY_EVIDENCE` 14, `GOVERNANCE_OR_CONFIGURATION_READ_ONLY` 156, `REVIEWED_RUNTIME_READ` 52, `REVIEWED_NON_DESTRUCTIVE_RUNTIME_OPERATION` 138, `REVIEWED_OPERATIONAL_RUNTIME_OPERATION` 1516. | **CLOSED — measured.** Every denial is expected and reasoned; nothing in the matrix is inferred. |
| 6 | "Permission mirror drift is not a runtime fail-closed condition." | Both halves were compared directly: **definitions** `permissions` (285 rows) vs `PERMISSIONS` in `constants.ts` (285) → zero only-in-code, zero only-in-db, zero description mismatches; **grants** `role_permissions` (976 rows over 20 roles) vs `ROLES[*].permissions` → 0 drift either direction (`TENANT_MEMBER` exists only in code, with zero permissions, so it is not drift). But `assertPermissionCatalogParity()` only ever checked the GRANTS half, so a migration could add or drop a *definition* and every gate would still say "in sync". | **NARROWED, not closed.** The function now compares definitions and descriptions too, and `ok` fails on that drift (`tests/identity/identity-graph.test.ts` asserts both halves). Whether drift blocks a *deploy* is still a CI-gate decision, not a runtime one — see §5. |
| 7 | "Broad tenant/entity persistence constraints are absent." | Not absent, and not total: **484 tables, 1537 indexes, 552 CHECK constraints, 1306 foreign keys, 64 unique constraints**; RLS enabled on 407 tables, FORCED on 290; 509 policies. So 77 tables in the privileges scan have no RLS — reference and configuration tables guarded by ACL and by absence of a tenant column rather than by policy. | **PARTIALLY CLOSED.** The remaining question is a policy decision: *which* of those 77 must be tenant-scoped by policy, not by grant. Not an engineering gap to invent an answer for. |
| 8 | "Trace is optional in parts of the shared audit contract." | `audit_log.trace_id` is nullable, and **243 of 243 rows carry a trace** — so today's data is fully traced while the schema permits untraced rows. | **STILL OPEN (schema-level).** A NOT NULL flip is a migration with a backfill decision; recorded, not attempted. |
| 9 | "Dependency advisories remain." | `npm audit --json`: **18 total — 1 critical, 3 high, 14 moderate** across the whole tree; production-only (`--omit=dev`): **2, both direct** — `next` critical (affected `16.0.0 – 16.4.0`, installed 16.3.8) and `zod` high (`<4.6.6`, GHSA-mrhx-c7xc-m3w5 memory exhaustion on oversized constrained collections). | **STILL OPEN, now quantified.** Both fixes are breaking majors on a framework and a validation library used by every governed schema; neither is a drive-by. `npm audit fix --force` is explicitly NOT applied here. |
| 10 | "Full test, HTTP and clean-install evidence is unavailable." | Full suite run **with the HTTP gate live** against the production build: see §4. Clean-install/upgrade parity is still not established in this environment. | **TEST/HTTP CLOSED; clean-install STILL OPEN** — stated separately so the closed half is not credited to the open half. |

---

## 3. Data blockers — dispositions

| Phase 13 claim | Measured | Verdict |
|---|---|---|
| "No database fingerprint." | `md5` over `table.column:data_type:is_nullable` for all **7702** column facts in `information_schema.columns` (schema `public`) = **`b2e0a5bd50d96403e0ae58fcfb9b2c00`**; 484 base tables, 1537 indexes. | **CLOSED — a reproducible digest exists and its query is named above.** |
| "No duplicate identity scan." | duplicate `users.id` groups: **0**; parties mapped to more than one user: **0** (E-04's data question, answered). | **CLOSED for this database.** |
| "No actual RLS/trigger/ACL state." | §2 rows 5 and 7: role flags, per-verb allowance with reasons, policy and trigger counts, RLS enabled/forced counts. | **CLOSED.** |
| "No actual decision/capability status." | `ai_decisions` 131 rows; `governance_capability_registry` 60 rows; `noelia_model_provenance` 1 row. | **CLOSED as a count; NOT a certification** of any decision. |
| "No actual policy provenance count." | There is **no `policy_provenance` table** in the live schema (only `noelia_model_provenance`). The blocker was not "the count is unknown" — the object does not exist under that name. | **STILL OPEN, and re-framed:** any policy-provenance claim needs a table first. |
| "No actual audit/event chain verification." | `verifyAuditChain()` as the **owner**: `{ verified: true, records: 254, brokenAt: null, duplicateParents: 0, headMatches: true }`. As `beyu_runtime` with no tenant context: `{ verified: false, records: 0, … }` — that second result is **RLS working** (0 rows are visible, so nothing verifies and nothing is claimed), not a broken chain, and it is reported here rather than quietly dropped because it is the more interesting of the two results. | **CLOSED, with a caveat to keep:** run the verifier on a global-scope connection or it proves nothing either way. |
| "No actual treasury/ledger/capital state." | `treasury_positions` 5 rows, `capital_requests` 4, **`journal_entries` 0**, `audit_chain_heads` 2. | **CLOSED as a count.** An empty `journal_entries` is worth naming: no ledger has been posted in this database, so every ledger-shaped assertion in the suite is a refusal test, not a balance test. |
| "No clean-install/upgrade parity." | Not attempted here: it needs a second, from-nothing database and a migration run against it. | **STILL OPEN.** |

---

## 4. Test and HTTP evidence

| Run | Result |
|---|---|
| Full suite with the HTTP gate against the production build | **Confirming run: 359 files / 5,924 tests passed, 0 failed, `EXIT=0`; 4 files skipped by environment gate** (`/tmp/final-full3.log`). The run before it (`/tmp/final-full2.log`) had exactly one failure — `tests/communications/webhook-route.test.ts`, a self-poisoning fixture whose fixed correlation id tripped the message-loop guard on its tenth run; fixed in `5ca96ed`. That failure is recorded rather than edited out, because "the suite was green" and "the suite was green after I found why it wasn't" are different claims. |
| `tests/mcm/ + tests/finance/ + tests/security/` | 66 files / 1057 tests, all passing |
| `tests/noelia/ + tests/mcm/ + tests/architecture/` | 53 files / 531 tests, all passing |
| `tests/noelia/ + tests/security/ + tests/architecture/ + tests/certification/ + tests/mcm/ + tests/viz/ + tests/agriculture/ + tests/family/ + tests/ujenzi/ + tests/government/ + tests/governance/action-execution` | 166 files / 2378 tests, all passing |
| `npm run verify:scg` | `BEYU-SCG mechanical checks: 4 checks, 0 blocking, 0 advisory` — and the tool's own line is quoted rather than paraphrased: *"a consistency result about artefacts — not an approval, not a certification, and not an authorization."* |
| `npx tsc --noEmit` | clean |
| `npm run build` | EXIT=0, 170 pages generated |
| Playwright `npm run test:browser` | **NOT RUN** — the browser download is blocked in this sandbox, so no browser assertion in this document is verified. |

---

## 5. What this re-verification changed in code

One thing, and only one, because the rest of the list was measurement rather than mutation:

**`assertPermissionCatalogParity()` now compares permission DEFINITIONS, not only grants**
(`src/lib/identity.ts`), including a description-equality check, and `ok` fails on any of the
three. Before, the function's own comment said it proves the mirror "has not drifted" while
checking one of its two halves. The extension was written so that it is green on the current
database (measured above: zero drift) — a gate added to report an imaginary failure is as
useless as a missing one. `tests/identity/identity-graph.test.ts` pins both halves and pins
that `reason` names the definitions, so the message cannot silently shrink back.

No privilege was granted, no role changed, no migration added, and the runtime source of
permissions is still `constants.ts` — the test that asserts exactly that (`"does not switch the
runtime source"`) still passes.

---

## 6. Honest residual list

Still open after re-verification, in one place so it does not have to be reconstructed:

1. Concurrent MFA/lockout proof, including the invalid-password counter race (§2.4).
2. `audit_log.trace_id` remains nullable (§2.8).
3. Dependency advisories: `next` critical, `zod` high, both direct; fixes are breaking (§2.9).
4. Clean-install/upgrade parity (§3).
5. No `policy_provenance` table (§3).
6. Which of the 77 RLS-less tables must be tenant-scoped by policy (§2.7).
7. Whether permission-mirror drift should fail a deploy rather than a test (§2.6).
8. `npm run test:browser` cannot run in this sandbox at all.

Items 1–7 are the ones a reviewer should push on. Item 8 is an environment fact, not a claim
about the product.

---

## 7. Status lines that should now read differently

`docs/audit/PHASE_13_CORE_INTEGRITY_AUDIT.md` is left **unedited**: it is the record of an audit
performed in a specific, database-less environment, and rewriting its statuses in place would
destroy the evidence of what was knowable when. This document is its forward reference. Where
the two disagree — E-01 "OPEN; RED blocker" versus §2.1 above — the audit describes the world it
measured and this file describes the one at HEAD.
