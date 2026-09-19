import React from "react";
import { renderToString } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ back: vi.fn(), forward: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/os/ujenzi/projects" }));
import { HistoryNavigation } from "@/components/history-navigation";
import { OsBrand, operatingSurfaceName } from "@/app/os/os-brand";
import { SECTOR_OPERATING_SYSTEMS } from "@/lib/operating-system-catalog";
import { BEYU_OS_ASSETS } from "@/components/brand-assets";

beforeEach(() => vi.clearAllMocks());

describe("shared history navigation", () => {
  it("renders one accessible Back and Next with native keyboard-operable buttons", () => {
    const html = renderToString(React.createElement(HistoryNavigation));
    expect(html).toContain('<nav aria-label="Page history"');
    for (const label of ["Back", "Next"]) {
      expect(html.match(new RegExp(`aria-label="${label}"`, "g"))).toHaveLength(1);
      expect(html).toContain(`type="button" aria-label="${label}" title="${label}"`);
    }
    expect(html).toContain("focus-visible:outline");
    expect(html).toContain("min-h-11 min-w-11");
    expect(html).toContain("hidden sm:inline");
    expect(html).not.toContain("disabled");
  });

  it("invokes only the real router history operations", () => {
    const tree = HistoryNavigation();
    const [back, next] = tree.props.children;
    back.props.onClick();
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.forward).not.toHaveBeenCalled();
    next.props.onClick();
    expect(router.forward).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("has one installation, inside the existing authenticated and scoped layout", () => {
    const layout = readFileSync("src/app/os/layout.tsx", "utf8");
    expect(layout.match(/<HistoryNavigation\s*\/>/g)).toHaveLength(1);
    expect(layout.indexOf("await requirePrincipal()")).toBeLessThan(layout.indexOf("<HistoryNavigation"));
    expect(layout).toContain("checkBeyuOSAuthorization(principal).authorized");
    expect(layout).toContain("withTenantDatabaseContext(principal");
    const files = readdirSync("src/app/os", { recursive: true }).filter(f => String(f).endsWith(".tsx"));
    const installations = files.filter(f => readFileSync(join("src/app/os", String(f)), "utf8").includes("<HistoryNavigation"));
    expect(installations).toEqual(["layout.tsx"]);
    const component = readFileSync("src/components/history-navigation.tsx", "utf8");
    expect(component).not.toMatch(/router\.(push|replace)|history\.(pushState|replaceState)|sessionStorage|localStorage|useState|fetch\(/);
  });
});

describe("one operating identity and contextual shell labels", () => {
  it.each(SECTOR_OPERATING_SYSTEMS)("$name shares the existing canonical catalogue", ({ name, href }) => {
    expect(operatingSurfaceName(href)).toBe(name);
    expect(operatingSurfaceName(`${href}/nested`)).toBe(name);
    expect(operatingSurfaceName(`${href}-not-a-domain`)).toBe("BEYU OS");
  });
  it("keeps Family Office a capability, not an extra OS", () => {
    expect(operatingSurfaceName("/os/family/capital")).toBe("Family Office");
    expect(SECTOR_OPERATING_SYSTEMS.map(os => os.name)).not.toContain("Family Office");
  });
  it("uses the authoritative OS PNG, even for Ujenzi", () => {
    const html = renderToString(React.createElement(OsBrand));
    expect(html).toContain(BEYU_OS_ASSETS.official);
    expect(html).toContain("Ujenzi OS");
    expect(html).not.toContain("family-trust");
  });
});
