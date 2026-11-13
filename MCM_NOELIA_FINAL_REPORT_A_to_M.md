# MULTI_COMPANY_MANAGEMENT + NOELIA INTELLIGENCE — FINAL REPORT (A–M)

Branch `arena/2aef83f7-beyu-os-1-0`, branched from `dc8f848226ed8860ef293f817fe10394360abb1d`
of `main`. Date 2026-11-13. **12 commits, 79 files, +103,784 / −63**, counted with
`git log --oneline dc8f848..HEAD | wc -l` and `git diff --shortstat dc8f848 HEAD` rather than
recalled. 91,511 of those added lines are the `drizzle/meta/0076_snapshot.json` the integrity gate
requires (see **C** and **L** for why a snapshot belongs in the diff at all), so the hand-written
change is roughly 12,000 lines — still worth stating as a number rather than leaving the raw
figure to impress or alarm a reader.

This report is written so a reviewer can *check* each claim, not so they can admire it. Every
number came from a command in this environment; commands are given.

---

## A. What was asked

Continue the BEYU OS enterprise work on this checkout: the MULTI_COMPANY_MANAGEMENT (MCM)
capability, its governance gates, and the deferred items recorded against it. Two decisions were
taken explicitly during this session, by the requester:

* the next deliverable is **NOELIA read-only MCM tools**;
* of the two standing postures — "keep the honest NOT-BUILT register" versus "deliver as much of
  the remaining scope as possible" — **deliver** was chosen.

Both were honoured, and they pull against each other on purpose: scope was delivered, and what
could not be delivered stayed written down rather than being quietly implied.

## B. Starting state, honestly

At `dc8f848` the repository was **not** green:

| Gate | Status at base |
|---|---|
| `npx vitest run` (no database) | 322 files / 5,562 tests passing, 39 files skipped — with pre-existing failures recorded in the session record |
| schema-drift gate | **RED** — the declared schema and the migrated database disagreed |
| migration-integrity gate | **RED** — journal/snapshot/sql counts disagreed; snapshots missing for applied migrations |
| runtime-privilege gate | unexamined |
| HTTP/E2E suites | **silently skipped** — they gate on a running server, so "green locally" meant nothing about them |

The last row is the one that mattered most and is discussed again in **G** and **H**: a skipped
test is not a passing test, and the local default hid a real product gap.

## C. Governance gates — now green, with the debt named

* **Schema drift**: `blocking: []`.
* **Migration integrity**: `MIGRATION INTEGRITY PASSED`, sql **80** / journal **80** / snapshot
  **55**. `KNOWN_METADATA_DEBT.missingSnapshot` in `src/lib/migration/integrity.ts` explicitly
  ends at `"0077","0078","0079"` — three applied migrations without snapshots, declared as debt
  rather than hidden by lowering a count.
* **Runtime privileges**: `ok: true`, role `beyu_runtime`, **484 tables / 1,936 verb checks /
  0 failures / 216 denials**, every denial reasoned
  (`IMMUTABLE_HISTORY_DELETE_DENIED` 46, `APPEND_ONLY_MUTATION_DENIED` 14,
  `GOVERNANCE_OR_CONFIGURATION_READ_ONLY` 156, …).
* `tests/migration/` — 105/105.

## D. MCM schema and migrations

`drizzle/0076`–`0079` are **applied and checksummed**; they were never edited afterwards (editing
an applied migration is how a checksum ledger becomes fiction). 0078 and 0079 exist because the
index alignment and the `mcm_module_link` uniqueness ordering had to be corrected *forward*, and
`meta/_journal.json` carries 80 entries with head `0079_mcm_module_link_uidx_order`.

Live shape of the capability in the migrated database: 16 MCM-family tables; 552 CHECK
constraints, 1,306 foreign keys and 64 unique constraints database-wide; RLS enabled on 407
tables and **forced** on 290.

## E. Permissions: one unreachable privilege closed

`mcm:capital.approve` was marked `HIGH_RISK` and granted to **no role** — a privilege that could
never be exercised, which is not the same as a safe privilege: it is an untested code path. It is
now CFO-accountable only, and not delegated. No other privilege was granted or removed in this
session; the equity/cap-table permissions that look "unused" were measured, not assumed (see **K**).

