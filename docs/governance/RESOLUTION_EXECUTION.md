# Resolution implementation through the shared kernel

2026-09-20 · Migration `0049_governance_execution.sql`

This implements mandated-work **recording**, evidence review and accountable
closure in BEYU OS's existing shared governance capability. It is not a new OS,
a duplicate document registry, a payment executor or a legal sufficiency engine.

## Persistence and authority

- Canonical `tasks` gains an optional `sourceResolutionId`, immutable acceptance
  criteria/deadline/dependency, revision and completion/verification timestamps
  and human identities. Ordinary kernel tasks retain their existing semantics.
- `governance_action_evidence` contains append-only references to canonical
  Documents, including the registry's version/checksum at submission. It stores
  no duplicate document contents. Foreign keys prevent deleting linked records.
- A mandate must be APPROVED, attributed and quorate **and** match an existing
  `GOVERNANCE_RESOLUTION_DECIDED` event's outcome, decision time and presiding
  member. Seed status alone cannot authorize this path. Resolution history stays
  APPROVED; task closure does not rewrite the decision or unlock domain execution.
- All writes require an active, non-service human, MFA, active/effective
  constitution, live governing body/entity, appropriate dated role grants,
  classification/entity/tenant scope, no recorded recusal, and applicable policy.
  Dated grants are re-read inside the command, not trusted from a cached principal.
  Approval/human-review policy obligations without discharged workflow evidence
  block execution. No implicit exception or emergency/delegated-only execution
  power is added. Current grants remain read-only to the runtime DB role.
- Creating/assigning/returning/verifying/closing requires the existing
  `governance:resolution.approve` capability **and** an active CHAIR or SECRETARY
  seat on the source body. These rights authorize recording/reviewing work only.
- Progress, blockers, evidence and completion require the recorded assignee plus
  governance read access. Assignment requires a current, appropriately cleared,
  active human in the resolution tenant. Owner/completer cannot verify own work.
  Assignments and acceptance criteria are immutable in this first iteration;
  approved reassignment/cancellation/amendment workflows are not implemented.

## State machine

```
OPEN --ASSIGN--> ASSIGNED --START--> IN_PROGRESS --COMPLETE--> COMPLETED
COMPLETED --VERIFY (independent)--> VERIFIED --CLOSE--> CLOSED
IN_PROGRESS --BLOCK--> BLOCKED --RESUME--> IN_PROGRESS
COMPLETED --RETURN (presiding review)--> IN_PROGRESS
```

Precisely: RETURN takes COMPLETED back to IN_PROGRESS, clearing only the current
completion attestation. Prior completion/evidence remains in the immutable
ledger. CLOSED is terminal. No state may be skipped; unknown states fail closed.
Evidence submission is an IN_PROGRESS same-state revision, not completion.
A declared prerequisite must be another, already existing task of the same
resolution, creating a creation-ordered acyclic dependency. It must be VERIFIED
or CLOSED before dependent work starts/resumes/completes/verifies/closes.

Completion requires evidence; verification and closure recheck it. Documents
must be authoritative, effective, not superseded, in the same tenant, within the
mandate's entity/country/classification, and readable by the human. Every linked
document needs a snapshot matching its current registry version and SHA-256.
If it changes after completion but before verification, a presiding human returns work for rework and
the owner submits the current version before another completion. Old snapshots
are retained. A document change after VERIFIED blocks closure; this version has
no post-verification correction workflow and does not silently rewrite the
verification. Registry metadata is **not a cryptographic attestation of remote
storage bytes**, signature validity or the evidence's substantive/legal adequacy;
the independent human still needs to inspect the underlying artifact.

## APIs and UI

- `GET /api/v1/governance/resolutions/:id/actions`: scoped tasks and, where
  Document-read permission permits, evidence snapshots; overdue is derived.
- `POST /api/v1/governance/resolutions/:id/actions`: title, description/acceptance
  criteria, future `dueAt`, priority and optional same-resolution `dependsOnTaskId`.
  Source authority and tenant are derived server-side.
- `POST /api/v1/governance/actions/:id`: strict discriminated payload with
  `command`, `expectedVersion`, and a substantive `note`. ASSIGN additionally
  accepts `assigneeUserId`; SUBMIT_EVIDENCE accepts `documentId`. Commands are
  ASSIGN, START, BLOCK, RESUME, SUBMIT_EVIDENCE, COMPLETE, RETURN, VERIFY and CLOSE.
  No client-supplied outcome, actor, verifier, tenant, policy or authority field.
- Shared `guarded`, rate limiting, request-scoped RLS and `withIdempotency` wrap
  mutations. Source read authority is rechecked before returning stored responses.
  Same-key replay returns the original result; altered payloads fail.
  Revision mismatch is 409. Invalid transitions/evidence are 422, denied authority
  403, and inaccessible resources 404. UI retries preserve an uncertain request's
  idempotency key instead of inventing success or blindly creating another task.
