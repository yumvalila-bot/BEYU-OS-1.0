# NOELIA PERSONALIZATION

## Principle

Personalization must be **permission-aware**. Never personalize using
information the user is not authorized to access. Never expose one tenant's
personalization to another tenant, one entity's to another entity, one
country's restricted context to another country, or one user's private
memory to another user.

## Personalization Dimensions

Personalization considers, where authorized:

| Dimension | Source | Isolation Boundary |
|---|---|---|
| `GlobalUserID` | Authentication / identity | Canonical identity |
| `role` | RBAC grants | Role-based access control |
| `permissions` | ABAC / authorization | Authorization scope |
| `tenant` | Tenant scope (`beyu_tenant_ids`) | Tenant isolation |
| `entity` | Legal entity scope | Entity isolation |
| `country` | Country code (`country_code`) | Country isolation |
| `os` | OS context (`BEYU_OS`, `FINANCE_OS`, etc.) | OS authorization |
| `department` | Organizational context | Organizational scope |
| `workflow` | Workflow preference / history | User/tenant scope |
| `language` | User preference / locale | User scope |
| `timezone` | User preference | User scope |
| `preferences` | User preference store | User/tenant scope |
| `interaction history` | Session / audit events | User/tenant scope |
| `approved memory` | `enterprise_memory` (governed) | Memory governance rules |
| `accessibility preferences` | User preference store | User scope |
| `communication preferences` | User preference store | User scope |
| `professional context` | Professional profile / role | Entity/tenant scope |

## Governance Rules

1. **No personalization without authorization.** Every personalization lookup
   must pass the authorization chain.
2. **Memory isolation.** Personalization using `approved_memory` must obey:
   `GlobalUserID + Tenant + Entity + Country + OS + Classification +
   Authorization`.
3. **Never invent preferences.** If a preference is missing, return the
   system default. Never fabricate a preference.
4. **Disabled personalization.** When a user disables personalization,
   all personalization dimensions must be disabled for that session and
   memory writes must be suspended (with audit event
   `NOELIA_PERSONALIZATION_DISABLED`).
5. **Stale session protection.** Concurrent or stale sessions must be
   validated against the current authorization state; revoked authorization
   must take precedence over cached personalization.

## Source of Truth

- Source file: `src/lib/noelia/personalization.ts` (to be implemented where missing)
- Memory: `docs/audit/NOELIA_MEMORY_ARCHITECTURE.md`
- Security: `docs/noelia/NOELIA_SECURITY_MODEL.md`
