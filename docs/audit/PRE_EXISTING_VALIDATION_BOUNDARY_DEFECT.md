# PRE-EXISTING BEYU INFRASTRUCTURE DEFECT — Zod validation escaped `guarded()`

**Classification:** pre-existing shared BEYU infrastructure defect  
**Baseline commit:** `0bf378ec9f484acb6100d24f166492ebd4bdfd9f`  
**Validated:** 2026-08-23  
**Status:** remediated by a small boundary normalizer with unit, production HTTP and Phase 15 regression coverage

## Reproduction

The control experiment used the untouched baseline with:

- live PostgreSQL 18.4;
- migrations `0000`–`0013` applied and canonical seed loaded;
- successful `next build` using Next.js 16.2.11;
- `next start --hostname 0.0.0.0 --port 3100`;
- a valid `governance@beyu.os` authenticated session.

Requests:

```http
POST /api/v1/ai/noelia
Content-Type: application/json
Cookie: <valid session>

{"question":"x"}
```

```http
POST /api/v1/governance/resolutions
Content-Type: application/json
Cookie: <valid session>

{"bodyId":"GOV_GROUP_BOARD","title":"x"}
```

Both returned HTTP 500 with no canonical JSON error body. Production logs showed genuine
`Error [ZodError]` values escaping the route boundary. This proves the issue was not
Noelia-specific. The canonical resolutions mutation was the control route.

## Affected routes

The defect applied to Zod `.parse()` / `parseBody()` failures thrown inside `guarded()` handlers,
including Noelia, resolutions, resolution votes/table/decision, capital governance authorization,
waterfall simulation and tax assessment. Login has its own local `try/catch` and was not dependent
on `guarded()` for validation normalization.

## Root cause

The primary propagation defect was JavaScript async control flow in `guarded()`:

```ts
try {
  return withTenantDatabaseContext(principal, async () => handler(context));
} catch (error) {
  // canonical normalization
}
```

Returning the promise without awaiting it ends the `try` before the transaction/handler promise
rejects. The Zod failure therefore never reached `guarded()`'s catch and Next produced a framework
500. The `databaseContext: "handler"` branch had the same pattern for `return handler(context)`.

The baseline catch also recognized validation solely with `instanceof ZodError`, which is an
unnecessary constructor/prototype identity dependency at a bundled application boundary. The
remediation therefore both awaits the promises inside the `try` and normalizes Zod's stable public
shape. The production stack and canonical route control establish this as a shared application-
boundary defect rather than a Noelia domain failure.

## Production / development distinction

The issue had already been observed under Next development/Turbopack, but that observation was not
used as release evidence. The independent optimized-build + production-server reproduction above
proves it was also a **production-runtime defect**, not development-only behavior.

## Impact

- Valid client mistakes produced 500 instead of canonical 422.
- The API error envelope and trace headers were lost.
- Production logs received framework-level Zod stack output.
- Validation itself remained enforced; no malformed mutation was accepted.
- No database error was returned to the client, but relying on Next's fallback was not an acceptable
  application boundary.

## Remediation

`guarded()` now awaits both handler paths inside its `try`, and
`normalizeApplicationBoundaryError()` explicitly recognizes the stable Zod boundary shape and
returns a canonical application validation error. It:

- does not mutate `ZodError.message`;
- does not mutate any prototype;
- copies only `code`, sanitized `path`, and `message` from issues;
- never returns stack, arbitrary properties, input objects or database details;
- leaves non-validation errors on the generic 500 path.

The change is confined to normalization in `src/lib/api.ts`; transactions, tenant context,
AsyncLocalStorage, `SET LOCAL`, authentication, authorization, audit and idempotency were not
changed.

## Regression evidence

- `tests/api/validation-boundary.test.ts` covers local and cross-bundle-shaped Zod errors, verifies
  message/prototype immutability, and rejects arbitrary infrastructure errors.
- `tests/api/validation-http.test.ts` exercises both Noelia and canonical resolutions against the
  production server and requires canonical 422 responses.
- Final optimized production HTTP control: 7/7 passed (Noelia 5/5; malformed Noelia plus canonical
  resolutions validation 2/2). Both malformed requests returned canonical sanitized 422 responses.
- Final Phase 15 common-platform run: 125/125 passed.
- Final complete available suite: 1,589/1,589 across 65/65 files passed against the optimized
  production server and live PostgreSQL.
- Final typecheck, lint, production build, `drizzle-kit check`, and `git diff --check` passed.
