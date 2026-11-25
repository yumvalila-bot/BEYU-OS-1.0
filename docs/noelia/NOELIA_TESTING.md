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
| `tests/noelia/agent-surface-guard.test.ts` | Freezes the 92-capability surface; no shell/SQL/exec path | Pass |
| `tests/noelia/cognitive-core.test.ts` | 8 brains, single identity, Queen Bee pipeline, world model, graph, decision memory | Pass |
| `tests/noelia/cognitive-sim-council-learning.test.ts` | Simulation integrity, Council dissent, learning regression, memory poisoning | Pass |
| `tests/noelia/cognitive-integration.test.ts` | Runtime integration, provider states, degraded mode | Pass |
| `tests/noelia/cognitive-registry.test.ts` | Brain reach ∩ authorization, workforce profiles, CAP_POSTING lock | Pass |
| `tests/noelia/cognitive-http.test.ts` | 9 end-to-end HTTP acceptance tests over the 5 cognitive routes | Pass |

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

- Baseline measured on this branch (2026-11-24): **5852 passed / 3 failed / 382 skipped of 6268**
  across the whole repository. The 3 failures are pre-existing and unrelated to NOELIA
  (FY2026 deadline date drift, uncommitted Health SPA build artifact, external Health OS
  liveness probe). See `NOELIA_ACCEPTANCE_MATRIX.md` §D.
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

## HTTP acceptance suite (new)

`tests/noelia/cognitive-http.test.ts` runs against a **real production server** and a real
database — not mocks:

```bash
BEYU_TEST_BASE_URL=http://127.0.0.1:3000 npx vitest run tests/noelia/cognitive-http.test.ts
```

It asserts 401-unauthenticated on all five cognitive routes, 422 on unknown fields (`.strict()`
schemas), 422 on a simulation with no declared variables, `SIMULATION` labelling on every
simulation metric, `humanReviewRequired` plus a "not a decision" narrative from the Council,
`FINANCIAL_VALUES` reported as missing by the world model, and that the rendered Command Centre
contains all eight brain titles with no placeholder content.

## Test isolation

Three pre-existing isolation defects were found and fixed during this workstream; all are
written up in `NOELIA_TEST_ISOLATION.md`:

1. `tests/helpers/appointments.ts` left governance fixtures behind because its cleanup missed
   the foreign keys held by newer governance tables. The orphan was then counted as a real
   governing body by suites asserting the canonical registry, and the fixture's own
   `beforeAll` died on a duplicate key on every subsequent run. Cleanup is now FK-ordered and
   the fixture is self-healing.
2. `tests/noelia/cognitive-integration.test.ts` searched an accumulating table with a fixed
   keyword and `limit: 10`, so it passed on a fresh database and failed once more than ten
   matching rows existed. It now uses a unique per-run marker.
3. `tests/foundation/domain.test.ts` called `runComplianceSweep`, which materialises the
   health of **every open deadline in scope** — not just the fixture rows the test inserted.
   It therefore rewrote the seeded FY2026 deadline to `OVERDUE` and left 13 collateral rows
   (9 notification logs, 4 escalations) against it on every run. The seed pins that deadline to
   `2026-09-29`, so the failure was scheduled, not random: it began on 2026-09-30. The test now
   restores the seeded row (and purges the collateral rows) in **both** `beforeAll` and
   `afterAll`.

The adopted rules:

- **A test that creates durable rows must run twice in a row on a dirty database.**
- **A test that mutates durable rows it did not create must restore them** — verify by running
  the file twice and comparing database state afterwards, not by reading the cleanup code.
- **Date-dependent assertions are latent failures with a scheduled start time.** An assertion
  against `today` over a fixed seeded date is not a flake; it is a guarantee.

## Environment requirements

- `BEYU_GOVERNANCE_DATABASE_URL` must be set, or ~25 governance tests fail with a connection
  error. This is a local-environment gap, not a product defect; CI sets it.
- `BEYU_ALLOW_LOCAL_PLAINTEXT_DB=1` is required only for loopback PostgreSQL without TLS. It is
  ignored when `BEYU_ENV=production`.
- `NODE_OPTIONS="--max-old-space-size=3072"` is required for `tsc` and `next build`; the
  repository's type graph exceeds the default heap. A bare `npm run build` reports a misleading
  "Failed to type check" when it has actually run out of memory.

## Testing Status

- All existing `tests/noelia/*` tests: verified against repository state (423 passing).
- Security / adversarial tests: implemented where missing, plus the cognitive threat surface
  described in `NOELIA_THREAT_MODEL.md`.
- No tests were deleted or weakened.
- No assertions were bypassed.
