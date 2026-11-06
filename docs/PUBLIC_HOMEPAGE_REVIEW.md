# Public homepage implementation review

## Reality check and routing plan

- **IMPLEMENTED**: Next.js App Router application with canonical host resolution and a shared server-side sign-in. Previously `/sign-in` imported the root page, which also resolved the principal and authorized destinations. The shared implementation is now in `src/app/canonical-sign-in.tsx`; `/sign-in` delegates to it and canonical Sector OS and shared-surface hosts still use it at `/`.
- **IMPLEMENTED**: The control-plane and neutral root now render the public homepage. This intentionally changes the old neutral-root sign-in/automatic redirect: an existing session is not cleared, and `/sign-in` still performs the existing authorized destination resolution. Protected endpoints continue to enforce their own gates.
- **IMPLEMENTED**: Four Sector OS links, Foundation and NOELIA use the existing canonical catalogue and `destinationHrefForRequest` rather than new destinations. They are not authorization decisions.
- **VERIFIED**: A production-mode HTTP smoke check with the canonical domain configured returned the public home on the apex and the governed sign-in on the health, finance and NOELIA hosts. `/sign-in` returned the existing form without development bootstrap identities.
- **IMPLEMENTED**: Public content uses the repository's BEYU logo and NOELIA image. The landscape is an AI-generated illustration, not evidence of a real BEYU project or location.
- **PLANNED / NOT VERIFIED**: Homepage descriptions of sector capabilities, API, MCP, HIVE and security express architectural scope, not a certification that all capabilities or integrations are enabled or connected.
- **BLOCKED / NOT VERIFIED**: Authenticated login, MFA, tenant isolation and workspace flows require a configured database and valid test identities. They were not exercised end to end in this environment. At that earlier stage browser checks had not yet been run; see the reference-led revision below.
- **BLOCKED**: No verified general public contact, published privacy policy or terms routes were found. The repository documents a security-reporting email, but its production deliverability is unverified; general contact and legal links need approved destinations before they can be added.

## Validation

- `npm run lint`: passed with one existing warning in `noelia-cross-os-visual.tsx`.
- `NODE_OPTIONS=--max-old-space-size=3000 npm run typecheck`: passed.
- `NODE_OPTIONS=--max-old-space-size=3000 npm run build`: passed; existing dynamic filesystem tracing warnings remain.
- Focused homepage, branding and canonical routing/sign-in suites: 167 passed, 7 skipped.
- Full `npm test`: failed in this environment: 709 failures, 3230 passes, 1912 skipped and 31 todo. Database-dependent suites lack `DATABASE_URL`/PostgreSQL; several source-location assertions were subsequently updated for the extracted sign-in and pass in the focused run. The full suite was not rerun after those updates.

## Reference-led revision

The reference was inspected from the GitHub `main` branch (`Home page.png`, blob `59b684eb001ba4c87865e5d81992ebbe1f7f2556`); it was not present in this session's starting checkout. The revised page takes its dark sticky navigation, connected-globe hero, photographic sector cards, navy-and-gold NOELIA treatment, landscape and adjacent sign-in panel from the reference composition. The canonical BEYU OS PNG and `public/NOELIA.png` are used rather than invented identities in the reference.

- **IMPLEMENTED**: The canonical BEYU OS PNG logo, with its original white matte, is used unchanged (the historical SVG was removed from active presentation). NOELIA's original portrait and its dark background are retained unchanged; background removal was not attempted because an unverified cutout could damage distinguishing details.
- **SIMULATED / ILLUSTRATIVE**: The globe, institutional building, landscape and four sector images are AI-generated illustrations, not evidence of completed facilities, projects or operating results. JPEGs are optimized and loaded locally; sector imagery uses responsive Next.js image handling.
- **IMPLEMENTED**: The sign-in panel links to the shared sign-in and to canonical Sector OS and Foundation destinations. Unauthenticated deep links now redirect to `/sign-in` rather than `/`, because the neutral root is a public homepage. This preserves access to the existing sign-in without treating a hostname or link as authority. The host-aware sign-in and destination gates are unchanged.
- **VERIFIED**: On a production-mode local server configured for the canonical domain, apex/www root returned the homepage; Health, Finance, Agriculture, Ujenzi, Foundation and NOELIA roots returned their existing sign-in surfaces. Unauthenticated Sector OS and Foundation deep links returned a 307 to `/sign-in`.
- **VERIFIED**: Playwright tests passed at 1440, 768, 390 and 320 pixels against the production build. Checks covered loaded images, no document-wide horizontal overflow, section anchors, desktop dropdown keyboard activation, mobile menu, sector and ownership disclosure, sign-in link and unauthenticated destination redirects; no page or console errors were reported in those tests. This is not a full accessibility audit or performance benchmark.
- **VERIFIED**: `npm run lint` passed with the existing NOELIA visual warning; `NODE_OPTIONS=--max-old-space-size=3000 npm run typecheck` and `npm run build` passed. Focused Vitest suites passed 176 tests with 7 skipped. The existing full suite was not rerun in this revision; the earlier database-related failures remain unresolved here.
- **BLOCKED / NOT VERIFIED**: The existing `history-brand` browser suite could not run because its shared setup requires `BEYU_BOOTSTRAP_PASSWORD` and a database. Authenticated sign-in, MFA, destination permissions and tenant-specific flows require a configured environment and authorized test identities. No Lighthouse or field performance measurement was performed.
- **PLANNED**: Approved public contact, privacy and terms destinations, and optional appearance controls still need institutional direction. No unverified links or social accounts were added.
