# RB-025: Post-Billing Release Recovery

**Version:** 1.0
**Last updated:** 2026-10-12
**Owner:** Release Engineering (executes) · BEYU Holding accountable owner (authorises)
**Status:** ARMED — waiting on Gate 1 (account billing)
**Related:** [RB-003 Database Outage](./RB-003-database-outage.md) · [RB-005 Migration Failure](./RB-005-migration-failure.md) · [RB-006 Migration Rollback](./RB-006-migration-rollback.md) · [RB-022 Production Deployment](./RB-022-production-deployment.md) · [Supabase production database](./supabase-production-database.md) · `docs/deployment/THREE_WAY_PRODUCTION_ARCHITECTURE.md`

---

## 1. Why this runbook exists

GitHub Actions jobs in this repository have been **BLOCKED before execution** since 2026-10-10T04:57Z by an account-level billing condition. Every job reports `steps: []` with the annotation:

> `The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings`

Consequences while that persists:

* the governed database release (`db-release.yml`) **cannot apply a migration at all** — no runner starts;
* the **live migration head of the production database is therefore UNKNOWN** and must not be inferred from any compiled value, dashboard or old log;
* the application deployment keeps running the current `main` code, whose first authenticated request needs a database schema the production database may not have.

This runbook is the **resumption procedure**: the ordered gates, the exact commands (copied from the workflow source), the evidence each gate must produce, and the authorisation each gate requires. It is written to be **idempotent and non-self-authorising** — every read-only step can be repeated freely, and **no step may silently advance into a production mutation.**

### Status vocabulary (used verbatim in all reports)

| Term | Meaning |
| --- | --- |
| **PASS** | Actually executed and succeeded, with the evidence quoted |
| **FAIL** | Actually executed and failed |
| **BLOCKED** | A prerequisite (billing, secret, account access, network path) made the check impossible |
| **NOT RUN** | Deliberately not executed — including every check that needs separate authorisation |
| **UNKNOWN** | Evidence is insufficient to decide |

**A blocked workflow is not a passing test.** A job that never started has zero test evidence; it must be reported as BLOCKED, never green, never red-for-code.

---

## 2. Verified starting state (2026-10-12)

| Fact | Value / status | How it was established |
| --- | --- | --- |
| `main` | `9669640` (`Merge pull request #105…`) | `git ls-remote` / `git fetch` |
| Open PR under review | **#106**, head `5b8dc68`, base `main`, MERGEABLE — audit documents + four diagnostic code files. **Not merged.** | GitHub API |
| Other open PR | **#103**, `CONFLICTING`, head `29d509c`, predates #104/#105 — human disposition required, not touched | GitHub API |
| Actions | **BLOCKED** (billing). Latest annotated run: `38241055220` / check-run `114769275126`, `2026-10-12T11:11:26Z`, `steps: 0` | check-run annotation |
| Production deployment | runs `9669640`; `releaseTimestamp 2026-10-12T04:26:29Z`; `environment: production` | public `GET /api/health/identity` (a **build literal** — not the database head) |
| Production database head | **UNKNOWN** (Gate 3 establishes it) | not inferable from the above |
| Reported user symptom | "BEYU OS could not load this view / Please try again…" after a sign-in that itself succeeds | reproduced 2026-10-12 against a 0074-state database: sign-in HTTP 200, first authenticated request HTTP 500, server log `column role_assignments.global_scope does not exist`, SQLSTATE 42703 |
| Migration believed pending | `0075_noelia_authority_execution_hardening` (journal idx 75) | `drizzle/meta/_journal.json` |

> The line between *verified now* and *previously reported* matters. Anything not re-read in the run that produces a report must be labelled as reported, not verified.

---

## 3. The gates

