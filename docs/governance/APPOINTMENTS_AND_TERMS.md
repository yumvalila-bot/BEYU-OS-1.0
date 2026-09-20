# Governed appointments and bounded membership terms

2026-09-20 · IMPLEMENTED core appointment chain / PARTIAL complete body lifecycle.
A shared constitutional control-plane capability, not a separate OS.

## Implemented chain

NOMINATED → APPROVED → ACCEPTED → ACTIVE. An approved or accepted nominee may
DECLINE before activation. Every transition has an expected revision and atomic
shared audit/event evidence. Terms cannot be edited: changed intent requires a
new nomination and new decision. ACTIVE and DECLINED records are terminal.

1. A currently authorized human presiding officer nominates a different human,
   with an authoritative document snapshot, role, voting flag, finite dates and
   evidence-review rationale. No retroactive start or voting observer is allowed.
2. Another presiding person records approval against an actual approved,
   attributed, quorate, appropriately classified APPOINTMENT resolution explicitly
   linked by `GOVERNANCE_APPOINTMENT` and the nomination ID. Decision-event
   provenance is mandatory. The nominating person and nominee cannot approve it.
   A nominee's own participating ballot cannot support their appointment.
3. Only the same active human nominee with MFA may accept/decline. Consent does
   not insert a member or grant any authority. A presiding officer cannot consent
   on the nominee's behalf.
4. A current unconflicted presiding human activates the accepted appointment.
   This independently rechecks source decision authority, current grants, MFA,
   constitutional/policy controls, document and nominee identity, overlap and
   adopted composition. An unchartered legacy body cannot activate new membership;
   it must first adopt a readable charter. It atomically creates the exact canonical
   `governance_members` record, never an RBAC grant or Finance capability.

The start/end dates use the existing canonical inclusive date semantics. Scheduled
members remain ineligible until their start date; expired terms stop conferring
voting/presiding eligibility through existing date checks. A subsequent non-overlapping
term can be recorded as a new appointment/member record, retaining previous IDs and
historical ballot links. This is not automatic renewal or a complete succession,
resignation/removal workflow. The roster displays current/scheduled/expired terms.

## Scope and evidence

- Nominees must be active non-service-account users in the body's tenant, with
  independently provisioned governance-read access and sufficient current
  classification/entity clearance. Nomination cannot provision those grants.
  Cross-tenant onboarding is deliberately unsupported rather than widened.
- Instruments must be authoritative, current, same-tenant, appropriate to the
  body's entity and country, and have a valid SHA-256. Version/checksum/classification
  are snapshotted. Later registry changes block use of stale nomination terms.
  Registry metadata is not independent verification of remote document bytes.
- Eight canonical seat roles are supported. Competence/independence review has a
  human-reviewed instrument and rationale, not a machine-certified competency matrix.
  In particular, INDEPENDENT_MEMBER is not proof of legal independence.
- An adopted, readable charter is mandatory for new membership activation, even
  though existing legacy written-resolution paths remain supported. Composition
  is checked both now and at known membership boundaries
  throughout the proposed term. Hidden adopted terms fail closed. Overlapping
  party terms are rejected. The service never lowers quorum to fill a vacancy.
- A body that already cannot meet its adopted controls cannot use this route as
  an emergency recovery bypass. Superior-body/recovery authority remains a gap.

These records authorize membership of a governing body, not automatic statutory
DIRECTOR/OFFICER/TRUSTEE registration in `entity_appointments`, security-role
provisioning, regulatory filing or legal ratification. The existing canonical
membership and legal appointment concepts are not merged or relabelled.

## Database and concurrency

Additive migration0051 adds `governance_appointments` with ENABLE/FORCE RLS, scope
inherited from the body, classification filtering, immutable term/provenance
checks and no runtime deletion. Transition actor context is set from the trusted
server Principal, never a payload field. All SQL functions are SECURITY INVOKER.

The historical0048 SQL is unchanged. Its unconditional member INSERT denial is
replaced **only for insertion** by a narrow rule requiring the exact matching
ACTIVE appointment, current activation actor and transaction-local appointment
link. An appointment flag alone is not enough. A deferred constraint requires
ACTIVE appointment and exact canonical membership to commit together. Body
INSERT/UPDATE/DELETE and membership UPDATE/DELETE protections remain unchanged.
This is an explicitly governed authority-write path, not a privileged alternate
connection, RLS bypass or permission to create arbitrary members.

