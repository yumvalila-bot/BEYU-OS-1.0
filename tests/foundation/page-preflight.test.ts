import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ principal: vi.fn(), scope: vi.fn(), permission: vi.fn(), audit: vi.fn(), failure: vi.fn() }));
vi.mock("@/lib/session", () => ({ resolvePrincipalFromToken: mocks.principal }));
vi.mock("@/lib/foundation/target-scope", () => ({ resolveFoundationTargetScope: mocks.scope }));
vi.mock("@/lib/foundation/page-policy", () => ({ foundationPageRequirements: () => [{ permission: "foundation:registry.read", classification: "CONFIDENTIAL" }], foundationPagePermissionAllowed: mocks.permission }));
vi.mock("@/lib/foundation-page-access", () => ({ auditFoundationPageDenial: mocks.audit, auditFoundationPageFailure: mocks.failure }));
import { foundationPagePreflight } from "@/lib/foundation/page-preflight";
import { SESSION_COOKIE } from "@/lib/constants";

const actor = { userId: "usr-test", tenantId: "ten-test", entityScope: [] };
const req = (cookie = true) => new NextRequest("http://localhost/os/foundation/registry", { headers: cookie ? { cookie: `${SESSION_COOKIE}=test-token` } : {} });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.principal.mockResolvedValue(actor);
  mocks.scope.mockResolvedValue({ ok: true, scope: { tenantId: "fdn" } });
  mocks.permission.mockReturnValue(true);
  mocks.audit.mockResolvedValue(undefined);
  mocks.failure.mockResolvedValue(undefined);
});

describe("Foundation pre-stream refusal boundary", () => {
  it("leaves unauthenticated requests and allowed requests to the independent page guards", async () => {
    expect((await foundationPagePreflight(req(false))).headers.get("x-middleware-next")).toBe("1");
    expect(mocks.principal).not.toHaveBeenCalled();
    expect((await foundationPagePreflight(req())).headers.get("x-middleware-next")).toBe("1");
  });
  it("returns 403 and attempts scoped audit for denied permission or scope", async () => {
    mocks.scope.mockResolvedValueOnce({ ok: false });
    let response = await foundationPagePreflight(req());
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("Authorisation denied");
    expect(mocks.audit).toHaveBeenCalledWith(actor, "/os/foundation/registry", "FOUNDATION_SCOPE_DENIED");
    mocks.permission.mockReturnValueOnce(false);
    response = await foundationPagePreflight(req());
    expect(response.status).toBe(403);
    expect(mocks.audit).toHaveBeenCalledWith(actor, "/os/foundation/registry", "FOUNDATION_PERMISSION_DENIED");
  });
  it("returns 503 without error details on security dependency failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.scope.mockRejectedValueOnce(new Error("private database password"));
    const response = await foundationPagePreflight(req());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database password");
    expect(mocks.failure).toHaveBeenCalledWith(actor, "/os/foundation/registry", expect.any(String));
    vi.restoreAllMocks();
  });
  it("never grants access if the audit boundary itself unexpectedly throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.scope.mockResolvedValueOnce({ ok: false });
    mocks.audit.mockRejectedValueOnce(new Error("audit offline"));
    expect((await foundationPagePreflight(req())).status).toBe(503);
    vi.restoreAllMocks();
  });
});
