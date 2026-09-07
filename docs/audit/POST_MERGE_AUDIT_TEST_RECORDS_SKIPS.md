# BEYU OS — Post-Merge Audit: Per-Test Records (SKIP-001 … SKIP-125)

**Source:** authoritative no-server baseline `npx vitest run --reporter=json` on the audited HEAD with a live, fully migrated, seeded database (application server down). Recorded 2026-09-07. The same 125 skipped tests, identical identity, pre- and post-audit-fix runs (verified set equality of prev vs final JSON).

**Guard mechanism:** every skipped test sits in an HTTP/E2E suite guarded by `it.skipIf(!serverAvailable())` (`tests/helpers/http.ts`), where `serverAvailable()` probes `BEYU_TEST_BASE_URL`. The guard exists so the pure-engine CI path (no server) does not fail. With the application server started (`npx next start -H 127.0.0.1 -p 3100`, `BEYU_TEST_BASE_URL=http://127.0.0.1:3100`), **all 125 tests execute and pass** — full HTTP run on the same HEAD: 133 files / 2549 tests / 0 failed / 0 skipped.

**Classification legend (A–F):** A = production-code defect (fixed in repo); B = test-suite defect (fixture/schema/assertion; fixed in repo); C = repository-controllable runtime/environment gate (passes when the in-repo server is started); D = metadata/governance/seed drift (fixed in repo); E = external blocker outside repository control (EXT-001…004); F = documentation/claim mismatch (no code change).

**Classification:** all 125 = **C** (no unit-level defect; each is an HTTP round-trip test exercised by the HTTP full run). Disposition: **NO ACTION REQUIRED — PROVEN PASSING (2549/2549 with server).**