Services additionally enforce live human authority, MFA, source decision-event
provenance, independent approval, nominee consent, policies and composition.
RLS remains the final tenant/entity/classification boundary; it is not a claim
that all application authorization is replaced by SQL. PostgreSQL request-context
settings remain trusted application context, as in the existing platform.

Commands use canonical resolution locks followed by body and appointment locks.
Nomination/consent also serialize through the body. Expected revisions reject
concurrent replay; idempotency claims are outside mutation transactions through
the shared wrapper. API replay rechecks scoped access and current presiding or
nominee authority before returning a cached response. Client retries retain keys
when outcomes are uncertain.

## API, UI, audit/events and notifications

- GET/POST `/api/v1/governance/bodies/:id/appointments`
- POST `/api/v1/governance/bodies/:id/appointments/:appointmentId`

Strict schemas reject client authority/state/identity fields and malformed JSON.
Nomination requires approval capability; consent/command entry requires read
access, with stricter server-side command authorization. API rate limits remain.
The existing governance body cards show nomination history and role/date/evidence
forms, independent approval, nominee consent and activation. Canonical document,
nominee and decision IDs are manually supplied in this first UI.

Shared events: GOVERNANCE_MEMBER_NOMINATED, GOVERNANCE_APPOINTMENT_APPROVED,
GOVERNANCE_APPOINTMENT_ACCEPTED, GOVERNANCE_APPOINTMENT_DECLINED,
GOVERNANCE_MEMBERSHIP_ACTIVATED. Approval/activation have decision-event causation;
records carry trace/correlation, actor, classification, authority and applied policy
version. Generic in-app notifications commit with transitions and contain no
classified instrument or candidate details. Deep links reauthorize on access.
No Noelia/HIVE self-authorization or CAP_POSTING activation is introduced.

## Validation / rollout

Fresh52-migration replay/seed/runtime provisioning succeeded. Initial focused
validation: 26 new tests (13 lifecycle, 11 actual non-owner SQL/RLS, 2 real HTTP),
plus existing charter14 and core RLS23: **63 passed**. The new Chromium test passed
nomination → independent approval → nominee acceptance → activation and reload
with three authenticated identities. Production build/typecheck/lint passed
(0 lint errors / one existing image warning). Complete suite/browser regression
is running; do not infer its result from focused checks.

Apply0051 before this writer. Deployments must retain migration, authentication,
RLS, approval and branch protections. Rolling back the application leaves persisted
member terms authoritative; do not delete legitimate appointments or history to
undo a release. Production rollout and legal ratification remain human-controlled.

## Remaining engineering work

Governing-body establishment/suspension/dissolution and superior-body authority;
formal seat/vacancy planning; competency and independence evidence matrices;
advanced renewal/succession, early resignation/removal and emergency recovery;
shared meeting/notices/invitations/acknowledgements/agenda/papers/attendance/motions/
minutes lifecycle; shared calendar, expiry escalation and evaluations. These are
engineering gaps, not external blockers. This increment does not certify the full
X10THINK mission or replace missing legal governance with a title or UI status.


Final review hardening: initial source2a00048 allowed activation with LEGACY_UNCHARTERED
coverage. The subsequent correction requires an adopted readable charter before
creating any new membership, without blocking preparatory nomination or rewriting
existing legacy resolution authority. Appointment fixtures now actually adopt their
charter through independent, decision-backed commands. A rollback-isolated negative
test proves that removing charter coverage blocks activation and leaves no member.
The earlier4302/14 complete regression applies to2a00048; corrected-source regression
must be separately completed and recorded.


Entity-grant correlation is also enforced at the shared charter/appointment
presiding boundary: only currently dated grants applicable to the target legal
entity contribute permissions, clearance and policy roles. A foreign-entity approval
grant cannot be combined with a target-entity read grant to manufacture approval.
Nominee access and consent-policy role resolution use the same target filtering.
A real non-owner regression then reproduced the same issue in canonical resolution
tabling (the negative test resolved TABLED instead of denying). The shared
voting/closure/recusal/follow-up authorizer now also resolves current target-entity
grants, and read-only preflight observations use the same filtering. This is a
bounded governance correction, not certification of every cross-domain Principal/
grant consumer. No assertion was weakened to repair the demonstrated defect.


A second real tabling regression reproduced a service account retaining a presiding
seat and being recorded as a HUMAN actor. Canonical acting-seat lookup now requires
a currently active non-service-account user bound to the Principal's party. Even a
retained seat, role grant and previously satisfied MFA cannot turn a machine account
into a voting/presiding human. The negative test is retained. Read-only assistance
is not converted into an approval or self-authority path.
