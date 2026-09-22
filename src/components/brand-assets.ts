/**
 * BEYU brand + Noelia identity — central asset registry.
 *
 * SINGLE SOURCE OF TRUTH for public asset URLs. The two institutional PNGs
 * remain byte-exact sources; generated platform icons trace to the OS source.
 * Components never redraw artwork. Legacy SVGs are historical, not active.
 * Noelia has its own registry and remains a distinct governed AI identity.
 */

export const BEYU_OS_ASSETS = {
  /** Official BEYU OS mark — enterprise control-plane/software identity. */
  official: "/brand/beyu-os-logo.png",
} as const;

/** Compatibility paths all resolve to the ONE operating source, never old SVGs. */
export const BEYU_BRAND_ASSETS = {
  full: BEYU_OS_ASSETS.official,
  mark: BEYU_OS_ASSETS.official,
  light: BEYU_OS_ASSETS.official,
  dark: BEYU_OS_ASSETS.official,
  /** Derived by scripts/sync-brand-assets.mjs from the unmodified OS PNG. */
  favicon: "/brand/favicon.png",
  appIcon512: "/brand/beyu-app-icon-512.png",
  appIcon192: "/brand/beyu-app-icon-192.png",
} as const;

/**
 * AUTHORITATIVE raster brand assets (PNG) — supplied by the BEYU Family Trust.
 *
 * These files are the canonical, byte-exact institutional artwork, pinned by
 * SHA-256 in tests/frontend/brand-identity.test.ts. They must NEVER be
 * regenerated, recompressed, recoloured, cropped or converted; replace one
 * only by copying a newly supplied authoritative file byte-for-byte.
 *
 * TWO DISTINCT IDENTITIES — never substitute one for the other, never merge
 * them into one generic logo (see docs/branding/README.md):
 *   • BEYU FAMILY TRUST → parent institutional/fiduciary identity
 *     (genuine Family Trust governance and ownership surfaces).
 *   • BEYU OS           → enterprise control-plane / software identity
 *     (BEYU OS application surfaces, e.g. sign-in).
 * All operating domains, including Ujenzi and Family Office, share BEYU OS.
 */
export const BEYU_FAMILY_TRUST_ASSETS = {
  /** Official BEYU Family Trust lockup — parent institutional identity. */
  official: "/brand/beyu-family-trust-logo.png",
} as const;



/** Intrinsic pixel dimensions of the authoritative assets — aspect is contractual. */
export const BEYU_FAMILY_TRUST_ASSET_DIMENSIONS = { width: 1239, height: 1254 } as const;
export const BEYU_OS_ASSET_DIMENSIONS = { width: 1254, height: 1254 } as const;

export const NOELIA_ASSETS = {
  /** Canonical Noelia portrait (SVG — identical at every size). */
  avatar: "/noelia/noelia-avatar.svg",
  /** Raster export of the canonical portrait (1024px). */
  avatarPng: "/noelia/noelia-avatar.png",
  /** Raster export of the canonical portrait (1024px, WebP). */
  avatarWebp: "/noelia/noelia-avatar.webp",
  /** Identity mark for small sizes (≤ 32px) — never a distorted portrait. */
  icon: "/noelia/noelia-icon.svg",
  /** Neutral fallback when the portrait cannot be loaded. */
  placeholder: "/noelia/noelia-placeholder.svg",
} as const;

/** CANONICAL NOELIA PNG ASSET REGISTRY — authoritative preserved images (never modified/regenerated). */
export const NOELIA_CANONICAL_PNG_ASSETS = {
  noelia_ai: {
    canonicalFilename: "Noelia AI .png",
    repositoryPath: "/Noelia AI .png",
    presentationPath: "/noelia/canonical/noelia-ai-canonical.png",
    logicalIdentifier: "noelia-ai",
    sha256: "12542aef08ef5bb087a9ad15e2a8631a",
    contextMapping: "NOELIA_AI",
    dimensions: { width: 1024, height: 1024 },
    status: "PRESERVED",
  },
  noelia_beyu_os: {
    canonicalFilename: "Noelia BEYU OS.png",
    repositoryPath: "/Noelia BEYU OS.png",
    presentationPath: "/noelia/canonical/noelia-beyu-os-canonical.png",
    logicalIdentifier: "noelia-beyu-os",
    sha256: "4f61c9187398e80e32746b0f8540b513",
    contextMapping: "BEYU_OS",
    dimensions: { width: 1024, height: 1024 },
    status: "PRESERVED",
  },
  noelia_finance_os: {
    canonicalFilename: "Noelia Finance os.png",
    repositoryPath: "/Noelia Finance os.png",
    presentationPath: "/noelia/canonical/noelia-finance-os-canonical.png",
    logicalIdentifier: "noelia-finance-os",
    sha256: "2eb029f1739e9fbf54041dccfae27093",
    contextMapping: "FINANCE_OS",
    dimensions: { width: 1024, height: 1024 },
    status: "PRESERVED",
  },
  noelia_health_os: {
    canonicalFilename: "Noelia Health os.png",
    repositoryPath: "/Noelia Health os.png",
    presentationPath: "/noelia/canonical/noelia-health-os-canonical.png",
    logicalIdentifier: "noelia-health-os",
    sha256: "6a63d1037bd0bb68d4811ebd1516b1e3",
    contextMapping: "HEALTH_OS",
    dimensions: { width: 1024, height: 1024 },
    status: "PRESERVED",
  },
  noelia_agriculture: {
    canonicalFilename: "Noeloa Agriculture OS.png",
    repositoryPath: "/Noeloa Agriculture OS.png",
    presentationPath: "/noelia/canonical/noelia-agriculture-os-canonical.png",
    logicalIdentifier: "noelia-agriculture",
    sha256: "14ea902f3a8b88e685cc183a83fb1699",
    contextMapping: "AGRICULTURE_OS",
    dimensions: { width: 1024, height: 1024 },
    status: "PRESERVED",
    notes: "Original filename preserved exactly. Never renamed, deleted, or regenerated.",
  },
  ujenzi_os: {
    canonicalFilename: "Noelia AI .png",
    repositoryPath: "/Noelia AI .png",
    presentationPath: "/noelia/canonical/noelia-ai-canonical.png",
    logicalIdentifier: "noelia-ai",
    sha256: "12542aef08ef5bb087a9ad15e2a8631a",
    contextMapping: "UJENZI_OS",
    dimensions: { width: 1024, height: 1024 },
    status: "FALLBACK_CANONICAL",
    notes: "UJENZI_OS contextual asset unavailable; canonical Noelia fallback active.",
  },
} as const;
