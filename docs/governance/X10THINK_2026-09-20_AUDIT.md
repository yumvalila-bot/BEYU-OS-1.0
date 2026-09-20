# X10THINK governance reality audit and integrity hardening

Date: 2026-09-20. **Engineering checkpoint — NOT a completion or production certification.**

Continuation: the generic action chain is now implemented as described in
[Resolution execution](RESOLUTION_EXECUTION.md). The full mission remains incomplete.

P1 continuation: [Charters and composition](CHARTERS_AND_COMPOSITION.md) adds
immutable versioned charter review/adoption and enforced role-count composition
controls. [Appointments and terms](APPOINTMENTS_AND_TERMS.md) now adds nomination,
independent decision-backed approval, nominee consent and guarded canonical member
activation. Body creation, advanced renewal and the full meeting lifecycle remain
incomplete; this does not change the mission's incomplete status.

[Read-only preflight](READ_ONLY_PREFLIGHT.md) now adds a database-enforced
non-mutating simulation API/UI using the canonical voting engine. Delegation,
approval-chain and independent country-grant coverage are explicitly incomplete;
a hypothetical outcome cannot authorize anything.

## Baseline and method

- Started clean on `arena/01a0bda3-beyu-os-1-0` at
  `5ac90f2cc712582bde45cc0f2616937d856a6f71`; initial fetched `origin/main` was identical.
- Unshallowed history; inspected remote branch inventory, all 76 PR summaries,
  governance-related commit history, current schemas/migrations, governance routes,
  shared UI, authorization, tenant context, audit/event transactions, Noelia,
  deployment/CI configuration and existing governance tests. Merged PRs #1, #58,
  #63, #65 and #70 contain relevant predecessor work; #73/#74 are release
  governance, not a replacement corporate-governance implementation. No alternate
  corporate meeting/action implementation was found in the inspected main history.
- Real disposable PostgreSQL **16.14**; separate administrator fixtures and
  non-owner `beyu_runtime` NOSUPERUSER/NOBYPASSRLS runtime. No production access,
  data changes, ratifications, capability activation or promotion was performed.
- Source and running database outrank historical certification reports. In
  particular, the four core governance tables had **zero policies and RLS OFF**
  before this change. `docs/governance/VOTING_OPEN_DECISIONS.md` §3 acknowledged
  that exact gap. Later broad “RLS implemented” claims did not close it.

## P0 findings and repairs

| Finding | Before | Repair / evidence |
|---|---|---|
| Core RLS missing | UNSAFE: bodies, members, resolutions and votes unrestricted at DB boundary | `0048_governance_isolation.sql`; `tests/security/governance-rls.test.ts` uses direct SQL with real runtime login |
| Recusal lowers absolute quorum | UNSAFE: `min(quorumMinimum, electorate)` creates authority | Minimum remains absolute; inadequate electorate defers; pure and service regressions |
| Unknown rules | UNSAFE: unknown majority silently becomes SIMPLE | Refuse unknown/mismatched rules and invalid quorum; `governance-voting.ts`, `governance-vote-service.ts` |
| Stale authority / ballot state | UNSAFE: pre-lock electorate and previous ballot feed transaction | Lock before all resolution authority reads; body/member/resolution locks + canonical advisory lock; vote/recusal race and existing closure concurrency tests |
| Retired/future presiding seat | UNSAFE: tabling and closure checked role, not appointment window | Resolve active appointment; reject both inactive cases |
| Conflicts ignored / retired votes counted | UNSAFE: tally used all rows although quorum filtered eligibility | Same eligible ballot projection for quorum, tally and closure; conflict flag restricts participation and presiding authority |
| Policy obligations ignored by decision path | UNSAFE: only DENY inspected | Table/vote/close/recuse reject unresolved approval or review obligations; no fabricated discharge |
| Entity/jurisdiction policy omitted | MISWIRED: evaluator received no governing entity/country | Resolve entity server-side; pass its code/country; inactive/out-of-scope entity blocked |
| Client capital estimate outranks persisted amount | UNSAFE: linked capital request could be understated | Resolve stored amount under scope; reject discrepancies and forged capital trigger; invalid numeric amount engages reservation |
| Constitutional apex absent | PARTIAL: separate diagnostic, not mutation prerequisite | Active/effective Article 1 required for proposal/participation/closure. This is structural, **not** an interpretation of legal prose |
| No self-recusal write workflow | PARTIAL: seeded RECUSED rows only | Guarded, strict/idempotent API + service + UI + audit/event; no conflict-clearance backdoor |
| Historical quorum display changes with membership | MISWIRED: live membership recomputed historical display | Final tallies come from resolution; decision-time quorum from immutable decision event. Missing historical evidence is explicitly labelled unavailable |
| Read helper leaks/affordances | PARTIAL: direct callers could see out-of-entity/classification voting data | Contextual read authorization; inactive/recused presiding affordances removed |

The old tests that explicitly required reducing quorum were **corrected to test
preservation of the configured minimum**; the scenarios remain. They were not
removed. Migration-count assertions now attribute migration 0048 explicitly;
no gate, failure threshold or security assertion was disabled.

## Complete major-capability matrix (request A–AR)

`PARTIAL` means the full requested vertical slice is **not done**, even where
valuable substrate exists. “FIXED” is a disposition, not a new completeness
classification. All remaining implementation gaps below are engineering gaps
unless an explicit human dependency is named; they are not disguised as external blockers.

