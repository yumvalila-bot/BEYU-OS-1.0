# AGENTS.md — instructions for AI agents working in BEYU-OS-1.0

This file tells an automated contributor (Claude Code, Cursor, Copilot, Codex, Arena, or any
other agent) how to work in this repository without breaking it.

**It is not a second source of truth.** It defers to the canonical documents listed in §1.
If this file and a canonical document disagree, the canonical document wins and this file is
wrong — fix it.

It is written to be useful to *any* agent and to humans. Nothing here requires a particular
product, subscription, model or API key. NOELIA in particular must never depend on a specific
coding assistant.

---

## 1. Canonical sources of truth (read these, do not restate them)

| Document | What it governs |
|---|---|
| `CONTRIBUTING.md` | The nine non-negotiable architectural rules. **Read it first.** |
| `docs/noelia/NOELIA_CANONICAL_IDENTITY.md` | What NOELIA is and is not |
| `docs/noelia/NOELIA_SECURITY_MODEL.md` | Authorization, isolation and disclosure rules |
| `docs/noelia/NOELIA_MIGRATION_DISCIPLINE.md` | How migrations are written and applied here |
| `docs/noelia/NOELIA_TESTING.md` | Test commands, environments and expectations |
| `docs/noelia/NOELIA_TEST_ISOLATION.md` | The four isolation defects and the rules they produced |
| `docs/noelia/NOELIA_GRAPHIFY_ASSESSMENT.md` | Why a codebase-graph tool was rejected |
| `docs/noelia/NOELIA_AGENT_SKILLS.md` | The seven-stage skill lifecycle and its guards |
| `docs/noelia/NOELIA_SECURITY_ATTACK_MATRIX.md` | Prompt injection and the eighteen attacks |
| `docs/noelia/NOELIA_ZERO_COST_VERIFICATION.md` | Zero-cost enforcement and the attestation |
| `docs/noelia/NOELIA_FINAL_REPORT.md` | Current measured state and known limitations |

---

## 2. What this repository is

A Next.js 16 + TypeScript institutional operating platform (PostgreSQL via Drizzle), with a
Flutter `mobile/` app and static front-ends under `sectors/`.

The institutional shape is fixed and constitutional:

```
BEYU FAMILY TRUST → BEYU HOLDING COMPANY → COUNTRY HOLDING COMPANIES → SECTOR OPERATING COMPANIES
```

There are exactly **four** sector operating systems: `HEALTH_OS`, `FINANCE_OS`,
`AGRICULTURE_OS`, `UJENZI_OS`. The **Foundation** is a separate nonprofit sister
organisation, and the **Family Office** is shared — neither is a sector OS. Do not create
`FOUNDATION_OS` or `FAMILY_OFFICE_OS`. `CAP_POSTING` stays locked and fail-closed.

---

## 3. Where things live

| Path | Contents |
|---|---|
| `src/app/` | Next.js routes (App Router). Pages under `src/app/os/`, APIs under `src/app/api/v1/` |
| `src/lib/` | Domain services. `src/lib/noelia/` is the AI platform; `src/lib/noelia/cognitive/` is the cognitive core |
| `src/db/schema/` | Drizzle schema, one module per domain, re-exported from `src/db/schema.ts` |
| `drizzle/` | Numbered SQL migrations. `drizzle/meta/_journal.json` must stay in step |
| `scripts/` | Operational tooling (`migrate.ts`, `setup-db-role.ts`, `migration/integrity.ts`) |
| `tests/` | Vitest suites, mirroring the `src/lib/` layout |
| `sectors/` | Sector front-ends (static build artifacts are generated, not committed) |
| `mobile/` | Flutter application |

---

## 4. Non-negotiable rules for changes

### 4.1 Authorization is server-side, always

A hostname, route, agent identity, prompt, or user-supplied field never confers authority.
Every read and write resolves a `Principal` and a scope, and pushes the scope predicate into
SQL. Never rely on the UI to hide restricted data.

### 4.2 Tenant context is required, and missing context is an error

Database access that touches tenant data must run inside `withTenantDatabaseContext`. Code
that cannot find a context must **throw**, not default to an unscoped query.

### 4.3 Migrations

- Never `drizzle-kit push` against a real database.
- New migrations are additive. Do not edit an applied migration — add a corrective one.
  (`0084` must remain byte-identical; its ledger checksum depends on it.)
- The migrator splits on the `statement-breakpoint` comment marker and executes **one
  statement per fragment**. A file with no markers executes only its first statement while
  still recording itself as APPLIED. Every statement needs exactly one marker after it.
- **Never** put the marker token inside a comment — it splits the comment and yields
  SQLSTATE 42601.
