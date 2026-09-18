# BEYU OS — Release Approvals Contract (P4)

**Status:** normative. Defines the governed approval instrument for controlled
release transitions, and what an approval is NOT.

## The instrument

A release approval is an attributable, justified, optionally time-bounded
record in `release_approvals` (migration 0047) that a principal with
`platform:config.manage` authority recorded for a specific release, environment
and scope:

| Scope | Authorizes |
| --- | --- |
| `DEPLOY` | deployment of the release into the environment |
| `PROMOTE` | promotion/switch of production exposure to the release |
| `ROLLBACK` | governed rollback to a previous release |
| `CONTRACT` | contracting the expanded schema after full lifecycle |

Decisions are `APPROVED` (active), `REVOKED` (withdrawn before use), or
`REJECTED` (explicit denial, kept as evidence). A later `REVOKED` by the same
approver supersedes that approver's earlier `APPROVED`. Expired approvals never
satisfy a transition.

## The four-eyes gate

Transitions into `PROMOTED`, `SWITCHED` and `CONTRACTED` are denied with
`APPROVAL_REQUIRED` unless an active `APPROVED` record exists for the required
scope **whose approver is not the acting principal**. Self-approval is
structurally rejected. The gate is fail-closed: absent, expired, revoked,
wrong-scope or wrong-release evidence all deny.

## What an approval is NOT

An approval **never grants authorization**. Authorization remains exactly:

```
GlobalUserID → RBAC + ABAC → OS → tenant → entity → country
→ policy → application → PostgreSQL RLS
```

The acting principal still needs RBAC (`platform:config.manage` via
`guarded()`), ABAC and policy still apply, the release state machine still
enforces `DEPLOYED ≠ VERIFIED ≠ PROMOTED` (PVG evidence is a separate,
mandatory input), canary percentage still never influences authorization, and
RLS remains the final data-isolation boundary. An approval only satisfies the
state machine's evidence requirement; removing every other control is impossible
through approvals alone.

## Auditability

Every decision — including `REJECTED` and `REVOKED` — is written to the
canonical hash-chained `audit_log` with the mandatory justification. There is
no approval path that bypasses audit. The API records `DENIED` transitions to
the audit chain as well, so refusals are evidence too.

## Pipeline relationship

The db-release pipeline's PVG job records `DEPLOYED` and (on pass)
`PVG_VERIFIED` with `SYSTEM` actor provenance — those states need no approval.
`PROMOTED`/`SWITCHED`/`CONTRACTED` are operator actions through the governed
API and always require the four-eyes gate. Pipeline retries are idempotent
(deterministic transition ids), so recovery never double-writes history.
