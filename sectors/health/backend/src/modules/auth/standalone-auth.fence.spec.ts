/**
 * Standalone Health authentication fence (C-2 / D-3).
 *
 * Proves, against the real AuthController handlers, that register, login,
 * refresh and restore are refused before the AuthService is reached whenever
 * the test-only flag is absent or not exactly "true", and that production
 * refuses the flag at boot and structurally.
 */
import { ForbiddenException, Logger } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import type { AuthService } from "./auth.service";
import type { DbConnection } from "../identity/db-connection";
import {
  assertStandaloneAuthPermitted,
  standaloneAuthPermitted,
  STANDALONE_AUTH_TEST_ONLY_ENV,
} from "./standalone-auth.fence";
import { validateBootEnvironment } from "../../common/security/boot-validation";

const silent = new Logger("fence-test");
silent.error = () => {};
silent.warn = () => {};

function stubService() {
  return {
    register: jest.fn(async () => ({ message: "registered" })),
    login: jest.fn(async () => ({
      accessToken: "A",
      refreshToken: "R",
      user: {},
    })),
    refreshToken: jest.fn(async () => ({
      accessToken: "A2",
      refreshToken: "R2",
    })),
    restoreSession: jest.fn(async () => ({ accessToken: "A3", user: {} })),
  };
}

function controllerWith(service: ReturnType<typeof stubService>) {
  return new AuthController(
    service as unknown as AuthService,
    {} as unknown as DbConnection,
  );
}

const res = () => ({ cookie: jest.fn(), clearCookie: jest.fn() }) as never;
const req = () =>
  ({
    cookies: { beyu_refresh: "R" },
    headers: {},
    body: {},
    ip: "203.0.113.1",
  }) as never;

describe("standalone Health auth fence — policy", () => {
  it("refuses by default", () => {
    expect(standaloneAuthPermitted({ NODE_ENV: "test" })).toBe(false);
    expect(standaloneAuthPermitted({})).toBe(false);
  });

  it("permits only the exact value 'true' outside production", () => {
    expect(
      standaloneAuthPermitted({
        NODE_ENV: "test",
        [STANDALONE_AUTH_TEST_ONLY_ENV]: "true",
      }),
    ).toBe(true);
    for (const v of ["1", "TRUE", "yes", "on", "", " true"]) {
      const permitted = standaloneAuthPermitted({
        NODE_ENV: "test",
        [STANDALONE_AUTH_TEST_ONLY_ENV]: v,
      });
      if (permitted !== false)
        throw new Error(`flag value '${v}' must not lift the fence`);
    }
  });

  it("refuses in production even when the flag is set", () => {
    expect(
      standaloneAuthPermitted({
        NODE_ENV: "production",
        [STANDALONE_AUTH_TEST_ONLY_ENV]: "true",
      }),
    ).toBe(false);
  });

  it("assertion throws a 403 with a stable code and does not reveal configuration", () => {
    let thrown: unknown;
    try {
      assertStandaloneAuthPermitted("login", { NODE_ENV: "production" });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ForbiddenException);
    const body = (thrown as ForbiddenException).getResponse() as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      code: "STANDALONE_AUTH_DISABLED",
      operation: "login",
    });
    expect(JSON.stringify(body)).not.toContain(STANDALONE_AUTH_TEST_ONLY_ENV);
  });
});

describe("standalone Health auth fence — handlers refuse before reaching the service", () => {
  const SAVED_FLAG = process.env[STANDALONE_AUTH_TEST_ONLY_ENV];
  const SAVED_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    delete process.env[STANDALONE_AUTH_TEST_ONLY_ENV];
  });

  afterAll(() => {
    if (SAVED_FLAG === undefined)
      delete process.env[STANDALONE_AUTH_TEST_ONLY_ENV];
    else process.env[STANDALONE_AUTH_TEST_ONLY_ENV] = SAVED_FLAG;
    process.env.NODE_ENV = SAVED_ENV;
  });

  it("register is refused with the flag unset, and the service is never called", async () => {
    const svc = stubService();
    await expect(
      controllerWith(svc).register({ email: "a@b.co" } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(svc.register).not.toHaveBeenCalled();
  });

  it("login is refused with the flag unset, and no token is issued", async () => {
    const svc = stubService();
    await expect(
      controllerWith(svc).login(
        { email: "a@b.co", password: "x" } as never,
        req(),
        res(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(svc.login).not.toHaveBeenCalled();
  });

  it("refresh is refused with the flag unset, and the session is not rotated", async () => {
    const svc = stubService();
    await expect(
      controllerWith(svc).refresh(req(), res()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(svc.refreshToken).not.toHaveBeenCalled();
  });

  it("restore is refused with the flag unset, and no access token is minted", async () => {
    const svc = stubService();
    await expect(controllerWith(svc).restore(req())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(svc.restoreSession).not.toHaveBeenCalled();
  });

  it("the same handlers reach the service when the test-only flag is exactly 'true' outside production", async () => {
    process.env[STANDALONE_AUTH_TEST_ONLY_ENV] = "true";
    const svc = stubService();
    const c = controllerWith(svc);
    await expect(c.register({ email: "a@b.co" } as never)).resolves.toEqual({
      message: "registered",
    });
    await expect(
      c.login({ email: "a@b.co", password: "x" } as never, req(), res()),
    ).resolves.toMatchObject({ accessToken: "A" });
    await expect(c.refresh(req(), res())).resolves.toMatchObject({
      accessToken: "A2",
    });
    await expect(c.restore(req())).resolves.toMatchObject({
      accessToken: "A3",
    });
    expect(svc.register).toHaveBeenCalledTimes(1);
    expect(svc.login).toHaveBeenCalledTimes(1);
  });

  it("a truthy-looking but non-exact flag value does not lift the fence", async () => {
    process.env[STANDALONE_AUTH_TEST_ONLY_ENV] = "1";
    const svc = stubService();
    await expect(
      controllerWith(svc).register({} as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(svc.register).not.toHaveBeenCalled();
  });
});

describe("standalone Health auth fence — production boot refuses the flag", () => {
  const PROD_ENV: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    JWT_SECRET: "x".repeat(40),
    REFRESH_TOKEN_SECRET: "y".repeat(40),
    CSRF_SECRET: "z".repeat(40),
    JWT_ISSUER: "https://beyu.health",
    JWT_AUDIENCE: "beyu-health-os",
    COOKIE_SECURE: "true",
    DATABASE_URL: "postgres://u:p@db:5432/beyu",
    QUEUE_BACKEND: "redis",
    REDIS_URL: "redis://r:6379/0",
    ENCRYPTION_KEY: "k".repeat(32),
    CORS_ORIGIN: "https://app.beyu.health",
    BEYU_IDENTITY_ENDPOINT: "https://beyu.os/api/internal",
    BEYU_IDENTITY_TOKEN: "t".repeat(40),
  };

  it("a production process with the test-only flag set fails boot validation", () => {
    const r = validateBootEnvironment(
      { ...PROD_ENV, [STANDALONE_AUTH_TEST_ONLY_ENV]: "true" },
      silent,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/BEYU_HEALTH_STANDALONE_AUTH_TEST_ONLY/);
  });

  it("a production process without the flag is not refused for it", () => {
    const r = validateBootEnvironment({ ...PROD_ENV }, silent);
    expect(r.errors.join(" ")).not.toMatch(
      /BEYU_HEALTH_STANDALONE_AUTH_TEST_ONLY/,
    );
  });
});