- Runtime privileges are granted **only** by `scripts/runtime-privilege-allowlist.ts` +
  `scripts/setup-db-role.ts`. A `GRANT` inside a migration is reverted by that reconciliation —
  and worse, an **unguarded** one aborts the whole migration run on a clean install, because the
  runtime role does not exist when migrations execute (`setup-db-role.ts` runs in a later step).
  Classify each new table in the allowlist instead. If a role must be named at all, loop
  `FOR r IN SELECT rolname FROM pg_roles WHERE rolname = '…'` so an absent role is zero
  iterations, not `42704`. See `NOELIA_MIGRATION_DISCIPLINE.md` §5D.
- After applying, run `npx tsx scripts/migration/integrity.ts --with-ledger`.
- **Guard every `CREATE EXTENSION`.** A contrib extension (`pg_trgm`, …) created unguarded
  aborts the entire migration run on a build without it, or under a role that lacks the
  privilege. Wrap it in a `DO` block catching `insufficient_privilege` / `undefined_file`.
- **The history is expand-only.** `scripts/migration/expand-contract.ts` permits exactly one
  contraction in the whole history (`0001`), and `SET NOT NULL` counts as one. Add a column
  already constrained (`ADD COLUMN … text NOT NULL DEFAULT '…'`) instead of adding it nullable
  and tightening later. Verify with `npx tsx scripts/migration/expand-contract.ts`.

### 4.4 Zero cost is a hard constraint

NOELIA must never incur a charge. `src/lib/noelia/zero-cost-policy.ts` is the enforcement
point; the gateway refuses any model whose zero-cost verdict is not `ALLOWED`. Do not add a
paid SDK, a paid API call, a hosted vector store, a hosted embedding service, or code that
could silently begin billing. Do not add a paid fallback. A provider with a "free tier" is
not free — it is `UNKNOWN` until someone independently verifies it.

### 4.5 NOELIA is advisory

NOELIA may not approve investments, distributions, capital allocation, procurement,
construction, or post a financial transaction. It may not approve its own actions or bypass
human approval. Its output is a recommendation for authorized humans.

---

## 5. How to make a change

```
SPECIFY → PLAN → BUILD → TEST → REVIEW → SIMPLIFY → SHIP
```

`SHIP` stops at the human merge gate. Never merge, never deploy, never push to `main`.

### 5.1 Verify before you write

Run `npm run typecheck` first. A change that starts from a broken tree cannot be attributed.

### 5.2 Tests are contracts, not decoration

- **Prove the failure first.** If a test is failing before you start, show the baseline; do
  not "fix" it by loosening the assertion.
- Never delete a failing test, weaken an assertion, or add a skip to hide a failure.
- Never report a mock as integration evidence, or a structural check as a browser test.
- **A test that creates durable rows must pass twice in a row on a dirty database.**
- **A test that mutates durable rows it did not create must restore them**, in `beforeAll`
  as well as `afterAll`.
- **An immutability-protected table is not a fixture store.** `knowledge_sources` refuses
  `DELETE` unconditionally. Read it; never seed into it, and never disable its trigger to
  tidy up.
- **Date-dependent assertions are latent failures with a scheduled start time.** Do not
  compare a fixed seeded date against "today".
- Clean up by primary key. Never run a broad `DELETE` to make a suite pass.

### 5.3 Commands

```bash
npm run typecheck             # tsc --noEmit
npm run lint                  # eslint
npm run build                 # next build
npx vitest run <path>         # a single suite
npx vitest run                # the full suite (~30 min; do not run twice concurrently)
```

`NODE_OPTIONS="--max-old-space-size=3072"` is required for `tsc` and `next build`. Without
it the type check dies with an out-of-memory error that looks like a type failure.

Do not run `next build` while a test suite is executing against a live `next start` — it
rewrites `.next` underneath the running server.

---

## 6. Reporting honestly

The failure mode this repository has been burned by most is a green number over a wrong
value. Therefore:

- A capability that was not executed is `NOT VERIFIED`, not "implemented".
- A configured provider is `CONFIGURED`, not `CONNECTED` or `VERIFIED`.
- A structural HTML check is `PASS (structural)`, not a browser test.
- A local algorithm is described by what it actually is. A lexical hashing embedding is not
  a neural semantic embedding.
- If a tool, model or extension is unavailable in the environment, say so with the exact
  blocker and continue the work that does not depend on it.

---

## 7. Current known limitations (do not re-litigate without new evidence)

- No `pgvector` on this PostgreSQL build; vector search is an exact cosine scan over stored
  lexical embeddings, not an ANN index.
- No Ollama runtime and no local model in the development sandbox, so generative inference
  is `BLOCKED` here and every NOELIA answer in testing came from the deterministic analyst.
- No local neural embedding model. `embeddings.ts` is lexical by design and says so.
- Playwright/Chromium is unavailable, so responsiveness is verified structurally.
- Account-level cloud billing cannot be inspected from inside the application, so
  infrastructure cost is `NOT_INSPECTED`, not "zero".

See `docs/noelia/NOELIA_FINAL_REPORT.md` §21 for the full list.
