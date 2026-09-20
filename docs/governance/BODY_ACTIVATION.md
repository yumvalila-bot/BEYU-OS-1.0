# Atomic initial composition and body activation (0056)

Governance remains a shared Constitutional Control Plane capability, not another
OS. This closes the initial bootstrap path introduced by 0052–0055 without
creating a parallel body or membership registry.

## Authoritative chain

1. A constitutionally authorized, active BOARD/TRUSTEES superior establishes the
   dormant committee using the existing exact RESERVED_MATTER decision.
2. That superior approves the committee's immutable initial charter. APPROVED is
   deliberately not effective; the body remains DRAFT.
3. Each initial appointment receives a nomination-specific APPOINTMENT decision,
   independent presiding approval, and the identified human nominee's consent.
4. A current superior presider proposes an immutable activation plan containing
   the **exact** consented nominations. The service derives the superior, charter,
   scope and classification. It checks current and term-boundary composition.
5. Submit that plan for a superior RESERVED_MATTER resolution linked to
   `GOVERNANCE_BODY_ACTIVATION` / the plan ID. Record independent approval.
6. Independently activate the approved plan. One transaction creates each
   canonical membership, activates each exact appointment, effectuates the
   initial charter, activates the canonical body, and writes audits/shared events.

The existing governance page exposes this workflow. The shared resolution form
supports the exact activation-plan link. Success reloads backend state; network
uncertainty retains the unchanged request's idempotency key. Completed activation
receipts are reauthorized against the **recorded superior**, not the newly active
child. Known rolled-back domain errors release claims; ambiguous storage or
completion failures remain IN_FLIGHT under the existing idempotency contract.

## Independent authority, not a grant

MEMBERSHIP ≠ RBAC ROLE ≠ SECURITY CAPABILITY ≠ FINANCE CAPABILITY ≠ DELEGATED
AUTHORITY. No such grants are created by this workflow. CAP_POSTING is untouched.
Noelia/HIVE cannot nominate themselves, vote, approve, or bypass human controls.

Every material step rechecks the live human identity, scoped grants, MFA,
constitution, superior authority and adopted composition, initial charter,
current document/entity/country, nominee identity and consent, exact appointment
mandates, approval independence, resolution provenance, quorum and recusal.
The plan proposer or any included nominee cannot approve or activate it.
Expired/revoked grants do not survive approval. Missing initial charter authority
is FORBIDDEN, including the established-body regression contract; stale or
inconsistent evidence remains a rule violation.

Canonical membership is not created one member at a time across commits.
Ordinary individual initial-appointment ACTIVATE remains forbidden. Existing
active-body appointment behavior remains governed by its existing checks.
Initial members must satisfy mandatory composition at every relevant term
boundary; this does not implement competency, renewal or succession workflows.

## Database boundary and history

0056 is additive to the historical migration chain. Its new evidence table uses
forced RLS, body/entity/tenant/classification scope, immutable evidence and
transitions, and no runtime deletion. All functions are invoker functions.
No SECURITY DEFINER, runtime superuser, RLS bypass or historical ledger repair
is introduced. Database-generated times record proposal/activation execution.

The body UPDATE policy is narrowly paired with the exact active transaction plan;
a trigger prohibits changing any other body field. Initial charter effectiveness
can change only status and revision, preserving original authors, approvers,
decision and approval time. All other charter operations retain historical guard
functions. Initial appointment activation must match the exact plan and actor.
A deferred constraint rejects **COMMIT** unless the entire exact member set,
appointments, ADOPTED charter and ACTIVE body are present. Existing member
UPDATE/DELETE, finalized-decision, body INSERT/DELETE and scope controls remain.
Privileged database maintenance remains outside the runtime RLS boundary, as
before; the application connects as a non-owner/non-bypass role.

The real 0000–0055 → 0056 upgrade test first creates four independently consented
initial nominations using the predecessor schema. It compares bodies,
establishments, charters/terms, appointments, members, resolutions/votes, role and
capability assignments, audits and events before/after. Migration and no-op do not
activate bodies, create membership or rewrite history.

## Validation and remaining scope

Focused proof on fresh `beyu_body_activation_final_57`, all 57 migrations applied:
9 activation-service tests, 16 actual non-owner SQL tests, real predecessor upgrade,
5 actual HTTP tests, and one complete browser nomination-to-visible-seats flow.
This includes concurrency, partial-COMMIT rejection, injected mid-membership
failure, full transaction rollback, immutable provenance, independent approval,
wrong scope, expired/revoked authority, replay and no role/capability grants.
The CI-discovered missing-charter denial regression was fixed in implementation,
not by weakening the existing assertion; its 31-test service regression passed.

At implementation publication, the full regression and all-browser rerun are
pending; see the subsequent validation checkpoint for completed, source-specific
results and observed CI. Focused proof is not full certification.

Still engineering work: governed suspension/dissolution/archive of established
bodies; membership renewal/resignation/suspension/removal and succession;
first-class reserved seats, competencies and eligibility evidence; broader
calendar/notification orchestration, evaluations/reporting and advanced assistive
analytics. Existing meeting, notice/acknowledgment, attendance, papers, agenda,
motion, vote, minutes and resolution-to-action/evidence/verification chains are
not replaced by this increment. Production promotion remains human-controlled.