| # | Gate | Read-only? | Authoriser | Precondition | Evidence that closes it |
| --- | --- | --- | --- | --- | --- |
| **1** | Actions billing restored | n/a | **Account/billing owner** | — | A dispatched smoke test that actually starts (Gate 2) |
| **2** | Harmless Actions smoke test | **yes** | Release engineer (no authorisation needed) | Gate 1 | Run created · job started · `steps > 0` · run success · no secrets in logs |
| **3** | Read-only production preflight + backup/PITR check | **yes** | Release engineer (no authorisation needed) | Gates 1–2 + `BEYU_ADMIN_DATABASE_URL` configured | Preflight artifact quoting applied head, pending list, checksum result, destructive scan, fingerprint; Supabase backup/PITR window confirmed |
| **4** | **Human authorisation of the migration** | n/a | **Accountable owner** (not the release engineer) | Gate 3 clean | Written approval naming the release SHA, migration head, and pending list |
| **5** | Governed database release | **NO — mutating** | Executes only under Gate 4 | Gate 4 | Deploy job succeeded; verification job green; ledger head = expected |
| **6** | Post-release verification | **yes** | Release engineer | Gate 5 | `scripts/verify-production-recovery.mts` output + manual authenticated checks |
| **7** | **Human authorisation of Production configuration change** | n/a | **Accountable owner** | Gate 6 | Written approval for the specific variable and value |
| **8** | Apply `BEYU_CANONICAL_DOMAIN` + restart/deploy | **NO — config mutation** | Executes only under Gate 7 | Gate 7 | Variable present in the Production scope; fresh instance; nine-host classification verified |
| **9** | Final recovery sign-off | n/a | Accountable owner | Gates 1–8 | Signed status table with PASS/FAIL/BLOCKED/NOT RUN/UNKNOWN per check |

---

## 4. Gate detail

### Gate 1 — Actions billing restored (account owner)

Owner action in **Settings → Billing & plans**. This runbook cannot detect that billing is fixed by inspecting configuration; the only proof is a job that starts. Do **not** dispatch repeatedly while blocked — each dispatch creates another failed, zero-step run.

### Gate 2 — Harmless smoke test (first action after Gate 1)

**Use this workflow** — verified from its YAML: dispatch-only, **zero secrets**, `permissions: contents: read`, `timeout-minutes: 10`, five explicit steps, no Production environment, and no path to `db-release` deploy mode:

```
gh workflow run tls-chain-capture.yml            # defaults are safe
gh run watch "$(gh run list --workflow=tls-chain-capture.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
```

* name: `BEYU OS — TLS chain capture (read-only, no credentials)` (file `.github/workflows/tls-chain-capture.yml`)
* inputs (optional): `host` (default `aws-0-eu-west-3.pooler.supabase.com`), `port` (default `6543`), `also_port` (default `5432`)
* what it proves: Actions can start · checkout + Node 22/24 run · a real command produces output · an artifact uploads
* **Smoke PASS requires all of:** the run exists, the job starts, `steps > 0`, steps succeed, the run concludes successfully, and the log contains no secret material.

**Do not use as a smoke test:**
* `tls-trust-evidence.yml` — it **commits and pushes** the captured evidence back to the ref it runs on (`git push origin "HEAD:${GITHUB_REF_NAME}"`). Dispatched on `main` that would write to the default branch without review. A fail-closed guard now refuses `GITHUB_REF_NAME=main`, but the correct choice for a smoke test remains `tls-chain-capture.yml`.
* `runtime-dsn-diagnostic.yml` — requires `BEYU_ADMIN_DATABASE_URL` **and** `BEYU_RUNTIME_DB_PASSWORD`; use it only after Gate 3, deliberately, and never as the first probe.
* `ci.yml` — harmless (no secrets, no environment) but the full security gate, up to 60 minutes. It is the correct *second* action when the release evidence needs the whole gate, not the smoke test.

### Gate 3 — Read-only production preflight + backup check

The read-only path is the **`mode=preflight`** dispatch of the governed release workflow. Verified from `db-release.yml`:

* input name: **`mode`**, choices `preflight | deploy | drift`, **default `preflight`**
* `mode=preflight` runs exactly two jobs: `Migration validation (scratch PostgreSQL 16)` then `Production preflight (read-only)`. `deploy`, `runtime-verify`, `release-record`, `pvg` are gated on `mode == 'deploy'`; `drift-report` is gated on `schedule` or `mode == 'drift'` — so **a preflight dispatch cannot reach a mutating job**.
* the preflight executes `npx tsx scripts/db-release.ts preflight`, which contains **no write statement of any kind** (reads only: applied ledger, pending migrations, checksums, catalog/RLS/role/function inspection, destructive-statement scan of pending SQL).
* it needs the repository secret `BEYU_ADMIN_DATABASE_URL` (environment scope `Production`), and fails closed if it is absent.

```
gh workflow run db-release.yml -f mode=preflight
gh run list --workflow=db-release.yml --limit 3
```

