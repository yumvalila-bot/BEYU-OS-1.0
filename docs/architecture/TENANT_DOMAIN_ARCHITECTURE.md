# Governed Tenant Domains — Health OS tenant hostnames

Status: **IMPLEMENTED IN THE REPOSITORY (Phase 1/2)** · **DNS + DEPLOYMENT PLATFORM:
HUMAN-CONTROLLED, NOT DONE** · last reviewed 2026-09-22

---

## 1. What this document is

BEYU OS has one constitutional control plane (`beyuos.co.tz`, the `/os` control
plane, the five canonical Sector OS routes) and one governed way for a tenant to
be reachable at its own hostname:

```
health.beyuos.co.tz                    OS base domain  → Health OS, no tenant
<tenant-slug>.health.beyuos.co.tz      tenant subdomain → exactly ONE tenant
www.<tenant-owned-domain>              custom domain    → exactly ONE tenant (verified first)
```

This document records (a) what the repository actually implements, (b) what is
**not** implemented and must never be claimed as done, and (c) exactly what a
human operator must do at the DNS and deployment-platform layers.

The principle chain, unchanged and non-negotiable:

```
DOMAIN / HOSTNAME
  → TENANT-DOMAIN REGISTRY   (tenant_domains, migration 0063)
  → TENANT IDENTITY          (tenants.id / tenants.code — immutable)
  → HEALTH ENTITY            (legal_entities, optional binding)
  → COUNTRY / ORGANISATION   (countries, tenant country)
  → EXISTING RBAC + ABAC + POLICY ENGINE
  → EXISTING RLS
  → EXISTING HEALTH OS
```

**A hostname is never authorization.** A tenant domain can only ever *restrict*
the tenant context a request is evaluated in. It cannot grant access, cannot skip
login, cannot bypass identity federation, cannot infer a role and cannot widen a
country or entity scope.

---

## 2. Canonical model (repository)

| Concern | Where it lives |
| --- | --- |
| Registry table | `tenant_domains` — `drizzle/0063_tenant_domain_registry.sql`, `src/db/schema/tenant-domains.ts` |
| Fields | `id`, `tenant_id`, `os`, `entity_id`, `country_code`, `hostname`, `domain_type`, `status`, `verification_state`, `verification_method`, `verification_token_hash`, `verification_evidence`, `registered_by`, `verified_by`, `verified_at`, `classification`, `created_at`, `updated_at` |
| Domain types | `OS_BASE` · `TENANT_SUBDOMAIN` · `CUSTOM_DOMAIN` (`beyu_domain_type`) |
| Lifecycle | `beyu_lifecycle_status`: `CREATED → VERIFIED → ACTIVE`, plus `SUSPENDED`, `MODIFIED`, `REVOKED`, `DEACTIVATED`, `ARCHIVED` |
| Verification | `beyu_verification_status`: `UNVERIFIED · DOCUMENTED · VERIFIED · DISPUTED`; methods `DNS_TXT` (implemented, real lookup) and `PLATFORM_DEPLOYMENT_CONFIG` (recorded deployment configuration, **not** a runtime DNS proof) |
| Hostname handling | `src/lib/tenant-domain/hostname.ts` (the ONE normaliser) |
| Resolution | `src/lib/tenant-domain/resolver.ts` |
| Governed reads | `src/lib/tenant-domain/registry.ts` |
| Governed writes | `src/lib/tenant-domain/lifecycle-service.ts` |
| API surface | `POST/GET /api/v1/admin/tenant-domains`, `POST …/[id]/verify`, `POST …/[id]/status`, `POST …/[id]/reassign` |
| Permissions | `organization:tenantdomain.read · .register · .verify · .manage · .reassign` (`src/lib/constants.ts`, mirrored in migration 0063 and the constitutional seed) |
| Request gate | `src/app/os/health/mount.ts` (gate 3) |
| OS identity authority | `os_registry` — a domain may only be bound to an `ACTIVE` `SECTOR_OS` |

