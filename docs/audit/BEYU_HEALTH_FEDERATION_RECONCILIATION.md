# BEYU–Health federation reconciliation: stopped at security gate

## Verified baseline

| Item | Observed state |
| --- | --- |
| Main | `d6366d09cd1e7053aabd8ccaf7781049f23a7d18` |
| PR #120 | Open draft, head `70660a881946b63b36691c85e2473749650d49c2`; GitHub base `dc8f848226ed8860ef293f817fe10394360abb1d`; mergeability `CONFLICTING` |
| PR #127 | Open draft, inspected head `fad4cf2a359309a518fe00587d838532135c4545`; base main; GitHub mergeability `MERGEABLE` |
| Local history | Shallow checkout: PR #120 and current main have no locally available merge-base; do not infer unrelated project history from this. GitHub reports PR #120's base SHA separately. |
| PR #120 CI | Root PostgreSQL gate, Health backend gate, P3 governance and root critical-dependency audit report failure. Scratch migration and Health frontend report success. Production steps skipped. Preview failed due to Vercel deployment limit. |
| PR #127 CI | Root and Health PostgreSQL gates were in progress at inspection; scratch migration, Health frontend and critical dependency audits reported success; production stages skipped; Vercel reported preview Ready. These are not production or bridge evidence. |
| Reviews | Neither PR reported a GitHub review decision or review. No user-created branch changes were present locally at inspection. |

## 1. PR #120 inventory

The draft contains `src/app/api/v1/health/authorization-assertion/route.ts`, `src/lib/health-authorization-assertion.ts`, Health `beyu-authorization-assertion.service.ts`, `auth.controller.ts` and `auth.service.ts`, Health middleware/session changes, frontend assertion exchange code and Health migrations 046–048. It introduces a Health-local `authorization_assertion_replays` table and an Ed25519 assertion with `iss`, `aud`, `sub`, `sid`, `tenant_id`, `iat`, `exp` and `jti`. Its documentation describes a Health-local store and a separate database boundary; frontend code receives the assertion and Health access token. It retains the standalone credential fence. There is no corresponding root Next.js Health rewrite in its `next.config.ts`.

## 2. PR #127 inventory

This PR contains public-homepage changes, `src/lib/health/pilot-request-binding.ts` (unused GET fixed-path raw-target binding), `sectors/health/backend/src/modules/identity/health-request-replay.ts` (unwired insert primitive), related isolated tests, a proposed BFF/mTLS ES256 request-bound contract, and baseline/threat-model documents. It creates no exchange route, Health session, replay migration, Health backend proxy or federation frontend. Its existing root link gate reads `beyu_identity.beyu_identity_links` through the root DB and requires an active row. The requester selected shared PostgreSQL as a direction but actual production topology, isolated ledger location and least-privilege grants remain unverified.

## 3. Overlap and conflicts

Both PRs change `sectors/health/INTEGRATION.md` and `sectors/health/backend/DEPLOYMENT_CONTRACT.md`; conceptually they overlap on assertion exchange, identity-link policy, session issuance and replay storage. PR #120's migration 046 proposes `authorization_assertion_replays`, while #127's unwired primitive targets `health_request_replay`; creating both as competing replay stores would duplicate security state. The PRs have different assertion algorithms, issuance channels, exposure and binding semantics: browser-visible Ed25519 on #120 versus server-side, mTLS and request-bound ES256 proposal on #127. A generic copy or cherry-pick would silently change the approved trust boundary.

PR #120 contains `drizzle/0076_idempotency_principal_rls.sql`, whereas current main already contains `drizzle/0076_multi_company_management.sql` and migrations through 0082. Migration ordering and journal reconciliation are not established; do not renumber/edit historical applied migrations or copy the old PR's root migration into main without a reviewed forward-only plan. Health 046–048 also require independent review against current 001–045.

## 4. Security findings requiring resolution

- **Required BEYU authorization not demonstrated at issuance (high-risk gap).** In PR #120, the assertion route calls `resolvePrincipal()` and then signs. The shown signer checks principal identifiers; neither shown function calls the required Health grant or active Health-link gate. Health-local membership validation is not equivalent to a BEYU Health grant. This is source inspection, not an exploit demonstration; independent review and actual denial tests are required before use.
- **Current root gate mismatch.** PR #120's `checkHealthOSAuthorization` returns `AUTHORIZATION_SERVICE_UNAVAILABLE` unconditionally, whereas PR #127 queries active links from the root database. The former cannot establish the requested mount behavior; the latter depends on shared-database link access and least privilege. Neither is an approved substitute for full operation authorization.
- **Protocol conflict.** PR #120 issuer claims do not contain a nonce or method/path/body request binding; its frontend receives the assertion and its Health session returns an access token. PR #127's draft says browser-hidden, mTLS request-bound assertions. PR #120's code does not establish the requested original raw-target validation. Reconcile before implementation or activation.
- **Session and refresh mismatch.** PR #120 issues a short-lived local access session and explicitly discards a generated refresh secret; renewal requires a new BEYU assertion. That is not the requested federated refresh rotation/reuse lifecycle. No end-to-end BEYU-session revocation bound is proven.
- **Atomicity, RLS and readiness are not established.** PR #120 consumes replay and then creates a session and audit event across separate operations in the shown code; failure behavior and durable audit need real tests. Database grants, scoped resolver and Health local membership need independent non-owner review, including cross-tenant/entity/country cases. GitHub failing gates and conflicts prevent treating it as verified.

## 5. Reconciliation decision and outstanding approvals

**No single implementation is declared authoritative yet.** Preserve current fail-closed runtime behavior, standalone fence and both unmerged PR histories. Retain PR #120 as a candidate source for a reviewed Health-local verifier/session design, and PR #127's tests and offline binding primitive as candidate evidence only; neither is activated. The candidate replay stores, protocol and session models must not coexist as separate authoritative flows. No PR #120 code has been copied and no migrations or runtime grants added here.

The accountable owners must choose and record:
1. A single reviewed architecture compatible with shared PostgreSQL and the existing BEYU session/link gates, including whether assertions ever reach the browser, mTLS and verified raw-target handling, exact algorithm/key lifecycle, nonce and session binding.
2. Which existing PR owns the exchange/session/replay code; how to integrate relevant changes without overwriting PR #120 or duplicating endpoints or stores. Resolve its main conflicts and create a forward-only migration plan without modifying existing checksums.
3. Health ledger schema, migration ownership/search path, replay table location, narrow runtime grants and upgrade procedure; prove them using real non-owner roles and scratch PostgreSQL.
4. Exact BEYU grant, identity-link, Health membership, tenant/entity/country, MFA, session freshness and audit requirements, including failure and revocation bounds.

These are architecture/security stop conditions, not production approval. After decisions, implement one flow, independently test all mandatory authorization, replay/concurrency, tenant isolation, browser/HTTP and outage cases, then obtain a separate human merge and production release decision.