**The preflight artifact is the only acceptable source for the live database state.** It must state: applied head · pending migrations · checksum mismatches · destructive-statement findings · schema fingerprint · RLS/role findings · `failures[]`.

**Backup/PITR (same gate, human, read-only):** confirm in the Supabase project that a backup/PITR point exists *and* is recent enough to cover the release window. Record the timestamp as evidence. Do not proceed without it.

**Stop conditions at Gate 3:** any `failures[]` entry · unexpected migrations · checksum mismatch · destructive pending SQL against a non-empty schema without explicit approval · unknown/ambiguous state · absent backup evidence.

### Gate 4 — Human authorisation of the migration

Requires the Gate 3 artifact plus the release packet (§5). The approver is the **accountable owner**, not the person who runs the release. Approval must name: release SHA, migration head expected, pending list, rollback position (Supabase PITR), and the exact command to be run.

### Gate 5 — Governed database release (mutating)

```
gh workflow run db-release.yml -f mode=deploy
```

Only this path may change the production database. It runs in `environment: Production` (approval protection, if configured) with concurrency `db-release-production-deploy`, and executes in order: secrets guard → `npm run migrate` (per-migration transaction, advisory lock, checksummed ledger) → runtime-role provisioning → governed-mutation-role provisioning → verification. **Never** apply SQL by hand; never bypass the guard; never mark the job optional.

### Gate 6 — Post-release verification (read-only)

```
npx tsx scripts/verify-production-recovery.mts --base-url https://beyu.co.tz
npx tsx scripts/verify-production-recovery.mts --list          # show the plan without any request
```

The script is GET-only and dependency-free. It checks: `/api/health` (DB UP) · `/api/health/identity` (release tuple; note the migration field is a **build literal**) · `/api/health/schema` (`CURRENT` + expected migration, or BLOCKED if the deployed build predates the endpoint) · the nine canonical host entries · anonymous deep links (`/os`, `/os/finance`, `/os/health`, `/os/foundation`, `/os/noelia` must redirect or deny, never serve) · a failure-signature scan of every body (`could not load this view`, `42703`, `global_scope does not exist`).

**NOT RUN by the script — separate authorisation required:**

1. synthetic entitled sign-in and destination load (needs a synthetic account);
2. `CAP_POSTING` posting attempt (must return `423 CAPABILITY_LOCKED`; it is a mutation *attempt*, so it needs authorisation);
3. live tenant-isolation / RLS probes;
4. Health OS identity-link verification (`beyu_identity.beyu_identity_links`) — creating a link is production data, never a side effect of verification.

### Gate 7 — Human authorisation of the Production configuration change

Written approval for one specific change: **`BEYU_CANONICAL_DOMAIN`** in the **Production** scope only.

### Gate 8 — Apply the configuration (mutating)

Value: **`beyu.co.tz`** (lowercase; no scheme, port, trailing dot or wildcard). The variable is read **per request at runtime** — it is not embedded at build time — so a *running* instance does not pick it up until a fresh deployment or instance restart. **Restart/redeploy is required.**

**Do not add `BEYU_SESSION_COOKIE_DOMAIN`.** No cross-subdomain SSO requirement has been approved, and the measured session cookie is deliberately host-only (`Path=/; Secure; HttpOnly; SameSite=lax`, no `Domain`), which is correct with the apex → `www` 308.

Verification after propagation: each of the nine hosts selects its own experience; unknown hosts and spoofed `X-Forwarded-Host` still fall back to the control plane; apex → `www` still 308; the cookie is still host-only; a hostname still grants nothing.

### Gate 9 — Final sign-off

Publish the status table (Gate → status → evidence link) with the vocabulary from §1. **UNKNOWN is not a pass.**

---

## 5. Release packet (Gate 4 input)

Template — fill from the Gate 3 artifact, never from memory:

```text
Release packet — BEYU OS production database release
  Prepared by / date:
  Current main SHA:                 <sha>
  Proposed release SHA / PRs:       <sha> · PRs <#…>
  Repo-side migration validation:   <run id> · <PASS/FAIL>
  Live applied head (preflight):    <version>            ← from db-live-preflight artifact
  Pending migrations:               <list>
  Checksum mismatches:              <none/list>
  Destructive findings:             <none/list + approval reference>
  Schema fingerprint (before):      <hex>
  Backup/PITR evidence:             <timestamp + where verified>
  Runtime/governance role state:    <from preflight>
  Expected impact / downtime:       <assessment>
  Recovery position:                Supabase PITR to <timestamp>
  Checks passed / failed / skipped: <counts, honestly>
  Blocked checks:                   <list, with the exact missing prerequisite>
  Exact command to execute:         gh workflow run db-release.yml -f mode=deploy
  Authorisation:                    PENDING — <accountable owner> must approve in writing
```

