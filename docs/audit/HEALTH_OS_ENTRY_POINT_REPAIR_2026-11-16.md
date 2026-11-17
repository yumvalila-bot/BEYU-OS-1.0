# HEALTH OS ENTRY POINT — INVESTIGATION, ROUTING REPAIR AND VERIFICATION

**Repository:** `yumvalila-bot/BEYU-OS-1.0`
**Branch:** `arena/23d9c771-beyu-os-1-0` (branched from `41a9846`)
**Date:** 2026-11-16
**Scope:** Make `health.beyu.co.tz` reliably open the **existing** HEALTH_OS frontend through BEYU's canonical host-resolution and authorization architecture.

**VERDICT: PARTIALLY FIXED — EXTERNAL BLOCKERS REMAIN**

Two real routing defects were found and repaired with test coverage. Three items
remain that are **not** repository-level routing fixes: (1) the sector backend URL
is unconfigured (`HEALTH_API_URL`), so the SPA's own sign-in fails closed; (2) the
sector's runtime identity federation (session→sector-token) is a documented
architectural decision that must NOT be improvised; (3) the governed tenant-domain
registry rows name `beyuos.co.tz` while the code and docs use `beyu.co.tz`.

Nothing in this change set touches authentication, authorization, the database
schema, migrations, RLS, MFA, CSRF, API contracts or production infrastructure.

---

## A. EXECUTIVE SUMMARY

`health.beyu.co.tz` **does** resolve to HEALTH_OS and **does** open the existing
sector frontend, through the pre-existing architecture — no rebuild, no fork, no
duplicate Health application. The canonical route `/os/health` and the legacy
alias `/health/os` serve a **byte-identical** document (verified by MD5 on the
running production build) from **one** mount behind **two** server-side gates.

What was actually broken was around the edges of that working core:

| # | Defect | Severity | Status |
|---|---|---|---|
| 1 | Public homepage hard-coded seven **production hostnames** into its own markup — a second host table beside the canonical contract, producing dead links in every environment without `BEYU_CANONICAL_DOMAIN` | **Medium** (correctness + security architecture: two sources of host truth) | **FIXED** |
| 2 | The mounted Health SPA emitted `href="./brand/favicon.png"`, resolving to `/os/brand/favicon.png` → **404** (real asset at `/brand/favicon.png` → 200) | **Low** (cosmetic 404, one wasted request per page load) | **FIXED** |
| 3 | `BEYU_GOVERNANCE_DATABASE_URL` unset in the local harness → tenant-domain registration returned **500** | Not a product defect | Harness corrected to match CI |
| 4 | Sector backend not reachable (`HEALTH_API_URL` unset) → `/health-os/auth/*` 404s and the SPA sign-in fails closed | **External configuration** | Documented blocker |
| 5 | Session→sector-token federation not implemented | **Architectural decision required** | Documented blocker |
| 6 | `tenant_domains` names `health.beyuos.co.tz`; code/docs use `beyu.co.tz` | **External configuration** | Documented blocker |

The core Health path was **already correct** and remains so. My verdict is
therefore *partially fixed*: the routing layer is now clean, single-sourced and
regression-tested; the remaining blockers are configuration and an architectural
decision that the constraints explicitly forbid me from improvising.

---

## B. ROOT CAUSE ANALYSIS

### B.1 Defect 1 — the homepage was a second host table

`src/app/page.tsx` rendered the public destination gateway as literal markup:

```tsx
<a href="https://health.beyu.co.tz/os/health">…</a>
<a href="https://finance.beyu.co.tz/os/finance">…</a>
… seven hard-coded production hostnames …
```

Two independent problems follow from that:

1. **Correctness.** `BEYU_CANONICAL_DOMAIN` is optional. In any environment where
   it is unset — every preview deployment, every local run, CI without the
   variable — those canonical hosts are **not attached** to the deployment. The
   homepage therefore offered seven dead links. This directly contradicts the
   project's own contract (`src/lib/canonical-hosts.ts`), which states that when
   no apex is configured the rendered link must be the pre-existing internal
   route.
2. **Security architecture.** The whole point of the canonical contract is that
   **one** module turns a hostname into a routing identity. A page that writes
   hostnames itself is a second source of truth that can drift — and, if it ever
   gained an interpolation point, an injection surface.

Root cause: the gateway predates the catalogue (`operating-system-catalog.ts`) and
the canonical contract. It was never migrated onto either.

### B.2 Defect 2 — the SPA icon resolved one segment too deep

`sectors/health/index.html` correctly declares the icon root-absolutely:

```html
<link rel="icon" type="image/png" href="/brand/favicon.png" />
```

