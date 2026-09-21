# Initial-charter validation checkpoint — 2026-09-20

This is source-specific evidence for **2dfd88ce905ad6dfbd1c087c3fab2efc4d9e41dc**,
not certification of later changes or the entire governance mission.

## Source and remote evidence

- Continuation started from 5ac90f2cc712582bde45cc0f2616937d856a6f71 with saved
  changes. Non-destructive recovery commit: 395552e452eb7beaae23bcb75c7ea247be20922b.
- Initial-charter implementation: 2dfd88ce905ad6dfbd1c087c3fab2efc4d9e41dc, pushed
  on arena/01a0bda3-beyu-os-1-0. Historical 0048–0052 SQL was not rewritten.
- At 18:29 UTC, GitHub run **35527569715** explicitly returned completed SUCCESS
  with all eight jobs successful, including root full regression/browser, P3,
  Health, critical dependency audits and secret scanning.
- Scratch run **35527569705** explicitly returned SUCCESS for PostgreSQL 16
  migration validation. Production drift, preflight, deployment, release-record,
  runtime and PVG jobs were SKIPPED. This is not production evidence.
- PR [77](https://github.com/yumvalila-bot/BEYU-OS-1.0/pull/77) was OPEN/DRAFT at
  that SHA; fetched main remained 5ac90f2cc712582bde45cc0f2616937d856a6f71.
- At 18:37 UTC the final PR query failed: **HTTP 401 Bad credentials**. Remote
  evidence above remains observed evidence; subsequent latest-main/PR refresh and
  publication require reconnecting GitHub in Arena. Local work continued.

## Complete local validation

Separate fresh database `beyu_charter_final_54`: all 54 canonical migrations,
runtime-role provisioning, seed, no-op rerun and ledger integrity passed.

- Full Vitest: **4,374 passed / 11 existing skipped**, 243 files passed / 3 skipped,
  970.34 seconds. The skipped files were the existing bootstrap enrollment,
  foundation and preparation suites, not new exceptions.
- Full Playwright: **29 passed**, one worker, 10.3 minutes. Includes complete
  nomination/approval/consent/activation/reload, expired/revoked/entity/country
  denials, establishment, initial-charter approval without activation, recusal,
  execution, simulation, history, responsive layouts and unauthenticated routes.
- Schema drift after the full suite: 361 database tables / 360 declared tables;
  149 informational differences, **zero blocking** differences.
- Integrity with ledger: 54 SQL files / 54 journal entries / 43 snapshots / 54
  ledger rows; **14 acknowledged historical debts, zero blockers**. No metadata
  collision was hidden or repaired to obtain a pass.
- Production build without database/auth secrets: passed. Typecheck: passed.
  Lint: zero errors, one existing image warning. Tracked secret scan: 2,051 clean.
- DB-free release checks: 182 passed / 6 expected skipped.
- Real predecessor 0000–0052 → 0053 test preserved historical charter fields and
  terms, retained null provenance, blocked legacy progression and proved no-op.

The first full local run was **4,373 passed / 1 failed / 11 skipped** because the
harness omitted `BEYU_RUNTIME_DB_NAME`; it expected `beyu_os` instead of the fresh
validation database. Setting only `PGDATABASE` did not fix this. After aligning
`BEYU_RUNTIME_DB_NAME`, seven credential checks and the complete rerun passed.
Neither application code nor the failed assertion was changed. Earlier invalid
SQL fixture enum attempts were also retained and corrected to the actual EXPIRED
value; no assertion was weakened.

Evidence logs are retained locally under ignored `tmp/governance/charter-*`.
They are not a substitute for production approval or a durable external artifact
store. CI's pinned-action Node runtime warnings and the existing lint warning
remain disclosed; critical-only dependency auditing is not proof of zero flaws.

## Boundary

0053 implements superior initial-charter approval, not effectiveness. A dormant
committee remains DRAFT; its initial charter becomes APPROVED, not ADOPTED. No
membership, RBAC, security/Finance capability or delegated authority is granted.
Consent-backed initial composition and atomic charter-effectiveness/body-ACTIVE
bootstrap remain engineering gaps, not external or human-approval blockers.
The wider lifecycle/calendar/notification/evaluation/competency/succession and
advanced assistive work likewise is not claimed complete.
