# Canonical Sector OS Subdomains — `health.` · `finance.` · `agriculture.` · `ujenzi.` `beyu.co.tz`

Status: **IMPLEMENTED IN THE REPOSITORY (routing, security, session, tests, docs)** ·
**VERCEL DOMAINS + DNS: HUMAN-CONTROLLED, NOT DONE** · **HTTPS: PENDING DOMAIN
ATTACHMENT** · baseline `main` = `2965aa7721342919e66dcffdbea57cab2028cd35` ·
written 2026-10-08

---

## 0. Reality audit (performed before any code change)

Everything below was read from the repository at the baseline SHA, not from
earlier reports.

| # | Question | Finding |
| --- | --- | --- |
| 1 | Current `main` SHA | `2965aa7721342919e66dcffdbea57cab2028cd35` (merge of PR #99) |
| 2 | Production deployment SHA | **Not observable from the sandbox** (no access to Vercel or to `beyu.co.tz`; outbound network is limited to GitHub/npm/PyPI). The operator-stated production facts are: apex `A @ 216.198.79.1`, `beyu.co.tz → 308 → www.beyu.co.tz`, `www.beyu.co.tz → BEYU OS 200`. None of these were modified. |
| 3 | Routing architecture | Single Next.js 16 App Router application. **No `middleware.ts` / `proxy.ts` existed.** `next.config.ts` carries security headers + one optional rewrite (`/health-os/auth/*`, only when `HEALTH_API_URL` is set). No `vercel.json`. |
| 4 | Sector OS routes | `/os/finance` (page), `/os/health` (route handler → `src/app/os/health/mount.ts`), `/os/agriculture` (layout + pages), `/os/ujenzi` (layout + pages), `/os/foundation`. Legacy Health aliases `/health` (entry/denial page) and `/health/os` (same mount). |
| 5 | OS registry / catalogue | Code: `src/lib/operating-system-catalog.ts` (presentation catalogue, `code`/`href`), `src/lib/operating-systems.ts` (authorization resolver `authorizedOperatingSystems`, `operatingSystemTenantInScope`), `src/lib/os-context.ts` (route → OS, presentation only). Database: `os_registry` (`HEALTH_OS`, `FINANCE_OS`, `AGRICULTURE_OS`, `UJENZI_OS`, `FOUNDATION_OS` are `SECTOR_OS`; `BEYU_OS` is `CONTROL_PLANE`; `HIVE_RUNTIME` is `AI_RUNTIME`). |
| 6 | Domain / tenant registry | `tenant_domains` (migrations 0063–0065) + `src/lib/tenant-domain/*`. It is a **post-authentication, RLS-scoped, tenant-hostname** registry (`<tenant>.health.beyuos.co.tz`), consumed only by the Health mount (gate 3). Its seeded namespace is `beyuos.co.tz`, **not** the production apex `beyu.co.tz`. `docs/architecture/TENANT_DOMAIN_ARCHITECTURE.md` states explicitly that those strings are configuration, not constitutional values. |
| 7 | Vercel configuration | None in the repository. Deployment is `scripts/deploy.sh` (fails closed without `VERCEL_TOKEN`). |
| 8 | Middleware / proxy | None. |
| 9 | Auth enforcement | `resolvePrincipal()` (DB-backed opaque session token, `beyu_os_session` cookie) → `requirePrincipal()` / `requireAccess()` in every page; `guarded()` at the API boundary; `withTenantDatabaseContext` establishes RLS scope. |
| 10 | Deep-link checks | `/os/layout.tsx` → `checkBeyuOSAuthorization`; Agriculture/Ujenzi/Foundation layouts → `operatingSystemTenantInScope`; Finance pages → `requireAccess("finance:…")`; Health mount → session + federation link + tenant-domain gate. |
| 11 | Tenant / entity / country resolution | `tenantScopeIds`, `principal.entityScope`, `tenants.countryCode`, classification ceilings via `classificationsAtOrBelow`. Unchanged. |
| 12–15 | Health / Finance / Agriculture / Ujenzi implementations | All present (see #4). Health is the compiled `sectors/health` SPA behind the governed mount. |
| 16 | Tests per OS | `tests/frontend/sector-os-routes.test.ts`, `tests/frontend/health-spa-mount.test.ts`, `tests/tenant-domain/*`, `tests/authorization/*`, per-sector suites under `tests/agriculture`, `tests/finance`, `tests/ujenzi`, `tests/health`. |
| 17 | Domain-related migrations | 0063, 0064, 0065 (tenant-domain registry). Journal head is `0074_enterprise_intelligence_expansion`. |
| 18 | Domain env vars | None existed. `HEALTH_API_URL` is the only host-like variable. |
| 19 | Root / `www` behaviour | `/` = sign-in page (server-resolves the principal; authenticated users are routed to `/launcher` or the single authorized OS). `/launcher` = governed launcher. The apex→www 308 is a Vercel-level behaviour, not application code. |
| 20 | Pre-existing subdomain routing | **Partially**, for a different purpose: the tenant-domain registry can *refuse* a Health request on a hostname outside the Health namespace. Nothing selected an OS *home* from a hostname, nothing ran pre-authentication, and nothing knew `beyu.co.tz`. |
| — | Session cookie | `beyu_os_session`: `httpOnly`, `sameSite=lax`, `secure` in production, `path=/`, **host-only (no `Domain`)**. No explicit CSRF token or `Origin` check existed; protection relied on `SameSite=Lax` + JSON bodies. |
| — | Unmerged PRs | No open PR contains subdomain-routing work (open PRs: #98, #96, #68, #67, #61, #54, #41, #31, #20, #14 — security patch, Noelia hardening, docs). Nothing was transplanted. |

Conclusion of the audit: the repository had **one** application, **one** OS
catalogue, **one** hostname normaliser, and **no** host-based routing layer.
The feature is therefore implemented as a thin, centralised addition on top of
those canonical pieces — no second application, registry, auth or Noelia.

---

## 1. Domain contract

```
health.beyu.co.tz       → HEALTH_OS       (catalogue code HEALTH,      home /os/health)
finance.beyu.co.tz      → FINANCE_OS      (catalogue code FINANCE,     home /os/finance)
agriculture.beyu.co.tz  → AGRICULTURE_OS  (catalogue code AGRICULTURE, home /os/agriculture)
ujenzi.beyu.co.tz       → UJENZI_OS       (catalogue code UJENZI,      home /os/ujenzi)

beyu.co.tz / www.beyu.co.tz → BEYU OS control plane, sign-in, /launcher (unchanged)
```

* The **label** of each subdomain lives on the canonical catalogue entry
  (`subdomain` on `SECTOR_OPERATING_SYSTEMS` in
  `src/lib/operating-system-catalog.ts`). Foundation OS and the control plane
  carry no label on purpose; shared capabilities (Family Office, HCM, …) are
  not operating systems and can never receive one.
* The **apex** is deployment configuration: `BEYU_CANONICAL_DOMAIN=beyu.co.tz`.
  When the variable is unset (today's state of every environment) **no host
  resolves to a sector**, and the application behaves exactly as before.
* Resolution is one pure function, `resolveSectorHost()` in
  `src/lib/sector-domains.ts`, built on the ONE existing hostname normaliser
  (`src/lib/tenant-domain/hostname.ts`). It accepts only an **exact** match of
  `<label>.<apex>` (after lower-casing, port stripping and root-dot removal).
  `www.<apex>` and `<apex>` are the canonical root. Every other value —
  `evil-health.beyu.co.tz`, `health.beyu.co.tz.attacker.example`,
  `x.health.beyu.co.tz`, an IP literal, a `*.vercel.app` preview host,
  `localhost`, a malformed Host — resolves to **no sector** (`NEUTRAL`) and the
  control-plane behaviour applies with every existing check. There is no
  wildcard and no fallback sector.
* Local development: outside production (`NODE_ENV !== "production"`),
  `health.localhost`, `finance.localhost`, `agriculture.localhost` and
  `ujenzi.localhost` resolve to their sector so the routing can be exercised
  with `next dev` (browsers resolve `*.localhost` to loopback). This is
  disabled in production builds.
* Preview environments (`*.vercel.app`) are `NEUTRAL`: the sector routing is
  simply inactive there, which is the safe state. A preview that needs sector
  hosts must be given its own `BEYU_CANONICAL_DOMAIN` with matching custom
  domains — nothing is inferred from the preview URL.

### Hostname → sector is presentation. It is never authorization.

A hostname selects **which home a request is offered** and **which cross-sector
paths are redirected to their canonical host**. It never selects a tenant, a
role, a permission, an entity, a country or a classification, and it never
skips a gate. The security chain for every request on every host is unchanged:

```
request
→ trusted hostname normalisation (resolveSectorHost — selects a home, grants nothing)
→ canonical session (resolvePrincipal — DB-backed token, no URL/host input)
→ GlobalUserID / tenant / entity / country / classification (Principal)
→ RBAC / ABAC (can()), permission, policy
→ OS authorization (authorizedOperatingSystems / operatingSystemTenantInScope /
  checkHealthOSAuthorization / checkBeyuOSAuthorization)
→ RLS (withTenantDatabaseContext)
→ route / action
→ audit / event
```

---

## 2. Routing behaviour (`src/proxy.ts` + server components)

`src/proxy.ts` (Next.js 16 proxy, formerly "middleware") is the ONE place a
hostname is turned into a routing decision, and it delegates the decision to
the pure function `decideProxyAction()` so the behaviour is unit-tested without
a server. It performs exactly three things:

| Situation | Action |
| --- | --- |
| Unsafe method (`POST`/`PUT`/`PATCH`/`DELETE`) with an `Origin` header whose host is neither the request host nor a canonical BEYU host | `403` (uniform, information-free). Safe methods, requests without `Origin` (server-to-server webhooks, the mobile API) and same-origin requests are untouched. No CORS header is ever added. |
| Sector host, path owned by a **different** canonical sector (e.g. `health.beyu.co.tz/os/finance`, `finance.beyu.co.tz/health/os`) | `307` to the SAME path on that sector's canonical host. The target host is built from the catalogue + `BEYU_CANONICAL_DOMAIN`, never from request input, and is always `https://` for the canonical apex. This cannot loop: the target host owns the path, so the redirected request is served. |
| Everything else | `NextResponse.next()` — served in place. |

Deliberately **not** done:

* No redirect from `www.beyu.co.tz/os/health` (or any other existing route) to
  the subdomain. Every pre-existing URL keeps working on `www` exactly as
  before. Canonical subdomains are additional entry points, not a migration
  that breaks bookmarks or deep links.
* No redirect of `/`, `/launcher`, `/os`, shared capabilities, Foundation, the
  administration surfaces or any `/api/*` route on a sector host. They are
  served in place with their own guards (an API client must never receive a
  cross-host 307).
* No host-based decision in any API route handler. The only per-route host
  checks are refusals (see §3).

### Canonical home

`/` on a sector host is still the sign-in page (`src/app/page.tsx`); it reads
the host server-side through `sectorHostForRequest()`:

* **Unauthenticated** → the sign-in form is rendered for that sector ("Sign in
  to Health OS — governed by BEYU OS"). After a successful login the form
  navigates to the sector home computed **server-side** (`/os/health`), never to
  a value from the URL or the client. The home then runs its own gate.
* **Authenticated and authorized for that sector** (proved by the existing
  `authorizedOperatingSystems()` resolver) → `307` to the sector home.
* **Authenticated but not authorized for that sector** → the pre-existing
  behaviour (launcher if several destinations, the single destination, or the
  sign-in surface). Reaching `health.beyu.co.tz` never makes a principal a
  Health principal.

---

## 3. Server-side refusals (defence in depth)

The proxy redirect is a convenience; the following refusals are enforced
server-side on every request regardless of the proxy:

| Surface | Check | Outcome on mismatch |
| --- | --- | --- |
| Health mount (`src/app/os/health/mount.ts`, both `/os/health` and `/health/os`) | `isForeignSectorHost(host, "HEALTH")` next to the existing tenant-domain gate | uniform `404` (`hostnameDenialResponse()`), before the federation gate and before any document is produced |
| Agriculture layout | `isForeignSectorHost(host, "AGRICULTURE")` | `notFound()` |
| Ujenzi layout | `isForeignSectorHost(host, "UJENZI")` | `notFound()` |
| Finance layout (new, host check only — pages keep `requireAccess`) | `isForeignSectorHost(host, "FINANCE")` | `notFound()` |

A "foreign sector host" is a host that resolves to a **different** sector; a
`NEUTRAL` host (www, apex, preview, localhost, no Host) never triggers it. All
existing gates (session, federation, tenant scope, permission, RLS) run as
before and are untouched.

The DB-backed tenant-domain registry remains the authority for governed
**tenant** hostnames (`<tenant>.health.…`). Registering the four canonical
subdomains as `OS_BASE` rows is **not** required for this feature and no
migration is added; if an operator later registers them, the existing resolver
already refuses cross-namespace hosts in the same direction as the proxy.

---

## 4. Session / cookie / CSRF

Audit result and decisions:

| Item | Before | After |
| --- | --- | --- |
| Cookie name / flags | `beyu_os_session`, `httpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`, host-only | Same flags, same name. Issued through ONE helper (`src/lib/session-cookie.ts`) used by login **and** logout. |
| Cookie `Domain` | never set | Still never set by default. Set to the apex **only** when (a) `BEYU_SESSION_COOKIE_DOMAIN` is configured, (b) it is exactly equal to `BEYU_CANONICAL_DOMAIN`, and (c) the request host is that apex or one of its subdomains. A `*.vercel.app` or `localhost` request never receives a domain-scoped cookie (browsers would reject it, and it must not be attempted). When a domain is applied, `Secure` is forced on regardless of mode. |
| Logout | `jar.delete(name)` (would NOT clear a domain-scoped cookie) | Clears both the host-only and the domain-scoped variant, so sign-out works on every canonical host after SSO is enabled. |
| CSRF | `SameSite=Lax` + JSON bodies, no `Origin` check | Unchanged protections **plus** the proxy `Origin` check for unsafe methods (§2). No permissive CORS, no wildcard origins. |
| Callback / OAuth / SSO redirects | none exist (password + TOTP only) | n/a |
| Password reset / e-mail verification | not implemented in this repository | n/a |
| MFA / step-up | session fields (`mfaSatisfied`, `mfaExpiresAt`), re-evaluated per request | unchanged; travels with the session wherever the cookie is valid |
| Realtime / WebSocket | none | n/a |

Is authentication shared across `www` and the four sector hosts?

* **Default (nothing configured): NO.** Each host is its own sign-in surface
  with a host-only cookie. The launcher and navigation therefore keep their
  relative `/os/<sector>` links (they stay on the current host), and the
  sector subdomains are independent entry points.
* **With `BEYU_CANONICAL_DOMAIN=beyu.co.tz` AND
  `BEYU_SESSION_COOKIE_DOMAIN=beyu.co.tz`: YES, deliberately.** The cookie is
  scoped to the apex, so a session established on `www.beyu.co.tz` is valid on
  `health.beyu.co.tz` etc., and the launcher / sidebar / capability map advertise
  the four canonical absolute URLs. This is the narrowest configuration that
  gives the intended "sign in once at BEYU, launch a Sector OS on its own
  subdomain" experience: the scope is the registrable domain `beyu.co.tz`
  (`co.tz` is a public suffix) and nothing wider. Trade-off stated plainly: any
  host under `beyu.co.tz` then receives the session cookie, so no untrusted
  service may ever be hosted under the apex. Enabling this is a human,
  per-environment decision.
* Users holding a pre-existing host-only cookie are unaffected: it stays valid
  on `www`; their first visit to a sector host asks them to sign in once, after
  which the domain-scoped cookie applies. Logout clears both variants.

---

## 5. Noelia / HIVE

Nothing changed in Noelia or HIVE and nothing was duplicated. `NOELIA_AI`
remains the single identity (`src/lib/noelia/canonical-identity.ts`); the OS
context is still resolved from the canonical registry **by route**
(`noeliaOSContextForPath`), and routes are the same on every host
(`health.beyu.co.tz/os/health` → `HEALTH_OS`). Provider identity remains
separate. There is no `HEALTH_NOELIA`, `FINANCE_NOELIA`, `AGRICULTURE_NOELIA`
or `UJENZI_NOELIA` (asserted by test).

---

## 6. DNS (DUHosting) — HUMAN ACTION REQUIRED

Nothing in this change touches DNS, and the sandbox cannot reach DUHosting or
Vercel. The following is the plan, not a completed action.

**Must remain untouched:** the apex `A @ 216.198.79.1`, nameservers, DNSSEC,
`MX`, `SPF` (`TXT`), `DKIM` (`*._domainkey`), `DMARC` (`_dmarc`), and any other
existing record. The working `beyu.co.tz → 308 → www.beyu.co.tz → 200`
behaviour must not be reconfigured.

**To add (one record per Sector OS):**

| Type | Name | Value | Notes |
| --- | --- | --- | --- |
| `CNAME` | `health` | *the target Vercel displays when the domain is added to the project* | Vercel's usual CNAME target is `cname.vercel-dns.com`; **read the exact value from the Vercel domain panel** rather than assuming it. |
| `CNAME` | `finance` | same procedure | |
| `CNAME` | `agriculture` | same procedure | |
| `CNAME` | `ujenzi` | same procedure | |

No wildcard (`*`) record is to be created: the application resolves exact
hostnames only, and a wildcard would route unknown names to the deployment.

---

## 7. Vercel domain configuration — HUMAN ACTION REQUIRED

1. In the **existing** BEYU OS Vercel project (the one serving
   `www.beyu.co.tz`), add the four domains `health.beyu.co.tz`,
   `finance.beyu.co.tz`, `agriculture.beyu.co.tz`, `ujenzi.beyu.co.tz`. Do not
   create a new project or a per-OS deployment; all four are served by the same
   deployment and `src/proxy.ts` routes by hostname.
2. Create the CNAME records Vercel shows (§6). Wait for verification.
3. Set the environment variables on the project (Production, and Preview only
   if the preview has matching custom domains):
   * `BEYU_CANONICAL_DOMAIN=beyu.co.tz` — enables sector-host resolution;
   * `BEYU_SESSION_COOKIE_DOMAIN=beyu.co.tz` — enables the shared session
     (optional but required for the launch-from-`www` UX, see §4).
4. Promote through the existing governed pipeline. Both variables are read at
   request time; no code change is required to turn the feature on or off.

### HTTPS

Vercel issues certificates automatically once each domain is verified. Until
then the subdomains are **not** reachable over HTTPS and must not be reported
as such. Redirect targets generated by the proxy are always `https://` for the
canonical apex; no HTTP-only behaviour is introduced and no certificate
validation is bypassed. **No HTTP check of the four subdomains was possible
from the sandbox; none is claimed.**

---

## 8. Rollback

* **Immediate, no deploy:** unset `BEYU_CANONICAL_DOMAIN` (and
  `BEYU_SESSION_COOKIE_DOMAIN`). Sector-host resolution stops, the launcher
  reverts to relative links, new sessions are host-only again. Existing
  domain-scoped cookies are cleared on next logout or expire with the session
  TTL (12 h).
* **Domain level:** remove the four domains from the Vercel project; the CNAME
  records can then be removed. `www`/apex are unaffected at every step.
* **Code level:** revert the PR. There is no migration to roll back.

---

## 9. Files

| File | Role |
| --- | --- |
| `src/lib/operating-system-catalog.ts` | optional `subdomain` label on exactly the four canonical Sector OS entries (`HEALTH`, `FINANCE`, `AGRICULTURE`, `UJENZI`) |
| `src/lib/sector-domains.ts` | pure contract (no `next/*`, no DB): `parseCanonicalDomain`, `sectorDomainOptionsFromEnvironment`, `resolveSectorHost`, `isCanonicalBeyuHost`, `sectorOwningPath` (catalogue `href` + `ADDITIONAL_OWNED_PREFIXES`, currently `HEALTH → /health`), `canonicalSectorOrigin`, `decideProxyAction`, `canonicalDestinationHref` |
| `src/lib/sector-host.ts` | `next/headers` wrappers: `sectorHostForRequest`, `isForeignSectorHost`, `requestIsOnForeignSectorHost`, `destinationHrefForRequest` |
| `src/lib/session-cookie.ts` | the one session-cookie policy: `sessionCookieDomain`, `sessionSharedAcrossCanonicalDomain`, `sessionCookieAttributes`, `sessionCookieClearTargets` |
| `src/proxy.ts` | Next 16 proxy adapter: request facts → `decideProxyAction` → 403 / 307 / next (matcher skips `_next/static`, `_next/image`, `brand/`, `noelia/`, favicon, manifest, `NOELIA.png`) |
| `src/app/page.tsx`, `src/app/sign-in-form.tsx` | sector-aware sign-in copy and post-login landing (`landing` prop, relative-path-only) |
| `src/app/launcher/page.tsx`, `src/app/os/layout.tsx`, `src/app/os/nav-link.tsx`, `src/app/os/capability-map.tsx` | canonical subdomain links only when the shared-session condition holds and the current host is canonical |
| `src/app/os/health/mount.ts` | `hostnameDenialResponse()` (404) on a foreign sector host |
| `src/app/os/{agriculture,ujenzi}/layout.tsx`, `src/app/os/finance/layout.tsx` (new) | `notFound()` on a foreign sector host, after `requirePrincipal` |
| `src/app/api/v1/auth/login/route.ts`, `src/app/api/v1/auth/logout/route.ts` | `sessionCookieAttributes(host)` / `sessionCookieClearTargets(host)` adoption |
| `tests/sector-domains/sector-domain-contract.test.ts` | hostname resolution, ownership, proxy decision, link generation (pure) |
| `tests/sector-domains/session-cookie.test.ts` | cookie scope/clear policy (pure) |
| `tests/sector-domains/sector-subdomain-security.test.ts` | source-level invariants: no scattered hostname comparisons, no `*_NOELIA`/duplicate identities, no migration, no `vercel.json`, no `.env` |
| `tests/sector-domains/sector-subdomain-http.test.ts` | end-to-end against a running server (gated by `BEYU_TEST_BASE_URL`; sector cases additionally require `BEYU_TEST_CANONICAL_DOMAIN=beyu.co.tz` to match the server's `BEYU_CANONICAL_DOMAIN`) |
| `.env.example` | `BEYU_CANONICAL_DOMAIN`, `BEYU_SESSION_COOKIE_DOMAIN`, documented |
| `CHANGELOG.md`, `docs/architecture/TENANT_DOMAIN_ARCHITECTURE.md` | release note and cross-reference |

No Drizzle migration: `drizzle/meta/_journal.json` still ends at `0074_enterprise_intelligence_expansion`.
