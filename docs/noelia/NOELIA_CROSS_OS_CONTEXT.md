# NOELIA CROSS-OS CONTEXT

## Principle

The effective OS context must be derived and validated from authoritative
authorization/context data. The client must not be able to spoof an
unauthorized context by sending `os=finance` (or any arbitrary OS value).

## Context Resolver

Source: `src/lib/noelia/context-resolver.ts`

The resolver determines:

- `canonicalNoeliaIdentity`: always `NOELIA_AI` (same identity across all OS contexts)
- `activeOS`: derived from `principal.osAccess` (authorization scope) + `requestedTarget.osId`
- `authorizedContext`: validated against `principal.authorizedOSContexts`
- `visualManifestation`: mapped via `NOELIA_ASSET_MAPPING` (see `NOELIA_VISUAL_SYSTEM.md`)
- `personalityModifier`: context-aware terminology adjustments (no independent personality)
- `availableCapabilities`: `NoeliaEngine[]` subset authorized for the OS context
- `toolPermissions`: registered tool registry filtered by OS authorization
- `memoryScope`: `OS_CONTEXT` memory retrieval boundary

## Authorization Chain

Every cross-OS request must pass:

```
Authentication
  → Authorization (RBAC + ABAC)
    → OS authorization (is the requested OS in the principal's authorized OS scope?)
      → Context validation (does the authorization scope include the requested OS?)
        → Context resolution (resolve visual, capabilities, tools, memory scope)
          → Response
```

If `requestedOS` is not in `principal.authorizedOSContexts`, the resolver
returns a denial code (`OS_DENIED`) and no cross-OS context is established.
No spoofed context can bypass this chain.

## Context Mapping

| Active OS | Canonical Identity | Visual Manifestation | Personality Modifier | Capabilities Subset | Memory Scope |
|---|---|---|---|---|---|
| `BEYU_OS` | `NOELIA_AI` | `Noelia BEYU OS` | Enterprise / governance vocabulary | Governance, executive, compliance, analytics, cross-os | Enterprise + OS |
| `FINANCE_OS` | `NOELIA_AI` | `Noelia Finance OS` | Financial / accounting vocabulary | Financial, risk, compliance, governance, tax, analytics | Finance + OS |
| `HEALTH_OS` | `NOELIA_AI` | `Noelia Health OS` | Clinical / health vocabulary | Health, compliance, governance, analytics | Health + OS |
| `AGRICULTURE_OS` | `NOELIA_AI` | `Noelia Agriculture OS` | Agriculture / field vocabulary | Agriculture, finance (agricultural), governance, analytics | Agriculture + OS |

## Security Rules

1. **No arbitrary OS selection.** The resolver ignores any client-provided
   `os` parameter that is not validated by authorization scope.
2. **No independent identity.** `canonicalNoeliaIdentity` is always
   `NOELIA_AI`. There is no `NOELIA_FINANCE`, `NOELIA_HEALTH`, or
   `NOELIA_AGRICULTURE` identity.
3. **No independent memory.** Memory retrieval uses the OS scope filter,
   but memory records themselves reference the same `canonicalNoeliaIdentity`
   (`NOELIA_AI`) and the same user identity (`GlobalUserID`).
4. **No independent authorization.** The authorization chain is always
   the same. Only the authorized OS subset changes.

## Source of Truth

- Source file: `src/lib/noelia/context-resolver.ts`
- Design: `docs/noelia/NOELIA_CROSS_OS_CONTEXT.md` (this file)
- Security: `docs/noelia/NOELIA_SECURITY_MODEL.md`
