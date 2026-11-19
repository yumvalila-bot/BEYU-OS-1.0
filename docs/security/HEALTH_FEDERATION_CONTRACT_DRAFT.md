# Draft contract: BEYU-to-Health session federation

**Status: USER-CONFIRMED OWNER APPROVAL FOR IMPLEMENTATION AND NON-PRODUCTION TESTING — NOT IMPLEMENTED OR ACTIVATED.** Version `1.0-draft`, 2026-11-18. The requester confirmed that accountable owners approve this draft for implementation and non-production testing, selected the shared PostgreSQL direction, and retained BEYU as sole identity authority. No named signatures or separate approval artifacts were provided. This does not resolve the explicitly deferred endpoint allowlist, request canonicalization, replay-store implementation, or Health ledger location and migration plan; their decisions remain necessary before the corresponding functionality can be enabled. Production deployment, identity linking and production migrations require separate authorization.

## 1. Goal and non-goals

Enable a user authenticated by BEYU to use existing Health services through a same-origin backend-for-frontend (BFF). BEYU remains the sole identity authority. Health remains independently responsible for tenant membership, operation authorization and RLS. An active identity link or correct hostname is necessary where applicable but is **not** a grant of Health access. Preserve `/os/health`, `/health/os`, `/health`, the tenant-domain registry, the Health mount, and all existing authorization gates.

No standalone Health registration, password login, refresh or restore in production; do not lift `standalone-auth.fence.ts`. No browser-visible Health credential, new password store, service-secret reuse, client-supplied canonical identity, alternate tenant registry, automatic identity linking or production change is authorized. This proposal replaces neither the Health-to-BEYU service identity registration/lookup contract nor existing per-operation permissions.

## 2. Current facts and gaps

- The root mount resolves a BEYU session and active link and applies tenant-domain restrictions (`src/app/os/health/mount.ts`, `src/lib/health-os-authorization.ts`). It serves a SPA, not a sector-authenticated API session.
- Root `next.config.ts` deliberately has no Health backend rewrite. The SPA currently calls `/health-os/auth/*` using its in-memory token and refresh-cookie model (`sectors/health/src/services/auth.ts`); production standalone credential endpoints are fenced. The BFF integration must adapt the SPA and Health backend rather than merely add a rewrite.
- Health `AuthContextMiddleware` currently expects Health HS256 bearer tokens and reloads account and membership/authorization state; it does not understand the proposed assertion. The Health sector `global_user_id` is a domain UUID, not the canonical BEYU user ID. Mapping uses the active `beyu_identity.beyu_identity_links` row.
- Shared database is the selected **design direction**, not proof that any existing environment is configured. The root and Health migration ledgers collide in their current default location; runtime grants are incomplete and Health migration 032 grants broad users-table SELECT, including password hashes. See `sectors/health/backend/DEPLOYMENT_CONTRACT.md`. A safe reviewed migration/ledger design is a prerequisite, not an implicit change here.

## 3. Proposed topology and sequence

```
Browser -- BEYU session cookie --> BEYU BFF (same origin)
  BFF: server-side session + tenant-domain + link + canonical scope checks
  BFF -- mutually authenticated TLS + one-request signed assertion --> Health internal API
  Health: verify sender and assertion, replay check, link + tenant + membership + policy
  Health: scoped transaction / RLS -> authorized operation -> BFF -> browser
```

1. The SPA calls only the same-origin BFF. No Health token, refresh cookie or assertion is returned to browser JavaScript. The BFF reads the BEYU cookie with the existing session resolver; it never forwards that cookie or user-supplied `Authorization`, `Cookie`, tenant, identity or forwarding headers to Health.
2. For **every** request, the BFF re-resolves the session, active user and account state, selected canonical tenant, applicable tenant-domain/namespace restrictions, active identity link and canonical authorization. It enforces the existing CSRF/origin controls for unsafe methods, and denies when the session, scope or authoritative dependency cannot be validated. User input can request a resource or tenant switch, but is never authority; it must be checked against server-derived scope. No background renewal or Health refresh session is introduced.
3. The BFF sends one short-lived request-bound assertion to the Health service over mutually authenticated TLS. Health accepts this flow only on an internal listener/route inaccessible to the public internet and only from the allowlisted BFF service identity. Private networking alone is not authentication. Assertion signing keys and mTLS credentials are distinct from each other, BEYU session secrets, Health JWT secrets and the Health-to-BEYU registration service token.
4. Health verifies mTLS, assertion and replay state, independently loads the **active** identity link, mapped active Health tenant, active sector account and membership, and current permissions. It verifies that the mapping is the one asserted and that country/entity scopes and policy cover the requested operation. It creates the RLS transaction context from validated database records, never from browser inputs or unvalidated claims. No privileged execution or bypass on missing mapping.
5. The result passes through the BFF with `Cache-Control: no-store` for authenticated responses. Both services audit the decision with a shared server-generated correlation ID, without logging cookies, assertions, clinical content or secrets. Do not forward internal error details to the browser.

