# Public homepages reconciliation (2026-11-18)

Baseline: main `d6366d09cd1e7053aabd8ccaf7781049f23a7d18`, merge of PR #126. The new anonymous root presentation is distinct from `/sign-in`; authenticated entry continues through existing server-side redirect/denial decisions. Exact canonical host resolution, proxy, sign-in, tenant registry, Health mount and migrations are unchanged. Unknown and preview hosts do not select destination homepages. Hostnames select presentation, not permissions.

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

Do not exchange a BEYU cookie for a sector token without approved design. A proposed design for review should define issuer/audience, mutually authenticated server-to-server exchange, active server-verified identity links and tenant membership, minimal scoped short-lived credentials, replay prevention, rotation and revocation, audit, error handling and fail-closed behavior. Tokens must never appear in URLs or be derived from client-provided identity. This is a review checklist, not an implemented protocol.

## Environment and evidence limitations

Local production-build anonymous HTTP checks reached eight homepage identities, destination sign-in, neutral host and foreign-origin rejection; this is not DNS, Vercel, authenticated workspace, real tenant, browser accessibility or production verification. Disposable local migrations and seed do not establish the migration state of any real environment. The local runtime role lacked access to `users` during authenticated HTTP testing; the resulting failing/skipped tests are not evidence of successful authentication or RLS. Health backend deployment, `HEALTH_API_URL`, service-token configuration, migration/role state, active identity links, verified tenant bindings, external credentials and federation approval require authorized human verification. Never apply migrations, provision identities or change production configuration solely on the basis of this document.
