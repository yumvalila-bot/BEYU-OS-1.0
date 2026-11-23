import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { GOVERNED_ROUTE_DESTINATIONS, CANONICAL_SURFACES } from "../../src/lib/operating-system-catalog";
import { PUBLIC_HOMEPAGE_CODES, publicHomepageFor } from "../../src/lib/destination-homepages";

describe("destination public homepage content", () => {
  it("covers each existing non-control-plane catalogue destination exactly once", () => {
    const codes = [...GOVERNED_ROUTE_DESTINATIONS, ...CANONICAL_SURFACES].map((d) => d.code);
    expect([...PUBLIC_HOMEPAGE_CODES].sort()).toEqual(codes.sort());
    for (const code of codes) {
      const page = publicHomepageFor(code);
      expect(page).not.toBeNull();
      expect(page!.sections.length).toBeGreaterThan(0);
      expect(page!.notices.length).toBeGreaterThan(0);
    }
    expect(publicHomepageFor("unknown")).toBeNull();
  });
  it("keeps the six Family Office categories and the Health federation boundary honest", () => {
    const family = publicHomepageFor("FAMILY_OFFICE")!;
    const categories = family.sections.find((section) => section.title === "The six canonical categories")!;
    expect(categories.areas.map((area) => area.title.replace(/^\d · /, ""))).toEqual([
      "Business Development", "Wealth Management", "Wealth Planning", "Family Governance", "Lifestyle Management", "Philanthropy",
    ]);
    const healthCopy = JSON.stringify(publicHomepageFor("HEALTH"));
    expect(healthCopy).toContain("session federation is not yet operational");
    expect(healthCopy).toContain("identity link alone does not grant Health access");
  });
  it("does not embed production hostnames or credential inputs in public content", () => {
    const content = readFileSync("src/lib/destination-homepages.ts", "utf8");
    const component = readFileSync("src/app/destination-homepage.tsx", "utf8");
    expect(content).not.toMatch(/beyu\.co\.tz/i);
    expect(component).not.toMatch(/<input\b/i);
    expect(component).toContain('href="/sign-in"');
  });
});
