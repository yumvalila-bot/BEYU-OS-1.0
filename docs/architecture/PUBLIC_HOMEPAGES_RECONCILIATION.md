# Public homepages reconciliation (2026-11-18)

Reconciled against main `d2de74455ae0459690a5a8bbd3ee43379cf631bc` with a non-rewriting merge. PR #126 routing, PR #129 central homepage and governed publishing, PR #130 Codespaces workflow, and PR #131 scanner improvements are preserved. The anonymous destination root is distinct from `/sign-in`; authenticated entry continues through existing server-side redirect/denial decisions. The one canonical host resolver, proxy, sign-in, tenant registry and Health mount remain in use. Unknown and preview hosts do not select destination homepages. Hostnames select presentation, not permissions. Main's migrations 0082 and 0083 are untouched; this PR also contains a proposed, unwired Health replay-table migration 046, which has not been applied to production and requires separate review and provisioning.

| Surface | Anonymous root after change | Sign-in | Workspace / dependency |
| --- | --- | --- | --- |
| BEYU apex/www | Institutional homepage | `/sign-in` | existing control plane |
| Health | Health homepage | `/sign-in` | `/os/health`; separately deployed Health backend and identity link required |
| Finance | Finance homepage | `/sign-in` | `/os/finance`; financial authorization and posting controls remain |
| Agriculture | Agriculture homepage | `/sign-in` | `/os/agriculture`; existing service and data controls |
| Ujenzi | Ujenzi homepage | `/sign-in` | `/os/ujenzi`; existing service and data controls |
| Foundation | Nonprofit homepage | `/sign-in` | `/os/foundation`; entity authorization |
| Family Office | Capability homepage | `/sign-in` | `/os/family`; confidentiality and authorization |
| NOELIA | Governed intelligence homepage | `/sign-in` | `/os/noelia`; human oversight |

A destination homepage is institutional copy, not evidence of operational feature readiness. Tenant-domain binding and membership paths are existing mechanisms, not newly provisioned or verified production tenants. Registered tenant homepage and end-to-end tenant isolation require separate execution against representative verified, inactive, suspended and unknown bindings.

## Health federation review boundary

Do not exchange a BEYU cookie for a sector token without approved design. A proposed design for review should define issuer/audience, mutually authenticated server-to-server exchange, active server-verified identity links and tenant membership, minimal scoped short-lived credentials, replay prevention, rotation and revocation, audit, error handling and fail-closed behavior. Tokens must never appear in URLs or be derived from client-provided identity. This is a review checklist, not an implemented protocol. The detailed pending decision and acceptance criteria are in `docs/security/HEALTH_SESSION_FEDERATION_DECISION.md`. Current root configuration has no Health backend rewrite; `HEALTH_API_URL` alone does not enable one, and standalone credential issuance is fenced in production.

## Environment and evidence limitations

After the main merge, a local production build and anonymous HTTP suite verified the central and seven destination root presentations, each destination's sign-in, a hostile lookalike host, and anonymous denial/redirect on both Health mount paths (9 tests). These simulated Host headers do not verify DNS, Vercel, authenticated workspaces, real tenant bindings, browser accessibility or production. A Playwright suite covers the requested viewport sizes and mobile menu, but browser execution in this sandbox was blocked by missing Chromium system libraries; it must pass in CI or a prepared Codespace before release. Disposable local migrations and seed do not establish the migration state of any real environment. The local runtime role lacked access to `users` during authenticated HTTP testing; the resulting failing/skipped tests are not evidence of successful authentication or RLS. Health backend deployment, `HEALTH_API_URL`, service-token configuration, migration/role state, active identity links, verified tenant bindings, external credentials and federation approval require authorized human verification. Never apply migrations, provision identities or change production configuration solely on the basis of this document.