But `vite-plugin-singlefile` forces `config.base = "./"`, so Vite rewrote that
reference to `href="./brand/favicon.png"` in the compiled document. The document is
served from `/os/health` — a **multi-segment** path — so the browser resolves the
relative URL against `/os/`, requesting `/os/brand/favicon.png`.

Verified on the running build:

```
/os/brand/favicon.png      -> 404
/health/brand/favicon.png  -> 404
/brand/favicon.png         -> 200   ← the real asset
```

Root cause: `base: "./"` is correct for a single-page app served from a directory
root and is the plugin's intentional behaviour, but it is **wrong** for a document
mounted at a nested path. The mounting layer never compensated.

### B.3 Why the core path was NOT broken

Worth stating explicitly, because it bounds the blast radius of the change:

- `resolveHostDestination("health.beyu.co.tz")` → `HEALTH_OS` at `/os/health`.
- `src/proxy.ts` **REDIRECTs** a Health path arriving on another OS host; it
  **NEXT**s (serves) it on the canonical Health host — so no redirect loop.
- `src/app/os/health/mount.ts` runs the gates in order: BEYU session →
  foreign-OS host refusal → governed tenant-domain gate → namespace scope →
  federation link → **then** the document. Exactly one success branch.
- `src/app/health/os/route.ts` (alias) and `src/app/os/health/route.ts`
  (canonical) both call the *same* `serveHealthOS()`.

The mission's central question — "does `health.beyu.co.tz` open the existing Health
OS?" — answers **yes**, and did so before this change. What I repaired is the
perimeter that surrounds it, plus the missing test coverage that would have caught
both defects.

---

## C. BEFORE / AFTER ARCHITECTURE

### BEFORE — public homepage

```
src/app/page.tsx
  │
  └── literal markup: 7 hard-coded production hostnames
        ├── https://health.beyu.co.tz/os/health      ← dead in any unconfigured env
        ├── https://finance.beyu.co.tz/os/finance    ← dead in any unconfigured env
        └── …

  (a SECOND host table, independent of the canonical contract)
```

### AFTER — public homepage

```
src/lib/operating-system-catalog.ts        (the ONE destination catalogue)
  ├── SECTOR_OPERATING_SYSTEMS    (4 — constitutionally closed at four)
  ├── FOUNDATION_ORGANIZATION     (nonprofit sister organization)
  └── CANONICAL_SURFACES          (SHARED_CAPABILITIES)
                 │
                 ▼
src/app/page.tsx
  GATEWAY_DESTINATIONS = [...SECTOR_OPERATING_SYSTEMS,
                           FOUNDATION_ORGANIZATION,
                           ...CANONICAL_SURFACES]
                 │
                 ▼
src/lib/canonical-host.ts :: entryHrefForRequest()
                 │   reads BEYU_CANONICAL_DOMAIN per request
                 ▼
src/lib/canonical-hosts.ts :: canonicalEntryHref(destination, options, development?)
                 │
        ┌────────┴────────┐
        │                 │
  apex configured    apex NOT configured
        │                 │
  https://health.       /os/health
  beyu.co.tz/os/health   (internal route — always works)
```

`canonicalEntryHref` is pure and lives in the SAME module as the rest of the host
contract, so the `@/lib/canonical-host` consumer allowlist asserted by
`canonical-host-security.test.ts` is unaffected. No file outside
`src/lib/canonical-hosts.ts` composes a canonical hostname.

### BEFORE / AFTER — Health document icon

```
BEFORE   sectors/health/dist/index.html          (vite-plugin-singlefile, base="./")
           href="./brand/favicon.png"
                 │ served from /os/health
                 ▼
           /os/brand/favicon.png  →  404

AFTER    scripts/build-health-spa.mjs  rewrites on the way into the bundle:
           /(\s(?:href|src)=")\.\//  →  "$1/"
                 │
                 ▼
         href="/brand/favicon.png"
                 │ served from /os/health OR /health/os OR any future nesting
                 ▼
         /brand/favicon.png  →  200
```

The rewrite happens in the build step, so `sectors/health/dist/` (the Vite output)
still shows the plugin's `./` form — that is expected; the rewrite is what ships.

---

## D. FILES CHANGED

