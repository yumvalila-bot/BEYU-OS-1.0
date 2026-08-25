# API Contract & Integration Completeness (Iteration 14)

**Status: 🟢 GREEN — every route/handler/tool audited; 3 real gaps found, fixed and regression-locked.**

Scope (per program): audit every API route and handler for input schema
strictness, server-derived identity, authorization, tenant/entity/country
context, jurisdiction, classification, rate limits, audit requirements,
idempotency, event emission, sanitized errors, correct HTTP semantics,
handler/service/tool registration, dead dispatcher references, and
declared-but-unregistered capabilities.

## Method

1. **Structural contract audit** — new permanent suite
   `tests/api/contract-integrity.test.ts` (91 checks, source + runtime level,
   server-free, runs in the normal suite):
   - every `src/app/api/v1/**/route.ts` is wrapped in `guarded()` with a
     catalog-registered `permission` (the 2 unauthenticated entry points,
     `auth/login` and `auth/logout`, are explicitly enumerated and checked for
     their own controls instead);
   - every POST route declares `rateLimit:` + `audit:`;
   - every client-payload route validates through a **`.strict()`** Zod schema —
     including schemas imported from contract modules (the check resolves the
     import and inspects the definition site);
   - the five governed-write routes use `withIdempotency`;
   - no `new Response(` escapes the `apiOk`/`apiError` envelope helpers;
   - the route inventory count is asserted (a silently deleted route fails the
     suite);
   - every role grant in `src/lib/constants.ts` references a real `PERMISSIONS`
     catalogue key (a typo silently grants nothing — now a test failure);
   - every Noelia tool is registered, permission-registered, handler-bound
     (no handler-less declaration), and bound to a read-service method that
     exists (no dead dispatcher); a drifted re-registration is rejected.

2. **Live semantic cross-check** — the 49-check production-build sweep
   (`scripts/route-inventory.mts`, Iteration 13) re-run after the fixes below.

## Findings & fixes (all 3 real gaps fixed, all regression-locked)

| ID | Gap | Risk | Fix | Regression lock |
|----|-----|------|-----|-----------------|
| F-14-1 | `POST /api/v1/auth/login` schema was not `.strict()` — a forged field (e.g. `role: "GROUP_CEO"`) in a login body was **silently dropped** instead of failing loudly. | Privilege-escalation probe payloads disappear without a trace; inconsistent with every other mutation contract. | `LoginSchema` → `.strict()`. | contract-integrity (strict-schema check) + live sweep check 31 (forged `role` → 422 VALIDATION_FAILED). |
| F-14-2 | `POST /api/v1/finance/tax/assess` schema was not `.strict()`. | Same class: unknown fields silently ignored on a jurisdiction-gated financial endpoint. | `AssessSchema` → `.strict()`. | contract-integrity + live sweep check 32 (forged `jurisdiction` → 422). |
| F-14-3 | `POST /api/v1/finance/waterfall/simulate` schema was not `.strict()`. | Same class on the cash-distribution simulator (simulation never commits cash, but the contract must still be closed). | `SimulateSchema` → `.strict()`. | contract-integrity + live sweep check 33 (forged `distributeCash` → 422). |

Verification that the hardening did not regress any legitimate client: the
80-test live-HTTP suite (all logins use exactly `{email, password, mfaCode}`)
passes 80/80 after the change.

## Confirmed intact (audited, no gap)

- **Server-derived identity**: every mutation route derives actor/tenant/
  classification from the authenticated context; server-controlled fields are
  rejected explicitly (forgery guards) or via `.strict()` — live-verified in
  the 80-test suite (422 SERVER_CONTROLLED_FIELD cases).
- **Authorization**: 12/14 v1 routes use `guarded()` with a catalog
  permission; the 2 exceptions are the enumerated auth entry points (login has
  its own IP-bound `rateLimit(`; logout is an idempotent no-op).
- **Tenant/entity/country context**: enforced inside `guarded()` + RLS (the
  404 messages in the sweep read "…within your authorised scope").
- **Rate limits**: declared on every POST route (values per route, 60s
  windows); login is IP-bound at 10/60s.
- **Audit**: every guarded route carries an `audit:` config; mutation routes
  write audit + domain event in the same transaction (governance routes).
- **Idempotency**: the 5 governed writes + waterfall/simulate use
  `withIdempotency`; replay behavior live-verified in the 80-test suite
  (original response returned, cross-actor key reuse never leaks).
- **Envelope**: no raw `new Response(` in any v1 route; every 2xx/4xx
  response observed live carries `data`/`error` + `meta.traceId`.
- **Tool registration**: 9 Noelia tools, all registered, all
  permission-registered, all bound to existing `BeyuNoeliaReadService`
  methods; duplicate-with-drift registration throws; the facade
  (`src/lib/noelia.ts`) constructs exactly the default registry.
- **No dead dispatchers / no declared-but-unregistered capability**: `list()`
  contains no `registered: false` entries; every `registry.register` block
  binds an `execute` handler.

## Output-schema note (honestly classified)

Response bodies are structurally uniform via the `apiOk`/`apiError` helpers
(asserted live in the 49-check sweep: every 2xx has `data` + `meta.traceId`,
every error has `error.code`), but there is **no per-route Zod output schema**.
This is classified as an accepted design point, not a gap: the envelope is
enforced by the single helper pair (structural guarantee) and live-verified;
introducing per-route output schemas would be ceremony without a security
boundary, and is left to the Iteration 26 reconciliation if deemed necessary.

## Evidence

- `tests/api/contract-integrity.test.ts` — 91/91 pass (in the 1746/1746 full
  regression).
- `scripts/route-inventory.mts` — 49/49 pass on the production build
  (`npm run verify:routes`), including the 3 forged-field checks.
- 80/80 live-HTTP suite pass after the hardening.

## Capability matrix impact

`noelia.api` remains GREEN; the contract-integrity suite is added to its
evidence set (Iteration 14).
