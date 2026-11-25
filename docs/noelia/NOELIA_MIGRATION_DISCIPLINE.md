# NOELIA — Migration Execution Discipline (and the defect that made it necessary)

**Status:** IMPLEMENTED (contract enforced by test)
**Migration:** `drizzle/0085_noelia_cognitive_core_grants_and_golden_cases_rls.sql`
**Privilege source:** `scripts/runtime-privilege-allowlist.ts` (the canonical control)
**Reconciler:** `scripts/setup-db-role.ts` (run by CI)
**Test:** `tests/noelia/cognitive-migration-contract.test.ts` (5 tests)

---

## 1. What went wrong

This is a record of a real defect found in this workstream, because a defect that is
only fixed and not written down tends to come back.

Migration `0084_noelia_cognitive_core.sql` was authored as one long DDL file and
contained **no `--> statement-breakpoint` markers**. The canonical migrator
(`scripts/migrate.ts`) does this:

```ts
for (const statement of splitStatements(sql)) await client.query(statement);
// where splitStatements() splits ONLY on "--> statement-breakpoint"
```

So the entire 417-line file was handed to PostgreSQL as **one** string. The `pg`
simple-query protocol executes the first statement and ignores the rest of the
batch. Only `create table if not exists noelia_kg_edges (...)` ran. Then the
migrator recorded the migration as `APPLIED` and moved on.

**Nothing failed. Nothing warned.** That is what makes this class of defect
dangerous: the migration looks applied, the tables later appeared (created by the
schema push for the Drizzle definitions), and the gap was invisible until the
application tried to use the tables.

---

## 2. What was actually missing

| Intended by 0084 | Actually applied | Consequence |
|---|---|---|
| `create table` for 7 tables | 1 of 7 | Remaining tables created later by schema tooling, without constraints |
| CHECK constraints | **none** | Illegal epistemic states were representable in the database |
| RLS policies on 6 tenant tables | **none** | Tenant isolation relied on application code alone |
| RLS on `noelia_golden_cases` | **none** | Evaluation benchmarks and adversarial probes were world-readable |
| `grant … to beyu_runtime` (7 tables) | **none** | The runtime role held **no privilege** on any of the new tables |

The last row is the one that would have shipped as a broken feature. Verified
before repair:

```
noelia_decision_records   SEL -  INS -  UPD -      <- Command Centre reads this
noelia_council_sessions   SEL -  INS -  UPD -      <- Council endpoint reads this
noelia_simulations        SEL -  INS -  UPD -
noelia_golden_cases       SEL -  INS -  UPD -
```

The Command Centre therefore reported **0 recorded decisions** while 15 rows
existed. It did not error — it rendered a confident, wrong, empty state. In an
institution whose stated value is Care, a system that quietly reports "nothing
has ever been decided" is worse than one that fails loudly.

---

## 3. The repair

`0085` is additive and idempotent. It does four things:

1. **Re-asserts RLS** (enabled *and* forced) with drop-then-create policies
   against the canonical `beyu_tenant_ids()` helper — the same helper every other
   NOELIA table uses, so no parallel isolation model is introduced.
2. **Puts `noelia_golden_cases` under RLS for the first time.** It is
   intentionally *global* rather than tenant-scoped (a benchmark is not
   institutional data), so it is gated instead on a resolved tenant context: an
   unscoped connection sees nothing.

`0084` itself was **not edited**. Its checksum is the evidence that it ran, and a
forward migration that changes after being applied would break every existing
environment.

---

## 4. Verification (executed, not asserted)

Ran the canonical reconciliation (`npx tsx scripts/setup-db-role.ts`), then verified
as the real non-superuser runtime role. `npx tsx scripts/audit-runtime-privileges.ts`
reports `violations: 0`.

| Check | Result |
|---|---|
| `beyu_runtime` SELECT/INSERT/UPDATE on the 6 operational tables | granted |
| `beyu_runtime` DELETE on any of them | **denied** |
| RLS enabled AND forced on all 7 tables | yes |
| Policies per table | 2 (read + write) |
| Unscoped connection reading `noelia_decision_records` | **0 rows** |
| `TEN_BEYU_GROUP` context reading decisions | 15 rows (10 EFFECTIVE, 5 SUPERSEDED) |
| `TEN_BEYU_HEALTH` context reading the same table | **0 rows** |
| Command Centre "Recorded decisions" metric | now reads the real table |

The Command Centre value is **5**, not 10, and that is correct: the summary
counts *root* decisions (`supersedes_id is null`), so a decision that superseded
another is counted once, through its current head. Verified against the database:
5 EFFECTIVE roots, 5 EFFECTIVE non-roots, 5 SUPERSEDED roots.

