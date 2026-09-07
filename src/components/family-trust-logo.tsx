import { BEYU_FAMILY_TRUST_ASSETS, BEYU_FAMILY_TRUST_ASSET_DIMENSIONS } from "./brand-assets";

/**
 * <FamilyTrustLogo /> — the BEYU FAMILY TRUST institutional identity.
 *
 * Renders the AUTHORITATIVE Family Trust lockup from the central registry
 * (/public/brand/beyu-family-trust-logo.png), byte-for-byte as supplied —
 * never re-drawn, recoloured, cropped or recompressed.
 *
 * Identity boundary (docs/branding/README.md):
 *   FamilyTrustLogo = the parent institutional/fiduciary identity. Use it on
 *   genuine Family Trust / institutional surfaces (e.g. Family Office).
 *   <BeyuOsLogo />   = the BEYU OS control-plane/software identity. Use that
 *   on BEYU OS application surfaces. NEVER substitute one for the other.
 *   Sector OSs (Health / Finance / Agriculture) keep their own identities.
 */
export interface FamilyTrustLogoProps {
  /** Rendered HEIGHT in px (width follows the source aspect ratio). */
  size?: number;
  className?: string;
  /** Wrap the logo in a link. */
  href?: string;
  /** Accessible name. Defaults to "BEYU Family Trust". */
  ariaLabel?: string;
  /** Purely decorative: renders alt="" with no accessible name. */
  decorative?: boolean;
}

export function FamilyTrustLogo({
  size = 96,
  className,
  href,
  ariaLabel,
  decorative = false,
}: FamilyTrustLogoProps) {
  const { width: intrinsicWidth, height: intrinsicHeight } = BEYU_FAMILY_TRUST_ASSET_DIMENSIONS;
  const height = size;
  // Source aspect ratio (1239:1254) is contractual — width derives from it,
  // never from a hard-coded value, so the artwork can never distort.
  const width = Math.round((size * intrinsicWidth) / intrinsicHeight);
  const alt = decorative ? "" : (ariaLabel ?? "BEYU Family Trust");

  // Plain <img> on purpose, exactly like <BeyuLogo />: a fixed-dimension brand
  // asset from the central registry — no optimization pipeline (which would
  // re-encode the authoritative bytes), and the asset stays replaceable in
  // place (no next/image loader coupling). `width: auto` keeps the rendered
  // ratio exactly the intrinsic one.
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={BEYU_FAMILY_TRUST_ASSETS.official}
      alt={alt}
      width={width}
      height={height}
      style={{ height, width: "auto" }}
      draggable={false}
      className={href ? undefined : className}
    />
  );

  if (href) {
    return (
      <a
        href={href}
        aria-label={decorative ? undefined : (ariaLabel ?? "BEYU Family Trust")}
        className={`inline-flex items-center ${className ?? ""}`.trim()}
      >
        {img}
      </a>
    );
  }
  return img;
}