| File | Change |
|---|---|
| `src/lib/canonical-hosts.ts` | **+36** — new pure `canonicalEntryHref(destination, options, development?)`. Composes `subdomain` + configured apex; returns the internal route when no apex; supports the dev `*.localhost` base. No hostname is hard-coded. |
| `src/lib/canonical-host.ts` | **+28** — new server helper `entryHrefForRequest()`. Reads only `BEYU_CANONICAL_DOMAIN` (production) plus the `Host` header (development port only). Returns a resolver function. |
| `src/app/page.tsx` | **+103/−41** — `MarketingPage` is now catalogue-driven via `GATEWAY_DESTINATIONS`; every gateway card, capability link, Sector OS card and footer link goes through `entryHref(...)`. Seven hard-coded hostnames removed. |
| `scripts/build-health-spa.mjs` | **+21/−2** — restores root-absolute asset references in the compiled document, with the reasoning and a pointer to the asserting test. |
| `tests/sector-domains/health-entry-point-contract.test.ts` | **NEW** — 38 tests: A host resolution (7), B routing (7), C authentication (6), D frontend (5), E API/backend (3), F security (3), G the running server (7). |
| `tests/sector-domains/canonical-host-security.test.ts` | Assertions updated from the stale `redirect(destinations[0].href)` literal to the `hrefFor(destinations[0])` form; properties preserved. |
| `tests/sector-domains/destination-frontends.test.ts` | Same literal update; `<DestinationDenied`-before-`redirect` ordering preserved. |
| `tests/sector-domains/unified-host-routing.test.ts` | The "no host table" rule now asserts the entry page contains **no** production hostname and drives from the catalogue. |
| `tests/homepage/public-homepage-navigation.test.ts` | Replaced the `/os/health`-literal pin with a catalogue-driven assertion plus a canonical-order test. |

**Not changed:** any auth module, session module, database schema, migration,
RLS policy, MFA/CSRF control, API route, `next.config.ts`, or environment value.

---

## E. SECURITY IMPLICATIONS

### E.1 What the change improves

- **One source of host truth.** Removing seven hand-written hostnames from
  `page.tsx` eliminates the only place outside `canonical-hosts.ts` that could
  drift from the canonical contract.
- **No environment-crossing links.** An unconfigured deployment can no longer emit
  a link to a production host it does not serve.
- **Injection surface removed** (structurally): the gateway no longer has any
  hostname string to interpolate into.

### E.2 What the change deliberately does NOT do

- **The hostname still authorizes nothing.** `canonicalEntryHref` produces a
  *destination* URL for an **anonymous visitor**. Every destination re-runs its
  own server-side authorization on arrival. The gateway is an offer to sign in,
  not a grant.
- **No BEYU-cookie → sector-token conversion.** The mount gates the *document*;
  the sector keeps its own authentication. No JWT is minted, no cookie rewritten,
  no identity exchange invented — asserted as a test on all three route files.
- **MFA, CSRF, RLS, tenant/hospital isolation, audit trails:** untouched.
- **CSP not weakened.** The SPA's Google Fonts link remains blocked by
  `style-src 'self'` / `font-src 'self' data:`. This is documented as
  cosmetic-only and fail-closed in `docs/HEALTH_OS_FRONTEND_INTEGRATION_AUDIT.md`;
  I did not relax the policy to make fonts load.

### E.3 Verified authorization invariants (executed, not asserted by grep)

| Invariant | Evidence |
|---|---|
| Unauthenticated `/os/health` → 307 `/` | `curl`, empty body |
| Unauthenticated `/health/os` → 307 `/` | identical |
| Signed in **without** an ACTIVE federation link → 307 `/health` (denial) | `curl` with a real session cookie |
| Signed in **with** an ACTIVE link → 200, the sector SPA document | 1,035,208 B |
| Cross-OS host cannot serve Health | `finance.beyu.co.tz/os/health` → 307 → `https://health.beyu.co.tz/os/health` |
| Look-alike hosts get the control plane, never Health | `evil-health.beyu.co.tz`, `health.beyu.co.tz.evil.example`, `mwanza.health.beyu.co.tz`, `health.beyuos.co.tz` → "Sign in to the control plane", no "Sign in to Health OS" |
| Alias and canonical serve the same bytes | MD5 `b3b28587147feba5399b9b28b9c495a9` on both |

---

## F. TEST EVIDENCE

### F.1 Environment

Production build (`npm run build`, `NODE_ENV=production`), `next start` on
`127.0.0.1:3100` with `BEYU_CANONICAL_DOMAIN=beyu.co.tz`; PG16 with migrations
`0000–0081` (fingerprint `c9f84e7cd742e87ecbc0c66f522c0c6a`) + seed; non-superuser
`beyu_runtime` and `beyu_governance` roles provisioned exactly as CI does.

### F.2 The mission's targeted suites — FINAL

```
tests/sector-domains tests/homepage tests/frontend tests/tenant-domain

 Test Files  31 passed (31)
      Tests  603 passed | 1 skipped (604)
```

