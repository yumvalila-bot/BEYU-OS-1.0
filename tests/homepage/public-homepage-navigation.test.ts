import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../../src/app/page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");

describe("canonical public homepage navigation", () => {
  it("does not expose inert placeholder links", () => {
    expect(page).not.toContain('href="#"');
  });

  it("resolves every in-page navigation link to a real target", () => {
    const ids = new Set([...page.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
    const targets = [...page.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) expect(ids.has(target)).toBe(true);
  });

  it("routes sign-in through the existing canonical sign-in page", () => {
    expect(page).toContain('href="/sign-in"');
    expect(page).toContain("resolvePrincipal()");
    expect(page).toContain("authorizedGovernedDestinations(principal)");
    expect(page).toContain("canonicalHostForRequest()");
  });

  it("links every canonical Sector OS destination and governed surface from the ONE catalogue", () => {
    // The gateway is derived, not hand-written: the destination list and every
    // label come from the canonical catalogue, and every entry URL is composed by
    // the canonical-host contract (`entryHrefForRequest()` → `canonicalEntryHref`).
    // Previously this section spelled seven production hostnames into the markup —
    // a second host table, and links to hosts that do not exist in an environment
    // without `BEYU_CANONICAL_DOMAIN` (every preview deployment).
    expect(page).toContain('from "@/lib/operating-system-catalog"');
    expect(page).toContain("SECTOR_OPERATING_SYSTEMS");
    expect(page).toContain("FOUNDATION_ORGANIZATION");
    expect(page).toContain("CANONICAL_SURFACES");
    expect(page).toContain("entryHrefForRequest()");
    expect(page).toContain("entryHref(");
    // The rendered hrefs come from the resolver, never from a host literal.
    expect(page).not.toMatch(/https:\/\/(?:health|finance|agriculture|ujenzi|foundation|familyoffice|noelia)\.beyu\.co\.tz/);
    expect(page).not.toMatch(/href="https:\/\/\$\{/);
  });

  it("offers the seven canonical destinations in canonical order", () => {
    // Four Sector OSs (constitutionally closed at four), the Foundation nonprofit
    // sister organization, then the two shared surfaces — the same order as the
    // canonical catalogue and the launcher.
    const gateway = page.slice(page.indexOf("const GATEWAY_DESTINATIONS"), page.indexOf("const FAMILY_OFFICE_SURFACE"));
    expect(gateway).toContain("...SECTOR_OPERATING_SYSTEMS");
    expect(gateway).toContain("FOUNDATION_ORGANIZATION");
    expect(gateway).toContain("...CANONICAL_SURFACES");
    expect(gateway.indexOf("...SECTOR_OPERATING_SYSTEMS")).toBeLessThan(gateway.indexOf("FOUNDATION_ORGANIZATION"));
    expect(gateway.indexOf("FOUNDATION_ORGANIZATION")).toBeLessThan(gateway.indexOf("...CANONICAL_SURFACES"));
  });

  it("provides responsive native mobile navigation", () => {
    expect(page).toContain('<details className="beyu-mobile-nav">');
    expect(page).toContain('<summary aria-label="Open site navigation">');
    expect(styles).toContain(".beyu-mobile-nav > nav");
    expect(styles).toContain("@media (max-width: 900px)");
    expect(styles).toContain("@media (max-width: 480px)");
    expect(styles).toContain(".beyu-theme-mark { display: none; }");
  });
});