## 4. Draft protocol v1 — subject to review

### 4.1 Transport and request routing

- Browser-facing prefix: `/api/v1/health-bff/` (new server-side handlers, not an unrestricted Next.js rewrite). Initially expose only individually reviewed method/path pairs; no generic catch-all, arbitrary URL, redirects or path forwarding. A concrete endpoint allowlist and body limits must be approved alongside implementation. Reject encoded traversal, ambiguous paths, unexpected methods and unsupported content types. Large uploads, streaming and WebSockets are **out of scope** until their separate design is approved.
- The backend origin is trusted server configuration, never from the browser or host headers. Require HTTPS, an explicit hostname/port allowlist, certificate hostname verification, private service routing, DNS/IP egress controls and mTLS peer verification. Disable outbound redirects and avoid untrusted DNS rebinding. No client-supplied forwarded host/address is an authorization input. Configuration errors fail closed; no fallback to standalone auth.
- Each allowlisted route maps to a fixed Health internal endpoint. BFF forwards a minimal allowlist of headers and a bounded raw request body, and strips hop-by-hop, forwarding, authentication, cookie and client identity headers. Sensitive responses must not be stored in shared caches. Enforce timeout and request size limits; do not automatically retry non-idempotent operations.

### 4.2 Assertion format

Candidate: compact JWS, `alg=ES256`, `typ=beyu-health-request+jwt`, with an environment-specific `kid`. Health pins an explicit trusted public-key set and rejects `none`, other algorithms, unknown `kid`, external key URLs and malformed/duplicate claims. Transport mTLS and JWS signature are both mandatory. Exact environment-specific issuer and audience are configured on both sides, not inferred from Host. Proposed payload:

| Claim | Required value and validation |
| --- | --- |
| `iss`, `aud` | Exact configured BEYU BFF issuer and Health internal API audience; reject mismatches and cross-environment use. |
| `sub` | Canonical BEYU user ID from the validated server session, not a browser value. |
| `tenant` | Canonical selected tenant ID from validated server-side context; Health resolves it to its active tenant row using `beyu_tenant_id`. |
| `iat`, `nbf`, `exp` | Numeric UTC seconds; maximum `exp - iat` **30 seconds**, permitted clock skew **5 seconds**. Reject future or expired assertions beyond skew. These are proposed limits for approval, not current behavior. |
| `jti` | Cryptographically random at least 128-bit unique ID; atomically consumed once by Health. |
| `method`, `target` | Uppercase HTTP method and exact normalized internal route including canonical query; Health recomputes and compares. The canonicalization algorithm and permitted query parameters must be specified and tested for each route before enablement. |
| `body_sha256` | Base64url SHA-256 of the exact transmitted body bytes, including the empty body. Health recomputes before processing; prohibit intermediary body transformation. |
| `correlation_id` | Opaque server-generated identifier for audit correlation, not an authorization input. |

The assertion contains no role, permission, clinical data, email, session cookie, refresh token or arbitrary browser-supplied scope. The candidate intentionally does not assert an entity/country as authority: Health resolves these from the mapped tenant and authoritative grants, and denies ambiguous or absent boundaries. Any selected entity must be validated by both services against authoritative scope. Assertion lifetime is not a replacement for session or permission revocation checks.

### 4.3 Replay and failure semantics

Health atomically records `(issuer, jti)` in a shared, durable replay store before invoking the operation, retaining it through `exp + skew` plus an operational safety margin. Multiple replicas must share the same store and uniqueness constraint. Inability to record/check replay fails closed, including read-only requests. A consumed assertion remains consumed if downstream work fails; a retry requires a newly authorized BFF request and new assertion. For mutations, client-visible idempotency keys require a separate scoped, server-enforced operation contract; a new assertion alone does not make a retry safe.

Externally: no live BEYU session → `401`; verified session but insufficient authorization → uniform `403`; unknown/invalid tenant domain follows existing uniform denial behavior; dependency, configuration, replay-store or Health outage → sanitized `503`; invalid input → `400`; limits → `413` or `429`. Avoid revealing whether an identity, tenant or link exists. No fallback to another tenant, OS, local credential or cached authorization on error. Internal logs may distinguish sanitized denial reasons under access control.

## 5. Authorization, identity and revocation

