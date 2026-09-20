# Governed charter versions and composition controls

2026-09-20 · P1 increment · **Not completion of the body/appointment mission.**

## What is implemented

Existing bodies can record document-backed charter/Terms-of-Reference versions:
DRAFT → IN_REVIEW → ADOPTED. Creation fixes the document version, checksum,
purpose and structured composition requirements. Terms cannot be edited; a
change needs a new version. Adoption requires another human presiding officer,
a real approved/quorate/attributed POLICY resolution explicitly linked to that
charter ID, matching decision-event provenance, and a composition assessment.

The latest adopted version is current; earlier adopted versions remain immutable
history. A newer draft does not displace current rules. An older version cannot
be adopted over a newer adopted version. A source document's later metadata edit
does not silently change already adopted structured terms; the adoption snapshot
and constraints remain until another version is validly adopted. This is not a
claim of storage-object byte immutability or legal sufficiency.

The charter can constrain active voting membership and required seat counts for
CHAIR, VICE_CHAIR, SECRETARY, TREASURER, MEMBER, INDEPENDENT_MEMBER,
COMMITTEE_MEMBER and OBSERVER. Checks include appointment dates, duplicate party
seats, unknown roles, observers incorrectly marked voting, absolute quorum,
voting member bounds and per-role minimum/maximum counts. Counting an
INDEPENDENT_MEMBER role is not proof of regulatory independence or competency.

Charter quorum and majority must match canonical body rules. This path cannot
rewrite voting rules, establish a new body, appoint a member or grant authority.
It does not update the old `governance_bodies.charter_document_id` import/reference
field; current adopted versions are the new versioned charter source. No existing
reader/authorizer depended on that legacy pointer. Source body/seat authority and
all migration0048 protections remain unchanged.

## Enforcement, not display-only reporting

`currentCharterComposition` is invoked by the canonical governance authorization
path before table/vote/decision/recusal/follow-up mutations. Violated adopted
constraints block these actions. Bodies with no adopted record are explicitly
labelled LEGACY_UNCHARTERED rather than pretending an instrument was ratified.
Their existing P0 gates still apply; this migration does not fabricate charters
or silently disable existing governance. Legacy coverage remains a real gap.

Charter drafting/submission alone confers no authority. Adoption additionally
uses `authorizeResolutionFollowUp`, including current grants, membership, MFA,
constitution, policy obligations and source-resolution conflict/recusal checks.
Both approval-capability policy and charter-command policy are applied. Documents
must be current, authoritative, accessible, same tenant, appropriate entity and
country, with a valid SHA-256. Concurrent versions and transitions serialize on
the existing body lock and canonical resolution lock. Expected revision is
mandatory. Author and adopter must differ. Adoption cannot use a status-only
seed record, unrelated resolution, foreign body or under-classified decision.

## Database boundary and confidentiality

Migration0050 adds two normalized records, not a parallel body/member system:

- `governance_charters`: minimal control header, version/status/revision, provenance
  identities and adoption linkage; inherited body/tenant/entity visibility plus
  trusted governance-read context. Its presence must remain visible to the
  authority evaluator even if classified terms are withheld.
- `governance_charter_terms`: one-to-one immutable document snapshot/purpose/rules,
  additionally protected by classification RLS. No runtime UPDATE/DELETE policy.

This separation prevents the dangerous `no visible charter ⇒ no constraints`
fallback. An adopted header with inaccessible terms makes evaluation fail closed.
It does not disclose document identifiers, hashes, purpose or rules to a reader
below their classification. Header metadata is intentionally a separate, scoped
control record; it is not a public endpoint or a privilege to view terms.

Both tables use ENABLE/FORCE RLS, no global-scope bypass, and no runtime deletion.
State/source/terms immutability and scoped document/decision requirements are
backstopped by SQL triggers, checks and foreign keys. There is no SECURITY DEFINER
function, privileged writer, special connection, permission grant or modification
to the protected body/member write policies. New functions are SECURITY INVOKER.

## API, UI and audit/events

- GET/POST `/api/v1/governance/bodies/:id/charters`
- POST `/api/v1/governance/bodies/:id/charters/:charterId`

Strict contracts reject client state/actor fields. Commands are SUBMIT/ADOPT,
with expectedRevision and a review note; ADOPT requires resolutionId. The shared
authentication, rate-limit, transaction/RLS, error and idempotency wrappers are
used. Command replay checks current charter visibility. Creation replay rechecks
body visibility and the current approval capability. Browser retries preserve the
idempotency key when a response is uncertain.

Each body card in the existing governance workspace has version history,
classification-safe terms, composition coverage and create/review/adopt controls.
The form currently uses canonical document/resolution IDs and validated JSON for
composition rules. This is functional but not the final polished editor.

Audit and `GOVERNANCE_CHARTER_CREATED`, `GOVERNANCE_CHARTER_SUBMITTED`,
`GOVERNANCE_CHARTER_ADOPTED` events share the mutation transaction. Dates are
normalized before hashing; adoption has decision-event causation. The shared
interoperability event catalogue is updated. No Noelia mutation tool or Finance
capability is added.

## Tests and deployment

`charter-lifecycle.test.ts` exercises real runtime-role commands, current authority,
composition, concurrency, missing/incorrect decision provenance, author/adopter
separation, document drift, rollback, audit/event chains and actual resolution
enforcement after adoption. `charter-rls.test.ts` uses a distinct real non-owner,
non-superuser, NOBYPASSRLS connection for direct SQL. `charter-http.test.ts` drives
the real server. `governance-charter.spec.ts` creates, reviews and adopts through
the browser with two identities and verifies persisted records after reload.

Apply0050 before the new application calls the charter evaluator. It is additive;
0048/0049 SQL and historical snapshot debt are unchanged. A separate disposable
PostgreSQL database was freshly migrated/seeded for this increment; no existing
checkout, branch or production database was reset. After adopting a charter,
rolling back to a pre-charter application would omit its enforcement: use a
coordinated maintenance/read-only rollback, not old writers or disabled RLS.
Production rollout remains human-controlled.

## Still not implemented

Full governing-body creation/suspension/dissolution; charter-driven changes to
canonical voting rules; nominee/appointment approval and acceptance; automatic
seat activation; competency evidence, independent-status verification, tenure,
renewal, succession, resignation/removal; charter approval by a different superior
body; vacancy/exception recovery; the meeting-to-minutes lifecycle. Existing
administrative controls are not relabelled as these missing workflows. A vacancy
that violates adopted rules deliberately blocks operations; it does not invent
emergency authority or appoint a replacement. These remain engineering gaps,
with separate human ratification requirements—not fabricated external blockers.
