# Health user-session federation — security decision request

**Status: IMPLEMENTATION AND NON-PRODUCTION TESTING APPROVED BY REQUESTER / NOT IMPLEMENTED.** The requester confirmed accountable-owner approval of the draft contract, selected a shared PostgreSQL database and retained BEYU as sole identity authority. The concrete deferred endpoint, replay and topology details in [HEALTH_FEDERATION_CONTRACT_DRAFT.md](HEALTH_FEDERATION_CONTRACT_DRAFT.md) remain to be resolved. Neither document authorizes deployment, identity links, production migrations, or a change to the standalone-auth fence. Review against current code before implementation. Existing PR #127 is a public-homepage change, not proof that Health SSO works.

## Evidence and the actual boundary

1. `src/app/os/health/mount.ts` checks a BEYU session, rejects foreign OS hosts, resolves and restricts the tenant namespace, then calls `checkHealthOSAuthorization(principal.userId)` before returning the Health SPA. The active link is an **entry prerequisite**, not a sector token and not proof of a Health tenant membership, role, or permission. `/health/os` uses the same mount. Missing/revoked/expired links and unavailable link infrastructure fail closed (`src/lib/health-os-authorization.ts`).
2. The mounted SPA uses `sectors/health/src/services/auth.ts`: it attempts `/health-os/auth/*`, keeps an access token in memory and uses a refresh cookie. `next.config.ts` deliberately contains **no** Health backend rewrite. `HEALTH_API_URL` is not read there; setting it alone cannot enable the flow.
3. `sectors/health/backend/src/modules/auth/standalone-auth.fence.ts` and `auth.controller.ts` refuse standalone registration, login, refresh and restore in production. The test-only exception must not be used for deployment. The BEYU user session is not exchanged for a sector session anywhere in this flow.
4. The Health-to-BEYU service identity register/lookup contract in `sectors/health/backend/DEPLOYMENT_CONTRACT.md` is a **service-to-service identity registry operation**, not authentication of a BEYU browser session. Its service token must not be repurposed as a user assertion. Health's existing JWT strategy validates its own configured issuer, audience and expiration; this does not mean it accepts BEYU sessions.
5. Database topology remains unresolved. The deployment contract records a shared-database migration-ledger collision and missing least-privilege grants; with a separate database the root link lookup has no approved cross-database read path. Existing documents disagree on topology. Neither option is approved by this proposal. Actual production deployment, migration state, links and settings were not inspected.

## Decision requested

Architecture, identity/security, Health service and data-governance owners should jointly approve **one** runtime trust boundary and the database/ledger topology before implementation. Recommended direction for evaluation: a same-origin backend-for-frontend (BFF) mediates Health requests, validates the BEYU session server-side and communicates with Health over an authenticated, encrypted service channel; any user assertion is short-lived, purpose- and audience-bound, and issued and validated under a **new, separately reviewed contract**. Keep sector credentials and assertions off the browser and out of URLs. This is a design candidate, not an existing endpoint, approved protocol, or permission to reuse secrets. An alternative using a sector-issued session requires an equally explicit review of browser token, refresh, CSRF and revocation exposure. Retaining the current fail-closed boundary is the default if no option is approved.

### Required design decisions before coding

- **Identity and authentication:** bind the assertion only to a server-resolved, live BEYU principal and session, never to a browser-provided user ID or hostname; specify MFA/step-up, session age and account lifecycle requirements. Revalidate on exchange and define per-request or bounded revalidation.
- **Tenant and authorization:** establish a server-validated canonical-to-Health tenant mapping and active membership; validate namespace, tenant, entity, country, classification, consent and relevant policy against authoritative services. Health must independently authorize each operation and enforce its RLS context; an active identity link or hostname alone is never authority. Define handling of multiple memberships and tenant switching.
- **Trust and credentials:** decide exact transport, mutually authenticated service identities, issuer/audience, asymmetric signing or equivalent key separation, key discovery/rotation, clock skew, assertion lifetime, scopes and recipient validation. Explicitly reject algorithm confusion, wrong issuer/audience, expired/not-yet-valid assertions, untrusted service callers and cross-environment replay. Do not reuse the Health-to-BEYU service secret or turn a BEYU cookie directly into a Health JWT.
- **Replay and browser security:** specify one-time identifiers and atomic replay protection, concurrency/idempotency, no credential in URL/logs/referrers, CSRF and origin checks, cookie scope and fixation protections. Decide whether Health refresh sessions exist at all and how they bind to the BEYU session.
- **Lifecycle:** define maximum revocation propagation times and outage behavior for session logout/revocation, user suspension, identity-link revocation/expiry, tenant suspension, membership or permission changes, and key compromise. Fail closed when an authoritative decision cannot be established; do not silently rely on an unbounded stale cache. Specify safe retry and clock behavior.
- **Audit and privacy:** record decision, actor, service, tenant, scope, correlation ID, outcome and reason without tokens, secrets or clinical data; specify retention, tamper protection and incident response. Avoid account and tenant enumeration on denial.
- **Topology and privilege:** resolve the ledger collision and identity-link availability for the chosen topology. Define non-owner, non-superuser, no-bypass-RLS runtime roles, least-privilege columns, separate migration credentials and a governed read path if databases are separate. Never edit historical migrations.

## Acceptance evidence required before activation

1. Reviewed threat model, trust-boundary diagram, precise wire and error contract, key lifecycle, revocation SLA, data-flow/tenant mapping, authorization and RLS design, rollback and named approvals. Approval to implement does not itself approve production release.
2. Real-service tests using disposable infrastructure: successful linked active user in the correct active tenant; unknown, revoked, expired or unavailable link; inactive user/session/tenant/membership; cross-tenant and wrong-OS requests; missing permissions and step-up; altered identity/scope; wrong service, issuer, audience, key, algorithm and environment; replay, expiry, rotation and logout. Verify deny on database/identity/Health outages and no sensitive data or tokens in logs/URLs.
3. Tests covering both Health mount routes and `/health` denial, browser CSRF/origin and session fixation, API-level authorization independent of the mount, database RLS under actual non-owner roles, concurrent exchanges and cache/revocation timing. Exercise token/session rollback and fail-closed recovery.
4. A separately authorized release plan: inspect real deployment readiness, migrations and role grants read-only; provision only after explicit approval; test verified domain bindings, linked identities and end-to-end flow in an isolated non-production environment; record observability and rollback evidence before any production change.

## Approval record (to be completed by accountable humans)

| Decision | Owner | Status / evidence |
| --- | --- | --- |
| User-session trust boundary and threat model | Identity/security and Health owners | Pending |
| Database topology, migration-ledger isolation and least privilege | Database and platform owners | Pending |
| Tenant/clinical authorization and revocation policy | Health and data-governance owners | Pending |
| Implementation and non-production test plan | Engineering and security owners | Pending |
| Production deployment, bindings, identities and migration release | Authorized release owner | Pending; separate approval |

Until these decisions and implementation evidence exist, preserve the existing no-proxy and standalone-auth fences. Do not claim seamless BEYU-to-Health sign-in.
