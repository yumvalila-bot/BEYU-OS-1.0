# Identity / navigation reality audit — 2026-09-19

This is implementation evidence, **not a production-completion certificate**.

## Baseline and method

- Canonical repository: `yumvalila-bot/BEYU-OS-1.0`.
- Fetched main and initial HEAD: `f56f93b83fcd5cb803424697c92d6bd06758c167`.
- Working branch: `arena/01a0bafa-beyu-os-1-0`; initial working tree clean.
- Unshallowed history, fetched all accessible remote heads (72 advertised),
  inspected main's real files, commits touching assets and deleted-logo history.
- Whole tracked-tree searches covered institutional names/spellings, brand/logo/
  favicon/manifest/OpenGraph, domain names including Ujenzi, navigation/history,
  document stacks/export/print and security/governance terms. Search scope included
  source, public, docs, scripts, tests, mobile and Health frontend/backend.
- No supplied attachment was needed: both authoritative PNGs already existed.
- Main's CI run `35423638971` passed. Database-release run `35423638976` failed
  at **Production Verification Gate (PVG)**, after its database deploy and runtime
  health stages passed. Do not equate a successful build/deploy with promotion.
- Branch-protection API inspection returned HTTP 403 (`Resource not accessible
  by integration`); do not bypass reviews, status checks or production approval.

## Actual architecture and domain classification

Root package is Next.js 16 / React 19 / TypeScript, App Router. `/` is sign-in,
`/enroll` is guarded first-admin enrollment. There is **no `/login` route**.
`src/app/os/layout.tsx` calls `requirePrincipal`, checks BEYU OS authorization,
then runs inside `withTenantDatabaseContext`. Existing capability catalogue,
desktop/sidebar/mobile drawer and per-page guards remain authoritative.
Health is a React/Vite single-file SPA compiled by `scripts/build-health-spa.mjs`
and served by `/health/os`, behind session and federation checks. Its NestJS
backend and optional same-origin auth proxy are existing infrastructure.

“Implemented” below means actual repository code, not complete production operation.

| Domain | Classification | Repository evidence / limits |
|---|---|---|
| BEYU OS | IMPLEMENTED | shared authenticated shell, kernel, governance, DB, APIs and tests |
| Finance OS | IMPLEMENTED | `/os/finance`, `src/lib/finance`, ledger/posting guards, 37-domain catalogue; CAP_POSTING remains governed |
| Health OS | PARTIALLY IMPLEMENTED | mounted SPA and NestJS backend; canonical federation exists, deployed backend/runtime integration is external; many frontend views use fixture data |
| Agriculture OS | IMPLEMENTED | `/os/agriculture` scope layout/pages, services, APIs, migrations and tests |
| Ujenzi OS | IMPLEMENTED | canonical registry, `/os/ujenzi` scope layout plus projects/BOQ/procurement/HSE/etc., services/APIs/RLS tests; no invented features |
| Foundation OS | IMPLEMENTED | canonical registry, scoped `/os/foundation` routes, services/APIs and isolation tests |
| Family Office | IMPLEMENTED | `/os/family`, capital/protection, services/grants/isolation tests; shared capability, NOT a sector OS |

Flutter source consumes canonical mobile auth/context APIs with secure storage,
fail-closed routing and BEYU/Health/Agriculture/Foundation screens. It has no
native Android/iOS directories, launcher assets or declared Inter font files.
Finance, Ujenzi and Family Office native implementations are NOT PRESENT. No
new enum values or invented mobile features were added. Flutter SDK unavailable.

Security is existing server guard/API/session authorization, RBAC/ABAC, tenant
and entity/country scope, transaction-local database context, PostgreSQL RLS,
audit chains, governed approvals, Noelia/HIVE and release controls. No root
Next middleware file was found; do not invent one or confuse that absence with
absence of server enforcement. Health does have middleware/guards.

## Identity forensic inventory (A–J)

