# CLAUDE.md

Guidance for AI coding assistants working in this repository.

This file is the entry point. **`CONTRIBUTING.md` is normative** — where the two disagree,
`CONTRIBUTING.md` wins and this file has a bug. `AGENTS.md` covers the same ground for other
assistants; the two are kept consistent deliberately.

---

## What this repository is

BEYU OS is an institutional operating system for a Tanzanian enterprise group. It is not a
generic SaaS and not a demo. It has constitutional constraints that are enforced in code and
must not be reasoned away:

- **Exactly four sector operating systems**: `HEALTH`, `FINANCE`, `AGRICULTURE`, `UJENZI`.
  Adding a fifth, or a `FOUNDATION_OS` / `FAMILY_OFFICE_OS`, is a constitutional violation.
  Foundation and Family Office exist as *sister* entities within the governance layer, not as
  sector OSs.
- **`CAP_POSTING` is locked and fails closed.** If you find yourself making it fail open to get
  a test green, you have misunderstood the task.
- **NOELIA is advisory.** It proposes; it never executes a posting, a payment, or a state
  transition. Any change that lets NOELIA write to a governed ledger is wrong.

If a request conflicts with any of the above, say so and stop rather than implementing it.

---

## Non-negotiable rules

### 1. Authorization is server-side, always

Tenant scoping is resolved on the server from the authenticated principal. Never trust a
tenant ID, role or scope from the client. `requireTenantContext()` **throws** when the
tenant context is absent — that throw is a feature. Do not replace it with a default or a
`?? "TEN_BEYU_TZ"`.

### 2. Do not fabricate

This is the rule most often broken by assistants, usually with good intentions.

- A mock is not inference.
- Configured is not verified.
- A capability you could not exercise must not be marked complete.
- If you did not run it, say you did not run it.

The vocabulary is defined in `AGENTS.md` §"Honest reporting vocabulary" and is used
throughout the docs. It exists because "DONE" is cheap and "verified" is not.

### 3. Migrations

Migrations are append-only and immutable once applied.

- **Never edit a migration that has been applied anywhere.** Editing it changes its checksum
  and the ledger will (correctly) reject it. If you must change an applied migration locally,
  delete its `beyu_migrations` row, drop the objects it created, and re-apply — and say in your
  report that you did.
- **Never write `GRANT`** in a migration. Privileges are managed by
  `scripts/audit-runtime-privileges.ts` and the role setup scripts.
- **The history is expand-only.** `scripts/migration/expand-contract.ts` permits exactly one
  contraction in the entire migration history (`0001`) and `SET NOT NULL` counts as one. So do
  **not** write "add nullable → backfill → `SET NOT NULL`": add the column already constrained,
  `ADD COLUMN … text NOT NULL DEFAULT '…'`. PostgreSQL backfills existing rows from the default,
  so the end state is the same and the change is an EXPAND. Verify with
  `npx tsx scripts/migration/expand-contract.ts` before you run anything else.
  (This rule was learned by violating it — see `NOELIA_MIGRATION_DISCIPLINE.md` §5A.)
- A `--` comment must not contain a backtick or the breakpoint token — the migration runner
  splits on it.
- Constraints are validated against **existing rows**, so order matters: backfill data before
  adding a constraint that the data would violate.
- Two sector-domain tests pin `journal.entries.at(-1)?.tag`. Update them deliberately when you
  add a migration, not reflexively.
- **An optional component must be guarded or it is not optional.** `CREATE EXTENSION` for a
  contrib module (`pg_trgm`, `uuid-ossp`, …) must run inside a `DO` block that catches
  `insufficient_privilege` / `undefined_file`, or a deployment without contrib aborts the whole
  migration run. "The code degrades without it" is a claim about the code — the migration has to
  let the database reach that state. See `NOELIA_MIGRATION_DISCIPLINE.md` §5C.
