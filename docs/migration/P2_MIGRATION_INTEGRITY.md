# P2 — Migration Integrity, Drift Model & Expand/Contract Enforcement

Date: 2026-09-18
Starting `main`: `ae09d538e4acd5bba4769bfa8bb36f636a350094`
Status: **IMPLEMENTED** — with one deliberate stop at a release-governance boundary (§8)

Every claim below was measured this session against the repository and a real
PostgreSQL 16.14. Where a claim is a measurement, the command that produced it is
named so it can be re-run.

---

## 1. Authoritative reconciliation matrix

Five sources, measured independently.

| # | SOURCE | EXPECTED | ACTUAL | IDENTITY / RANGE | CHECKSUM STATE | MISSING | EXTRA | CONFLICT | AUTHORITY |
|---|---|---|---|---|---|---|---|---|---|
| **A** | SQL migration files `drizzle/*.sql` | 46 | **46** | `0000`–`0045`, contiguous, no duplicates | sha256 per file, stable | none | none | none | **PRODUCTION AUTHORITY** |
| **B** | Drizzle journal `meta/_journal.json` | 46 | **40** | `0000`–`0039`, contiguous, no gaps | n/a (no checksums) | `0040`–`0045` (6) | none | vs A | design-time |
| **C** | Drizzle snapshots `meta/*_snapshot.json` | 46 | **37** | `0000`–`0039` minus `0018`,`0021`,`0029` | `0038`≡`0039` (sha256 `e959b8f0…`) | `0018`,`0021`,`0029`,`0040`–`0045` (9) | none | `0038`/`0039` collide | design-time |
| **D** | PostgreSQL ledger `beyu_migrations` | 46 | **46** | all `mode='APPLIED'` | **0 mismatches, 0 missing, 0 unexpected** | none | none | none | **PRODUCTION AUTHORITY** |
| **E** | Release/provenance records | — | **29 tags / 20 commits** | `db-release-*`, 2026-09-08 → 2026-09-18 | latest attests 45 SQL, byte-identical to `ae09d53` | none | none | none | **PRODUCTION PROVENANCE** |

### The authority distinction (load-bearing)

**PRODUCTION MIGRATION AUTHORITY** is `drizzle/*.sql` **+** `beyu_migrations`,
attested by the `db-release-*` provenance tags. That chain is complete and
consistent: A ↔ D ↔ E agree exactly.

**DRIZZLE DESIGN-TIME METADATA** (B, C) is scaffolding for `drizzle-kit generate`.
It is **not authoritative merely because it exists**. Verified: there is no
`drizzle-orm/…/migrator` import anywhere in the repository, `scripts/migrate.ts`
never reads `drizzle/meta`, and neither do `db-release.ts`, `dr-drill.ts` or
`certify-production.mts`.

B and C are behind A. **That is metadata drift, not production drift.** §4 makes
the distinction structural rather than a matter of opinion.

## 2. Root cause — proven from git history and file contents

The repository clone was shallow at depth 1 (`.git/shallow` = `ae09d53`), so
history was deepened (`git fetch --deepen=200` → 357 commits, no longer shallow)
before drawing any conclusion from it.

**Why `0038`/`0039` collide.** The two snapshot files are byte-identical: same
sha256 `e959b8f06545379599…`, same `id` `c424f097-adc1-4e4c-b13b-e143565249d5`,
same `prevId`. Two snapshots claiming one identity and one parent is exactly what
drizzle-kit reports as a collision.

**Whether `0039` metadata was copied manually — yes, and the practice is
documented in the repository's own history.** Commit `6e9f30b` (2026-09-07),
*"fix(migrations): fresh-install-safe 0031 agriculture grant + repair drizzle
metadata chain"*, states in its message:

> "drizzle metadata only tracked migrations 0000-0029 even though the repo carries
> 0000-0032, so 'drizzle-kit generate' always reported phantom schema drift and the
> CI no-drift gate could never pass. **Rebuilt drizzle/meta with chained snapshots
> for 0030/0031/0032** (final snapshot verified identical to the live 141-table
> schema); **'drizzle-kit generate --name=ci_drift_check' now reports 'No schema
> changes'**."