- The BFF revalidates the BEYU session, user, selected tenant and relevant grants on each request. Session revocation, expiry and account suspension take effect on the **next BFF request**, assuming the authoritative BEYU store is reachable; unavailability denies rather than using stale authorization.
- Health independently verifies the active link for `sub`, Health account status, unique active tenant mapping, active Health membership, and operation-specific RBAC/ABAC and RLS dimensions on **every** request. It must also check canonical tenant/account lifecycle from an authoritative, least-privilege server-side source on each request. Health's existing bounded-stale cache is not sufficient for this proposed stricter flow unless owners explicitly approve different semantics.
- Target propagation: changes effective on the next request after their authoritative database transaction commits; concurrent in-flight requests that already passed checks are not retroactively cancelled. Owners must approve this bound, clock assumptions and handling of long-running operations. Assertions are one use and at most 30 seconds, but cannot extend BEYU session authority.
- MFA and step-up: BFF must enforce existing BEYU operation-specific step-up and separation-of-duties policies before forwarding; Health must retain independent requirements. The approved endpoint matrix must specify each operation's requirements; missing policy denies. The assertion must not invent a Health role or translate client claims into authority.

## 6. Shared database, migration and role requirements

The shared-database direction does not permit applying the current Health runner to root `public.beyu_migrations`. A separately reviewed additive change must isolate the Health ledger from the root ledger, preserve all historical migration files and checksums, and prove fresh install, upgrade, mismatch, rollback and foreign-ledger refusal in disposable PostgreSQL. Owners must approve the exact ledger schema/location, migration ordering, ownership, runner changes and the path for existing environments before implementation. No migration runs automatically on startup or against production without separate approval.

Use separate non-owner, `NOSUPERUSER NOBYPASSRLS` BEYU and Health runtime roles and separate privileged migration channels. Review all grants end to end. Address migration 032's broad `users` SELECT with a new additive migration and column-level permissions or a narrowly scoped approved read interface; no runtime or federation role may read password hashes unless independently justified. Define scoped RLS context and controlled context setup with transaction-local settings and connection-pool reset. An active platform namespace base is not a tenant binding. No test superuser result substitutes for least-privilege RLS proof.

## 7. Key lifecycle, operations and audit

Provision separate per-environment mTLS credentials and JWS signing keys only through an authorized secret manager; public verification keys are distributed through a configured trusted channel, not an assertion-provided URL. Review rotation with overlapping old/new verification keys, issuer/recipient identity, emergency key revocation, compromised-key incident handling, certificate expiry, clock monitoring, service identity revocation and immediate fail-closed behavior if trust material is unavailable. Do not log credential material. Alert on repeated denials, replay, key errors, unusual tenant transitions and audit-delivery failures; define an operational escalation and retention policy before launch.

## 8. Acceptance tests and release gate

Run with a real disposable PostgreSQL and actual constrained roles and separately running BFF and Health backend. Required evidence:

- Valid active BEYU session, link, mapped active tenant and membership yields only explicitly authorized Health operations. Exercise direct and central entry, canonical and legacy mounts, and tenant-host paths.
- Missing/revoked/expired session or link; disabled account, pending/suspended tenant, absent or foreign membership; wrong OS/domain/entity/country; missing permissions, consent or step-up: deny with no data leakage. Test tenant A trying to read, write and export tenant B's data and prove both allowed and denied RLS cases.
- Invalid/missing mTLS identity, wrong issuer/audience/environment/key/algorithm, altered method/path/query/body, expiry, skew, duplicate `jti`, concurrent replay across replicas, unavailable replay store and authorization dependency outages all deny. Test session/link revocation on the next request, logout, key rotation and compromised-key rollback.
- CSRF, Host and forwarded-header spoofing, untrusted origin, SSRF, redirect, traversal, body-size and timeout handling, tenant switching, idempotency and audit redaction. Confirm browser receives neither Health credentials nor privileged secrets and no protected response is cached.
- Fresh-install and upgrade migrations on disposable shared DB, ledger collision guard, checksums and actual role grants including no password-hash access; Health and root regression suites, browser workflow, Health `/health` denial, SPA compatibility and server-side API authorization. Document skipped tests and their consequences.
- Stage in an isolated non-production environment only after approval. A release owner separately approves backend deployment, database migrations, identity links, tenant bindings, secrets, network policy and rollback after reviewing evidence. Production is not authorized by this draft.

## 9. Approval record — pending

| Decision | Accountable reviewer | Approval / evidence |
| --- | --- | --- |
| Draft contract for implementation and non-production testing | Accountable owners | Requester confirmed owner approval in session; named approval artifacts not provided |
| BFF, assertion and mTLS implementation details; threat model | Identity and security owners | Deferred endpoint and operational decisions remain pending |
| Health API authorization, MFA, tenant/entity mapping and revocation bound | Health and data-governance owners | Pending |
| Shared DB ledger placement, migration sequence and minimum grants | Database and platform owners | Pending |
| Endpoint allowlist, canonicalization, replay-store and operations design | Engineering and security owners | Pending |
| Independent testing and non-production integration | QA, Health and security owners | Pending |
| Production deployment and individual migrations/links/bindings | Authorized release owner | Separate future approval |

Until the deferred decisions and successful verification are complete, preserve the no-rewrite and standalone-auth fences. The proposal is not a claim of operational Health integration.
