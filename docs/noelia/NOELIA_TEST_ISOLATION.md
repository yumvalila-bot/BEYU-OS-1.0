# NOELIA — Test Isolation Defects Found and Fixed

**Status:** IMPLEMENTED (all four defects fixed and verified)
**Files:** `tests/helpers/appointments.ts`, `tests/noelia/cognitive-integration.test.ts`,
`tests/foundation/domain.test.ts`, `tests/noelia/knowledge-retrieval.test.ts`
**Verification:** `npx vitest run tests/governance/` → **438 passed / 0 failed / 93 skipped** (27 files);
`npx vitest run tests/foundation/` → **62 passed / 19 skipped**, run twice consecutively with the
seeded deadline left canonical.

---

## 1. Why this document exists

Two of the failures found while running the full repository suite were **not** in NOELIA
code and **not** regressions from this workstream. They were pre-existing test-isolation
defects that had been silently degrading the suite: each one leaked database state, and the
leak made the *next* run fail in a different test file.

They are recorded because a suite that fails for reasons unrelated to the change under
review trains reviewers to ignore red, which is the same failure mode as a silently wrong
metric.

---

## 2. Defect A — a leaked governance fixture poisoned unrelated suites

### Symptom

Running the whole repository produced failures in files that had nothing to do with each
other:

```
tests/governance/decision-authority.test.ts
  expected [ 'FAMILY_COUNCIL', …(2) ] to deeply equal [ 'FAMILY_COUNCIL', 'GROUP_BOARD' ]
  received: 'FAMILY_COUNCIL', 'GOV_EVAL_TEST', 'GROUP_BOARD'

tests/governance/governance-control-plane.test.ts
  the real registry holds 6 bodies and 14 matters
  expected 7 to be 6
```

`GOV_EVAL_TEST` is a test fixture. It was sitting in `governance_bodies` and being counted as
a real governing body by suites that assert against the *canonical* registry.

### Root cause

`tests/helpers/appointments.ts` created a disposable body (`GOV_<PREFIX>`) plus its members,
charter, resolutions and actors, and `cleanupAppointments()` deleted them. But the delete
order was incomplete: it did not remove the rows that several *newer* governance tables hold
against `governance_bodies` and `governance_charters`:

```
governance_evaluations      governance_meetings
governance_legal_holds      governance_calendar_events
governance_escalations      governance_body_changes
governance_membership_changes
governance_body_activations
governance_body_establishments
```

So `db.delete(governanceBodies)` threw `23503` (foreign key violation), the `afterAll` hook
aborted, and the fixture body stayed behind.

### Why it was permanent

The fixture was also **not idempotent**. On the next run:

```
error: duplicate key value violates unique constraint "governance_bodies_pkey"
detail: Key (id)=(GOV_HOLD_TEST) already exists
```

`beforeAll` threw, so `f` was undefined, so `afterAll` then threw
`Cannot read properties of undefined (reading 'bodyId')`. A single transient leak converted
the suite into a permanently un-runnable state — and the report showed it as a *test*
failure, hiding the fact that the test never ran.

### Fix

Two changes, both in the test helper:

1. **`cleanupAppointments` now deletes leaves first** across every table that references the
   fixture's body, then the charter terms, then charters, resolutions, members, and finally
   the body itself. Each step is wrapped in a guard that swallows only "absent object or
   foreign key" errors, so an older schema shape cannot abort cleanup halfway and strand the
   remainder.

2. **`appointmentFixture` calls `cleanupAppointments(prefix)` before it inserts.** The fixture
   is now self-healing: a leftover row from any previous crash is purged rather than
   colliding.

### Verification

```
before:  3 failed test files, 434 passed (the 3 failures were cleaning-up errors, not assertions)
after:   27 passed test files, 438 passed, 0 failed, 93 skipped
```

Database state confirmed restored to the canonical baseline: `governance_bodies` count = 6.

---

## 3. Defect B — a NOELIA test asserted through accumulating state

### Symptom

```
tests/noelia/cognitive-integration.test.ts
  records a decision with rationale, authority and provenance, then reads it back
  expected undefined to be defined
```

The test inserted a `TEST-DEC-*` decision with `decidedOn: "2026-03-01"` and then queried
with `keyword: "retrieval baseline"` and `limit: 10`.

### Root cause

**Not** an isolation-permission problem. Measured directly:

```
EFFECTIVE rows matching 'retrieval baseline': 13      ← readback limit is 10
```

Every run of this test inserts another row with the same `decidedOn` date and a title
containing "retrieval baseline". Once there were more than ten such rows, the newly inserted
decision fell outside the ordered window and the assertion failed — **depending on how many
times the suite had been run before**. The test passed on a fresh database and failed on a
used one.

