// @vitest-environment jsdom
/**
 * FE-1 regression — the Health SPA must render after authentication.
 *
 * `App` previously called `useMemo` AFTER its authentication early-returns. The
 * first render (status "loading") therefore called N hooks and the first
 * authenticated render N+1, which React rejects (minified error #310) by
 * unmounting the whole tree: a blank page after every successful sign-in or
 * session restore. No existing test rendered `App`, so CI never saw it.
 *
 * This drives the real transition a user goes through — loading →
 * authenticated, and loading → unauthenticated → authenticated — through
 * React's real client renderer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AuthStatus } from "./auth/AuthContext";
import type { AuthUser } from "./services/auth";

const auth = vi.hoisted(() => ({
  status: "loading" as AuthStatus,
  user: null as AuthUser | null,
}));

vi.mock("./auth/AuthContext", () => ({
  useAuth: () => ({
    status: auth.status,
    user: auth.user,
    login: async () => {
      throw new Error("not used");
    },
    logout: async () => undefined,
  }),
}));

import App from "./App";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOCTOR: AuthUser = {
  globalUserId: "11111111-1111-4111-8111-111111111111",
  email: "doctor@example.test",
  displayName: "Dr. Regression",
  role: "doctor",
  tenantId: null,
};

describe("App render across authentication transitions (FE-1)", () => {
  let container: HTMLDivElement;
  let root: Root;
  const errors: unknown[] = [];
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    auth.status = "loading";
    auth.user = null;
    errors.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container, {
      onUncaughtError: (e) => errors.push(e),
      onCaughtError: (e) => errors.push(e),
    });
    errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args[0]);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    errorSpy.mockRestore();
  });

  const render = () => act(() => root.render(<App />));

  it("loading → authenticated renders the application shell, not a blank page", () => {
    render();
    expect(container.textContent).toContain("Restoring secure session");

    auth.status = "authenticated";
    auth.user = DOCTOR;
    render();

    expect(errors).toEqual([]);
    expect(container.textContent).not.toContain("Restoring secure session");
    expect(container.childElementCount).toBeGreaterThan(0);
    expect((container.textContent ?? "").trim().length).toBeGreaterThan(0);
  });

  it("loading → unauthenticated → authenticated also survives (sign-in path)", () => {
    render();
    auth.status = "unauthenticated";
    render();
    expect(errors).toEqual([]);

    auth.status = "authenticated";
    auth.user = DOCTOR;
    render();

    expect(errors).toEqual([]);
    expect(container.childElementCount).toBeGreaterThan(0);
  });
});
