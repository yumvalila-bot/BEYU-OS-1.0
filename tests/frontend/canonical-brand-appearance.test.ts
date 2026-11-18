/**
 * CANONICAL BRAND APPEARANCE — the logo and Noelia are rendered from ONE
 * registry, byte-exact, on every surface.
 *
 * WHY THIS SUITE EXISTS
 *   `src/components/brand-assets.ts` is the single source of truth for the
 *   institutional artwork. It states two contracts in the strongest terms:
 *
 *     • the BEYU OS mark is the authoritative PNG, "never re-drawn, recoloured,
 *       cropped or recompressed";
 *     • `/NOELIA.png` is the SINGLE canonical Noelia appearance, and "neither
 *       file may be modified, recompressed, recolored, cropped or regenerated".
 *
 *   Both assets are pinned by SHA-256 in `brand-identity.test.ts`. That pins the
 *   FILE ON DISK — it cannot see what the application does to the bytes on the
 *   way to the browser. This suite covers that gap: it asserts that every
 *   surface resolves the canonical registry entry and hands the untransformed
 *   path to the browser, with no optimizer, filter, or per-surface variant in
 *   between.
 *
 *   It exists because the public homepage regressed exactly there: it rendered
 *   Noelia through `next/image`, and the optimizer served 28,897 B of
 *   re-encoded `image/png` at q=75 instead of the canonical 1,966,448 B. No
 *   hash test could catch that — the file on disk was perfect.
 *
 * WHAT IS ASSERTED
 *   A. the registry is the only source of asset URLs;
 *   B. the logo is the same mark on every surface (no sector variant exists);
 *   C. Noelia is the same appearance on every surface, including Health OS;
 *   D. nothing re-encodes either asset (no `next/image` on a canonical asset).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BEYU_OS_ASSETS,
  NOELIA_ASSETS,
  NOELIA_CANONICAL_APPEARANCE,
} from "@/components/brand-assets";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), "utf8");
/** Source with comments stripped — these assertions are about code, not prose. */
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/**
 * Every surface that resolves Noelia's ASSET directly.
 *
 * `noelia-panel.tsx` is deliberately absent: it is a composition shell that
 * renders `<NoeliaAvatar>`, so it must not touch an asset path at all — which is
 * asserted separately below.
 */
const NOELIA_SURFACES = [
  ["src", "app", "page.tsx"],
  ["src", "components", "noelia-shell.tsx"],
  ["src", "components", "noelia-avatar.tsx"],
  ["src", "components", "noelia-cross-os-visual.tsx"],
] as const;

/* ================================================================== */
/* A. ONE REGISTRY                                                    */
/* ================================================================== */

