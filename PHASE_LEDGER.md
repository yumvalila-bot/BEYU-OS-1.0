# BEYU OS — Program Phase Ledger

Persistent ledger for the autonomous implementation program. One entry per
phase: starting SHA, objective, what was reused, implemented, tested, CI
evidence, merge commit, production evidence, remaining gaps. Never rewritten
retroactively; each phase appends its entry.

Evidence levels: `VERIFIED LOCALLY` / `VERIFIED IN CI` / `VERIFIED IN STAGING`
/ `VERIFIED IN PRODUCTION` / `IMPLEMENTED — AWAITING HUMAN ACTION` / `NOT
IMPLEMENTED — BLOCKED` / `NOT APPLICABLE`.

---

## P1 — Reality correction + release invariants — COMPLETE

- **Starting SHA:** `ac9b5884` (origin/main at audit time)
- **Merge:** PR #71, merge commit `ae09d53`
- **Report:** `P1_IMPLEMENTATION_REPORT_2026-09-18.md`
- **Outcome:** F-01…F-08 re-verified and classified; ARCHITECTURE_INVARIANTS,
  RELEASE_CONTRACT, RUNTIME_IDENTITY contracts pinned; stale CI migration
  labels corrected with a rot-proofing test.

## P2 — Migration integrity + drift gate — COMPLETE

- **Starting SHA:** `ae09d53`
- **Merge:** PR #72, merge commit `9e83967`
- **Report:** `docs/migration/P2_MIGRATION_INTEGRITY.md`
- **Outcome:** truthful migration integrity + drift detection; 0045 added;
  known metadata debt pinned in a register that fails on unacknowledged growth.

## P3 — Release orchestration + PVG + canary + blue/green — COMPLETE

- **Starting SHA:** `9e83967`
- **Merge:** PR #73, merge commit `4c3f940`
- **Report:** `P3_IMPLEMENTATION_REPORT_2026-09-18.md`
- **Outcome:** canonical release state machine (12 states, fail-closed),
  release identity build capture + `/api/health/identity`, PVG (10 checks),
  canary/blue-green governance with provider-neutral adapter boundary
  (truthful `isRealInfrastructure=false`), expand/contract gate, release
  evidence types, governed rollback semantics, observability builders,
  migration 0046 (6 release-governance tables), CI release-governance job.
- **CI:** all gates green on PR #73 (root security gate 17m, health backend
  real-PG gate, migration validation, secret scan, dependency audits,
  release-governance job).
- **Production evidence (post-merge, authorized automation):** db-release run
  deployed 0046 to production Supabase with fingerprint match; runtime
  verification reported `/api/health` database UP.
- **Remaining gaps carried to P4:** DB persistence of release state (API used
  in-memory history), release approvals, PVG wired into the pipeline, DB
  compatibility gate.

---

## P4 — Production release control — IN PROGRESS

- **Starting SHA:** `4c3f940` (origin/main after PR #73)
- **Objective:** make release control persistent, approved, and
  pipeline-verified — no in-memory release state, no unverifiable PVG, no
  unapproved controlled transitions.
- **Existing capabilities reused:** P3 state machine/identity/PVG logic, P2
  migration integrity + debt register, canonical audit (`recordAudit`,
  `verifyEventChain`), `guarded()` RBAC, db-release pipeline (scratch
  preflight fingerprint outputs), runtime-role grant pattern (0044).
- **Implementation:**
  - `0047_release_approvals.sql` — `release_approvals` table (scope,
    decision, four-eyes-capable, mandatory justification, optional expiry) +
    minimal runtime-role DML on the release-governance plane (append-mostly;
    no DELETE anywhere; F-01 protections untouched).
  - `src/lib/release/approvals.ts` — four-eyes approval matrix
    (PROMOTED/SWITCHED→PROMOTE, CONTRACTED→CONTRACT), expiry/revocation
    supersession, fail-closed evaluation; approval ≠ authorization.
  - `src/lib/release/store.ts` — the ONE persistence layer for release
    records, transitions (append-only, idempotent), PVG runs, approvals,
    canary/blue-green/rollback instruments.
  - Transitions API — persisted ledger + approval gate + denial auditing;
    releases listing endpoint.
  - Approvals API — record/revoke/list with mandatory justification, audited.
  - `src/lib/release/live-pvg.ts` — live probes (DB connectivity, migration
    ledger fingerprint, schema fingerprint, CAP_POSTING lock, RLS enforcement,
    runtime-role privilege, Noelia/HIVE boundary, event chain head);
    fail-closed defaults.
  - PVG API — runs against live state (P3 hard-coded values removed) and
    persists every run.
  - `scripts/release/pvg-cli.ts` — production PVG runner for CI: identity
    convergence polling (12 min), expected-vs-live migration compatibility,
    deterministic-id ledger persistence, sanitized annotations, exit 0 only
    on PASS.
  - `db-release.yml` — new `pvg` job (needs deploy + runtime-verify +
    preflight-repo) with evidence artifact; PVG red ⇒ pipeline red.
  - `verifyP2MigrationIntegrity` — no longer a placeholder; counts the real
    inventory via the canonical P2 reader.
- **Tests:** `tests/release/approvals.test.ts` (DB-free matrix),
  `tests/release/store.test.ts` (DB-backed persistence contract),
  `tests/architecture/p4-release-control.test.ts` (pins), expand/contract
  test updated to the real inventory (48).
- **CI:** release-governance job runs the P4 DB-free suites; root gate runs
  the DB-backed store suite on real PostgreSQL; scratch migration validation
  applies 0047.
- **Merge commit:** _pending_
- **Production evidence:** _pending — PVG job executes on next main push_
- **Remaining gaps:** promotion execution (traffic) remains at the P3
  human-controlled adapter boundary by design; real traffic adapter activation
  awaits platform credentials/human decision.

---

_P5+ entries appended as phases complete._