| Scope | Classification after patch | Repository evidence and remaining gap |
|---|---|---|
| A Constitution | PARTIAL | `schema/governance.ts` articles/policies; `governance/constitution.ts`, `policy.ts`; effective apex gate FIXED. No comprehensive amendment/version approval workflow or ratified per-body/jurisdiction rules |
| B Governing bodies | PARTIAL | `governanceBodies`, `/os/governance`; identity/type/entity/quorum/majority; runtime writes remain protected. Versioned charter review/adoption and live composition enforcement now exist; body establishment/suspension/dissolution remains missing |
| C Charters / terms | IMPLEMENTED core / PARTIAL full lifecycle | `governance_charters` + classified immutable `governance_charter_terms`, `charter-service.ts`, API/UI/RLS/tests: document snapshot → review → independent adoption under explicit voted POLICY resolution. Latest adopted version governs without rewriting history; superior-body authority and canonical rule amendment remain missing |
| D Membership | IMPLEMENTED core appointment chain / PARTIAL full lifecycle | `governanceAppointments` + canonical `governanceMembers`, migration0051, service/API/UI: nomination → independent decision-backed approval → nominee acceptance → current-authority activation. No RBAC/Finance grant; early removal/resignation and superior-body recovery remain missing |
| E Seats / composition | PARTIAL | `seatRole`, `votingRights`, appointment dates; adopted minimum/maximum voting/role counts now enforced, including dates, duplicates and observers. Nomination/activation now exists; no independent vacant-seat plan or structured competency-evidence matrix |
| F Competency matrix | NOT IMPLEMENTED | No corporate governance competency schema/service/API in inspected source. HCM is not a substitute |
| G Tenure / succession | PARTIAL | Bounded inclusive term dates, scheduled/expired roster labels and retained old member/ballot IDs; subsequent non-overlapping nomination can create a new term. No automated renewal/succession, emergency replacement or expiry escalation |
| H Meetings | NOT IMPLEMENTED (shared) / PARTIAL (Foundation) | `schema/foundation.ts`, `/api/v1/foundation/governance/meetings` are sector-specific. No shared corporate meeting state machine; do not duplicate this as an OS |
| I Notices | NOT IMPLEMENTED (shared) | No notice issuance/acknowledgement/exception model tied to corporate resolutions |
| J Attendance | NOT IMPLEMENTED (shared) | Written-resolution participation is ballots, **not meeting attendance** |
| K Quorum | PARTIAL; arithmetic FIXED | `governance-voting.ts`, vote service; authoritative written-ballot quorum. No attendance/jurisdiction/emergency-exception quorum engine |
| L Agenda | NOT IMPLEMENTED (shared) | No corporate agenda publication/version/approval workflow found |
| M Papers / packs | PARTIAL | Shared `platform.documents` and Documents APIs exist; no corporate pack completeness, acknowledgement or deadline workflow |
| N Conflict / recusal | PARTIAL; restrictive workflow IMPLEMENTED | `/resolutions/[id]/recusal`; existing ballot now persisted through audited API/UI. No reviewed cross-resolution conflict registry or authorized clearance process |
| O Deliberation | PARTIAL | Resolution rationale/dataBasis/consequences and ballot comments; no structured alternatives/questions/discussion history |
| P Motions | NOT IMPLEMENTED | No shared proposer/seconder/amendment state machine; a resolution is not relabelled as a motion |
| Q Voting | PARTIAL; integrity defects FIXED | Open recorded electronic written ballots, SIMPLE/TWO_THIRDS/UNANIMOUS, abstention, recusal, server closure. No secret ballot implementation or attendance dependency |
| R Resolutions | PARTIAL | Proposal → DRAFT → TABLED → VOTED → server-derived terminal outcome. API/UI/audit/events/tests exist. Implementation/evidence/independent review/action closure now use canonical tasks; formal aggregate implementation-plan sealing remains missing |
| S Decision registry | PARTIAL | `governanceDecisionRegistry`, `decision-authority.ts`, Finance activation decisions. Not a general alternatives/evidence/review-date decision journal |
| T Minutes | NOT IMPLEMENTED (shared) | No shared draft/review/approval/locked correction workflow |
| U Resolution implementation | IMPLEMENTED core chain / PARTIAL broader planning | `governance/action-service.ts`, migration0049, guarded APIs/UI/RLS/tests implement approved mandate → tasks → document evidence → independent verification → action closure. No formal aggregate plan sealing/reassignment/cancellation; Finance execution remains separately gated |
| V Governance actions | IMPLEMENTED core lifecycle / PARTIAL advanced workflows | Existing `tasks` extended, not duplicated; owner/deadline/priority, blockers, one creation-ordered prerequisite, current evidence, independent human verification and closure; no reassignment or SLA escalation engine |
| W Delegation | PARTIAL | `governance/delegation.ts`, `admin/delegation.ts`, admin APIs; multiple purpose-specific mechanisms. Not one complete corporate execution-time delegation model |
| X Reserved matters | PARTIAL; numeric/linked-capital bypass FIXED | `governance/reserved-matters.ts`, proposal enforcement; vocabulary/monetary rules exist. No comprehensive per-jurisdiction approval chain |
| Y Authority engine | PARTIAL | `can`, `guarded`, policy engine, membership gates, decision authority, RLS. No unified evaluator covering all 24 requested dimensions |
| Z Executive oversight | PARTIAL substrate | Strategy/KPIs/HCM and appointments exist; no board-specific executive mandate/review/removal lifecycle |
| AA Board evaluation | NOT IMPLEMENTED | No board/chair/individual evidence-based evaluation workflow found |
| AB Risk governance | PARTIAL | `schema/assurance.ts`, Risk workspace/services; no complete board agenda/decision/action integration |
| AC Assurance / audit | PARTIAL | Assurance schema, audit specialist and shared immutable ledger; not complete committee remediation oversight |
| AD Stakeholders | NOT IMPLEMENTED (shared governance) | Parties are not a material-issues/consultation/governance-response register |
| AE Calendar | NOT IMPLEMENTED (shared governance) | No consolidated meetings/terms/delegations/reviews calendar |
| AF Notifications | PARTIAL | Existing notifications now receive atomic assignment/review/rework signals with generic contents and reauthorized deep links. Deadline/notice/expiry/external-delivery consumers remain absent |
| AG Reporting | PARTIAL | Governance view and read-only specialists; no complete board/committee/implementation reporting set |
| AH Command center | PARTIAL | Existing `/os/governance` enhanced; server-derived implementation/overdue action metrics now exist; no fabricated meeting/pack health metrics |
| AI Records vault | PARTIAL | Shared Documents/retention/legal-hold mechanism; no governance-specific records capture/retention classification workflow |
| AJ Event ledger | PARTIAL; covered mutations IMPLEMENTED | `withAuditTransaction`, hash-chained audit/events; proposal/table/vote/decision/recusal and all new task and charter transitions atomic, with decision causation. Missing workflows cannot emit real events |
| AK Security | PARTIAL; core RLS/decision defects FIXED | Guarded identity/RBAC/ABAC/MFA and core RLS; country-scoped policy uses entity country, **no independent country grant axis on Principal**. Full cross-domain audit not certified |
| AL Exceptions | PARTIAL substrate | Shared approval/security mechanisms; no explicit expiring corporate quorum/notice exception workflow. No implicit exceptions introduced |
| AM Break-glass | PARTIAL substrate | Existing emergency permissions and auditing remain; no new governance bypass or self-authorization. No claim of complete governance emergency workflow |
| AN Multi-entity/country | PARTIAL | Tenant subtree, legal entities, entity ABAC and RLS, country policy context; no complete cross-border constitutional rule model |
| AO Knowledge graph | PARTIAL | Existing relational IDs/FKs/events; no unnecessary graph store. Missing meeting/action/evidence edges remain missing |
| AP Simulation | IMPLEMENTED bounded preflight / PARTIAL full simulation | `governance/simulation.ts`, authenticated simulation API and resolution panel; READ ONLY/repeatable snapshot, unchanged source, explicit no-authority flags, canonical quorum/tally and current controls. Delegation/approval chains/country grants explicitly unsupported; no scenario persistence or completed meeting workflow simulation |
| AQ Maturity | PARTIAL substrate | `command/posture.ts` advisory institutional posture; not governance-specific evidence-based improvement plans |
| AR Noelia/HIVE | PARTIAL | `noelia/governance.ts`, tool registry, governed runtime and tests. No new AI write tool, vote, approval or self-authorization capability added; read-only scoped implementation reporting added, with no action mutation tool; not complete governance intelligence |