The readback is correct; the test was non-deterministic.

### Fix

The test now derives a unique per-run marker and searches for that instead:

```ts
const marker = `retrieval baseline ${Date.now()}`;
// …title: `Approve institutional knowledge register baseline (${marker})`
// …keyword: marker,
```

The assertion no longer depends on how many times the suite has run. Accumulated
`TEST-DEC-*` rows were also cleaned out of the local database.

While fixing this, the insert was moved **inside** `withTenantDatabaseContext`. The original
form wrote outside the tenant context, which only worked because the table's RLS policy was
missing (the 0084 defect documented in `NOELIA_MIGRATION_DISCIPLINE.md`). Once the policy
existed, the write had to be scoped like any other — which is the correct shape for a test
of a governed table.

---

## 4. Defect C — a compliance sweep silently rewrote a seeded business row

### Symptom

```
tests/foundation/domain.test.ts
  seed integrity › demo foundation, funds, donation, grant and deadline are readable in scope
  AssertionError: expected 'OVERDUE' to be 'UPCOMING'

  expect(annual?.status).toBe("UPCOMING");
  expect(annual?.dueDate).toBe("2026-09-29");
```

The seed hard-codes `status: "UPCOMING"` for the FY2026 NGO annual return. The assertion read
`OVERDUE` instead.

### Root cause

**Not** a date-arithmetic bug and **not** seed corruption. `listDeadlines` returns the stored
column, so something had durably written the value. Measured directly:

```
foundation_deadlines
  FDL_TZ_NGO_ANNUAL_RETURN_2026   FY2026   due 2026-09-29   status OVERDUE   created_at 2026-11-24
```

`created_at` showed the row was re-written **today**, by the suite itself. The mechanism:

`runComplianceSweep` does not operate on the fixture rows alone — it selects **every open
deadline in the principal's scope** and materialises each one's health into the stored status:

```ts
const targetStatus = health === "OVERDUE" ? "OVERDUE" : health === "DUE_TODAY" ? "DUE_TODAY" : "UPCOMING";
if (deadline.status !== targetStatus) {
  await db.update(s.foundationDeadlines).set({ status: targetStatus })…
}
```

The sweep tests pass `todayIso = new Date().toISOString().slice(0, 10)`. The seed's due date is
2026-09-29. That was in the future when the tests were written; from 2026-09-30 onward the
sweep correctly computes `OVERDUE` for the seeded row. **This was a latent time bomb, not an
intermittent flake** — it was guaranteed to start failing on a fixed calendar date.

Two consequences compounded it:

1. The suite's `afterAll` only cleaned the **fixture** deadlines it had inserted
   (`createdComplianceDeadlineIds`). It never restored the seeded row it mutated.
2. The sweep also wrote **13 collateral rows** against the seeded deadline — 9
   `foundation_notification_log` entries (one per reminder offset) and 4
   `foundation_escalations` — none of which the seed creates. Those accumulated on every run.

The production behaviour is correct: materialising `OVERDUE` and raising escalations is
exactly what a compliance engine should do. The defect was that the test borrowed a
long-lived business row to exercise it and gave it back changed.

### Fix

The suite now owns the consequence of the operations it calls:

- `restoreSeededDeadline()` deletes the notification logs (and any linked canonical
  notifications), deletes the escalations, and resets
  `status = 'UPCOMING'`, `completed_at = null` on the seeded deadline.
- It runs in **`beforeAll` and `afterAll`** — purge on entry as well as exit, so an aborted or
  crashed prior run cannot poison this one.
- The suite was re-run **twice consecutively** and the database verified afterwards:
  `foundation_deadlines` = 1 row (`FY2026`, `UPCOMING`), `foundation_notification_log` = 0,
  `foundation_escalations` = 0.

### What made this one harder to see

The failing assertion (`status`) is the *second-order* effect. The first-order damage was 13
rows in tables the test never mentions. A test that swipes across a shared table to prove a
batch operation will pass or fail depending on what else is in the table and what day it is —
and it will leave residue that the next suite inherits.

---

## 5. Defect D — a test wrote into immutability-protected institutional evidence

### Symptom

Nothing failed. That is the point, and it is why this one is recorded first among
equals.

While writing `tests/noelia/knowledge-retrieval.test.ts`, the obvious approach was to
seed fixture rows into `knowledge_sources` and assert that retrieval found them. The
seed call succeeded. The retrieval assertions passed. Teardown then failed with:

```
error: knowledge sources are immutable evidence   (SQLSTATE 55000)
where: PL/pgSQL function beyu_protect_knowledge_original() line 10 at RAISE
```

### Root cause

