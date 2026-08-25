# RBAC / ABAC / Authorization Matrix — Iteration 6

Audit date: 2026-08-25 · Branch `arena/01a035aa-beyu-os-1-0`

## Catalogue

- 57 permission codes, 9 roles, 5 classification levels (ROLE_CLEARANCE).
- 7 high-risk permissions, all requiring MFA step-up (`requiresMfa` in `can()`).

## Findings & dispositions

### A-06-1 (FIXED) — GROUP_CEO was an implicit wildcard
`permissions: Object.keys(PERMISSIONS).filter(exclusions)` silently granted the
CEO every permission added in the future — privilege by default on new
capabilities. Converted to an explicit 54-permission enumeration with an
identical effective set (verified: same codes, same exclusions
`platform:config.manage`, `identity:emergency.activate`, `finance:ledger.post`).
New permissions now require an explicit grant decision.

### A-06-2 (CLASSIFIED REQUIRES_AUTHORITY) — emergency access elevation unexecutable
`emergency_access_grants` is fully implemented on the read side
(activation/expiry/revocation checks in `activeEmergencyPermissions`) but no
role holds `identity:emergency.activate` and no insert path exists — elevation
is UNAVAILABLE and fails closed. Who may activate emergency access and under
what conditions is a constitutional control decision → REQUIRES_AUTHORITY.
Activation procedure documented in the authority register. Tests lock the
unavailable state: zero holders, zero grant rows, zero elevation for
CEO/CGO/admin.

### Deliberately unheld / narrow controls (verified)
| Permission | Holders | Rationale |
|---|---|---|
| `identity:emergency.activate` | none | fail-closed; REQUIRES_AUTHORITY |
| `identity:role.grant` | PLATFORM_ADMIN (+CEO via former wildcard) | platform accountability |
| `finance:ledger.post` | GROUP_CFO | ledger authority is CFO-only |
| `governance:policy.manage` | CHIEF_GOVERNANCE_OFFICER (+CEO) | CGO accountable; CEO subject to board reserved matters |
| `finance:waterfall.commit` | GROUP_CFO (+CEO) | CFO accountable; CEO subject to board reserved matters |
| `organization:ownership.manage` | none beyond CEO | ownership changes governed by board/ownership layer |

## Static invariants (new suite `tests/authorization/rbac-audit.test.ts`, 8 tests)

- No wildcard permission codes (`*`) in the catalogue.
- No role derives permissions by filter over the catalogue.
- CEO exclusion list stable; enumeration unique.
- High-risk capabilities held by the fewest accountable roles (reachable).
- Emergency elevation: zero holders / zero rows / zero elevation (locked).
- Ownership management: no routine-role holder (locked).
- Every role clearance is catalogue-known and ≥ INTERNAL.
- Runtime self-grant impossible except via `identity:role.grant`.

## Preexisting coverage (still green)

- `engines.test.ts`: classification ceiling, MFA step-up, entity scope.
- `authorization-http.test.ts`: permission denials over HTTP.
- Tool registry suite: ABAC classification ceiling per tool (Iteration 3).
