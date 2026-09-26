/**
 * Health Backend — Deployment Configuration Audit (Phase 7).
 *
 * Verifies that the boot validation enforces all required deployment
 * prerequisites. This test proves the configuration contract without
 * exposing any secrets.
 *
 * SECURITY: This test NEVER prints or logs secret values. It only checks
 * PRESENCE/ABSENCE of configuration, not content.
 */
import { describe, it, expect } from "@jest/globals";
import { validateBootEnvironment } from "./boot-validation";

describe("Phase 7 — Deployment Configuration Audit", () => {
  it("production boot fails without DATABASE_URL", () => {
    const result = validateBootEnvironment({
      NODE_ENV: "production",
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("DATABASE_URL is required in production");
  });

  it("production boot fails without JWT_SECRET", () => {
    const result = validateBootEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://...",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("JWT_SECRET"))).toBe(true);
  });

  it("production boot fails with weak JWT_SECRET", () => {
    const result = validateBootEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://...",
      JWT_SECRET: "dev-only-change-me",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("JWT_SECRET"))).toBe(true);
  });

  it("production boot fails without BEYU_IDENTITY_ENDPOINT", () => {
    const result = validateBootEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://...",
      JWT_SECRET: "a".repeat(32),
      JWT_ISSUER: "health-os",
      JWT_AUDIENCE: "health-os-api",
      REFRESH_TOKEN_SECRET: "b".repeat(32),
      CSRF_SECRET: "c".repeat(32),
      ENCRYPTION_KEY: "d".repeat(32),
      COOKIE_SECURE: "true",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("BEYU_IDENTITY_ENDPOINT"))).toBe(
      true,
    );
  });

  it("production boot fails without BEYU_IDENTITY_TOKEN when endpoint is set", () => {
    const result = validateBootEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://...",
      JWT_SECRET: "a".repeat(32),
      JWT_ISSUER: "health-os",
      JWT_AUDIENCE: "health-os-api",
      REFRESH_TOKEN_SECRET: "b".repeat(32),
      CSRF_SECRET: "c".repeat(32),
      ENCRYPTION_KEY: "d".repeat(32),
      COOKIE_SECURE: "true",
      BEYU_IDENTITY_ENDPOINT: "https://identity.beyu.os",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("BEYU_IDENTITY_TOKEN"))).toBe(
      true,
    );
  });

  it("production boot refuses test harness flag", () => {
    const result = validateBootEnvironment({
      NODE_ENV: "production",
      BEYU_IDENTITY_TEST_HARNESS: "true",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("TEST_HARNESS"))).toBe(true);
  });

  it("production boot refuses HCM bypass flag", () => {
    const result = validateBootEnvironment({
      NODE_ENV: "production",
      BEYU_HCM_BYPASS_FOR_TEST: "true",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("HCM_BYPASS"))).toBe(true);
  });

  it("production boot refuses memory queue backend", () => {
    const result = validateBootEnvironment({
      NODE_ENV: "production",
      QUEUE_BACKEND: "memory",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("QUEUE_BACKEND"))).toBe(true);
  });

  it("production boot refuses DB_SKIP_RLS_CHECK", () => {
    const result = validateBootEnvironment({
      NODE_ENV: "production",
      DB_SKIP_RLS_CHECK: "true",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("RLS"))).toBe(true);
  });

  it("production boot requires ENCRYPTION_KEY", () => {
    const result = validateBootEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://...",
      JWT_SECRET: "a".repeat(32),
      JWT_ISSUER: "health-os",
      JWT_AUDIENCE: "health-os-api",
      REFRESH_TOKEN_SECRET: "b".repeat(32),
      CSRF_SECRET: "c".repeat(32),
      COOKIE_SECURE: "true",
      BEYU_IDENTITY_ENDPOINT: "https://identity.beyu.os",
      BEYU_IDENTITY_TOKEN: "service-token-value",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("ENCRYPTION_KEY"))).toBe(true);
  });

  it("production boot passes with all required configuration", () => {
    const result = validateBootEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://...",
      JWT_SECRET: "a".repeat(32),
      JWT_ISSUER: "health-os",
      JWT_AUDIENCE: "health-os-api",
      REFRESH_TOKEN_SECRET: "b".repeat(32),
      CSRF_SECRET: "c".repeat(32),
      ENCRYPTION_KEY: "d".repeat(32),
      COOKIE_SECURE: "true",
      BEYU_IDENTITY_ENDPOINT: "https://identity.beyu.os",
      BEYU_IDENTITY_TOKEN: "service-token-value",
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("development environment has relaxed requirements", () => {
    const result = validateBootEnvironment({
      NODE_ENV: "development",
    });
    // Development should not have the same strict requirements.
    expect(result.errors.filter((e) => e.includes("production"))).toHaveLength(0);
  });
});
