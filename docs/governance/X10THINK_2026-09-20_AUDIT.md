# X10THINK governance reality audit and integrity hardening

Date: 2026-09-20. **Engineering checkpoint — NOT a completion or production certification.**

Continuation: the generic action chain is now implemented as described in
[Resolution execution](RESOLUTION_EXECUTION.md). The full mission remains incomplete.

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
| B Governing bodies | PARTIAL | `governanceBodies`, `/os/governance`; identity/type/entity/quorum/majority; runtime writes now blocked pending controlled administration. No complete charter/history/effective-date workflow |
| C Charters / terms | PARTIAL | `charterDocumentId`, shared documents; no approval/version/supersession lifecycle for charters |
| D Membership | PARTIAL | `governanceMembers`, `core.entityAppointments`, party/user linkage; active authority FIXED. No shared application/nomination/acceptance/suspension workflow |
| E Seats / composition | PARTIAL | `seatRole`, `votingRights`, appointment dates; no independent vacant-seat/composition/competency model |
| F Competency matrix | NOT IMPLEMENTED | No corporate governance competency schema/service/API in inspected source. HCM is not a substitute |
| G Tenure / succession | PARTIAL | Member dates and family/trust mechanisms; no shared renewal/emergency replacement/expiry notification workflow |
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
| AJ Event ledger | PARTIAL; covered mutations IMPLEMENTED | `withAuditTransaction`, hash-chained audit/events; proposal/table/vote/decision/recusal and all new task transitions atomic, with decision causation. Missing workflows cannot emit real events |
| AK Security | PARTIAL; core RLS/decision defects FIXED | Guarded identity/RBAC/ABAC/MFA and core RLS; country-scoped policy uses entity country, **no independent country grant axis on Principal**. Full cross-domain audit not certified |
| AL Exceptions | PARTIAL substrate | Shared approval/security mechanisms; no explicit expiring corporate quorum/notice exception workflow. No implicit exceptions introduced |
| AM Break-glass | PARTIAL substrate | Existing emergency permissions and auditing remain; no new governance bypass or self-authorization. No claim of complete governance emergency workflow |
| AN Multi-entity/country | PARTIAL | Tenant subtree, legal entities, entity ABAC and RLS, country policy context; no complete cross-border constitutional rule model |
| AO Knowledge graph | PARTIAL | Existing relational IDs/FKs/events; no unnecessary graph store. Missing meeting/action/evidence edges remain missing |
| AP Simulation | NOT IMPLEMENTED (governance preflight API) | Pure voting/authority engines are testable; that is not an authorized non-mutating scenario API |
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
