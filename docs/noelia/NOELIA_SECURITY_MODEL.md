# NOELIA SECURITY MODEL

## Authorization Chain

Every Noelia request passes through the canonical authorization chain:

```
Authentication
  → Authorization (RBAC + ABAC)
    → Tenant isolation (`beyu_tenant_ids()`)
      → Entity isolation (`legal_entity_id` scope)
        → Country isolation (`country_code` scope)
          → OS authorization (`authorizedOSContexts`)
            → Classification ceiling (`clearance` vs. `requestedClassification`)
              → Tool authorization (`registeredNoeliaTool.permission`)
                → Data authorization (`data` scope + classification)
                  → Personalization authorization (`personalization` scope)
                    → Response
```

Every stage fails closed. A denial at any stage produces a response with
`deniedScopes` populated and no tool execution performed.

## Identity Isolation

- `GlobalUserID` remains authoritative.
- `NOELIA_AI` identity (`noelia_ai_identity` table) has no role grants of its own.
- Effective authority is the intersection of the requesting human's grants and
the governed AI policy (`CONST-AI-001`).
- A user cannot access another user's private Noelia memory.
- A user cannot create a duplicate Noelia identity.

## Tenant Isolation

- Tenant A cannot retrieve tenant B personalization.
- All tenant-scoped Noelia tables (`noelia_incidents`, `noelia_routing_decisions`,
  `enterprise_memory`) enforce `FORCE ROW LEVEL SECURITY` through
  `beyu_tenant_ids()` / `beyu_global_scope()`.
- The `withTenantDatabaseContext()` wrapper ensures transaction-scoped tenant isolation.

## Entity Isolation

- Entity A (`legal_entity_id`) cannot retrieve entity B restricted context.
- Memory retrieval filters by `legal_entity` scope.
- Tool authorization filters by `entityRestrictions` (`SCOPED` / `NONE`).

## Country Isolation

- Country restrictions (`country_code`) are enforced on memory retrieval,
  routing decisions, and authorization scope.
- A country outside the authorization scope is denied (`COUNTRY_DENIED`).

## OS Authorization

- The `resolveHiveExecutionContext()` function validates `osId` against the
  authorization scope (`principal.authorizedOSContexts`).
- A client-provided `os=finance` without `FINANCE_OS` in the authorization scope
  is blocked (`OS_DENIED`).
- The cross-OS context resolver (`context-resolver.ts`) validates OS before
  resolving visual manifestation or capabilities.

## Classification Boundaries

- `principal.clearance` is the maximum classification the user may access.
- `requestedClassification` is the classification of the requested data or tool.
- If `classificationRank(requestedClassification) > classificationRank(clearance)`,
  the request is denied (`CLASSIFICATION_DENIED`).
- Memory retrieval enforces the classification ceiling at both SQL pushdown
  and pure-gate levels.

## Context Spoofing Prevention

The resolver (`context-resolver.ts`) prevents spoofing:

1. Any `os` parameter from the client is compared against `principal.authorizedOSContexts`.
2. If the requested OS is not authorized, the resolver returns `OS_DENIED` and does not resolve any visual manifest, capability subset, or tool permissions.
3. The authorization scope (`resolveNoeliaAuthorizedScope`) is resolved server-side from the `principal` object, not from client parameters.
4. The visual resolution (`visualManifestation`) is derived only after authorization validation.

## Consequential Action Governance

Every consequential action requires:

- Registered tool authorization (`tool-registry.ts`)
- Confirmation requirement (`approvalRequirements`)
- Human review for HIGH/CRITICAL risk (`humanOversight` level)
- Audit event (`auditRequirements`)
- Policy validation (`BeyuNoeliaPolicyService`)

Consequential actions include: payments, transfers, financial postings,
account changes, clinical decisions, medication-related actions, data deletion,
organizational changes, permission changes, legal/compliance submissions,
external communications, and irreversible operations.

Noelia may recommend an action without executing it when execution authority is absent.
Never represent a recommendation as an executed action.

## Adversarial Test Requirements

Minimum adversarial tests (implemented in `tests/noelia/security/`):

- [x] Identity: user A cannot access user B's private Noelia memory
- [x] Identity: `GlobalUserID` remains canonical
- [x] Identity: no duplicate identity is created
- [x] Tenant: tenant A cannot retrieve tenant B personalization
- [x] Entity: entity A cannot retrieve entity B restricted context
- [x] Country: country restrictions are enforced
- [x] OS: unauthorized Finance access is blocked
- [x] OS: unauthorized Health access is blocked
- [x] OS: unauthorized Agriculture access is blocked
- [x] Tool: unauthorized tool invocation is rejected
- [x] Classification: Noelia cannot disclose information above the user's classification ceiling
- [x] Stale permissions: revoked authorization is respected
- [x] Context spoofing: client-supplied OS context cannot bypass authorization
- [x] Memory: unauthorized memory retrieval is blocked
- [x] Audit: security-sensitive actions generate appropriate audit records

## Source of Truth

- Policy: `CONST-AI-001` (documented in `docs/ai/` and `docs/governance/`)
- Implementation: `src/lib/authz.ts`, `src/lib/os-authorization.ts`, `src/lib/noelia/scope-service.ts`, `src/lib/noelia/hive-runtime.ts`
- Design: `docs/noelia/NOELIA_SECURITY_MODEL.md` (this file)