That is a recorded precedent for hand-writing metadata specifically to satisfy the
CI drift gate. Corroborating artefacts of the same practice: non-UUID snapshot ids
(`0006_snapshot.json` → `id: "0006-journal-scope-integrity"`), round-number journal
timestamps (`0018` `1787634000000`, `0021`–`0027` exactly 60 s apart), `0030`–`0032`
sharing one timestamp, and `0038`/`0039` 1 ms apart.

**Why `0040`–`0044` lack snapshots and journal entries.** They were added with no
metadata at all; the journal simply stops at `0039`. They are hand-authored, not
generated: block-comment headers, unquoted `CREATE TABLE IF NOT EXISTS`, RLS
policies and `DO $$ … $$` self-verification blocks — unlike `0000`–`0005`, which are
drizzle-kit output (quoted identifiers, `CREATE TYPE "public"."…"`, inline
`--> statement-breakpoint`).

**Whether `0039`'s snapshot represents `0039`'s SQL — it does not.** `0039` creates
7 tables (`agriculture_export_*`); the snapshot contains 283 tables and none of
them, identical to `0038`'s 283.

**Whether any historical SQL was modified after application — NO.** Two migrations
were edited after being added, both on **2026-09-07**, the same day they were
created, and both described as fresh-install corrections:

| migration | added | modified | modification |
|---|---|---|---|
| `0030_f01_database_governance_hardening` | `b3df78e` | `4a9834e` | "migration 0030 fresh-install" |
| `0031_agriculture_os_foundation` | `af3711f` | `6e9f30b` | unconditional `GRANT` → `pg_roles`-driven `DO` block (role did not yet exist under canonical CI ordering; `42704`) |

The **earliest** `db-release` provenance tag is `db-release-1dab6852-97` dated
**2026-09-08** — one day later. Verified with
`git merge-base --is-ancestor`: both `4a9834e` and `6e9f30b` are ancestors of
`1dab685`. **Both fixes predate the first recorded release.**

Byte-level proof, two independent comparisons:

* every one of the 36 migrations present at the first release `1dab6852-97` is
  **byte-identical at HEAD**;
* the latest release `db-release-ae09d538-194` (45 migrations) is **byte-identical
  to `ae09d53`**;
* P2 adds exactly one file on top: `git diff --stat ae09d53 HEAD -- drizzle/` →
  `0045_payment_webhook_events_tenant_index.sql | 64 +++`.

**Whether any ledger entry differs from repository SQL — NO.** 46 rows, 46 files,
0 checksum mismatches, 0 missing, 0 unexpected (re-run after every experiment).

## 3. What the defective gate was hiding

The schema was not drifting at table level: applying all migrations yields 349
tables, `src/db/schema.ts` declares 348, and the only difference is
`beyu_migrations` — the runner's own ledger. At object level, though, the blindness
had a real cost:

> **`payment_webhook_events_tenant_idx` has never existed in any database.**

Declared at `src/db/schema/payments.ts:226`, present in
`drizzle/meta/0028_snapshot.json`, and **absent** from
`drizzle/0028_payment_banking_core.sql`, which creates only
`payment_webhook_events_inbox_uidx` and `payment_webhook_events_state_idx`. The SQL
and its own snapshot have disagreed since the day `0028` was committed. Fixed by
`0045`.

A second class of false signal was also measured: comparing check constraints by
**expression text** reported **17 phantom drifts**, because PostgreSQL rewrites
`status IN ('A','B')` into `status = ANY (ARRAY['A'::text,'B'::text])`. Matched by
**name** — BEYU names every check explicitly — the true count is **0**.

## 4. The canonical drift model

Defined in code as `DRIFT_MODEL` and `ISSUE_DRIFT_CLASS` in
`src/lib/migration/integrity.ts`, so the classification is enforced, not described.