## API, state and frontend contract

Existing proposal/table/vote/decision endpoints remain canonical. New:

```
POST /api/v1/governance/resolutions/:id/recusal
Idempotency-Key: <client retry key>
{ "reason": "At least ten characters of conflict evidence" }
```

Requires authenticated permission `governance:resolution.vote`, contextual
RBAC/ABAC/MFA, effective Constitution, active body and active own membership,
policy checks, and DRAFT/TABLED/VOTED state. Identity, tenant, member and outcome
are never accepted from the request. Writes `RECUSED` + `conflictDeclared=true`,
recomputes stored aggregate participation and appends
`GOVERNANCE_RESOLUTION_RECUSAL_DECLARED` in the **same transaction** as audit.
The event carries actor, tenant/entity, classification, permission/policy,
correlation/trace and prior vote. No causation ID is fabricated for a human root
command. There is no endpoint to reverse a recusal, approve it, or act as another
member. Final decisions require a new governed record, not a silent correction.

`/os/governance` contains the existing bodies/membership/resolutions view plus
self-recusal controls. It refreshes server state after mutations; browser display
is never authority. Historical result tallies remain stored, and historical quorum
uses the decision event rather than current membership. No meeting/action screens
or fictitious governance maturity numbers were added.

The existing lifecycle is retained (not replaced with incompatible enums).
**Ballot participation is a written-resolution quorum, not attendance quorum.**
Secret voting, executive execution and Finance posting are not conferred.
`CAP_POSTING` and its activation controls are unchanged.

## Database, RLS and audit boundaries

Migration 0048 enables and forces RLS on the existing four tables. No new table,
column, destructive DDL or backfilled authority. Existing PK/FK/unique indexes
remain. Resolution/member scope derives from body; ballot scope joins BOTH its
resolution and member to the same body. Tenant scope is an explicit set; the
legacy global boolean does not override it. Entity and classification scope are
set from trusted Principal with `SET LOCAL`, not URL/request fields. Missing
request context fails closed.

Restrictive policies deny runtime body/member changes, all four DELETE paths,
and updates to terminal resolutions/ballots. Body/member row locks are still
possible (`USING true`, `WITH CHECK false` for UPDATE); actual mutation is denied.
Runtime provisioning cannot erase these restrictions through blanket DML grants.
Application RBAC/MFA/policy/authority checks remain mandatory: scope-only SQL
policies are **not a second implementation of the entire constitutional engine**.
Privileged DB owners/superusers remain human-controlled DDL/fixture authority;
this patch does not pretend PostgreSQL RLS binds superusers.

Journal entries 0040–0048 now truthfully inventory existing SQL and this migration.
The first forty entries and all historical SQL remain unchanged. Historical
missing snapshots and the 0038/0039 collision remain explicit debt. The NEW 0048
snapshot was generated from CURRENT schema in an isolated directory and links
to the last available historical snapshot; no historical snapshot was fabricated.
The migration runner remains authoritative; `drizzle-kit push` is not used.