---

## 4A. The second, deeper defect: privilege is NOT granted by migration

The repair above was still wrong the first time, and the full suite proved it.

The first version of `0085` contained seven `grant ... to beyu_runtime` statements.
Those grants worked when `0085` was applied, and the isolated test file passed. But
the repository does not grant runtime privilege from migrations at all. It uses a
**reconciliation script with a reviewed allowlist**:

```
scripts/setup-db-role.ts          ← run in CI (`.github/workflows/ci.yml`)
scripts/runtime-privilege-allowlist.ts   ← the single source of truth
```

`setup-db-role.ts` enumerates every table in `public` and, for each one:

```sql
revoke all privileges on table public.<t> from beyu_runtime;
-- then re-grant ONLY what the allowlist permits
```

A table absent from the allowlist receives nothing. So:

- applying `0085` granted the privileges;
- the moment anything else ran the reconciliation, they were revoked;
- the app then failed with `permission denied for table noelia_decision_records`
  (SQLSTATE 42501).

That is why the failure was **intermittent** and only appeared in the full run: the
isolated suite ran before any reconciliation, the combined run did not.

**The correct fix** was to classify the seven tables in the allowlist, not to grant
them in SQL:

| Table | Allowlist category | Resulting privilege |
|---|---|---|
| `noelia_kg_edges` | `TABLE_ALLOWLIST` + `NO_DELETE` | SELECT, INSERT, UPDATE |
| `noelia_decision_records` | `TABLE_ALLOWLIST` + `NO_DELETE` | SELECT, INSERT, UPDATE |
| `noelia_council_sessions` | `TABLE_ALLOWLIST` + `NO_DELETE` | SELECT, INSERT, UPDATE |
| `noelia_council_findings` | `TABLE_ALLOWLIST` + `NO_DELETE` | SELECT, INSERT, UPDATE |
| `noelia_learning_records` | `TABLE_ALLOWLIST` + `NO_DELETE` | SELECT, INSERT, UPDATE |
| `noelia_simulations` | `TABLE_ALLOWLIST` + `INSERT_ONLY` | SELECT, INSERT |
| `noelia_golden_cases` | `TABLE_ALLOWLIST` + `READ_ONLY` | SELECT |

**No DELETE anywhere.** Institutional records are superseded, never destroyed — the
same rule already applied to `noelia_workflows` and `noelia_evidence`. Golden cases
are READ-ONLY to the runtime role for a specific reason: they hold the benchmarks and
the adversarial probes, so a runtime that could write them could weaken its own test.

`0085` now contains **no GRANT statements at all**; it explains why granting by
migration is the wrong mechanism and points at the allowlist. Verified with the
repository's own auditor:

```
npx tsx scripts/setup-db-role.ts        # reconcile
npx tsx scripts/audit-runtime-privileges.ts  → violations: 0
```

## 5. The durable fix

Fixing the instance is not enough — the same mistake is easy to repeat. Two
things now prevent it:

### 5.1 A machine-checked contract

`tests/noelia/cognitive-migration-contract.test.ts` asserts:

1. **Every migration numbered 0085 or later is statement-split.** A fragment
   containing more than one top-level statement fails the build. (Dollar-quoted
   `DO $$ … $$` blocks are collapsed first, because their inner semicolons are
   PL/pgSQL, not batch separators.)
2. **`0085` exists** as the sanctioned repair.
3. **The runtime role has exactly the intended privileges** on all seven tables,
   and **no `DELETE`** on any of them.
4. **Every cognitive table has RLS enabled and forced, with at least one policy.**
   RLS enabled with *zero* policies is also a failure — that configuration denies
   everything, which is a dead feature rather than a protected one.
5. **An unscoped runtime connection cannot read institutional decision memory.**

### 5.2 A scoping decision, documented

The contract deliberately does **not** audit the 60+ historical migrations. A
broad version of this test was written first and produced **46 false positives**:
most earlier files are legitimate multi-statement batches that `pg` executes in a
single simple-query call. A test that cries wolf 46 times is worse than no test,
so the contract starts at 0085 and says why.

---

## 5A. The third defect: `SET NOT NULL` is a contraction

Found by the full suite, twice — once as a failure, once as a near-miss.

### What happened

Migration `0086` added three cost-governance columns to `model_registry`. The first version added
them **nullable**, backfilled existing rows, then ran `ALTER COLUMN … SET NOT NULL`. That is the
textbook expand-then-contract pattern and it is what most migration guidance recommends.