describe("A. one asset registry — no surface invents its own path", () => {
  it("exposes exactly one BEYU OS mark and one canonical Noelia appearance", () => {
    expect(BEYU_OS_ASSETS.official).toBe("/brand/beyu-os-logo.png");
    expect(NOELIA_ASSETS.avatar).toBe(NOELIA_CANONICAL_APPEARANCE.path);
    expect(NOELIA_CANONICAL_APPEARANCE.path).toBe("/NOELIA.png");
    // The served asset and the tracked source are the same file.
    expect(NOELIA_CANONICAL_APPEARANCE.repositoryPath).toBe("/NOELIA.png");
    // It is a portrait, and the ratio is contractual.
    expect(NOELIA_CANONICAL_APPEARANCE.dimensions.width).toBeLessThan(
      NOELIA_CANONICAL_APPEARANCE.dimensions.height,
    );
  });

  it("every Noelia surface imports a canonical registry rather than typing a path", () => {
    // There are TWO canonical read paths, and both resolve to the same asset:
    //   • NOELIA_ASSETS / NOELIA_CANONICAL_APPEARANCE (components/brand-assets)
    //   • NOELIA_ASSET_MAPPING (lib/noelia/context-resolver) — the contextual
    //     appearance contract, which maps every OS context to `/NOELIA.png`.
    for (const file of NOELIA_SURFACES) {
      const text = code(source(...file));
      const usesRegistry =
        text.includes("NOELIA_ASSETS") ||
        text.includes("NOELIA_CANONICAL_APPEARANCE") ||
        text.includes("NOELIA_ASSET_MAPPING");
      expect(usesRegistry, `${file.join("/")} must read a canonical registry`).toBe(true);
      // A bare literal is the regression: it can drift from the registry and it
      // bypasses the hash pin.
      expect(text, `${file.join("/")} must not hard-code the asset path`).not.toMatch(
        /["'`]\/NOELIA\.png["'`]/,
      );
    }
  });

  it("keeps composition shells delegating — they never resolve an asset", () => {
    // A panel that reached for the portrait itself would be a second place the
    // appearance could change. It composes the canonical avatar instead.
    const panel = code(source("src", "components", "noelia-panel.tsx"));
    expect(panel).toContain("NoeliaAvatar");
    expect(panel).not.toContain("NOELIA_ASSETS");
    expect(panel).not.toContain("NOELIA_CANONICAL_APPEARANCE");
    expect(panel).not.toMatch(/<img|next\/image/);
  });

  it("keeps the historical PNG register as provenance only — no runtime variant", () => {
    const registry = source("src", "components", "brand-assets.ts");
    expect(registry).toContain("NOELIA_HISTORICAL_PNG_ASSETS");
    expect(registry).toContain("HISTORICAL_PRESERVED");
    // The historical files must never be reachable as a served appearance, so
    // no application module may reference them by filename.
    for (const historical of [
      "Noelia AI .png",
      "Noelia BEYU OS.png",
      "Noelia Finance os.png",
      "Noelia Health os.png",
      "Noeloa Agriculture OS.png",
    ]) {
      for (const file of NOELIA_SURFACES) {
        expect(source(...file), `${file.join("/")} → ${historical}`).not.toContain(historical);
      }
    }
  });
});

/* ================================================================== */
/* B. THE LOGO IS THE SAME MARK EVERYWHERE                            */
/* ================================================================== */

describe("B. one logo — the same BEYU mark on every surface, Health OS included", () => {
  it("renders the authoritative PNG through the one component", () => {
    const logo = source("src", "components", "beyu-os-logo.tsx");
    expect(logo).toContain("BEYU_OS_ASSETS.official");
    // A plain <img>: an optimization pipeline would re-encode the mark.
    expect(logo).toContain("<img");
    expect(code(logo)).not.toContain("next/image");
    // The source ratio is derived, never hard-coded.
    expect(logo).toContain("BEYU_OS_ASSET_DIMENSIONS");
  });

  it("is consumed as a component everywhere — no surface draws its own logo", () => {
    for (const file of [
      ["src", "app", "page.tsx"],
      ["src", "app", "governed-sign-in.tsx"],
      ["src", "app", "login-surface.tsx"],
      ["src", "app", "launcher", "page.tsx"],
      ["src", "app", "enroll", "page.tsx"],
      ["src", "app", "os", "layout.tsx"],
      ["src", "app", "os", "os-brand.tsx"],
      ["src", "components", "noelia-panel.tsx"],
    ] as const) {
      const text = code(source(...file));
      expect(text, file.join("/")).toContain("BeyuOsLogo");
      // No surface may re-declare the asset path itself.
      expect(text, file.join("/")).not.toContain("/brand/beyu-os-logo.png");
    }
  });

  it("never substitutes the Family Trust institutional identity for the OS mark", () => {
    // Two distinct identities (docs/branding/README.md). Application surfaces
    // use BeyuOsLogo; FamilyTrustLogo is only for genuine fiduciary surfaces.
    const allowed = [
      ["src", "app", "os", "family", "page.tsx"],
      ["src", "app", "os", "family", "trustee-command", "page.tsx"],
      ["src", "components", "family-trust-logo.tsx"],
    ] as const;
    for (const file of [
      ["src", "app", "page.tsx"],
      ["src", "app", "governed-sign-in.tsx"],
      ["src", "app", "login-surface.tsx"],
      ["src", "app", "launcher", "page.tsx"],
      ["src", "components", "noelia-panel.tsx"],
      ["src", "components", "noelia-shell.tsx"],
      ["src", "app", "os", "layout.tsx"],
    ] as const) {
      const text = code(source(...file));
      expect(text, `${file.join("/")} must not use the Family Trust logo`).not.toContain(
        "FamilyTrustLogo",
      );
    }
    // …and the surfaces that legitimately do use it are the governed few.
    for (const file of allowed) {
      expect(source(...file), file.join("/")).toContain("FamilyTrustLogo");
    }
  });

  it("gives Health OS the SAME mark, from the shared component", () => {
    // The sector SPA is a separate Vite bundle, so it is the one place a
    // divergent logo could hide. It imports the BEYU component directly.
    const sectorLogo = source("sectors", "health", "src", "components", "Logo.tsx");
    expect(sectorLogo).toContain('from "../../../../src/components/beyu-os-logo"');
    expect(sectorLogo).toContain("<BeyuOsLogo");
    // It adds the sector's own WORDING beside the shared mark, never new artwork.
    expect(sectorLogo).toContain("Health OS");
    expect(code(sectorLogo)).not.toMatch(/<svg|\.svg["'`]/);
    // The compiled document must reference the canonical asset.
    const built = source("sectors", "health", "dist", "index.html");
    expect(built).toContain("/brand/beyu-os-logo.png");
  });
});

/* ================================================================== */
/* C. NOELIA IS THE SAME APPEARANCE EVERYWHERE                        */
/* ================================================================== */

describe("C. one Noelia — the same canonical appearance on every surface", () => {
  it("renders the portrait unmodified, with the canonical dimensions", () => {
    const page = code(source("src", "app", "page.tsx"));
    // The registry record, not a literal.
    expect(page).toContain("NOELIA_CANONICAL_APPEARANCE.path");
    expect(page).toContain("NOELIA_CANONICAL_APPEARANCE.altText");
    expect(page).toContain("NOELIA_CANONICAL_APPEARANCE.dimensions.width");
    // Intrinsic dimensions are given so the box cannot distort the portrait.
    expect(page).toContain("width={NOELIA_CANONICAL_APPEARANCE.dimensions.width}");
    expect(page).toContain("height={NOELIA_CANONICAL_APPEARANCE.dimensions.height}");
  });

  it("gives Health OS the SAME Noelia — a sector context never renames the face", () => {
    // Contextual appearance changes wording, tools and permissions. The ASSET
    // is invariant, which is asserted directly in the Noelia contract suite.
    const contextual = source("src", "lib", "noelia", "appearance.ts");
    expect(contextual).not.toMatch(/NOELIA\.png/);
    // The health-specific historical PNG is preserved for provenance and must
    // never be wired up as a Health variant.
    const sector = source("sectors", "health", "src", "components", "Logo.tsx");
    expect(sector).not.toContain("Noelia Health os.png");
  });

  it("keeps the small-size identity MARK distinct from the portrait", () => {
    // A portrait squeezed to 20px is not "the same appearance" — the registry
    // defines a mark for that, and the avatar picks it by size.
    const avatar = code(source("src", "components", "noelia-avatar.tsx"));
    expect(avatar).toContain("NOELIA_ASSETS.icon");
    expect(avatar).toContain("NOELIA_ASSETS.avatar");
    expect(avatar).toContain("MARK_SIZES");
    expect(source("src", "components", "brand-assets.ts")).toContain("/noelia/noelia-icon.svg");
  });

  it("styles the portrait with CSS only — cropping is layout, not a re-encode", () => {
    const css = source("src", "app", "globals.css");
    expect(css).toContain(".beyu-noelia-image");
    expect(css).toMatch(/\.beyu-noelia-image\s*\{[^}]*object-fit:\s*cover/);
    expect(css).toMatch(/\.beyu-noelia-image\s*\{[^}]*object-position:\s*center 25%/);
  });
});

/* ================================================================== */
/* D. NOTHING RE-ENCODES A CANONICAL ASSET                            */
/* ================================================================== */

describe("D. no optimizer re-encodes the canonical assets", () => {
  it("never routes the canonical Noelia portrait through next/image", () => {
    // The regression this pins: `next/image` fetched the canonical 1,966,448 B
    // PNG and served 28,897 B of q=75 re-encoded `image/png`, silently
    // violating the "never recompressed" contract that the SHA-256 pin cannot
    // see. Every Noelia surface renders a plain <img> from the registry.
    for (const file of NOELIA_SURFACES) {
      const text = code(source(...file));
      expect(text, `${file.join("/")} must not import next/image`).not.toContain("next/image");
      expect(text, `${file.join("/")} must not render <Image`).not.toMatch(/<Image[\s>]/);
    }
  });

  it("never routes the BEYU mark through next/image either", () => {
    for (const file of [
      ["src", "components", "beyu-os-logo.tsx"],
      ["src", "components", "beyu-logo.tsx"],
      ["src", "components", "brand.tsx"],
      ["src", "components", "family-trust-logo.tsx"],
    ] as const) {
      const text = code(source(...file));
      expect(text, `${file.join("/")} must not import next/image`).not.toContain("next/image");
    }
  });

  it("applies no filter, blend or replacement colour to either canonical asset", () => {
    const logo = code(source("src", "components", "beyu-os-logo.tsx"));
    // A CSS filter would recolour the authoritative artwork.
    expect(logo).not.toMatch(/\bfilter:|\bgrayscale|invert\(|sepia\(/);
    // The component documents that it never recolours; the code must agree.
    expect(logo).not.toMatch(/hue-rotate|saturate\(/);
  });

  it("serves the asset from a stable public path, not a build-hashed one", () => {
    // `/brand/...` and `/NOELIA.png` are copied verbatim into `public/`. A
    // hashed import would break the byte-identity and the PWA manifest icons.
    const manifest = JSON.parse(source("public", "manifest.webmanifest")) as {
      icons: { src: string }[];
    };
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith("/brand/")).toBe(true);
    }
    expect(manifest.icons.map((icon) => icon.src)).toContain("/brand/beyu-app-icon-192.png");
    expect(manifest.icons.map((icon) => icon.src)).toContain("/brand/beyu-app-icon-512.png");
  });
});