Audit integrity is tamper-evident with existing append-only controls, not a claim
that a database superuser is cryptographically unable to replace the database.
Recusal race/rollback tests and existing event-failure tests protect atomicity.
No parallel audit, notification, document, workflow or authority platform added.

## Validation and operation

Dedicated additions: `tests/governance/hardening.test.ts`,
`tests/security/governance-rls.test.ts`, recusal HTTP scenarios in
`tests/governance/vote-http.test.ts`, and
`tests/browser/governance-recusal.spec.ts`. Existing voting scenarios remain,
including concurrency and rollback. Full validation outcomes and CI links are
recorded in the PR and final session report; absence of a browser/test environment
must never be reported as passing.

Release order (human controlled):
1. Review migration and changed quorum behavior with governance/security owners.
2. Validate against a representative sanitized database. Run canonical migration
   runner, re-run (zero pending/checksum stable), integrity and drift gates,
   runtime-role tests, service/HTTP/browser tests and build.
3. Deploy request-context-capable application and migration as a coordinated
   release or under a maintenance window. Old application versions omit the new
   RLS context and will be denied; **do not disable RLS to restore old behavior**.
4. Verify runtime role, policies, expected authorized/denied requests and audit
   chains before opening governance writes. Promotion remains human-controlled.
5. On failure, disable affected writes and roll forward with a reviewed fix.
   No destructive rollback or policy-disabling rollback is supplied. New RLS
   changes require no data restoration; take the normal approved backup first.

## Outstanding blockers versus engineering work

**Human-controlled:** ratified entity/body charters, notice/voting/exception
rules, appointment/closing authority (including the existing trustee-closer gap),
legal jurisdiction requirements, policy provenance ratification and Finance
activation remain actual governance decisions. They cannot be manufactured by
code or seed changes. Production promotion and any live data reconciliation
require human approval.

**Engineering still required, not external excuses:** shared meeting/notice/
attendance/agenda/motion/minutes lifecycle; aggregate implementation-plan sealing,
reassignment/cancellation and SLA escalation beyond the now-implemented core
action/evidence/independent-verification chain; full charters/appointments/composition;
calendar/notification consumers; governance risk/assurance/stakeholder/maturity
integration and safe simulation. The architecture can support further work;
this patch does **not** establish the master mission's definition of done.


## Charter and preflight continuation validation

- Charter/composition source `f31e46b5e4d7082996bf9f2107dff829914afb78` pushed
  on the same PR77 workstream. Root CI run **35503257334** and scratch CI run
  **35503257355** both observed completed **SUCCESS**. Earlier pending root status
  is superseded by this observed result, not assumed success.
- Charter full local suite initially had **4256 passed / 1 failed / 11 skipped**.
  The only failure was the credential-convergence harness expecting the default
  database name instead of the disposable `beyu_charter_validation`. Corrected the
  ignored `BEYU_RUNTIME_DB_NAME` configuration and reran runtime-role provisioning;
  all **7 credential-convergence tests passed** without changing assertions.
- Preflight focused service/API tests: **19 passed**; Chromium browser: **1 passed**.
  Production build, typecheck and lint passed (0 errors / 1 existing image warning).
  Full corrected suite and complete browser regression are pending at this checkpoint.
- `origin/main` fetched again during this continuation and remains
  `5ac90f2cc712582bde45cc0f2616937d856a6f71`; no main divergence found.
- No migration after0050 is required for this bounded read-only capability. P0
  0048, execution0049 and charter0050 remain unchanged. No production promotion,
  legal ratification, Finance activation or merge occurred.


### Completed local preflight regression; remote observation boundary

Source commit: **dc66969279270ac2ee9ce883b6c2e72b0b13e8d6**, pushed successfully
on `arena/01a0bda3-beyu-os-1-0`; PR77 remains OPEN/DRAFT. This continuation resumed
at f31e46b; original mission baseline remains5ac90f2. No prior work was reset.

- **TESTED:** complete `npm test` against the fresh51-migration database and actual
  non-owner application server: **4276 passed / 11 skipped**, **232 files passed /
  3 skipped**, **868.84s**, started2026-09-20 10:17:08 UTC. Existing bootstrap-only
  skips retained. This supersedes the earlier database-name harness failure and
  pending full-suite status. No assertions or failure thresholds were weakened.
- **TESTED:** complete Chromium regression **13 passed / 0 failed**, **2.1m**,
  covering charter adoption, independently verified execution, restrictive recusal,
  read-only simulation, navigation, responsive shell, branding and deep-link gates.
- **TESTED:** source build/typecheck/lint passed; 0 lint errors, 1 existing Noelia
  image warning. Secret scan clean2009 tracked files; staged diff check passed.
- Full-suite migration drift/integrity and eight-case gate self-test passed; no
  migration beyond0050, no schema drift introduced, historical metadata debt retained.
- **CI VERIFIED:** charter source f31e46b root35503257334 and scratch35503257355
  completed SUCCESS, actually observed. Earlier execution/evidence success remains
  attributed to its own source revision.
- **CI NOT VERIFIED:** preflight source dc66969 root35504744854 last observed
  in_progress (completed non-root jobs successful at that observation); its
  scratch35504744855 was queued when last observed. Neither final conclusion is
  available. Do not treat missing observation as failure or success.
- **EXTERNALLY BLOCKED (remote only):** subsequent `gh run view` for both runs
  returned `HTTP 401: Bad credentials`; latest `git fetch origin main` returned
  `fatal: could not read Username for 'https://github.com': terminal prompts disabled`.
  GitHub must be reconnected in Arena. No credentials were requested. Local
  engineering and full regression continued after this failure. The evidence
  accompanying this checkpoint is committed locally; pushing it remains pending
  unless a later successful push is explicitly recorded.
