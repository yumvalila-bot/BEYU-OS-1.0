# PHASE 09 — ARCHITECTURE FUSION

Date: 2026-09-05
Status: **EVALUATED; large physical fusion DEFERRED/BLOCKED on risk** (see rationale). DB-backed parity is now green; source architecture remains reference.

## Objective

Adopt the strongest architectural characteristics of `BEYU-OS-` (apps/services/packages/sectors/infra) without destroying `BEYU-OS-1.0` mature implementations.

## Current destination architecture (measured)

- Root Next.js control plane: `src/` + `drizzle/` + `tests/`.
- Mature Health sector: `sectors/health/backend` (NestJS) + `sectors/health/` (Vite).
- Real Flutter client: `mobile/flutter`.
- Real CI/CD: `.github/workflows/ci.yml`.
- No shared `packages/` layer.

## Source architecture (measured)

- `apps/` (beyu-web, beyu-health-web, beyu-console, beyu-health-mobile scaffold).
- `services/` (beyu-api, beyu-health-api).
- `packages/` (types, config, events, auth, security, health-types, health-api-client).
- `infra/` configs.
- No Finance, no Family Office, no CI/CD, weak Health test coverage.

## Evidence-based decision

The **destination is already the stronger verified implementation**. The source's advantage is package structure/contracts, NOT implementation strength. Because:

1. Moving the mature root control plane (`src/`, `drizzle/`, `tests/`, ~680 TS files) into `apps/beyu-web` / `services/beyu-api` would be a high-risk restructure with no content gain;
2. Creating a duplicated `packages/` layer that is not wired to the runtime would be cosmetic;
3. The DB-backed gates are now green on the current architecture;
4. The strongest path to BEYU OS 2.0 is to **keep the current canonical structure**, adopt selective source improvements only where they add verified value, and certify against observable behavior.

## What was actually adopted in this session

1. Real disposable PostgreSQL 16 harness (`scripts/infra/pg16-server.mjs`, `pg16:start`/`pg16:stop`, `embedded-postgres` devDependency) — infrastructure pattern from source/CI model, now executable locally.
2. Real-PG verification (this is the architectural gate enabler, not a UI change).

## Waterfall engine comparison — RESOLVED (ADOPT_SOURCE engine, KEEP_1_0 finance)

The previously-open "source `beyu-api` waterfall engine vs destination `src/lib/waterfall.ts`" decision was resolved against both sources:

- Source `services/beyu-api/src/modules/waterfall/waterfall.engine.ts` is a **pure** engine using integer **basis points (bps)** + `BigInt` multiplication, canonical-rule hashing, version-pinned calculation result, and no floating point anywhere in the money path. It also carries typed conditions and a deterministic spec-§80 validation surface.
- Destination `src/lib/waterfall.ts` (`runWaterfall`) is older/simpler and multiplies integer minor units by **float percentage rates** (`gross * 0.3`), which violates the deterministic-integer arithmetic rule (Rule 10 / spec §80) even though it rounds afterwards.

Decision:
- **ADOPT_SOURCE**: the source `calculateWaterfall` engine is the better implementation for WHAT SHOULD HAPPEN. It is pure and can be carried into the destination control plane as a typed module without touching Finance/ledger files.
- **KEEP_1_0**: destination Finance/ledger/CAP_POSTING authority is unchanged; Finance/Treasury still executes approved allocations. The engine never moves money.
- **DEFER**: physical port is deferred to the shared-package step (Phase 10) because it requires reconciling source `@beyu/types` with destination types; no finance file is modified before that gate.

## What was NOT changed (and why)

| Change | Decision | Rationale |
|---|---|---|
| Move root src into `apps/beyu-web` | DEFER | high risk, no verified value |
| Adopt source `services/beyu-api` as control plane | REJECTED | destination root API is verified via 2375 tests; source 149 tests |
| Adopt source `packages/*` wholesale | DEFER/BLOCKED | would create duplicate/competing contracts; needs contract reconciliation |
| Replace Health OS | REJECTED | destination Health 488+89 tests vs source 7 tests |
| Adopt source mobile scaffold | REJECTED | source mobile is pubspec-only |
| Adopt source infra wholesale | BLOCKED | no real production env/secrets |

## Status

- **PARTIALLY VERIFIED / ARCHITECTURALLY PRESERVED.**
- Canonical BEYU OS 2.0 release may proceed as a **v2.0.0 inside BEYU-OS-1.0** without risky physical restructure, once the remaining non-architecture gates (Flutter, provider, deployment) are handled.
