# Health backend federation — outstanding integration contract

**Status: BLOCKED, not implemented or certified.** Owner: BEYU identity/security and Health architecture owners. This contract describes decisions and acceptance criteria; it does not authorize a new provider, key, endpoint, runtime secret or deployment.

The existing `IDENTITY_FEDERATION.md` describes a historical sector-to-root service identity/link and lifecycle integration. Its historical certification is not proof that a root browser session is a Health backend credential. The root's mounted frontend is gated by the BEYU session and existing Health identity authorization, but `next.config.ts` has no Health backend API rewrite and standalone Health login/refresh are fenced. The existing backend uses separate bearer credentials. There is no implemented BEYU-to-Health human token exchange in this branch.

## Decisions required before implementation

1. Identity owners choose the authoritative human-token issuer, supported federation standard, trust anchors, allowed audiences and deployment topology. Health owners approve which component verifies the assertion and issues or accepts any sector credential; decide whether and how a same-origin backend proxy is exposed.
2. Agree on immutable GlobalUserID ↔ Health user mapping, tenant, entity and country mappings, treatment of ambiguous or missing links, role/permission ownership, and current classification and policy enforcement. An unlinked, ambiguous or disabled identity must fail closed.
3. Define an explicit assurance contract for authentication time and MFA/step-up: Health must never infer MFA from the mere existence of a BEYU session. Define short maximum token lifetime and valid clock skew.
4. Define replay protection, single-use exchange identifiers or equivalent, key rotation and trust-store refresh, revocation propagation and freshness, logout and session invalidation across both systems, audit ownership and outage behavior. No local cookie or service token may impersonate a human.
5. Provide approved nonproduction issuer, audience, key rotation and isolated test infrastructure; secret values are operator-managed and must never be recorded in repository artifacts or test logs.

## Minimum acceptance evidence

Exercise real HTTP against isolated databases and genuine configured issuer/verifier components: valid login and mapped workspace; incorrect issuer/audience, signature, algorithm, expiry, not-before and rotated key; replay and unlinked/conflicting tenant/entity/country; missing/stale MFA; user/session/grant revocation and logout; dependency outage, audit persistence failure, unauthorized direct backend requests, and cross-host cookie behavior. Confirm fail-closed responses and non-disclosure. Record exact commits, configuration *names only*, commands and results. Do not claim end-to-end SSO from browser navigation alone.