- **MAIN RECONCILIATION:** the last successful fetch still resolved origin/main to
  5ac90f2cc712582bde45cc0f2616937d856a6f71; the final fetch was blocked, so a newer
  remote revision cannot be ruled out. No blind merge or branch switch occurred.

Retained SQL checksums (SHA-256):

-0048: `cc5cf0d8b162a07587a6ce2eadef0ae844a3c6882c33a8f987e38ae76510cca0`
-0049: `194aca23adb4e566e15f39837bb89002a593a71b7b8395bbdf2c177bdb7e56b6`
-0050: `7ee87b07bfb537f56124d53b664209fc6949040caf0085fb36c0fc4d8cc720e9`

Local raw evidence remains in ignored `tmp/governance/simulation-{full-suite,
all-browser,transport,browser,build,typecheck,lint,secrets}.log`.

**READINESS:** the bounded preflight increment is locally validated; the full
X10THINK mission is **not substantially complete or production-certified**.
Governing-body lifecycle, appointment/acceptance/activation, competency, tenure,
renewal/succession, superior-body/vacancy recovery, complete corporate meeting chain,
calendar/escalations and evaluations remain engineering work—not external blockers.
The next priority remains the guarded body/membership lifecycle, preserving the
existing no-direct-authority-write boundary rather than creating a bypass.
Legal ratification, Finance activation and production promotion are HUMAN CONTROLLED.


### Appointment continuation (0051)

Resumed at e77566e without reset. GitHub recovered; e77566e evidence was pushed.
Preflight scratch35504744855 observed SUCCESS; root35504744854 was CANCELLED by
newer work, not passed. e77566e scratch35505572848 observed SUCCESS; its root
35505572822 was still in progress at the last observation.

Implemented the bounded appointment/consent/activation chain in
[Appointments and terms](APPOINTMENTS_AND_TERMS.md). Shared presiding/document
checks were extracted from the charter service without introducing a second
permission system. Existing body/term readers and canonical member truth are reused.

Migration0051 is additive to immutable0048–0050 SQL. It retains body write and
member edit/delete denials, replacing only the member INSERT denial with a narrow
activated-appointment match. RLS/immutable transition guards and a deferred
canonical-member constraint backstop atomic activation. No privileged function,
SECURITY DEFINER, automatic security grant or Finance activation is introduced.

Fresh52-migration replay/seed/runtime provisioning, deterministic no-op rerun and
integrity-with-ledger passed;14 historical metadata issues remain acknowledged,
not rewritten. Initial focused validation: **63 passed** (26 new appointment
service/RLS/HTTP checks + charter14 + core RLS23). New Chromium appointment lifecycle
passed with three human identities. Build/typecheck/lint passed (0 errors, existing
Noelia image warning only). Complete suite and full browser regression are running;
new-source success must be recorded only after completion.

### Appointment final-review corrections and observed CI

- Appointment source2a00048 completed the full local suite: **4302 passed /11
  existing bootstrap skips**,235 files passed/3 skipped,938.10s. All **14 browser
  tests passed** in2.9m. Root CI35506360586 and scratch35506360590 both observed
  completed **SUCCESS**. This evidence belongs to2a00048, not subsequent corrections.
- Final review tightened new authority creation: LEGACY_UNCHARTERED bodies may
  prepare nominations, but cannot activate membership without an adopted readable
  charter. Existing legacy resolution behavior is preserved; no historical SQL
  was rewritten. Test fixtures now actually adopt their charters through the
  independent decision-backed workflow; a negative test removes charter coverage
  inside a rollback-isolated fixture and proves that activation is denied.
- A real negative test then reproduced cross-entity grant mixing in canonical
  resolution tabling: an approval grant restricted to the Trust plus a Holding
  read grant incorrectly TABLED a Holding resolution. The failing test and its
  actual returned TABLED state are retained in the ignored scope-reproducer log.
  Current target-entity grant filtering now applies to the shared voting/decision/
  recusal/follow-up authorizer, shared charter/appointment presiding checks,
  nominee consent-policy roles and simulation observations. Foreign approval
  authority cannot be supplied by a local read grant. No assertion was weakened.
- Corrected-source targeted regression:149 service/integration tests passed;
  appointment/charter/simulation HTTP8 passed; appointment browser1 passed.
  Rebuilt/typechecked/linted successfully. Complete corrected-source suite and
  complete browser regression have been started and are not yet claimed successful.
- This fixes a demonstrated governance authorization defect. It is not a claim
  that every pre-existing cross-domain Principal/grant consumer was recertified.

A further concrete human-authority regression was reproduced against a separate
validation database: an account marked is_service_account=true retained a human
presiding seat and the canonical service returned TABLED. Acting-seat lookup now
requires ACTIVE, non-service-account identity and a matching Principal party.
The failing reproducer is preserved;104 corrected appointment/voting/decision/action
service tests passed. This source correction requires its own rebuilt full-suite
validation; intermediate runs are not substitutes. No new migration was necessary.


### Frozen corrected-source validation checkpoint — 2026-09-20

**Attribution.** Appointment continuation started at
`e77566ec0cd862012d68c3177fb06a10bdae4009`. The final application source is
`d0b09d880d131bbca675df08b650711cdf2b9751`, already pushed to the same
`arena/01a0bda3-beyu-os-1-0` branch. This checkpoint changes documentation only;
it does not change the tested application, tests, migrations or workflow. PR77
remains the same workstream, OPEN/DRAFT at its last successful remote observation.

