# BEYU–Health session federation threat model

**Status: baseline assessment; bridge not implemented on PR #127.** See `docs/audit/BEYU_HEALTH_AUTH_BRIDGE_BASELINE.md`. Existing controls below are not evidence of end-to-end security. Draft PR #120 overlaps and is unmerged/conflicting. No residual risk is accepted by this document. `M` denotes mocked/unit evidence; `C` denotes CI job evidence at `da234ac`; neither proves deployed integration. “Required” tests are not run for a complete bridge.

| Threat / attack path | Existing and needed controls | Residual risk, evidence and dependency |
| --- | --- | --- |
| Session theft / cross-subdomain cookie leakage | Existing session lookup checks expiry/revocation; retain secure host-scoped cookies and no upstream BEYU cookie. | Cookie/browser and stolen-session end-to-end tests required; deployment cookie configuration unverified. |
| Replay / assertion forgery | Unwired atomic replay primitive and local scratch concurrency test; proposed asymmetric signatures. | No wired verifier, approved runtime table or key custody; real end-to-end forged/replay tests required. |
| Key compromise / rotation failure | Dedicated per-environment keys and overlapping verified public keys proposed. | No key distribution, rotation or incident process implemented/tested. Secret store and service identity required. |
| Audience, issuer or algorithm confusion | Proposed strict issuer/audience/algorithm/key allowlist; no secret reuse. | PR #120 differs from #127 draft; reconciliation and negative signature tests required. |
| Open redirect / SSRF | No Health backend proxy on #127; proposed fixed-origin, exact route allowlist, TLS and no redirect forwarding. | No BFF implementation; require DNS/egress and untrusted URL tests. |
| CSRF / XSS exposure | Existing root CSRF/origin controls and standalone fence; proposed same-origin controlled BFF and no browser Health secrets. | Actual session/cookie flow is unimplemented; browser, origin and token-leakage tests required. |
| Host-header / identity-header spoofing | Existing host resolver and mount treat hostname as a restriction; BFF must strip browser identity and forwarding headers. | Mount tests M do not prove API behavior; test trusted proxies and raw request target. |
| Tenant, country or entity confusion | Existing link and tenant-domain gates and Health RLS; require active mappings, membership and operation policy on both sides. | Shared-db role/ledger topology unresolved; real non-owner cross-tenant/entity/country tests required. |
| Role escalation / privileged administrator abuse | Existing server-derived grants and Health role checks; no role from assertion/browser. | Exact destination authorization, clinical permission matrix, step-up and separation-of-duties remain unverified. |
| Missing or revoked links / disabled users | Active link lookup fails closed; Health account/security-version checks exist. | Mount M and Health C do not prove exchange/session behavior; real revocation and outage tests required. |
| Revocation delay / stale status | Existing Health federation cache has a bounded stale-read mode; proposed bridge must define exact session binding and max freshness. | No demonstrated BEYU-session-to-Health revocation bound; logout, refresh and outage tests required. |
| Cache poisoning / cross-user or cross-tenant cache leakage | Mount serves `no-store`; authenticated BFF responses must never enter shared caches. | No BFF exists; verify CDN, browser and reverse-proxy behavior. |
| Refresh-token reuse / race conditions | Existing Health session code supports rotation; standalone refresh remains fenced. | Federated refresh and concurrent exchange not established; require non-owner real DB and browser tests. |
| Partial transactions / orphan sessions | Replay insert primitive is unwired and requires independent autocommit; prospective Health session and audit transaction must be reviewed. | Cross-service operation is not globally atomic; test failures before/after consumption and durable audit. |
| DB privilege escalation | Existing roles and RLS controls; Health runner refuses foreign ledger. | Migration 032 broad SELECT and ledger collision remain; review grants, ownership, non-owner tests and production state. |
| Audit failure / insider threats | Existing audit systems; no assertion or session secrets should be logged. | Federation event coverage, audit failure policy and privileged operator monitoring not implemented/tested. |
| Health backend / BEYU control-plane outage | No proxy on #127; missing link infrastructure fails closed. | Prove no stale mutation authorization, no session minting on dependency failures; operational recovery required. |
| Emergency-access misuse | Standalone production login remains fenced. | No approved break-glass workflow established; governed scope, duration, justification and review require separate design. |

## Evidence recorded

- Existing mount fail-closed tests: `tests/authorization/health-mount-boundary.test.ts` (M); link lifecycle test: `tests/authorization/health-os-link-lifecycle.test.ts` (M).
- Standalone fence regression: `tests/security/health-standalone-auth-fence.test.ts` and sector fence tests; root checks do not prove a complete exchange.
- Request binding: `tests/security/health-pilot-request-binding.test.ts` (offline); no trusted original request-target transport proven.
- Replay primitive: `tests/security/health-request-replay.test.ts` includes optional disposable loopback PostgreSQL concurrency; no migration or live runtime grant exists.
- C at `da234ac`: Health backend real PostgreSQL suite and boot passed, but job failed lint. No production, real tenant or cross-service certification follows from this.
