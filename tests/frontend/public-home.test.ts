import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicHome } from "../../src/app/public-home";

const html = renderToStaticMarkup(createElement(PublicHome, { sectorLinks: { HEALTH: "/os/health", FINANCE: "/os/finance", AGRICULTURE: "/os/agriculture", UJENZI: "/os/ujenzi" }, noeliaLink: "/os/noelia", foundationLink: "/os/foundation" }));

describe("public institutional front door", () => {
  it("presents the ecosystem without presenting Foundation or Family Office as a sector OS", () => {
    for (const code of ["HEALTH_OS", "FINANCE_OS", "AGRICULTURE_OS", "UJENZI_OS"]) expect(html).toContain(code);
    expect(html).toContain("separate nonprofit sister organization");
    expect(html).toContain("not a Sector OS");
    expect(html).toContain("Family office");
    expect(html).toContain("Strategic capital governance");
    expect(html).toContain("Enterprise API &amp; integration");
    expect(html).toContain("Document &amp; records management");
    expect(html).toContain("Enterprise intelligence");
  });
  it("links to existing sign-in and the supplied governed destinations", () => {
    for (const path of ["/sign-in", "/os/health", "/os/finance", "/os/agriculture", "/os/ujenzi", "/os/noelia", "/os/foundation"]) expect(html).toContain(`href="${path}"`);
    expect(html).toContain("authorized human approval");
    for (const asset of ["network-globe.jpg", "sector-health.jpg", "sector-finance.jpg", "sector-agriculture.jpg", "sector-ujenzi.jpg", "NOELIA.png", "beyu-logo-light.svg"]) expect(html).toContain(asset);
  });
  it("provides semantic, keyboard-operable disclosure and section navigation", () => {
    expect(html).toContain('<main id="main-content">');
    expect(html).toContain('<a class="ph-skip" href="#main-content">');
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    for (const id of ["about", "ecosystem", "governance", "capabilities", "noelia", "technology", "security", "impact", "contact"]) expect(html).toContain(`id="${id}"`);
  });
});