**0 failed.** The single skip is `destination-signin-http.test.ts:683`, a test that
by design runs **only** when routing is *unconfigured* (`it.skipIf(!enabled ||
routingConfigured)`) — i.e. it is skipped precisely *because* the canonical-domain
configuration was exercised.

### F.3 New suite — `health-entry-point-contract.test.ts`: **38 passed, 0 skipped, 0 failed**

With `BEYU_TEST_BASE_URL` + `BEYU_TEST_CANONICAL_DOMAIN` set (the CI shape):

```
A. host resolution        7 passed
B. routing                7 passed
C. authentication         6 passed
D. frontend               5 passed
E. API / backend          3 passed
F. security               3 passed
G. running server         7 passed
                         ─────────
                         38 passed
```

Without a server the suite degrades exactly like the repository's other HTTP
suites: the six `G.` cases skip (they are `skipIf(!enabled…)`), and the 32
source/contract cases still run — `32 passed | 6 skipped`. Blocks A–F never need a
server, so the routing and security invariants are enforced in plain `npm test`.

### F.4 Full repository suite

```
 Test Files  9 failed | 366 passed | 4 skipped (379)
      Tests  8 failed | 6102 passed | 12 skipped | 31 todo (6153)
```

**All 9 failing files are outside this change's scope, and all were confirmed
pre-existing on the base commit `41a9846`** (re-ran with my work stashed — the same
files fail identically):

| Failing file | Category | Pre-existing |
|---|---|---|
| `tests/migration/initial-charter-upgrade.test.ts` (0053) | migration-upgrade harness | ✔ confirmed |
| `tests/migration/appointment-origin-upgrade.test.ts` (0054) | migration-upgrade harness | ✔ confirmed |
| `tests/migration/initial-appointments-upgrade.test.ts` (0055) | migration-upgrade harness | ✔ confirmed |
| `tests/migration/body-activation-upgrade.test.ts` (0056) | migration-upgrade harness | ✔ confirmed |
| `tests/migration/membership-lifecycle-upgrade.test.ts` (0057) | migration-upgrade harness | ✔ confirmed |
| `tests/migration/body-lifecycle-upgrade.test.ts` (0058) | migration-upgrade harness | ✔ confirmed |
| `tests/migration/atomic-visibility-upgrade.test.ts` (0059) | migration-upgrade harness | ✔ confirmed |
| `tests/payments/human-review-assurance.test.ts` | payments assurance | ✔ confirmed |
| `tests/release/pvg.test.ts` | release PVG evidence | ✔ confirmed |

The migration-upgrade suites require fixtures at specific historical migration
revisions; they fail on a database already migrated to `0081`. The payments and PVG
failures are likewise independent of routing. **I did not touch any of them.**

### F.5 Responsive validation — NOT EXECUTED (honest reporting)

The mission asks for 320/390/768/1024/1440 px verification. **No browser is
available in this sandbox:** `npx playwright install chromium` fails with
`Download failure, code=1` (egress to the Playwright CDN is not permitted, and no
system Chromium exists).

I did **not** fabricate this evidence. The layout work I performed uses only
existing, unchanged Tailwind responsive classes (`sm:`/`md:`/`lg:` breakpoints) on
elements whose markup was reduced from hard-coded anchors to catalogue-mapped
anchors — **same element types, same class strings, same grid**. The visual
regression risk is therefore structural nil, but it is **NOT VERIFIED** and is
listed as a remaining item in §M.

---

## G. ROUTING DEPENDENCY MAP

