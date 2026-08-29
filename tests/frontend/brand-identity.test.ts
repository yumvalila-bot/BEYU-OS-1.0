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
 *
 * Pure node suite — no database, no running server required.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BEYU_BRAND_ASSETS, NOELIA_ASSETS } from "@/components/brand-assets";
import { BeyuLogo, type BeyuLogoVariant } from "@/components/beyu-logo";
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
