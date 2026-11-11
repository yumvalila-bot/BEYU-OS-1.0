# BEYU OS — Health Sector Integration Architecture

**Current decision (2026-11-11): dedicated Health PostgreSQL database with signed BEYU-to-Health identity federation.**

This document supersedes the shared-database assumption in the original 2026-08-30 integration design. Historical implementation analysis remains in Git history; this is the current target architecture.

## 1. Constitutional placement

BEYU OS is the canonical identity issuer, governance and strategic control plane.
Health OS is one of the four Sector OSs and owns healthcare execution, clinical
workflows, Health-local identity projections, memberships, roles, permissions,
sessions and clinical records.

The sector cannot mint canonical GlobalUserIDs, grant constitutional authority,
approve its own actions, or widen tenant/entity/country scope. NOELIA remains a
single governed intelligence layer; Health does not create a separate AI identity.

## 2. Database topology

**The Health database is separate from the BEYU database.**

| Concern | BEYU database | Health database |
|---|---|---|
| Canonical identity | Canonical GlobalUserID, parties and BEYU sessions | Local user projection and canonical link |
| Tenant authority | Canonical tenant/entity/country records and grants | Local tenant mapped to canonical BEYU tenant id |
| Authorization | BEYU RBAC/ABAC for BEYU resources | Health-local membership, role, permission and clinical-safety checks |
| Audit | Canonical governance and control-plane audit | Health-local authentication and clinical audit |
| Runtime role | `beyu_runtime`, non-owner, NOBYPASSRLS | `beyu_health_runtime`, non-owner, NOBYPASSRLS |
| Data | Control plane, Finance and shared BEYU records | Clinical and Health operational data |

No cross-database foreign key, shared connection pool, direct Health schema
lookup, linked server, or broad federation read grant is part of this design.
The Health runtime has no BEYU table grants; the BEYU runtime has no Health
table grants.

## 3. Signed BEYU → Health authorization exchange

### BEYU assertion

An authenticated BEYU browser session calls
`POST /api/v1/health/authorization-assertion`. The BEYU server signs a compact
JWT using Ed25519. The assertion includes:

- `iss`: canonical BEYU issuer;
- `aud`: fixed `beyu-health-os` audience;
- `sub`: canonical GlobalUserID;
- `sid`: BEYU session reference;
- `tenant_id`: canonical BEYU tenant reference;
- `iat`, `exp`: 60-second lifetime;
- `jti`: cryptographically random UUID replay identifier.

It contains no Health role/permission, clinical claim, patient data, or BEYU
bearer token. The private signing key never reaches the browser.

### Health verification and local authorization

The Health SPA posts the assertion to
`POST /auth/federation/exchange` through the same-origin `/health-os/*`
rewrite. Health:

1. accepts only EdDSA and a configured key id;
2. verifies the signature and exact issuer/audience;
3. checks issue time, expiry and a maximum 90-second claim window;
4. atomically consumes `jti` in Health-local
   `beyu_identity.authorization_assertion_replays`;
5. finds an active local link for the canonical subject;
6. verifies the Health-local account is active;
7. maps the canonical tenant id to an active Health-local tenant;
8. requires active membership for that local user and tenant;
9. derives the role from the Health-local membership; and
10. issues a Health-local JWT anchored to a Health-local session and security
    version, with an access lifetime capped at 15 minutes.

Health middleware rechecks local account state, canonical-link lifecycle,
membership and security version on protected requests. LIVE canonical status
revalidation remains an outbound Health → BEYU identity lookup and is a
separate direction from the assertion exchange.

### Key custody and rotation

- BEYU stores `HEALTH_AUTH_ASSERTION_PRIVATE_KEY` and active `kid`.
- Health stores only the public key and accepted key ids.
- Key rotation uses overlapping public keys in
  `BEYU_AUTH_ASSERTION_PUBLIC_KEYS`; old keys are removed only after their
  assertions have expired.
- Production Health boot refuses to start without a verifier key.
- Browser origins are checked against an explicit allow-list; wildcard origin
  is not accepted for the exchange.

See `docs/security/BEYU_HEALTH_SIGNED_AUTHORIZATION_EXCHANGE.md` and
`sectors/health/backend/DEPLOYMENT_CONTRACT.md` for operational detail.

## 4. Health-local tenant and identity boundary

The Health database owns:

- `beyu_identity.users` — local domain identity;
- `beyu_identity.beyu_identity_links` — 1:1 canonical identity mapping;
- `beyu_identity.tenants.beyu_tenant_id` — set-once canonical tenant mapping;
- `beyu_identity.tenant_memberships` — active local membership;
- local roles, permissions, sessions and auth events;
- `beyu_identity.authorization_assertion_replays` — consumed one-use assertion ids.

The assertion's tenant id selects a mapping candidate only. It does not grant
membership or sector permissions. Health checks its own tenant status and
membership before issuing a session. Local RLS continues to enforce tenant,
entity and country boundaries using Health-local request context.

## 5. Existing outbound federation remains separate

Health → BEYU continues to use the existing internal identity API for
canonical identity registration and lifecycle lookup. It uses a service
principal and its own service credential. That service credential is not the
Ed25519 user assertion key and is never sent to the browser.

## 6. Finance idempotency security boundary

Finance's idempotency ledger remains in the BEYU database because it is a
BEYU operational control ledger. It is isolated by tenant **and** actor:
- a fresh independent database transaction sets the single-tenant and
  actor GUCs, and forces global scope off;
- claim, completion, release and diagnostics all use that principal context;
- RLS is enabled and forced on `public.idempotency_records`;
- no global governance scope bypass is permitted;
- legacy rows missing tenant/actor identifiers block migration rather than
  being guessed or deleted.

The Finance migration is additive and is applied only through the governed
BEYU migration process. It does not grant Finance posting authority;
`CAP_POSTING` remains locked and fail-closed.

## 7. Verification requirements

- BEYU signer unit tests verify Ed25519 signatures, audience, issuer, TTL,
  identity-only claims and missing-key fail-closed behavior.
- Health backend integration tests use a real PostgreSQL scratch database or
  PGlite to verify signature, replay, expiry, wrong issuer/audience, revoked
  link, disabled local account, inactive tenant and missing membership.
- Finance RLS tests run as the actual non-owner `beyu_runtime` role and verify
  same-principal access, cross-tenant denial, cross-actor denial, INSERT/UPDATE
  `WITH CHECK`, and non-bypass under global-scope context.
- Tests run separately for the BEYU root, Health frontend and Health backend.

## 8. Release boundary

This architecture change does not deploy the Health backend, provision a
Health database, apply migration 033, configure production key material or
`HEALTH_API_URL`, or promote any deployment. Each is a separate human-approved
release action.
