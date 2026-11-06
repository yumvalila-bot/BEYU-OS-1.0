import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BEYU_CONTROL_PLANE, SECTOR_OPERATING_SYSTEMS } from "@/lib/operating-system-catalog";

const mocks = vi.hoisted(() => ({ principal: vi.fn(), destinations: vi.fn(), can: vi.fn(), redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/session", () => ({ resolvePrincipal: mocks.principal }));
vi.mock("@/lib/authz", () => ({ can: mocks.can }));
vi.mock("@/lib/canonical-host", () => ({ destinationHrefForRequest: async () => (item: { href: string }) => item.href }));
vi.mock("@/lib/sign-in-redirect", () => ({ signInHrefForRequest: async () => "/sign-in" }));
vi.mock("@/app/os/sign-out-button", () => ({ SignOutButton: () => null }));
vi.mock("../../src/app/os/sign-out-button", () => ({ SignOutButton: () => null }));
vi.mock("@/lib/operating-systems", async () => ({
  ...(await import("@/lib/operating-system-catalog")),
  authorizedGovernedDestinations: mocks.destinations,
}));

import LauncherPage from "@/app/launcher/page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation((href: string) => { throw new Error(`redirect:${href}`); });
  mocks.can.mockReturnValue({ allowed: false });
  mocks.principal.mockResolvedValue({ displayName: "Test identity", email: "test@example.invalid" });
});

describe("launcher decisions (simulated resolver results)", () => {
  it("returns an expired or missing session to sign-in", async () => {
    mocks.principal.mockResolvedValue(null);
    await expect(LauncherPage()).rejects.toThrow("redirect:/sign-in");
    expect(mocks.destinations).not.toHaveBeenCalled();
  });

  it("shows a safe pending state when there are no destinations", async () => {
    mocks.destinations.mockResolvedValue([]);
    const html = renderToStaticMarkup(await LauncherPage());
    expect(html).toContain("no workspace is currently available");
    expect(html).not.toContain("Open governed destination");
  });

  it("automatically enters a sole destination", async () => {
    mocks.destinations.mockResolvedValue([BEYU_CONTROL_PLANE]);
    await expect(LauncherPage()).rejects.toThrow("redirect:/os");
  });

  it("shows only currently authorized choices when there are multiple destinations", async () => {
    const finance = SECTOR_OPERATING_SYSTEMS.find((item) => item.code === "FINANCE")!;
    mocks.destinations.mockResolvedValue([BEYU_CONTROL_PLANE, finance]);
    const html = renderToStaticMarkup(await LauncherPage());
    expect(html).toContain("FINANCE_OS");
    expect(html).not.toContain("HEALTH_OS");
    expect(html).not.toContain("AGRICULTURE_OS");
    expect(html).not.toContain("UJENZI_OS");
    expect(html).not.toContain("NOT IN CURRENT GRANT");
    expect(html).toContain('href="/os/finance"');
  });
});