**FIXED / IMPLEMENTED.** Commits2a00048,ab1322f,d0b09d8 provide the bounded0051
appointment workflow, adopted-charter activation requirement, target-entity live
grant correlation and current-human acting-seat binding described above. Existing
0048 authority protections,0049 resolution execution,0050 charter controls and
read-only preflight remain. No new OS, Noelia/HIVE authority, security-role grant,
Finance CAP_POSTING activation, production promotion or legal ratification was added.

**TESTED — actual completed local results.**

- Frozen d0b09d8 PostgreSQL/HTTP complete suite: **4306 passed,11 existing bootstrap
  skips, zero failures;235 files passed,3 skipped;913.51s**.
- Subsequent complete Chromium suite against the rebuilt runtime: **14 passed,
  zero failures;3.4m**. Includes appointment, charter, resolution execution with a
  different verifier, persisted recusal, non-authorizing simulation, navigation,
  responsive layouts and unauthenticated deep-link boundaries.
- Corrected-source focused human-authority regression:104 passed, as previously
  recorded. Production build and typecheck passed; lint0 errors/1 existing image
  warning. Pre-commit secret scan2024 tracked files was clean.
- Additional CI-style production build with runtime database/authentication secrets
  blanked and the local .env temporarily removed: **PASS**. With runtime credentials
  restored, the constrained-role server started and `/api/health` returned
  `checks.database=UP`. Appointment/charter/preflight real HTTP tests against this
  no-secrets build: **8 passed**,67.77s. This is local parity evidence, not a claim
  to reproduce or resolve the remote startup result.
- The prior intermediate run remains recorded as **4305 passed/1 failed/11 skipped**.
  It began before the human-actor correction and source changed during execution;
  its retained-seat failure and raw log were retained. Its browser stage did not run.
  It is neither a passed run nor frozen final-source evidence.
- Migration inventory remains52 (0000–0051). Fresh replay, seed, constrained runtime
  provisioning and no-op replay were previously passed for0051; no migration has
  changed since. The complete corrected-source suite also passed the24-case drift
  suite and8-case gate self-test.14 acknowledged metadata debts remain, not rewritten.
  Rechecked0048/0049/0050 SHA-256 values exactly match those recorded above.

Raw local evidence (ignored, not committed):
`tmp/governance/appointment-complete-suite.log`, `appointment-complete-browser.log`,
`appointment-build-complete.log`, `appointment-lint-complete.log`,
`appointment-no-secrets-build.log`, `appointment-no-secrets-health.json`,
`appointment-no-secrets-http.log`. Earlier failed/reproducer evidence is retained
under its distinct filenames. The regenerated unrelated Health SPA file was restored.

**CI VERIFIED / NOT VERIFIED.**

- Source2a00048 root35506360586 and scratch35506360590: observed **SUCCESS**.
- Sourceab1322f scratch35507779664: observed **SUCCESS**.
- The already-running local watcher for ab1322f root35507779672 later exited1.
  Its saved `appointment-ci-final.log` marks the application-start step with X;
  full root regression and browser stages were skipped. The earlier in-progress
  observation is superseded by this **non-success** evidence. Builds, migration
  replay/integrity/drift and runtime-role checks were marked passed before startup.
  Detailed startup logs and the structured final conclusion were not retrieved;
  do not label this run successful or invent its root cause. Local parity validation
  above did not reproduce a startup failure.
- d0b09d8 run IDs and conclusions remain **NOT VERIFIED**. No earlier success is
  attributed to this source. This checkpoint's future remote status is also unknown.

**EXTERNALLY BLOCKED — remote operations only.** At11:38:13UTC the Actions API
returned `HTTP 401: Bad credentials`. A subsequent final-main fetch also returned
`fatal: could not read Username for 'https://github.com': terminal prompts disabled`.
GitHub reconnection in Arena is required for detailed CI diagnosis, latest CI
observation, evidence push/PR refresh and fresh main reconciliation. No credentials
were requested in chat. Local engineering/validation continued despite this boundary.
The last fetched main remains `5ac90f2cc712582bde45cc0f2616937d856a6f71`; newer remote
changes cannot be ruled out. No blind merge, branch switch or main push was performed.

**PARTIAL / NOT IMPLEMENTED — engineering work, not external blockers.**

- A–H: body establishment/suspension/dissolution and explicit superior-body mandate;
  atomic initial membership/charter bootstrap and vacancy recovery; formal seat
  plans; competency/independence matrices; advanced renewal/succession and early
  resignation/removal. Eight seat-role labels and dated terms are not full coverage.
- I–T: complete shared meeting→notice→invitation→acknowledgement→agenda/papers→
  attendance→quorum/conflict→deliberation→motion→vote→resolution→minutes chain.
  Existing written-resolution voting/quorum/recusal/decision support is not a
  complete meeting lifecycle. Calendar, escalation and evaluations remain missing.
- Resolution→action→implementation→evidence→independent verification→closure is
  implemented for bounded actions. Aggregate execution certification, reassignment,
  cancellation, exceptions and post-VERIFIED correction remain incomplete.
- Preflight is nonmutating and non-authorizing; it is not complete country law,
  delegation-chain or approval-chain certification. Notifications are generic
  in-app updates, not full meeting delivery/acknowledgement/calendar workflows.

**Next engineering dependency.** Existing charter/appointment paths deliberately
require an already-authorized body and current composition. A new empty body or
inquorate vacancy cannot bootstrap itself through these paths. The next A–H work
must implement explicit superior-body authority and a governed atomic initial
composition path, rather than relaxing0048, treating a draft body as authoritative,
using privileged runtime writes or lowering quorum. This dependency is engineering
work; it is not an excuse to claim all remaining work externally blocked.