`knowledge_sources` carries `protect_knowledge_original` (0075). Its first action:

```sql
IF TG_OP = 'DELETE' THEN
  RAISE EXCEPTION 'knowledge sources are immutable evidence' USING ERRCODE = '55000';
END IF;
```

It refuses DELETE unconditionally — including for the table owner. Everything else
requires a live, MFA-verified, dual-control `knowledge.ingest` / `knowledge.publish`
action binding whose payload digest matches the row exactly.

So each aborted run left **8 fixture rows permanently in the institutional corpus**.
Five failed runs left **40 rows**:

```
KRET-5FABOK-CHAN ... KRET-UEMNJ3-STALE    40 rows, 8 per run
```

Those rows are `AUTHORITATIVE` by default, so NOELIA would have retrieved them,
cited them, and reported them as institutional truth. The Command Centre's corpus
count was wrong. This is the governance-fixture leak of Defect A, but worse: Defect A
leaked a governing *body* into a registry, this leaked *policy documents* into the
evidence base.

### Why the obvious fix was wrong

The reflex is to make teardown succeed. Both available routes were rejected:

- **Disable the trigger in the test.** That is the test weakening a production
  control to clean up after itself. It also does not generalise: the next person
  copies the pattern.
- **Leave the rows and add them to an allowlist.** The corpus is evidence. A test
  that permanently adds to it changes what the institution knows.

### Fix

The suite no longer writes to `knowledge_sources` at all.

- It reads the **real, seeded corpus** (218 authoritative rows spanning PUBLIC →
  HIGHLY_RESTRICTED) and asserts the real authorization gate against real data.
- The only rows it creates are in `noelia_knowledge_embeddings` — derived data,
  keyed by `NKE` ids — and `afterAll` removes exactly those ids it recorded. A
  blanket delete by `source_id` would destroy vectors produced by the real indexer,
  so the ids are tracked individually.
- The 40 leaked rows were removed as the table owner, in a transaction, with the
  trigger disabled for the duration and **re-armed and verified from
  `pg_trigger.tgenabled` before commit** — not by testing a no-op DELETE, which
  never fires a row trigger and therefore proves nothing.

Corpus verified back to 218 rows; trigger verified live (`55000` on a real row).

### The rule this adds

> A table protected by an immutability trigger is **not** available as a test
> fixture store, and a test must never disable the protection to tidy up. Such a
> table is read-only input to a test; derived tables are what tests may own.

Any future suite that needs known content in `knowledge_sources` must route through
the governed `knowledge.ingest` → `knowledge.publish` action flow or use a
disposable database — and must say so in its header, because the temptation to
`insert into knowledge_sources` is otherwise overwhelming.

---

## 5A. Defect E — a tenant selector with no tiebreaker

### Symptom

`tests/finance/finance-os.test.ts` failed one assertion in the definitive full-suite run:

```
POSITIVE CONTROL: the treasury side is genuinely populated, so the check is non-vacuous
AssertionError: expected +0 to be 11783000
```

The failure reproduced in isolation, so it was not ordering-dependent within one run. The
treasury table was fully populated: 5 positions, TZS 11,783,000, all belonging to
`TEN_BEYU_GROUP`.

### Root cause

```ts
async function groupTenant(): Promise<string> {
  const [r] = await rowsOf(sql`select id from tenants order by created_at limit 1`);
  cachedTenant = r.id;
}
```

All seven seeded tenants are written in **one transaction**, so they share an identical
`created_at` down to the millisecond. `order by created_at limit 1` therefore has no tiebreaker:
PostgreSQL may return any row, and which one it returns can change when the physical row order
changes (a `VACUUM`, an index change, a new seed run).

It happened to return `TEN_BEYU_GROUP` for a long time. It then began returning
`TEN_BEYU_FOUNDATION`, which has no treasury positions — so the reconciliation read zero and the
positive control failed. A function named `groupTenant` had been returning the Foundation tenant.

### Why this is a serious class of defect

The test was **passing on an accident**. Nothing about the assertion checked that the selector was
correct; it checked only that the data behind whatever row came back summed to 11,783,000. Any
change in physical storage order could flip it, and the flip would arrive as an unrelated-looking
failure in a suite nobody had touched.

This is worse than a flaky test, because it was not random: it was deterministic for a long time,
which made it look correct.

### Fix

```ts
const [r] = await rowsOf(sql`select id from tenants where id = 'TEN_BEYU_GROUP'`);
if (!r) throw new Error("Seed is missing TEN_BEYU_GROUP; the finance suite cannot run.");
```

A named row, selected by its identity, with an explicit failure when the seed is absent. The same
pattern existed in `tests/authority/authority.test.ts` and was corrected identically — it had not
failed yet, which is precisely why it was worth fixing before it did.

