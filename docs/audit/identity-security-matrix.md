# Identity Security Matrix — Iteration 5

Audit date: 2026-08-25 · Branch `arena/01a035aa-beyu-os-1-0`

## Identity model (canonical, server-derived)

| Identity | Source of truth | Construction |
|---|---|---|
| GlobalUserID (`users.id`) | canonical users table | server-side only |
| Employee/master ID | hcm employees ↔ party link | identity-graph suite |
| Party | parties table | joined from users |
| Tenant identity | tenants table | session row → tenant join |
| Entity identity | legal entities | grants (entity-scoped role grants) |
| Country identity | tenant/entity countryCode | grants + tenant country map |
| Principal (per-request) | `resolvePrincipal()` | session token hash → sessions→users→parties→tenants join; roles/entityScope/emergency grants re-loaded per request |
| Session identity | sessions table | sha256(token), revokedAt/expiresAt checked per request |
| Service identity | SYSTEM principal | `sessionId: "SYSTEM/NOELIA_SCHEDULER"`, mfaSatisfied: false, grants re-derived at run time |
| AI identity | fixed `executingAi: NOELIA` | never client-supplied |

## Noelia identity constraints (verified)

- Noelia never constructs arbitrary identity: principals enter only via
  `resolvePrincipal()` (HTTP) or canonical re-derivation (scheduler owner).
- No route schema accepts userId/roles/clearance/permissions claims
  (strict Zod; identity fields → 422).
- Client target claims (tenantId/legalEntityId/countryCode) are validated
  against the server-derived scope, never honored blindly.
- Scheduler reconstructs the owner principal from canonical tables at run
  time; revoked grants fail closed per invocation.

## Adversarial tests (new: `tests/identity/identity-adversarial-http.test.ts`)

| Test | Result |
|---|---|
| forged session cookie → 401 | PASS |
| revoked session (logout) reuse → 401 | PASS |
| body identity claims (userId/roles/clearance) → 422, never honored | PASS |
| cross-tenant target (sector principal → group tenant) → TENANT_DENIED, zero findings | PASS |
| non-existent tenant id → never resolved, TENANT_DENIED | PASS |
| analyze honors only server-derived scope (phantom tenant → denied) | PASS |
| entity target outside granted scope → ENTITY_DENIED | PASS |
| country target outside authorized countries → COUNTRY_DENIED | PASS |
| scheduler identity invariant (tick under canonical owner reconstruction) | PASS |

## Preexisting coverage (still green)

- identity-graph suite: employee→party→GlobalUserID→tenant→entity resolution,
  missing identity NOT_FOUND, tenant mismatch non-enumerating, one
  GlobalUserID per party enforced by DB unique constraint.
- tool-registry suite: ENTITY_DENIED/COUNTRY_DENIED at capability level.
- scheduler-integration: revoked/inactive schedule owner fails closed.

## Residual

- None identified. Local DB role is a superuser (dev artifact); production
  role is RLS-enforced non-superuser (see Iteration 24).
