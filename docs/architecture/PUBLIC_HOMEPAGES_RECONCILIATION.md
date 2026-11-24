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

Local production-build HTTP tests exercised the central and seven destination roots, sign-in, hostile hosts, and both Health mount paths. An authenticated HTTP run used a separately seeded disposable PostgreSQL database and restricted runtime role: destination and tenant-domain tests passed, with one test skipped. These tests do not verify real DNS, deployed tenant bindings or production configuration.

A local Chromium run maps the canonical test names to loopback, never to production, and checks all eight homepages at ten widths in two viewport orientations, menu keyboard operation, sign-in and overflow. It captures screenshots in the ignored Playwright output directory. This is not complete visual, contrast, screen-reader, or deployed-preview acceptance. The host-resolver test configuration explicitly rejects non-loopback test servers.

A fresh local PostgreSQL 16 database was migrated through 0083 and seeded. Six tenant, membership, RLS and Health replay suites passed 106 tests, including replay concurrency and runtime-role checks. A separate prior run was invalid because the test DSN variables were empty; those failures must not be used as product evidence. Migration 046 is a proposed, unwired Health replay store, not a functioning federation: runtime grants and cleanup are not provisioned. Its rollback deliberately fails closed and the migration-ledger location for shared PostgreSQL still requires database-owner review. No production migration was run.

**Acceptance gap:** authenticated destination denial is presently rendered with HTTP 200 at `/` and `/sign-in` (the protected workspace remains separately gated). This does not satisfy the requested HTTP 403 denial contract. Existing HTTP tests currently assert that behavior; they must be revised along with a correct status-preserving implementation rather than weakened. Registered-tenant browser-to-workspace flow, full classification/country negative matrix, preview interaction and visual accessibility remain incomplete. Health backend deployment, active identity links, tenant bindings, federation approval and production readiness require separate authorized review. Never apply migrations, provision identities or change production configuration solely on the basis of this document.

## Acceptance matrix — local evidence, not production approval

| Area | State | Evidence and remaining boundary |
| --- | --- | --- |
| Central and seven destination public roots | PASS (local) | `tests/sector-domains/public-homepages-http.test.ts`: 9 passed against a local production build with simulated Host values. Actual DNS/deployment not tested. |
| Anonymous separation and Health mounts | PASS (local) | Same HTTP suite; no anonymous password inputs at public roots, both Health paths denied or redirected. |
| Central and direct authenticated entry | NOT TESTED (complete journey) | Destination HTTP suite exercises shared sessions, destination redirect/denial and cross-host checks; it does not prove every identity/OS/workspace combination or full click-through journey. |
| Registered tenant pathway | NOT TESTED (complete journey) | Local tenant-domain HTTP API and real PostgreSQL lifecycle tests passed; a verified tenant domain through browser authentication to workspace remains unproven. |
| RLS / membership / tenant registry | PASS (targeted local PostgreSQL) | `tests/tenant-domain/{tenant-domain-registry,family-office-capability-domain,canonical-namespace-alignment}.test.ts`, `tests/security/{rls-isolation,membership-lifecycle-rls,health-request-replay}.test.ts`: 106 passed on disposable PostgreSQL 16. Broader entity/country/classification matrix remains incomplete. |
| Destination denial status | FAIL | Authenticated denied destination landing renders 200, not the required 403; workspace authorization remains independent. |
| Health federation | BLOCKED | Exchange, Health-owned sessions and runtime provisioning are not operational or approved for production; public homepage independent. |
| Browser responsive smoke | PASS (local) | `tests/browser/destination-homepages.spec.ts`: 8 passed against loopback-mapped names and local production build; all requested widths and both orientations checked for horizontal overflow. |
| Accessibility / visual acceptance | NOT TESTED (complete) | Menu keyboard smoke and landmark/title assertions pass. Contrast, screen reader and human comparison to approved reference are outstanding. |
| CI on latest head | NOT TESTED until new-head checks complete | Check GitHub Actions for the exact PR head; previous root CI failed on stale Health migration labels. Corrected labels retain the source-derived regression test. |

The browser run and PostgreSQL/HTTP evidence above were obtained against the local working tree based on `46903d161ecfcf3b22c7fd9ee5d6e2037b7a598c` with the acceptance fixes in this change. CI must independently run on the final commit; a local result is not a CI result.

Additional observation from the authenticated local HTTP run: an out-of-scope Foundation workspace request logged a `FoundationError` from the independently enforcing domain service while the framework was rendering the page/layout. The service refused the read, but the resulting error handling and HTTP status must be reproduced and reviewed; do not infer a successful authorized Foundation workspace journey from the broad redirect/denial checks. The same server logged a node-postgres concurrent-query deprecation warning. Neither was corrected or accepted as risk here.

Public entry links now compose the destination hostname root when a canonical domain is configured; deep-link cross-host routing retains its protected destination path. With no configured canonical domain, existing relative workspace fallbacks remain. Updated local production-build focused run: 85 passed, 1 skipped; Chromium: 8 passed. These results precede the final commit and do not substitute for fresh GitHub checks.

### Follow-up: Foundation SSR and accessibility

- **PASS (local HTTP/PostgreSQL):** Foundation page components now independently resolve the canonical target scope before dashboard reads because Next layouts and pages can execute concurrently. Domain-service and API authorization remain in place. The dashboard reads use the same transaction sequentially. `tests/foundation/http.test.ts` checks an out-of-scope sector operator on the dashboard, programs and operations; the authorized director remains covered. The combined Foundation target-scope, Foundation HTTP, destination sign-in, tenant-domain HTTP and public-homepage HTTP run passed 76 tests with one skip against the local production build and disposable PostgreSQL 16. Foundation page denials still return 200; this is not a 403 fix. The server continued to log a node-postgres concurrent-query deprecation elsewhere; its source is not established.
- **PASS (local automated accessibility):** `tests/browser/homepage-accessibility.spec.ts` runs axe WCAG 2 A/AA and 2.1 A/AA rules at 390×844 on all eight public homepages. Initial run found color contrast and a prohibited ARIA attribute. Shared link color specificity, directory text contrast and hero image semantics were corrected; all eight axe checks and eight responsive browser tests passed together against the production build with loopback-mapped hosts. Automated rules do not establish WCAG conformance; desktop contrast states, keyboard journeys, screen-reader and human visual review remain outstanding.
- **FAIL (destination 403 contract):** An experimental Next `forbidden()` implementation produced HTTP 403 but the server HTML was an error shell rather than the governed denial; the denial appeared in the streamed client payload. It was reverted rather than replacing the server-rendered denial or weakening its assertions. A status-preserving, server-rendered solution and regression tests remain necessary.
- **PASS (GitHub CI at previous head only):** `7708899ec1d2700e71fc60968a1f8a577480eaaf` passed the root and Health PostgreSQL gates, scratch migration validation, secret scan, Health frontend, governance and dependency checks, plus Vercel. Production jobs and Supabase preview were skipped. These results do not apply to later commits; rerun on the final PR head.