- **Never name an application role in a migration unless you guard it.** A bare
  `GRANT … TO beyu_runtime` resolves the name to an OID, so it raises `42704` when the role does
  not exist — and on a clean install it never exists, because `setup-db-role.ts` provisions it in
  a later pipeline step. Loop `FOR r IN SELECT rolname FROM pg_roles WHERE rolname = '…'` so an
  absent role is zero iterations, not an error. The same trap hides in `has_*_privilege`,
  `pg_has_role` and `::regrole`. The migration-local `GRANT` is redundant anyway: runtime
  privileges come from the allowlist. See `NOELIA_MIGRATION_DISCIPLINE.md` §5D.
- **SQL keywords have no case — grep case-insensitively or you will miss a statement.** The
  defect that broke CI was seven lowercase `grant` lines that every uppercase
  `GRANT|TO|OWNER` scan walked straight past, and a clean grep result is indistinguishable from
  a clean file.
- **Before concluding "cannot reproduce", make local worse than CI.** Rename the roles away,
  revoke the privilege, drop the contrib extension. A passing local run is a fact about your
  cluster, not about the code.

Verify with:

```bash
npm run migrate
npx tsx scripts/migration/integrity.ts --with-ledger
npx tsx scripts/migration/schema-drift.ts --json
```

The drift gate treats `index`, `foreignKey` and `checkConstraint` objects that exist in the
database but not in `src/db/schema` as **informational**, because BEYU's hand-authored
migrations legitimately create objects the ORM does not model. Everything else is blocking.

### 4. Zero cost

The programme operates at USD $0.00 of authorized new spend.

- No paid AI API, subscription, trial, credit purchase, billing activation, or paid
  vector/graph/monitoring/browser/embedding service.
- No paid dependency.
- No automatic paid fallback. Fail closed instead.
- Avoid services that can silently become paid.

Only `LOCAL_FREE` is authorized by default. `FREE_HOSTED` is disabled absent explicit owner
approval in writing. The policy module is `src/lib/noelia/zero-cost-policy.ts`; the enforcement
point is `src/lib/noelia/model-gateway.ts`; the database invariant is migration `0086`.

### 5. Tenant isolation in SQL

Use the Drizzle query builder with bound parameters (`inArray(col, ids)`). Do **not** hand-build
`sql.raw()` with interpolated tenant IDs — this has been an injection bug here before.

RLS is FORCEd on governed tables and policies assert `beyu_tenant_ids`. If you add a governed
table, it needs the same treatment; a table without RLS is not a governed table.

---

## Development workflow

The NOELIA lifecycle is **SPECIFY → PLAN → BUILD → TEST → REVIEW → SIMPLIFY → SHIP**, and it
**stops at the human gate**. Assistants do not merge, do not deploy, and do not push to
`main`. Produce a reviewable pull request and stop.

```bash
npm run typecheck          # tsc --noEmit; ALWAYS with the heap flag below
npm run lint
npm test                   # full suite
npx vitest run tests/noelia/<file>.test.ts   # one file
npm run build
npm run migrate
```

**`tsc` needs a raised heap.** At the default it dies with exit 134 (OOM):

```bash
NODE_OPTIONS="--max-old-space-size=3072" npx tsc --noEmit
```

**Do not run `npm run build` while the test suite is running** — they compete for the same
`.next` directory and the build corrupts the running tests' artifacts.

**`.env` beats your shell.** `scripts/migrate.ts` begins with `import "dotenv/config"`, and the
local `.env` defines `BEYU_ADMIN_DATABASE_URL`. Exporting a different URL has **no effect** —
the migration silently runs against the development database and reports success. When
reproducing a CI failure on a scratch database, move `.env` aside first. Two hours were lost to
this in this workstream, along with several "clean installs" that were nothing of the kind.

**A local superuser is not evidence about CI's role.** Every privilege-sensitive migration must be
exercised as a constrained, non-superuser role, or its privilege assumptions are untested.

