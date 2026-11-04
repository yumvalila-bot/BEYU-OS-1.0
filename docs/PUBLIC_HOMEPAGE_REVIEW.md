# Public homepage implementation review

## Reality check and routing plan

- **IMPLEMENTED**: Next.js App Router application with canonical host resolution and a shared server-side sign-in. Previously `/sign-in` imported the root page, which also resolved the principal and authorized destinations. The shared implementation is now in `src/app/canonical-sign-in.tsx`; `/sign-in` delegates to it and canonical Sector OS and shared-surface hosts still use it at `/`.
- **IMPLEMENTED**: The control-plane and neutral root now render the public homepage. This intentionally changes the old neutral-root sign-in/automatic redirect: an existing session is not cleared, and `/sign-in` still performs the existing authorized destination resolution. Protected endpoints continue to enforce their own gates.
- **IMPLEMENTED**: Four Sector OS links, Foundation and NOELIA use the existing canonical catalogue and `destinationHrefForRequest` rather than new destinations. They are not authorization decisions.
- **VERIFIED**: A production-mode HTTP smoke check with the canonical domain configured returned the public home on the apex and the governed sign-in on the health, finance and NOELIA hosts. `/sign-in` returned the existing form without development bootstrap identities.
- **IMPLEMENTED**: Public content uses the repository's BEYU logo and NOELIA image. The landscape is an AI-generated illustration, not evidence of a real BEYU project or location.
- **PLANNED / NOT VERIFIED**: Homepage descriptions of sector capabilities, API, MCP, HIVE and security express architectural scope, not a certification that all capabilities or integrations are enabled or connected.
- **BLOCKED / NOT VERIFIED**: Authenticated login, MFA, tenant isolation and workspace flows require a configured database and valid test identities. They were not exercised end to end in this environment. Browser visual and interaction checks require a browser binary, which was unavailable here.
- **BLOCKED**: No verified general public contact, published privacy policy or terms routes were found. The footer uses the repository's published security-reporting email; general contact and legal links need approved destinations before they can be added.

## Validation

- `npm run lint`: passed with one existing warning in `noelia-cross-os-visual.tsx`.
- `NODE_OPTIONS=--max-old-space-size=3000 npm run typecheck`: passed.
- `NODE_OPTIONS=--max-old-space-size=3000 npm run build`: passed; existing dynamic filesystem tracing warnings remain.
- Focused homepage, branding and canonical routing/sign-in suites: 167 passed, 7 skipped.
- Full `npm test`: failed in this environment: 709 failures, 3230 passes, 1912 skipped and 31 todo. Database-dependent suites lack `DATABASE_URL`/PostgreSQL; several source-location assertions were subsequently updated for the extracted sign-in and pass in the focused run. The full suite was not rerun after those updates.
