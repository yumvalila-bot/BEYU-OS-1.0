# BEYU → Health signed authorization exchange

## Trust boundary

BEYU remains the canonical identity issuer. Health owns the authorization
decision for Health resources and never queries the BEYU database.

1. The BEYU browser mount requires an active BEYU session.
2. The Health SPA requests a one-use assertion from
   `POST /api/v1/health/authorization-assertion`. BEYU signs it with Ed25519.
3. The SPA sends the assertion to Health's
   `POST /auth/federation/exchange` endpoint through the same-origin
   `/health-os/*` proxy.
4. Health verifies the fixed algorithm, key id, signature, issuer, audience,
   issue/expiry window and unique assertion id. It consumes the id in its own
   `beyu_identity.authorization_assertion_replays` table.
5. Health resolves the canonical BEYU user through its local identity-link
   table, checks the local account, maps the signed canonical tenant to a
   Health-local tenant, checks active local membership, and derives role and
   permissions from Health-local tables.
6. Health issues a short-lived Health-local access JWT (maximum 15 minutes), anchored to a unique local session `jti` that middleware checks on every protected request and logout revokes
   anchored to a Health-local session/security version. No Health refresh
   credential is returned; renewal requires a fresh BEYU assertion.

The assertion contains identity/session/tenant references only. It never
contains Health roles, Health permissions, patient data, clinical claims or a
BEYU bearer token. The URL, browser state and tenant hostname are never grants.

## Key generation and custody

Generate a key pair offline:

```sh
openssl genpkey -algorithm ED25519 -out beyu-health-ed25519-private.pem
openssl pkey -in beyu-health-ed25519-private.pem -pubout -out beyu-health-ed25519-public.pem
```

- Configure `HEALTH_AUTH_ASSERTION_PRIVATE_KEY` and
  `HEALTH_AUTH_ASSERTION_KID` only in BEYU's server-side secret store.
- Configure `BEYU_AUTH_ASSERTION_PUBLIC_KEY` and matching
  `BEYU_AUTH_ASSERTION_KID` only in the Health backend secret store.
- For rotation, configure `BEYU_AUTH_ASSERTION_PUBLIC_KEYS` as a JSON map
  containing both old and new public keys during the overlap window; change
  BEYU's active `kid` and then retire the old public key after assertions
  signed with it have expired.
- Configure `HEALTH_API_URL` on BEYU's server deployment and
  `BEYU_TRUSTED_BROWSER_ORIGINS` / `CORS_ORIGIN` on Health. Do not put
  private keys or backend URLs in browser-visible `NEXT_PUBLIC_*` variables.
- Production Health boot refuses to start without a configured verifier key.

## Local authorization requirements

A successful signature is necessary but not sufficient. Health must find:
- an active local identity link for the canonical BEYU subject;
- an active Health-local user account;
- an active Health tenant whose `beyu_tenant_id` matches the assertion tenant;
- an active membership for that user in that local tenant.

Role and permission data is loaded from Health's local role tables. Missing,
revoked, expired, unmapped or unavailable records deny the exchange.

## Replay and audit

The assertion `jti` is consumed atomically with a primary-key insert in the
Health database. Reuse is rejected. Expired replay rows are removed on exchange.
Successful exchange writes a Health-local authentication event. No cross-OS
database grant, foreign key, linked server or shared database connection is
required.

## Operational boundary

This repository change does not set production secrets, configure
`HEALTH_API_URL`, deploy the Health backend, or apply migrations to either
production database. Those are separate, explicitly approved deployment steps.