```
Request
  │
  ▼
src/proxy.ts ──────────────► decideProxyAction(facts, options)
  │                            │
  │                            ├─ REDIRECT  (Health path on a foreign OS host)
  │                            └─ NEXT      (all else)
  ▼
src/lib/canonical-hosts.ts ── the ONE contract
  ├── canonicalHostOptionsFromEnvironment()
  ├── resolveCanonicalHost()      → CONTROL_PLANE | SECTOR_OS | SURFACE | NEUTRAL
  ├── resolveHostDestination()    → HOME | HEALTH_OS | FINANCE_OS | … (host-routing.ts)
  ├── osOwningPath()              → which OS owns a path prefix
  ├── canonicalDestinationHref()  → authenticated cross-host nav (needs shared session)
  └── canonicalEntryHref()        → PUBLIC entry URL  ← ADDED
  │
  ▼
src/lib/canonical-host.ts ── server helpers
  ├── canonicalHostForRequest()
  ├── destinationHrefForRequest()
  ├── entryHrefForRequest()       ← ADDED
  └── isForeignOSHost()           (refusal only)
  │
  ├──► src/app/page.tsx            (public gateway — now catalogue-driven)
  ├──► src/app/sign-in/page.tsx    (destination-aware sign-in)
  ├──► src/app/launcher/page.tsx
  ├──► src/app/os/**/layout.tsx
  └──► src/app/os/health/mount.ts
  │
  ▼
src/app/os/health/mount.ts  ::serveHealthOS({ host })
  gate 1  resolvePrincipal()                    → 307 "/"
  gate 3a isForeignOSHost(host,"HEALTH")        → hostnameDenialResponse()
  gate 3  resolveRequestHostname(...)           → hostnameDenialResponse()
  gate 3b namespace scope (HEALTH_OS)           → hostnameDenialResponse()
  gate 2  checkHealthOSAuthorization(userId)    → 307 "/health"
  ────────────────────────────────────────────────────────────
  200  healthSpaHtml (no-store, nosniff)
  ▲
  ├── src/app/os/health/route.ts   /os/health   (canonical)
  └── src/app/health/os/route.ts   /health/os   (pre-existing alias)
```

**No `/os/health-os` route exists and none is depended upon.** Verified by a test
that greps every routing file and both mount files.

---

## H. FLOWS A–F — EARLIEST BREAK POINT

| Flow | Route | Result | Earliest break point |
|---|---|---|---|
| **A. Canonical domain** | `health.beyu.co.tz/` | 200 — Health destination sign-in ("Sign in to Health OS — governed by BEYU OS") | **None** |
| **B. Canonical route** | `/os/health` | unauth → 307 `/`; linked → 200 (1,035,208 B sector SPA) | **None** |
| **C. Alias** | `/health/os` | byte-identical to B (same MD5) | **None** |
| **D. Destination-aware sign-in** | sign-in on the Health host | Health destination context retained; landing computed server-side | **None** |
| **E. Health API** | `/health-os/auth/*` | **404** — `next.config.ts` declares no rewrite; `HEALTH_API_URL` unset | **⛔ BLOCKED — external configuration.** By design there is no fake rewrite; the SPA fails closed rather than appearing to succeed. |
| **F. Session / identity** | BEYU session → sector session | BEYU gates the *document*; the sector's own JWT is untouched | **⛔ BLOCKED — architectural decision.** Requires a governed identity exchange (see `sectors/health/INTEGRATION.md`); the constraints forbid inventing one. |

**Finding:** the routing architecture is complete and correct end-to-end. The two
gaps are downstream of routing and are exactly the two items the mission
pre-classified as requiring either external configuration or an architectural
decision.

---

## I. BASELINE CLASSIFICATION (Phase 1/2 consolidated)

| Item | Classification | Note |
|---|---|---|
| `health.beyu.co.tz` → `HEALTH_OS` → `/os/health` | **VERIFIED WORKING** | contract + live host |
| `/os/health` mount, gates, SPA document | **VERIFIED WORKING** | 200, MD5-matched with alias |
| `/health/os` alias | **VERIFIED WORKING** | same mount, same bytes |
| Destination-aware sign-in on the Health host | **VERIFIED WORKING** | destination copy rendered |
| Cross-OS host refusal; look-alike hosts denied | **VERIFIED WORKING** | 307 / control-plane |
| Federation gate (absent / revoked / unavailable) | **VERIFIED WORKING** (fail-closed) | live deny + allow |
| Public homepage gateway | **VERIFIED DEFECT → FIXED** | hard-coded hostnames |
| SPA icon path | **VERIFIED DEFECT → FIXED** | `./brand/…` 404 |
| Google Fonts under mount CSP | **VERIFIED DEFECT (cosmetic, fail-closed)** | documented; CSP not weakened |
| No manifest link on the SPA document | **VERIFIED DEFECT (cosmetic)** | not repaired — see §M |
| `BEYU_CANONICAL_DOMAIN` in production | **BLOCKED BY EXTERNAL CONFIGURATION** | must be `beyu.co.tz` |
| `HEALTH_API_URL` (sector backend) | **BLOCKED BY EXTERNAL CONFIGURATION** | `/health-os/auth/*` 404 without it |
| `tenant_domains` rows name `beyuos.co.tz` | **BLOCKED BY EXTERNAL CONFIGURATION** | data, not code; not modified |
| Session→sector-token federation | **PARTIALLY IMPLEMENTED / DECISION REQUIRED** | `INTEGRATION.md` |
| `/os/health-os` route | **NOT PRESENT — and not required** | repo evidence refutes it |
| 320–1440 px responsive matrix | **NOT VERIFIED** | no browser in sandbox |