- `/os/governance` has a resolution-level implementation panel with creation,
  assignment, blockers, evidence snapshots, review/rework and closure. It renders
  server state, suppresses self-verification, and refreshes after mutations.
  Manual canonical user/document IDs are currently required; searchable scoped
  directory/registry pickers remain a usability gap.
- Existing workflow/dashboard queues exclude CLOSED/DONE/CANCELLED, not work
  merely marked COMPLETED. Workflow links return to the source resolution.
  Generic tenant-only task queues remain withheld from entity-constrained users;
  their authorized governed tasks are available in the governance workspace.

## Database and transaction controls

FORCE RLS on tasks and evidence inherits visibility directly from the source
resolution, including tenant, body/entity and classification. A trusted,
transaction-local `beyu.governance_actions_read` permission flag additionally
prevents a generic dashboard capability from exposing mandated work. A hidden
parent never makes a governed row fall back to generic task visibility. Unknown
context denies access; `global_scope=on` is not a bypass. Evidence has no runtime
UPDATE/DELETE policy; governed tasks have a restrictive no-delete policy.

Database checks/triggers enforce attributed approved parents, immutable mandate
terms/source, legal state transitions, positive sequential revisions, evidence
before completion/review/closure, verifier independence, phase-appropriate
attestations, immutable completed/verified attestations, and dependency ordering.
They supplement application RBAC/policy/human identity checks; they do not make a
raw SQL connection an authorized business actor. Document-scope checks also run
on evidence INSERT, so cross-classification evidence substitution is rejected.

Commands reuse the canonical resolution advisory lock and body/member locks,
then lock the task before checking revision. Current document rows are share-
locked while their evidence snapshots are checked. Mutation, audit, event and
assignment/review/rework notification insertions share the same transaction.
Rollbacks do not leave a successful task mutation, audit/event or notification.

## Audit, events, notifications and Noelia

Every material transition uses `withAuditTransaction`. Timestamps are normalized
to ISO before hashing. Events contain mandate/task IDs, revision, status,
accountability, immutable task terms, actor, classification, actual policy
versions, request correlation and causation pointing to the source decision.
The shared interoperability registry declares:

`GOVERNANCE_ACTION_CREATED`, `ASSIGNED`, `STARTED`, `BLOCKED`, `RESUMED`,
`EVIDENCE_SUBMITTED`, `COMPLETED`, `RETURNED`, `VERIFIED`, `CLOSED`
(all names use the `GOVERNANCE_ACTION_` prefix).

Generic notifications are queued through the existing notification table for
assignment, completion-review and return. They contain no task title, document
contents or evidence checksum; the deep link reauthorizes access. This does not
implement external delivery, SLA escalation or calendar/deadline consumers.

The existing read-only `governance.resolution.query` Noelia tool now reports
observed action closure and overdue counts for its visible eight-resolution
sample, with explicit incompleteness/authority limitations. Entity and country
target predicates are applied in addition to principal RLS. No action mutation
tool is registered. Noelia cannot become assignee/approver/verifier through a
service account or unlock CAP_POSTING; absence of tasks never means completion.

## Tests and deployment

- `tests/governance/action-execution.test.ts`: actual runtime-role execution,
  provenance, independence, contracts, MFA/scope, live grants, policy obligations,
  concurrency, rollback, dependencies, evidence drift/rework and Noelia restrictions.
- `tests/security/governance-action-rls.test.ts`: direct NON-OWNER/NOBYPASSRLS SQL,
  missing context/permission, classification/entity/tenant isolation, immutable
  evidence, foreign-key retention, malformed transitions and source immutability.
- `tests/governance/action-http.test.ts`: authenticated runtime server, strict
  payloads, replay/substitution, stale revisions, owner checks and full closure.
- `tests/browser/governance-execution.spec.ts`: real browser creation through
  closure, missing-evidence denial, two human identities, reload and DB assertions.

Apply canonical migrations through `npm run migrate` using the admin migration
identity, never runtime `push` or a disabled RLS workaround. Coordinate application
and migration deployment. Before authoring source-bound tasks, deploy the new
trusted RLS context and handlers. Old code that does not set the new permission
flag cannot see mandated work; do not treat that as completed/absent work. Retain
new schema/policies on rollback and disable affected UI writes if needed; do not
null provenance, erase evidence or rewind migration checksums. Use the repository's
backup/approved production release gates. This session only replays disposable
local databases; it does not perform production promotion.

## Remaining mission scope

This is a functional resolution-to-work-to-evidence-to-independent-verification-
to-action-closure chain, **not** completion of the full A–AR mission. Missing
engineering includes approved reassignment/cancellation/mandate amendment,
formal implementation-plan sealing and aggregate resolution-implementation
closure, richer milestones/dependency graphs, broader independent review roles,
automatic escalation/delivery/calendar consumers, object-storage attestation,
and the separately documented meetings/notices/attendance/agendas/motions/minutes,
charter/appointment/composition, exceptions and oversight workflows. Human legal
ratification and production promotion remain distinct human boundaries.
