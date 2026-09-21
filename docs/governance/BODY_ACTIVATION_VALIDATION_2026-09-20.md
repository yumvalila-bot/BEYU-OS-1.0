# Initial body activation — full validation checkpoint

**Evidence date: 2026-09-20 UTC.** This certifies the tested implementation
increment, not completion of the entire governance programme or production
promotion. Governance remains a shared control-plane capability within BEYU OS's
Constitutional Control Plane + Enterprise Operating Kernel + Governed Intelligence
Layer; no separate governance OS, membership registry or security-grant shortcut
was introduced.

## Source and publication

- Continuation START: `5a3f07394550fab19571781a576e960b197b07e5`.
- Preserved/published appointment preparation: `8e3e0f7dc51d9b6cbd6dca143dcf6fc2264cd142`.
- Validated implementation: `408310b3e2d5495add9e1c0adbb8a619a6d55937`, pushed
  successfully to `arena/01a0bda3-beyu-os-1-0`.
- This checkpoint's subsequent commit changes documentation only. The full suite
  covered the implementation contents at 408310b. A post-publication secret-free
  build and repeated HTTP/browser activation tests also passed.
- Additive migrations in this continuation: 0055 and 0056. No historical SQL was
  rewritten; 0048–0051 and 0054 hashes still match the prior validated evidence.
- 0056 SHA-256:
  `a43cae6c65913f8fa528e2ace241da8eaff96d13628004711890ff8b481e40d9`.

## Complete local proof

Independent database `beyu_body_activation_final_57` was created from all 57
canonical migrations, runtime-role provisioning and seed. It did not reuse or
repair the earlier development database's ledger after SQL edits. Application
HTTP and SQL-boundary tests used the non-owner, non-superuser, non-bypass runtime
role. Privileged fixtures were kept separate from that boundary.

| Check | Result |
|---|---|
| Full Vitest | **4,444 passed / 11 pre-existing skipped**; 253 files passed / 3 skipped; 4,455 total; **1,120.74 seconds** |
| Full Playwright | **All 32 passed**, one worker, **12.0 minutes** |
| Final typecheck | PASS |
| Lint | PASS: zero errors, one existing image warning |
| Production build | PASS |
| Production build without database/auth runtime secrets | PASS, explicit exit 0 |
| Post-secret-free-build activation HTTP | **5 passed** |
| Post-secret-free-build complete activation browser | **1 passed**, 1.3 minutes |
| Tracked secret scan at implementation publication | **2,084 files clean** |
| Post-full-test migration integrity, `--with-ledger` | **57 SQL / 57 journal / 46 snapshots / 57 matching applied checksums**; 14 acknowledged historical debts; **zero blocking** |
| Post-full-test schema drift | **362 database / 361 declared tables**; 151 informational differences; **zero blocking** |
| Post-full-test migration rerun | No-op; identical before/after fingerprint `ba0ec891e01111700a03902946280cc0` |

The existing skipped suites are bootstrap enrollment (5), foundation (4), and
preparation (2). No new skip or weakened assertion was added. The broad run
includes actual HTTP, authorization/RLS, migration, concurrency, audit, event,
workflow, Finance boundaries and assistive-intelligence regressions. Local scale
benchmarks are not production-capacity certification. Existing pg client
concurrency deprecation and image warnings remain disclosed.

## New-path evidence

The focused activation matrix consists of 9 service tests, 16 actual non-owner
SQL tests, one real predecessor upgrade, five actual HTTP tests and one complete
browser test. Those tests are also included in the full runs above.

- Exact independently approved RESERVED_MATTER plan; non-presider and proposer
  denials; all nominees separately approved and individually consenting.
- Mandatory initial composition and term boundaries; current constitution,
  superior composition, charter, document and jurisdiction checks.
- Expired/revoked grants, missing MFA, wrong body, tenant/entity/classification
  scope, caller-forged fields and malformed JSON fail closed.
- Direct runtime SQL cannot substitute immutable plan evidence, rewrite body
  metadata/charter approval provenance, delete plan history, or activate merely
  by setting transaction gates. A **partial COMMIT** fails its deferred constraint.
- Mid-membership failure and whole-transaction failure roll back canonical
  members, appointments, plan, charter, body, audit and event state.
- Concurrent activation has one winner; completed HTTP replay does not duplicate
  members and still uses current recorded-superior authorization.
