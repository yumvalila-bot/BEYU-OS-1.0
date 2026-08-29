import { BEYU_BRAND_ASSETS } from "./brand-assets";

/**
 * <BeyuLogo /> — the one place the BEYU brand mark is presented.
 *
 * Renders the official logo from the central registry (/public/brand/*).
 * The SVG geometry lives ONLY in those files — this component (and the rest
 * of the codebase) never inlines or re-draws the mark, so the official asset
 * can be re-cut in place without touching application code.
 *
 * Variant → asset → intended surface:
 *   full  → /brand/beyu-logo.svg      light/neutral surfaces (default)
 *   dark  → /brand/beyu-logo-dark.svg light/neutral surfaces (re-cut slot)
 *   light → /brand/beyu-logo-light.svg dark surfaces (BEYU OS shell, sign-in)
 *   mark  → /brand/beyu-logo-mark.svg  compact contexts (footers, chips)
 */
export type BeyuLogoVariant = "full" | "mark" | "light" | "dark";

const VARIANTS: Record<BeyuLogoVariant, { src: string; aspect: number }> = {
  mark: { src: BEYU_BRAND_ASSETS.mark, aspect: 1 },
  full: { src: BEYU_BRAND_ASSETS.full, aspect: 3.8 },
  light: { src: BEYU_BRAND_ASSETS.light, aspect: 3.8 },
  dark: { src: BEYU_BRAND_ASSETS.dark, aspect: 3.8 },
};

export interface BeyuLogoProps {
  /** Lockup variant. Default "full". */
  variant?: BeyuLogoVariant;
  /** Rendered HEIGHT in px (width follows the variant's aspect ratio). */
  size?: number;
  className?: string;
  /** Wrap the logo in a link (e.g. to /os). */
  href?: string;
  /** Accessible name. Defaults to "BEYU OS" (lockups) or "BEYU" (mark). */
  ariaLabel?: string;
  /** Purely decorative: renders alt="" with no accessible name. */
  decorative?: boolean;
}

export function BeyuLogo({
  variant = "full",
  size = 40,
  className,
  href,
  ariaLabel,
  decorative = false,
}: BeyuLogoProps) {
  const { src, aspect } = VARIANTS[variant];
  const height = size;
  const width = Math.round(size * aspect);
  const alt = decorative ? "" : (ariaLabel ?? (variant === "mark" ? "BEYU" : "BEYU OS"));

  // Plain <img> on purpose: fixed-dimension brand SVGs from the central
  // registry — no optimization pipeline needed, and the assets stay
  // replaceable in place (no next/image loader coupling).
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      style={{ height }}
      draggable={false}
      className={href ? undefined : className}
    />
  );

  if (href) {
    return (
      <a
        href={href}
        aria-label={decorative ? undefined : (ariaLabel ?? (variant === "mark" ? "BEYU home" : "BEYU OS home"))}
        className={`inline-flex items-center ${className ?? ""}`.trim()}
      >
        {img}
      </a>
    );
  }
  return img;
}