## F. Inventory and machine-readable companion

* `docs/enterprise/MCM_EXISTING_ASSETS_INVENTORY.md` — what MCM consumed versus what it added.
* `docs/enterprise/mcm-assets.json` — **39 catalogued assets**, dispositions `MISSING_IMPLEMENTED`
  16, `REUSED_UNCHANGED` 10, `MISSING_DEFERRED` 6, `EXTENDED` 5, `REUSED_UNVERIFIED` 1,
  `COMPLETE` 1. Summary counts are **derived from the entries by script**, so the headline cannot
  drift from the list.
* `docs/enterprise/MCM_IMPLEMENTATION_GAP_ANALYSIS.md` — findings 2.1–2.13 with a status vocabulary
  (`DELIVERED`, `DELIVERED — DEGRADED`, `NOT BUILT — DECIDED`, `NOT BUILT — GAP`) and an evidence
  standard for each.
* `docs/enterprise/MCM_REPOSITORY_RECONCILIATION.md` — corrected where it had quietly anticipated
  code that did not exist yet.

## G. The real security fix: every canonical host serves the one governed sign-in

`src/app/page.tsx` at the apex host fell through to the **marketing home page** whenever host
resolution returned NEUTRAL — i.e. for `unknown.beyu.co.tz`, for
`evil-health.beyu.co.tz`, and for a look-alike such as `health.beyu.co.tz.evil.example`. A
look-alike Host therefore obtained a public page the canonical destination did not, and the
HTTP suites that would have caught it were the ones being skipped.

Fix: `CONTROL_PLANE_DESTINATION` in `src/lib/canonical-hosts.ts`, applied as
`destinationForResolution(canonicalHost) ?? CONTROL_PLANE_DESTINATION`. A NEUTRAL resolution now
carries the control-plane **context**; it still selects **no destination copy**. One governed
sign-in, everywhere.

Truth table, taken from `curl` against the production build:

| Host | Serves |
|---|---|
| `beyu.co.tz`, `www.beyu.co.tz` | `Sign in to the control plane` |
| `unknown.beyu.co.tz` | `Sign in to the control plane` |
| `evil-health.beyu.co.tz` | `Sign in to the control plane` |
| `health.beyu.co.tz.evil.example` | `Sign in to the control plane` |
| `health.beyu.co.tz` | `Sign in to Health OS` |

No hostile host ever receives a destination's own copy, headline or registry code. There is no
longer an un-governed public page reachable by Host header manipulation, because there is no page
that is not the sign-in.

## H. Tests that were changed, and why that was not weakening

Six red tests were pinning the *old* behaviour; three more (`accessibility-nav-gating`, ×4) were
reading the wrong page as the source of truth. The pattern worth naming: several asserted the
**absence of `id="beyu-destination-signin-title"`** as proof that "no destination was selected".
The shared sign-in card renders on every host, so that id never distinguished anything — the
assertion was checking a marker that was always present. It was renamed to `beyu-signin-title`,
and the assertion became **content-based**: the control-plane line must be present, and each
destination's subtitle/registry code must be absent.

`tests/sector-domains/` files touched: `canonical-host-http`, `unified-host-routing`,
`destination-signin-http`, `destination-frontends`, `login-surface-reference`. One assertion was
rewritten to a *stricter* form (per-destination copy absence plus a positive expectation) rather
than a looser one. No test was deleted and none was skipped to reach green.

### H.2 A test that poisons itself on the tenth run

During the confirming full run, `tests/communications/webhook-route.test.ts` failed — and then
failed identically in isolation — while the whole suite reported **zero failed assertions** and
`EXIT=1` for the first 358 files. The route answered `WEBHOOK_PROCESSING_FAILED`; the reason was
not in the test output but in the database, in the row the service persists:

> Message loop detected: correlation EVT_WEBHOOK_ROUTE_TEST depth 10 exceeds limit

