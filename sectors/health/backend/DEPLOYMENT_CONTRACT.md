# BEYU Health OS — governed deployment contract

> **Status: NOT DEPLOYED.** This contract defines the approved architecture and
> required release controls. It authorizes no hosting, production database,
> secret, migration, or deployment action.

## 1. Canonical components

| Component | Canonical location |
|---|---|
| BEYU public home / identity | BEYU root Next.js application |
| Health frontend | `sectors/health` Vite/React SPA, embedded at `/os/health` |
| Health backend | `sectors/health/backend` NestJS service |
| Health-local database | Dedicated PostgreSQL database; never the BEYU database |
| BEYU assertion signer | `src/lib/health-authorization-assertion.ts` |
| Health assertion verifier | `sectors/health/backend/src/modules/identity/beyu-authorization-assertion.service.ts` |
| Health local session issuer | `sectors/health/backend/src/modules/auth/auth.service.ts` |
| Health migrations | `sectors/health/backend/database/migrations` |

## 2. Request and trust flow

```
Browser
  │
  ├─ GET /os/health
  │    BEYU session + canonical host boundary only
  │
  ├─ POST /api/v1/health/authorization-assertion
  │    BEYU signs one-use Ed25519 assertion (60 seconds)
  │
  └─ POST /health-os/auth/federation/exchange
       Next rewrite → Health backend /auth/federation/exchange
         ├─ Verify EdDSA, kid, issuer, audience, iat, exp, jti
         ├─ Consume jti in Health-local replay table
         ├─ Verify Health-local identity link and account
         ├─ Map BEYU tenant reference to Health-local tenant
         ├─ Require active Health-local membership
         ├─ Derive Health role/permissions from Health tables
         └─ Issue Health-local access JWT (≤15 minutes)
```

The BEYU mount does not read the Health database. The Health backend does not
read the BEYU database. Health's existing outbound identity adapter may call
BEYU's internal registration/lookup API using its service credential; this is
a separate trust direction from the human assertion exchange.

## 3. Environment contract

### BEYU server deployment

| Variable | Purpose |
|---|---|
| `HEALTH_API_URL` | Health backend base URL, no trailing slash. Used by the server-side Next rewrite. A redeploy is required after changing it. |
| `HEALTH_AUTH_ASSERTION_KID` | Active Ed25519 signing key id. |
| `HEALTH_AUTH_ASSERTION_PRIVATE_KEY` | Ed25519 PKCS#8 PEM private key. Server-side only; never `NEXT_PUBLIC_*`. |

### Health backend deployment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Dedicated Health PostgreSQL runtime DSN; never BEYU's database URL. |
| `BEYU_AUTH_ASSERTION_KID` | Key id matching BEYU's active signer. |
| `BEYU_AUTH_ASSERTION_PUBLIC_KEY` | Ed25519 SPKI PEM public key. |
| `BEYU_AUTH_ASSERTION_PUBLIC_KEYS` | Optional JSON map `kid → PEM public key` for overlapping key rotation. |
| `BEYU_AUTH_ASSERTION_ISSUER` | Defaults to `https://www.beyu.co.tz`. |
| `BEYU_AUTH_ASSERTION_AUDIENCE` | Defaults to `beyu-health-os`. |
| `BEYU_TRUSTED_BROWSER_ORIGINS` | Exact browser origin allow-list (include `https://www.beyu.co.tz` and `https://health.beyu.co.tz`); defaults to `CORS_ORIGIN`. Wildcards are refused. |
| `BEYU_IDENTITY_ENDPOINT` | BEYU base URL for the existing Health → BEYU identity API. |
| `BEYU_IDENTITY_TOKEN` | Health → BEYU service credential; separate from the Ed25519 human assertion. |
| `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE` | Health-local access JWT configuration. |
| `CORS_ORIGIN` | Explicit BEYU browser origin allow-list. |
| `REDIS_URL`, encryption and MFA secrets | As required by the existing Health production boot contract. |

### Key generation and custody

Generate an Ed25519 pair offline:

```sh
openssl genpkey -algorithm ED25519 -out beyu-health-ed25519-private.pem
openssl pkey -in beyu-health-ed25519-private.pem -pubout -out beyu-health-ed25519-public.pem
```

- Private key: BEYU server secret store only.
- Public key: Health backend secret/config store only.
- Never commit either key or place the private key in frontend build variables.
- Rotate using a new `kid`; temporarily configure both public keys in Health's
  `BEYU_AUTH_ASSERTION_PUBLIC_KEYS`, switch BEYU's active signer, wait beyond
  the assertion lifetime, then remove the old key.

## 4. Health database and runtime role

- Provision a dedicated Health PostgreSQL database.
- Apply Health migrations through the governed Health migration runner only.
- Health runtime role: `beyu_health_runtime`, `LOGIN NOSUPERUSER NOBYPASSRLS
  NOCREATEROLE`; it must not own the Health identity tables.
- Migrations 033–034 create `beyu_identity.authorization_assertion_replays`, enforce unique non-null Health session `jti` values, and
  grants the Health runtime role only the required `SELECT`, `INSERT` and
  `DELETE` privileges for atomic replay consumption and expiry cleanup.
- No BEYU runtime role is granted access to Health tables. No Health runtime
  role is granted access to BEYU tables.
- Local authorization requires an active link, active Health account, active
  local tenant mapping and active membership. Local roles/permissions are
  resolved from Health tables; assertion permission claims are not accepted.

## 5. Build, migration and verification

```sh
# Health backend
cd sectors/health/backend
npm ci
npx tsc --noEmit
npm test

# Health frontend
cd ../
npm ci
npm run typecheck
npm test
npm run build

# BEYU root
cd ../../..
npm ci
npm run typecheck
npm test
```

Before release:
1. Verify the Health DB endpoint and `beyu_health_runtime` role attributes.
2. Verify migration status and checksum through the Health migration runner.
3. Apply migration 033 only to the dedicated Health database through the
   separately approved release process.
4. Run Health backend integration tests against the dedicated database or
   PGlite scratch engine.
5. Verify Health migration status includes 033–034 and run BEYU Finance RLS regression tests as the actual non-owner
   `beyu_runtime` role; verify tenant and actor isolation, INSERT/UPDATE
   WITH CHECK, and global-scope non-bypass.
6. Configure keys and `HEALTH_API_URL` in secret stores; do not commit values.
7. Deploy Health backend and BEYU preview separately; perform signed exchange,
   replay, revoked-link, suspended-account, missing-membership and expiry probes.
8. Obtain human release approval before production deployment.

## 6. Rollback

- Disable the BEYU assertion endpoint by removing its private key from the
  server secret store; it fails closed with 503.
- Unset `HEALTH_API_URL` and redeploy BEYU to remove the same-origin proxy.
- Revert application code only after the deployment plan accounts for already
  issued Health-local access tokens (maximum 15-minute lifetime).
- Roll back migration 033 only after all Health services no longer require
  replay protection and through the governed migration runner.

No step in this contract changes production configuration, secrets, database
schema or deployed services without separate explicit approval.
