# Superior-body establishment — bounded dormant committees

Shared BEYU constitutional control-plane capability, not a new OS.

## Implemented boundary

The existing `governance_bodies` register and version-status enum remain canonical.
Establishment proposals hold immutable evidence; they are not a second body or
membership register. The bounded chain is:

DRAFT (proposal + proposed charter) → IN_REVIEW (authority review) → APPROVED
(superior RESERVED_MATTER decision) → ESTABLISHED (exact canonical DRAFT committee).

Only an already-active, chartered BOARD or TRUSTEES body with satisfied composition
may establish an internal COMMITTEE in its **same tenant/legal entity/country**.
Neither caller-supplied tenant/entity/country/type/status nor a generic security
role can create superior authority. Current human presiding identity, MFA, live
entity-correlated grants, constitutional/policy controls, scope and instrument
classification are checked. The initial quorum, majority and reserved matters
must preserve superior controls. This is deliberately not generalized authority
to establish subsidiaries, statutory boards, trusts or a Foundation.

The proposed instrument must be current, authoritative and scoped to that entity
and country. Its version/checksum/classification, composition rules, purpose and
superior adopted charter are immutable. Source changes require a new proposal,
not rewriting history. The approved resolution must link exactly to
`GOVERNANCE_BODY_ESTABLISHMENT` and the proposal ID, be appropriately classified,
quorate/attributed and have canonical decision-event provenance. Follow-up uses
existing vote, quorum, conflict/recusal and reserved-matter checks. An independent
person, checked against immutable proposer-party identity, records approval and
establishment. Approval is not automatic establishment.

## Establishment is NOT activation

The canonical committee remains **DRAFT**, has no members and cannot vote, appoint,
self-establish, grant RBAC, activate a Finance capability or execute delegated power.
A body ID, a signed proposal or an ESTABLISHED proposal status is not authority.
The child instrument pointer is not an adopted child charter. No CHARTER_ADOPTED,
MEMBERSHIP_ACTIVATED or BODY_ACTIVATED event is fabricated.

The complete body lifecycle is **PARTIAL**. Atomic consent-backed initial membership
and superior-authorized child-charter adoption/activation remain engineering work.
Suspension, dissolution, archival and superior vacancy recovery are not implemented
by this bounded path. Existing body UPDATE/DELETE denials are deliberately retained;
there is no hidden administrator or Finance bypass to finish the missing stages.

## Persistence and isolation

Additive0052 adds the proposal/evidence table with FORCE RLS, immutable transition
checks, no runtime deletion and a deferred exact-body constraint. Only the body
INSERT denial is replaced by an exact established-proposal match, requiring a
DRAFT COMMITTEE in the superior's entity with matching rules, instrument and identity.
Body UPDATE/DELETE, member insertion via0051 only, member UPDATE/DELETE and finalized
ballot/decision controls are unchanged. All functions are SECURITY INVOKER.

Body identities gain classification. Existing identities retain their prior PUBLIC
reference visibility inside tenant/entity RLS. Newly established identities inherit
the proposal/instrument classification and a restrictive body policy prevents a
lower-clearance reader from learning a higher-classification committee identity.
This does not declassify parent or child charter terms. Proposal RLS inherits the
superior scope and separately checks classification. Database contexts remain
trusted server context, as elsewhere in BEYU; payloads cannot set them.

Canonical code uniqueness prevents duplicate body creation, including concurrent
proposals. Competing transitions serialize on canonical resolution→superior body→
proposal locks and expected revision. Proposal, body, generic notification, audit
and event commit together or roll back together. Approval and establishment carry
decision-event causation; every material transition carries correlation/trace,
actor, classification and applied policy metadata.

## API and UI

GET/POST `/api/v1/governance/bodies/:id/establishments`
POST `/api/v1/governance/bodies/:id/establishments/:establishmentId`

The existing body cards host the proposal, superior review and inactive-establishment
controls. The UI displays the non-authorizing boundary explicitly, refreshes from
backend state and preserves idempotency keys for uncertain retries. Replay checks
current scoped presiding access before returning cached outcomes. Duplicate codes
return a generic conflict rather than disclosing an out-of-scope body's details.
Generic in-app notices link to the governed record and carry no classified contents.

## Remaining body foundation work

This is a guarded establishment foundation, **not completion** of P1 or the whole
requested mission. Implement the explicit superior bootstrap and initial-composition
path next without granting authority merely to make an empty body usable. Then
complete activation/suspension/dissolution/history, charter lifecycle, membership,
seats, competency, succession and linked meetings. Missing engineering must not be
relabelled as a human approval or external blocker. Production promotion remains
human-controlled.

The shared resolution proposal form can author the required exact establishment
link: RESERVED MATTER + Body establishment proposal + the proposal ID. The server
still derives actor/tenant/status and validates the later mandate independently.
Browser recovery tests drop a real committed response and prove unchanged retries
return the same single DRAFT resolution. No optimistic UI item substitutes for
persisted authority, and linkage itself grants no power.
