import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "@/lib/authz";

const mocks = vi.hoisted(() => ({ scope: vi.fn(), audit: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/foundation/target-scope", () => ({ resolveFoundationTargetScope: mocks.scope }));
vi.mock("@/lib/audit", () => ({ recordAudit: mocks.audit }));
vi.mock("@/lib/tenant-scope", () => ({ withTenantDatabaseContext: mocks.transaction }));
import { foundationPageScopeAllowed } from "@/lib/foundation-page-access";

const principal = { userId: "test-user", tenantId: "test-tenant", entityScope: ["test-entity"] } as Principal;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (_principal, callback) => callback());
  mocks.audit.mockResolvedValue("audit-id");
});

describe("Foundation page scope boundary", () => {
  it("permits only a resolved target scope", async () => {
    mocks.scope.mockResolvedValue({ ok: true, scope: { tenantId: "target", classification: "INTERNAL" } });
    expect(await foundationPageScopeAllowed(principal, "foundation.dashboard")).toBe(true);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("denies and audits the actor and scope without the underlying policy reason", async () => {
    mocks.scope.mockResolvedValue({ ok: false, reason: "internal detail" });
    expect(await foundationPageScopeAllowed(principal, "foundation.dashboard")).toBe(false);
    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: "test-user", tenantId: "test-tenant", objectId: "foundation.dashboard", outcome: "DENIED",
      reason: "FOUNDATION_SCOPE_DENIED", traceId: expect.any(String), newValue: { entityScope: ["test-entity"] },
    }));
  });
  it("fails closed when scope or audit infrastructure is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.scope.mockRejectedValueOnce(new Error("private database detail"));
    expect(await foundationPageScopeAllowed(principal, "foundation.dashboard")).toBe(false);
    mocks.scope.mockResolvedValueOnce({ ok: false, reason: "internal detail" });
    mocks.audit.mockRejectedValueOnce(new Error("private database detail"));
    expect(await foundationPageScopeAllowed(principal, "foundation.dashboard")).toBe(false);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private database detail");
    vi.restoreAllMocks();
  });
});
