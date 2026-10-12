# Screenshot evidence — BEYU OS destination experiences and role-aware UI

Captured: 2026-10-12 · Branch: `arena/cc54151c-beyu-os-1-0`
**Tested commit (routine captures):** the branch working tree whose code was committed as `b5c4430`.
`HEAD` at capture time was `bb137fc`; `b5c4430`, `128bea3` and `216f4f5` are **code-identical** — they add
only documentation and this evidence (`git diff --stat b5c4430..216f4f5` = docs only). The four captures
added later testify to two different builds explicitly (branch `216f4f5`, `main`/production `9669640`).
**`inventory.json` is authoritative** for per-capture provenance: every entry carries
`testedCommit`, `capturedAtUtc`, `viewport`, `role`, `scenario` and `runtime`.
**Runtime captured:** the real production build (`npm run build`) of that commit, served by
`next start` on `127.0.0.1:3100` (and `:3102`/`:3103` for the later reproductions), driven by a real
headless Chromium.

## How the captures were produced

| Fact | Value |
| --- | --- |
| Harness | `playwright-core` (repo dependency, used by `npm run test:browser`) + a Chromium binary. The scripts that produced the 41 routine captures are committed beside this evidence (`capture-all.mts`, `capture-signin-https.mts`, `tls-front.mjs`). The four later reproductions used an equivalent script pair (a capture script plus a parameterised TLS front door) that ran from the session workspace and is **not** part of the repository; their per-capture metadata is in `inventory.json` |
| URLs | the real canonical hostnames (`http://beyu.co.tz:3100/…`, `https://beyu.co.tz:8443/…`) |
| DNS | mapped to the sandbox loopback with Chromium's `--host-resolver-rules` (explicit per hostname — the wildcard form is ignored by this build). The Host header and the server-side host resolution are therefore genuinely exercised |
| Sessions | the real `POST /api/v1/auth/login` (TOTP included), injected as the canonical `beyu_os_session` cookie. Scenarios 26–28 sign in through the real form in the browser |
| HTTPS scenarios | a throwaway self-signed front door (`tls-front.mjs`) forwards the canonical Host to the same build. It exists because the session cookie is `Secure` (`src/lib/session-cookie.ts`), so a real browser will not STORE it over plain HTTP |
| Data | repository synthetic seed identities and seed data only, in the sandbox database. **No production credential, no production database, no real patient or financial record** |
| Assertion per capture | HTTP status, page title, first visible text, and whether the string `could not load this view` (the reported failure screen) appears in the document |

Result for the **41 routine captures**: the error-boundary screen is **absent in all 41**.
The four captures added later (`29`–`32`, see the addendum) deliberately **show** that screen — they are
the failure state itself, reproduced on both builds. Total in this directory: **45 captures**.

## Addendum — the failure state reproduced (added 2026-10-12, same day)

These four are the only captures in which the reported failure screen is **present by design**. They were
produced by pointing the two production builds at a byte-faithful clone of the sandbox database set to
journal `0074` (the state the db-release pipeline history attributes to production): the 0075 ledger row
removed and `role_assignments.global_scope` dropped. Sign-in returns 200; the **first post-sign-in view
returns 500** with `column role_assignments.global_scope does not exist` (SQLSTATE 42703, server digest
`3627564076`). No production host, credential or database was involved; identity `cfo@beyu.os` (synthetic).

| File | Build tested | What the screen shows |
| --- | --- | --- |
| `31-…-main-desktop.png` | `9669640` = **the commit production runs** | the reported symptom verbatim — "BEYU OS could not load this view / Please try again. Access remains subject to your existing permissions." — with **no reference** |
| `32-…-main-mobile.png` | `9669640` | the same, mobile |
| `29-…-branch-desktop.png` | `216f4f5` | the same failure with the truthful load-failure copy and **Reference 3627564076** (the digest that also appears in the server log beside the 42703 cause) |
| `30-…-branch-mobile.png` | `216f4f5` | the same, mobile |

Metadata per capture (including `referenceShown`) is in `inventory.json`.

## Inventory

