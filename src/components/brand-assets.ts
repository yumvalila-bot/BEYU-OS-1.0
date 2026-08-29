/**
 * BEYU brand + Noelia identity — central asset registry.
 *
 * SINGLE SOURCE OF TRUTH for brand asset paths. Components (BeyuLogo,
 * NoeliaAvatar, NoeliaPanel) resolve every image through this registry; no
 * component hard-codes an asset URL, and no application code embeds the logo
 * or avatar SVG geometry.
 *
 * The asset FILES themselves (public/brand/*, public/noelia/*) are the
 * replaceable brand artefacts: swap a file in place (same path, same
 * viewBox) and every surface in the product updates without a code change.
 *
 * Hierarchy encoded by this system (see docs/branding/README.md):
 *   BEYU (institution) → BEYU OS (operating & governance environment)
 *   → HIVE (governed AI runtime) → NOELIA AI (unified governed AI identity).
 */

export const BEYU_BRAND_ASSETS = {
  /** Primary lockup, default. Use on LIGHT / neutral surfaces. */
  full: "/brand/beyu-logo.svg",
  /** Canonical mark only (gold ring · navy "B" · sage tree). */
  mark: "/brand/beyu-logo-mark.svg",
  /** Reversed lockup. Use on DARK surfaces (BEYU OS shell, sign-in). */
  light: "/brand/beyu-logo-light.svg",
  /** Primary lockup, dark wordmark. Use on LIGHT surfaces. */
  dark: "/brand/beyu-logo-dark.svg",
  /** Browser tab / app tile (self-contained navy tile). */
  favicon: "/brand/favicon.svg",
  /** PWA app icon, 512px. */
  appIcon512: "/brand/beyu-app-icon-512.png",
  /** PWA app icon, 192px. */
  appIcon192: "/brand/beyu-app-icon-192.png",
} as const;

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
