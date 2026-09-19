# BEYU institutional identity and shared history navigation

## Constitutional context

BEYU Family Trust → BEYU Holding Company → country holdings / sector operating
companies. BEYU Foundation is the separate nonprofit sister organization.
BEYU OS remains **one** constitutional control plane, enterprise kernel and
governed intelligence layer. Family Office is a shared capability, not an OS.
Noelia/HIVE governance and all authorization remain independent of branding.

## Two authoritative sources, no new artwork

| Identity | Canonical source | Presenter | SHA-256 |
|---|---|---|---|
| BEYU FAMILY TRUST | `public/brand/beyu-family-trust-logo.png` (1239×1254) | `src/components/family-trust-logo.tsx` / `FamilyTrustLogo` | `b599e2e079e9def8c3161fd6b734d7268f19c480ed85cf16123c4a76125287e8` |
| BEYU OS / operating ecosystem | `public/brand/beyu-os-logo.png` (1254×1254) | `src/components/beyu-os-logo.tsx` / `BeyuOsLogo` | `9fb216119cc6a80557aa75d73b9704a44f550626cd25a30e2acc2b95c4ba1e1d` |

The existing files are unmodified, including their white matte. No cropping,
recolouring, tracing, filters or alternate dark-mode artwork. Size, decorative
alt text, accessible names and optional links are presentation only. Use a
light plate when needed on dark chrome. Never replace an informative link's
accessible name with an empty/decorative image alone.

```tsx
<BeyuOsLogo size={40} /> // alongside the operating domain name
<FamilyTrustLogo size={96} /> // only where the Trust itself is represented
```

All implemented operating domains use the SAME `BeyuOsLogo`: BEYU OS, Finance OS,
Health OS, Agriculture OS, Ujenzi OS, Foundation OS and Family Office. Domain
icons are technical navigation icons, not institutional logos. Future approved
sectors reuse this presenter and the existing OS catalogue; no new brand engine.

`src/lib/operating-system-catalog.ts` contains the existing presentation catalogue,
extracted without changing its data. `operating-systems.ts` re-exports it and
retains ALL authorization resolution. `src/app/os/os-brand.tsx` changes the label
based on the current pathname, never access rights. Family Trust lineage and
beneficiary governance keeps its separately labelled Trust mark inside the
Family Office workspace; capital/protection operations use the OS identity.
Health's Trustee Command similarly uses the Trust presenter only in the
constitutional authority panel. The surrounding Health shell is operating identity.

`BeyuLogo` remains a deprecated compatibility adapter to `BeyuOsLogo`. Its old
full/mark/light/dark arguments no longer select competing artwork or distort the
square source into a wide SVG lockup. Existing SVG files are retained as historical
assets, not referenced by active UI or metadata. See the forensic inventory.

## Platform assets and provenance

- Asset URLs remain in `src/components/brand-assets.ts`.
- `npm run brand:sync` produces 32px favicon and 192/512px PWA icons using the
  existing Next.js image processor, resizing the complete canonical OS image.
  It never writes either canonical source. These are derivatives, not new logos.
- `npm run brand:check` verifies committed web derivatives against that source;
  the root build runs this check. Supply a newly approved source only through a
  controlled asset update with reviewed byte-integrity test changes.
- The same sync copies the OS PNG byte-for-byte into the ignored Flutter bundle
  path `mobile/flutter/assets/images/beyu-os-logo.png`. Run it before Flutter
  builds. The generated copy is not an independent source of truth.
- Root favicon, Apple icon and PWA reference the derivatives. OpenGraph references
  the original OS PNG. Domain page/layout titles supply contextual labels.
- Health's existing `Logo` is only a presentation adapter importing the SAME
  React presenter. Vite serves the root `public` directory in development but
  does not copy it into the single-file SPA output; the mounted Next app serves
  those assets. React deduplication and the JSX type path keep the sector's own
  toolchain independent of a root dependency installation.

The existing UI theme is not recoloured. The institutional palette is recorded
as `--beyu-institutional-navy: #0B1F4D` and
`--beyu-institutional-gold: #D4A017` alongside existing theme tokens.
BEYU motto: **Bridging Care. Building Trust.**

## Noelia and other identities

Noelia remains separate: `src/components/noelia-avatar.tsx`,
`src/components/noelia-cross-os-visual.tsx`, `public/noelia/*` and the five
original repository-root PNGs are preserved. Noelia motto:
**Intelligence • Governance • Care.** Noelia is not constitutional authority.
`NoeliaPanel` changes only its surrounding BEYU anchor to `BeyuOsLogo`; portrait,
state indicators, permissions and HIVE behavior are unchanged.
Partner/regulatory/certification/customer/tenant marks must never be replaced by
an institutional filename sweep. Tests deliberately scope duplicate detection
to inventoried BEYU institutional paths and presenters.

## Global Back / Next

`src/components/history-navigation.tsx` is installed once in the header of
`src/app/os/layout.tsx`, after the existing principal, OS authorization and tenant
context checks. It calls Next App Router `router.back()` / `router.forward()`.
There is no artificial destination list, history counter, local-storage state,
route discovery, business mutation or authorization logic.

Both controls stay enabled: browsers safely no-op at unavailable history ends,
and `history.length` cannot tell us universal forward depth. Back may return to
an external site if that is the browser's actual prior history.
Native buttons support Tab/Enter/Space, labelled arrow icons, visible focus,
44px minimum touch targets and compact mobile labels. The pair is hidden in print.
Health is a separately mounted in-memory SPA, not an `/os` child: it does not get
a duplicate routing system or synthetic per-view history.

Loading uses the existing primitive below the authenticated `/os` layout, NOT a
root suspense boundary that would stream HTTP 200 before an auth redirect.

## Documents and verification

No PDF/DOCX/XLSX generator or branded email generator exists in the audited tree.
The Health document viewer has a canonical *viewer* header outside the legal
content. Issuer, parties, IDs, effective dates, version/status and integrity proof
are not changed. Its existing Download PDF button has no implementation; this
work does not pretend otherwise or invent a document framework.

Run root lint/typecheck/test/build, `npm run brand:check`, the existing migration
and security gates, and `npm run test:browser` against the local seeded runtime
server. Browser tests require Chromium (`npx playwright install chromium`), an
RLS-bound server, and the existing disposable-test credential setup. An optional
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` supports a locally installed Chromium;
it does not change application security. CI runs browser tests after the existing
PostgreSQL and HTTP suite. See `IDENTITY_NAVIGATION_AUDIT_2026-09-19.md` for scope,
forensics, document classification and honest verification limits.
