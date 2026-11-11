# BEYU Health OS — Sector Integration Boundary

**Current architecture decision:** dedicated Health PostgreSQL database with signed BEYU-to-Health identity federation. This supersedes the historical shared-database assumption in earlier integration notes.

## Constitutional position

```
BEYU OS — canonical identity issuer, governance and strategic control plane
        │
        │ short-lived Ed25519 identity assertion
        ▼
Health OS — independent local authorization and clinical execution
        │
        ▼
Health-local clinical, operational and tenant data
```

- BEYU remains the canonical identity issuer and governance authority.
- Health is a separate Sector OS with its own PostgreSQL database, identity projection, memberships, roles, permissions, sessions and clinical data.
- Health owns the authorization decision for Health resources. BEYU never queries Health identity tables or clinical data.
- A hostname, launcher tile, browser claim or signed assertion alone is not a Health permission grant.
- No Foundation OS, Family Office OS or second NOELIA identity is introduced.

## Identity and authorization exchange

1. An authenticated BEYU session requests `POST /api/v1/health/authorization-assertion`.
2. BEYU signs a 60-second, one-use Ed25519 JWT assertion. It contains the canonical GlobalUserID, BEYU session reference, canonical tenant reference, issuer, fixed Health audience, timestamps and unique `jti`. It contains no Health role, permission, patient data or BEYU bearer token.
3. The Health SPA posts the assertion to `POST /auth/federation/exchange` through the same-origin `/health-os/*` proxy.
4. Health verifies EdDSA signature, key id, issuer, audience, expiry, maximum lifetime and replay status using its own database.
5. Health resolves the canonical subject through its local `beyu_identity.beyu_identity_links`, checks the local account, maps the asserted BEYU tenant to a Health-local tenant, and requires an active local membership.
6. Health derives role and permissions from its own tables and issues a Health-local access JWT anchored to a local session and security version. The access token lifetime is capped at 15 minutes; renewal requires a fresh BEYU assertion.
7. Health request middleware rechecks local account, link lifecycle, membership, permissions and security version. LIVE canonical status revalidation remains a separate Health-to-BEYU service call.

The two federation directions are distinct:
- Health → BEYU: existing service-authenticated canonical registration/status lookup APIs.
- BEYU → Health: new asymmetric, short-lived, replay-protected human identity assertion.

## Database topology and isolation

- BEYU and Health use **separate PostgreSQL databases** and separate runtime credentials.
- BEYU database: canonical users/parties, sessions, grants, policy, governance and Finance operational ledgers.
- Health database: `beyu_identity` local identity projection, links, tenant mapping, memberships, roles, permissions, local sessions, auth events and all Health domain data.
- Health stores the canonical BEYU tenant reference in its local `beyu_identity.tenants.beyu_tenant_id` mapping. No cross-database foreign key, linked server, shared pool or read grant is used.
- Health runtime role: `beyu_health_runtime`, non-owner, `NOSUPERUSER NOBYPASSRLS NOCREATEROLE`, with only required Health-schema DML and the explicit replay-ledger grants.
- Health tenant/entity/country boundaries are enforced by Health-local RLS and request context. BEYU tenant and actor GUCs are not reused by Health.
- The Health assertion replay table is private to the Health database. Its `jti` primary key makes consumption atomic and rejects replay.

## Canonical files

| Area | Location |
|---|---|
| BEYU signer | `src/lib/health-authorization-assertion.ts` |
| BEYU assertion endpoint | `src/app/api/v1/health/authorization-assertion/route.ts` |
| BEYU Health mount | `src/app/os/health/mount.ts` |
| Health verifier | `sectors/health/backend/src/modules/identity/beyu-authorization-assertion.service.ts` |
| Health exchange endpoint | `sectors/health/backend/src/modules/auth/auth.controller.ts` |
| Health local session issuance | `sectors/health/backend/src/modules/auth/auth.service.ts` |
| Health replay DDL | `sectors/health/backend/src/modules/identity/boundary-schema.ts` |
| Health replay migration | `sectors/health/backend/database/migrations/033_beyu_authorization_assertion_replay.up.sql` and `034_unique_health_session_jti.up.sql` |
| Health SPA client | `sectors/health/src/services/auth.ts` |
| Server-only API proxy | `next.config.ts` |

## Build and test

```sh
# BEYU root
npm ci
npm run typecheck
npm test

# Health frontend
cd sectors/health
npm ci
npm run typecheck
npm test
npm run build

# Health backend
cd sectors/health/backend
npm ci
npx tsc --noEmit
npm test
```

Backend integration tests use PGlite by default and can use a real PostgreSQL
scratch database through the test connection factory. The Finance RLS policy
must additionally be exercised as the actual non-owner `beyu_runtime` role.

## Production actions remain separate

This repository change does not create or rotate production keys, configure
`HEALTH_API_URL`, provision a Health database, apply migration 033, deploy a
backend or change production data. Each remains a separate human-approved
release action. The deployment contract lists the exact configuration and
verification gates.