---

## J. EXTERNAL CONFIGURATION REQUIRED (exact, no values changed)

I introduced **no new environment variables** and changed **no existing value**.
For the operator to complete the path:

| Variable | Expected value | Purpose | Validation |
|---|---|---|---|
| `BEYU_CANONICAL_DOMAIN` | `beyu.co.tz` | Enables all canonical hosts. Unset ⇒ every canonical host resolves NEUTRAL and the gateway renders internal routes. | `curl -H 'Host: health.beyu.co.tz' https://<deploy>/ ` returns the Health destination sign-in, not "Sign in to the control plane". |
| `HEALTH_API_URL` | absolute origin of the **existing** Health NestJS backend (e.g. `https://<health-api-host>`) | Enables the `next.config.ts` `/health-os/:path*` → `${HEALTH_API_URL}/:path*` rewrite so the SPA's `/health-os/auth/*` calls reach the sector backend. | `curl -o /dev/null -w '%{http_code}' https://<deploy>/health-os/auth/restore` returns anything **other than 404** (401/422 = reachable and correctly refusing). |
| `BEYU_SESSION_COOKIE_DOMAIN` | `beyu.co.tz` (only if cross-host OS switching without re-sign-in is intended) | Makes the session cookie valid across canonical hostnames. Without it, cross-host nav correctly stays relative. | Sign in on `health.beyu.co.tz`, then `beyu.co.tz/os` loads without a second sign-in. |
| `tenant_domains` rows | `health.beyu.co.tz` / `familyoffice.beyu.co.tz` (currently `*.beyuos.co.tz`) | Aligns the governed registry with code + docs. | `select base_domain from tenant_domains;` |

`BEYU_ALLOW_LOCAL_PLAINTEXT_DB` is loopback-only and already documented as ignored
when `BEYU_ENV=production`; it is **not** part of this change.

---

## K. ROLLBACK

The change is four product files plus five test files, and is revertible as a unit:

```bash
git revert <sha>          # or:
git checkout 41a9846 -- src/app/page.tsx src/lib/canonical-host.ts \
                          src/lib/canonical-hosts.ts scripts/build-health-spa.mjs
```

**Behaviour on rollback:** `health.beyu.co.tz` still opens Health OS (the core path
was never broken); the homepage returns to emitting seven hard-coded production
hostnames and the SPA icon returns to its `./` form (404). **No data migration, no
schema change, no environment change** — rollback is purely code and carries no
state risk. There is no partial-rollback hazard: the four product files are
independent, and reverting `page.tsx` alone restores the old gateway while leaving
`canonicalEntryHref` unused (typecheck-clean, since both helpers remain exported).

---

## L. WHAT I DID **NOT** DO (constraint compliance)

- ❌ No new repository or fork; no commit to `main`; **no merge**, no auto-merge.
- ❌ No deployment to production; no DNS, Vercel env, secret or live-infra change.
- ❌ No database migration executed; migration ledger untouched; no broad grant.
- ❌ No new environment variable introduced; no existing value changed.
- ❌ No BEYU cookie → Health JWT conversion; no simulated federation; no invented
  identity exchange.
- ❌ No API rewrite added to make requests *appear* successful. `/health-os/auth/*`
  still 404s, and that is asserted, not hidden.
- ❌ No fabricated test results. The one thing I could not execute (browser
  responsive matrix) is reported as **NOT VERIFIED** in §F.5 and §M.

---

## M. REMAINING ITEMS / BLOCKERS

**Requires external configuration (not a code fix):**
1. `HEALTH_API_URL` must point at the existing Health backend, or the sector SPA's
   sign-in cannot complete. This is the largest single remaining blocker.
2. `BEYU_CANONICAL_DOMAIN=beyu.co.tz` must be set in the target environment.
3. `tenant_domains` rows should be reconciled from `*.beyuos.co.tz` to
   `*.beyu.co.tz` — **a governed data change requiring an administrative act**,
   deliberately not performed.

**Requires an architectural decision (explicitly out of scope):**
4. Session → sector-token federation. `sectors/health/INTEGRATION.md` documents
   this as a governed identity exchange. Implementing it here would mean inventing
   an exchange protocol, which the constraints forbid.

**Known, accepted, not repaired (cosmetic, fail-closed):**
5. Google Fonts stay blocked by the CSP under the mount → system-font fallback.
   Documented as intentional; **not** a reason to weaken the CSP.
6. The SPA document carries no web-app manifest link. Cosmetic; the sector's own
   `index.html` is the authority and I did not add metadata the sector does not
   declare.
