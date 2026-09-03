# Identity Federation — BEYU OS ⇄ Sector Operating Systems

**Status:** Implemented and certified (cross-OS certification: 10/10 scenarios against the real BEYU OS root control plane and the real Health OS backend, over real HTTP and real PostgreSQL on both sides — see [CROSS_OS_IDENTITY_CERTIFICATION_REPORT.md](./CROSS_OS_IDENTITY_CERTIFICATION_REPORT.md)).

**Scope:** The canonical identity contract between the BEYU OS root platform (`/` of this repository — Next.js + PostgreSQL `beyu_os`, RLS-guarded immutable audit ledger) and sector operating systems (reference sector: Health OS, `sectors/health/backend` — NestJS + its own PostgreSQL database). This document is the normative reference for the identity federation boundary; it supersedes informal notes.

---

## 1. Model

One **canonical identity** per human, owned by the BEYU OS root platform. Sector operating systems own **sector accounts** with their own credentials, roles, tenants, and tokens — but a sector account is only usable once it is **linked (link-once)** to exactly one canonical identity.

```
   Human registers at Health OS
        │
        ▼
   Health OS ── POST /api/v1/internal/identity/register ──▶ BEYU OS root
   (sector account)          (HS256 service token)         (canonical user+party)
        │                                                          │
        └────────── beyu_identity.beyu_identity_links ─────────────┘
                      global_user_id  ⇄  canonical USR_… (link-once)
```

* The **root never mints sector tokens**. The sector JWT subject is always the *sector* user id; the canonical id never appears in any sector-issued credential.
* The **canonical account has no usable interactive credential** (random secret, hashed, never disclosed). Authentication always happens at the sector; the root is the source of truth for *identity lifecycle*, not login.
* The link is **link-once**: a canonical identity cannot be silently re-linked to a different sector account, and a sector account cannot be re-linked to a different canonical identity. Conflicts fail closed.

## 2. Control-plane API (root)

Internal endpoints under `/api/v1/internal/identity/*`, exclusively for sector operating systems:

| Endpoint | Purpose | Responses |
| --- | --- | --- |
| `POST /register` | Provision canonical user + party for a sector registration | `201` created · `200` idempotent re-send (same email) · `404 TENANT_NOT_FOUND` · `409 TENANT_NOT_ACTIVE` · `401/403` token failure |
| `POST /lookup` | Authoritative canonical status (user + party + tenant) | `200` with `{ status, partyStatus, tenantCode, … }` · `404 IDENTITY_NOT_FOUND` |

Both are authenticated by **service tokens** (below), validated `timingSafeEqual` on issuer/audience/subject/expiry with bounded skew. Canonical provisioning **always targets the canonical sector tenant** (`BEYU-HEALTH` for Health OS) — a sector-local tenant code is never forwarded as a canonical tenant code.

All audited work runs inside `withDatabaseRlsContext([tenantId], false, …)` — the runtime DB role cannot insert into the RLS-guarded `audit_log` outside a tenant context, so the transaction-local context is established exactly as `guarded()` does for human sessions. Every successful call is recorded in the immutable hash-chained ledger: `internal.identity.register` / `internal.identity.lookup`, actor type `SERVICE`.

A lookup for an unknown identity is denied without a ledger row (no tenant context exists for an unknown identity); the denial is logged server-side and the caller's outbox row accounts for the failed call.

## 3. Service tokens (sector → root)

HS256 JWTs signed with the shared secret `BEYU_INTERNAL_SERVICE_TOKEN` (both OSes, env-injected, never in code):

* `iss: HEALTH_OS` (sector id), `aud: BEYU_OS`, `sub: service:HEALTH_OS`, short `exp`, unique `jti`.
* The receiving side verifies signature, issuer, audience, subject shape, and expiry — a wrong secret, wrong audience, expired token, `alg:none`, or malformed token is rejected before any business logic (regression-tested in `token-matrix.spec.ts`: 13 scenarios).
* Service tokens are **transport credentials only**. They can never impersonate a human Bearer on a sector API (different secret and claims; certified in the cross-OS suite, scenario F).
* The migration-021 **service principal** on the sector side (`service@health-os.internal`) exists only so the transport has an auditable local actor. It is `suspended`, has no valid password hash, and cannot log in interactively (certified, scenario G).

## 4. Transport (sector side)

`IdentityAdapter` (Health OS: `src/integrations/beyu/shared/identity.adapter.ts`) with a per-domain `CircuitBreaker` and a transactional outbox:

* **Idempotency:** every register carries `idempotencyKey: identity-register:<email>`; retries are safe (link-once + root idempotent `200`).
* **Bounded retry:** retryable failures (`429`, `5xx`, connection errors) get exactly **2 attempts** (1 retry, 250 ms backoff, jittered); non-retryable (`404`, `409`) get exactly 1. Verified by scripted real-HTTP stub (`identity-transport-failure.spec.ts`: 11 scenarios incl. slow-endpoint timeout proving the bounded attempt count, garbage/wrong-shape 200 bodies, connection-refused).
* **Fail-closed everywhere:** during registration the sector account is **compensated** (hard-deleted) if the canonical identity cannot be established — no orphan sector accounts. Failed calls leave a `FAILED` outbox row for replay/inspection; the original transaction never commits a half-state.
* Every response body is shape-validated; a `200` with a wrong-shaped body is treated as an outage, not success.

