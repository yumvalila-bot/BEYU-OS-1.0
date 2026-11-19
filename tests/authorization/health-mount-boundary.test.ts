import { beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the actual mount's decision order. These are unit tests with mocked
// dependencies, not evidence of live database, tenant isolation or federation.
const mocks = vi.hoisted(() => ({
  resolvePrincipal: vi.fn(),
  isForeignOSHost: vi.fn(),
  resolveRequestHostname: vi.fn(),
  resolutionIsPlatformNeutral: vi.fn(),
  resolutionBelongsToNamespace: vi.fn(),
  checkHealthOSAuthorization: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ resolvePrincipal: mocks.resolvePrincipal }));
vi.mock("@/lib/canonical-host", () => ({ isForeignOSHost: mocks.isForeignOSHost }));
vi.mock("@/lib/health-os-authorization", () => ({ checkHealthOSAuthorization: mocks.checkHealthOSAuthorization }));
vi.mock("@/lib/tenant-domain", () => ({
  resolveRequestHostname: mocks.resolveRequestHostname,
  resolutionIsPlatformNeutral: mocks.resolutionIsPlatformNeutral,
  resolutionBelongsToNamespace: mocks.resolutionBelongsToNamespace,
  hostnameDenialResponse: () => new Response(null, { status: 404 }),
}));
vi.mock("@/app/health/os/spa-content", () => ({ healthSpaHtml: "<!doctype html><title>Health test document</title>" }));

import { serveHealthOS } from "@/app/os/health/mount";
import { GET as canonicalGet } from "@/app/os/health/route";
import { GET as legacyGet } from "@/app/health/os/route";

const principal = { userId: "test-user", tenantId: "test-tenant" };
const request = { host: "health.example.test" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolvePrincipal.mockResolvedValue(principal);
  mocks.isForeignOSHost.mockReturnValue(false);
  mocks.resolveRequestHostname.mockResolvedValue({ kind: "RESOLVED" });
  mocks.resolutionIsPlatformNeutral.mockReturnValue(false);
  mocks.resolutionBelongsToNamespace.mockReturnValue(true);
  mocks.checkHealthOSAuthorization.mockResolvedValue({ authorized: true });
});

describe("Health mount boundary (mocked dependencies)", () => {
  it("refuses an absent session before consulting host or link", async () => {
    mocks.resolvePrincipal.mockResolvedValue(null);
    const response = await serveHealthOS(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/");
    expect(mocks.resolveRequestHostname).not.toHaveBeenCalled();
    expect(mocks.checkHealthOSAuthorization).not.toHaveBeenCalled();
  });

  it("refuses foreign OS hosts before tenant or link lookup", async () => {
    mocks.isForeignOSHost.mockReturnValue(true);
    const response = await serveHealthOS(request);
    expect(response.status).toBe(404);
    expect(mocks.resolveRequestHostname).not.toHaveBeenCalled();
    expect(mocks.checkHealthOSAuthorization).not.toHaveBeenCalled();
  });

  it.each(["denied tenant-domain resolution", "wrong namespace"])("refuses %s before link lookup", async (reason) => {
    if (reason === "denied tenant-domain resolution") mocks.resolveRequestHostname.mockResolvedValue({ kind: "DENIED" });
    else mocks.resolutionBelongsToNamespace.mockReturnValue(false);
    const response = await serveHealthOS(request);
    expect(response.status).toBe(404);
    expect(mocks.resolveRequestHostname).toHaveBeenCalledWith(principal, request.host);
    expect(mocks.checkHealthOSAuthorization).not.toHaveBeenCalled();
  });

  it.each(["NOT_LINKED", "AUTHORIZATION_SERVICE_UNAVAILABLE"])("fails closed when the link gate reports %s", async (reason) => {
    mocks.checkHealthOSAuthorization.mockResolvedValue({ authorized: false, reason });
    const response = await serveHealthOS(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/health");
    expect(mocks.checkHealthOSAuthorization).toHaveBeenCalledWith(principal.userId);
    expect(await response.text()).not.toContain("Health test document");
  });

  it("serves the same no-store document via canonical and legacy routes only after gates pass", async () => {
    const canonical = await canonicalGet(new Request("https://health.example.test/os/health"));
    const legacy = await legacyGet(new Request("https://health.example.test/health/os"));
    expect(canonical.status).toBe(200);
    expect(legacy.status).toBe(200);
    expect(canonical.headers.get("cache-control")).toBe("no-store");
    expect(legacy.headers.get("cache-control")).toBe("no-store");
    expect(await canonical.text()).toBe(await legacy.text());
    expect(mocks.checkHealthOSAuthorization).toHaveBeenCalledTimes(2);
  });
});
