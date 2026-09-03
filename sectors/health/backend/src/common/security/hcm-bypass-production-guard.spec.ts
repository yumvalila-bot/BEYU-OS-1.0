/**
 * P1 regression: BEYU_HCM_BYPASS_FOR_TEST can never weaken production
 * clinical-safety enforcement.
 *
 * Historical defect (Phase 0 re-verified): the flag was honored whenever
 * BEYU_HCM_ENDPOINT was unset, with no production gate — an operator
 * misconfiguration could silently disable practitioner licence/employment/
 * scope verification.
 *
 * Enforcement is now layered:
 *   1. validateBootEnvironment (called from main.ts) fails production boot
 *      when the flag is truthy.
 *   2. validateProductionBoot (production-boot.guard.ts) fails the same way.
 *   3. HcmAdapter structurally refuses the bypass when NODE_ENV=production,
 *      regardless of the flag.
 *   4. The E2E harness never sets the flag when NODE_ENV=production.
 *
 * Test mode keeps the bypass so the PGlite-backed HTTP suites can exercise
 * the full guard chain without a live HCM (that behaviour is intentional and
 * covered by the existing HCM/clinical-safety suites).
 */
import { validateBootEnvironment } from "./boot-validation";
import { validateProductionBoot } from "../config/production-boot.guard";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HcmAdapter } from "../../integrations/beyu/hcm/hcm.adapter";
import { TenantContext } from "./tenant-context";
import { CircuitBreaker } from "../../modules/integrations/circuit-breaker";
import type { DbConnection } from "../../modules/identity/db-connection";

const PROD_BASE: Record<string, string> = {
  NODE_ENV: "production",
  JWT_SECRET: "x".repeat(48),
  JWT_REFRESH_SECRET: "x".repeat(48),
  REFRESH_TOKEN_SECRET: "x".repeat(48),
  JWT_ISSUER: "https://beyu.os",
  JWT_AUDIENCE: "beyu-health-os",
  CSRF_SECRET: "x".repeat(48),
  COOKIE_SECURE: "true",
  CORS_ORIGIN: "https://health.beyu.os",
  DATABASE_URL: "postgresql://prod/prod",
  ENCRYPTION_KEY: "x".repeat(48),
  BEYU_IDENTITY_ENDPOINT: "https://beyu.os/api/internal",
  BEYU_IDENTITY_TOKEN: "x".repeat(48),
};

const silentLogger = new Logger("test");
(silentLogger as unknown as { log: () => void }).log = () => undefined;
(silentLogger as unknown as { error: () => void }).error = () => undefined;
(silentLogger as unknown as { warn: () => void }).warn = () => undefined;

/** Minimal DbConnection stub: no practitioner rows exist (worst case). */
function emptyDb(): DbConnection {
  return {
    query: async () => [],
    exec: async () => undefined,
    transaction: async <T>(fn: (c: DbConnection) => Promise<T>) =>
      fn(emptyDb()),
  } as unknown as DbConnection;
}

function makeAdapter(cfgMap: Record<string, string | undefined>): {
  adapter: HcmAdapter;
  tenantCtx: TenantContext;
} {
  const cfg = {
    get: (k: string) => cfgMap[k],
  } as unknown as ConfigService;
  const tenantCtx = new TenantContext();
  const audit = { record: async () => "audit-id" } as never;
  const adapter = new HcmAdapter(
    emptyDb(),
    tenantCtx,
    {} as CircuitBreaker,
    cfg,
    audit,
  );
  return { adapter, tenantCtx };
}

const ACTOR = {
  userId: "00000000-0000-0000-0000-000000000001",
  globalUserId: "00000000-0000-0000-0000-000000000001",
  email: "doc@beyu.health",
  role: "doctor",
  permissions: ["clinical:write"],
  tenantId: "11111111-1111-1111-1111-111111111111",
  countryCode: "TZ",
  entityCode: "HOSP-1",
};