`os` on a domain row is a **canonical `os_registry.code`** (`HEALTH_OS`). There is
no second OS registry: an unknown code, a `DRAFT` entry (`MINING_OS`), a shared
capability or the control plane can never become a tenant-domain namespace.

### Bootstrap row

`health.beyuos.co.tz` (OS_BASE, owner tenant `BEYU-HEALTH`, status `ACTIVE`,
`verification_state = DOCUMENTED`, method `PLATFORM_DEPLOYMENT_CONFIG`) is created
by migration 0063 for existing databases and by `src/db/seed.ts` for fresh
installs — the same fixed id (`TDM_HEALTH_OS_BASE`) in both paths.

`DOCUMENTED` is deliberate and honest: the base domain is DNS + deployment
configuration performed by a human operator. It is **not** a runtime-verified DNS
fact, and the application treats it as a namespace marker only — it never
resolves to a tenant.

---

## 3. Resolution flow (what happens on a request)

```
Host header (untrusted)
  → normalizeHostname()               reject schemes, paths, ports, wildcards, IDN, IP literals
  → exact lookup in tenant_domains    inside the caller's RLS tenant scope
  → OS namespace check                tenant subdomains must be strict subdomains of an ACTIVE OS base
  → status = ACTIVE                    SUSPENDED / ARCHIVED / REVOKED / DEACTIVATED ─┐
  → verification_state = VERIFIED       UNVERIFIED / DOCUMENTED / DISPUTED ──────────┤ fail
  → os_registry: ACTIVE SECTOR_OS       unknown / DRAFT / non-sector ────────────────┤ closed
  → tenant exists AND ACTIVE            suspended / deactivated / removed tenant ────┤
  → country + entity agreement          mismatch or foreign entity ──────────────────┘
  → tenant ∈ principal's tenant scope   (RLS already hid everything else)
  → EXISTING session / federation / RBAC / ABAC / policy / RLS chain runs UNCHANGED
```

Outcomes:

| Outcome | Meaning |
| --- | --- |
| `TENANT` | A governed binding proves one tenant. Only ever *narrows*. |
| `OS_BASE` | The OS's own base domain: a namespace marker, **no tenant context**. |
| `NOT_APPLICABLE` | Not a tenant-domain claim at all (deployment host, `localhost`, an unrelated domain, no Host). Behaviour is exactly as before this capability existed. |
| `DENIED` | Fail closed: uniform `404 Not Found`, no detail, no redirect, never a fallback tenant. |

Deliberate design decisions worth stating:

* **Unknown names inside a governed namespace fail closed.** `x.health.beyuos.co.tz`
  with no governed row is refused. It never becomes the base tenant, another
  tenant, or a "default" tenant.
* **Loopback is local.** `localhost` / `127.0.0.1` / `::1` derive no tenant
  context (development, the embedded test harness, health probes). Because they
  derive nothing, they cannot widen anything either.
* **`*.vercel.app` is not a tenant.** The platform's own deployment hostname
  matches no registry row and no namespace → `NOT_APPLICABLE`, so preview and
  production URLs keep working exactly as before, with every existing check.
* **No Host allow-list.** There is no `TRUSTED_HOSTS` environment variable and no
  configuration that can *add* a hostname: the registry table is the only source,
  and it is runtime read-only (below).

---

## 4. Governance and security invariants

* **Registration never creates a tenant.** `registerTenantDomain` requires an
  existing, `ACTIVE` tenant; creating tenants is a different capability
  (`organization:tenant.register`).
* **The runtime cannot change the registry.** `beyu_runtime` holds **SELECT only**
  on `tenant_domains` (migration 0063 + `scripts/setup-db-role.ts` re-asserts it
  after the blanket grant). The hostname binding governs the runtime, so the
  runtime credential must not be able to re-point it — the same rule as
  `os_registry` and `role_assignments` (F-01).
