# BEYU OS — Sector OS Layer

Sector OSs **execute** under BEYU OS governance. BEYU OS (the root of this
repository) is the constitutional control plane: it owns canonical identity,
governance, audit and authorization. Sectors consume those capabilities and
execute domain operations.

| Sector | Path | Stack | Boundary doc |
| --- | --- | --- | --- |
| Health | `sectors/health/` | NestJS backend + React/Vite SPA + PostgreSQL (`beyu_identity` schema) | [`sectors/health/INTEGRATION.md`](health/INTEGRATION.md) |

## Rules for sector code

1. Sectors are self-contained npm packages with their own toolchain (tsconfig,
   lint, test runners, lockfiles). The BEYU root toolchain deliberately
   excludes `sectors/**` (see root `tsconfig.json` / `eslint.config.mjs`).
2. A sector must never create a competing global identity — sector identities
   link 1:1 to the canonical BEYU GlobalUserID.
3. Sector data tables are RLS-gated with tenant + entity + country boundaries.
4. Constitutional authority (trust, board, general counsel) is not held or
   self-granted by sectors; it is exercised only through BEYU governance.
5. Sector AI operates as governed HIVE capabilities through Noelia; AI never
   approves its own actions.

See `docs/architecture/HEALTH_SECTOR_INTEGRATION_DESIGN.md` for the full
conflict matrix and integration decisions.