**READINESS / HUMAN CONTROLLED.** The bounded corrected appointment increment is
locally validated. The full requested governance mission remains **incomplete and
not production-certified**. Merge, legal ratification, Finance activation and
production promotion remain human-controlled. No irreversible promotion occurred.

### Resumed appointment acceptance matrix — start08ba146

GitHub reconnected. Fresh main fetch resolves5ac90f2 unchanged; PR77 is OPEN/DRAFT
on this branch with remote application d0b09d8 at the initial observation. Saved
08ba146 evidence was successfully pushed. Structured Actions results now confirm:
**d0b09d8 root35508095235 SUCCESS, scratch35508095206 SUCCESS**. Intermediate
ab1322f root35507779672 concluded **CANCELLED**, not a diagnosed application startup
failure. Its X-marked startup step was insufficient to identify the conclusion;
this fetched conclusion supersedes that ambiguity. Production jobs were skipped,
not executed or certified.

Created a separate empty database and applied all52 migrations, seeded it and
provisioned the constrained runtime role. A repeat migration run applied nothing,
with fingerprint0daa573cf315a1545eaca2523f090d46 unchanged. Integrity-with-ledger
passed, preserving14 acknowledged debts and every historical SQL file.

Added adversarial service coverage for simultaneous/duplicate activation, unchanged
unrelated memberships/RBAC/Finance capability records, immutable nomination
provenance, event causation/correlation, revoked grants at approval/activation,
expired seats, wrong entity/country instruments, wrong body, fabricated decision
provenance, insufficient votes and presider recusal. Added real non-owner SQL
regressions retaining body creation/UPDATE/DELETE, member UPDATE/DELETE and finalized
decision/ballot protections after0051. Rollback also checks audit and notifications.

A new expiry test genuinely failed: a nominee could record ACCEPTED after the
entire immutable term ended. Activation remained denied, but this was misleading
consent evidence. The service now rejects new acceptance after retiredOn; no
arbitrary separate consent TTL was invented and no historical migration changed.
The failing reproducer is retained in continuation-adversarial-reproducer.log.
Corrected focused service/RLS matrix:45 passed. New actual-browser denial suite:
10 passed (4.1m), including stale rendered approval/activation forms after expiry,
revocation, foreign-entity grants and wrong-country instruments; hidden-control
bypass and non-nominee consent also denied. Persistence and reload confirm no
client-side success substituted for backend state. Build/typecheck passed;
lint0 errors/1 existing image warning. Full corrected suite/browser regression
will be recorded separately after completion; focused evidence is not final proof.

### Appointment acceptance completed; bounded establishment continuation

Frozen863a3380309d66ca9e215a2734635d4ffae32789 completed the fresh-database full
suite: **4323 passed/11 existing skips**,236 files passed/3 skipped,1030.32s;
**all24 Chromium tests passed**,7.4m. No source changed during either run.
Root CI35510280309 and scratch35510280306 both observed **SUCCESS** for that SHA.
Fresh main fetch still resolves5ac90f2cc712582bde45cc0f2616937d856a6f71.
This completes local and observed CI validation of the bounded appointment
increment, not the full governance mission. Evidence: ignored continuation-full-
suite.log, continuation-full-browser.log and continuation-ci-watch.log.

Continued to the next genuine P1 gap: explicit superior-body establishment, documented
in BODY_ESTABLISHMENT.md. Additive0052 supports immutable proposed charter/committee
identity → superior review → independent RESERVED_MATTER approval → exact canonical
DRAFT committee. Active, chartered BOARD/TRUSTEES authority, current constitution,
entity/country/classification, instrument and decision provenance are required.
The same entity/tenant is derived from the superior; no caller-selected expansion.
Proposer-party identity is snapshotted for independent approval. Generic notices
and shared audit/events commit with the proposal/body, including decision causation.

The existing body registry remains canonical. Only a narrowly matched DRAFT
COMMITTEE insertion is permitted; body UPDATE/DELETE, membership and final-decision
protections remain. New body identities inherit instrument classification; legacy
reference identities retain their previous PUBLIC visibility within tenant/entity
RLS. The proposal table uses FORCE RLS, immutable transitions, no runtime deletion
and a deferred exact-body constraint. No SECURITY DEFINER, new OS, role grant,
Finance activation, Noelia authority or hidden privileged writer was introduced.

This establishment foundation is intentionally **PARTIAL**, not the requested full
body lifecycle: it cannot activate an empty body. Consent-backed initial membership,
superior child-charter adoption/activation, suspension/dissolution/archive and
vacancy recovery remain engineering work. The UI explicitly says ESTABLISHED is
not ACTIVE and exposes no activation shortcut. Missing stages are not labelled
human approvals or external blockers.

Validation before the complete new-source run:
-12 new service/adversarial tests passed, including superior/constitutional authority,
  current charter/instrument, classified identity, independence, exact source,
  duplicate/concurrent establishment, rollback and unchanged roles/Finance.
-11 new actual non-owner PostgreSQL tests passed: no unscoped/foreign-tenant/entity/
  lower-classification reads, no deletion/forged transitions, exact insertion gate,
  country/entity instrument checks. A deferred-constraint test rejects an established
  proposal without its exact canonical body.
-2 real HTTP tests and1 Chromium superior-review/establishment/reload/denial test
  passed. Existing appointment boundaries also passed against the new schema.
-Fresh53-migration replay/seed/constrained runtime provisioning passed, as did the
 0051→0052 upgrade and no-op replay. Fingerprint9df81d7082bc55df36312218e9f64e14
  remained unchanged on the no-op. Integrity-with-ledger passed with14 existing debts.
