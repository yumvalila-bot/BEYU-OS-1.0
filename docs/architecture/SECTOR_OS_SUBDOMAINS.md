# Canonical OS / Capability Entry Hosts — `health.` · `finance.` · `agriculture.` · `ujenzi.` · `foundation.` · `familyoffice.` · `noelia.` `beyu.co.tz`

Status: **IMPLEMENTED IN THE REPOSITORY (routing, security, session, tests, docs)** ·
**VERCEL DOMAINS + DNS: HUMAN-CONTROLLED, NOT DONE** · **HTTPS: PENDING DOMAIN
ATTACHMENT** · baseline `main` = `d6848e7308ccef87a904c151a2928013959ad111`
(PR #100) · updated 2026-10-08

> **THIS DOCUMENT OWNS HOST RESOLUTION, SESSION SCOPE AND THE PROXY CONTRACT.**
> The user-facing FRONTEND and SIGN-IN each canonical host renders — including
> the root-cause audit of why a correctly-resolving host used to serve the
> generic BEYU surface, the `/sign-in` route, the governed access-denied state,
> the destination presentation model, global OS status vs. the current
> identity's grant, and the Sector OS activation boundary — is
> **[`CANONICAL_DESTINATION_FRONTENDS.md`](./CANONICAL_DESTINATION_FRONTENDS.md)**.
> Read the two together; neither duplicates the other.

---

## 0. The principle (locked into the implementation)

```
BEYU OS GOVERNS.
EACH OS IS INDEPENDENTLY ADDRESSABLE.
THE SUBDOMAIN SELECTS THE OS CONTEXT.
THE SUBDOMAIN DOES NOT GRANT AUTHORIZATION.
AUTHENTICATION MAY BE SHARED.
AUTHORIZATION MUST BE RE-EVALUATED FOR THE TARGET OS/CONTEXT.
BEYU.CO.TZ IS THE CENTRAL BEYU EXPERIENCE,
NOT A MANDATORY GATEWAY TO EVERY OS.
```

```
HOSTNAME IDENTIFIES CONTEXT.   AUTHORIZATION GRANTS ACCESS.
```

A visitor who types `https://health.beyu.co.tz` is served Health OS **on that
host**. This loop is explicitly prohibited and does not exist anywhere in the
code or the configuration:

```
health.beyu.co.tz → beyu.co.tz → BEYU OS UI → health.beyu.co.tz      ✗
```

---

## 1. Canonical domain map

| Host | Context | Registry identity | Home |
| --- | --- | --- | --- |
| `beyu.co.tz`, `www.beyu.co.tz` | BEYU OS (constitutional control plane) | `os_registry` `BEYU_OS` (`CONTROL_PLANE`) | `/os` (sign-in at `/`) |
| `health.beyu.co.tz` | HEALTH_OS | `HEALTH_OS` (`SECTOR_OS`) | `/os/health` (+ `/health`, `/health/os` aliases) |
| `finance.beyu.co.tz` | FINANCE_OS | `FINANCE_OS` (`SECTOR_OS`) | `/os/finance` |
| `agriculture.beyu.co.tz` | AGRICULTURE_OS | `AGRICULTURE_OS` (`SECTOR_OS`) | `/os/agriculture` |
| `ujenzi.beyu.co.tz` | UJENZI_OS | `UJENZI_OS` (`SECTOR_OS`) | `/os/ujenzi` |
| `foundation.beyu.co.tz` | FOUNDATION (the nonprofit sister organisation's OS) | `FOUNDATION_OS` (`SECTOR_OS`, scope `NONPROFIT_OPERATIONS`) | `/os/foundation` |
| `familyoffice.beyu.co.tz` | FAMILY OFFICE **capability** — never an OS | `SHARED_FAMILY_OFFICE` (`SHARED_CAPABILITY`) | `/os/family` |
| `noelia.beyu.co.tz` | NOELIA_AI — the governed AI identity/interface | `NOELIA_AI` (the one canonical AI identity, `src/lib/noelia/canonical-identity.ts`) over `HIVE_RUNTIME` (`os_registry`, kind `AI_RUNTIME`) | `/os/noelia` |

Canonical identity rules preserved by this change (asserted by tests):

* **Five Sector OSs**, unchanged and un-renamed: `HEALTH_OS`, `FINANCE_OS`,
  `AGRICULTURE_OS`, `UJENZI_OS` and the already-registered `FOUNDATION_OS`.
  Foundation keeps its existing canonical identity — it is NOT turned into a
  Sector LLC, and no `FOUNDATION_OS` is invented (it already exists in
  `os_registry` and in the canonical catalogue).
* **Family Office remains a shared capability/domain**: no `FAMILY_OFFICE_OS`,
  no new route (`/os/family` is the existing capability page), and it stays out
  of `SECTOR_OPERATING_SYSTEMS`.
* **NOELIA_AI remains the single governed AI identity**: no
  `HEALTH_NOELIA`/`FINANCE_NOELIA`/`AGRICULTURE_NOELIA`/`UJENZI_NOELIA`, no
  sector-specific Noelia, and no new Noelia OS context. `noelia.beyu.co.tz` is
  simply an additional *entry point* to the same governed interface
  (`/os/noelia`), which remains reachable inside every OS context.
* **Ujenzi identity untouched**: OS = `UJENZI_OS`, tenant `BEYU-UJENZI`, entity
  `BEYU-UJZ`, entity type `CONSTRUCTION`.

### Where the facts come from

* The **label** of every host lives on the canonical catalogue
  (`src/lib/operating-system-catalog.ts` → `subdomain`): the five Sector OSs and
  the two canonical SHARED surfaces (`CANONICAL_SURFACES`). The control plane
  carries none — it IS the root.
* The **apex** is deployment configuration: `BEYU_CANONICAL_DOMAIN=beyu.co.tz`.
  Unset (today's state of every environment) **no host resolves to a
  destination** and the application behaves exactly as before.
* Resolution is one pure function, `resolveCanonicalHost()` in
  `src/lib/canonical-hosts.ts`, built on the ONE existing hostname normaliser
  (`src/lib/tenant-domain/hostname.ts`). Exact match only.
* There is exactly **one** hostname→context mechanism: the request proxy
  (`src/proxy.ts`), the sign-in page, the launcher/navigation and the per-OS
  refusals all consume it. No file outside `src/lib/canonical-hosts.ts` builds a
  hostname from a label (asserted by a repository-wide source test).

---

## 2. What each entry point does (the required user experience)

| Case | User enters | Result |
| --- | --- | --- |
| A | `health.beyu.co.tz` | Health OS entry (its own sign-in copy, landing `/os/health`) → session → BEYU identity/security validation → Health federation + tenant-domain + authorization → Health OS home/SPA. |
| B | `finance.beyu.co.tz` | FINANCE_OS entry → shared BEYU identity/governance checks → Finance `requireAccess("finance:…")` → Finance workspace. |
| C | `agriculture.beyu.co.tz` | AGRICULTURE_OS entry → shared identity → `BEYU-AGRI` tenant/classification scope → Agriculture workspace. |
| D | `ujenzi.beyu.co.tz` | UJENZI_OS entry → shared identity → `BEYU-UJENZI` scope → Ujenzi workspace. |
| E | `foundation.beyu.co.tz` | Foundation entry → shared identity, governance, tenant/role/safeguarding/authorization model (+ `BEYU-FOUNDATION` scope, entity-scope refusal) → Foundation workspace. |
| F | `familyoffice.beyu.co.tz` | FAMILY OFFICE capability entry → `family:member.read` (the page's own guard) → Family Office capability surface. |
| G | `noelia.beyu.co.tz` | NOELIA_AI entry → `ai:noelia.query` (the page's own guard) → governed AI interface. Provider ≠ Noelia identity. |

In every case the **browser URL stays the canonical hostname** and the
destination route re-runs its own server-side gate on arrival. `beyu.co.tz` /
`www.beyu.co.tz` remain the central BEYU experience (identity/account,
organisation/tenant overview, launcher, governance, security, audit,
permissions, navigation) — a convenient index, **never a prerequisite**.

### Authorized vs. unauthorized entry

* Unauthenticated → that destination's own sign-in surface (200), titled for the
  destination. No redirect to another host, no redirect chain.
* Unauthenticated deep link → one `307` to `/` **on the same host**.
* Authenticated, authorized (resolved by the destination's own gate) → the
  destination home.
* Authenticated, **not** authorized → the governed DESTINATION denial, rendered
  on the host that was asked for: *"You are signed in, but you are not authorized
  for Health OS."*, with the destination's GLOBAL status (`ACTIVE`) and THIS
  identity's access (`Not authorized`) stated separately. The visitor is **not**
  redirected to `/launcher` and **not** forwarded to a different OS they do hold.
  Any deep link still meets the destination's own governed denial
  (`Authorisation denied`, the Foundation scope denial, or the Health
  entry/denial page). A hostname never adds access.

  *(This replaced the earlier behaviour, in which a destination host fell through
  to the control-plane routing and `307`-ed the visitor to `/launcher`. See
  `CANONICAL_DESTINATION_FRONTENDS.md` §1.2 (4).)*

---

## 3. Routing behaviour (`src/proxy.ts` + server components)

`src/proxy.ts` (Next.js 16 proxy, formerly "middleware") is the ONE place a
hostname is turned into a routing decision, and it delegates the decision to the
pure function `decideProxyAction()` so the behaviour is unit-tested without a
server. It performs exactly three things:

| Situation | Action |
| --- | --- |
| Unsafe method (`POST`/`PUT`/`PATCH`/`DELETE`) with an `Origin` header whose host is neither the request host nor a canonical BEYU host | `403` (uniform, information-free). Safe methods, requests without `Origin` (server-to-server webhooks, the mobile API) and same-origin requests are untouched. No CORS header is ever added. |
| Canonical OS/surface host, path owned by a **different** canonical OS (e.g. `health.beyu.co.tz/os/finance`, `finance.beyu.co.tz/health/os`, `noelia.beyu.co.tz/os/ujenzi`, `health.beyu.co.tz/os/foundation`) | `307` to the SAME path on that OS's canonical host. The target host is built from the catalogue + `BEYU_CANONICAL_DOMAIN`, never from request input, and is always `https://` for the canonical apex. This cannot loop: the target host owns the path, so the redirected request is served. |
| Everything else | `NextResponse.next()` — served in place. |

Deliberately **not** done:

* No redirect **from** `www.beyu.co.tz` (or from the apex) to a destination host.
  Every pre-existing URL keeps working on `www` exactly as before; canonical
  hosts are additional entry points, not a migration that breaks bookmarks.
* No redirect **to** `beyu.co.tz` from a destination host — that is the
  prohibited loop.
* Shared surfaces (`/os/family`, `/os/noelia`) and the control plane (`/os`,
  `/launcher`, `/api/*`) are served in place on every canonical host. Noelia
  remains available inside each OS context.
* No rewrite of an OS home onto another path: the canonical route names are
  unchanged (`/os/<sector>`), so internal links, history and deep links keep
  working.

### Defence in depth (server-side refusals, unchanged in kind)

| Surface | Refusal |
| --- | --- |
| Health mount (`src/app/os/health/mount.ts`) | `isForeignOSHost(host, "HEALTH")` → uniform `404`, evaluated **before** the federation gate and before the SPA document |
| Agriculture / Ujenzi / Finance / Foundation layouts | `requestIsOnForeignOSHost(code)` after `requirePrincipal()` → `notFound()` |
| Finance pages | `requireAccess("finance:…")` (unchanged) |
| Foundation pages | `requireAccess("foundation:…")` + layout scope gate (unchanged) |
| Family Office / Noelia pages | `requireAccess("family:member.read")` / `requireAccess("ai:noelia.query")` (unchanged) |

A "foreign host" is another OS's canonical host **or** a canonical
shared-surface host (a capability/AI host carries no OS identity). A `NEUTRAL`
host (www, apex, preview, localhost, no Host) and the OS's own host pass
through to the existing gates.

The DB-backed tenant-domain registry remains the authority for governed
**tenant** hostnames (`<tenant>.health.beyuos.co.tz`). Registering the canonical
entry hosts as `OS_BASE` / `CAPABILITY_BASE` rows is **not** required for this
feature (they live on the production apex, not in the `beyuos.co.tz` registry
namespace) and **no migration is added**.

---

## 4. OS switching

```
health.beyu.co.tz → (sidebar / launcher / capability map) → finance.beyu.co.tz
```

* The launcher, the `/os` sidebar and the capability map render each
  destination's **canonical absolute URL** through the ONE helper
  (`destinationHrefForRequest()`), and only when the deployment declares a
  canonical apex *and* the session is shared across it *and* the current request
  arrived on the apex. Otherwise they keep the pre-existing relative routes. No
  file hand-builds a hostname.
* A shared authenticated identity/session may be reused
  (`BEYU_SESSION_COOKIE_DOMAIN`, §5). **Authentication ≠ authorization**: the
  destination re-runs tenant, entity, country, role, permission, policy,
  classification, delegation and RLS checks on arrival.
* A principal without Finance access who navigates to `finance.beyu.co.tz`
  obtains nothing: the host resolves the context, the Finance gate denies.
* There is no second session system and no per-OS login: switching cannot
  produce a login loop. When `BEYU_SESSION_COOKIE_DOMAIN` is **not** configured,
  each host is its own sign-in surface by design (documented trade-off), and the
  links intentionally stay relative.

---

## 5. Session / cookie / CSRF

| Item | Behaviour |
| --- | --- |
| Cookie name / flags | `beyu_os_session`, `httpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`. Issued through ONE helper (`src/lib/session-cookie.ts`) used by login **and** logout. |
| Cookie `Domain` | Never set by default. Set to the apex **only** when (a) `BEYU_SESSION_COOKIE_DOMAIN` is configured, (b) it equals `BEYU_CANONICAL_DOMAIN` exactly, and (c) the request host is that apex or one of its subdomains. A `*.vercel.app` or `localhost` request never receives a domain-scoped cookie. With a domain, `Secure` is forced on. |
| Logout | Clears both the host-only and the domain-scoped variant. |
| CSRF | Existing `SameSite=Lax` + JSON bodies **plus** the proxy `Origin` check for unsafe methods. No permissive CORS, no wildcard origins. |
| MFA / step-up | Session fields, re-evaluated per request; travels with the session wherever the cookie is valid. |
| Deep links | A URL is never authentication. Every OS/context entry enforces identity, session, tenant, entity, country, OS, role, permission, classification, policy and delegation/consent server-side, and RLS remains the database backstop. |

Enabling `BEYU_SESSION_COOKIE_DOMAIN` has a stated cost: any host under the apex
then receives the session cookie, so **no untrusted service may ever be hosted
under the apex**.

---

## 6. Noelia / HIVE

Nothing changed in Noelia or HIVE and nothing was duplicated. `NOELIA_AI`
remains the single identity (`src/lib/noelia/canonical-identity.ts`); the OS
context is still resolved from the canonical registry **by route**
(`noeliaOSContextForPath`), and routes are the same on every host
(`health.beyu.co.tz/os/health` → `HEALTH_OS`). `noelia.beyu.co.tz` adds an entry
hostname to the existing governed interface; it creates no new Noelia identity,
no sector Noelia, no new appearance context and no navigation module.

---

## 7. DNS (registrar) — HUMAN ACTION REQUIRED

Nothing in this change touches DNS, and the sandbox cannot reach the registrar
or Vercel. The following is the plan, not a completed action.

**Must remain untouched:** the apex `A @ 216.198.79.1`, nameservers, DNSSEC,
`MX`, `SPF` (`TXT`), `DKIM` (`*._domainkey`), `DMARC` (`_dmarc`), and any other
existing record. The working `beyu.co.tz → 308 → www.beyu.co.tz → 200`
behaviour must not be reconfigured.

**To add — one record per entry host:**

| Type | Name | Value | Notes |
| --- | --- | --- | --- |
| `CNAME` | `health` | *the target Vercel displays when the domain is added to the project* | Vercel's usual CNAME target is `cname.vercel-dns.com`; **read the exact value from the Vercel domain panel** rather than assuming it. |
| `CNAME` | `finance` | same procedure | |
| `CNAME` | `agriculture` | same procedure | |
| `CNAME` | `ujenzi` | same procedure | |
| `CNAME` | `foundation` | same procedure | |
| `CNAME` | `familyoffice` | same procedure | |
| `CNAME` | `noelia` | same procedure | |

No wildcard (`*`) record is to be created: the application resolves exact
hostnames only, and a wildcard would route unknown names to the deployment.

---

## 8. Vercel domain configuration — HUMAN ACTION REQUIRED

1. In the **existing** BEYU OS Vercel project (the one serving
   `www.beyu.co.tz`), add the seven domains listed above. Do not create a new
   project or a per-OS deployment; all of them are served by the same deployment
   and `src/proxy.ts` routes by hostname.
2. Create the CNAME records Vercel shows (§7). Wait for verification.
3. Set the environment variables on the project (Production, and Preview only if
   the preview has matching custom domains):
   * `BEYU_CANONICAL_DOMAIN=beyu.co.tz` — enables canonical-host resolution;
   * `BEYU_SESSION_COOKIE_DOMAIN=beyu.co.tz` — enables the shared session
     (optional, but required for the "sign in once at BEYU, then switch OS"
     experience, §4).
4. **Attach all seven hosts before enabling the feature in production**:
   resolving a hostname and linking to it are separate facts, and cross-OS links
   rendered from a canonical host point at the sibling canonical hosts.
5. Promote through the existing governed pipeline. Both variables are read at
   request time; no code change is required to turn the feature on or off.

### HTTPS

Vercel issues certificates automatically once each domain is verified. Until
then the new hostnames are **not** reachable over HTTPS and must not be reported
as such. Redirect targets generated by the proxy are always `https://` for the
canonical apex; no HTTP-only behaviour is introduced and no certificate
validation is bypassed. **No HTTP check of these hostnames was possible from the
sandbox; none is claimed.** Nothing in this repository created a DNS record, a
certificate or a Vercel domain.

---

## 9. Rollback

* **Immediate, no deploy:** unset `BEYU_CANONICAL_DOMAIN` (and
  `BEYU_SESSION_COOKIE_DOMAIN`). Host resolution stops, the launcher reverts to
  relative links, new sessions are host-only again. Existing domain-scoped
  cookies are cleared on next logout or expire with the session TTL (12 h).
* **Domain level:** remove the seven domains from the Vercel project; the CNAME
  records can then be removed. `www`/apex are unaffected at every step.
* **Code level:** revert the PR. There is no migration to roll back.

---

## 10. Files

| File | Role |
| --- | --- |
| `src/lib/operating-system-catalog.ts` | canonical registry: `subdomain` label on the five OS entries; `CANONICAL_SURFACES` (Family Office capability, NOELIA_AI interface) with their declared guard permission |
| `src/lib/canonical-hosts.ts` | the ONE pure hostname→context contract (no `next/*`, no DB): `parseCanonicalDomain`, `canonicalHostOptionsFromEnvironment`, `resolveCanonicalHost`, `canonicalContextOf`, `resolutionBase`, `isCanonicalBeyuHost`, `osOwningPath`, `canonicalOrigin`, `decideProxyAction`, `canonicalDestinationHref` |
| `src/lib/canonical-host.ts` | `next/headers` wrappers: `canonicalHostForRequest`, `isForeignOSHost`, `requestIsOnForeignOSHost`, `destinationHrefForRequest` |
| `src/lib/session-cookie.ts` | the one session-cookie policy: `sessionCookieDomain`, `sessionSharedAcrossCanonicalDomain`, `sessionCookieAttributes`, `sessionCookieClearTargets` |
| `src/proxy.ts` | Next 16 proxy adapter: request facts → `decideProxyAction` → 403 / 307 / next (matcher skips `_next/static`, `_next/image`, `brand/`, `noelia/`, favicon, manifest, `NOELIA.png`) |
| `src/app/page.tsx`, `src/app/sign-in-form.tsx` | destination-aware sign-in copy and post-login landing (`landing` prop, relative-path-only) |
| `src/app/launcher/page.tsx`, `src/app/os/layout.tsx`, `src/app/os/capability-map.tsx` | canonical entry-host links only when the shared-session condition holds and the current host is canonical; the Family Office card is driven by `CANONICAL_SURFACES` |
| `src/app/os/health/mount.ts` | `hostnameDenialResponse()` (404) on a foreign OS/surface host |
| `src/app/os/{agriculture,ujenzi,finance,foundation}/layout.tsx` | `notFound()` on a foreign OS/surface host, after `requirePrincipal()` (the Finance layout was added in PR #100; the Foundation check is new here) |
| `src/app/api/v1/auth/login/route.ts`, `.../logout/route.ts` | `sessionCookieAttributes(host)` / `sessionCookieClearTargets(host)` |
| `src/app/api/v1/authorization/context/route.ts`, `.../mobile/context/route.ts` | tenant-isolation probe; governed work now runs inside the connection-pinned RLS context (defect fixed, §11) |
| `tests/sector-domains/canonical-host-contract.test.ts` | hostname resolution, path ownership, proxy routing + loop proof + Origin check, navigation hrefs, shared-surface and tenant-isolation invariants (pure) |
| `tests/sector-domains/canonical-entry-points.test.ts` | the entry-point acceptance matrix A–J: every host is real, served in place, no apex hop, no loop, gates intact |
| `tests/sector-domains/canonical-host-security.test.ts` | source-level invariants: no scattered hostname comparison, no host→authority, no duplicate/`*_OS` identities, gates present, one session helper |
| `tests/sector-domains/canonical-host-http.test.ts` | end-to-end against a running server (gated by `BEYU_TEST_BASE_URL`; routing cases additionally require `BEYU_TEST_CANONICAL_DOMAIN=beyu.co.tz`) |
| `tests/sector-domains/session-cookie.test.ts` | cookie scope/clear policy (pure) |
| `.env.example` | `BEYU_CANONICAL_DOMAIN`, `BEYU_SESSION_COOKIE_DOMAIN`, and the full host map, documented |
| `CHANGELOG.md`, `docs/architecture/TENANT_DOMAIN_ARCHITECTURE.md` | release note and cross-reference |

No Drizzle migration: `drizzle/meta/_journal.json` still ends at
`0074_enterprise_intelligence_expansion`.

---

## 11. Defect found by this audit (fixed here)

`GET /api/v1/authorization/context` (and `GET /api/v1/authorization/mobile/context`) resolved the
principal correctly and then performed their audit and event writes — and their tenant-scoped reads —
on a bare pooled connection, with no `beyu.current_tenant_ids` / `beyu.global_scope` context. The
`audit_log` RLS policy evaluates `WITH CHECK (tenant_id = ANY (beyu_tenant_ids()) OR
beyu_global_scope())`, so the row was refused and **every authenticated call returned 500** —
fail-closed, but useless, and invisible to a suite that only asserted "not a 307". The web route now
wraps its governed work in `withTenantDatabaseContext(principal, …)` and the mobile twin in
`withDatabaseRlsContext([session.tenantId], false, …)`, the same connection-pinned, transaction-local
context `guarded()` already establishes; the context comes only from the resolved principal or the
validated session, never from the request. Verified 200 with byte-identical governed facts on every
canonical host by `tests/sector-domains/canonical-host-http.test.ts`.

This is recorded as a defect of the previous subdomain change (PR #100), found because the
entry-point audit asserts the POSITIVE result rather than the absence of a redirect.