`tests/migration/expand-contract.test.ts` rejected it:

```
expected [ '0001_kernel_gate1_hardening', …(1) ] to deeply equal [ '0001_kernel_gate1_hardening' ]
+   "0086_zero_cost_model_policy_and_local_embeddings"
```

BEYU permits **exactly one contraction in the entire history** (0001) and classifies
`SET NOT NULL` as one. The rule is not bureaucracy: tightening a live column can fail on existing
data or take an `ACCESS EXCLUSIVE` lock in production. An expand-only history is what makes
rollback and zero-downtime deploys possible, so the gate is enforcing a property the deployment
strategy depends on.

The gate was right and the migration was wrong — even though the *end state* was correct.

### Why `SET NOT NULL` looked safe and still was not

The reasoning that produced the bad version was sound in isolation: the table is populated, the
backfill runs first, so the `NOT NULL` will succeed. All true. But it is true *here*, on this
database, at this moment — and a migration is not a statement about one database. The rule holds
because the reasoning that justified the exception does not generalise.

This is worth stating plainly because it is the failure mode that produces unsafe migrations from
careful people: each step is locally justified, and the aggregate breaks a global invariant.

### The correct form

Add the column already constrained:

```sql
ALTER TABLE "model_registry"
  ADD COLUMN IF NOT EXISTS "cost_class" text NOT NULL DEFAULT 'UNKNOWN';
```

PostgreSQL backfills existing rows from the default, so no row is ever observable with a NULL
cost. The end state is identical — `NOT NULL` with a fail-closed default — but reached by an
**EXPAND**, with no window in which a writer could insert a NULL.

```
0086 | EXPAND | - | CREATE_TABLE,ADD_COLUMN,CREATE_INDEX,ADD_CONSTRAINT,CREATE_POLICY,ENABLE_RLS
87 migrations · 86 EXPAND · 1 CONTRACT · registered destructive: 0001_kernel_gate1_hardening
EXPAND/CONTRACT SAFETY PASSED.
```

### The near-miss, which matters more

After rewriting the migration, my verification probe reported that **PAID and TRIAL were now
accepted by the database** — apparently a serious regression in the zero-cost gate. It was not.
The probe omitted `approval_status`, so every insert failed on an unrelated `NOT NULL` column
(`23502`) and each failure was printed as "ACCEPTED" because the probe only caught rows that were
successfully written.

Two lessons, both recorded because both are general:

1. **A probe that fails for the wrong reason reads as a pass.** The probe must assert *which*
   error occurred, not merely that one did. The corrected probe checks `23514` specifically.
2. **A constraint on "executable" rows does not fire on a row that is not executable.** The gate
   keys on `approval_status = 'APPROVED' AND status = 'ACTIVE'`, so a probe must establish
   executability first. `tests/noelia/zero-cost-migration-contract.test.ts` now covers both
   directions: a paid *executable* model is refused, and a paid *non-executable* model is
   recordable — because refusing to record one would make an honest inventory impossible.

---

## 5C. The fourth defect: an "optional" extension that was not optional

### Symptom

PR CI failed in two independent jobs, both on the migrate step against a **fresh**
PostgreSQL 16:

```
Migration validation (scratch PostgreSQL 16)   → Apply canonical root migrations … fail
BEYU OS — PostgreSQL-backed security gate      → Apply canonical root migrations 0000-0086  fail
```

Both passed on `main` (84 migrations) and fail only with the three this branch adds.

### The reproduction that wasted the most time

The failure did not reproduce locally. Nine separate clean-database installs succeeded, including
one run with `.env` removed to match CI exactly. That was misleading for two reasons:

1. **`dotenv/config` overrides the shell.** `scripts/migrate.ts` begins with
   `import "dotenv/config"`, and the local `.env` defines `BEYU_ADMIN_DATABASE_URL`. Exporting a
   different URL in the shell had no effect: the migration silently ran against the development
   database and reported success. My first three "clean install" tests were therefore re-running
   against a database that already had everything. The `.env` had to be moved aside before the
   variable took effect.
2. **The local cluster has privileges CI's role does not.** Even a genuinely empty database
   succeeded locally, because the local `postgres` superuser can create extensions. That hid the
   real condition.

### Root cause

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "knowledge_sources_title_trgm_idx"
  ON "knowledge_sources" USING gin ("title" gin_trgm_ops);