### The rule this adds

> **Never select a fixture row by an ordering that has no tiebreaker.** Seed rows written in one
> transaction share a timestamp. If a test needs "the group tenant", name it. If it needs "any
> tenant", say so in the variable name — and then do not assert on tenant-specific content.

---

## 5B. Defects F and G — the same unordered-selector class, twice more

After Defect E was fixed, the next full run surfaced two more failures in unrelated suites. Both
were the *same root cause*: a fixture selecting a row without a tiebreaker.

### Defect F — `tests/internal/events-internal.test.ts`

```
legalEntityId of ANOTHER tenant is rejected (422) — no entity misattribution
AssertionError: expected 422 to be 201
```

The failing assertion was the **positive** branch: publish an event attributed to an entity of
*your own* tenant and expect `201`. The route correctly rejected it.

Two independent defects combined:

1. `beforeAll` picked the tenant with `rows.find(r => r.type === "SECTOR" || /health/i.test(r.code))`.
   **Four tenants are `SECTOR`**, so this returned whichever row came first — `TEN_BEYU_AGRI` in
   practice. The suite's name says "health"; the selector said "any sector".
2. The positive branch called `envelope({ legalEntityId: own.id })` **without** `tenantCode`. The
   envelope's default is the literal `"BEYU-HEALTH"`, and the route resolves the tenant **from the
   body**. So the request said "this BEYU-HEALTH event belongs to an AGRI entity" — and the route
   was right to refuse it.

The test was incoherent, not the route. Both were fixed: the tenant is now selected by name, and
`tenantCode` is passed explicitly in both branches. Verified `30/30`.

### Defect G — `tests/noelia/http-coverage.test.ts`

```
POST /api/v1/ai/noelia/schedules creates, suspends and ticks a governed schedule
status call failed: 404 {"code":"NOT_FOUND","message":"Schedule not found in scope."}
```

The create succeeded (`201`), then the status update on the returned id returned `404`. The
schedule had been created against `(await db.select().from(tenants).limit(1))[0].id` — the same
unordered, no-tiebreaker select — which this time resolved to a tenant outside the governance
principal's scope. The route's scoped lookup then correctly could not find it.

Fixed by resolving the target tenant from the **principal's own `primary_tenant_id`** rather than
from an arbitrary row. Three occurrences in the file. Verified `7/7` — which also cleared a
separate `500` on the workflows route that had the same cause.

### The pattern

Three defects (E, F, G), one cause, found only because the full suite ran end-to-end each time.
Each was latent for a long time and each would have been dismissed as "flaky" by anyone who saw it
once and re-ran to green.

> **A test that re-runs to green has not been fixed.** It has been postponed, and the postponement
> costs the next person a day of diagnosis on a suite they did not touch.

The rule from Defect E generalises: **select fixtures by identity, never by list position.** That
covers `limit(1)` without `order by`, `order by` without a unique tiebreaker, and `find()` over an
unfiltered result set.

---

## 6. What this says about the suite as a whole

| Observation | Consequence recorded here |
|---|---|
| The unit suite runs as a **privileged test role** (`BEYU_TEST_DATABASE_URL`), documented in `tests/setup-env.ts` | Unit tests do not exercise RLS. Isolation must be proved separately, as the real runtime role — which `cognitive-migration-contract.test.ts` now does. |
| Several governance suites assert against the **live canonical registry** | Any fixture leak becomes a false failure elsewhere. Fixtures must be self-healing, not merely best-effort cleaned. |
| `fileParallelism: false` is set, so tests run serially | Serial execution does not prevent leaks — it makes them deterministic, so a leak always lands on the same innocent suite. |

Two further rules were added after Defect C:

| Observation | Consequence recorded here |
|---|---|
| `runComplianceSweep` writes to **every** open deadline in scope, not just fixtures | A test that calls a batch operation must inventory what the operation touches beyond its own rows. Use `beforeAll`/`afterAll` restore, not a "delete what I inserted" list. |
| The seed pins `dueDate: 2026-09-29` and the test compares against *today* | **Date-dependent assertions are latent failures with a scheduled start time.** This one was guaranteed to break on 2026-09-30, not "sometimes". |
| `knowledge_sources` refuses DELETE unconditionally (`protect_knowledge_original`, 0075) | **An immutability-protected table is not a fixture store.** A test may read it; it may not write to it, and it must never disable the trigger to clean up. Own derived tables instead. |

The general rule adopted: **a test that creates durable rows must be able to run twice in a
row on a dirty database — and a test that mutates durable rows it did not create must restore
them, in `beforeAll` as well as `afterAll`.** All three files now satisfy that.