* **Writes are transactional and audited.** Every mutation, its `audit_log` record
  and its `enterprise_events` row commit together on the existing admin-DSN
  boundary. Domain actions: `DOMAIN_REGISTERED`, `DOMAIN_VERIFIED`,
  `DOMAIN_VERIFICATION_FAILED`, `DOMAIN_ACTIVATED`, `DOMAIN_SUSPENDED`,
  `DOMAIN_RETIRED`, `DOMAIN_REASSIGNED`. A mutation that is not audited does not commit.
* **Verification is real.** A name becomes `VERIFIED` only when a live DNS TXT
  lookup at `_beyu-domain-verification.<hostname>` matches the stored SHA-256 of
  the challenge. The challenge is stored hashed, is never returned twice, is
  cleared on success, and never appears in an audit record, an error or a log.
* **Uniqueness is global and database-enforced.** One hostname belongs to exactly
  one domain row, so slug collisions, duplicate hostnames and cross-OS collisions
  are impossible; a lost race is reported as a governed conflict, not a 500.
* **Reassignment is hard on purpose.** HIGH-RISK with MFA step-up, refused while
  the domain is `ACTIVE` (suspend first), requires both source and destination
  tenants in scope, and always returns the domain to `CREATED` + `UNVERIFIED`
  with a fresh challenge — a re-pointed name must prove DNS control again.
* **No deletion, ever.** There is no delete path in the service and no `DELETE`
  grant in the database. Retirement is the terminal `ARCHIVED` status, so a
  retired name cannot be silently reused and a removed tenant cannot be
  resurrected by re-adding its hostname.
* **Custom domains are conservative.** A custom domain is refused inside any OS
  namespace (it must be registered as a tenant subdomain), is registered
  `UNVERIFIED`, and cannot resolve until DNS control is proven. Full custom-domain
  lifecycle (CNAME validation, certificate readiness, per-tenant branding) is a
  documented extension point, **not implemented**.
* **RLS is the final boundary.** All resolution reads run inside the caller's
  canonical tenant context with `FORCE ROW LEVEL SECURITY` and a
  `beyu_tenant_ids()` policy. The only extra visibility is the `OS_BASE`
  namespace facts, which carry no tenant context and no data.

---

## 5. Readiness vocabulary — do not conflate these

| Dimension | Status | Evidence |
| --- | --- | --- |
| **APPLICATION** | ✅ **READY** | migration 0063 + registry + resolver + gates implemented, tested against the real non-superuser runtime role |
| **DNS** | ⛔ **NOT CONFIGURED BY THIS WORK** | no DNS records were created, modified or verified; requires human authorization |
| **DEPLOYMENT PLATFORM (Vercel)** | ⛔ **NOT CONFIGURED BY THIS WORK** | no project domain, no wildcard, no certificate was added |
| **PRODUCTION ENVIRONMENT** | ⛔ **UNCHANGED** | no environment variable was added or changed |

The workspace verified in this cycle was the local harness (`beyu_runtime` on the
embedded PostgreSQL 16 instance). Production was not touched, not deployed and not
promoted.

**Observed DNS state (2026-09-22, read-only lookup, no changes made).** Public
resolution from the verification environment returns `ENOTFOUND` (NXDOMAIN) for
both `beyuos.co.tz` and `health.beyuos.co.tz`, while control lookups
(`github.com`, `google.com`, `vercel.app`) resolve normally in the same
environment. As observed, then, the OS base domain has no public DNS records yet
— which is exactly why `health.beyuos.co.tz` is recorded in the registry as
`DOCUMENTED`/`PLATFORM_DEPLOYMENT_CONFIG` rather than as a runtime-verified DNS
fact, and why DNS readiness is listed here as NOT MET. A split-horizon or
not-yet-delegated zone cannot be fully excluded from one vantage point; the
authoritative check belongs to the domain owner.

---

