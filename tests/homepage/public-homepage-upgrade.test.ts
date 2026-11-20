import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../../src/app/page.tsx", import.meta.url), "utf8");
const artwork = readFileSync(new URL("../../src/components/homepage-artwork.tsx", import.meta.url), "utf8");
const newsFeed = readFileSync(new URL("../../src/components/public-news-events.tsx", import.meta.url), "utf8");

describe("BEYU public homepage reference upgrade and constitutional fidelity", () => {
  it("corrects mockup typos and preserves constitutional Sector OS naming", () => {
    expect(page).not.toContain("LUENZI_OS");
    expect(artwork).not.toContain("LUENZI_OS");
    expect(artwork).toContain("HEALTH_OS");
    expect(artwork).toContain("FINANCE_OS");
    expect(artwork).toContain("AGRICULTURE_OS");
    expect(artwork).toContain("UJENZI_OS");

    expect(page).not.toContain("governnd");
    expect(page).not.toContain("FOUNDATION_OS");
    expect(page).not.toContain("FAMILY_OFFICE_OS");
    expect(page).not.toContain("BEYUHEALTH.OS");
  });

  it("renders NOELIA via the canonical byte-exact asset registry with plain <img> and never uses screenshot substitutes", () => {
    expect(page).toContain("NOELIA_CANONICAL_APPEARANCE.path");
    expect(page).not.toContain('from "next/image"');
    expect(page).not.toContain("Beyu home page .png");
    expect(page).not.toContain("BEYU LOGIN PAGE .png");
  });

  it("wires live homepage news to /api/public/content with genuine empty/error states and no fabricated stories", () => {
    expect(page).toContain("<PublicNewsEvents");
    expect(newsFeed).toContain("/api/public/content");
    expect(newsFeed).toContain("No public announcements published yet");
    expect(newsFeed).not.toContain("2024");
  });

  it("provides real public institutional routes for News, Privacy, Terms, and Security", () => {
    expect(existsSync(new URL("../../src/app/news/page.tsx", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../src/app/news/[slug]/page.tsx", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../src/app/privacy/page.tsx", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../src/app/terms/page.tsx", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../src/app/security/page.tsx", import.meta.url))).toBe(true);

    expect(page).toContain('href="/news"');
    expect(page).toContain('href="/privacy"');
    expect(page).toContain('href="/terms"');
    expect(page).toContain('href="/security"');
  });
});
