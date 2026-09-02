import { buildTestBed, TEST_ACTOR } from "../testing/test-bed";
import { CsrfDoubleSubmitGuard, Public } from "./csrf-double-submit.guard";
import { Reflector } from "@nestjs/core";

function buildReq(overrides: any = {}) {
  return {
    method: "POST",
    path: "/x",
    url: "/x",
    ip: "127.0.0.1",
    headers: {
      origin: "https://app.example.com",
      "sec-fetch-site": "same-origin",
    },
    cookies: {},
    user: {
      userId: TEST_ACTOR.userId,
      tenantId: TEST_ACTOR.tenantId,
      sessionId: "sess1",
    },
    ...overrides,
  };
}

function ctxWith(req: any, isPublic = false) {
  class Stub {
    @Public() handler() {}
    plain() {}
  }
  const s = new Stub();
  const handler = isPublic ? s.handler : s.plain;
  return {
    getHandler: () => handler,
    getClass: () => Stub,
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({ cookie: jest.fn() }),
    }),
    getArgs: () => [],
    getArgByIndex: () => undefined,
    getType: () => "http",
  } as any;
}

describe("CSRF double-submit (global) adversarial", () => {
  let bed: any;
  let guard: CsrfDoubleSubmitGuard;

  beforeAll(async () => {
    bed = await buildTestBed();
    const reflector = new Reflector();
    const cfg = {
      get: (k: string) =>
        k === "CORS_ORIGIN" ? "https://app.example.com" : undefined,
    } as any;
    guard = new CsrfDoubleSubmitGuard(bed.conn as any, cfg, reflector);
  });

  it("GET/HEAD/OPTIONS are safe methods (pass through)", async () => {
    expect(await guard.canActivate(ctxWith(buildReq({ method: "GET" })))).toBe(
      true,
    );
    expect(await guard.canActivate(ctxWith(buildReq({ method: "HEAD" })))).toBe(
      true,
    );
    expect(
      await guard.canActivate(ctxWith(buildReq({ method: "OPTIONS" }))),
    ).toBe(true);
  });

  it("POST without token is rejected", async () => {
    await expect(guard.canActivate(ctxWith(buildReq()))).rejects.toThrow(
      /CSRF_TOKEN_MISSING/,
    );
  });

  it("POST with mismatched cookie/header is rejected", async () => {
    const req = buildReq({
      cookies: { "__Host-csrf": "a.b" },
      headers: {
        origin: "https://app.example.com",
        "sec-fetch-site": "same-origin",
        "x-csrf-token": "c.d",
      },
    });
    await expect(guard.canActivate(ctxWith(req))).rejects.toThrow(
      /CSRF_TOKEN_INVALID/,
    );
  });

  it("Sec-Fetch-Site: cross-site rejected", async () => {
    const req = buildReq({
      headers: { origin: "https://evil.com", "sec-fetch-site": "cross-site" },
    });
    await expect(guard.canActivate(ctxWith(req))).rejects.toThrow(
      /CSRF_CROSS_SITE/,
    );
  });

  it("Disallowed Origin rejected", async () => {
    const req = buildReq({
      cookies: { "__Host-csrf": "a.b" },
      headers: {
        origin: "https://evil.com",
        "sec-fetch-site": "same-origin",
        "x-csrf-token": "a.b",
      },
    });
    await expect(guard.canActivate(ctxWith(req))).rejects.toThrow(
      /CSRF_ORIGIN_FORBIDDEN/,
    );
  });

  it("Authorization: Bearer is exempt", async () => {
    const req = buildReq({
      headers: {
        authorization: "Bearer abc",
        origin: "https://app.example.com",
      },
    });
    expect(await guard.canActivate(ctxWith(req))).toBe(true);
  });

  it("@Public() metadata exempts routes", async () => {
    expect(await guard.canActivate(ctxWith(buildReq(), true))).toBe(true);
  });
});
