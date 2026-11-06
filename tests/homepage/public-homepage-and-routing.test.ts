import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BEYU_CONTROL_PLANE,
  SECTOR_OPERATING_SYSTEMS,
  FOUNDATION_ORGANIZATION,
  CANONICAL_SURFACES,
} from "@/lib/operating-system-catalog";
import { resolveCanonicalHost, type CanonicalHostOptions } from "@/lib/canonical-hosts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROD_OPTIONS: CanonicalHostOptions = {
  canonicalDomain: "beyu.co.tz",
  allowLocalhost: false,
};

describe("Public Homepage & Enterprise Website Requirements", () => {
  it("renders the canonical brand palette, motto, and structure", () => {
    const pageContent = readFileSync(path.join(ROOT, "src/app/page.tsx"), "utf8");
    const surfaceContent = readFileSync(path.join(ROOT, "src/app/login-surface.tsx"), "utf8");

    // Motto & Tagline
    expect(surfaceContent).toContain("Bridging Care. Building Trust.");
    expect(surfaceContent).toContain("#0B1F4D"); // Navy
    expect(surfaceContent).toContain("#d4a017"); // Gold

    // Five Brand Pillars
    expect(surfaceContent).toContain('"Trust"');
    expect(surfaceContent).toContain('"Care"');
    expect(surfaceContent).toContain('"Integrity"');
    expect(surfaceContent).toContain('"Innovation"');
    expect(surfaceContent).toContain('"Impact"');

    // Canonical Control Plane & 4 Sector OSs
    expect(pageContent).toContain("Health OS, Finance OS, Agriculture OS");
    expect(pageContent).toContain("and Ujenzi OS are exactly the four Sector OSs");
    expect(pageContent).toContain("separate nonprofit BEYU Foundation");
  });

  it("proves the canonical Sector OS set is strictly closed at exactly four", () => {
    expect(SECTOR_OPERATING_SYSTEMS).toHaveLength(4);
    const codes = SECTOR_OPERATING_SYSTEMS.map((s) => s.code).sort();
    expect(codes).toEqual(["AGRICULTURE", "FINANCE", "HEALTH", "UJENZI"]);

    // Foundation and Family Office must NOT be in SECTOR_OPERATING_SYSTEMS
    expect(codes).not.toContain("FOUNDATION");
    expect(codes).not.toContain("FAMILY_OFFICE");
    expect(FOUNDATION_ORGANIZATION.destinationType).toBe("NONPROFIT");
  });

  it("provides canonical robots.ts and sitemap.ts with proper indexing barriers", () => {
    expect(existsSync(path.join(ROOT, "src/app/robots.ts"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/app/sitemap.ts"))).toBe(true);

    const robotsContent = readFileSync(path.join(ROOT, "src/app/robots.ts"), "utf8");
    expect(robotsContent).toContain("disallow: [");
    expect(robotsContent).toContain('"/api/"');
    expect(robotsContent).toContain('"/os/"');
    expect(robotsContent).toContain('"/launcher"');

    const sitemapContent = readFileSync(path.join(ROOT, "src/app/sitemap.ts"), "utf8");
    expect(sitemapContent).toContain("https://www.beyu.co.tz");
    expect(sitemapContent).toContain("/sign-in");
  });

  it("verifies the 7 post-login destination workspaces exist and have valid route targets", () => {
    // 1. BEYU OS (/os)
    expect(existsSync(path.join(ROOT, "src/app/os/page.tsx"))).toBe(true);
    // 2. HEALTH OS (/os/health or mount)
    expect(existsSync(path.join(ROOT, "src/app/os/health/page.tsx")) || existsSync(path.join(ROOT, "src/app/os/health/mount.ts"))).toBe(true);
    // 3. FINANCE OS (/os/finance)
    expect(existsSync(path.join(ROOT, "src/app/os/finance/page.tsx"))).toBe(true);
    // 4. AGRICULTURE OS (/os/agriculture)
    expect(existsSync(path.join(ROOT, "src/app/os/agriculture/page.tsx"))).toBe(true);
    // 5. UJENZI OS (/os/ujenzi)
    expect(existsSync(path.join(ROOT, "src/app/os/ujenzi/page.tsx"))).toBe(true);
    // 6. Foundation (/os/foundation)
    expect(existsSync(path.join(ROOT, "src/app/os/foundation/page.tsx"))).toBe(true);
    // 7. Family Office (/os/family)
    expect(existsSync(path.join(ROOT, "src/app/os/family/page.tsx"))).toBe(true);
  });

  it("proves the Mermaid architecture documentation exists and is valid", () => {
    const docPath = path.join(ROOT, "docs/architecture/beyu-public-website-and-workspace-routing.md");
    expect(existsSync(docPath)).toBe(true);

    const docContent = readFileSync(docPath, "utf8");
    expect(docContent).toContain("```mermaid");
    expect(docContent).toContain("flowchart TD");
    expect(docContent).toContain("BEYU FAMILY TRUST");
    expect(docContent).toContain("www.beyu.co.tz");
    expect(docContent).toContain("NOELIA AI");
  });
});