- The actual browser creates the final nomination, records independent approval,
  denies non-nominee consent, obtains nominee consent, freezes four nominations,
  records superior plan approval, denies an expired-grant activation, retries
  unchanged after restoration, and displays four backend-authoritative seats.
- Complete activation preserves original charter approval metadata, creates one
  correlated/caused canonical body activation event, and leaves all role and
  capability assignments unchanged. Individual initial activation remains denied.
- The real 0000–0055 → 0056 upgrade creates four consented nominations using the
  predecessor schema and preserves all compared bodies, establishments, charters,
  terms, appointments, members, decisions/votes, roles/capabilities, audits and
  events. It neither invents historical identities nor activates anything.

## Failures diagnosed and corrected

1. Early activation HTTP tests found non-presider and wrong-body errors returned
   as 500. The route's outer domain-error normalization was repaired; actual HTTP
   now proves 403/404, strict 422, success and replay.
2. Published 8e root CI, run **35533693664**, failed its existing establishment
   regression: nomination without an approved initial charter returned
   RULE_VIOLATION where the contract requires FORBIDDEN. The implementation now
   denies absent initial appointment authority with FORBIDDEN. The assertion was
   not changed; a 31-test focused repair run and the complete 4,444-test rerun pass.
3. An early upgrade test sorted a table without an `id` column. Snapshot ordering
   was corrected to deterministic complete-row JSON; the preservation assertion
   remained intact. The real upgrade passed both focused and full runs.

The first local full attempt was deliberately stopped when the prior published CI
failure became available, before declaring any full result. The corrected source
was rebuilt and the complete run above restarted. Earlier focused results alone
are not substituted for this complete proof.

## Observed GitHub state and external boundary

- [PR 77](https://github.com/yumvalila-bot/BEYU-OS-1.0/pull/77) was last verified
  OPEN/DRAFT. An implementation/progress comment was posted after the 408310b push.
- New root workflow [35535442519](https://github.com/yumvalila-bot/BEYU-OS-1.0/actions/runs/35535442519)
  was observed **in_progress** at 408310b. **No final green CI result is claimed.**
- Scratch workflow [35535442595](https://github.com/yumvalila-bot/BEYU-OS-1.0/actions/runs/35535442595)
  was observed completed **SUCCESS** for PostgreSQL 16 migration validation.
  Production drift/preflight/deploy/release-record/runtime/PVG jobs were SKIPPED.
- Last verified main: `5ac90f2cc712582bde45cc0f2616937d856a6f71`.
- Final reconciliation attempt at **20:58:09 UTC** failed: `git ls-remote` exit 128,
  `could not read Username for 'https://github.com': terminal prompts disabled`;
  PR GraphQL and root-run queries returned **HTTP 401: Bad credentials**.
- The GitHub connection needs reconnection in Arena for current main/PR/CI
  reconciliation and publication of this later checkpoint. No credentials were
  requested or stored in the report. Safe local engineering and the full suite,
  all browsers, build and post-test checks continued after the authentication error.

This is a publication/observation boundary, **not** evidence that remaining
engineering is complete. Production merge, ratification and promotion remain
human-controlled; no deployment or protection bypass occurred.

## Honest remaining engineering scope

0052–0056 now provide establishment → superior initial charter approval → exact
appointment decisions → consent → independently approved whole-composition plan
→ atomic effective charter/canonical membership/ACTIVE body.

Still incomplete: governed vacancy recovery; body suspension/dissolution/archive;
membership renewal/resignation/suspension/removal and succession; first-class
reserved seats, competency/independence/eligibility evidence; broader shared
calendar, delivery/acknowledgment/escalation, evaluation/reporting and advanced
assistive analytics. Existing meeting/execution and non-mutating preflight paths
were regression-tested, not reclassified as a complete lifecycle or full
simulation system. These are engineering gaps, not GitHub or human-approval
blockers.

Membership still does not confer RBAC, security, Finance, delegated authority or
CAP_POSTING. Every future execution must independently satisfy its live authority
and scope checks. Noelia/HIVE remain assistive, never self-authorizing.

Detailed local logs are under ignored `tmp/governance/activation-*`. This durable
checkpoint records the outcomes; those local logs are not claimed to be uploaded
CI artifacts or production evidence.