```

`pg_trgm` is a **contrib** extension, not core PostgreSQL. Where contrib is absent, or the
migrating role lacks the privilege to install it, these statements raise `42704` or `42501` and
**abort the entire migration run**. The migration's own comment claimed the retrieval layer
"degrades to full-text + vector without it" — but the code contradicted the comment: it would not
degrade, it would abort with `noelia_knowledge_embeddings` already created in a rolled-back
transaction and nothing recorded.

That is the wrong failure mode. Losing fuzzy matching should cost **the fuzzy channel**, not the
whole schema.

### Proof, before and after

Same role (no `CREATE` on the database), same database:

```
--- OLD form (bare extension + index) ---
old form: FAILED -> 42501
--- NEW form (guarded DO block) ---
new form: SUCCEEDED
```

`42501` is `insufficient_privilege`. The old form aborts the migration; the new form completes it
and skips only the index.

### Fix

A `DO` block that installs the extension and index when possible and records a notice when not:

```sql
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXCEPTION WHEN insufficient_privilege OR undefined_file OR feature_not_supported THEN
    RAISE NOTICE 'pg_trgm unavailable (%). Fuzzy title matching will be skipped; …', SQLERRM;
    RETURN;
  END;
  BEGIN
    CREATE INDEX IF NOT EXISTS "knowledge_sources_title_trgm_idx"
      ON "knowledge_sources" USING gin ("title" gin_trgm_ops);
  EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'gin_trgm_ops opclass unavailable; trigram index skipped.';
  END;
END
$$;
```

The block cannot fail. An absent trigram index is a loss of the extra recall channel, not of
correctness, and nothing in the security or cost posture depends on it.

Verified after the change: `0086 | EXPAND` (still expand-only), fresh install succeeds with the
extension and index present, and **143/143** across `tests/migration/`,
`zero-cost-migration-contract.test.ts` and `schema-state.test.ts`. Migration integrity 0 blocking,
expand/contract passed, schema drift 0 blocking.

### The rule this adds

> **A migration statement that depends on an optional component must be guarded, or it is not
> optional.** "The code degrades without it" is a claim about the code; the migration has to
> actually let the database reach that state. Test the *absent* case, not only the happy path —
> and test it as a role that lacks the privilege, because a superuser cannot reveal the bug.

Two related lessons, both earned here:

> **`dotenv/config` beats the shell.** An environment variable that the repo's `.env` also defines
> may never reach the process. When reproducing CI locally, move `.env` aside rather than trusting
> an exported variable.

> **A local superuser is not evidence about CI's role.** Every privilege-sensitive migration must
> be exercised as a constrained role, or its privilege assumptions are untested.

---

## 5D. The fifth defect — and the one that actually broke CI: a bare `GRANT` to a role that does not exist yet

This is the defect the previous four were mistaken for. It is recorded in full
because the *misdiagnosis* is the instructive part.

### Symptom

Both PostgreSQL CI jobs failed at the migration step, identically, on a scratch
database that was completely empty:

```
migration: ROLE_NOT_FOUND (SQLSTATE 42704)
```

`main` was green; the branch was not. The failure was 100% reproducible in CI and
0% reproducible locally.

### The falsified hypothesis, stated plainly

The first diagnosis was `pg_trgm` — §5C above. `0086` created the extension
unguarded; a build without contrib, or a role without `CREATE` on the database,
raises `42704`/`42501`. That defect was real, the guard was correct, and the
before/after proof (`42501` → success) was sound.

**It was not the cause.** After the guard was committed and CI re-ran, the error
was byte-identical. A fix that does not change the outcome has not fixed the
cause, whatever else it may have repaired. The guard was kept because it is
independently correct; the hypothesis was abandoned because it was refuted.

### Root cause

Seven lowercase statements at the end of `0084_noelia_cognitive_core.sql`:

```sql
grant select, insert, update on noelia_kg_edges to beyu_runtime;
grant select, insert, update on noelia_decision_records to beyu_runtime;
grant select, insert, update on noelia_council_sessions to beyu_runtime;
grant select, insert, update on noelia_council_findings to beyu_runtime;
grant select, insert on noelia_simulations to beyu_runtime;
grant select on noelia_golden_cases to beyu_runtime;
grant select, insert, update on noelia_learning_records to beyu_runtime;
```

PostgreSQL resolves the grantee name to a role OID, so the role must exist. On a
clean install it does not: the pipeline provisions `beyu_runtime` in a **later
step** (`ci.yml`, "Provision non-superuser runtime role", which runs *after*
"Apply canonical root migrations"). The `GRANT` therefore raises `42704` and
aborts 0084 — and with it all of 0085 and 0086, because each migration is a
single transaction inside one advisory-locked run.

### Why it never reproduced locally

`scripts/setup-db-role.ts` had been run against the local cluster at some point in
the past. `beyu_runtime` and `beyu_governance` therefore existed as cluster
objects, and every bare `GRANT` found its grantee. **The local database was in a
privileged state that CI's fresh container never is.** Reproducing the CI failure
required renaming the roles away (`ALTER ROLE ... RENAME TO ...`), at which point
the failure appeared immediately and identically:

```
>>> FAILING MIGRATION 0084_noelia_cognitive_core : 42704 role "beyu_runtime" does not exist
```

### Why four earlier greps missed it

Every prior search used uppercase patterns — `GRANT`, `TO\s+beyu_`, `OWNER TO`,
`CREATE ROLE`. The statements are **lowercase**, and the repository is not
uniform about it: 0030–0047 write `GRANT` inside a `DO` block, 0084 wrote
`grant`. A case-sensitive scan of a case-insensitive language is not a scan.
After the fix, the search that finds the real thing is case-insensitive and
covers `has_*_privilege`, `pg_has_role` and `::regrole` as well — all three raise
`42704` for an absent role, and all three hide behind a name that a `GRANT`-only
grep will never see.

### The fix

Mirror the shape the whole repository already uses (0030, 0031, 0034–0047): loop
over `pg_roles` so an absent role yields **zero iterations** rather than an
error.

```sql
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %s TO %I',
      'noelia_kg_edges, noelia_decision_records, noelia_council_sessions, noelia_council_findings, noelia_learning_records',
      r.rolname);
    EXECUTE format('GRANT SELECT, INSERT ON %s TO %I', 'noelia_simulations', r.rolname);
    EXECUTE format('GRANT SELECT ON %s TO %I', 'noelia_golden_cases', r.rolname);
  END LOOP;