| Class | Definition | Detection | Blocking? |
|---|---|---|---|
| **A. MIGRATION SOURCE DRIFT** | repository migration files do not match the canonical inventory | `reconcile()`, DB-free | **always** |
| **B. DATABASE MIGRATION DRIFT** | `beyu_migrations` disagrees with the SQL source | `reconcile(dir, ledger)` | **always** |
| **C. SCHEMA DRIFT** | database schema differs from what the canonical migrations produce | two measured snapshots | **always** |
| **D. METADATA DRIFT** | `drizzle/meta` disagrees with migration/schema reality | `reconcile()` | **registerable only** |

The enforcement rule is one line and is unit-tested: `isAcknowledged()` returns
`false` for any code whose class is not `D_METADATA`. **No register entry can make
a production-authority discrepancy optional.** This is what stops "acknowledge the
drift to get green" from ever being available as a strategy.

`KNOWN_METADATA_DEBT` holds the D-class debt: `missingSnapshot`
`0018`,`0021`,`0029`,`0040`–`0045`; `missingJournal` `0040`–`0045`;
`chainCollision` `0039`. It is compared against the live discrepancy set on every
run, so the debt **cannot grow silently** — a new migration without metadata fails
the build unless it is added there explicitly.

## 5. Drift gate: before and after

**BEFORE — exact behaviour.**

```bash
before=$(ls drizzle/*.sql | wc -l)
npx drizzle-kit generate --name=ci_drift_check
after=$(ls drizzle/*.sql | wc -l)
[ "$before" != "$after" ] || echo "No schema drift."
```

Reproduced verbatim this session:

```
Error: [drizzle/meta/0038_snapshot.json, drizzle/meta/0039_snapshot.json] are
pointing to a parent snapshot: … which is a collision.
EXIT CODE: 0        # exits successfully having generated nothing
```

`set -euo pipefail` does not help: exit 0 is not an error. The count is unchanged,
so the step printed `No schema drift.` **The gate never compared anything.**
Classification: *reports an error but exits successfully*, compounded by *depends
on invalid metadata*.

**AFTER — exact behaviour.** `scripts/migration/schema-drift.ts` measures two
snapshots and compares them:

* `drizzle-kit pull` → the schema the migrations **actually produced** (349 tables,
  5305 columns, 689 indexes, 809 foreign keys, 272 policies)
* `drizzle-kit generate` → the schema `src/db/schema.ts` **declares**

Both go to a throwaway directory under `os.tmpdir()`. `drizzle/meta` is neither
read nor trusted, so the known metadata debt cannot make the gate red and editing
metadata cannot make it green.

**Fail-closed rule** (`assessToolOutcome`, unit-tested): a run fails if its output
matches an error signature, **or** its exit code is non-zero, **or** it produced no
snapshot artifact. Exit status is never trusted alone. Progress output goes to
stderr in `--json` mode so stdout is always one parseable document.

| Dimension | Direction | Notes |
|---|---|---|
| tables, columns (name/type/nullability), enums, unique constraints, composite PKs | symmetric | both directions are drift |
| indexes, foreign keys, check constraints | asymmetric | "declared but absent from DB" is drift; DB-only is informational |
| RLS enablement, policies | excluded | applied by SQL, never declared in the ORM; verified by the isolation suites |
| FK names, check-constraint expressions | excluded | synthesised / rewritten by PostgreSQL |

## 6. Acceptance proof — the eight cases

`scripts/migration/gate-selftest.ts` runs these against a **disposable scratch
database** it creates and drops itself. `beyu_os` is never touched; the harness
refuses to run against a non-loopback host. Measured output:

| Case | State | Expected | Actual | Evidence |
|---|---|---|---|---|
| 1 | VALID — clean apply of every migration | PASS | **PASS** | exit 0, ledger rows 46 |
| 2 | IDEMPOTENT — re-run applies nothing | PASS | **PASS** | exit 0, ledger 46 → 46 |
| 3 | MISSING MIGRATION — ledger row deleted | FAIL | **FAIL** | exit 1, `LEDGER_MISSING_MIGRATION` |
| 4 | CHECKSUM MISMATCH — ledger identity altered | FAIL | **FAIL** | exit 1, `LEDGER_CHECKSUM_MISMATCH` |
| 5 | EXTRA MIGRATION — unexpected ledger row | FAIL | **FAIL** | exit 1, `LEDGER_UNEXPECTED_MIGRATION` |
| 6 | SCHEMA DRIFT — orphan table in the database | FAIL | **FAIL** | exit 1, `p2_drift_probe_orphan` named |
| 7 | METADATA COLLISION — error with exit 0 | FAIL | **FAIL** | see below |
| 8 | METADATA INCOMPLETE, production truth valid | PASS | **PASS** | integrity 0, drift 0 |

**Case 7, verbatim from the harness:**

```
drizzle-kit exit 0, reported collision: true,
OLD gate would have passed: true,
new gate ok=false (the tool reported an error; snapshot parent collision
(exit code 0 — exit code alone is not trusted))
```

This is the acceptance condition met: the same input the old gate turned into a
PASS is turned into a FAIL, and the reason is recorded rather than inferred.

**Case 8 rationale, stated explicitly.** It passes **because the gate intentionally
treats `drizzle/meta` as non-authoritative**. The SQL source, the ledger and the
resulting schema are all correct; only design-time metadata is incomplete. Making
this case fail would mean asserting production drift where there is none — the exact
conflation §4 forbids. It is *not* a pass by omission: the same harness fails cases
3–6 on the same database.

Cases 3–5 restore the ledger from an exact in-memory backup rather than re-running
the runner. That is deliberate: the schema is no longer empty, so `migrate.ts`
correctly **refuses** historical migration `0001` — the destructive guard firing as
designed, observed rather than assumed.

## 7. Expand/Contract

Invariant: the new schema must stay compatible with the **current** release and the
**next** release for the whole expansion window. P2 covers
`EXPAND → MIGRATE → VERIFY` plus `CONTRACT SAFETY`. **Canary and promotion are
later phases**; nothing here routes traffic or changes release identity.

`scripts/migration/expand-contract.ts` is the smallest enforceable contract, and it
**reuses** the scanner in `src/lib/migration/integrity.ts` — the same one
`scripts/db-release.ts` uses for production preflight. There is one definition of
"destructive" in the repository and no speculative SQL parser.

Applied to all 46 migrations: **45 EXPAND, 1 CONTRACT**. The single contraction is
`0001` (`TRUNCATE TABLE audit_log`, `TRUNCATE TABLE enterprise_events`), which is
classified and **not rewritten** — the runtime guard in `scripts/migrate.ts` is
unchanged.

Rejected as unsafe early contraction: `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`,
`DROP SCHEMA|DATABASE`, `RENAME COLUMN`, `RENAME TO`, `SET NOT NULL`,
`ALTER COLUMN … TYPE`, and any `DROP CONSTRAINT` / `DROP POLICY` **not** replaced
under the same name in the same migration.

Two patterns that dominate BEYU's history are explicitly *not* contraction, because
flagging them would make the gate permanently red and therefore worthless:
the idempotent RLS re-declaration (`DROP POLICY IF EXISTS x; CREATE POLICY x …`)
and constraint tightening (`DROP CONSTRAINT c; ADD CONSTRAINT c …`, as in `0005`,
`0017`). Both match on the identifier, quoted or unquoted — drizzle-generated
migrations quote them, hand-authored ones do not, and a scanner handling only one
style silently mis-parses the other. Dynamic SQL in function bodies is excluded, so
`0043`'s `EXECUTE format('DROP POLICY IF EXISTS %I ON %I', …)` is not misread.

### Destructive scanner — two defects fixed

1. **False positive.** A bare `/\btruncate\b/i` flagged migration `0008`, whose only
   TRUNCATE text is a `BEFORE TRUNCATE` **prevention** trigger and a `RAISE`
   message saying truncation is not allowed. Comments and string literals are now
   stripped before matching. Noise like this trains operators to reach for
   `--allow-destructive`, which defeats the gate.
