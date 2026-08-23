# Noelia governed runtime boundary — verification record

**Date:** 2026-08-23  
**Baseline:** `0bf378ec9f484acb6100d24f166492ebd4bdfd9f`  
**Runtime:** optimized Next.js 16.2.11 production build, live PostgreSQL 18.4  
**Status:** **GREEN**

## Authority boundary

The implemented chain is:

```text
BEYU OS identity and tenant context
  → HIVE/Noelia runtime
  → policy decision
  → registered capability/tool
  → BEYU service adapter
  → canonical context-aware database
  → transaction-local tenant context / PostgreSQL RLS
  → durable audit and decision evidence
```

Noelia receives no unrestricted database handle. Its facade composes governed services under the
canonical tenant transaction context. Registered tools must match declared capability, tenant,
entity, country and classification constraints. Missing, unknown, unregistered, unauthorized or
inconsistent targets fail closed.

Human governance remains distinct and attributable: `requestingHuman`, `executingAI` and
`approvingHuman` are separate identities, and approvals require `actorType = HUMAN`. A denied action
persists policy/decision/audit evidence without domain mutation. Approved execution keeps
authorization, action, domain mutation, completion and audit in the registered service transaction;
a failure rolls back domain mutation and records durable failure evidence separately.

## Isolation and memory controls

Regression coverage proves:

- cross-tenant retrieval denies;
- unauthorized entity and country targets deny;
- individually allowed target identifiers cannot be recombined into an unauthorized composite;
- classification above principal clearance is filtered;
- enterprise memory is visible only through enterprise authorization and never made globally
  readable;
- authorized enterprise and global corpus retrieval follows canonical scope policy;
- PostgreSQL shape constraints and RLS reject malformed or cross-tenant records independently of
  application code.

## Production validation control

The baseline optimized production runtime returned bare 500 responses for malformed Zod requests
on both Noelia and the canonical resolutions route. This was therefore a shared production-runtime
issue, not Noelia-specific or development-only. It is classified and documented exactly as a
**PRE-EXISTING BEYU INFRASTRUCTURE DEFECT** in
`PRE_EXISTING_VALIDATION_BOUNDARY_DEFECT.md`.

The narrow remediation awaits asynchronous guarded paths inside the existing application boundary
and converts only safe Zod issue fields to the canonical 422 envelope. It does not mutate Zod,
change transaction/tenant infrastructure, expose stack/DB details, or weaken validation. Final
optimized production controls passed for both routes.

A separate **PRE-EXISTING BEYU INFRASTRUCTURE DEFECT** in authority date comparison is documented in
`PRE_EXISTING_AUTHORITY_DATE_NORMALIZATION_DEFECT.md`. Drizzle `Date` values are now normalized to
ISO days without changing any status, provenance, dependency, activation or permission rule.

## Verification matrix

| Gate | Result | Evidence |
|---|---:|---|
| Noelia unit/boundary | PASS | 49/49 in the unit command; 46 Noelia + 3 shared boundary tests |
| Noelia integration | PASS | 8/8 live memory/action tests |
| Noelia security | PASS | 40/40 registry, memory, DB and architecture tests |
| Noelia production HTTP | PASS | 5/5 against optimized server + live PostgreSQL |
| Canonical validation HTTP controls | PASS | 2/2; Noelia and resolutions malformed bodies return sanitized 422 |
| Complete Noelia repository set | PASS | 64/64 across 8 files in the complete run |
| Phase 15 common platform | PASS | 125/125 across integrity, isolation, atomic audit, concurrency and security |
| Typecheck | PASS | `npm run typecheck` |
| Lint | PASS | `npm run lint` |
| Production build | PASS | `npm run build` after all production source changes |
| Migration schema check | PASS | `npx drizzle-kit check` |
| Fresh migration/seed | PASS | Scratch DB applied `0000`–`0014` and canonical seed successfully |
| Patch whitespace check | PASS | `git diff --check` |
| Complete available suite | PASS | 1,589/1,589 tests; 65/65 files |

## Outcome classification

- **PASS:** all required Noelia, Phase 15, production, isolation, approval, audit, migration and
  quality gates above.
- **FAIL:** none.
- **BLOCKED:** none.
- **PRE-EXISTING FAILURE:** two shared infrastructure defects were reproduced, classified,
  narrowly remediated and fully regression-tested; no pre-existing failure remains unresolved.

The final status is **GREEN** because production behavior, tenant/scope isolation, fail-closed
authorization, HUMAN approval attribution, durable denial evidence, atomic approved execution and
critical database security all have passing evidence with no unresolved critical defect.
