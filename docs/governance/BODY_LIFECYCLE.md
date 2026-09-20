# Governing-body cessation, resumption and archival — 0058

This extends the existing shared governance capability. It does not create an OS,
a second body register or another appointment mechanism. The established chain
(0052–0056) remains: superior proposal/review/approval → dormant canonical committee
→ superior-approved initial charter → exact appointment decisions and human
consent → independently approved atomic composition/charter/body activation.

## Authoritative equivalents, not a duplicate state machine

- SUSPEND: canonical `governance_bodies.status` ACTIVE → SUSPENDED.
- RESUME: SUSPENDED → ACTIVE, only with satisfied adopted composition. Original
  memberships, expiry dates and membership-lifecycle states are never revived.
- DISSOLVE: ACTIVE/SUSPENDED → existing canonical **RETIRED**. The shared version
  enum is deliberately not expanded for every unrelated domain.
- ARCHIVE: a terminal, immutable APPLIED archival record following an APPLIED
  dissolution. The canonical body remains RETIRED. It is not deleted or relabelled
  active. The UI identifies DISSOLVED/ARCHIVED from that authoritative evidence;
  unrelated legacy RETIRED records do not acquire invented dissolution provenance.

`governance_body_changes` holds immutable proposals, original human parties,
affected-party snapshots, instruments, exact decisions and application evidence.
It is not a second canonical body registry. Revision is the applied-history count,
with a unique applied body/revision index to prevent concurrent or ABA replay.
All archival, dissolution and earlier establishment evidence remains readable
within the existing tenant/entity/classification scope.

## Authority and independence

This first cessation increment is bounded to established COMMITTEEs and their
recorded active BOARD/TRUSTEES superior, in the same tenant/legal entity/country.
No superior is invented for root or legacy bodies. Current human identity, MFA,
scoped dated grants, effective constitution, policy, presiding membership, parent
composition and instrument provenance are checked at execution, not just rendering.

An exact, appropriately classified RESERVED_MATTER decision linked to
GOVERNANCE_BODY_CHANGE is required. The decision event must match the recorded
outcome, presider and decision timestamp. The SQL guard also rejects an approved
reference row without that event. A different human from the original proposer
must apply it. Conservative independence excludes all recorded child members;
frozen affected parties and subsequently recorded child members may not vote
substantively on the superior decision. History cannot be bypassed through account
identity rebinding or changing the current membership set.

Dissolution/archival additionally require current full-history clearance and
resolved outstanding canonical decisions, governance tasks, appointments and
known Foundation meeting records. An RLS-hidden record cannot be assumed absent.
Unresolved/deferred/deadlocked work blocks wind-down; the operation does not cancel,
transfer, verify or close work by fiat. Unknown meeting states block. The broader
shared meeting chain and cross-domain handover remain future engineering.

## SQL, atomicity and current writes

0058 is forward-only. 0048–0057 and their checksums are preserved. Fresh installs
apply all 59 migrations. Existing body/member/charter/appointment/decision values
are unchanged on upgrade; no historic lifecycle records are synthesized.

The new table has forced scope/classification RLS, no runtime DELETE, immutable
proposal/history guards, current actor-derived application identity and a deferred
canonical projection check. Initial activation keeps its exact original guarded
alternative. The only added body UPDATE alternative is an exact latest approved
lifecycle projection; all other body fields and DELETE remain protected. No
membership, finalized-decision, Finance, role-assignment or scope guard is relaxed.

Body row locks serialize changes. Superior body/member, instrument and constitution
read locks protect the SQL authority checks. New invoker triggers serialize
resolution, ballot, mandated-task and action-evidence writes against body cessation
and reject them when the body is inactive. Historical reads remain available.
Application transactions add the canonical status, history, audit, shared event
with correlation/causation, and generic scoped in-app notices together. These
notices do not claim delivery, acknowledgment or delegated authority.

Runtime credentials remain non-owner, non-superuser and non-BYPASSRLS. An attempted
role-assignment read-lock optimization was removed after the runtime tests correctly
rejected it: PostgreSQL row locks require UPDATE privilege, which this runtime is
intentionally denied on RBAC assignments. No grant was widened to accommodate it;
existing execution-time live-grant checks remain in force.

## UI and verification

The existing governance workspace displays authoritative status, retained history,
request-specific resolution links and independent application controls. Unchanged
uncertain requests retain their idempotency key. Current authority is rechecked
before receipt recovery. Refresh/reload reads backend truth, not client-made status.
Archived history cannot expose a new activation action.

The new matrix covers service, actual non-owner SQL, predecessor upgrade, HTTP and
browser paths, including suspension/resumption/dissolution/archive, authority
expiry/revocation, actor independence, scope, recusal, concurrent application,
rollback, partial COMMIT, projection/metadata/history protection, inactive SQL
writes, wind-down blockers and original final ballots. Fixtures also complete a
real independently verified action before dissolution and check that its original
closed mandate and document evidence remain readable after archival.

Focused checks are not completion evidence. The source-specific checkpoint records
the complete regression/browser reruns and observed CI separately. The previous
0057 complete proof is retained in MEMBERSHIP_VALIDATION_2026-09-21.md.

## Remaining engineering

Root-body superior authority and cessation; vacancy recovery while a suspended
body lacks composition; renewal/successor terms and succession; first-class seats,
competency/independence/geography evidence; fuller charter lifecycle; the linked
meeting/notice/acknowledgment chain; calendar/delivery/evaluation/reporting and
advanced read-only analysis remain gaps. They are not GitHub or approval blockers.
Membership and body status still confer no RBAC, security, Finance, delegated
capability or CAP_POSTING. Noelia/HIVE remain assistive. Production promotion is
human-controlled.

## Subsequent deferred-validation hardening

The later security review reproduced a context-loss loophole in five existing
atomic guards. [0059](ATOMIC_VISIBILITY_HARDENING.md) closes it with a forward,
invoker-only fail-closed visibility check. The complete validation target is now
**60 migrations**, not the intermediate 59-migration development database.
