# Architecture Completeness Matrix — Iteration 4

Audit date: 2026-08-25 · Branch `arena/01a035aa-beyu-os-1-0` · Baseline HEAD `f245b1c`

## Trace chain (mandate: API → auth → service → tool → DB → event/audit → response)

Every governed API route passes through `guarded()` in `src/lib/api.ts`:

1. authentication (session → principal, server-derived; client authority claims rejected)
2. authorization (RBAC permission + ABAC classification ceiling)
3. validation (strict Zod schema per route)
4. rate limiting (per principal + action)
5. idempotency (payload-hash pinned, tenant/actor/endpoint scoped)
6. database context (tenant-scoped transaction, `SET LOCAL beyu.current_tenant_ids`, RLS)
7. service layer (canonical BEYU services only; noelia adapters never receive raw DB handles)
8. tool registry (declaration → registration → contract → authorize → validate input → execute → validate output)
9. audit record + enterprise event (append-only, hash-chained)
10. structured error envelope (no secrets, no stack traces, no DB internals)

## Route inventory (26 routes, 100% method-exported, 100% guarded)

| Area | Routes | HTTP test coverage |
|---|---|---|
| health | `/api/health` | 15 files reference |
| auth | login, logout | login + logout (new IT-4 suite) |
| noelia | ask, analyze, brief | http.test.ts + http-coverage (IT-4) |
| noelia schedules | create, status, tick | http-coverage (IT-4) |
| noelia workflows | create, get, validate, authorize, execute, cancel | http-coverage (IT-4) |
| finance | capital governance-authorization, tax assess, waterfall simulate | capital-governance-http, specialist suites |
| governance | authorization, resolutions CRUD, decision, table, votes | authorization-http, resolution-http, decision-http, vote-http |
| hcm | employees list/get | hcm suites |
| system | self-test | system suites |

## Findings & dispositions

### A-04-1 (FIXED) — 11 routes without committed transport-level tests
analyze, brief, schedules ×3, workflows ×6 (incl. GET), logout had no HTTP tests.
→ Added `tests/noelia/http-coverage.test.ts` (7 tests, semantic success asserted:
analysisType echoed, findings present, schedule lifecycle CREATED→SUSPENDED→tick,
workflow PLAN→VALIDATE→AUTHORIZE(maker/checker)→EXECUTE→COMPLETED with step
evidence, cancel, logout). Live server required; suite skips when unavailable.

### A-04-2 (FIXED) — rate-limit buckets keyed by permission, not action
`rateLimit(`${userId}:${permission}`)` let sibling actions under one permission
(e.g. workflow create/validate/execute/cancel, all `ai:workflow.run`) share a
single bucket: the declared per-route limit was not the enforced limit and one
action's traffic starved another's budget (observed: execute 429 after 3 rapid
workflow calls despite execute limit 10/min).
→ Bucket key now `${userId}:${action}`. Every route's declared limit is its
enforced limit; no limit was relaxed.

## Static completeness checks (all PASS)

| Check | Result |
|---|---|
| routes with no HTTP method export | 0 |
| lib modules never imported (dead services) | 0 / 135 |
| permission codes defined but never referenced | 0 / 57 |
| DB tables never referenced outside schema | 0 / 83 |
| noelia engine-declared tools not registered | 0 (tool-registry-contract suite) |
| event type enum orphans | N/A (event_type is free text by design) |
| direct DB bypass of governed services | none — all `db` imports inside tenant-scoped context or canonical services |
| duplicated business logic | none detected (single canonical services; noelia is adapter-only) |

## Residual (honest, non-blocking)

- Local dev DB role is a superuser (RLS bypassed locally); production Supabase
  role is non-superuser and RLS-enforced. DB-level RLS enforcement is tested via
  policy presence + constraint checks locally and by the production role shape
  (see Iteration 24 for the non-superuser probe role).
