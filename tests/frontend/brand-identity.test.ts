/**
 * BEYU OS — unified brand identity & Noelia personalization certification.
 *
 * WHAT THIS SUITE PINS
 *   1. ONE BEYU logo system: every surface renders the official mark from the
 *      central registry (/public/brand/*) via <BeyuLogo /> — no component may
 *      inline or re-draw the mark's geometry (single source of truth).
 *   2. ONE Noelia identity: <NoeliaAvatar /> presents the same canonical face
 *      at every size and state; only the status indicator changes. Small
 *      sizes use the identity mark, never a distorted portrait.
 *   3. Noelia is presented as BEYU's GOVERNED assistant (<NoeliaPanel />):
 *      BEYU anchors the hierarchy, the governed-assistant indicator is always
 *      visible, and the CTA is a link whose authority is decided by the
 *      existing ai:noelia.query guard — never by the UI.
 *   4. Accessibility: alt text / aria-labels, reduced-motion guards, state
 *      announcement via live regions, no hard-coded theme breaks (CSS vars).
 *   5. No broken asset paths: every registered brand/Noelia asset (and the
 *      PWA manifest's icons) must exist on disk.
 *   6. Governance boundary intact: the Noelia HTTP route and page guard still
 *      bind to the shared authorization boundary (identity work must not have
 *      touched it).
 *   7. AUTHORITATIVE institutional assets byte-intact: the supplied Family
 *      Trust and BEYU OS PNGs keep their pinned SHA-256, intrinsic
 *      dimensions and aspect ratio, and the two identities stay distinct on
 *      every surface (Family Trust ≠ BEYU OS ≠ sector OSs).
 *
 * Pure node suite — no database, no running server required.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BEYU_BRAND_ASSETS,
  BEYU_FAMILY_TRUST_ASSETS,
  BEYU_FAMILY_TRUST_ASSET_DIMENSIONS,
  BEYU_OS_ASSETS,
  BEYU_OS_ASSET_DIMENSIONS,
  NOELIA_ASSETS,
} from "@/components/brand-assets";
import { BeyuLogo, type BeyuLogoVariant } from "@/components/beyu-logo";
import { BeyuOsLogo } from "@/components/beyu-os-logo";
import { FamilyTrustLogo } from "@/components/family-trust-logo";
import {
  NOELIA_SIZE_PX,
  NOELIA_STATE_META,
  NoeliaAvatar,
  NoeliaStatus,
  type NoeliaAvatarSize,
  type NoeliaAvatarState,
} from "@/components/noelia-avatar";
import { NoeliaPanel } from "@/components/noelia-panel";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function abs(assetPath: string) {
  return path.join(ROOT, "public", assetPath.replace(/^\//, ""));
}

/** Recursively list files under a directory (skipping heavy/ignored dirs). */
function listFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if ([".git", "node_modules", ".next", "tmp", "coverage", "pgdata"].includes(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) listFiles(full, out);
    else out.push(full);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 1. Asset registry integrity — no broken image paths                 */
/* ------------------------------------------------------------------ */

describe("brand asset registry", () => {
  it("every registered BEYU brand asset exists on disk", () => {
    for (const [name, assetPath] of Object.entries(BEYU_BRAND_ASSETS)) {
      expect(existsSync(abs(assetPath)), `${name} -> ${assetPath} must exist`).toBe(true);
    }
  });

  it("every registered Noelia asset exists on disk", () => {
    for (const [name, assetPath] of Object.entries(NOELIA_ASSETS)) {
      expect(existsSync(abs(assetPath)), `${name} -> ${assetPath} must exist`).toBe(true);
    }
  });

  it("every registered authoritative institutional asset exists on disk", () => {
    for (const [name, assetPath] of Object.entries(BEYU_FAMILY_TRUST_ASSETS)) {
      expect(existsSync(abs(assetPath)), `${name} -> ${assetPath} must exist`).toBe(true);
    }
    for (const [name, assetPath] of Object.entries(BEYU_OS_ASSETS)) {
      expect(existsSync(abs(assetPath)), `${name} -> ${assetPath} must exist`).toBe(true);
    }
  });

  it("the PWA manifest is valid JSON and all of its icons exist", () => {
    const manifestPath = path.join(ROOT, "public", "manifest.webmanifest");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.name).toContain("BEYU OS");
    expect(manifest.start_url).toBe("/os");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    for (const icon of manifest.icons) {
      expect(existsSync(abs(icon.src)), `manifest icon ${icon.src} must exist`).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 1b. AUTHORITATIVE institutional assets — byte integrity & identity  */
/* ------------------------------------------------------------------ */

/** The supplied authoritative artwork, pinned byte-for-byte. */
const AUTHORITATIVE_ASSET_SHA256: Record<string, string> = {
  [BEYU_FAMILY_TRUST_ASSETS.official]: "b599e2e079e9def8c3161fd6b734d7268f19c480ed85cf16123c4a76125287e8",
  [BEYU_OS_ASSETS.official]: "9fb216119cc6a80557aa75d73b9704a44f550626cd25a30e2acc2b95c4ba1e1d",
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Parse a PNG's IHDR and assert a valid signature. */
function pngDimensions(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  expect(buf.subarray(0, 8).equals(PNG_SIGNATURE), `${file} must be a valid PNG`).toBe(true);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("authoritative institutional assets (Family Trust · BEYU OS)", () => {
  it("remain byte-for-byte identical to the supplied artwork (SHA-256 pinned)", () => {
    for (const [assetPath, sha] of Object.entries(AUTHORITATIVE_ASSET_SHA256)) {
      const file = abs(assetPath);
      expect(existsSync(file), `${assetPath} must exist`).toBe(true);
      const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
      expect(digest, `${assetPath} must remain the authoritative artwork unmodified`).toBe(sha);
    }
  });

  it("keep their intrinsic dimensions and aspect ratio (no crop, no re-cut)", () => {
    const family = pngDimensions(abs(BEYU_FAMILY_TRUST_ASSETS.official));
    expect(family.width).toBe(BEYU_FAMILY_TRUST_ASSET_DIMENSIONS.width);
    expect(family.height).toBe(BEYU_FAMILY_TRUST_ASSET_DIMENSIONS.height);

    const os = pngDimensions(abs(BEYU_OS_ASSETS.official));
    expect(os.width).toBe(BEYU_OS_ASSET_DIMENSIONS.width);
    expect(os.height).toBe(BEYU_OS_ASSET_DIMENSIONS.height);
  });

  it("are two distinct identities — never the same file, never swapped", () => {
    expect(BEYU_FAMILY_TRUST_ASSETS.official).not.toBe(BEYU_OS_ASSETS.official);
    expect(AUTHORITATIVE_ASSET_SHA256[BEYU_FAMILY_TRUST_ASSETS.official]).not.toBe(
      AUTHORITATIVE_ASSET_SHA256[BEYU_OS_ASSETS.official],
    );
  });
});

/* ------------------------------------------------------------------ */
/* 1c. <BeyuOsLogo /> and <FamilyTrustLogo /> — authoritative identity  */
/* ------------------------------------------------------------------ */

describe("<BeyuOsLogo />", () => {
  it("renders the authoritative BEYU OS asset from the central registry", () => {
    const html = renderToString(React.createElement(BeyuOsLogo, { size: 40 }));
    expect(html).toContain(`<img`);
    expect(html).toContain(`src="${BEYU_OS_ASSETS.official}"`);
  });

  it("sizes by height with the source aspect ratio (1:1)", () => {
    const html = renderToString(React.createElement(BeyuOsLogo, { size: 40 }));
    expect(html).toMatch(/height="40"/);
    expect(html).toMatch(/width="40"/);
  });

  it("is accessible by default and can be decorative", () => {
    expect(renderToString(React.createElement(BeyuOsLogo))).toContain('alt="BEYU OS"');
    expect(renderToString(React.createElement(BeyuOsLogo, { ariaLabel: "BEYU OS home" }))).toContain(
      'alt="BEYU OS home"',
    );
    expect(renderToString(React.createElement(BeyuOsLogo, { decorative: true }))).toContain('alt=""');
  });

  it("wraps in a link when href is provided", () => {
    const html = renderToString(React.createElement(BeyuOsLogo, { size: 36, href: "/os" }));
    expect(html).toContain('<a href="/os"');
    expect(html).toContain("BEYU OS home");
    expect(html).toContain(BEYU_OS_ASSETS.official);
  });
});

describe("<FamilyTrustLogo />", () => {
  it("renders the authoritative Family Trust asset from the central registry", () => {
    const html = renderToString(React.createElement(FamilyTrustLogo, { size: 64 }));
    expect(html).toContain(`<img`);
    expect(html).toContain(`src="${BEYU_FAMILY_TRUST_ASSETS.official}"`);
  });

  it("sizes by height with the source aspect ratio (1239:1254)", () => {
    const html = renderToString(React.createElement(FamilyTrustLogo, { size: 100 }));
    expect(html).toMatch(/height="100"/);
    expect(html).toMatch(/width="99"/); // round(100 × 1239 / 1254)
  });

  it("is accessible by default and can be decorative", () => {
    expect(renderToString(React.createElement(FamilyTrustLogo))).toContain('alt="BEYU Family Trust"');
    expect(renderToString(React.createElement(FamilyTrustLogo, { ariaLabel: "Family Trust" }))).toContain(
      'alt="Family Trust"',
    );
    expect(renderToString(React.createElement(FamilyTrustLogo, { decorative: true }))).toContain('alt=""');
  });

  it("wraps in a link when href is provided", () => {
    const html = renderToString(React.createElement(FamilyTrustLogo, { size: 64, href: "/os/family" }));
    expect(html).toContain('<a href="/os/family"');
    expect(html).toContain("BEYU Family Trust");
    expect(html).toContain(BEYU_FAMILY_TRUST_ASSETS.official);
  });
});

describe("institutional identity separation across surfaces", () => {
  it("the sign-in surface presents the authoritative BEYU OS identity", () => {
    const signIn = readFileSync(path.join(ROOT, "src", "app", "page.tsx"), "utf8");
    expect(signIn).toContain("BeyuOsLogo");
    // The Family Trust institutional asset never appears on the OS sign-in.
    expect(signIn).not.toContain("family-trust-logo");
    expect(signIn).not.toContain("BEYU_FAMILY_TRUST_ASSETS");
  });

  it("the OS shell chrome never renders the Family Trust institutional asset", () => {
    const shell = readFileSync(path.join(ROOT, "src", "app", "os", "layout.tsx"), "utf8");
    expect(shell).not.toContain("family-trust-logo");
    expect(shell).not.toContain("BEYU_FAMILY_TRUST_ASSETS");
  });

  it("the Family Office carries the Family Trust institutional identity, not the OS mark", () => {
    const family = readFileSync(path.join(ROOT, "src", "app", "os", "family", "page.tsx"), "utf8");
    expect(family).toContain("FamilyTrustLogo");
    expect(family).not.toContain("BeyuOsLogo");
    expect(family).not.toContain("beyu-os-logo");
  });
});

/* ------------------------------------------------------------------ */
/* 2. <BeyuLogo /> — one component, official assets, a11y             */
/* ------------------------------------------------------------------ */

describe("<BeyuLogo />", () => {
  const VARIANTS: { variant: BeyuLogoVariant; src: string }[] = [
    { variant: "full", src: BEYU_BRAND_ASSETS.full },
    { variant: "mark", src: BEYU_BRAND_ASSETS.mark },
    { variant: "light", src: BEYU_BRAND_ASSETS.light },
    { variant: "dark", src: BEYU_BRAND_ASSETS.dark },
  ];

  it.each(VARIANTS)("$variant renders the official asset from the central registry", ({ variant, src }) => {
    const html = renderToString(React.createElement(BeyuLogo, { variant, size: 40 }));
    expect(html).toContain(`<img`);
    expect(html).toContain(`src="${src}"`);
  });

  it("sizes by height with the correct aspect per variant", () => {
    const mark = renderToString(React.createElement(BeyuLogo, { variant: "mark", size: 32 }));
    expect(mark).toMatch(/height="32"/);
    expect(mark).toMatch(/width="32"/);

    const full = renderToString(React.createElement(BeyuLogo, { variant: "full", size: 40 }));
    expect(full).toMatch(/height="40"/);
    expect(full).toMatch(/width="152"/); // 40 × 3.8
  });

  it("is accessible by default (alt text per variant)", () => {
    expect(renderToString(React.createElement(BeyuLogo, { variant: "full" }))).toContain('alt="BEYU OS"');
    expect(renderToString(React.createElement(BeyuLogo, { variant: "mark" }))).toContain('alt="BEYU"');
    expect(renderToString(React.createElement(BeyuLogo, { variant: "full", ariaLabel: "BEYU OS home" }))).toContain(
      'alt="BEYU OS home"',
    );
  });

  it("decorative renders alt=\"\" (no accessible name)", () => {
    const html = renderToString(React.createElement(BeyuLogo, { variant: "mark", decorative: true }));
    expect(html).toContain('alt=""');
  });

  it("wraps in a link when href is provided", () => {
    const html = renderToString(React.createElement(BeyuLogo, { variant: "light", size: 36, href: "/os" }));
    expect(html).toContain('<a href="/os"');
    expect(html).toContain("BEYU OS home");
    expect(html).toContain(BEYU_BRAND_ASSETS.light);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Single source of truth — the mark is never re-drawn in code     */
/* ------------------------------------------------------------------ */

describe("single source of truth for brand assets", () => {
  const MARK_GEOMETRY = "M38 22h20c9.4 0 15.5 5.2"; // canonical "B" path
  const NOELIA_GEOMETRY = "M256 98c64 0 90 48"; // canonical portrait face path

  it("the BEYU mark geometry exists ONLY in the central brand asset files", () => {
    const hits: string[] = [];
    for (const file of listFiles(ROOT)) {
      if (!file.endsWith(".svg")) continue;
      const content = readFileSync(file, "utf8");
      if (content.includes(MARK_GEOMETRY)) hits.push(path.relative(ROOT, file));
    }
    expect(hits.length).toBeGreaterThan(0);
    // Only /public/brand/* may carry the mark — no inline copies in src/.
    for (const hit of hits) {
      expect(hit, `mark geometry duplicated outside the asset registry: ${hit}`).toMatch(/^public\/brand\//);
    }
  });

  it("no component embeds the Noelia portrait geometry inline", () => {
    for (const file of listFiles(path.join(ROOT, "src"))) {
      const content = readFileSync(file, "utf8");
      expect(content, `Noelia portrait geometry must not be inlined in ${file}`).not.toContain(NOELIA_GEOMETRY);
    }
  });

  it("the root layout wires the favicon and PWA manifest through the registry", () => {
    const layout = readFileSync(path.join(ROOT, "src", "app", "layout.tsx"), "utf8");
    expect(layout).toContain("BEYU_BRAND_ASSETS");
    expect(layout).toContain('manifest: "/manifest.webmanifest"');
  });
});

/* ------------------------------------------------------------------ */
/* 4. <NoeliaAvatar /> — one face, all sizes, all states              */
/* ------------------------------------------------------------------ */

const SIZES: NoeliaAvatarSize[] = ["xs", "sm", "md", "lg", "xl", "hero"];
const STATES: NoeliaAvatarState[] = [
  "idle",
  "thinking",
  "processing",
  "speaking",
  "success",
  "warning",
  "error",
  "offline",
];

describe("<NoeliaAvatar />", () => {
  it.each(SIZES)("$size renders at the registered pixel size", (size) => {
    const html = renderToString(React.createElement(NoeliaAvatar, { size }));
    const px = NOELIA_SIZE_PX[size];
    expect(html).toMatch(new RegExp(`width:"?${px}`));
  });

  it("uses the identity mark (never a distorted portrait) at xs/sm", () => {
    expect(renderToString(React.createElement(NoeliaAvatar, { size: "xs" }))).toContain(NOELIA_ASSETS.icon);
    expect(renderToString(React.createElement(NoeliaAvatar, { size: "sm" }))).toContain(NOELIA_ASSETS.icon);
    for (const size of ["md", "lg", "xl", "hero"] as NoeliaAvatarSize[]) {
      const html = renderToString(React.createElement(NoeliaAvatar, { size }));
      expect(html, `${size} must show the canonical portrait`).toContain(NOELIA_ASSETS.avatar);
      expect(html).not.toContain(NOELIA_ASSETS.icon);
    }
  });

  it.each(STATES)("$state keeps the same face and only changes the indicator", (state) => {
    const html = renderToString(React.createElement(NoeliaAvatar, { size: "md", state }));
    // The face asset is identical across states.
    expect(html).toContain(NOELIA_ASSETS.avatar);
    // The state indicator carries the canonical state color.
    expect(html).toContain(NOELIA_STATE_META[state].dotClass);
    // Screen readers receive the state description via a live region.
    expect(html).toContain('role="status"');
    expect(html).toContain(NOELIA_STATE_META[state].description);
  });

  it("animated states are reduced-motion safe (motion-safe guard)", () => {
    for (const state of ["thinking", "processing", "speaking"] as NoeliaAvatarState[]) {
      const html = renderToString(React.createElement(NoeliaAvatar, { size: "md", state }));
      expect(html, `${state} animation must be motion-safe guarded`).toContain("motion-safe:");
    }
  });

  it("offline desaturates the face without re-drawing it", () => {
    const html = renderToString(React.createElement(NoeliaAvatar, { size: "md", state: "offline" }));
    expect(html).toContain(NOELIA_ASSETS.avatar);
    expect(html).toMatch(/saturate/);
  });

  it("is accessible by default and can be decorative", () => {
    expect(renderToString(React.createElement(NoeliaAvatar, { size: "md" }))).toContain('alt="Noelia AI"');
    expect(renderToString(React.createElement(NoeliaAvatar, { size: "md", decorative: true }))).toContain('alt=""');
    expect(renderToString(React.createElement(NoeliaAvatar, { size: "md", ariaLabel: "Noelia" }))).toContain(
      'alt="Noelia"',
    );
  });

  it("renders a static dot when showIndicator is false", () => {
    const html = renderToString(React.createElement(NoeliaAvatar, { size: "md", showIndicator: false }));
    expect(html).not.toContain('role="status"');
  });
});

describe("<NoeliaStatus />", () => {
  it.each(STATES)("$state renders a labelled indicator", (state) => {
    const html = renderToString(React.createElement(NoeliaStatus, { state }));
    expect(html).toContain(NOELIA_STATE_META[state].label);
    expect(html).toContain(NOELIA_STATE_META[state].dotClass);
  });
});

/* ------------------------------------------------------------------ */
/* 5. <NoeliaPanel /> — governed hierarchy, never authority           */
/* ------------------------------------------------------------------ */

describe("<NoeliaPanel />", () => {
  const html = () => renderToString(React.createElement(NoeliaPanel));

  it("anchors the identity with the BEYU mark (BEYU > OS > HIVE > Noelia)", () => {
    const out = html();
    expect(out).toContain(BEYU_BRAND_ASSETS.mark);
    expect(out).toContain("BEYU OS");
    expect(out).toContain("HIVE");
  });

  it("labels Noelia as the governed assistant, not an authority", () => {
    const out = html();
    expect(out).toContain("Noelia AI");
    expect(out).toContain("Governed assistant");
    expect(out).toContain("material decisions require human accountability");
  });

  it("presents the canonical Noelia face and the governed CTA as a link", () => {
    const out = html();
    expect(out).toContain(NOELIA_ASSETS.avatar);
    expect(out).toContain("How can I assist you?");
    // React 19 emits attributes in its own order — match href order-agnostically.
    expect(out).toMatch(/<a [^>]*href="\/os\/noelia"[^>]*>Ask Noelia</);
  });

  it("honours a custom CTA target", () => {
    const out = renderToString(React.createElement(NoeliaPanel, { href: "#noelia-console" }));
    expect(out).toContain('href="#noelia-console"');
  });
});

/* ------------------------------------------------------------------ */
/* 6. Governance boundary regression pin                               */
/* ------------------------------------------------------------------ */

describe("governance boundary is untouched by the identity work", () => {
  it("the Noelia HTTP route still binds to the shared guarded authorization boundary", () => {
    const route = readFileSync(
      path.join(ROOT, "src", "app", "api", "v1", "ai", "noelia", "route.ts"),
      "utf8",
    );
    expect(route).toContain("guarded(");
    expect(route).toContain('permission: "ai:noelia.query"');
  });

  it("the Noelia page still enforces ai:noelia.query before rendering", () => {
    const page = readFileSync(path.join(ROOT, "src", "app", "os", "noelia", "page.tsx"), "utf8");
    expect(page).toContain('requireAccess("ai:noelia.query")');
  });
});