**A green test run does not mean the code typechecks.** Vitest transpiles without type
checking, so a test can pass while `tsc` fails on it. This happened in this workstream: two new
suites passed 39/39 while `tsc` rejected them for constructing `SimulationRequest` and
`PromptGovernanceInput` objects with the wrong field names. The tests were passing against
undefined values that happened to be falsy, which is worse than failing. **Always run
`tsc --noEmit` before believing a green suite.**

### Testing conventions

A test is a contract, so it is written to fail when the contract breaks:

- Assert the **specific** thing. `expect(x).toBeTruthy()` proves nothing.
- Never weaken an assertion to make it pass. If a gate rejects your fixture, the fixture is
  usually wrong — fix the fixture. If the gate itself is wrong, fix the gate *and say why*.
- Do not delete a failing test. Diagnose it. If it is genuinely obsolete, remove it in its own
  commit with a written rationale.
- Restore global state you mutate. `runComplianceSweep` is durable — it writes to the database
  and will poison later tests if you leave it changed.
- Fixtures that register a model must **declare their cost truthfully** (`costClass`,
  `deploymentKind`, `zeroCostStatus`). The zero-cost gate refuses anything unverified, so an
  undeclared fixture is correctly blocked.

### Reporting test results

Report the numbers you actually got, from the raw output. Include `todo` tests in your
accounting — Vitest reports them in per-assertion results but excludes them from the passed,
failed and skipped counters, which is how a total can appear not to add up. State it as:

```
total / passed / failed / skipped / todo
```

---

## Repository shape

```
src/app/               Next.js app router
src/app/os/            The four sector OSs + NOELIA command centre
src/lib/noelia/        NOELIA: brains, gateway, cognitive layer, retrieval
src/lib/migration/     Migration integrity and drift gates
src/db/schema/         Drizzle schema
drizzle/               Numbered migrations + journal + snapshots
tests/                 Mirrors src/; tests/noelia is the NOELIA suite
docs/noelia/           NOELIA assessment, matrix, decision records, final report
scripts/               Build identity, migration, security audits
```

### NOELIA-specific entry points

| Concern | File |
|---|---|
| Eight brains + contracts | `src/lib/noelia/cognitive/brain-contracts.ts` |
| Knowledge graph (13 relations) | `src/lib/noelia/cognitive/knowledge-graph.ts` |
| Model gateway + zero-cost gate | `src/lib/noelia/model-gateway.ts` |
| Zero-cost policy | `src/lib/noelia/zero-cost-policy.ts` |
| Local embeddings | `src/lib/noelia/embeddings.ts` |
| Hybrid retrieval | `src/lib/noelia/knowledge-retrieval.ts` |
| Command Centre | `src/app/os/noelia/command-centre/` |

---

## Known limitations in this environment

Environment: 3.88 GB RAM, 2 cores, PostgreSQL 16.14, no GPU.

| Limitation | Consequence |
|---|---|
| **No Ollama, no model** | No local inference has ever run. The Ollama adapter is tested against HTTP doubles and honestly reports `NOT_CONNECTED`. Generative quality is unproven. |
| **No `pgvector`** | No ANN index. Retrieval is exact cosine over a candidate set — correct but does not scale. |
| **No Playwright browser** | Frontend tests are structural (markup, classes, routing) and cannot prove rendering at a viewport. Responsive claims are structural only. |
| **Lexical embeddings** | `beyu-local-lexical-v1` resolves morphology, not synonymy. "staff" vs "personnel" does not match. This is a tested limitation, not an oversight. |

Any claim about capability must be read against this table.

---

## Reporting

When you finish, report:

1. **Verdict**, one of exactly: `IMPLEMENTATION_COMPLETE_REVIEW_REQUIRED`,
   `PARTIALLY_IMPLEMENTED_REVIEW_REQUIRED`, `BLOCKED_REQUIRES_HUMAN_DECISION`.
2. What was **verified** (with the command and its output), separately from what was **written**.
3. What was **not** verified, and the exact blocker.
4. Test totals with all five buckets.
5. Anything you changed about an applied migration or the database, and why.

Do not describe a subsystem as working unless you exercised it.
