import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  principal: vi.fn(), can: vi.fn(), target: vi.fn(), denial: vi.fn(), audit: vi.fn(), failure: vi.fn(), rows: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ resolvePrincipalFromToken: mocks.principal, resolvePrincipal: mocks.principal }));
vi.mock("@/lib/authz", () => ({ can: mocks.can }));
vi.mock("@/lib/foundation/target-scope", () => ({ resolveFoundationTargetScope: mocks.target, foundationTargetScopeDenial: mocks.denial }));
vi.mock("@/lib/foundation-page-access", () => ({ auditFoundationPageDenial: mocks.audit, auditFoundationPageFailure: mocks.failure }));
vi.mock("@/lib/tenant-scope", () => ({ withTenantDatabaseContext: async (_p: unknown, callback: () => Promise<unknown>) => callback() }));
vi.mock("@/lib/foundation/service", () => ({ listFoundations: mocks.rows }));
import { foundationPagePreflight } from "@/lib/foundation/page-preflight";
import FoundationRegistryPage from "@/app/os/foundation/registry/page";
import { SESSION_COOKIE } from "@/lib/constants";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.principal.mockResolvedValue({ userId: "actor", tenantId: "tenant", entityScope: [] });
  mocks.target.mockResolvedValue({ ok: true, scope: { tenantId: "foundation" } });
  mocks.denial.mockResolvedValue(null);
  mocks.can.mockReturnValue({ allowed: true });
  mocks.audit.mockResolvedValue(undefined);
});

describe("Foundation independent guard after preflight", () => {
  it.each(["permission", "scope"])("does not read protected rows if %s is revoked between decisions", async (change) => {
    const preflight = await foundationPagePreflight(new NextRequest("http://localhost/os/foundation/registry", {
      headers: { cookie: `${SESSION_COOKIE}=test-token` },
    }));
    expect(preflight.headers.get("x-middleware-next")).toBe("1");
    if (change === "permission") mocks.can.mockReturnValue({ allowed: false, reason: "revoked" });
    else mocks.denial.mockResolvedValue("scope revoked");
    const element = await FoundationRegistryPage();
    const html = renderToStaticMarkup(element);
    expect(html).toContain("You do not have the required access");
    expect(html).not.toContain("Foundation Registry");
    expect(mocks.rows).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), "foundation.registry", "FOUNDATION_ACCESS_DENIED");
    expect(mocks.principal).toHaveBeenCalledTimes(2);
  });
});
