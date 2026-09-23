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

/**
 * CANONICAL NOELIA APPEARANCE CONTRACT
 *
 * Noelia's canonical visual appearance is the repository asset `/NOELIA.png`.
 * It is the SINGLE canonical visual reference: every application surface that
 * shows Noelia's appearance — control plane, Sector OS contexts, organization
 * page, shell, panels — resolves to this ONE asset. Sector/contextual
 * experiences change wording, tools, permissions and workflows, never the
 * appearance asset. Alternate Noelia avatar assets must not be introduced
 * without an explicit architecture decision. Appearance confers no
 * authorization or capability of any kind.
 *
 * `public/NOELIA.png` is the byte-exact deployment copy of the root
 * `/NOELIA.png` (Next.js serves only `public/`); byte-equality is pinned by
 * tests. Neither file may be modified, recompressed, recolored, cropped or
 * regenerated.
 */
export const NOELIA_CANONICAL_APPEARANCE = {
  /** Application URL of the single canonical Noelia appearance. */
  path: "/NOELIA.png",
  /** Tracked repository source asset (byte-identical to the deployed copy). */
  repositoryPath: "/NOELIA.png",
  sha256: "643b375a9abc074a5e4b53d581b09c20fddbfca6701f0d71f3a13c3d5754c990",
  md5: "320f9a86fd740a371f3a57d70e1bba4d",
  dimensions: { width: 1119, height: 1405 },
  altText: "Noelia AI — governed AI identity of BEYU OS",
} as const;

export const NOELIA_ASSETS = {
  /** THE canonical Noelia portrait — /NOELIA.png, never a re-drawn face. */
  avatar: NOELIA_CANONICAL_APPEARANCE.path,
  /** Identity mark for small sizes (≤ 32px) — never a distorted portrait. */
  icon: "/noelia/noelia-icon.svg",
  /** Neutral fallback when the portrait cannot be loaded. */
  placeholder: "/noelia/noelia-placeholder.svg",
} as const;

/**
 * HISTORICAL NOELIA PNG REGISTER — preserved root originals (provenance only).
 *
 * These files remain byte-exact at the repository root for provenance. They
 * are NOT application-served appearance variants and have no presentation
 * path: every runtime surface resolves Noelia's appearance to the SINGLE
 * canonical asset, NOELIA_CANONICAL_APPEARANCE.path (/NOELIA.png).
 */
export const NOELIA_HISTORICAL_PNG_ASSETS = {
  noelia_ai: {
    canonicalFilename: "Noelia AI .png",
    repositoryPath: "/Noelia AI .png",
    logicalIdentifier: "noelia-ai",
    md5: "12542aef08ef5bb087a9ad15e2a8631a",
    status: "HISTORICAL_PRESERVED",
  },
  noelia_beyu_os: {
    canonicalFilename: "Noelia BEYU OS.png",
    repositoryPath: "/Noelia BEYU OS.png",
    logicalIdentifier: "noelia-beyu-os",
    md5: "4f61c9187398e80e32746b0f8540b513",
    status: "HISTORICAL_PRESERVED",
  },
  noelia_finance_os: {
    canonicalFilename: "Noelia Finance os.png",
    repositoryPath: "/Noelia Finance os.png",
    logicalIdentifier: "noelia-finance-os",
    md5: "2eb029f1739e9fbf54041dccfae27093",
    status: "HISTORICAL_PRESERVED",
  },
  noelia_health_os: {
    canonicalFilename: "Noelia Health os.png",
    repositoryPath: "/Noelia Health os.png",
    logicalIdentifier: "noelia-health-os",
    md5: "6a63d1037bd0bb68d4811ebd1516b1e3",
    status: "HISTORICAL_PRESERVED",
  },
  noelia_agriculture: {
    canonicalFilename: "Noeloa Agriculture OS.png",
    repositoryPath: "/Noeloa Agriculture OS.png",
    logicalIdentifier: "noelia-agriculture",
    md5: "14ea902f3a8b88e685cc183a83fb1699",
    status: "HISTORICAL_PRESERVED",
    notes: "Original filename preserved exactly. Never renamed, deleted, or regenerated.",
  },
} as const;

/** Compatibility alias — every entry is historical; the served appearance is /NOELIA.png. */
export const NOELIA_CANONICAL_PNG_ASSETS = NOELIA_HISTORICAL_PNG_ASSETS;