END
$$;
```

These grants were also **redundant**. All seven tables are in
`RUNTIME_TABLE_ALLOWLIST` in `scripts/runtime-privilege-allowlist.ts`, and
`setup-db-role.ts` reconciles privileges across the entire catalog by allowlist.
Verified after provisioning: the seven tables land on exactly the intended
matrix — `SELECT/INSERT/UPDATE` on the five writable tables, `SELECT/INSERT` on
`noelia_simulations`, `SELECT` only on `noelia_golden_cases`. The migration-local
grants duplicated that reconciliation while making the migration dependent on a
role created later. The guarded form preserves intent without the ordering
hazard.

### Proof

| Scenario | Before | After |
| --- | --- | --- |
| Clean install, roles absent (CI's exact condition) | `42704 role "beyu_runtime" does not exist` | **exit 0 — 494 tables, 87 APPLIED** |
| Clean install, then `setup-db-role.ts` | n/a (migration never completed) | seven tables at the intended privilege matrix |

A regression test now scans **every** migration for a named application role
outside a `pg_roles` guard, case-insensitively, across `grant`, `revoke`,
`alter default privileges`, `has_*_privilege`, `pg_has_role` and `::regrole`. It
was verified to **fail** against the original lowercase `GRANT` lines and to pass
against the fix — a guard that has never been seen to fail is not a guard.

### The rules earned here

> **Search case-insensitively, or search twice.** SQL keywords have no case. A grep
> that assumes uppercase conventions will silently miss a lowercase statement, and
> the miss looks exactly like a clean result.

> **A green local run is a statement about your local cluster.** Before concluding
> "cannot reproduce", make the local environment *worse* than CI's — rename the
> roles away, revoke the privilege, drop the extension. If it still passes, the
> code is robust. If it fails, you have your reproduction.

> **Never `GRANT` to a role a migration does not create.** A migration may only
> depend on what it creates, on what PostgreSQL ships, or on an object it has
> proven present. Everything else is an ordering assumption that a fresh
> container will eventually punish.

> **A fix that changes nothing about the symptom is a different fix.** Keep it if
> it is independently correct, but reopen the diagnosis. The `pg_trgm` guard was
> right and irrelevant, and treating "I fixed something" as "I fixed this" cost a
> full CI cycle.

---

## 6. What this episode says about the wider work

Three lessons, each now reflected in the codebase:

- **"Migration applied" is not "migration effective."** The journal records that
  a file was read, not that its intent reached the database.
- **A silent empty state is a correctness bug, not a cosmetic one.** The Command
  Centre's empty-state discipline is right, but an empty state must be
  *distinguishable* from a permission failure. That is why
  `decision-memory` returns an explicit `whatIsMissing` rather than an empty
  object.
- **Verify at the boundary you claim.** The isolation claim is only true if it is
  tested as the real non-superuser role with a real tenant context — not as
  `postgres`, which bypasses RLS entirely and will happily report success for a
  policy that does not exist.
