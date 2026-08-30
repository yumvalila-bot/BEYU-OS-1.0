import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  login,
  logout,
  restoreSession,
  getAccessToken,
  setAccessToken,
  AuthError,
} from "./auth";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const user = {
  globalUserId: "gid-1",
  email: "doctor@a.example",
  displayName: "Dr A",
  role: "doctor",
  tenantId: "tenant-a",
};

describe("frontend auth client (Phase 1A)", () => {
  beforeEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("login stores the access token in memory and returns the user", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ accessToken: "token-1", user }));
    const result = await login("doctor@a.example", "secret");
    expect(result.email).toBe("doctor@a.example");
    expect(getAccessToken()).toBe("token-1");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/login"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("does not persist the access token to localStorage", async () => {
    const setItem = vi.fn();
    const getItem = vi.fn((_key: string) => null);
    Object.defineProperty(globalThis, "localStorage", {
      value: { setItem, getItem, removeItem: vi.fn(), length: 0 },
      configurable: true,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ accessToken: "token-1", user }),
    );
    await login("doctor@a.example", "secret");
    expect(setItem).not.toHaveBeenCalled();
    expect(getItem("token")).toBeNull();
  });

  it("restoreSession returns the user on success and null on failure", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ accessToken: "tok", user }))
      .mockResolvedValueOnce(jsonResponse({}, 401));
    const ok = await restoreSession();
    expect(ok?.email).toBe("doctor@a.example");
    expect(getAccessToken()).toBe("tok");
    setAccessToken(null);
    const fail = await restoreSession();
    expect(fail).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it("logout clears the in-memory token", async () => {
    setAccessToken("token-1");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 200));
    await logout();
    expect(getAccessToken()).toBeNull();
  });

  it("throws AuthError with status on a failed login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ message: "INVALID_CREDENTIALS" }, 401),
    );
    await expect(login("a@b.com", "wrong")).rejects.toThrow(AuthError);
  });
});