Local, disposable-database validation of the same chain (evidence for the packet, no production access):

```bash
npm run pg16:start
BEYU_ALLOW_LOCAL_PLAINTEXT_DB=1 \
BEYU_ADMIN_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/beyu_chaincheck \
  npx tsx scripts/migrate.ts            # applies the full journal to a throwaway database
  # expect: ok:true · 76 ledger rows · head 0075_noelia_authority_execution_hardening
  # re-run: applies nothing (identical fingerprint)
BEYU_ADMIN_DATABASE_URL=…beyu_chaincheck npx tsx scripts/db-release.ts preflight
  # expect: ok:true · failures:[] · destructivePending:[]
```

---

## 6. Stop conditions (any one stops the runbook)

1. Billing still blocked → stop at Gate 1; do not dispatch repeatedly.
2. A job starts but its steps fail → treat as FAIL, not as a billing artifact.
3. Preflight reports any `failures[]`, checksum mismatch, unexpected migration or destructive pending SQL without explicit written approval.
4. Backup/PITR evidence cannot be produced.
5. The live head is ambiguous, or conflicts with the expected pending list.
6. The required secret names are absent (report names only — **never values**).
7. Any step in this runbook would need a production mutation that the current gate has not authorised.
8. Anything would require weakening a control: RLS, RBAC/ABAC, the secrets guard, `CAP_POSTING` (stays **locked and fail-closed**), or branch protection.

---

## 7. Local validation already performed (2026-10-12, disposable environment)

Recorded here so the post-billing run does not repeat it needlessly. All ran against a **disposable local PostgreSQL 16** — no production credential was used, and none of these are production evidence.

| Check | Command | Result |
| --- | --- | --- |
| Full migration chain on an empty database | `npx tsx scripts/migrate.ts` | **PASS** — 76 rows, head `0075_noelia_authority_execution_hardening`, `global_scope` present (`boolean NOT NULL DEFAULT false`) |
| Idempotency | re-run `migrate.ts` | **PASS** — applies nothing, fingerprint unchanged |
| Release preflight path | `npx tsx scripts/db-release.ts preflight` | **PASS** — `ok:true`, `pending:0`, `destructivePending:[]`, `failures:[]` |
| Migration inventory reconciliation | `npx tsx scripts/migration/integrity.ts` (+`--with-ledger`) | **PASS** |
| Expand/Contract safety | `npx tsx scripts/migration/expand-contract.ts` | **PASS** — 76 migrations, 75 EXPAND / 1 CONTRACT |
| Drift-gate self-test | `npx tsx scripts/migration/gate-selftest.ts` | **PASS** — 8/8 cases (valid passes; drift/collision/orphan fail) |
| Schema drift (migrations ↔ `src/db/schema`) | `npx tsx scripts/migration/schema-drift.ts` | **PASS** |
| Typecheck / lint / build | `npm run typecheck` · `npm run lint` · `npm run build` | **PASS** (lint: 0 errors, 1 pre-existing warning) |
| Workflow YAML validity | parse all five workflows | **PASS** — 5/5 parse; all triggered only as designed |
| Verification script | `npx tsx scripts/verify-production-recovery.mts --base-url http://127.0.0.1:3100` | **PASS** — 9 checks green against a local server |

CI (`ci.yml`, `db-release.yml`) at the same commit: **BLOCKED — zero steps executed.** No CI result may be inferred from these local runs.

---

## 8. Must-not-do list

* No push to `main`; no merge or auto-merge of PR #106 / PR #103 without human review.
* No production migration outside `db-release.yml mode=deploy`; no manual SQL.
* No secret value read, printed, copied or rotated by a non-owner; no placeholder secrets.
* No production environment-variable change without Gate 7.
* No weakening of RLS, RBAC/ABAC, MFA, audit, tenant boundaries or `CAP_POSTING` (locked, fail-closed).
* No DNS/TLS/domain change; the apex → `www` 308 stays.
* No fabricated evidence: a skipped check is SKIPPED, a blocked job is BLOCKED, and neither is a pass.
