import { describe, it, expect } from "@jest/globals";
import { ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CsrfOriginGuard } from "./csrf-origin.guard";

const config = (origins: string) =>
  new ConfigService({ CSRF_ALLOWED_ORIGINS: origins });

const exec = (guard: CsrfOriginGuard, headers: Record<string, string>) => {
  const ctx: any = {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  };
  return guard.canActivate(ctx);
};

describe("CsrfOriginGuard", () => {
  it("allows a request with a matching Origin", () => {
    const g = new CsrfOriginGuard(config("https://app.beyu.example"));
    expect(exec(g, { origin: "https://app.beyu.example" })).toBe(true);
  });

  it("rejects a request with a disallowed Origin", () => {
    const g = new CsrfOriginGuard(config("https://app.beyu.example"));
    expect(() => exec(g, { origin: "https://evil.example" })).toThrow(
      ForbiddenException,
    );
  });

  it("rejects a cross-site Sec-Fetch-Site request regardless of Origin", () => {
    const g = new CsrfOriginGuard(config("https://app.beyu.example"));
    expect(() =>
      exec(g, {
        origin: "https://app.beyu.example",
        "sec-fetch-site": "cross-site",
      }),
    ).toThrow(ForbiddenException);
  });

  it("allows requests without Origin/Sec-Fetch-Site (native clients)", () => {
    const g = new CsrfOriginGuard(config("https://app.beyu.example"));
    expect(exec(g, {})).toBe(true);
  });

  it("rejects a wildcard allow-list (fail closed)", () => {
    const g = new CsrfOriginGuard(config("*"));
    expect(() => exec(g, { origin: "https://anything.example" })).toThrow(
      ForbiddenException,
    );
  });

  it("rejects when no allow-list is configured (fail closed)", () => {
    const g = new CsrfOriginGuard(new ConfigService({}));
    expect(() => exec(g, { origin: "https://app.beyu.example" })).toThrow(
      ForbiddenException,
    );
  });
});
