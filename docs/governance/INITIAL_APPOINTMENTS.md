# Initial committee appointment preparation (0055)

This continues existing shared governance; it is not a separate OS or membership
registry. 0052 establishes a dormant committee; 0053 approves its non-effective
charter; 0054 freezes original human nomination/approval identities. 0055 permits
the recorded superior to prepare appointments against that approved charter.

## Authority and limits

The server derives and records the authority body and exact initial charter. The
caller cannot supply either. A current active BOARD/TRUSTEES superior, matching
establishment tenant/entity/country, adopted superior charter and satisfied
composition are required. Nomination and approval still require independently
provisioned scoped RBAC, presiding membership, MFA, constitution, policy and
current documentary evidence. Approval uses an exact APPOINTMENT decision on the
superior, linked to the child nomination. Original-person independence and nominee
recusal apply on that superior, not on an empty child body.

Only the authenticated nominee may consent. Consent rechecks the recorded charter,
current evidence and constitution; a newer approved charter requires a new
nomination. Withdrawal remains possible under the existing scoped nominee and
instrument checks. Notifications and accepted appointments grant no authority.

**Individual initial activation is forbidden in the service and SQL.** The child
remains DRAFT, the charter APPROVED/not effective, and canonical membership empty.
0056 now supplies the separately authorized atomic whole-composition/body
activation workflow; see [BODY_ACTIVATION.md](BODY_ACTIVATION.md). Ordinary
active-body appointments retain their existing activation/composition controls.
Membership remains distinct from RBAC/security/Finance/delegated authority.

## Migration and history

0055 adds nullable foreign keys for authority and initial charter. Existing rows
remain byte-equivalent apart from the new NULL fields. For those pre-0055 rows,
NULL authority means only their original own-body authority: the historical 0051
constraint required a decision on that same body. No superior is guessed and no
historical party snapshot is backfilled. New rows must explicitly record their
server-derived authority. Scope linkage is immutable.

The 0051 guard is redefined with only its decision-body lookup extended to the
recorded authority, falling back to the original body for legacy rows. An added
invoker guard constrains the initial path. No SECURITY DEFINER, policy drop,
body/member write permission, finalized-decision relaxation or historical SQL
rewrite is introduced. Coordinated compatible application/migration deployment
is required: old writers do not provide the newly mandatory evidence.

## UI and evidence

The existing appointment panel exposes preparation only after initial charter
approval. It identifies the superior and pinned charter, obtains consent, reloads
backend state and hides individual activation. Forged activation requests still
fail on the backend. Reuse the shared proposal form on the superior to create the
linked APPOINTMENT decision; do not create a vote on the dormant child.

Tests cover service, actual non-owner SQL, real HTTP, browser, original active-body
regressions, and a real 0000–0054 → 0055 upgrade/no-op replay preserving ordinary
historical progression. Focused proofs do not replace full regression/browser CI.
