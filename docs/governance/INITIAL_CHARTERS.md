# Superior approval of an initial committee charter

This extends the existing shared governance capability, not a new OS or parallel
body registry.0052 establishes only a dormant DRAFT committee.0053 now lets the
superior recorded in that immutable establishment propose/review/approve its
initial charter. The child cannot preside over itself.

## Authority and lifecycle

- Reuses `governance_charters`, immutable terms, existing charter endpoints and
  shared resolution/voting/decision/audit/event services.
- Active bodies retain DRAFT → IN_REVIEW → ADOPTED with their existing composition
  checks. Dormant committees use DRAFT → IN_REVIEW → **APPROVED**. APPROVED is
  expressly **not effective**, not ADOPTED and not a body activation.
- The server derives `authorityBodyId` from the establishment. It snapshots the
  original `createdByPartyId`; neither is client-supplied or editable.
- The superior must be an active, chartered BOARD/TRUSTEES with satisfied
  composition. Current human presiding membership, independent approval, live
  scoped RBAC, MFA, constitution and policy are still required.
- Approval requires a real, appropriately classified POLICY decision on that
  superior, linked to the exact child charter. Scope, current document evidence,
  effective dates, decision provenance, quorum and recusal are rechecked.
- The shared event is GOVERNANCE_CHARTER_APPROVED, caused by the actual superior
  decision and correlated to the request. It is not an ADOPTED event.
- A pending approved charter makes composition readiness false. It creates no
  members, RBAC roles, security/Finance capabilities or delegated authority. Body
  UPDATE/DELETE and member INSERT/UPDATE/DELETE protections are unchanged.

The existing `adoptedAt` header field records the approval action's time for an
APPROVED initial version; it must not be interpreted as an effective date. The
status and body lifecycle remain authoritative.

## Migration / historical behavior

0053 adds two nullable provenance columns and an additional invoker trigger. It
extends the charter status constraint and decision guard, without SECURITY DEFINER
or changes to body/member write policies. Current document jurisdiction/entity/
authority status and canonical voting rules are also checked at SQL transitions.
0048–0052 are unchanged.

There is **no historical backfill** guessing the original author's party. Existing
ADOPTED history remains readable and enforceable. A pre-0053 unfinished header
without the new provenance cannot acquire new approval: create a new immutable
version. This is an intentional fail-closed compatibility restriction, not a
claim of uninterrupted mixed-version writer compatibility. Deployment needs
coordinated compatible application/migration release and human-controlled approval.
The migration test replays the real 0000–0052 predecessor into an isolated database,
inserts historical header/terms, applies0053, proves byte-equivalent prior fields,
null new provenance, denied legacy progression, and a no-op rerun.

## Browser

On the dormant committee card, Charters & composition uses the superior workflow.
Create and submit the initial version; author its linked POLICY resolution on the
superior body using the shared proposal form. After the genuine governed decision,
a different superior presider records approval. The UI reloads backend state and
shows **approved, not effective**. Child appointment controls remain unavailable.
A stale form cannot approve after the superior's grant expires. An unchanged retry
retains request identity rather than treating a denial as evidence of no prior work.

## Remaining work

This closes the initial-charter authoring/review/approval gap only. Governed initial
composition, consent-backed initial appointments and atomic EFFECTIVE/ACTIVE
bootstrap remain absent. Approval does not secretly implement any of them. Full
mandate/powers/limitations/meeting/reporting/term-limit models, charter archive,
body suspension/dissolution/archive, vacancy recovery and subsequent membership /
meeting lifecycles also remain engineering work. Existing registered instruments
are documentary authority; their metadata is not complete legal certification.