-Historical0048–0051 SQL unchanged;0051 SHA256:
 `bf2d3f13a8365c9bbeefa2347f31a8c8157b16e6839dd8b9008fb7b45e2b6ecf`.
-Typecheck/build passed; lint0 errors/1 existing warning. Full new-source regression,
  all browser tests and observed new-source CI still require completion below.

The first frozen0052 full run at4652f00 finished **4342 passed/6 failed/11 skipped**,
233 files passed/6 failed/3 skipped,929.47s. All six failures were exact inventory
assertions still expecting52 migrations in the P3 release and five specialist
suites. No workflow/RLS failure was hidden. The browser stage did not run. The
failed log remains body-full-suite.log. Root CI's P3 DB-free job also reported
failure; its command reproduced the same stale inventory assertion locally.

Updated those assertions to **exactly53**, not a lower bound; the release test now
also proves that expecting the old52 baseline fails. Corrected focused validation:
424 specialist tests passed;182 DB-free release tests passed/6 expected DB skips.
No release protection, historical checksum or promotion distinction was weakened.

At13:13UTC, fetching the final CI conclusion returned HTTP401 Bad credentials.
The detailed job-log storage redirect had earlier failed with EOF. GitHub needs
reconnection in Arena; no credentials were requested. The remote source4652f00
was already pushed, scratch35511965800 observed SUCCESS, and its P3 failure is
known. Root final conclusion remains unobserved; it is not claimed successful.
Local correction and complete regression continue independently of that boundary.

The shared resolution form previously omitted linked-object fields even though the
API supported them. Added explicit nomination/charter/establishment link selection
and exact record ID authoring, without client-controlled status/actor/authority.
The form now uses the existing idempotency contract and retains its key after an
uncertain response; it no longer falsely says a network failure means no commit.
A browser test for each of the three links lets the real server commit, drops the
response, retries unchanged, and proves one canonical DRAFT resolution, the same
returned ID/key, no new membership, and persisted state after reload.

Initial browser probes timed out on ambiguous nested select labels. The original
log/error contexts remain retained; explicit accessible select names repaired the
UI without relaxing exact-name selectors. Corrected **3 browser tests passed** in
1.3m. This is additional focused evidence; the final complete suite and all28
browser tests still require their own frozen-source run.

### Full correction run and additional retry regression

Frozen081ebdd completed the **entire PostgreSQL/HTTP suite:4348 passed/11 existing
skips**,239 files passed/3 skipped,920.10s. Its browser stage was deliberately
interrupted to add a newly identified retry case; no complete browser success is
attributed to that source. Retained logs:body-081ebdd-complete-suite.log and
body-081ebdd-browser-interrupted.log.

The original form correction cleared its key on every4xx. A real-API browser
reproducer held an isolated, unexecuted IN_FLIGHT claim: attempt1 returned409,
but attempt2 used a **different key** and returned201. This demonstrated request
identity rotation around an unresolved claim, not a backend idempotency bypass.
Both failed reproducer logs are retained (body-inflight[-key]-reproducer.log).
The form now retains the key on every non-success response; only confirmed success
or changed payload starts a new key. No server recovery policy was weakened.

All3 strengthened browser cases passed in1.3m: two real REQUEST_IN_PROGRESS409s,
then release of only the demonstrably unexecuted fixture claim, real commit with
lost response, and replay. All four browser requests retain one key, one canonical
DRAFT resolution, no candidate membership, and reload persistence. The fixture
release is not a runtime recovery mechanism; uncertain committed claims remain
fail-closed. The complete final-source suite/browser run will be recorded below.

Fresh53 schema drift also passed (body-complete-drift.log). Integrity-with-ledger
passed with the same14 acknowledged historical debts and0 blockers; checksums for
0048–0051 remain exactly those recorded above. No historical migration was edited.

### Final local proof — c244caa17f0bd4cfe98ffe5108752eb998955f9c

The frozen application source completed **4348 passed/11 existing skips**,239
files passed/3 skipped,946.69s, followed by **all28 Chromium tests passed**,9.3m.
The combined process exited0; no source changed during either stage. Logs are
body-c244caa-suite.log and body-c244caa-browser.log. The exact CI DB-free release
command also passed182 tests/6 expected DB skips at this source,3.62s.

Typecheck, secret scan (2041 application-tree files), and build without runtime/
database secrets passed. Lint reports0 errors/1 existing image warning. One build
shell invocation returned1 despite completed build output and no diagnostic; its
body-c244caa-build-first.log is retained. A fresh explicit rerun reported build
exit0; no success was inferred solely from the ambiguous invocation.
Final schema drift passed with0 blocking/149 informational SQL-managed objects;
integrity-with-ledger passed with53 migrations and14 historical debts/0 blockers.
0048–0051 remain unchanged against08ba146. Runtime remains non-owner/non-BYPASSRLS;
no admin/test connection variables were supplied to the application process.

At14:11UTC final main fetch again failed because GitHub credentials were
unavailable; PR77 and root-run35511965796 queries returnedHTTP401 Bad credentials.
Last fetched main remains5ac90f2cc712582bde45cc0f2616937d856a6f71, and PR77's last
observed OPEN/DRAFT head is4652f006bd8e51148ff59a13ca13e05938e6547c. The corrected
source has **no observed remote CI certification**. No current-main reconciliation,
PR refresh, merge, production promotion or Finance activation is claimed.

A concise acceptance/evidence map and explicit remaining engineering gaps are in
X10THINK_2026-09-20_BODY_VALIDATION.md. This final checkpoint is documentation only;
its subsequent commit does not change the application SHA tested above. The broad
mission remains partial; in particular inactive establishment is not initial
composition/child-charter/ACTIVE bootstrap or the complete body/meeting lifecycle.