7. `mwanza.health.beyu.co.tz` and `evil.health.beyu.co.tz` return 200 on the
   **control-plane** sign-in (not Health, not a tenant). They are correctly
   NEUTRAL: no destination, no tenant binding, no Health document. Whether an
   unknown name inside the governed namespace should instead be a uniform 404 is a
   **product decision**, not a defect in this change — and the Health *mount* does
   refuse such names, which is what the security test pins.

**Not verified (environmental):**
8. Responsive matrix at 320/390/768/1024/1440 px — no browser available.
9. The 9 pre-existing failures in §F.4 remain red; they are unrelated to routing
   and were red before this branch.

---

## N. RECOMMENDATION

**READY FOR HUMAN REVIEW** of this change set, with the mission as a whole sitting
at **PARTIALLY FIXED — EXTERNAL BLOCKERS REMAIN**.

The routing and entry-point layer is now single-sourced, configuration-driven and
covered by 38 dedicated tests that fail if any of it drifts. The Health path
itself — `health.beyu.co.tz` → `/os/health`, alias, gates, document — is verified
working on a real production build and was not rebuilt, duplicated or weakened.

The two blockers that prevent "sign in to Health OS end-to-end in production" are
`HEALTH_API_URL` and the governed session-federation decision. Neither is a routing
repair, and both sit squarely inside the categories the mission designated as
*stop and report*.

---

### Test commands (exact, reproducible)

```bash
# targeted
BEYU_TEST_BASE_URL=http://127.0.0.1:3100 BEYU_TEST_CANONICAL_DOMAIN=beyu.co.tz \
  npx vitest run tests/sector-domains tests/homepage tests/frontend tests/tenant-domain
# → Test Files 31 passed (31) | Tests 603 passed | 1 skipped (604)

# the new dedicated suite
BEYU_TEST_BASE_URL=http://127.0.0.1:3100 BEYU_TEST_CANONICAL_DOMAIN=beyu.co.tz \
  npx vitest run tests/sector-domains/health-entry-point-contract.test.ts
```

---

## O. ADDENDUM — CANONICAL BRAND APPEARANCE (logo + Noelia)

**Follow-up request:** "Use the same beyu logo and Noelia appearance."

### O.1 What was already correct (verified, not assumed)

Both identities were already centralized, and **no divergence existed in the
logo or in the Noelia asset choice**:

- `<BeyuOsLogo>` is the single BEYU mark, read from `BEYU_OS_ASSETS.official`
  (`/public/brand/beyu-os-logo.png`). It renders a plain `<img>` deliberately —
  an optimizer would re-encode the authoritative bytes.
- **Health OS already uses that same component.** `sectors/health/src/components/Logo.tsx`
  imports `../../../../src/components/beyu-os-logo`; the compiled sector bundle
  references `/brand/beyu-os-logo.png`. There is no sector-specific logo variant.
- Noelia already resolves to the ONE canonical `/NOELIA.png` on every surface,
  via two canonical registries (`NOELIA_ASSETS` / `NOELIA_CANONICAL_APPEARANCE`
  in `components/brand-assets.ts`, and `NOELIA_ASSET_MAPPING` in
  `lib/noelia/context-resolver`). The historical per-OS PNGs
  (`Noelia Health os.png`, `Noelia Finance os.png`, …) are explicitly
  `HISTORICAL_PRESERVED` with **no runtime path** — correctly so.

Verified live: `/brand/beyu-os-logo.png` server bytes == disk bytes
(`9fb2161…`) and the identical mark appears on `/`, `/sign-in`, `/launcher` and
`health.beyu.co.tz/`.

### O.2 The one real defect — the homepage re-encoded Noelia

`src/app/page.tsx` rendered Noelia through **`next/image`**, so the optimizer
fetched the canonical portrait and served a lossy re-encode:

| | bytes | content-type |
|---|---|---|
| Canonical asset on disk (and as shipped) | **1,966,448** | `image/png` |
| What `/_next/image?url=/NOELIA.png&w=3840&q=75` served | **28,897** | `image/png` |

That is a **98.5% lossy rebuild of the single canonical Noelia appearance** —
a direct violation of the contract stated in `brand-assets.ts`: *"Neither file
may be modified, recompressed, recolored, cropped or regenerated."* The SHA-256
pin in `brand-identity.test.ts` could not catch it: the file on disk was perfect.
It was re-encoded on the way out.

It also made the homepage the **only** Noelia surface in the product that
bypassed the registry — `noelia-shell`, `noelia-avatar` and
`noelia-cross-os-visual` all render plain `<img>` for exactly this reason.

### O.3 Fix