2. **False negative (security).** Only the `GRANT` spelling of privilege escalation
   matched, so `ALTER ROLE … SUPERUSER|BYPASSRLS` — which defeats RLS just as
   thoroughly — went undetected. Both spellings are covered now, and
   `NOSUPERUSER`/`NOBYPASSRLS` (the hardening direction) correctly does not match.

The register is also checked for staleness: an entry that no longer contains a
destructive operation fails the build, so registration cannot be used to quiet the
gate for a file that is later rewritten.

## 8. STOP — release-governance boundary

**The historical `drizzle/meta` journal and snapshots were deliberately left
untouched.** No historical SQL was modified, no filename or sequence changed, no
journal entry or snapshot edited, no ledger row altered, no production schema reset.

Safe reconciliation cannot be proven automatically, and the reason is evidential:

* snapshots for `0018`, `0021`, `0029` and `0040`–`0045` **never existed**;
  generating them now would assert schema states that were never captured — which is
  fabricated migration metadata;
* `0039_snapshot.json` is already a fabricated copy of `0038`. "Repairing" it by
  writing plausible content would compound the original error;
* the chain is partly invented (`0006`/`0007` hand-written ids), so there is no
  trustworthy base to regenerate from;
* commit `6e9f30b` shows the repository has already rebuilt this metadata once to
  satisfy a gate. Doing it again, without a decision about whether
  `drizzle-kit generate` is the intended authoring path, would repeat the mistake.

**Missing evidence a human owner must supply:** whether `drizzle-kit generate` is to
remain the authoring path at all. Two safe options, both requiring that decision:

* **(A) Re-baseline honestly.** Record that `0000`–`0045` are hand-authored history,
  generate one forward baseline snapshot from a real migrated database, and chain
  future migrations from it. Existing SQL untouched; the journal is re-rooted with an
  explicit note that intermediate snapshots were never captured.
* **(B) Abandon drizzle metadata.** Declare `src/db/schema.ts` + `drizzle/*.sql` +
  `beyu_migrations` the complete source of truth, delete `drizzle/meta`, and rely on
  the truth-based gate alone. Smallest surface; forfeits `drizzle-kit generate`.

Neither is performed here. Both are irreversible changes to production-history
metadata and belong to a human release owner.

## 9. Verification evidence

Real PostgreSQL 16.14 (embedded harness, `scripts/infra/pg16-server.mjs`).

| Check | Result |
|---|---|
| clean apply `npm run migrate` | 46 `APPLIED` |
| idempotent re-run | ledger 46 → 46 |
| checksum integrity repo vs ledger | 0 mismatches, 0 missing, 0 unexpected |
| `integrity.ts --with-ledger` | exit 0 — 46 SQL / 40 journal / 37 snapshots / 46 ledger, 18 acknowledged, **0 blocking** |
| `schema-drift.ts` before `0045` | exit **1** — 1 blocking drift |
| `schema-drift.ts` after `0045` | exit **0** — 0 blocking, 126 informational |
| `gate-selftest.ts` | **8/8 cases** behaved as expected |
| `expand-contract.ts` | exit 0 — 45 EXPAND, 1 registered CONTRACT |
| `tests/migration/` | **98 passed** |
| DR drill | PASSED — scratch DB rebuilt from migrations alone, fingerprint parity, 272 RLS tables preserved |

## Appendix — regenerate the matrix yourself

```bash
npx tsx scripts/migration/integrity.ts --with-ledger   # A × B × C × D
npx tsx scripts/migration/expand-contract.ts           # Expand/Contract
npx tsx scripts/migration/schema-drift.ts              # C — schema drift
npx tsx scripts/migration/gate-selftest.ts             # the 8-case acceptance proof
git tag -l 'db-release-*' | wc -l                      # E — provenance records
```

The matrix is generated, not transcribed.
