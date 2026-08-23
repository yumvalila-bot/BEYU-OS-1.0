# BEYU OS — API contracts (v1)

All APIs are versioned under `/api/v1`, authenticated by session cookie, authorised by capability,
rate limited, validated with JSON Schema (Zod), audited, and return a uniform envelope.

## Envelope

Success:
```json
{ "data": { }, "meta": { "traceId": "EVT_…", "system": "BEYU-OS/1.0.0", "at": "…" } }
```
Error (never leaks secrets, personal data, stack traces or DB internals):
```json
{ "error": { "code": "FORBIDDEN", "message": "…", "traceId": "EVT_…", "details": [] } }
```

| Code | HTTP | Meaning |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | No valid session |
| `INVALID_CREDENTIALS` | 401 | Uniform authentication failure (existence not disclosed) |
| `ACCOUNT_LOCKED` | 423 | Lockout after 5 failed attempts (15 minutes) |
| `FORBIDDEN` | 403 | RBAC/ABAC/tenancy denial (audited) |
| `POLICY_DENIED` | 403 | Policy engine DENY |
| `MFA_REQUIRED` | 428 | Step-up authentication required for a high-risk capability |
| `VALIDATION_FAILED` | 422 | Schema violation |
| `RATE_LIMITED` | 429 | Capability rate limit exceeded |
| `NOT_FOUND` | 404 | Object not found in the authorised scope |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Key already used with a different payload |
| `REQUEST_IN_PROGRESS` | 409 | An identical request is currently executing |
| `INTERNAL_ERROR` | 500 | Structured, trace-correlated, non-leaking |

## Idempotency

Mutating endpoints accept an `Idempotency-Key` header backed by the durable
`idempotency_records` ledger (`src/lib/idempotency.ts`).

| Situation | Behaviour |
| --- | --- |
| Same key, same payload | Original response replayed with `Idempotent-Replay: true`; the mutation does **not** run again |
| Same key, different payload | `409 IDEMPOTENCY_KEY_REUSED` — never a silently stale result |
| Same key, concurrent request | One caller proceeds; the other receives `409 REQUEST_IN_PROGRESS` |
| Same key, different principal | **Isolated.** Keys are scoped to `(tenant, acting user, endpoint)`, so a key is meaningless outside the principal that created it |
| Mutation failed | Claim released; the key may be retried |

Keys are retained for 24 hours. A key is never a bearer token: possessing another
principal's key discloses nothing.

## Endpoints

### `GET /api/health`
Unauthenticated liveness/readiness probe. Returns `{ ok, system, checks.database, latencyMs }`.
Deliberately information-free.

### `POST /api/v1/auth/login`
Body: `{ email, password, mfaCode? }` · rate limit 10/min/IP · lockout after 5 failures.
Sets an HttpOnly, SameSite=Lax, Secure (in production) session cookie. Emits `USER_AUTHENTICATED`.

### `POST /api/v1/auth/logout`
Revokes the session server-side and clears the cookie.

### `POST /api/v1/ai/noelia`
Capability `ai:noelia.query` · rate limit 30/min. Body `{ question }`.
Returns the governed answer: `outputClass` (FACT | INFERENCE | RECOMMENDATION | PREDICTION |
UNCERTAINTY | REQUIRES_HUMAN_REVIEW), findings, narrative, sources, confidence,
`humanReviewRequired`, `deniedScopes`, `policyDecision`, `toolsUsed`, `latencyMs`, `decisionId`.
Persists an `ai_decisions` record and emits `AI_DECISION_RECORDED`.

### `POST /api/v1/finance/waterfall/simulate`
Capability `finance:waterfall.simulate` · supports `Idempotency-Key`.
Body `{ configId, grossAmount, scenario, overrides? }`. Returns deterministic lines, formulas,
explanation, warnings, checksum and the governance obligations required to *commit*. Simulation
never moves cash. Emits `WATERFALL_SIMULATED`.