| # | File | Destination / route | Viewport | Synthetic role | Scenario | HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `01-home-signin-desktop.png` | beyu.co.tz `/` | 1440×900 | anonymous | HOME entry (control-plane sign-in) | 200 |
| 2 | `01-home-signin-mobile.png` | beyu.co.tz `/` | 390×844 | anonymous | HOME entry, mobile | 200 |
| 3 | `02-health-os-signin-desktop.png` | health.beyu.co.tz `/` | 1440×900 | anonymous | HEALTH_OS entry (own sign-in surface) | 200 |
| 4 | `02-health-os-signin-mobile.png` | health.beyu.co.tz `/` | 390×844 | anonymous | HEALTH_OS entry, mobile | 200 |
| 5 | `03-finance-os-signin-desktop.png` | finance.beyu.co.tz `/` | 1440×900 | anonymous | FINANCE_OS entry | 200 |
| 6 | `03-finance-os-signin-mobile.png` | finance.beyu.co.tz `/` | 390×844 | anonymous | FINANCE_OS entry, mobile | 200 |
| 7 | `04-agriculture-os-signin-desktop.png` | agriculture.beyu.co.tz `/` | 1440×900 | anonymous | AGRICULTURE_OS entry | 200 |
| 8 | `04-agriculture-os-signin-mobile.png` | agriculture.beyu.co.tz `/` | 390×844 | anonymous | AGRICULTURE_OS entry, mobile | 200 |
| 9 | `05-ujenzi-os-signin-desktop.png` | ujenzi.beyu.co.tz `/` | 1440×900 | anonymous | UJENZI_OS entry | 200 |
| 10 | `05-ujenzi-os-signin-mobile.png` | ujenzi.beyu.co.tz `/` | 390×844 | anonymous | UJENZI_OS entry, mobile | 200 |
| 11 | `06-foundation-signin-desktop.png` | foundation.beyu.co.tz `/` | 1440×900 | anonymous | FOUNDATION entry (nonprofit, not a Sector OS) | 200 |
| 12 | `06-foundation-signin-mobile.png` | foundation.beyu.co.tz `/` | 390×844 | anonymous | FOUNDATION entry, mobile | 200 |
| 13 | `07-family-office-signin-desktop.png` | familyoffice.beyu.co.tz `/` | 1440×900 | anonymous | Family Office capability entry | 200 |
| 14 | `07-family-office-signin-mobile.png` | familyoffice.beyu.co.tz `/` | 390×844 | anonymous | Family Office entry, mobile | 200 |
| 15 | `08-noelia-ai-signin-desktop.png` | noelia.beyu.co.tz `/` | 1440×900 | anonymous | NOELIA_AI entry (one governed AI identity) | 200 |
| 16 | `08-noelia-ai-signin-mobile.png` | noelia.beyu.co.tz `/` | 390×844 | anonymous | NOELIA_AI entry, mobile | 200 |
| 17 | `03-finance-os-authenticated-desktop.png` | finance.beyu.co.tz `/` | 1440×900 | cfo@beyu.os · GROUP_CFO | authorised identity lands on its own destination frontend | 200 |
| 18 | `03-finance-os-authenticated-mobile.png` | finance.beyu.co.tz `/` | 390×844 | cfo@beyu.os | authorised destination, mobile | 200 |
| 19 | `18-finance-os-empty-state-fullpage-desktop.png` | finance.beyu.co.tz `/` | 1440×900 full page | cfo@beyu.os | empty state: 0 journal entries, `DATA_NOT_AVAILABLE`, **CAP_POSTING LOCKED (fail-closed)** | 200 |
| 20 | `20-role-single-os-destination-desktop.png` | finance.beyu.co.tz `/os/finance` | 1440×900 | cfo@beyu.os | single-OS identity deep-links into its own destination | 200 |
| 21 | `07-family-office-authenticated-desktop.png` | familyoffice.beyu.co.tz `/` | 1440×900 | family@beyu.os | Family Office capability surface, authorised | 200 |
| 22 | `21-noelia-ai-authenticated-desktop.png` | noelia.beyu.co.tz `/` | 1440×900 | admin@beyu.os | governed AI destination reached by an identity holding `ai:noelia.query` | 200 |
| 23 | `02-health-os-authenticated-denied-desktop.png` | health.beyu.co.tz `/` | 1440×900 | cfo@beyu.os | governed denial on the destination host that was asked for | 200 |
| 24 | `01-home-control-plane-desktop.png` | beyu.co.tz `/os` | 1440×900 | admin@beyu.os | BEYU HOME: constitutional control plane | 200 |
| 25 | `01-home-launcher-desktop.png` | beyu.co.tz `/launcher` | 1440×900 | admin@beyu.os | governed launcher: the identity's authorised union | 200 |
| 26 | `09-role-single-os-launcher-desktop.png` | beyu.co.tz `/launcher` | 1440×900 | cfo@beyu.os | **single-OS user**: only the granted destination is launchable | 200 |
| 27 | `10-role-multi-os-launcher-desktop.png` | beyu.co.tz `/launcher` | 1440×900 | admin@beyu.os | **multi-OS user**: explicit grant union only | 200 |
| 28 | `11-role-unauthorised-deep-link-desktop.png` | ujenzi.beyu.co.tz `/` | 1440×900 | cfo@beyu.os | **unauthorised** user opens a restricted destination URL: denied | 200 |
| 29 | `12-role-unauthorised-in-shell-desktop.png` | beyu.co.tz `/os/ujenzi` | 1440×900 | cfo@beyu.os | unauthorised in-shell deep link: `Authorisation denied`, required capability named, no data | 200 |
| 30 | `24-role-denied-agriculture-host-desktop.png` | agriculture.beyu.co.tz `/` | 1440×900 | cfo@beyu.os | the same denial rule on a second Sector OS host | 200 |
| 31 | `25-health-os-no-identity-link-desktop.png` | beyu.co.tz `/health` | 1440×900 | cfo@beyu.os | Health OS truthful availability state: fail-closed, no sector data | 200 |
| 32 | `22-role-not-found-state-desktop.png` | beyu.co.tz `/os/no-such-destination` | 1440×900 | cfo@beyu.os | not-found, distinguishable from denial and from load failure | 404 |
| 33 | `14-role-unknown-host-failsafe-desktop.png` | unknown.beyu.co.tz `/` | 1440×900 | anonymous | unknown host fails safe to the control plane, no destination metadata | 200 |
| 34 | `15-server-denial-403-cfo-desktop.png` | beyu.co.tz `/api/v1/system/release/approvals` | 1440×900 | cfo@beyu.os | **restricted action refused by the server**: 403 `FORBIDDEN` RBAC/ABAC, in-browser submission with a real Origin header | 403 (POST) |
| 35 | `16-server-authorized-422-admin-desktop.png` | same route | 1440×900 | admin@beyu.os | authorised identity: authorization passes, only validation fails — the boundary is not a blanket refusal | 422 (POST) |
| 36 | `17-server-granted-endpoint-200-cfo-desktop.png` | beyu.co.tz `/api/v1/system/posture` | 1440×900 | cfo@beyu.os | granted read succeeds (holds `platform:dashboard.read`) | 200 |
| 37 | `19-role-no-js-denial-in-shell-desktop.png` | beyu.co.tz `/os/ujenzi` | 1440×900, **JS disabled** | cfo@beyu.os | server-rendered truth: denial present, no protected data | 200 |
| 38 | `23-role-no-js-denial-on-destination-desktop.png` | ujenzi.beyu.co.tz `/` | 1440×900, **JS disabled** | cfo@beyu.os | server-rendered destination denial | 200 |
| 39 | `26-browser-signin-form-filled-desktop.png` | beyu.co.tz `/` (HTTPS) | 1440×900 | cfo@beyu.os | the reported flow, step 1: real form filled in the browser | 200 |
| 40 | `27-browser-post-signin-landing-desktop.png` | beyu.co.tz `/os` (HTTPS) | 1440×900 | cfo@beyu.os | **the reported flow, step 2: after sign-in the browser lands on a working view — no failure screen** | 200 |
| 41 | `28-browser-sso-cross-host-finance-desktop.png` | finance.beyu.co.tz `/` (HTTPS) | 1440×900 | cfo@beyu.os | same session, different canonical host, no second sign-in | 200 |

