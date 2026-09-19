import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BEYU_OS_ASSETS, BEYU_BRAND_ASSETS } from "@/components/brand-assets";

const read = (path: string) => readFileSync(path, "utf8");
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).trim().split("\n");
const active = files.filter(p => /\.(tsx?|dart|html)$/.test(p) && /^(src|sectors\/health\/src|mobile)\//.test(p) && !p.endsWith("spa-content.ts"));

describe("canonical institutional references", () => {
  it("has no active legacy SVG URLs or sector-specific institutional presenters", () => {
    for (const path of active) {
      const source = read(path);
      expect(source, path).not.toMatch(/\/brand\/(?:beyu-logo[^"'\s]*\.svg|favicon\.svg|beyu-app-icon\.svg)/);
      expect(source, path).not.toMatch(/(?:function|class) (?:FinanceLogo|HealthLogo|AgricultureLogo|UjenziLogo|FoundationLogo|FamilyOfficeLogo)\b/);
    }
  });

  it("permits only inventoried BEYU assets, not arbitrary additional institutional logos", () => {
    // Scoped by institutional filenames, NOT every file named logo: partner,
    // regulatory, certification, customer/tenant and Noelia assets are distinct.
    const allowed = new Set([
      "beyu-family-trust-logo.png", "beyu-os-logo.png", "favicon.png",
      "beyu-app-icon-192.png", "beyu-app-icon-512.png",
      // Historical SVGs retained, never referenced by active presenters.
      "beyu-logo.svg", "beyu-logo-dark.svg", "beyu-logo-light.svg",
      "beyu-logo-mark.svg", "beyu-app-icon.svg", "favicon.svg",
    ].map(name => `public/brand/${name}`));
    for (const path of files.filter(p => /(?:beyu.*(?:logo|icon)|(?:finance|health|agriculture|ujenzi|foundation|family-office)-logo)\.(?:png|svg|webp|jpe?g|ico)$/i.test(p))) {
      expect(allowed.has(path), `Unclassified institutional asset: ${path}`).toBe(true);
    }
  });

  it("Health delegates to the same React presenter and canonical favicon", () => {
    const health = read("sectors/health/src/components/Logo.tsx");
    expect(health).toContain('import { BeyuOsLogo } from "../../../../src/components/beyu-os-logo"');
    expect(health).toContain("Health OS");
    expect(health).not.toMatch(/<svg|<ellipse|FAMILY.*TRUST/);
    expect(read("sectors/health/index.html")).toContain(BEYU_BRAND_ASSETS.favicon);
  });

  it("Family Office operations do not substitute the Trust seal", () => {
    for (const path of ["capital", "protection"]) {
      const source = read(`src/app/os/family/${path}/page.tsx`);
      expect(source).toContain("BeyuOsLogo");
      expect(source).not.toContain("FamilyTrustLogo");
    }
    expect(read("src/app/os/family/page.tsx")).toContain("BEYU FAMILY TRUST");
  });

  it("web metadata references resolvable canonical artwork", () => {
    const root = read("src/app/layout.tsx");
    expect(root).toContain("openGraph:");
    expect(root).toContain("BEYU_OS_ASSETS.official");
    expect(root).toContain('applicationName: "BEYU OS"');
    expect(existsSync(`public${BEYU_OS_ASSETS.official}`)).toBe(true);
    expect(existsSync(`public${BEYU_BRAND_ASSETS.favicon}`)).toBe(true);
  });

  it("Flutter uses one asset widget and the sync source is byte-exact, not redrawn", () => {
    for (const screen of ["login", "splash", "os_shell", "launcher"]) {
      expect(read(`mobile/flutter/lib/screens/${screen}_screen.dart`)).toContain("BeyuOsLogo");
    }
    const generator = read("scripts/sync-brand-assets.mjs");
    expect(generator).toContain('writeFileSync(resolve(mobile, "beyu-os-logo.png"), source)');
    const copy = "mobile/flutter/assets/images/beyu-os-logo.png";
    if (existsSync(copy)) {
      const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
      expect(sha(copy)).toBe(sha(`public${BEYU_OS_ASSETS.official}`));
    }
  });
});

describe("document presentation preserves governed content", () => {
  it("brands the Health viewer without rewriting document authority or evidence", () => {
    const viewer = read("sectors/health/src/components/DocumentViewer.tsx");
    expect(viewer).toContain("Health OS · Document viewer");
    for (const field of ["doc.id", "doc.status", "doc.version", "doc.effective", "doc.parties", "doc.hash", "doc.smartContract"]) {
      expect(viewer).toContain(field);
    }
    expect(viewer).toContain("BEYU HOLDING COMPANY LTD");
    expect(read("sectors/health/src/views/Governance.tsx")).toContain("<FamilyTrustLogo");
  });
});
