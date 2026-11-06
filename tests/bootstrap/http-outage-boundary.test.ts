import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  begin: vi.fn(), verify: vi.fn(), complete: vi.fn(), status: vi.fn(),
  jar: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => mocks.jar }));
vi.mock("@/lib/bootstrap/service", () => ({
  beginEnrollment: mocks.begin, verifyEnrollmentMfa: mocks.verify,
  completeEnrollment: mocks.complete, getBootstrapStatus: mocks.status,
}));
import { POST as begin } from "@/app/api/v1/auth/bootstrap/begin/route";
import { POST as verify } from "@/app/api/v1/auth/bootstrap/verify-mfa/route";
import { POST as complete } from "@/app/api/v1/auth/bootstrap/complete/route";
import { GET as status } from "@/app/api/v1/auth/bootstrap/status/route";

function request(payload: unknown): Request {
  return new Request("http://localhost/api/v1/auth/bootstrap", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.jar.get.mockReturnValue({ value: "isolated-token" });
});

describe("bootstrap HTTP dependency boundary", () => {
  it.each([
    ["status", mocks.status, () => status()],
    ["begin", mocks.begin, () => begin(request({ bootstrapSecret: "test-input", password: "test-input" }))],
    ["verify", mocks.verify, () => verify(request({ code: "123456" }))],
    ["complete", mocks.complete, () => complete()],
  ])("returns generic no-store 503 when %s fails, without exposing the error", async (_name, operation, invoke) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    operation.mockRejectedValueOnce(new Error("sensitive database detail"));
    try {
      const response = await invoke();
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("retry-after")).toBe("30");
      const body = await response.text();
      expect(body).toContain("BOOTSTRAP_UNAVAILABLE");
      expect(body).not.toContain("sensitive database detail");
      expect(JSON.stringify(log.mock.calls)).not.toContain("sensitive database detail");
      expect(mocks.jar.set).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
  it("marks the one-time enrollment credential response no-store", async () => {
    mocks.begin.mockResolvedValueOnce({
      ok: true, enrollmentToken: "isolated-token", email: "test@example.invalid",
      mfaSecret: "isolated-mfa", otpauthUri: "otpauth://totp/test", recoveryCodes: ["isolated-code"],
      expiresAt: new Date(Date.now() + 60_000),
    });
    const response = await begin(request({ bootstrapSecret: "test-input", password: "test-input" }));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.jar.set).toHaveBeenCalledOnce();
  });
  it("keeps an ordinary refusal distinct from an outage", async () => {
    mocks.begin.mockResolvedValueOnce({ ok: false, code: "INVALID_SECRET" });
    const response = await begin(request({ bootstrapSecret: "test-input", password: "test-input" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
