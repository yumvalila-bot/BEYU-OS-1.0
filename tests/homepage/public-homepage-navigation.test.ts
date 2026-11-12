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

  it("links canonical Sector OS destinations and governed surfaces", () => {
    for (const href of ["/os/health", "/os/finance", "/os/agriculture", "/os/ujenzi", "/os/noelia", "/os/foundation", "/os/family"]) {
      expect(page).toContain(href);
    }
  });

  it("provides responsive native mobile navigation", () => {
    expect(page).toContain('<details className="beyu-mobile-nav">');
    expect(page).toContain('<summary aria-label="Open site navigation">');
    expect(styles).toContain(".beyu-mobile-nav > nav");
    expect(styles).toContain("@media (max-width: 900px)");
  });
});
