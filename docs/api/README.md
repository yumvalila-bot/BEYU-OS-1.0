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
| `INTERNAL_ERROR` | 500 | Structured, trace-correlated, non-leaking |

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