| ID | File | Test (full name) | Class | Disposition |
|---|---|---|---|---|
| SKIP-001 | tests/api/validation-http.test.ts | shared production validation boundary > returns canonical 422 for Noelia Zod validation | C | Proven passing in HTTP run |
| SKIP-002 | tests/api/validation-http.test.ts | shared production validation boundary > returns canonical 422 for canonical resolutions Zod validation | C | Proven passing in HTTP run |
| SKIP-003 | tests/certification/scale-concurrency.test.ts | Level III-A — concurrent request load > 1000 health requests at c=200 return all 200 and chains stay verifiable | C | Proven passing in HTTP run |
| SKIP-004 | tests/certification/scale-concurrency.test.ts | Level III-A/B — concurrent authentication load > 120 login requests (unique accounts, c=30) → all 401, no 5xx, no deadlock, no connection exhaustion | C | Proven passing in HTTP run |
| SKIP-005 | tests/finance/capital-governance-http.test.ts | capital governance authorization over HTTP > rejects an unauthenticated request with 401 | C | Proven passing in HTTP run |
| SKIP-006 | tests/finance/capital-governance-http.test.ts | capital governance authorization over HTTP > transitions a governed capital request to GOVERNANCE_AUTHORIZED | C | Proven passing in HTTP run |
| SKIP-007 | tests/finance/capital-governance-http.test.ts | capital governance authorization over HTTP > denies a principal without finance:capital.manage with 403 | C | Proven passing in HTTP run |
| SKIP-008 | tests/finance/capital-governance-http.test.ts | capital governance authorization over HTTP > gives a cross-tenant caller no existence oracle | C | Proven passing in HTTP run |
| SKIP-009 | tests/finance/capital-governance-http.test.ts | capital governance authorization over HTTP > returns 422 GOVERNANCE_NOT_SATISFIED when the resolution is not approved | C | Proven passing in HTTP run |
| SKIP-010 | tests/finance/capital-governance-http.test.ts | capital governance authorization over HTTP > returns 422 GOVERNANCE_NOT_SATISFIED when no resolution is linked | C | Proven passing in HTTP run |
| SKIP-011 | tests/finance/capital-governance-http.test.ts | capital governance authorization over HTTP > returns 409 ALREADY_DECIDED when already authorized | C | Proven passing in HTTP run |
| SKIP-012 | tests/finance/capital-governance-http.test.ts | capital governance authorization over HTTP > returns 422 INVALID_CAPITAL_STATE for a FUNDED request | C | Proven passing in HTTP run |
| SKIP-013 | tests/finance/capital-governance-http.test.ts | capital governance authorization over HTTP > returns 404 for a non-existent capital request | C | Proven passing in HTTP run |
| SKIP-014 | tests/finance/capital-governance-http.test.ts | capital governance authorization over HTTP > rejects forged governance fields with 422 | C | Proven passing in HTTP run |
| SKIP-015 | tests/finance/capital-governance-http.test.ts | capital governance authorization over HTTP > rejects an unknown field with 422 | C | Proven passing in HTTP run |
| SKIP-016 | tests/finance/capital-governance-http.test.ts | capital governance authorization over HTTP > replays an identical request without transitioning twice | C | Proven passing in HTTP run |
| SKIP-017 | tests/finance/capital-governance-http.test.ts | capital governance authorization over HTTP > rejects the same key with a different payload with 409 | C | Proven passing in HTTP run |
| SKIP-018 | tests/finance/capital-governance-http.test.ts | capital governance authorization over HTTP > §17 executes nothing over HTTP: no ledger, treasury or balance effect | C | Proven passing in HTTP run |
| SKIP-019 | tests/governance/authorization-http.test.ts | governance authorization signal over HTTP > rejects an unauthenticated request with 401 | C | Proven passing in HTTP run |
| SKIP-020 | tests/governance/authorization-http.test.ts | governance authorization signal over HTTP > returns an authorization signal for a governed capital request | C | Proven passing in HTTP run |
| SKIP-021 | tests/governance/authorization-http.test.ts | governance authorization signal over HTTP > reports NOT authorized for a rejected resolution | C | Proven passing in HTTP run |
| SKIP-022 | tests/governance/authorization-http.test.ts | governance authorization signal over HTTP > reports NOT authorized while the resolution is only VOTED | C | Proven passing in HTTP run |
| SKIP-023 | tests/governance/authorization-http.test.ts | governance authorization signal over HTTP > gives an out-of-scope caller no existence oracle | C | Proven passing in HTTP run |
| SKIP-024 | tests/governance/authorization-http.test.ts | governance authorization signal over HTTP > returns the same 404 for an in-tenant caller on a non-existent object | C | Proven passing in HTTP run |
| SKIP-025 | tests/governance/authorization-http.test.ts | governance authorization signal over HTTP > rejects a missing parameter with 422 | C | Proven passing in HTTP run |
| SKIP-026 | tests/governance/authorization-http.test.ts | governance authorization signal over HTTP > rejects an unknown objectType with 422 | C | Proven passing in HTTP run |
| SKIP-027 | tests/governance/authorization-http.test.ts | governance authorization signal over HTTP > denies a principal without the governance read capability | C | Proven passing in HTTP run |
| SKIP-028 | tests/governance/authorization-http.test.ts | governance authorization signal over HTTP > permits a read-only auditor to inspect governance authorization | C | Proven passing in HTTP run |
| SKIP-029 | tests/governance/authorization-http.test.ts | governance authorization signal over HTTP > mutates nothing: repeated reads leave the resolution untouched | C | Proven passing in HTTP run |
| SKIP-030 | tests/governance/authorization-http.test.ts | governance authorization signal over HTTP > inspects a resolution directly | C | Proven passing in HTTP run |
| SKIP-031 | tests/governance/decision-http.test.ts | decision mutation over HTTP > rejects an unauthenticated decision with 401 | C | Proven passing in HTTP run |
| SKIP-032 | tests/governance/decision-http.test.ts | decision mutation over HTTP > records a real decision for the presiding officer | C | Proven passing in HTTP run |
| SKIP-033 | tests/governance/decision-http.test.ts | decision mutation over HTTP > denies a member who lacks the approve capability with 403 | C | Proven passing in HTTP run |
| SKIP-034 | tests/governance/decision-http.test.ts | decision mutation over HTTP > denies a non-member of the body with 403 | C | Proven passing in HTTP run |
| SKIP-035 | tests/governance/decision-http.test.ts | decision mutation over HTTP > returns 422 NOT_READY_FOR_DECISION while voting is still open | C | Proven passing in HTTP run |
| SKIP-036 | tests/governance/decision-http.test.ts | decision mutation over HTTP > returns 409 ALREADY_DECIDED on a second decision | C | Proven passing in HTTP run |
| SKIP-037 | tests/governance/decision-http.test.ts | decision mutation over HTTP > returns 404 for a resolution outside the caller's scope | C | Proven passing in HTTP run |
| SKIP-038 | tests/governance/decision-http.test.ts | decision mutation over HTTP > defers rather than approving when quorum was never met | C | Proven passing in HTTP run |
| SKIP-039 | tests/governance/decision-http.test.ts | decision mutation over HTTP > rejects a forged outcome with 422 and decides nothing | C | Proven passing in HTTP run |
| SKIP-040 | tests/governance/decision-http.test.ts | decision mutation over HTTP > computes REJECTED from the ballots even when the caller wants approval | C | Proven passing in HTTP run |
| SKIP-041 | tests/governance/decision-http.test.ts | decision mutation over HTTP > rejects an unknown field with 422 | C | Proven passing in HTTP run |
| SKIP-042 | tests/governance/decision-http.test.ts | decision mutation over HTTP > R. replays an identical decision without deciding twice | C | Proven passing in HTTP run |
| SKIP-043 | tests/governance/decision-http.test.ts | decision mutation over HTTP > S. rejects the same key with a different payload | C | Proven passing in HTTP run |
| SKIP-044 | tests/governance/decision-http.test.ts | decision mutation over HTTP > T. concurrent decision requests decide exactly once | C | Proven passing in HTTP run |
| SKIP-045 | tests/governance/resolution-http.test.ts | governed mutation over HTTP > rejects an unauthenticated request with 401 | C | Proven passing in HTTP run |
| SKIP-046 | tests/governance/resolution-http.test.ts | governed mutation over HTTP > creates a real resolution for an authorised principal | C | Proven passing in HTTP run |
| SKIP-047 | tests/governance/resolution-http.test.ts | governed mutation over HTTP > denies a principal without the permission (403) | C | Proven passing in HTTP run |
| SKIP-048 | tests/governance/resolution-http.test.ts | governed mutation over HTTP > denies a cross-tenant proposal without confirming existence | C | Proven passing in HTTP run |
| SKIP-049 | tests/governance/resolution-http.test.ts | governed mutation over HTTP > rejects a forged lifecycle status with 422 | C | Proven passing in HTTP run |
| SKIP-050 | tests/governance/resolution-http.test.ts | governed mutation over HTTP > rejects server-controlled fields with 422 | C | Proven passing in HTTP run |
| SKIP-051 | tests/governance/resolution-http.test.ts | governed mutation over HTTP > rejects an unknown field and malformed input with 422 | C | Proven passing in HTTP run |
| SKIP-052 | tests/governance/resolution-http.test.ts | governed mutation over HTTP > denies a classification above the principal's ceiling | C | Proven passing in HTTP run |
| SKIP-053 | tests/governance/resolution-http.test.ts | governed mutation over HTTP > replays an identical request without creating a second record | C | Proven passing in HTTP run |
| SKIP-054 | tests/governance/resolution-http.test.ts | governed mutation over HTTP > rejects the same key with a different payload (409) | C | Proven passing in HTTP run |
| SKIP-055 | tests/governance/resolution-http.test.ts | governed mutation over HTTP > never leaks a response across actors reusing a key | C | Proven passing in HTTP run |
| SKIP-056 | tests/governance/resolution-http.test.ts | governed mutation over HTTP > does not double-execute concurrent requests sharing a key | C | Proven passing in HTTP run |
| SKIP-057 | tests/governance/resolution-http.test.ts | governed mutation over HTTP > suppresses data assets above the viewer's clearance (A-02) | C | Proven passing in HTTP run |
| SKIP-058 | tests/governance/resolution-http.test.ts | governed mutation over HTTP > denies the foundation page to an out-of-scope principal (H-NEW-2) | C | Proven passing in HTTP run |
| SKIP-059 | tests/governance/vote-http.test.ts | vote mutation over HTTP > rejects an unauthenticated vote with 401 | C | Proven passing in HTTP run |
| SKIP-060 | tests/governance/vote-http.test.ts | vote mutation over HTTP > records a real vote for an eligible member | C | Proven passing in HTTP run |
| SKIP-061 | tests/governance/vote-http.test.ts | vote mutation over HTTP > returns 200 and one ballot when a member changes their vote | C | Proven passing in HTTP run |
| SKIP-062 | tests/governance/vote-http.test.ts | vote mutation over HTTP > rejects an invalid vote value with 422 | C | Proven passing in HTTP run |
| SKIP-063 | tests/governance/vote-http.test.ts | vote mutation over HTTP > rejects server-controlled fields with 422 | C | Proven passing in HTTP run |
| SKIP-064 | tests/governance/vote-http.test.ts | vote mutation over HTTP > denies a principal without the vote capability | C | Proven passing in HTTP run |
| SKIP-065 | tests/governance/vote-http.test.ts | vote mutation over HTTP > denies a cross-tenant voter without confirming existence | C | Proven passing in HTTP run |
| SKIP-066 | tests/governance/vote-http.test.ts | vote mutation over HTTP > rejects a vote once the window has closed | C | Proven passing in HTTP run |
| SKIP-067 | tests/governance/vote-http.test.ts | vote mutation over HTTP > rejects a vote on an untabled DRAFT resolution | C | Proven passing in HTTP run |
| SKIP-068 | tests/governance/vote-http.test.ts | vote mutation over HTTP > replays an identical vote without creating a second ballot | C | Proven passing in HTTP run |
| SKIP-069 | tests/governance/vote-http.test.ts | vote mutation over HTTP > rejects the same key with a different vote payload | C | Proven passing in HTTP run |
| SKIP-070 | tests/governance/vote-http.test.ts | vote mutation over HTTP > isolates the same raw key across different actors | C | Proven passing in HTTP run |
| SKIP-071 | tests/governance/vote-http.test.ts | vote mutation over HTTP > produces exactly one ballot for concurrent identical requests | C | Proven passing in HTTP run |
| SKIP-072 | tests/governance/vote-http.test.ts | vote mutation over HTTP > allows only the presiding officer to table over HTTP | C | Proven passing in HTTP run |
| SKIP-073 | tests/frontend/accessibility-nav-gating.test.ts | Sign-in accessibility (unauthenticated shell) > every field has a programmatically associated label | C | Proven passing in HTTP run |
| SKIP-074 | tests/frontend/accessibility-nav-gating.test.ts | Sign-in accessibility (unauthenticated shell) > the MFA field declares one-time-code autocomplete and a help association | C | Proven passing in HTTP run |
| SKIP-075 | tests/frontend/accessibility-nav-gating.test.ts | Sign-in accessibility (unauthenticated shell) > a sign-in failure is announced via an assertive live region | C | Proven passing in HTTP run |
| SKIP-076 | tests/frontend/accessibility-nav-gating.test.ts | Sign-in accessibility (unauthenticated shell) > does not publish privileged identities on the public sign-in page | C | Proven passing in HTTP run |
| SKIP-077 | tests/frontend/accessibility-nav-gating.test.ts | OS shell accessibility (authenticated) > provides a skip link that targets the main landmark | C | Proven passing in HTTP run |
| SKIP-078 | tests/frontend/accessibility-nav-gating.test.ts | OS shell accessibility (authenticated) > labels its landmarks so a screen reader can tell them apart | C | Proven passing in HTTP run |
| SKIP-079 | tests/frontend/accessibility-nav-gating.test.ts | OS shell accessibility (authenticated) > marks the current page with aria-current in BOTH desktop and mobile navigation | C | Proven passing in HTTP run |
| SKIP-080 | tests/frontend/accessibility-nav-gating.test.ts | OS shell accessibility (authenticated) > announces the active module on a deep route | C | Proven passing in HTTP run |
| SKIP-081 | tests/frontend/accessibility-nav-gating.test.ts | Navigation honesty — gating is presentation, never authority > no module the backend denies is advertised in navigation (every principal) | C | Proven passing in HTTP run |
| SKIP-082 | tests/frontend/accessibility-nav-gating.test.ts | Navigation honesty — gating is presentation, never authority > hiding a module does not change the governed decision on direct access | C | Proven passing in HTTP run |
| SKIP-083 | tests/frontend/accessibility-nav-gating.test.ts | Navigation honesty — gating is presentation, never authority > a read-only auditor sees only modules they can actually open | C | Proven passing in HTTP run |
| SKIP-084 | tests/frontend/accessibility-nav-gating.test.ts | Dashboard authorization visibility > omits every panel and figure whose capability the principal lacks | C | Proven passing in HTTP run |
| SKIP-085 | tests/frontend/accessibility-nav-gating.test.ts | Dashboard authorization visibility > a fully entitled principal still sees the finance and governance panels | C | Proven passing in HTTP run |
| SKIP-086 | tests/frontend/integration.test.ts | Stage 2/4 — route auth boundary (unauthenticated direct URL) > direct URL to every protected /os route redirects to sign-in when unauthenticated | C | Proven passing in HTTP run |
| SKIP-087 | tests/frontend/integration.test.ts | Stage 2/6 — per-route authorization (authorized renders, unauthorized denies) > audit page: CEO (audit:log.read) renders; HCM director is denied with the capability code | C | Proven passing in HTTP run |
| SKIP-088 | tests/frontend/integration.test.ts | Stage 2/6 — per-route authorization (authorized renders, unauthorized denies) > HCM page: CEO renders; CFO is denied with the capability code | C | Proven passing in HTTP run |
| SKIP-089 | tests/frontend/integration.test.ts | Stage 2/6 — per-route authorization (authorized renders, unauthorized denies) > Capital page: CFO renders finance content; HCM director is denied | C | Proven passing in HTTP run |
| SKIP-090 | tests/frontend/integration.test.ts | Stage 2/6 — per-route authorization (authorized renders, unauthorized denies) > Noelia page: CEO renders console; auditor (no ai:noelia.query) is denied | C | Proven passing in HTTP run |
| SKIP-091 | tests/frontend/integration.test.ts | Stage 4 — identity continuity across login → page → API > the rendered layout shows the authenticated principal's name, tenant and roles | C | Proven passing in HTTP run |
| SKIP-092 | tests/frontend/integration.test.ts | Stage 4 — identity continuity across login → page → API > a forged session cookie is rejected at the page boundary (identity not honored) | C | Proven passing in HTTP run |
| SKIP-093 | tests/frontend/integration.test.ts | Stage 8 — Noelia full response-contract preservation > analyze returns decisionId/engine/confidence/deniedScopes/humanReviewRequired/toolsUsed intact | C | Proven passing in HTTP run |
| SKIP-094 | tests/frontend/integration.test.ts | Stage 8 — Noelia full response-contract preservation > a FAMILY_OFFICE_PRINCIPAL without ai:analytics.read is denied the analyze endpoint | C | Proven passing in HTTP run |
| SKIP-095 | tests/frontend/integration.test.ts | Stage 8 — Noelia full response-contract preservation > a forged target tenant in the body cannot escape the resolved scope | C | Proven passing in HTTP run |
| SKIP-096 | tests/hcm/hcm-http.test.ts | HCM employees API over HTTP > unauthenticated GET is 401 | C | Proven passing in HTTP run |
| SKIP-097 | tests/hcm/hcm-http.test.ts | HCM employees API over HTTP > CFO is 403 — Finance consumes HCM, it does not own the read grant | C | Proven passing in HTTP run |
| SKIP-098 | tests/hcm/hcm-http.test.ts | HCM employees API over HTTP > POSITIVE: HCM director reads the master; pay is present at RESTRICTED | C | Proven passing in HTTP run |
| SKIP-099 | tests/hcm/hcm-http.test.ts | HCM employees API over HTTP > sector operator does not receive group Holdings employees | C | Proven passing in HTTP run |
| SKIP-100 | tests/hcm/hcm-http.test.ts | HCM employees API over HTTP > GET :id returns one employee; forged id is 404 not 403 | C | Proven passing in HTTP run |
| SKIP-101 | tests/identity/identity-adversarial-http.test.ts | Iteration 5 identity adversarial surface > a forged session cookie is rejected (401) | C | Proven passing in HTTP run |
| SKIP-102 | tests/identity/identity-adversarial-http.test.ts | Iteration 5 identity adversarial surface > a revoked session cannot continue to act (logout then reuse → 401) | C | Proven passing in HTTP run |
| SKIP-103 | tests/identity/identity-adversarial-http.test.ts | Iteration 5 identity adversarial surface > client-supplied identity claims in the body are rejected, never honored | C | Proven passing in HTTP run |
| SKIP-104 | tests/identity/identity-adversarial-http.test.ts | Iteration 5 identity adversarial surface > a tenant target outside the resolved scope is denied, not honored | C | Proven passing in HTTP run |
| SKIP-105 | tests/identity/identity-adversarial-http.test.ts | Iteration 5 identity adversarial surface > a non-existent tenant id is never resolved into a scope | C | Proven passing in HTTP run |
| SKIP-106 | tests/identity/identity-adversarial-http.test.ts | Iteration 5 identity adversarial surface > analyze honors only the server-derived scope for its target | C | Proven passing in HTTP run |
| SKIP-107 | tests/identity/identity-adversarial-http.test.ts | Iteration 5 identity adversarial surface > an entity target outside the granted entity scope is entity-denied | C | Proven passing in HTTP run |
| SKIP-108 | tests/identity/identity-adversarial-http.test.ts | Iteration 5 identity adversarial surface > a country target outside the authorized countries is country-denied | C | Proven passing in HTTP run |
| SKIP-109 | tests/identity/identity-adversarial-http.test.ts | Iteration 5 identity adversarial surface > stale sessions do not grant scheduler identity (owner reconstructed canonically) | C | Proven passing in HTTP run |
| SKIP-110 | tests/noelia/http-coverage.test.ts | Iteration 4 HTTP route coverage > POST /api/v1/ai/noelia/analyze returns a governed analysis (semantic) | C | Proven passing in HTTP run |
| SKIP-111 | tests/noelia/http-coverage.test.ts | Iteration 4 HTTP route coverage > POST /api/v1/ai/noelia/analyze rejects an unknown analysis type (422) | C | Proven passing in HTTP run |
| SKIP-112 | tests/noelia/http-coverage.test.ts | Iteration 4 HTTP route coverage > POST /api/v1/ai/noelia/brief returns the structured executive briefing | C | Proven passing in HTTP run |
| SKIP-113 | tests/noelia/http-coverage.test.ts | Iteration 4 HTTP route coverage > POST /api/v1/ai/noelia/schedules creates, suspends and ticks a governed schedule | C | Proven passing in HTTP run |
| SKIP-114 | tests/noelia/http-coverage.test.ts | Iteration 4 HTTP route coverage > POST /api/v1/ai/noelia/workflows plans, validates, authorizes (maker/checker) and executes | C | Proven passing in HTTP run |
| SKIP-115 | tests/noelia/http-coverage.test.ts | Iteration 4 HTTP route coverage > POST /api/v1/ai/noelia/workflows/:id/cancel terminates a planned workflow | C | Proven passing in HTTP run |
| SKIP-116 | tests/noelia/http-coverage.test.ts | Iteration 4 HTTP route coverage > POST /api/v1/auth/logout terminates the session | C | Proven passing in HTTP run |
| SKIP-117 | tests/noelia/http.test.ts | Noelia over production HTTP > rejects unauthenticated access | C | Proven passing in HTTP run |
| SKIP-118 | tests/noelia/http.test.ts | Noelia over production HTTP > normalizes malformed input to a safe canonical 422 | C | Proven passing in HTTP run |
| SKIP-119 | tests/noelia/http.test.ts | Noelia over production HTTP > rejects unknown request fields rather than widening context | C | Proven passing in HTTP run |
| SKIP-120 | tests/noelia/http.test.ts | Noelia over production HTTP > executes a governed query and persists the AI decision | C | Proven passing in HTTP run |
| SKIP-121 | tests/noelia/http.test.ts | Noelia over production HTTP > denies a cross-tenant target through tool scope without leaking data | C | Proven passing in HTTP run |
| SKIP-122 | tests/security/full-spectrum-chaos.test.ts | Stage 15 — red-team: no SQL injection / no secret leakage at the transport boundary > login rejects SQL-injection-shaped identifiers without a 500 or SQL detail | C | Proven passing in HTTP run |
| SKIP-123 | tests/security/full-spectrum-chaos.test.ts | Stage 15 — red-team: no SQL injection / no secret leakage at the transport boundary > malformed payload returns a controlled code and no stack trace | C | Proven passing in HTTP run |
| SKIP-124 | tests/security/full-spectrum-chaos.test.ts | Stage 15 — red-team: no SQL injection / no secret leakage at the transport boundary > a wrong credential returns 401 with a correlation id and no internal detail | C | Proven passing in HTTP run |
| SKIP-125 | tests/security/full-spectrum-chaos.test.ts | Stage 15 — red-team: no SQL injection / no secret leakage at the transport boundary > spoofed X-Forwarded-For cannot mint fresh rate-limit buckets | C | Proven passing in HTTP run |

**Totals:** SKIP-001 … SKIP-125 — 125 records across 14 files: api/validation-http.test.ts 2, certification/scale-concurrency.test.ts 2, finance/capital-governance-http.test.ts 14, governance/authorization-http.test.ts 12, governance/decision-http.test.ts 14, governance/resolution-http.test.ts 14, governance/vote-http.test.ts 14, frontend/accessibility-nav-gating.test.ts 13, frontend/integration.test.ts 10, hcm/hcm-http.test.ts 5, identity/identity-adversarial-http.test.ts 9, noelia/http-coverage.test.ts 7, noelia/http.test.ts 5, security/full-spectrum-chaos.test.ts 4.