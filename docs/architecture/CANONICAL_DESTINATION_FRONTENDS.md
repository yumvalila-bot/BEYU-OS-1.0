# Canonical Destination Frontends — First-Class Entry + Destination-Aware Sign-In

Status: **READ-ONLY REALITY AUDIT COMPLETE → IMPLEMENTED IN THE REPOSITORY** ·
**VERCEL DOMAINS + DNS: HUMAN-CONTROLLED, UNCHANGED** ·
baseline `main` = `2bcff13badb26fdd2d71178040c8e85e3c0448ed` (PR #101) ·
companion document: `SECTOR_OS_SUBDOMAINS.md` (host resolution, session scope,
proxy contract) · updated 2026-10-08

This document answers one question the previous canonical-host work left open:

> **Why does a canonical host that resolves correctly still render the generic
> BEYU experience?**

and then records the smallest coherent extension that closes it. Nothing here
creates a second registry, a second identity system, a second routing
architecture, a second Vercel project or a database migration.

---

## 1. Reality audit — what `main` actually did

Verified by reading the code, not by inference. Every claim below cites the file
that proves it.

### 1.1 Host resolution was already correct and already safe

| Fact | Evidence |
| --- | --- |
| ONE hostname→destination contract exists | `src/lib/canonical-hosts.ts` (`resolveCanonicalHost`, `decideProxyAction`) |
| ONE presentation/routing catalogue exists | `src/lib/operating-system-catalog.ts` (`BEYU_CONTROL_PLANE`, `SECTOR_OPERATING_SYSTEMS`, `CANONICAL_SURFACES`) |
| ONE proxy adapter, no session/DB/authority in it | `src/proxy.ts` (reads `host`, `pathname`, `method`, `origin` only) |
| Exact-match only; hostile hosts resolve to `NEUTRAL` | `resolveCanonicalHost()` — `evil-health.<apex>`, `health.<apex>.attacker.example`, `x.health.<apex>`, IP literals, preview hosts all fall through |
| No `middleware.ts`, no `vercel.json`, no second Next app | asserted by `tests/sector-domains/canonical-host-security.test.ts` §3/§7 |
| Session sharing across the apex is opt-in and narrow | `src/lib/session-cookie.ts` (`BEYU_SESSION_COOKIE_DOMAIN` must equal `BEYU_CANONICAL_DOMAIN`) |
| The obsolete `sector-domains.ts` registry is gone | asserted absent by the same suite |

So the DNS/host layer was **not** the problem.

### 1.2 Root cause — five concrete defects

**(1) The proxy has no host-driven action for `/`.**
`decideProxyAction()` performs exactly two host-driven actions: an `Origin`
refusal for unsafe methods, and a 307 of a path *owned by a different Sector OS*
to that OS's canonical host. For `GET /` on any canonical host,
`osOwningPath("/")` returns `null`, so the decision is `NEXT` — and the request
falls through to the single root page `src/app/page.tsx`. That is correct and
must stay: rewriting `/` to `/os/health` at the proxy would be *unsafe*, because
the Health mount (`src/app/os/health/mount.ts`) 307s an unauthenticated visitor
back to `/`, which would then be rewritten again — an infinite loop. The proxy
reads no cookie and touches no database **by design** (pinned by tests), so it
cannot know whether a rewrite is safe. Destination selection therefore belongs
in the page layer, which can resolve the session.

**(2) `src/app/page.tsx` was destination-aware in two strings only.**
It read the canonical host (`canonicalHostForRequest()`) and adapted:

* the sub-line — `Sign in to Health OS — governed by BEYU OS`;
* the post-auth `landing` prop — `/os/health`.

Everything else on the page was the **generic BEYU control-plane surface**: the
BEYU OS mark, the headline *"The constitutional control plane of the BEYU
ecosystem"*, the five BEYU pillars, the `ZERO TRUST / RBAC + ABAC / …` strip,
`<form aria-label="Sign in to BEYU OS">` and the **"Enter BEYU OS"** submit
button. A visitor on `health.beyu.co.tz` therefore saw the BEYU launcher/landing
with one Health-flavoured sentence — **this is the root cause of the reported
symptom.**

**(3) `/sign-in` did not exist at all.**
Sign-in lived only at `/` (`src/app/sign-in-form.tsx` is a component, not a
route). `https://health.beyu.co.tz/sign-in` — the URL the canonical contract
requires — returned the Next.js 404 on **all eight** hosts.

**(4) Authenticated-but-unauthorized had no governed denial state.**
On a destination host, a principal without that destination's authorization fell
through to the pre-existing control-plane routing:
`if (destinations.length > 1) redirect("/launcher")` /
`if (destinations.length === 1) redirect(destinations[0].href)`. That **silently
redirects the visitor to a different OS**, which the architecture forbids; and a
principal holding zero destinations was shown the sign-in form again while
already signed in.

**(5) There was no global OS status in the frontend at all.**
`os_registry.lifecycle` is `ACTIVE` for `BEYU_OS`, `FINANCE_OS`, `HEALTH_OS`,
`AGRICULTURE_OS`, `FOUNDATION_OS` and `UJENZI_OS` in the canonical seed
(`src/db/seed.ts`, lines ~1645–1655; only `MINING_OS` is `DRAFT`). But the
launcher never read it: `src/app/launcher/page.tsx` rendered **only** the
per-user grant badge `AUTHORISED` / `NOT IN CURRENT GRANT`. That conflated
*global OS availability* with *this identity's access* — exactly the
contradiction §53/§54 of the requirement prohibits.

### 1.3 What was already correct and had to be preserved

* All four canonical Sector OSs already have real governed backends:
  `/api/v1/finance/*`, `/api/v1/agriculture/*` (100+ routes),
  `/api/v1/ujenzi/*` (30+ routes), Health via the federated mount +
  `/api/health/*`.
* Every OS route keeps its own server-side gate:
  `src/app/os/{finance,agriculture,ujenzi,foundation}/layout.tsx`
  (`requirePrincipal()` → `requestIsOnForeignOSHost()` → `operatingSystemTenantInScope()`
  → `Denied`), `src/app/os/health/mount.ts` (session → tenant-domain →
  `checkHealthOSAuthorization()`), `src/app/os/{family,noelia}/page.tsx`
  (`requireAccess(<declared entry permission>)`).
* The control-plane shell (`src/app/os/layout.tsx`) keeps
  `checkBeyuOSAuthorization()` + `withTenantDatabaseContext()` (the RLS context).
* CAP_POSTING and the Finance journal POST fail-closed behaviour live in the
  Finance service/API layer, untouched by anything in this change.

**Conclusion: no backend activation work was required.** The four Sector OSs are
already registered `ACTIVE` and already backed by governed APIs. What was
missing was the **frontend entry layer** and the **status-vs-grant distinction**
in the UI.

---

## 2. The fix — smallest coherent extension

### 2.1 Canonical host map (single source of truth)

| Host | Destination | Type | Frontend | Sign-in | Global status |
| --- | --- | --- | --- | --- | --- |
| `beyu.co.tz`, `www.beyu.co.tz` | BEYU OS | Core (control plane) | BEYU | BEYU | ACTIVE |
| `health.beyu.co.tz` | HEALTH_OS | Sector OS | Health | Health | ACTIVE |
| `finance.beyu.co.tz` | FINANCE_OS | Sector OS | Finance | Finance | ACTIVE |
| `agriculture.beyu.co.tz` | AGRICULTURE_OS | Sector OS | Agriculture | Agriculture | ACTIVE |
| `ujenzi.beyu.co.tz` | UJENZI_OS | Sector OS | Ujenzi | Ujenzi | ACTIVE |
| `foundation.beyu.co.tz` | FOUNDATION | Nonprofit (registered `FOUNDATION_OS`, `SECTOR_OS`) | Foundation | Foundation | ACTIVE |
| `familyoffice.beyu.co.tz` | Family Office | Capability (`SHARED_FAMILY_OFFICE`) | Family Office | Family Office | ACTIVE |
| `noelia.beyu.co.tz` | NOELIA_AI | AI interface (`HIVE_RUNTIME`) | Noelia | Noelia | ACTIVE |

Destination **type** is now explicit in code (`destinationType` on every
catalogue entry) and is never flattened into "OS":

* `CORE` — the one constitutional control plane.
* `SECTOR_OS` — exactly four: `HEALTH_OS`, `FINANCE_OS`, `AGRICULTURE_OS`,
  `UJENZI_OS`.
* `NONPROFIT` — Foundation. A separate nonprofit **sister organisation** to the
  BEYU Holding Company, strategically governed through BEYU OS. It keeps its
  already-registered `FOUNDATION_OS` / `SECTOR_OS` constitutional identity
  (inventing or renaming it is prohibited); `destinationType` records the
  organisational distinction the registry `kind` cannot.
* `CAPABILITY` — Family Office. A shared capability/domain. No
  `FAMILY_OFFICE_OS` exists and none was created.
* `AI_INTERFACE` — NOELIA_AI. The single governed AI identity on the HIVE
  runtime. No `HEALTH_NOELIA` / `FINANCE_NOELIA` / `AGRICULTURE_NOELIA` /
  `UJENZI_NOELIA` / `FOUNDATION_NOELIA` exists and none was created.

### 2.2 What was added

| # | Change | File(s) |
| --- | --- | --- |
| 1 | Destination presentation + canonical status on the **existing** catalogue: `registryCode`, `destinationType`, `status`, `headline`, `accent`, `highlights`, and `destinationSignInSubtitle()` — ONE definition, no parallel table | `src/lib/operating-system-catalog.ts` |
| 2 | `destinationForResolution()` — resolves a host resolution to its full destination presentation (pure, no I/O) | `src/lib/canonical-hosts.ts` |
| 3 | `GovernedSignIn` — the ONE shared, destination-aware sign-in surface, and `DestinationDenied` — the governed access-denied state | `src/app/governed-sign-in.tsx` (new) |
| 4 | `/sign-in` canonical route on **every** host — it renders the SAME page component as `/`, so one sign-in implementation serves two canonical URLs and cannot diverge from it. Deliberately **no `loading.tsx`** on either entry route (see §3.3) | `src/app/sign-in/page.tsx` (new) |
| 5 | Root page: destination hosts render the destination frontend or the governed denial; apex/`www`/neutral render the unchanged BEYU control-plane surface | `src/app/page.tsx` |
| 6 | Sign-in form takes destination presentation props (`destinationName`, `sessionExpired`); defaults preserve the BEYU surface exactly | `src/app/sign-in-form.tsx` |
| 7 | `sessionCookiePresent()` — the truthful "session expired" signal (cookie present + null principal) | `src/lib/session-state.ts` (new) |
| 8 | Launcher separates **global OS status** from **this identity's access** | `src/app/launcher/page.tsx` |

### 2.3 What was deliberately NOT done

* **No proxy rewrite of `/`.** It would loop against the Health mount's
  unauthenticated 307 and would require the proxy to read a session — a control
  the repository explicitly forbids (§1.2 (1)).
* **No second registry.** `sector-domains.ts` stays deleted; the catalogue stays
  the one source.
* **No second identity system.** One login route (`/api/v1/auth/login`), one
  session cookie policy, one `resolvePrincipal()`, one session table. No
  `health_users` / `finance_users` / `ujenzi_users` / `noelia_users`, no
  duplicated password storage, no duplicated MFA, no parallel auth middleware.
* **No separate Vercel project, no DNS change, no `vercel.json`.**
* **No migration.** `os_registry.lifecycle` already reads `ACTIVE` for all four
  canonical Sector OSs; the last journal entry stays
  `0074_enterprise_intelligence_expansion`.
* **No new dependency.**
* **No capability was activated.** See §4.

---

## 3. Behaviour after the change

```
USER
 ↓
CANONICAL HOST              (resolveCanonicalHost — exact match, NEUTRAL on anything else)
 ↓
CANONICAL FRONTEND          (destinationForResolution — presentation only)
 ↓
SHARED BEYU IDENTITY/SESSION (one login route, one cookie policy, resolvePrincipal)
 ↓
SERVER AUTHORIZATION        (existing resolvers → the destination's OWN gate re-runs on arrival)
 ↓
OS / CAPABILITY / TENANT / ENTITY / COUNTRY / ROLE / PERMISSION
 ↓
RLS                         (withTenantDatabaseContext; authorization-context endpoints unchanged)
 ↓
AUDIT / POLICY / GOVERNANCE
 ↓
AUTHORIZED EXPERIENCE
```

| Request | Unauthenticated | Authenticated + destination access | Authenticated, no destination access |
| --- | --- | --- | --- |
| `health.beyu.co.tz/` | Health OS entry + **"Sign in to Health OS"** | → `/os/health` (same host) | **Health OS denial**, no redirect to another OS |
| `health.beyu.co.tz/sign-in` | Health OS sign-in | → `/os/health` (same host) | Health OS denial |
| `health.beyu.co.tz/os/finance` | 307 → `finance.beyu.co.tz/os/finance` | same | same |
| `finance.beyu.co.tz/` | Finance OS entry + sign-in | → `/os/finance` | Finance OS denial |
| `agriculture.beyu.co.tz/` | Agriculture OS entry + sign-in | → `/os/agriculture` | Agriculture OS denial |
| `ujenzi.beyu.co.tz/` | Ujenzi OS entry + sign-in | → `/os/ujenzi` | Ujenzi OS denial |
| `foundation.beyu.co.tz/` | Foundation entry + sign-in | → `/os/foundation` | Foundation denial |
| `familyoffice.beyu.co.tz/` | Family Office entry + sign-in | → `/os/family` | Family Office denial |
| `noelia.beyu.co.tz/` | Noelia entry + sign-in | → `/os/noelia` | Noelia denial |
| `beyu.co.tz/`, `www.beyu.co.tz/` | **unchanged** BEYU control-plane surface | **unchanged** smart routing (`/launcher` or the one destination) | **unchanged** |
| unknown / preview / hostile host | **unchanged** (`NEUTRAL` → control-plane surface, every gate in force) | unchanged | unchanged |

In every row the **browser stays on the canonical hostname**. No destination host
is ever 307/308-ed to `beyu.co.tz` to reach its own frontend.

### 3.1 Authentication vs authorization (unchanged, now visible)

* **Authentication is shared.** `GovernedSignIn` posts to the one
  `/api/v1/auth/login`; the destination only changes the *presentation* and the
  server-computed same-origin `landing` route.
* **Authorization is server-side and re-evaluated per destination.**
  The entry surface grants nothing: it reuses the pre-existing
  `authorizedOperatingSystems()` (session → resolved tenant subtree →
  classification ceiling → RBAC/ABAC → Health federation) for a Sector OS and
  the catalogue's declared `entryPermission` via `can()` for a shared surface —
  the same two checks, in the same order, that the launcher, the sidebar and the
  sign-in routing already used. No third opinion about destination access was
  introduced. The destination route then **re-runs its own gate on arrival**
  regardless of what the entry page decided.
* **Hostname ≠ permission.** `destinationAccess()` takes a `Principal` and
  returns a decision; a hostname can only ever *select* which decision to ask
  for. A `Host: health.beyu.co.tz` header cannot produce an authorized answer
  for a principal without Health access — pinned by tests.
* **SESSION ≠ AUTHORIZATION.** A shared apex-scoped session identifies the user
  on every canonical host; each destination still evaluates its own access. No
  forced credential re-entry was added, and no MFA/step-up, delegation/consent,
  classification-ceiling, country or entity restriction was relaxed.

### 3.2 The eight required frontend states

| Required state | Where it lives |
| --- | --- |
| Public entry page | `GovernedSignIn` — destination headline, class, registry code, global status, three honest highlights, BEYU governance strip |
| Sign-in page | the same surface: one shared `SignInForm`, destination-titled (`aria-label="Sign in to Health OS"`, submit `Enter Health OS`), served at `/` **and** `/sign-in` |
| Authentication loading state | inside the shared form: submit disables, `aria-busy`, label `Authenticating…`; a failure is announced through the assertive `beyu-signin-error` live region |
| Unauthorized state | `DestinationDenied` — "You are signed in, but you are not authorized for Health OS.", with global status and this identity's access stated separately |
| Authenticated landing | relative `redirect(<destination home>)` on the same canonical hostname |
| Error state | the pre-existing `src/app/error.tsx` boundary, plus the form's "control plane is unreachable" message |
| Session-expired handling | `sessionCookiePresent()` (`src/lib/session-state.ts`) + a null principal → a polite `role="status"` notice, distinct from a first-time visitor |
| Destination-aware navigation | canonical host links through the ONE helper (`canonicalDestinationHref`), plus `/launcher` |
| Mobile-first layout / accessible controls | one grid (`min-h-screen`, `sm:`/`lg:` breakpoints), semantic `h1`, labelled fields, `min-h-11` targets, visible focus rings |
| Shared BEYU identity presentation | the authoritative `BeyuOsLogo` on every destination surface — no destination- or tenant-specific BEYU logo exists |
| Server-side authorization | the destination's own gate, re-run on arrival; the entry surface grants nothing |

### 3.3 Why the entry routes have no `loading.tsx`

A route-level Suspense boundary commits the HTTP 200 and streams the fallback
**before** the page body resolves. The canonical entry page is a server-side
*router* as well as a surface: for a signed-in identity it calls
`redirect(<destination home>)`, which must leave the server as a real relative
**307** so the browser stays on the canonical hostname. Behind a `loading.tsx`
the status is already committed and Next.js degrades that redirect to a
client-side navigation — precisely the "client-side JavaScript as the primary
routing mechanism" this architecture forbids.

This was not theoretical: adding `src/app/sign-in/loading.tsx` made `/sign-in`
return **200** where `/` returned **307** for the same identity on the same host,
and the HTTP suite caught it. The boundary was removed and its absence is now
pinned by a test. The authenticated OS shell keeps its own pre-existing
`src/app/os/loading.tsx`, which is safe because that segment never redirects on
the identity's behalf.

### 3.4 Cross-host navigation

With `BEYU_SESSION_COOKIE_DOMAIN == BEYU_CANONICAL_DOMAIN`, one sign-in is valid
on every canonical host; the launcher/sidebar render canonical absolute host
links through the ONE helper (`canonicalDestinationHref`). Arriving on another
host re-runs that destination's gate: authorized → the destination; unauthorized
→ the governed denial. Health permissions are never inherited by Finance.

---

## 4. Sector OS activation — and its boundary

All four canonical Sector OSs are **ACTIVE**:

```
HEALTH_OS        status = ACTIVE   host = health.beyu.co.tz
FINANCE_OS       status = ACTIVE   host = finance.beyu.co.tz
AGRICULTURE_OS   status = ACTIVE   host = agriculture.beyu.co.tz
UJENZI_OS        status = ACTIVE   host = ujenzi.beyu.co.tz
```

That status mirrors the **already-committed** constitutional charter rows
(`os_registry.lifecycle = ACTIVE` in `src/db/seed.ts`) — it was not flipped from
`INACTIVE`, and no enum, label or migration was changed to produce it. It is now
also visible in the frontend, where previously only the per-user grant was.

> **Sector OS activation establishes the OS as a live governed operating
> environment. Individual capabilities remain independently governed and may be
> `NOT_IMPLEMENTED`, `NOT_CONNECTED`, `NOT_CERTIFIED`, `EVIDENCE_REQUIRED`, or
> otherwise restricted.**

Concretely, this change activates **no capability**:

* `FINANCE_OS = ACTIVE` does **not** enable `CAP_POSTING`. Finance journal POST
  stays fail-closed and separately governed.
* `UJENZI_OS = ACTIVE` does **not** certify engineering calculations, connect
  government integrations or implement BIM. Those keep their real states.
* `HEALTH_OS = ACTIVE` does **not** bridge the BEYU session into the sector
  runtime's own JWT session; the Health SPA's only network surface remains
  same-origin `/health-os/auth/*`, proxied only when `HEALTH_API_URL` is
  configured, and failing closed when it is not.
* `AGRICULTURE_OS = ACTIVE` creates no new Agriculture identity model and no
  `AGRICULTURE_NOELIA`.

### 4.1 OS status vs user grant (mandatory distinction)

```
GLOBAL OS STATE        HEALTH_OS = ACTIVE
USER A                 Health access = Authorized
USER B                 Health access = Not authorized
```

All three statements are simultaneously true. The launcher now renders both
facts separately — a global `ACTIVE` status chip and an access line
(`Access: Authorized` / `Access: Not authorized — not in current grant`) — and
never uses user-specific authorization as the global activation state.

---

## 5. Security controls preserved (regression-checked)

`GlobalUserID` · RBAC + ABAC · tenant isolation · classification ceilings · MFA
step-up · delegation/consent · server-side authentication · server-side
authorization · RLS (`withTenantDatabaseContext`, and the authorization-context
endpoints under `/api/v1/authorization/*` which still execute inside the correct
RLS context) · deep-link authorization rechecks · OS/tenant/entity/country/role/
permission authorization · policy checks · hash-chained audit · session
validation · CAP_POSTING fail-closed · Finance journal POST protection · no
hidden routes · no RLS bypass · no frontend-only authorization · hostname is
never authentication and never authorization.

---

## 6. Deployment — human-controlled, unchanged

```
beyu.co.tz · health. · finance. · agriculture. · ujenzi. · foundation. · familyoffice. · noelia.
                     ↓
            SAME VERCEL DEPLOYMENT
                     ↓
           CANONICAL HOST RESOLVER  (src/lib/canonical-hosts.ts)
                     ↓
   BEYU OS · HEALTH_OS · FINANCE_OS · AGRICULTURE_OS · UJENZI_OS
   FOUNDATION · FAMILY OFFICE · NOELIA_AI
```

* No separate Vercel project was created; all canonical hosts point at the same
  production deployment.
* Application-level host resolution selects the frontend.
* Enabling the feature is `BEYU_CANONICAL_DOMAIN=beyu.co.tz` (plus
  `BEYU_SESSION_COOKIE_DOMAIN=beyu.co.tz` for one shared sign-in). Adding the
  domains to the existing Vercel project and the DNS records at the registrar
  remain **human-controlled deployment operations** and were not performed here.