## 5. Revocation strategy (normative)

Revocation must propagate from the root to every sector **without a human retrying anything**. Three independent layers, each with a defined freshness bound:

| Layer | What it checks | When | Freshness bound |
| --- | --- | --- | --- |
| **Auth-moment gate** | Canonical `status`/`partyStatus` (fresh, uncached remote lookup) | login, refresh, restore | immediate |
| **Per-request gate** | Canonical `status`/`partyStatus` (strict-TTL cache per canonical identity) | every authenticated request | ≤ `BEYU_IDENTITY_STATUS_TTL_MS` (default 30 s, **hard-capped at 300 s in code**) |
| **Sector security_version (`sv`)** | Sector-side role/membership/disable bump | every authenticated request (JWT `sv` vs DB) | immediate |

Rules:

1. **A revoked canonical identity denies authentication immediately** (auth-moment gate — no cache) and **denies any request within at most one TTL window** after revocation.
2. **A non-ACTIVE cached status always denies**, fresh or stale — a revoked identity can never pass on a cache hit (regression-tested).
3. **A successful auth-moment lookup write-through primes the per-request cache**, so the request immediately following a login can never race the TTL with a pre-auth entry; a revoked auth-moment result primes the cache too.
4. **Control-plane outage during per-request revalidation:**
   * **mutating requests fail closed** — `503 CANONICAL_IDENTITY_UNAVAILABLE` (never a silent downgrade);
   * **read requests may ride the last known status** within `BEYU_IDENTITY_STATUS_MAX_STALE_MS` (default 300 s, hard cap 900 s) — the documented *bounded degraded mode*;
   * a stale **non-ACTIVE** entry still denies (rule 2).
5. **Sector-level revocation is immediate**: `security_version` is bumped on disable/role/membership/permission change and checked on every request; a stale `sv` in a token is rejected (`401`) instantly, with no dependency on the root.
6. **Restore is non-sticky**: operator re-activates the canonical identity → next login succeeds (fresh lookup) → access resumes.

Denials are audited on the sector side (`auth.denied` with reason `canonical_identity_not_active` / `canonical_status_unavailable`).

### Configuration

| Env var | Default | Hard cap | Meaning |
| --- | --- | --- | --- |
| `BEYU_IDENTITY_ENDPOINT` | — | — | Root control plane base URL (LIVE mode) |
| `BEYU_IDENTITY_TOKEN` | — | — | Shared HS256 service secret |
| `BEYU_IDENTITY_STATUS_TTL_MS` | `30000` | `300000` | Per-request canonical-status cache TTL |
| `BEYU_IDENTITY_STATUS_MAX_STALE_MS` | `300000` | `900000` | Bounded degraded-read window during outage |
| `BEYU_IDENTITY_TEST_HARNESS` | unset | — | Synthetic-link test mode; **refused at boot and structurally in code under `NODE_ENV=production`** |

The caps are enforced in code (`Math.min`), so no configuration can create an unsafe cache.

## 6. Failure-mode matrix (sector behavior)

| Control-plane failure | Registration | Login | Authenticated request |
| --- | --- | --- | --- |
| Outage / connection refused | fail closed + **compensate** (no orphan account) | `503 CANONICAL_IDENTITY_UNAVAILABLE` | mutating `503`; reads within MAX_STALE pass on the stale ACTIVE entry |
| `404` / `409` (non-retryable) | fail closed + compensate | `401` | `401` |
| `429` / `5xx` | 2 attempts, then fail closed + compensate | `503` after bounded retry | `503` after bounded retry (mutating) |
| `200` garbage / wrong shape | treated as outage → fail closed + compensate | `503` | as outage |
| Canonical `SUSPENDED` | n/a (link already exists → idempotent deny at login) | `401 CANONICAL_IDENTITY_NOT_ACTIVE` | `401` within ≤ TTL |
| Missing sector link | registration retries; login denied (`401`, fail-closed acting gate) | `401` | `401` |

## 7. Test evidence

| Suite | What it proves |
| --- | --- |
| `identity-federation.spec.ts` (16) | Modes, link-once, LIVE registration/login/denials over real HTTP stub, TTL-bounded revocation, outage semantics, cache invalidation |
| `identity-transport-failure.spec.ts` (11) | Every transport failure mode against a scripted real-HTTP stub: fail-closed + compensation, exactly-2-attempt bounded retry, idempotent replay, FAILED outbox rows |
| `token-matrix.spec.ts` (13) | VALID / EXPIRED / WRONG_SIGNATURE / alg:none / WRONG_AUDIENCE / WRONG_ISSUER / MISSING_SUBJECT / MALFORMED / STALE_SV / REVOKED / NO_LINK / WRONG_TENANT / MISSING_TENANT |
| `cross-os-identity-certification.spec.ts` (10) | The full contract against the REAL root OS + REAL Health OS (see the [certification report](./CROSS_OS_IDENTITY_CERTIFICATION_REPORT.md)) |

The certification suite requires `BEYU_OS_BASE_URL` + `BEYU_INTERNAL_SERVICE_TOKEN` + `TEST_DATABASE_URL` **together**; it skips with an explicit message when all are unset (default CI) and **fails hard** when only partially configured.
