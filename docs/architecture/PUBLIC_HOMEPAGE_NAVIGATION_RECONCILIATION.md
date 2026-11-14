# Public Homepage Reconciliation — PR #117

## Scope

Update the public root homepage on the current production baseline (`dc8f848226ed8860ef293f817fe10394360abb1d`) while preserving the existing authenticated root route and canonical-host authorization model.

## Changes

- Replaced every inert `href="#"` placeholder with a real in-page section anchor or a governed route.
- Wired all primary Sign In calls to the existing `/sign-in` route; that route delegates to the same server-side canonical sign-in implementation as `/`.
- Wired the four Sector OS cards and footer destinations to their existing route namespaces. Foundation, Family Office and NOELIA remain destinations/surfaces, not additional Sector OSs.
- Added a responsive mobile navigation disclosure with keyboard-operable native `details/summary` semantics.
- Aligned the public header to the institutional navy/gold palette and improved responsive navigation at tablet/mobile widths.
- Kept the homepage as semantic, accessible page content. The approved full-page reference is a design reference, not a flattened screenshot background.
- Reused the repository central BEYU OS logo component and canonical `/NOELIA.png` portrait path. No brand asset bytes were changed.

## Security / architecture invariants preserved

- The root page remains dynamic and server-rendered.
- `resolvePrincipal()`, canonical host resolution, `authorizedGovernedDestinations()`, and the existing permission checks remain in place.
- `/sign-in` continues to delegate to the root sign-in implementation; no duplicate authentication implementation was added.
- Destination links are presentation/navigation only. Destination routes retain their own server-side authorization and tenant-scope checks.
- Hostnames do not grant authority. No browser storage, client-side identity, or client-selected OS authorization was introduced.

## Verification

- Added `tests/homepage/public-homepage-navigation.test.ts` to assert no placeholder links, valid in-page targets, canonical sign-in routing, expected governed destinations, and responsive mobile navigation.
- GitHub Actions PostgreSQL-backed security gate is pending for the latest branch head.
- Vercel Preview status reported a build-rate-limit failure (not an application compilation failure); no Production alias or domain was changed.
- No local build, browser screenshot, or viewport E2E test is claimed from this editing session.

## Review limitations / next gates

- The route currently uses the repository `BeyuOsLogo` component. The transparent B/tree/leaf/gold-arc emblem designated as the canonical public BEYU mark has not yet been integrated into `public/brand`, so final public brand parity remains open. The canonical `/NOELIA.png` portrait is referenced by the NOELIA panel.
- The repository does not contain separate production-ready photo assets for every building, globe, and Sector OS card illustration in the design reference. The homepage retains semantic CSS illustration treatments rather than using a flattened screenshot or inventing new brand assets.
- Human review should compare the actual preview at 320px, 390px, 768px, 1024px and 1440px, verify contrast/focus/keyboard behavior, and decide whether additional approved photographic assets are required for pixel-level fidelity.
- This PR remains draft. Do not merge, auto-merge, promote, or deploy to Production.
