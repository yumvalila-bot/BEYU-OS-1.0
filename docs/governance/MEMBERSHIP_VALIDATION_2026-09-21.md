# Membership lifecycle — completed local validation checkpoint

Date: **21 September 2026, Africa/Dar_es_Salaam**. Logs use UTC on 20 September.
This is governance within BEYU OS's shared constitutional control plane, not a
separate operating system. Production promotion remains human-controlled.

## Source, recovery and publication

- Restored checkout START: `5ac90f2cc712582bde45cc0f2616937d856a6f71`, with the
  saved governance working-tree changes. Nothing was reset or discarded.
- `843a130` preserves that restored snapshot; normal merge `6883d8f` reconciles
  the already-published branch history, including `408310b` body activation.
- Membership implementation: `c0c490a2b3d1406c5359d1db01961d82bb6d1827`.
- Historical personal-ballot repair and **tested source checkpoint**:
  `ff39485a4a943599b11e6b3a9705f1e09c67f9c6`.
- Both implementation and repair were pushed to
  `arena/01a0bda3-beyu-os-1-0`. That exact remote HEAD was subsequently verified.
- Last successfully verified main:
  `5ac90f2cc712582bde45cc0f2616937d856a6f71`.
- [PR 77](https://github.com/yumvalila-bot/BEYU-OS-1.0/pull/77) was verified
  **OPEN / DRAFT**, targeting main from this session's fixed branch.

This checkpoint document follows the tested code. It does not change application,
test, workflow or migration behaviour. Publication of the checkpoint itself and
final remote reconciliation require the restored GitHub connection described below.

## Completed local proof — not just focused tests

The production build of `ff39485` ran against freshly created
`beyu_membership_complete_58`: PostgreSQL 16.14, all **58 migrations**, normal runtime
role provisioning and seed. The database used by the deliberately interrupted
older run was not reused for this complete proof.

| Gate | Observed result |
| --- | --- |
| Full `npm test` | **4,470 PASS**, 11 existing optional skips; 257 files passed / 3 skipped; **1,003.19 seconds** |
| Complete `npm run test:browser` | **33 PASS**, **13.6 minutes**, exit 0 |
| Optional foundation/preparation suites | **6 PASS**, 2 files, on a separate all-58-migrations, initially unseeded disposable database |
| Optional administrator enrollment HTTP suite | **5 PASS**, including real MFA enrollment, sealing and subsequent authentication; separate runtime server/database |
| Typecheck | PASS |
| Secret-free production build | PASS; runtime/admin/test database URLs, auth/MFA secrets and bootstrap password were blank during the build |
| Lint | PASS, zero errors; one existing `no-img-element` warning in `noelia-cross-os-visual.tsx` |
| Tracked-file credential scan | PASS; no literal credentials detected |
| Migration integrity against the complete database | 58 SQL files / 58 journal entries / 58 ledger rows / 47 snapshots; **zero blocking issues** |
| Schema drift against the complete database | 363 database / 362 declared tables; 154 informational differences, **zero blocking differences** |
| Post-test migration reapplication | PASS; unchanged fingerprint `ac66c093cf4e9648ae230a1ae10163dd` |
| Runtime health after testing | `ok: true`, database `UP` |
| Diff whitespace check | PASS |

The full suite's 11 skips are explicitly identified, not concealed: four tests in
`bootstrap/foundation.test.ts`, two in `bootstrap/preparation.test.ts`, and five in
`bootstrap/enrollment-http.test.ts`. The first six require an explicitly named
empty disposable foundation database; the last five require a matching runtime
bootstrap secret. **All eleven were subsequently executed successfully in their
proper isolated configurations.** This is supplemental proof, not a claim that
the original full invocation reported zero skips. No skip condition, assertion,
CI tolerance or security check was weakened. The temporary enrollment server was
stopped after testing; it did not modify the main governance proof database.

The 14 acknowledged historical migration metadata debts remain unchanged and
visible, including the old 0038/0039 snapshot collision. No historical SQL,
snapshot debt or applied ledger was regenerated or repaired to make a gate pass.

## Membership, authority and history evidence

The 11 service cases, 10 non-owner SQL cases, one real predecessor upgrade and four
HTTP cases are included in the full regression above. The membership browser test
is included in the complete 33-test browser run.

- Voluntary resignation is restricted to the affected human, including resignation
  from suspension. No superior can impersonate the member's consent.
- Suspension/removal/reinstatement require the established committee's recorded
  BOARD/TRUSTEES superior, exact request-specific RESERVED_MATTER decision, current
  authority and independent application. The proposer and affected person cannot
  independently apply the request. Recusal/decision provenance remain enforced.
- Unknown/caller-forged authority, wrong-person resignation, missing MFA, wrong
  document scope, stale revisions, wrong decisions and non-presiders are denied.
- Expired/revoked grants are rechecked at execution. Browser controls left open
  before expiry do not preserve authority. Restoring a valid grant permits retry
  with the same unchanged idempotency key, not a duplicate transition.
- Concurrent suspension has one successful transition. Transaction failures roll
  back canonical membership, immutable evidence, audit and event state together.
- Resignation/removal/suspension can leave invalid composition. The child then
  fails closed; quorum is not invented to retain activity. Superior-authorized
  reinstatement requires a valid resulting composition and the original term.
- Original membership fields, appointments, decisions, ballots and role assignments
  remain unchanged. Expiry is derived from the original dates; reinstatement is
  **not** renewal. Applied human party identity is captured immutably.
- Scoped history remains readable. Original finalized quorum and personal ballots
  survive suspension/resignation without restoring live voting authority.
- Every material transition retains audit plus the existing correlated/caused
  shared governance event. Membership creates no RBAC, security, Finance or
  delegated-authority grant, and does not unlock CAP_POSTING.

### Actual SQL and migration boundary

Post-test catalog verification confirmed `beyu_runtime` has no superuser,
BYPASSRLS, CREATEROLE or CREATEDB privileges. `governance_members`,
`governance_membership_changes` and `resolution_votes` all retain enabled **forced
RLS**. Privileged fixture setup is separate from runtime HTTP and non-owner SQL
probes; service tests alone are not presented as RLS proof.

The non-owner SQL matrix verifies missing-context and tenant/entity/classification
isolation, forged-actor/transaction-flag denial, exact decision linkage, immutable
evidence, UPDATE/DELETE restrictions and rejection of a partial COMMIT. The only
membership UPDATE exception is the exact paired lifecycle projection. Inactive
members' historical ballots remain readable, but new ballot INSERT/UPDATE is
rejected with SQLSTATE `42501`.

The real 0000–0056 → 0057 upgrade preserves predecessor history, applies ACTIVE /
revision-zero defaults without inventing transitions, retains all 58 ledger rows,
and proves reseeding cannot resurrect a governed resignation. The predecessor
fixture uses version-stable original-column SQL instead of future ORM columns;
its guards and preservation assertions are not disabled.

New immutable forward migration:

`0057_governance_membership_lifecycle.sql`

SHA-256: `eb315b7a0afd08c0fe745e2d74a590995d672f658ce1de6f91b105aea0dd2ba0`.

Previously published 0048–0056 migrations were not rewritten. In particular, the
verified original 0051 checksum remains
`bf2d3f13a8365c9bbeefa2347f31a8c8157b16e6839dd8b9008fb7b45e2b6ecf`.

### Complete browser coverage

The entire suite exercised actual nomination → independent approval → nominee
consent → activation → visible membership; expired/revoked/wrong-entity/
wrong-country approval and activation denials; non-presider nomination and
non-nominee consent denial; immutable appointment-origin identity; superior body
establishment; initial charter approval; atomic initial body/composition activation;
charter adoption; independent action verification; recusal; non-mutating preflight;
exact proposal links/retry; and shared navigation, responsive, public, dark-mode
and unauthenticated deep-link controls.

The new membership browser path proves superior suspension → expired-applier
denial → same-key authorized retry → denied live presiding authority → denied
other-person resignation → independent reinstatement → personal resignation →
backend-authoritative history after reload.

## Regression found and repaired, not hidden

The first broad run was intentionally stopped after identifying a real regression:
a finalized personal **FOR** ballot became `null` when its member was suspended,
even though the historical quorum was preserved. That stopped run is **not**
counted as a complete result.

A reproducing test failed before the repair. `ff39485` separates historical personal
ballot selection from current eligible-seat selection. Retained assertions verify
the original FOR remains visible after suspension and resignation while
`canVote` is false, with the original quorum unchanged. The new historical fixture
also exposed a cleanup foreign-key error; cleanup now removes only its scoped
child-member ballots before removing those fixture members, without disabling
constraints. The repaired 91-test authority regression and the subsequent complete
4,470-test / 33-browser runs pass.

## Observed CI versus unavailable final reconciliation

For the exact tested source `ff39485`:

- [Root CI run 35541185081](https://github.com/yumvalila-bot/BEYU-OS-1.0/actions/runs/35541185081)
  was last observed **in_progress**, at its full PostgreSQL-backed root regression
  step. The Health backend gate, Health frontend verification, committed-secret
  scan, three production-dependency audits and P3 DB-free release-governance job
  were already observed **SUCCESS**. **Final root CI success is not claimed.**
- [Database-release run 35541185084](https://github.com/yumvalila-bot/BEYU-OS-1.0/actions/runs/35541185084)
  was observed **completed SUCCESS**. Its job-detail query later failed with 401;
  this workflow result is not represented as production deployment evidence.
- Earlier manual root-workflow dispatch returned **403 Resource not accessible by
  integration**. Ordinary push/read still worked then, and automatic PR workflows
  subsequently ran. That dispatch-permission issue was not a source/test failure.
- Later GitHub authentication actually failed. At **2026-09-20T22:38:40Z**, a fresh
  root-run API query returned **HTTP 401: Bad credentials** (exit 1); `git ls-remote`
  returned exit 128: `could not read Username for 'https://github.com': terminal
  prompts disabled`. Thus final main/PR/CI reconciliation and report publication
  cannot be asserted from earlier observations.

GitHub needs reconnection in Arena; no credentials were requested or exposed.
Local engineering continued after the authentication failure: every browser test
finished, all eleven optional bootstrap tests passed in isolation, and the runtime
role, health and migration no-op checks completed. The connection failure is a
**publication/observation boundary only**, not a reason to mark unfinished
engineering complete. No production promotion or protection bypass was performed.

## Scope still incomplete — engineering, not external blockers

- **Implemented, bounded:** superior committee establishment, initial charter and
  appointment/consent/composition activation; membership resignation, suspension,
  removal and reinstatement; historical evidence and current-authority separation.
- **P1 remaining:** separately consented renewal/successor terms, generalized vacancy
  recovery, root-body superior-authority modelling, body suspension/dissolution/
  archive, first-class reserved/independence/competency/geography seats, competency
  development and succession, and the fuller linked meeting/notice/acknowledgment
  lifecycle. Existing meeting paths were regression-tested, not declared complete.
- **P2 partial:** resolution/action/evidence/independent-verification paths exist and
  were tested; shared calendar, delivery/acknowledgment/escalation, evaluations and
  reporting still require engineering.
- **P3 partial:** the non-mutating preflight boundary was tested. Full simulation,
  maturity/analytics, justified knowledge graph and advanced assistive Noelia/HIVE
  are not declared implemented. Noelia/HIVE remain non-authorizing.

Local detailed logs are under ignored `tmp/governance/membership-*`; private
configuration files are mode 0600 and are not committed. The report records their
outcomes, not a claim that local logs are uploaded CI artifacts or production proof.
