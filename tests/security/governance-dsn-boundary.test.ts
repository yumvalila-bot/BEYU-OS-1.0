import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mutableEnv = process.env as Record<string, string | undefined>;
const original = {
  nodeEnv: process.env.NODE_ENV,
  database: process.env.DATABASE_URL,
  admin: process.env.BEYU_ADMIN_DATABASE_URL,
  governance: process.env.BEYU_GOVERNANCE_DATABASE_URL,
};

afterEach(() => {
  vi.resetModules();
  if (original.nodeEnv === undefined) delete mutableEnv.NODE_ENV; else mutableEnv.NODE_ENV = original.nodeEnv;
  if (original.database === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original.database;
  if (original.admin === undefined) delete process.env.BEYU_ADMIN_DATABASE_URL; else process.env.BEYU_ADMIN_DATABASE_URL = original.admin;
  if (original.governance === undefined) delete process.env.BEYU_GOVERNANCE_DATABASE_URL; else process.env.BEYU_GOVERNANCE_DATABASE_URL = original.governance;
});

describe("request-path governance database credential boundary", () => {
  it("imports lazily without requiring any database secret at build time", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.BEYU_ADMIN_DATABASE_URL;
    delete process.env.BEYU_GOVERNANCE_DATABASE_URL;
    await expect(import("../../src/db/governance")).resolves.toHaveProperty("governanceDb");
  });

  it("fails closed instead of falling back to runtime or migration credentials", async () => {
    process.env.DATABASE_URL = "postgresql://runtime:runtime@example.invalid/app";
    process.env.BEYU_ADMIN_DATABASE_URL = "postgresql://admin:admin@example.invalid/app";
    delete process.env.BEYU_GOVERNANCE_DATABASE_URL;
    const { governanceDb } = await import("../../src/db/governance");
    expect(() => governanceDb.transaction).toThrow(/BEYU_GOVERNANCE_DATABASE_URL is required/);
  });

  it("rejects migration credential reuse in production", async () => {
    mutableEnv.NODE_ENV = "production";
    process.env.BEYU_ADMIN_DATABASE_URL = "postgresql://admin:admin@example.invalid/app";
    process.env.BEYU_GOVERNANCE_DATABASE_URL = process.env.BEYU_ADMIN_DATABASE_URL;
    const { governanceDb } = await import("../../src/db/governance");
    expect(() => governanceDb.transaction).toThrow(/must not use the migration\/admin credential/);
  });

  it("keeps normal request services off adminDb", () => {
    for (const file of [
      "src/lib/admin/governance-service.ts",
      "src/lib/tenant-domain/lifecycle-service.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("@/db/governance");
      expect(source, file).not.toContain("@/db/admin");
      expect(source, file).not.toMatch(/\badminDb\b/);
    }
  });
});