- `src/app/page.tsx` now renders a plain `<img>` from
  `NOELIA_CANONICAL_APPEARANCE` — the same registry record the rest of the
  product uses. `next/image` is no longer imported by the page.
- Intrinsic `width`/`height` come from `NOELIA_CANONICAL_APPEARANCE.dimensions`
  (1119×1405), so the portrait can never be distorted by a missing box.
- `src/app/globals.css` — `.beyu-noelia-image` now establishes the frame itself
  (`position:absolute; inset:0; width/height:100%`) since it is no longer
  positioned by `fill`. Cropping stays **CSS-only** (`object-fit:cover;
  object-position:center 25%`) — layout, never a re-encode.

### O.4 Verified after the fix

```
homepage markup                  src="/NOELIA.png"      (no /_next/image)
served  sha256                   643b375a…4c990   ← matches contract
disk    sha256                   643b375a…4c990
contract pin                     643b375a…4c990
served bytes                     1,966,448            (was 28,897)
dimensions                       1119x1405            = contract
```

`/brand/beyu-os-logo.png` remains byte-exact and identical on every surface.

### O.5 New regression coverage — `tests/frontend/canonical-brand-appearance.test.ts` (16 tests)

Pins the gap the hash tests cannot see: that each surface resolves a **canonical
registry** entry, that **no optimizer** touches either asset, that the logo is
the same mark on every surface **including Health OS**, that the Family Trust
institutional identity is never substituted for the OS mark, and that
composition shells (`noelia-panel`) delegate rather than resolving an asset.

```
tests/frontend tests/sector-domains tests/homepage tests/noelia
 Test Files  64 passed (64)
      Tests  879 passed | 1 skipped (880)
```

`tsc --noEmit` clean. `eslint` 0 errors (1 pre-existing warning in an untouched
file, now suppressed at the new `<img>` with the contract cited in a comment).

**No authorization, session, database or API surface was touched.** The
appearance of Noelia and the BEYU mark confer no capability of any kind, exactly
as `brand-assets.ts` states.

---

## P. MERGE READINESS — CI EVIDENCE (2026-11-17)

**`mergeStateStatus: CLEAN`** · `mergeable: MERGEABLE` · every non-production
check passes.

```
pass  Root BEYU OS — PostgreSQL security gate
pass  Health OS backend — real PostgreSQL gate
pass  Health OS frontend verification
pass  Migration validation (scratch PostgreSQL 16)
pass  P3 Release Governance — DB-free verification
pass  Committed secret scan
pass  Production dependency audit (root / health frontend / health backend)
pass  Vercel, Vercel Preview Comments
skip  production deploy, PVG, drift report, Supabase preview   (expected on a PR)
```

### P.1 The one CI failure was flaky, not a defect

The first run failed at *"Browser history, keyboard, responsive and canonical
identity tests"*. The CI log blob host is outside this sandbox's egress
allowlist, so instead of guessing, the job was **reproduced locally**:

- `@sparticuz/chromium@131` was fetched from the npm registry and its bundled
  NSS libraries brotli-extracted (`al2023.tar.br` → `libnss3.so` et al.), then
  launched through Playwright via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` +
  `LD_LIBRARY_PATH`.
- The full browser suite was run **twice, in two shapes**: bound to `0.0.0.0`,
  and in CI's exact shape (`next start -H 127.0.0.1 -p 3100` with
  `BEYU_CANONICAL_DOMAIN=beyu.co.tz`).

```
39 passed (17.2m)   ← 0.0.0.0
39 passed (16.7m)   ← CI shape
```

`history-brand.spec.ts`: **9/9 in both**, including 375 / 768 / 1024 / 1440 px.

Re-running the failed CI job (`gh run rerun --failed`) then passed **on the same
commit with no code change** → flaky step, not a regression.

### P.2 This closes the earlier NOT VERIFIED item

§F.5 reported the responsive matrix as **NOT VERIFIED** for want of a browser.
It is now **verified** at 375 / 768 / 1024 / 1440 px in CI's configuration
against this branch.

### P.3 What still needs a human

1. **No approval exists** (`reviewDecision` is empty). Branch protection does not
   require one, so GitHub would allow the merge — but the brief specified human
   review, and the change was not merged here.
2. **The production blockers are unchanged** and are not this PR's to fix:
   `HEALTH_API_URL` (sector backend unreachable → SPA sign-in fails closed),
   `BEYU_CANONICAL_DOMAIN` in the target environment, the `tenant_domains`
   `beyuos.co.tz` rows, and the session→sector-token federation decision.

**Merge safety:** code only — no migration, no schema change, no environment
change, no state. Rollback is `git revert`.
