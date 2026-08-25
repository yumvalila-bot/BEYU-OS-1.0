# NOELIA — Security Model & Adversarial Test Results

**Status:** IMPLEMENTED (2026-08-25) · Evidence: `tests/noelia/database-security.test.ts`,
`tests/noelia/architecture-boundary.test.ts`, `tests/noelia/memory-security.test.ts`,
`tests/noelia/tool-registry.test.ts`, `tests/noelia/action-integration.test.ts`,
`tests/security/control-restoration.test.ts`, HTTP smoke suite.

## Threat model & fail-closed controls

| Threat | Control | Test evidence |
|---|---|---|
| Tenant breakout | scope.tenantIds predicates on every query + RLS policies | database-security, workflow scope test |
| Entity breakout | entityPredicate + composite entity/tenant/country check in registry | tool-registry ENTITY_DENIED |
| Country breakout | countryMatchesTarget composite check | tool-registry COUNTRY_DENIED |
| Classification escalation | `can()` ABAC clearance + visibleClassifications pushdown | tool-registry CLASSIFICATION_DENIED |
| Permission escalation | RBAC `can()` per capability; separate permissions per domain | workflow validation STOPS |
| Role/authority/actor spoofing | server-derived principal; actorType HUMAN + approvingHumanId ≠ requester | tool-registry HUMAN_APPROVAL_INVALID |
| Prompt injection | no free-form tool selection; deterministic engine routing; retrieved content is DATA, never SYSTEM AUTHORITY | architecture-boundary |
| Tool injection / substitution / unregistered | declarations vs registrations must match contract; unknown/unregistered DENY | tool-registry TOOL_UNKNOWN/TOOL_UNREGISTERED |
| Approval self-approval | maker/checker enforced server-side (requestor ≠ approver) | workflow self-authorize 403 (HTTP) |
| Maker/checker bypass | approval ≠ execution; execute re-checks authorization incl. approval row | action-integration, workflow EXECUTION_DENIED |
| Stale knowledge exploitation | authorityStatus/effective/review/expiry window filtering | legal-service, tax query |
| Malicious metric labels / source content / memory | memory is DATA with provenance; content never changes policy; strict Zod contracts | memory-security |
| Cross-OS privilege escalation | each domain independently `can()`ed; tool invoked per domain | cross.os tool |
| Arbitrary SQL / dataset access | no SQL builder reaches Noelia; only registered BEYU service adapters | database-security |
| Audit/event tampering | atomic decision+audit+event; append-only ledgers; hash chain | audit suites (Phase 15) |
| Replay / duplicate execution | withIdempotency (IN_FLIGHT), run-once unique index, workflow step resume | scheduler + idempotency suites |
| Crash-recovery abuse | committed steps resume, uncommitted stay PENDING; watermark advances only past observed | workflow crash-resume |
| Secrets | none in source; env-only (.env gitignored); sanitized errors never leak | HTTP error body assertions |
| Unauthorized model/provider | model_registry gate; no external provider wired; deterministic HIVE analyst | model-gateway |
| Unavailable source | UNAVAILABLE/REQUIRES_AUTHORITY, never fabricated | health-boundary, legal, maturity profile |

## Adversarial scenarios executed

1. Unknown tool invocation → `TOOL_UNKNOWN` (never executed).
2. Declared-but-unregistered tool → `TOOL_UNREGISTERED`.
3. Missing canonical context → `CONTEXT_MISSING`.
4. Permission denied → `PERMISSION_DENIED`, handler not called.
5. Classification above ceiling → `CLASSIFICATION_DENIED`.
6. Wrong tenant / entity / entity+tenant mix / country / country+tenant mix → denied.
7. AI-labelled approval evidence → `HUMAN_APPROVAL_INVALID`.
8. Self-approval → denied.
9. High-risk tool without approval → `HUMAN_APPROVAL_REQUIRED`.
10. Malformed payloads → 422 `VALIDATION_FAILED`, no stack/DB internals leaked.
11. Unauthenticated HTTP → 401.
12. Forged fields (`unrestrictedDatabase: true`) → 422 strict Zod.
13. Cross-tenant workflow read → null/404.
14. Owner-inactive scheduled run → FAILED dead-letter, no fabricated briefing.
15. Unknown legal citation → `REQUIRES_AUTHORITY`.

All results PASS; no discovered weakness remains open.
