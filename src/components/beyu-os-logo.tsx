import { BEYU_OS_ASSETS, BEYU_OS_ASSET_DIMENSIONS } from "./brand-assets";

/**
 * <BeyuOsLogo /> — the BEYU OS control-plane/software identity.
 *
 * Renders the AUTHORITATIVE BEYU OS mark from the central registry
 * (/public/brand/beyu-os-logo.png), byte-for-byte as supplied — never
 * re-drawn, recoloured, cropped or recompressed.
 *
 * Identity boundary (docs/branding/README.md):
 *   BeyuOsLogo      = the BEYU OS enterprise control-plane identity. Use it
 *   on BEYU OS application surfaces (sign-in, control-plane chrome).
 *   <FamilyTrustLogo /> = the parent institutional/fiduciary identity — use
 *   that only on genuine Family Trust / institutional surfaces. NEVER
 *   substitute one for the other. Sector OSs (Health / Finance / Agriculture)
 *   keep their own identities.
 *
 * Presentation note: the authoritative file has a white studio matte, so on
 * DARK surfaces it is presented inside a light plate by the caller (standard
 * raster-logo treatment). For dark chrome without a plate, the registry's
 * reversed SVG lockup (<BeyuLogo variant="light" />) remains the canonical
 * asset.
 */
export interface BeyuOsLogoProps {
  /** Rendered HEIGHT in px (width follows the source aspect ratio). */
  size?: number;
  className?: string;
  /** Wrap the logo in a link. */
  href?: string;
  /** Accessible name. Defaults to "BEYU OS". */
  ariaLabel?: string;
  /** Purely decorative: renders alt="" with no accessible name. */
  decorative?: boolean;
}

export function BeyuOsLogo({
  size = 40,
  className,
  href,
  ariaLabel,
  decorative = false,
}: BeyuOsLogoProps) {
  const { width: intrinsicWidth, height: intrinsicHeight } = BEYU_OS_ASSET_DIMENSIONS;
  const height = size;
  // Source aspect ratio (1:1) is contractual — width derives from the
  // intrinsic dimensions, never from a hard-coded value.
  const width = Math.round((size * intrinsicWidth) / intrinsicHeight);
  const alt = decorative ? "" : (ariaLabel ?? "BEYU OS");

  // Plain <img> on purpose, exactly like <BeyuLogo />: a fixed-dimension brand
  // asset from the central registry — no optimization pipeline (which would
  // re-encode the authoritative bytes), and the asset stays replaceable in
  // place (no next/image loader coupling). `width: auto` keeps the rendered
  // ratio exactly the intrinsic one.
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={BEYU_OS_ASSETS.official}
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
        aria-label={decorative ? undefined : (ariaLabel ?? "BEYU OS home")}
        className={`inline-flex items-center ${className ?? ""}`.trim()}
      >
        {img}
      </a>
    );
  }
  return img;
}
