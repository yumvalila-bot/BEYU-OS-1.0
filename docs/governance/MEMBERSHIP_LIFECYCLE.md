# Governed membership cessation and reinstatement — 0057

This extends the existing shared governance control plane. Canonical membership
remains `governance_members`; the new request table is immutable authority/history
evidence, not a second membership registry. Original seat, party, body, voting
rights, appointed/retired dates and appointment decisions are never rewritten.

## Implemented transitions and authority

- ACTIVE → RESIGNED, or SUSPENDED → RESIGNED: the identified human member, current
  independently scoped read access, MFA, constitution, policy and documentary
  scope. No superior may impersonate the member's voluntary resignation.
- ACTIVE → SUSPENDED: exact superior RESERVED_MATTER decision, independently applied.
- ACTIVE/SUSPENDED → REMOVED: the same independent superior authority.
- SUSPENDED → ACTIVE: independently approved reinstatement within the **original
  current term**, with valid adopted composition. This is not renewal.
- EXPIRED remains derived from the original inclusive end date. No scheduler or
  historical date rewriting is needed to remove expired eligibility.

Involuntary changes/reinstatement are deliberately bounded to established ACTIVE
committees with a recorded, active BOARD/TRUSTEES superior in the same tenant and
legal entity/country. They do not invent a superior for legacy/root boards.
The child cannot self-authorize these operations. The exact request pins member
revision, old/new status, current instrument, original proposer user/party and
recorded superior. The applied user **and original human party** are preserved;
SQL derives the applied party and execution timestamp from the current actor.
The proposer and affected person cannot independently apply the decision. An
affected person's substantive participation in the superior decision is denied.

Every application rechecks live grants, human identity, MFA, constitution,
parent authority/composition, entity/country/document, exact resolution linkage,
decision provenance, quorum, recusal and original term. Approval is not a cached
permission. Stale/concurrent/replayed changes cannot advance a member twice.

Cessation may create a vacancy and break mandatory composition: resignation must
not manufacture eligibility merely to retain quorum. Live authority then fails
closed. Reinstatement cannot grant eligibility into invalid composition; the
recorded superior supplies independent repair authority even when the child
cannot act. Broader vacancy replacement/renewal remains a separate engineering gap.

## Live authority versus historical facts

Current voters, presiders, tabling/closure/action authorizers, charter composition,
appointment-overlap checks and read-only simulation consult lifecycle status as
well as original dates. Suspended occupancy is retained for overlap checks;
terminal resigned/removed memberships do not reserve a future occupancy.
Inactive members and their old ballots remain readable within existing scope.
Final decision snapshots and original appointment evidence remain unchanged.
Personal ballots on final decisions are selected from historical seats, not the
current electorate: a suspended/resigned voter still sees their recorded vote,
without regaining the ability to vote. A reproduced regression and its retained
assertions cover that separation.

The SQL migration carries forward the latest invoker establishment, charter,
initial-appointment, body-activation and current-composition guards, adding only
live membership status to their presider/composition predicates. It does not
rewrite 0048–0056. Additional restrictive ballot INSERT/UPDATE policies reject
inactive/expired/non-voting seats without hiding historical ballots.

MEMBERSHIP ≠ RBAC ROLE ≠ SECURITY CAPABILITY ≠ FINANCE CAPABILITY ≠ DELEGATED
AUTHORITY. No role/capability/Finance/delegation grants or revocations are performed
by these membership transitions. CAP_POSTING and Noelia/HIVE restrictions remain.

## Atomicity, RLS, audit and UI

The request table has forced scoped tenant/entity/classification RLS and no
runtime DELETE. Applied rows and proposed evidence are immutable. The only new
member UPDATE exception is an exact transaction-paired lifecycle status/revision
projection; all other fields and DELETE protection remain. A deferred constraint
rejects partial COMMIT or invalid reinstatement composition. One transition per
member per transaction is intentional. No SECURITY DEFINER or runtime bypass is
introduced; privileged fixture/bootstrap maintenance remains separate as before.

Service transactions include canonical projection, immutable history, shared
in-app notification, audit and correlated/caused shared governance event. The
membership panel reloads backend state, retains unchanged uncertain-request keys,
shows history and derives expiry from dates. The shared resolution form links
`GOVERNANCE_MEMBERSHIP_CHANGE` to the exact request ID. Notifications confer no
authority and do not substitute for delivery/acknowledgment orchestration.

## Migration and validation

0057 is additive: existing rows retain their original fields and receive an ACTIVE
lifecycle projection at revision zero, **not a renewal of expired dates**. Reseeding
uses explicit original columns and ON CONFLICT DO NOTHING, so historical schemas
remain seedable and ended memberships are never resurrected. The 0056 upgrade
fixture now uses version-stable predecessor SQL rather than importing future ORM
columns into an old schema; all old guards run and its preservation assertions
remain unchanged. No triggers are disabled and no ledger is repaired.

Fresh `beyu_membership_frozen_58` contains all 58 migrations, non-owner runtime
setup and seed. Initial proof: 11 service, 10 actual non-owner SQL, one real
0000–0056 → 0057 upgrade/no-op/reseed test. Earlier development builds additionally
passed four actual HTTP tests and a complete browser suspension → denied authority
→ independent reinstatement → personal resignation/history workflow. These are
not substitutes for the full regression/browser rerun on the published increment.
Typecheck, lint (one existing image warning), integrity (58 checksums, 14 known
metadata debts, zero blockers), drift (zero blockers) and no-op passed before
publication. The complete validation checkpoint will record final source-specific
suite, browser and observed CI outcomes, not infer them.

## Remaining work, not external blockers

Renewal requests and separately consented successor terms; full seat definitions,
reserved/independence/competency/geography requirements and succession; generalized
vacancy recovery; root-body superior-authority modelling; body suspension,
dissolution and archive; fuller charter/meeting/calendar/delivery/evaluation/
reporting chains and advanced assistive analytics. This increment does not claim
the entire membership or governance lifecycle complete. Production promotion
remains human-controlled.
