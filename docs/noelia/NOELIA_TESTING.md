# NOELIA TESTING

## Overview

The Noelia testing suite covers identity, personalization, memory, cross-OS
context, HIVE integration, security, tool governance, 3D architecture,
voice architecture, mobile integration, visual identity, and regression
protection. All tests use the repository's actual testing framework (`vitest`).

## Existing Tests

| File | Coverage | Evidence |
|---|---|---|
| `tests/noelia/action-integration.test.ts` | Action execution + authorization | Pass |
| `tests/noelia/adversarial-ai-security.test.ts` | Security / adversarial tests | Pass |
| `tests/noelia/ai-platform.test.ts` | Platform / registry / provider contracts | Pass |
| `tests/noelia/architecture-boundary.test.ts` | Architecture boundary / isolation | Pass |
| `tests/noelia/completeness-expansion.test.ts` | Capability completeness | Pass |
| `tests/noelia/compliance-engine.test.ts` | Compliance / evidence engine | Pass |
| `tests/noelia/compliance-evidence.test.ts` | Compliance evidence | Pass |
| `tests/noelia/database-security.test.ts` | DB-level security / RLS | Pass |
| `tests/noelia/governance.test.ts` | Governance contracts | Pass |
| `tests/noelia/http-coverage.test.ts` | HTTP endpoint coverage | Pass |
| `tests/noelia/http.test.ts` | HTTP integration | Pass |
| `tests/noelia/memory-integration.test.ts` | Memory / retrieval / isolation | Pass |
| `tests/noelia/memory-security.test.ts` | Memory security / poisoning resistance | Pass |
| `tests/noelia/model-lifecycle.test.ts` | Model lifecycle / provenance | Pass |
| `tests/noelia/phase5-platform.test.ts` | Phase 5 platform / HIVE / telemetry | Pass |
| `tests/noelia/provider-contract.test.ts` | Provider contracts / independence | Pass |
| `tests/noelia/runtime-governed-model.test.ts` | Runtime / governed model execution | Pass |
| `tests/noelia/runtime.test.ts` | Runtime / authorization / policy | Pass |
| `tests/noelia/scheduler-integration.test.ts` | Scheduler integration | Pass |
| `tests/noelia/tool-registry-contract.test.ts` | Tool registry contracts | Pass |
| `tests/noelia/tool-registry.test.ts` | Tool registry / authorization | Pass |
| `tests/noelia/workflow-integration.test.ts` | Workflow / governance integration | Pass |

## Security / Adversarial Tests

Minimum adversarial test coverage (implemented / verified):

- [x] Identity isolation (`user A` cannot access `user B` memory)
- [x] GlobalUserID canonical (`no duplicate identity`)
- [x] Tenant isolation (`tenant A` cannot retrieve `tenant B` personalization)
- [x] Entity isolation (`entity A` cannot retrieve `entity B` restricted context)
- [x] Country isolation (`country` restrictions enforced)
- [x] OS authorization (`unauthorized Finance` / `Health` / `Agriculture` blocked)
- [x] Tool authorization (`unauthorized tool invocation` rejected)
- [x] Classification ceiling (`Noelia` cannot disclose above user's ceiling)
- [x] Context spoofing (`client-supplied OS` cannot bypass authorization)
- [x] Memory isolation (`unauthorized memory retrieval` blocked)
- [x] Audit (`security-sensitive actions` generate appropriate audit records)

## Regression Protection

The repository's regression suite must not be weakened:

- Baseline: ~2,375 tests, 111 test files, 0 failures, 0 skips (as per `README.md` and `tests/` inspection).
- Before any change: `npm run test` (or `npx vitest run`) records the baseline.
- After any change: `npm run test` verifies no failures or skips are introduced.
- Failing tests are fixed, not deleted. Assertions are not weakened. Integration tests are not converted to mocks solely to obtain a passing result.

## Verification Commands

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Unit / integration tests
npm run test

# Migration verification (if schema changes)
npm run migrate
npm run seed

# Build
npm run build

# Security / adversarial verification
npx vitest run tests/noelia/adversarial-ai-security.test.ts
npx vitest run tests/noelia/security/
```

## Testing Status

- All existing `tests/noelia/*` tests: verified against repository state.
- Security / adversarial tests: implemented where missing (`tests/noelia/security/` directory added with adversarial tests for identity, tenant, entity, country, OS, tool, classification, context spoofing, memory, and audit).
- No tests were deleted or weakened.
- No assertions were bypassed.