### `POST /api/v1/finance/tax/assess`
Capability `finance:tax.assess`. Body `{ strategyId, legalEntityId, baseAmount, facts }`.
Jurisdiction-gated; unlawful positions are hard-blocked; every outcome carries legal basis,
documentation, risk, governance requirement and a non-reliance disclaimer.
Emits `TAX_STRATEGY_ASSESSED`.

### `POST /api/v1/governance/resolutions`
Capability `governance:resolution.propose` · rate limit 20/min · supports `Idempotency-Key`.

**The canonical BEYU OS governed mutation.** Body:
`{ bodyId, title, category, summary, rationale, dataBasis, consequences, classification,
authorityPolicyId?, linkedObjectType?, linkedObjectId? }`

Returns `201` with the persisted resolution: `{ id, reference, status, tenantId, bodyId, bodyName,
title, category, classification, requiredMajority, proposedBy, quorumMet, createdAt, obligations,
appliedPolicies }`. Emits `GOVERNANCE_RESOLUTION_PROPOSED`.

Server-derived and **rejected if supplied by the client** (`422 SERVER_CONTROLLED_FIELD`):
`tenantId` (from the governance body), `proposedBy` (from the session's role grants), `reference`
(allocated under an advisory lock), `status`, `requiredMajority` (from the body's majority rule),
all vote counters and `decisionDate`.

Lifecycle integrity: a proposal is always created in the initial `DRAFT` state with zero votes and
no decision date. Requesting a decided status returns `422 STATUS_NOT_PROPOSABLE`. Voting and
approval are separate governed mutations and are **not yet implemented**.

Additional error codes: `CLASSIFICATION_DENIED` (403), `RULE_VIOLATION` (422), `CONFLICT` (409).

The domain write, the hash-chained audit record and the domain event are committed in a **single
database transaction** — if any one fails, all three roll back.

### `POST /api/v1/governance/resolutions/:id/table`
Capability `governance:resolution.approve` · rate limit 20/min · `Idempotency-Key`.

Transitions `DRAFT → TABLED` and opens the voting window. Body: `{ votingClosesAt? }`
(defaults to 14 days). Emits `GOVERNANCE_RESOLUTION_TABLED`.

Tabling is a **separate governed action** from proposing: creating a proposal does not table it,
and being the proposer confers no tabling authority. Only the presiding officer of the owning body
(seat role `CHAIR` or `SECRETARY` in `governance_members`) may table.

### `POST /api/v1/governance/resolutions/:id/votes`
Capability `governance:resolution.vote` · rate limit 30/min · `Idempotency-Key`.

The second canonical governed mutation. Body: `{ vote: "FOR" | "AGAINST" | "ABSTAIN", comment? }`.
Returns `201` for a first vote, `200` for a change. Emits `GOVERNANCE_RESOLUTION_VOTE_CAST` or
`GOVERNANCE_RESOLUTION_VOTE_CHANGED`, plus `GOVERNANCE_RESOLUTION_VOTING_CONCLUDED` once voting ends.

**Voting concludes; it never decides.** When the window closes or every eligible member has voted,
the resolution becomes `VOTED` — the ballots are final but no decision has been taken. Only the
decision authority may move it to a terminal state.

**Two authorisation layers must both pass:** the capability (RBAC/ABAC/classification/policy) **and**
an active voting seat on the body that owns the resolution. Holding the permission is never enough.

`RECUSED` cannot be cast through this endpoint — recusal is a distinct governance act, not a vote a
member may self-assign.

| Rule | Behaviour |
| --- | --- |
| Voting window | Half-open `votingOpensAt <= now < votingClosesAt`; server clock is authoritative |
| Quorum | Eligible members **minus recusals**; never derived from votes cast. A non-voting member stays in the denominator |
| Abstention | Counts as participation, never as FOR or AGAINST |
| Recusal | Excluded from the denominator; cannot vote; keeps the seat and global role. Resolution-specific |
| Vote change | Permitted while the window is open; one effective ballot, previous vote preserved in the ledger |
| After close | No vote and no change is accepted |
| Tie | `DEADLOCKED`. No automatic tie-break, no chair casting vote |
| Conclusion timing | Only when the window closes or every eligible member has voted — one arriving vote never concludes voting |
| Terminal state of voting | `VOTED`. A voter can never produce `APPROVED`, `REJECTED` or `DEADLOCKED` |
| No quorum at close | `DEFERRED`, recorded by the decision authority at closure |

### `POST /api/v1/finance/capital/:id/governance-authorization`
Capability `finance:capital.manage` · rate limit 20/min · `Idempotency-Key`.

Records that a capital request has satisfied its **governance prerequisite**, transitioning it
`SUBMITTED | UNDER_REVIEW → GOVERNANCE_AUTHORIZED`. Body: `{ note? }` — nothing else. Emits
`CAPITAL_REQUEST_GOVERNANCE_AUTHORIZED`.

> **GOVERNANCE AUTHORIZED ≠ CAPITAL APPROVED ≠ EXECUTED ≠ FUNDED.**
> This transition moves no money, posts no journal entry, writes no ledger record, issues no
> treasury instruction and calls no external system. It records exactly one fact: *this capital
> request has satisfied its governance prerequisite*. Execution is a separate authority.

**Governance state is never client-supplied.** The decision is resolved server-side through the
canonical `getGovernanceDecisionAuthorization()` service — this endpoint does not re-derive
governance rules. Supplying `authorized`, `status`, `decision`, `resolutionStatus`, `provenance`,
`executed` or any other governance field is rejected with `422 SERVER_CONTROLLED_FIELD`.

Required conditions, all server-verified:

| # | Condition | Failure |
| --- | --- | --- |
| 1 | Capital request within tenant scope | `404 NOT_FOUND` (non-enumerating) |
| 2 | `finance:capital.manage` + entity scope (ABAC) | `403 FORBIDDEN` |
| 3 | Policy hierarchy permits | `403 POLICY_DENIED` |
| 4 | Status is `SUBMITTED` or `UNDER_REVIEW` | `422 INVALID_CAPITAL_STATE` |
| 5 | Not already authorized | `409 ALREADY_DECIDED` |
| 6 | A resolution is linked | `422 GOVERNANCE_NOT_SATISFIED` |
| 7 | Resolution is `APPROVED` | `422 GOVERNANCE_NOT_SATISFIED` |
| 8 | Resolution provenance is `GOVERNED` | `422 GOVERNANCE_NOT_SATISFIED` |
| 9 | Governing body has entity authority | `422 GOVERNANCE_NOT_SATISFIED` |

**Provenance requirement.** Only a `GOVERNED` decision — one with audit-ledger provenance — may
authorise a real domain transition. Seeded `REFERENCE_DATA` is refused, so unaudited fixture data
can never move the enterprise.

**Entity reach.** Governance bodies sit at holding/trust entities while capital is raised at
operating subsidiaries (the Investment Committee governs `LEN_BEYU_HOLDINGS` yet authorises capital
for `LEN_BEYU_HEALTH_LTD`). The rule is therefore **ancestry, not equality**: a body governs its own
entity and everything beneath it in the ownership chain. A body with no entity is enterprise-wide.

The status transition, audit record and durable event commit in **one transaction** — if the event
cannot be persisted, the transition rolls back and the governing resolution is untouched.

### `GET /api/v1/governance/authorization`
Capability `governance:resolution.read` · rate limit 60/min · **READ-ONLY**.

Query: `?objectType=CAPITAL_REQUEST|RESOLUTION&objectId=...`

The first downstream consumer of `GOVERNANCE_RESOLUTION_DECIDED`. Answers whether a governed
object is authorised by an **APPROVED** BEYU OS resolution, and on whose authority.

```
{ authorized, objectType, objectId, reason, resolutionId, reference, decision,
  governanceBodyId, governanceBodyCode, decidedAt, decidedBy, tenantId, entityId,
  classification, provenance }
```

**It is a prerequisite, never a bypass.** It grants nothing and mutates nothing — no capital
moves, no journal is posted, no workflow is triggered. A future execution path must satisfy its
own authentication, tenant scope, RBAC, ABAC, classification and policy checks **in addition to**
this signal, never instead of them.

| Resolution status | `authorized` |
| --- | --- |
| `APPROVED` | `true` |
| `REJECTED`, `DEADLOCKED`, `DEFERRED`, `VOTED`, `TABLED`, `DRAFT`, `WITHDRAWN` | `false` |
| no linked resolution | `false`, `provenance: NONE` |

`provenance` is `GOVERNED` when the decision has audit-ledger entries (produced by a real governed
transaction), `REFERENCE_DATA` for seeded historical records, and `NONE` when nothing governs the
object. **No expiry or revocation semantics are claimed** — the constitution defines none, so the
stored decision is reported as it stands.

Security: tenant isolation is non-enumerating (an out-of-scope object and a non-existent one are
indistinguishable); an entity-scoped principal cannot inspect an out-of-scope entity; a resolution
classified above the caller's clearance yields `403 CLASSIFICATION_DENIED`, and in the batch read
model is omitted entirely rather than reported.

### `POST /api/v1/governance/resolutions/:id/decision`
Capability `governance:resolution.approve` · rate limit 20/min · `Idempotency-Key`.

The **third canonical governed mutation**: closes a resolution and records the constitutional
decision. Body: `{ decisionNote? }` — nothing else. Emits `GOVERNANCE_RESOLUTION_DECIDED`.

**The caller never chooses the outcome.** The server recomputes it inside the transaction from the
authoritative ballots using the same pure rules engine as voting, so no request body, governance
role or API access can manufacture an `APPROVED` resolution. Supplying `outcome`, `status`,
`decision`, `finalOutcome`, `tally`, `quorumResult`, `voteCount` or `approvalResult` is rejected
with `422 SERVER_CONTROLLED_FIELD`. `decisionNote` is audit metadata and never affects the result.

**Decision authority is independent of voting authority.** A member who may vote may not close:
closure requires a presiding seat (`CHAIR` or `SECRETARY`) on the owning body **and** the
`governance:resolution.approve` capability. There is no global administrative override.

| Condition | Result |
| --- | --- |
| Voting still open and members outstanding | `422 NOT_READY_FOR_DECISION` |
| Quorum met, FOR > AGAINST | `APPROVED` |
| Quorum met, AGAINST > FOR | `REJECTED` |
| Quorum met, FOR == AGAINST | `DEADLOCKED` — no chair casting vote |
| Quorum not met | `DEFERRED` — never approved or rejected |
| Already in a terminal state | `409 ALREADY_DECIDED` |
| Not yet tabled | `422 NOT_READY_FOR_DECISION` |

Terminal states (`APPROVED`, `REJECTED`, `DEADLOCKED`, `DEFERRED`, `WITHDRAWN`) are **immutable**:
further votes, tabling and decisions are all refused. Reversal, if ever permitted, must be its own
governed amendment transaction.

The status transition, decision provenance (`decided_by_member_id`, `decision_date`, final tally),
the audit record and the `GOVERNANCE_RESOLUTION_DECIDED` event are committed in a **single
transaction** — if the event cannot be persisted, the decision itself rolls back.

Majority is the body's configured `majority_rule`, applied to the substantive (FOR + AGAINST) vote:
`SIMPLE` = `floor(n/2)+1`, `TWO_THIRDS` = `ceil(2n/3)`, `UNANIMOUS` = all.

Server-controlled and rejected with `422` if supplied: `memberId`, `tenantId`, `status`, `outcome`,
`votesFor/Against/Abstain`, `quorumMet`, `decisionDate`, `castAt`, any actor identifier.

### `GET /api/v1/system/self-test`
Capability `audit:log.read`. Executes nine deterministic control tests (audit chain, policy
hierarchy, tenant isolation, classification ceiling, waterfall determinism, tax blocking,
jurisdiction gating, AI boundary, referential integrity).

## Capability catalogue

The authoritative permission catalogue is `src/lib/constants.ts` (`PERMISSIONS`), mirrored into the
`permissions` table at bootstrap. A capability that is not listed there does not exist
constitutionally.

## Versioning & compatibility

Path-versioned (`/api/v1`). Additive changes only within a major version; breaking changes require
a new version plus an ADR. Event envelopes carry `specVersion` and `schemaVersion`.