## 6. What a human operator must do (NOT done here)

### 6.1 DNS

For the base domain:

| Record | Name | Value | Purpose |
| --- | --- | --- | --- |
| `A` / `ALIAS` | `health.beyuos.co.tz` | the deployment platform's target | serves the OS base domain |
| `CNAME` | `www.health.beyuos.co.tz` (optional) | `health.beyuos.co.tz` | convenience alias |

For tenant subdomains — choose ONE model:

1. **Wildcard (one record, recommended for scale)** — `CNAME *.health.beyuos.co.tz
   → <platform target>`. This is the model the application is built for: the app
   resolves an EXACT registered hostname, so the wildcard is purely DNS
   infrastructure and grants nothing. Any tenant name that has no governed row is
   refused by the application even though DNS answers.
2. **Per-tenant record** — a `CNAME` per tenant subdomain. Equivalent at the
   application layer; more manual work and more room for DNS/registry drift.

For each domain that must become `VERIFIED`:

| Record | Name | Value |
| --- | --- | --- |
| `TXT` | `_beyu-domain-verification.<hostname>` | `beyu-domain-verification=<challenge>` |

The exact value is returned once, by the registration (or reassignment) response.

### 6.2 TLS / certificates

A wildcard certificate for `*.health.beyuos.co.tz` (or per-host certificates) is
issued by the deployment platform / ACME provider. **No certificate is issued or
managed by the application code**, and DNS-01 wildcard issuance typically requires
either NS delegation of `health.beyuos.co.tz` to the platform or the platform's
own DNS integration.

### 6.3 Deployment platform (Vercel or equivalent)

Add the domains to the EXISTING project:

* `health.beyuos.co.tz`
* `*.health.beyuos.co.tz` (wildcard domain; requires DNS-01 / NS delegation)

**One project. Never one project per tenant.** No new `vercel.json` rewrite or
catch-all is required or wanted: the application resolves hostnames itself, so no
proxy-level routing rule is added, and nothing intercepts `/api/*`, auth,
enrollment, webhooks, server actions, static assets or platform paths.

### 6.4 Environment variables

**None are required.** Hostname resolution reads the registry table, not an
allow-list. No `TRUSTED_HOSTS`, no per-tenant variable, no tenant identifier in
configuration. (Any such variable would be a second, ungoverned registry and is
deliberately absent.)

### 6.5 Verification sequence (after DNS + platform configuration)

1. `POST /api/v1/admin/tenant-domains` with `{tenantId, os: "HEALTH_OS",
   domainType: "TENANT_SUBDOMAIN", label, reason}` → returns the challenge.
2. Publish the TXT record; `POST /api/v1/admin/tenant-domains/<id>/verify`.
3. `POST /api/v1/admin/tenant-domains/<id>/status` with `{"action":"activate"}`.
4. Confirm `GET /api/v1/admin/tenant-domains` shows `ACTIVE` + `VERIFIED`.
5. Request `https://<tenant-slug>.health.beyuos.co.tz/os/health` with a session
   that is federated to Health OS. Expect the SAME Health OS document as
   `/os/health`; expect `404` without a session-scope match; expect `404` for any
   name with no governed row.

---

## 7. Explicit non-claims

* DNS and Vercel configuration are **not** done by this work and are not claimed.
* `verification_method = PLATFORM_DEPLOYMENT_CONFIG` on the OS base row records
  deployment configuration — it does **not** assert that a runtime DNS check was
  performed against `health.beyuos.co.tz`.
* No per-tenant deployment, no per-tenant Vercel project, no second Health OS, no
  second tenant system, no second authorization model, no new security boundary.
* Tenant-context threading into the sector runtime's own session (bridging the
  BEYU session into the Health SPA's API calls) remains the documented
  `sectors/health/INTEGRATION.md` boundary; the hostname gate narrows and proves
  the binding, and the sector runtime keeps its own federation and tenant controls.