describe("BEYU_HCM_BYPASS_FOR_TEST is eliminated from production runtime", () => {
  afterEach(() => {
    process.env.NODE_ENV = "test";
    delete process.env.BEYU_HCM_BYPASS_FOR_TEST;
    delete process.env.BEYU_HCM_ENDPOINT;
  });

  it("validateBootEnvironment fails production boot when the flag is truthy", () => {
    const r = validateBootEnvironment(
      { ...PROD_BASE, BEYU_HCM_BYPASS_FOR_TEST: "true" },
      silentLogger,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("BEYU_HCM_BYPASS_FOR_TEST");
  });

  it("validateBootEnvironment accepts explicit falsy values in production", () => {
    const r = validateBootEnvironment(
      { ...PROD_BASE, BEYU_HCM_BYPASS_FOR_TEST: "false" },
      silentLogger,
    );
    expect(r.ok).toBe(true);
  });

  it("validateBootEnvironment allows the flag outside production", () => {
    const r = validateBootEnvironment(
      { ...PROD_BASE, NODE_ENV: "test", BEYU_HCM_BYPASS_FOR_TEST: "true" },
      silentLogger,
    );
    expect(r.ok).toBe(true);
  });

  it("validateProductionBoot fails production boot when the flag is truthy", () => {
    const cfg = {
      get: (k: string) =>
        ({ ...PROD_BASE, BEYU_HCM_BYPASS_FOR_TEST: "true" })[k],
    } as unknown as ConfigService;
    const r = validateProductionBoot(cfg);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toContain("BEYU_HCM_BYPASS_FOR_TEST");
  });

  it("HcmAdapter structurally refuses the bypass under NODE_ENV=production", async () => {
    process.env.NODE_ENV = "production";
    process.env.BEYU_HCM_BYPASS_FOR_TEST = "true";
    delete process.env.BEYU_HCM_ENDPOINT;
    const { adapter, tenantCtx } = makeAdapter({});
    const res = await tenantCtx.run(ACTOR as never, () =>
      adapter.authorizeClinicalActor({
        action: "PatientsController.create",
        facilityId: null,
        requiredScope: ["clinical:write"],
      }),
    );
    // No practitioner record exists and the bypass is refused: deny.
    expect(res.authorized).toBe(false);
    expect(res.reason ?? "").toMatch(/^HCM_LICENCE_/);
  });

  it("HcmAdapter still honors the bypass in test mode (existing suite behaviour)", async () => {
    process.env.NODE_ENV = "test";
    process.env.BEYU_HCM_BYPASS_FOR_TEST = "true";
    delete process.env.BEYU_HCM_ENDPOINT;
    const { adapter, tenantCtx } = makeAdapter({});
    const res = await tenantCtx.run(ACTOR as never, () =>
      adapter.authorizeClinicalActor({
        action: "PatientsController.create",
        facilityId: null,
        requiredScope: ["clinical:write"],
      }),
    );
    expect(res.authorized).toBe(true);
    expect(res.reason).toBe("HCM_EXTERNAL_BYPASS_TEST_ONLY");
    expect(res.record.externalVerificationRequired).toBe(true);
  });

  it("HcmAdapter never honors the bypass when a real HCM endpoint is configured", async () => {
    process.env.NODE_ENV = "test";
    process.env.BEYU_HCM_BYPASS_FOR_TEST = "true";
    process.env.BEYU_HCM_ENDPOINT = "https://beyu.os/internal/hcm";
    const { adapter, tenantCtx } = makeAdapter({
      BEYU_HCM_ENDPOINT: "https://beyu.os/internal/hcm",
    });
    const res = await tenantCtx.run(ACTOR as never, () =>
      adapter.authorizeClinicalActor({
        action: "PatientsController.create",
        facilityId: null,
        requiredScope: ["clinical:write"],
      }),
    );
    expect(res.authorized).toBe(false);
    expect(res.reason ?? "").toMatch(/^HCM_LICENCE_/);
  });
});