Machine-readable copy of the same table, with the captured page titles and visible text:
`inventory.json` (this directory).

## What could NOT be captured, and why

| Not captured | Exact blocker |
| --- | --- |
| **A live Health OS *frontend*** (the compiled sector SPA at `/os/health`, `/health/os`) | It is gated on an ACTIVE row in `beyu_identity.beyu_identity_links`, the Health backend's own schema. The sandbox database has no `beyu_identity` schema at all, so the gate fails closed and the route answers 307 back to `/health`, which renders the truthful availability state (capture 31). Producing the link would require standing up the Health backend and seeding a cross-system identity bridge — infrastructure this audit did not build, and the same limitation CI reports. |
| **Public-DNS production URLs** (`https://health.beyu.co.tz`, no port) | Production DNS/TLS/domain attachment is unverified and is explicitly outside this change-control envelope (`HOST_CONFIGURATION_UNVERIFIED`, PR #105). Captures use the real canonical hostnames against the sandbox build. |
| **A populated Finance OS ledger** | Deliberate: `CAP_POSTING` is fail-closed pending governance ratification, and the seed data is empty by design. Capture 19 shows that state truthfully rather than mocking rows. |
| **`/os/health` deep link** | Same identity-link blocker as above. |
| **Authenticated `noelia.beyu.co.tz` session screenshot on the no-JS path** | The Noelia destination redirects an authorised session to `/os/noelia` (307, asserted over HTTP); the captured screen for the destination entry is the anonymous one (16). |

## Reproduce

The harness reads no production secret. Sequence used in this session:
`npm ci` → `npm run pg16:start` → `npm run migrate` → role setup → `npm run seed` → `npm run build` →
`next start -H 127.0.0.1 -p 3100` → capture scripts (Chromium with
`--host-resolver-rules=MAP <each canonical host> 127.0.0.1`) → optional TLS front door on :8443 for
the form-driven scenarios.