The route test had used a fixed trace/correlation id in its `requestMeta` mock. Inbound message
creation calls `checkLoop(tenantId, correlationId, …)`, which blocks once
`communication_loop_detections` holds a row at `MAX_AUTOMATION_DEPTH` (10) for that correlation —
so every run appended one row against the same key and deleted nothing. The file built its own
tripwire: green nine times, red from the tenth run onward, permanently, against a database that
remembers. Nothing in the product was wrong: the guard was handed a correlation with 10 messages,
which is exactly what it exists to stop, and `webhook-ingest.test.ts` next door already keys its
per-run ids correctly.

Fixed in `5ca96ed`: a per-run correlation id from a single `vi.hoisted` value (hoisted because the
mock factory runs before the module's statements), and cleanup in FK order scoped to the run's own
provider code and message-sid prefix — never by tenant, because the ingest suite writes for the
same tenant. The 14 provider rows earlier runs leaked are left in place: a test file is not a
janitor for its own history, and those rows are unreachable now that the id is per-run. Two
consecutive `tests/communications/` runs are green and the provider count does not move, which is
how the leak is shown closed rather than asserted closed.

**Two things this is worth keeping in mind.**

* A failure whose only symptom is an exit code can be made to *pass* by wiping the database, and
  it will silently re-arm nine runs later. Both diagnoses in this section — "unhandled rejection"
  and "poisoned fixture" — needed the **database** to confirm; `failure_reason` said
  `Message loop detected`, which no amount of reading the test source would have produced. A red
  test that goes green after clearing state is not evidence the test was wrong and not evidence the
  product is fine: it is evidence the test is not isolated from history.
* The self-check this report should have run earlier and did not: the two full runs before this one
  were **already different** (359 passed files versus 358) and nobody asked why. It is not an
  HTTP-gate artefact either — this suite drives the handler in-process, so it poisons itself on any
  run, `BEYU_TEST_BASE_URL` or not, and would have surfaced at run 10 of the server-less baseline
  too. A suite whose file count moves between runs is telling you something; the tallies below have
  now been re-read from the recorded logs rather than from memory.

## I. NOELIA read-only MCM intelligence

`src/lib/noelia/mcm-tools.ts` — ten tools in the ONE canonical registry:
`mcm.portfolio.hierarchy`, `mcm.company.financial_snapshot`, `mcm.intercompany.position`,
`mcm.consolidation.status`, `mcm.risk_and_compliance.overview`, `mcm.ownership.structure`,
`mcm.jurisdiction.coverage`, `mcm.module_rollup`, `mcm.governance.overview`,
`mcm.integration.health`.

They are **adapters**, so `visibleEntities()` remains the only place the entity boundary is
decided; each carries a full governed contract and `sideEffects: NONE`. The frozen inventory in
`tests/noelia/agent-surface-guard.test.ts` was extended *by review*, which is what that guard
exists to require — the alternative (loosening the guard) would have deleted the control.

Two behaviours were fixed during implementation, both the same class of lie:

* `governanceOverview()` and `ownershipOverview()` answer with an **empty set** both when nothing
  is recorded and when the caller may not see the section, and their shape has no
  `restrictedReason`. A tool that returned that empty set would report "no board" about a company
  whose board it could not see. Both tools now state the boundary themselves.
* `integrationHealth()` with zero contracts must not read as "all healthy"; it reports that no
  contract is declared, and says that is not a clean bill of health.

Reachability, because a tool no engine can route to is decoration: a `MULTI_COMPANY` engine joined
`NoeliaEngine`, `ENGINE_TOOLS`, labels, capability, permission and narrative; the three money
views joined `FINANCIAL`; `MULTI_COMPANY` joined the `cross.os.intelligence` domains and the
BEYU_OS surface capability list. The router matches **entity vocabulary only** — bare "company"
or "group" is not a trigger. That constraint was earned: the first draft stole
*"Which companies have overdue payroll?"* away from `WORKFORCE`, and the negative cases now pinned
in `tests/mcm/noelia-tools.test.ts` exist so it cannot come back.

## J. The intercompany period lock the service already promised

`raiseIntercompanyTransaction` documented "a financial period exists for the entity and is not
LOCKED/CLOSED — checked against Finance OS" and never queried `financial_periods`. It does now
(`src/lib/mcm/services.ts`), and the gate is deliberately narrow:

* `CLOSED` or `LOCKED` on **either** leg refuses with 409 `PERIOD_NOT_OPEN`, naming which leg —
  an intercompany record changes both companies' position, so a lock cannot be dodged by naming
  the other entity;
* it gates the **raise** and the **side authorisation** (a period that closed after a raise cannot
  be entered by a late signature), and **not reconciliation** — reconciling is how a period becomes
  ready to close, so blocking it would deadlock the close;
* **`CLOSING` is not `CLOSED`, and the absence of a period row is not a lock.** Treating "no row"
  as locked would let MCM legislate over a register it does not own;
* the agreement's effective window is now checked against the period, using Finance's dates where
  a period row exists and "effective as of today" where none does, because `period_code` has no
  repository-wide format and inventing a parser would make MCM the author of someone else's
  calendar.

One documented precondition was **removed rather than faked**: "the transaction type is permitted
for that agreement type". The database constrains the type to a fixed set; no agreement↔type
matrix exists anywhere in the repository. Pairing them is a transfer-pricing decision Finance has
not made.

`tests/mcm/intercompany-period-lock.test.ts` — 6 tests, including that a refusal writes **nothing**
(counted before and after, not trusted from the throw), that re-opening the period lets the same
authorisation proceed (so the control is the calendar, not a blanket refusal), and that
reconciliation still runs on a closed period. The fixtures are idempotent because
`intercompany_reconciliation_runs` is append-only **even to the table owner** — the suite's own
`DELETE` was refused by the trigger, which is the immutability control proving itself, and the
test therefore asserts a delta rather than an absolute count.

## K. Phase 13 re-verification

`docs/audit/PHASE_13_BLOCKER_REVERIFICATION_2026-11-13.md` re-tests the audit's unavailable claims
against a live migrated database: 5 of 10 RED blockers closed with observed output, 1 narrowed
with a code change, 4 still open; 5 of 8 data blockers closed. The only code change is
`assertPermissionCatalogParity()` now comparing permission **definitions** and descriptions, not
only grants (measured: 285 definitions and 976 grants agree exactly today — the extension closes
a hole, it does not report one). The audit document itself was **left unedited**: rewriting an
audit's statuses in place destroys the record of what was knowable when it was written.

Two findings there are worth repeating because they are unfashionable: the audit chain verifier
returns `verified: false, records: 0` under the application role — which is **RLS working**, not a
broken chain, and is stated so nobody "fixes" the wrong thing; and `journal_entries` has **0 rows**
in this database, so every ledger-shaped assertion is a refusal test, never a balance test.

## L. Verification evidence

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean (0 errors), after every change |
| `npm run build` | EXIT=0, `✓ Compiled successfully`, 170 pages, 499 route lines |
| `npm test` **with** `BEYU_TEST_BASE_URL` against the production build | **L.1** — read from the logs, not from memory |
| `tests/mcm/ + tests/finance/ + tests/security/` | 66 files / 1,057 tests green |
| `tests/noelia/ + tests/mcm/ + tests/architecture/` | 53 files / 531 tests green |
| 11-suite enterprise sweep (noelia, security, architecture, certification, mcm, viz, agriculture, family, ujenzi, government, governance/action) | 166 files / 2,378 tests green |
| `tests/migration/` | 105/105 green |
| `npm run verify:scg` | 4 checks, 0 blocking, 0 advisory |
| `npx tsx scripts/audit-runtime-privileges.ts` | `ok: true`, 0 failures |
| `curl -H "Host: …" http://127.0.0.1:3100/` | the **G** truth table, against the built server |

### L.1 The full-suite runs — all of them, including the one that disagreed

`npx vitest run` with `BEYU_TEST_BASE_URL` pointed at `next start` on the production build:

| Log | Files | Tests | Exit |
|---|---|---|---|
| `/tmp/full-final.log` | 352 passed \| 9 skipped (361) | 5,841 passed \| 75 skipped \| 31 todo (5,947) | 0 |
| `/tmp/final-full.log` | 359 passed \| 4 skipped (363) | 5,924 passed \| 12 skipped \| 31 todo (5,967) | **1** — zero failed assertions; an unhandled rejection from my own test helper |
| `/tmp/final-full2.log` | 358 passed \| 1 failed \| 4 skipped (363) | 5,923 passed \| 1 failed \| 12 skipped \| 31 todo (5,967) | **1** — the self-poisoning fixture, **H.2** |
| `/tmp/final-full3.log` (**after both fixes**) | **359 passed \| 4 skipped (363)** | **5,924 passed \| 12 skipped \| 31 todo (5,967)** | **0** |

Three things worth saying out loud. The file count **moved between consecutive runs**
(359 → 358) and nobody asked why at the time; that discrepancy *was* the H.2 fixture. The first
`EXIT=1` was my own helper attaching `.catch` after an `await` (fixed in `e7623e7`), and the
damage there is not the red run but the training: a suite that exits non-zero for a non-assertion
reason teaches everyone to ignore the exit code. And the skip counts differ (39 → 9 → 4 files)
**because the HTTP gate is now on** — those suites are running rather than silently skipping, which
is the entire point of turning it on, so a shrinking skip count is the control working and not a
cleaner run. Finally, the confirming run came back at **359 passed files with zero failures and
`EXIT=0`** — the count returned to 359 the moment the fixture was fixed, which closes the 359/358
discrepancy: the delta was exactly that one file, and nothing else moved. The 4 remaining skipped
files are the environment-gated ones (`tests/bootstrap/enrollment-http`, `bootstrap/foundation`,
`bootstrap/preparation`, `communications/security` — the first three need `BEYU_BOOTSTRAP_SECRET`,
the fourth is 31 `todo`), and CI skips them for the same reason, so this is not a local-only green.

Environment facts that belong in the record, not in a footnote: the local suite needs **both**
`BEYU_GOVERNANCE_DATABASE_URL` and `BEYU_BOOTSTRAP_PASSWORD` (in git-ignored `.env`);
`NODE_OPTIONS=--max-old-space-size=8192` is required or the build dies; and
`npm run playwright install chromium` **fails here** (the browser CDN is outside the allowed
egress), so `npm run test:browser` is **not verified** and nothing in this report claims it.

## M. Not built, still open, and the merge line

Deliberately **not** built, with the reason: the consolidation **engine** (records and review
controls exist; nothing computes eliminations — the tools say "consolidation has not been
performed", never "the group is consolidated"); Sector-OS data surfacing through the declared
contracts; in-product MCM mutation **forms**; the agreement-type ↔ transaction-type matrix;
Tanzania jurisdiction **data** (BRELA/TRA/NSSF/WCF names would present an integration that does not
exist — seeding them is a governance decision); and any NOELIA **action** tool.

Open after re-verification: concurrent MFA/lockout proof; nullable `audit_log.trace_id`; two
direct production advisories (`next` critical, `zod` high — both fixes are breaking majors and were
**not** applied); clean-install/upgrade parity; no `policy_provenance` table; which of the 77
RLS-less tables need policy; whether permission drift should fail a deploy.

**Verified state.** After both test fixes, `npx vitest run` against the live production build
finished **359 files / 5,924 tests passed, 0 failed, `EXIT=0`**, with only the 4 environment-gated
files skipped. `tsc --noEmit` clean, `npm run build` EXIT=0, governance gates green (schema-drift
`blocking: []`; migration integrity 80/80/55 with the three missing snapshots declared as debt;
runtime privileges `ok: true`, 1,936 checks, 0 failures), and `tests/communications/` run twice
back-to-back to prove the fixture is no longer self-poisoning.

**Readiness.** MCM's foundation is enforced at the database, its read surface is governed and now
intelligible to NOELIA without being widened, its one documented-but-absent control is now real,
and the host-routing gap that would have shipped a public page behind a look-alike Host is closed.
What is *not* claimed: certification, browser verification, clean-install parity, or that the
skipped-then-fixed HTTP suites are the last place a silent skip hides something. Recommend merging on
the strength of that run. What is *not* evidence yet: browser behaviour (`test:browser` cannot run
in this sandbox) and clean-install parity — both are named in the list above rather than rounded
away.