| Class | Exact paths / asset family | Evidence and treatment |
|---|---|---|
| A — Trust | `public/brand/beyu-family-trust-logo.png`; `src/components/family-trust-logo.tsx` | existing canonical 1239×1254 source, hash pinned; unchanged; Trust governance only |
| B — OS | `public/brand/beyu-os-logo.png`; `src/components/beyu-os-logo.tsx` | existing canonical 1254×1254 source, hash pinned; unchanged; all operating domains |
| B — derivatives | `public/brand/beyu-app-icon-192.png`, `public/brand/beyu-app-icon-512.png` | previously from older SVG; now full-image resizes of canonical OS PNG |
| B — new derivative | `public/brand/favicon.png` | 32px full-image resize from OS PNG; no new design |
| B — compatibility | `src/components/beyu-logo.tsx` | third active implementation consolidated into adapter to BeyuOsLogo |
| A artwork misused as C | `sectors/health/src/components/Logo.tsx` | prior inline SVG claimed Family Trust identity on Health shell; now adapter to shared BeyuOsLogo + Health OS label |
| C — operating context | `src/app/os/layout.tsx`, `os-navigation.tsx`, family capital/protection pages, Health Logo | now canonical OS presenter/label; generic domain icons remain technical |
| H — Noelia originals | `Noelia AI .png`, `Noelia BEYU OS.png`, `Noelia Finance os.png`, `Noelia Health os.png`, `Noeloa Agriculture OS.png` | unchanged originals, not institutional-sector logos |
| H — Noelia presentation copies | `public/noelia/canonical/noelia-ai-canonical.png`, `noelia-beyu-os-canonical.png`, `noelia-finance-os-canonical.png`, `noelia-health-os-canonical.png`, `noelia-agriculture-os-canonical.png` | unchanged, not duplicates of BEYU identity |
| H — Noelia assets | `public/noelia/noelia-avatar.svg`, `.png`, `.webp`; `noelia-icon.svg`; `noelia-placeholder.svg` | preserved separately; NoeliaPanel changes only surrounding BEYU anchor |
| I — technical | `src/components/icons.tsx`, `sectors/health/src/components/Icons.tsx`, Flutter Material icons | retained; domain/capability icons are not alternate institutional marks |
| J — prior operating artwork | `public/brand/beyu-logo.svg`, `beyu-logo-dark.svg`, `beyu-logo-light.svg`, `beyu-logo-mark.svg`, `beyu-app-icon.svg`, `favicon.svg` | overlapping legacy geometry/variants, not byte-identical files; preserved unchanged, no active references |
| D/E/F/G | partner/regulatory/certification/customer/tenant logo binaries | none discovered among tracked image assets; textual names/references are not logo files and were not replaced |

History: `2f67efc` introduced the SVG/Noelia system. `4566cbf` integrated the two
canonical PNGs. `6f0be23` and `f06156b` reused the Trust presenter on Family Office
operational pages. No deleted logo assets were found in accessible history.
Old assets are preserved rather than rewriting evidence. No supplied PNG, Noelia
asset, regulatory reference or third-party document was modified.

## Implementation and document classification

- Two canonical sources and existing components reused. Shell/domain labels use
  the existing catalogue extracted to a DB-free presentation module; authorization
  functions and catalogue entries themselves are unchanged.
- One HistoryNavigation installation in authenticated `/os` header, actual
  `router.back()` / `router.forward()`, no counters or invented sequences.
- Canonical favicon/PWA/Apple/OG; current theme retained, institutional tokens added.
- Existing loading primitive reused below `/os` auth layout; generic error/not-found
  surfaces added without disclosing raw server errors.
- Health document viewer now has a canonical **viewer identity outside the legal
  document body**. No issuer, parties, ID/version/status, dates, hashes or approval
  data changed. Trustee Command gets the separate Trust presenter.
- Flutter login/splash/launcher/shell use one widget. Build sync copies the canonical
  OS file byte-exact into the already-declared images bundle; ignored generated copy.

Document inventory classification:

| Class | Existing material | Action |
|---|---|---|
| A active controlled guidance | `docs/branding/README.md`, `mobile/flutter/README.md` | update identity, provenance, use, test instructions and limitations |
| B active presentation template | `sectors/health/src/components/DocumentViewer.tsx` | brand viewer chrome, not the document issuer/content |
| B template/fixture content | `sectors/health/src/data/documents.ts` | preserve: includes legal/regulatory and signed-looking sample content; not evidence of generated or legally signed real documents |
| C generated output | Health `dist/index.html`, `src/app/health/os/spa-content.ts`; PWA icons | fix source/generator; generated SPA output never committed; icon derivation reproducible |
| D historical evidence | existing root certification/audit/ratification reports and `docs/evidence/**` | preserve, no cosmetic historical rewrite |
| E raw technical artifacts | migrations, schemas, seed/fixture records, JSON registries, contracts and API data exports | unchanged; not document artwork |

No tracked PDF/DOCX/XLSX documents or corresponding generators (ReportLab,
python-docx, openpyxl, PDFKit, jsPDF) were found. No branded email-generation
framework found. The Health “Download PDF” button is an existing unwired control,
not a generator. No PDF/DOCX/XLSX framework, output or fake verification added.

## Local verification evidence

- `npm run verify -- --quick`: PASS (typecheck, lint, production build, canonical
  migration fingerprint, full PostgreSQL/HTTP suite, cooldown, Finance regression).
- Full root suite: **222 files passed, 3 skipped; 4132 tests passed, 11 skipped**.
  Skips: bootstrap enrollment (5), foundation ceremony (4), preparation (2),
  which need their separate optional bootstrap environment. Not reported as tested.
- Finance regression: **369/369** tests, 13 files.
- Branding/navigation focused suites: **80/80** assertions including byte hashes,
  shared presenters, legacy-path detection, Health/Flutter/document references.
- Playwright/Chromium: **9/9**, actual Back/Next clicks and Enter/Space, single pair,
  375/768/1024/1440px, visible focus/44px targets, image load/aspect, domain labels,
  public favicon/manifest/OG, protected deep links, dark-mode contrast/no filters.
  Screenshots kept outside Git. The normal CDN download was unavailable; a
  local Chromium binary from npm plus its bundled libraries executed the tests.
- Root lint: zero errors, one pre-existing `no-img-element` warning in
  `noelia-cross-os-visual.tsx`; not suppressed.
- Health frontend: typecheck/build PASS, **14/14** tests. Isolated Health build
  without root node_modules also passed, validating actual component reuse.
- Health backend: typecheck/build/lint PASS. Aggregate Jest run was resource-killed
  (exit 137); a second run with GC still resource-killed and hit an existing
  5-second migration-roundtrip timeout. No backend code/test threshold changed.
  Complete backend certification requires CI or a sufficiently provisioned runner.
- Migration integrity with ledger and expand/contract PASS; schema-drift PASS;
  gate self-test **8/8**; DR drill PASS (355 tables restored; 272-table RLS set,
  fingerprint and governed chains preserved). One initial invocation lacked its
  explicit admin env; rerun with the ignored local dotenv setup passed.
- Committed-secret scanner PASS. Production dependency gates (critical threshold)
  PASS for root, Health frontend/backend. Root still reports 2 moderate runtime
  advisories; backend reports 13 moderate advisories. Not “zero vulnerabilities.”
- Full root regression initially detected a streaming 200 on unauthenticated
  Family Office protection because of the new root loading boundary. Moved loading
  below authentication and reran the full suite: 307 redirect preserved, PASS.
- Screenshot inspection caught a dark inherited sidebar label; explicit white
  shell text fixed it and browser contrast assertion now pins the result.

Security execution includes authentication HTTP, RBAC audit, ABAC decision and
country scopes, tenant/entity isolation, runtime-role privilege audit, root/
ledger/Family Office/Ujenzi RLS, audit concurrency/atomicity, governed approvals,
Noelia boundary and authorization deep-link tests. These verify the local runtime
role, not production configuration. No authentication, RLS, approval, API guard,
release-control or database schema implementation changed.

## Release limits

