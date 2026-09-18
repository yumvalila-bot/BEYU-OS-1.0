# BEYU OS — Runtime identity contract (P1)

**Status:** contract only, with a deferral decision. No new endpoint is
introduced in P1, for the reasons in "Deferral".

## Purpose

Phase 4 (PVG) must be able to prove, from inside production, that:

> "the production runtime is actually running the artifact we tested."

To do that PVG needs a **non-secret** runtime identity. This document pins the
exact tuple so P3 can implement the smallest safe endpoint and every later phase
can depend on the identical contract.

## The tuple

| Field | Meaning | Non-secret |
| --- | --- | --- |
| `releaseId` | immutable release identifier (build/provenance record) | yes |
| `gitSha` | the commit this runtime was built from | yes |
| `buildId` | the build/artifact identifier | yes |
| `environment` | `production` / `staging` / `preview` / `local` | yes |
| `deploymentId` | the platform deployment identifier | yes |
| `runtimeVersion` | the running runtime's version identity | yes |
| `schemaVersion` | the schema/migration version the runtime expects | yes |

Excluded by construction (must never appear): secrets, tokens, credentials,
private keys, database URLs, or any environment-secret value.

## What exists today (P1 reality)

- `src/lib/constants.ts` — `SYSTEM_VERSION = "BEYU-OS/1.0.0"` (compile-time
  constant), surfaced by `GET /api/health` and `GET /api/health/live`.
- `.next/BUILD_ID` (Next.js), the db-release provenance record (git SHA,
  migration fingerprint, deployment, environment, timestamp) and
  `scripts/supply-chain/sbom.mjs` git provenance.
- The cross-OS event envelope already carries `eventVersion`/`schemaVersion`;
  `enterprise_events.schema_version` exists at schema level.

There is **no** dedicated runtime-identity endpoint today — only the compile-time
version constant. The missing pieces are `releaseId`, `gitSha`, `buildId`,
`environment`, `deploymentId`, `schemaVersion` exposed as one response.

## smallest safe implementation (proposed release-identity phase)

1. A build-time script (e.g. `scripts/build-identity.mjs`) reads the non-secret
   build/deploy context from the environment (git SHA from the working tree,
   buildId/deploymentId from `NEXT_PUBLIC`-free build vars), writes one JSON
   under `.next` that `next.config.ts`/the app imports.
2. `GET /api/health/identity` returns only the allowlisted tuple. Environment
   secrets are never read; the route stays `force-dynamic` with no DB query.
3. A test asserts the response is exactly the allowlist (no secret-shaped key,
   no DATABASE_URL/DSN material) and that a missing provenance value is
   reported explicitly, not fabricated.

## Deferral decision (P1)

Per the P1 brief ("If implementation is clearly isolated, safe, and low-risk, it
may be implemented in P1. Otherwise defer... and document the exact reason"),
implementation is deferred out of P1, to the release-identity phase of the
programme (Phase 3 in the programme's implementation-strategy numbering). The
P1 brief phrases the deferral target as the next implementation phase; either
way the endpoint and its build-time capture land in the release-identity phase,
immediately before PVG. Reasons:

1. **Build/deploy identity sourcing is a build chain concern**, not a
   documentation-only difference: `gitSha`, `buildId` and `deploymentId` must
   be captured at build time so both the build and CI can verify them, and that
   touches `next.config.ts`, `scripts/` and the build job's environment mapping
   rather than adding a single route.
2. **Correctness is verifiable only by PVG (P4)**: an unverifiable endpoint
   shipped now would de-validate the `sys:6` deployment evidence guarantee the
   PVG must hold.
3. Building it before the serialized identity is fixed would force reverting
   P3 work later, which the programme's smallest-change rule forbids.

Currently the runtime reports the compile-time `SYSTEM_VERSION` alone, which is
the truthful state; P3 turns it into the full tuple. This contract is written so
that P3 is a *reinforcement* of the existing identity, not an addition.

## Non-functional rules (binding on all phases)

- Never expose secrets, tokens, credentials, private keys, database URLs, or
  environment secret values.
- Never return data that requires authorization; the endpoint is intentionally
  unauthenticated and information-free, exactly like `/api/health/live` today.
- No database dependency at request time.
