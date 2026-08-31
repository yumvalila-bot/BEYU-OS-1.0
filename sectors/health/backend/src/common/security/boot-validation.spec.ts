/**
 * Boot validation — production must refuse unsafe defaults; dev/test may
 * accept safe deterministic defaults.
 */
import { Logger } from "@nestjs/common";
import { validateBootEnvironment } from "./boot-validation";

const silent = new Logger();
// Silence logger during tests.
silent.error = () => {};
silent.warn = () => {};

describe("Boot validation (production fail-closed)", () => {
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
  };

  it("passes with a complete, secure production env", () => {
    const r = validateBootEnvironment({ ...PROD_ENV }, silent);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejects short/default JWT_SECRET", () => {
    const r = validateBootEnvironment({ ...PROD_ENV, JWT_SECRET: "dev-only-change-me" }, silent);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/JWT_SECRET/);
  });

  it("rejects COOKIE_SECURE=false in production", () => {
    const r = validateBootEnvironment({ ...PROD_ENV, COOKIE_SECURE: "false" }, silent);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/COOKIE_SECURE/);
  });

  it("rejects QUEUE_BACKEND=memory in production", () => {
    const r = validateBootEnvironment({ ...PROD_ENV, QUEUE_BACKEND: "memory" }, silent);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/QUEUE_BACKEND/);
  });

  it("rejects QUEUE_BACKEND=redis without REDIS_URL", () => {
    const e = { ...PROD_ENV };
    delete e.REDIS_URL; delete e.REDIS_HOST;
    const r = validateBootEnvironment(e, silent);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/REDIS/);
  });

  it("rejects missing ENCRYPTION_KEY", () => {
    const e = { ...PROD_ENV };
    delete e.ENCRYPTION_KEY;
    const r = validateBootEnvironment(e, silent);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/ENCRYPTION_KEY/);
  });

  it("development NODE_ENV accepts minimal config", () => {
    const r = validateBootEnvironment({ NODE_ENV: "development" }, silent);
    // Dev is permissive; no hard errors.
    expect(r.ok).toBe(true);
  });
});