This report records pre-PR local evidence. Commit/PR/check/merge/deployment outcomes
must be read from the actual GitHub records and final delivery report, not inferred.
No production credentials were requested or logged. No auth, RLS, tenancy, entity,
country, audit or governance boundary was relaxed. No OS, routing engine, identity
engine or duplicate authority was created. No historical/third-party/Noelia asset
was rewritten. Mobile native runtime and authenticated production Health/document
flows remain unverified; no PDF/DOCX/XLSX generation exists to verify.

Final visual review: Finance's existing `DATA_NOT_AVAILABLE` metric text can
exceed its card at a 1280px viewport. That metric/body source was not changed;
this is a pre-existing content-layout gap, not a claim of platform-wide responsive
certification. The shared logo/label/history controls remain legible and intact.

## Publishing boundary

The focused local implementation commit was created. The subsequent exact-branch
`git push origin arena/01a0bafa-beyu-os-1-0` failed with an HTTPS authentication
error (`could not read Username`, terminal prompts disabled). The user was asked
to reconnect GitHub in Arena, never to provide a token/password in chat.
No push, PR, PR CI, merge or production deployment is claimed for this change.
A subsequent GitHub read also returned HTTP 401, and refreshing remote main was
blocked. The SHA above is the last successfully fetched main, not a fabricated
post-failure remote confirmation.
After reconnection, push this same branch, inspect all required checks/reviews,
resolve any failure without weakening gates, and only then consider merge and
actual production SHA/readiness/PVG verification. Main's pre-existing PVG failure
must not be hidden by a new build or a Vercel Ready status.

## Focused file manifest

Exact changed/new paths at implementation review (generated evidence excluded):

- `.github/workflows/ci.yml`
- `.gitignore`
- `docs/branding/IDENTITY_NAVIGATION_AUDIT_2026-09-19.md`
- `docs/branding/README.md`
- `mobile/flutter/README.md`
- `mobile/flutter/lib/screens/launcher_screen.dart`
- `mobile/flutter/lib/screens/login_screen.dart`
- `mobile/flutter/lib/screens/os_shell_screen.dart`
- `mobile/flutter/lib/screens/splash_screen.dart`
- `mobile/flutter/lib/widgets/beyu_os_logo.dart`
- `package-lock.json`
- `package.json`
- `playwright.config.ts`
- `public/brand/beyu-app-icon-192.png`
- `public/brand/beyu-app-icon-512.png`
- `public/brand/favicon.png`
- `public/manifest.webmanifest`
- `scripts/sync-brand-assets.mjs`
- `sectors/health/index.html`
- `sectors/health/src/components/DocumentViewer.tsx`
- `sectors/health/src/components/Logo.tsx`
- `sectors/health/src/views/Governance.tsx`
- `sectors/health/tsconfig.json`
- `sectors/health/vite.config.ts`
- `src/app/enroll/page.tsx`
- `src/app/error.tsx`
- `src/app/globals.css`
- `src/app/health/page.tsx`
- `src/app/layout.tsx`
- `src/app/not-found.tsx`
- `src/app/os/agriculture/layout.tsx`
- `src/app/os/family/capital/page.tsx`
- `src/app/os/family/page.tsx`
- `src/app/os/family/protection/page.tsx`
- `src/app/os/finance/page.tsx`
- `src/app/os/foundation/layout.tsx`
- `src/app/os/layout.tsx`
- `src/app/os/loading.tsx`
- `src/app/os/os-brand.tsx`
- `src/app/os/os-navigation.tsx`
- `src/app/os/ujenzi/layout.tsx`
- `src/components/beyu-logo.tsx`
- `src/components/beyu-os-logo.tsx`
- `src/components/brand-assets.ts`
- `src/components/brand.tsx`
- `src/components/family-trust-logo.tsx`
- `src/components/history-navigation.tsx`
- `src/components/noelia-panel.tsx`
- `src/lib/operating-system-catalog.ts`
- `src/lib/operating-systems.ts`
- `tests/architecture/p1-release-invariants.test.ts`
- `tests/browser/history-brand.spec.ts`
- `tests/frontend/brand-identity.test.ts`
- `tests/frontend/canonical-brand-references.test.ts`
- `tests/frontend/history-navigation.test.ts`
