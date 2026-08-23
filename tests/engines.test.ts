/**
 * BEYU OS — deterministic control tests for critical business rules.
 * Run: npx vitest run
 */
import { describe, expect, it } from "vitest";
import { runWaterfall, CANONICAL_TIER_TEMPLATE, type WaterfallTierInput } from "../src/lib/waterfall";
import { assessTaxStrategy } from "../src/lib/tax";
import { detectHierarchyConflicts } from "../src/lib/policy";
import { can, permissionsForRoles, clearanceForRoles, type Principal } from "../src/lib/authz";
import { hashPassword, verifyPassword, stableStringify } from "../src/lib/crypto";

const tiers: WaterfallTierInput[] = [
  { sequence: 1, code: "TAX", name: "Tax", tierType: "PERCENTAGE_OF_GROSS", rate: 0.3, beneficiaryType: "TAX_AUTHORITY", mandatory: true },
  { sequence: 2, code: "OPEX", name: "Opex", tierType: "PERCENTAGE_OF_GROSS", rate: 0.32, beneficiaryType: "OPERATIONS", mandatory: true },
  { sequence: 3, code: "DEBT", name: "Debt", tierType: "PERCENTAGE_OF_REMAINING", rate: 0.25, beneficiaryType: "LENDER", mandatory: true },
  { sequence: 4, code: "RESERVE", name: "Reserve", tierType: "THRESHOLD_TOPUP", minAmount: 400000, beneficiaryType: "RESERVE", mandatory: true },
  { sequence: 5, code: "OWNER", name: "Owner", tierType: "RESIDUAL", beneficiaryType: "OWNER" },
];

function principal(overrides: Partial<Principal> = {}): Principal {
  const roles = overrides.roles ?? ["GROUP_CFO"];
  return {
    userId: "USR_TEST",
    partyId: "PTY_TEST",
    email: "test@beyu.os",
    displayName: "Test Principal",
    tenantId: "TEN_BEYU_GROUP",
    tenantCode: "BEYU-GROUP",
    tenantType: "ENTERPRISE",
    roles,
    permissions: permissionsForRoles(roles),
    clearance: clearanceForRoles(roles),
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "SES_TEST",
    riskScore: 0,
    emergencyPermissions: [],
    ...overrides,
  };
}

describe("waterfall engine", () => {
  it("reconciles exactly: allocated + residual = gross", () => {
    const r = runWaterfall({ grossAmount: 5_250_000, currency: "USD", tiers });
    expect(r.totalAllocated + r.residual).toBe(r.grossAmount);
  });

  it("is deterministic (identical checksum for identical inputs)", () => {
    const a = runWaterfall({ grossAmount: 1_234_567.89, currency: "USD", tiers });
    const b = runWaterfall({ grossAmount: 1_234_567.89, currency: "USD", tiers });
    expect(a.checksum).toBe(b.checksum);
  });

  it("applies tiers in strict sequence with correct arithmetic", () => {
    const r = runWaterfall({ grossAmount: 1_000_000, currency: "USD", tiers: tiers.slice(0, 3) });
    expect(r.lines[0].allocatedAmount).toBe(300_000); // 30% of gross
    expect(r.lines[1].allocatedAmount).toBe(320_000); // 32% of gross
    expect(r.lines[2].allocatedAmount).toBe(95_000); // 25% of remaining 380,000
    expect(r.residual).toBe(285_000);
  });

  it("never allocates more cash than exists and escalates mandatory shortfalls", () => {
    const r = runWaterfall({
      grossAmount: 100_000,
      currency: "USD",
      tiers: [{ sequence: 1, code: "DEBT", name: "Debt", tierType: "FIXED", fixedAmount: 500_000, beneficiaryType: "LENDER", mandatory: true }],
    });
    expect(r.totalAllocated).toBe(100_000);
    expect(r.residual).toBe(0);
    expect(r.warnings.length).toBe(1);
  });

  it("avoids floating point drift on fractional amounts", () => {
    const r = runWaterfall({ grossAmount: 0.03, currency: "USD", tiers: [
      { sequence: 1, code: "A", name: "A", tierType: "PERCENTAGE_OF_GROSS", rate: 1 / 3, beneficiaryType: "OPERATIONS" },
      { sequence: 2, code: "B", name: "B", tierType: "RESIDUAL", beneficiaryType: "OWNER" },
    ] });
    expect(r.totalAllocated + r.residual).toBe(0.03);
  });

  it("exposes a canonical tier template covering the constitutional order", () => {
    expect(CANONICAL_TIER_TEMPLATE.map((t) => t.beneficiaryType)).toEqual([
      "TAX_AUTHORITY", "OPERATIONS", "LENDER", "RESERVE", "CAPITAL", "FOUNDATION", "OWNER",
    ]);
  });
});

const baseStrategy = {
  code: "TZ-TEST",
  title: "Test",
  jurisdictionCode: "TZ",
  position: "LEGAL_TAX_PLANNING",
  authorityStatus: "AUTHORITATIVE",
  effectiveFrom: "2024-01-01",
  effectiveTo: null,
  reviewDate: "2030-01-01",
  benefitRate: 0.05,
  complianceRisk: 1,
  auditRisk: 1,
  legalRisk: 1,
  reputationalRisk: 1,
  requiredApprovals: ["GROUP_CFO"],
  eligibilityCriteria: [
    { key: "assetInUse", label: "Asset in use", operator: "EQUALS" as const, value: true, mandatory: true },
  ],
  economicBenefitBasis: "test",
};

describe("tax strategy intelligence", () => {
  it("hard-blocks unlawful evasion and computes no benefit", () => {
    const r = assessTaxStrategy({
      strategy: { ...baseStrategy, position: "PROHIBITED_EVASION" },
      taxpayerJurisdiction: "TZ",
      facts: { assetInUse: true },
      baseAmount: 1_000_000,
    });
    expect(r.blocked).toBe(true);
    expect(r.estimatedBenefit).toBeNull();
    expect(r.eligibility).toBe("INELIGIBLE");
  });

  it("never generalises a national rule to another jurisdiction", () => {
    const r = assessTaxStrategy({ strategy: baseStrategy, taxpayerJurisdiction: "GB", facts: { assetInUse: true }, baseAmount: 100 });
    expect(r.eligibility).toBe("INELIGIBLE");
  });

  it("suspends reliance on non-authoritative knowledge", () => {
    const r = assessTaxStrategy({
      strategy: { ...baseStrategy, authorityStatus: "UNDER_REVIEW" },
      taxpayerJurisdiction: "TZ",
      facts: { assetInUse: true },
      baseAmount: 100,
    });
    expect(r.eligibility).toBe("UNDER_REVIEW");
    expect(r.humanReviewRequired).toBe(true);
  });

  it("does not apply a strategy before its effective date or after its review date", () => {
    const future = assessTaxStrategy({
      strategy: { ...baseStrategy, effectiveFrom: "2030-01-01" },
      taxpayerJurisdiction: "TZ",
      facts: { assetInUse: true },
      baseAmount: 100,
      asOf: "2026-08-23",
    });
    expect(future.eligibility).toBe("UNDER_REVIEW");
    expect(future.estimatedBenefit).toBeNull();

    const stale = assessTaxStrategy({
      strategy: { ...baseStrategy, reviewDate: "2026-01-01" },
      taxpayerJurisdiction: "TZ",
      facts: { assetInUse: true },
      baseAmount: 100,
      asOf: "2026-08-23",
    });
    expect(stale.eligibility).toBe("UNDER_REVIEW");
    expect(stale.estimatedBenefit).toBeNull();
  });

  it("computes benefit only when statutory criteria are satisfied", () => {
    const ok = assessTaxStrategy({ strategy: baseStrategy, taxpayerJurisdiction: "TZ", facts: { assetInUse: true }, baseAmount: 1_000_000 });
    expect(ok.eligibility).toBe("ELIGIBLE");
    expect(ok.estimatedBenefit).toBe(50_000);

    const no = assessTaxStrategy({ strategy: baseStrategy, taxpayerJurisdiction: "TZ", facts: { assetInUse: false }, baseAmount: 1_000_000 });
    expect(no.eligibility).toBe("CONDITIONAL");
  });

  it("forces human review for aggressive or uncertain positions", () => {
    const r = assessTaxStrategy({
      strategy: { ...baseStrategy, position: "AGGRESSIVE_UNCERTAIN" },
      taxpayerJurisdiction: "TZ",
      facts: { assetInUse: true },
      baseAmount: 100,
    });
    expect(r.humanReviewRequired).toBe(true);
    expect(r.eligibility).toBe("CONDITIONAL");
  });
});

describe("authorization (RBAC + ABAC + tenancy)", () => {
  it("denies a permission that is not granted", () => {
    expect(can(principal({ roles: ["AUDITOR"] }), "finance:ledger.post").allowed).toBe(false);
  });

  it("enforces read-only assurance separation for auditors", () => {
    const auditor = principal({ roles: ["AUDITOR"] });
    expect(can(auditor, "finance:ledger.read").allowed).toBe(true);
    expect(can(auditor, "organization:ownership.manage").allowed).toBe(false);
    expect(can(auditor, "governance:policy.manage").allowed).toBe(false);
  });

  it("blocks cross-tenant access", () => {
    const d = can(principal(), "finance:capital.read", { tenantId: "TEN_OTHER" });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/Tenant isolation/);
  });

  it("enforces the classification ceiling", () => {
    const operator = principal({ roles: ["SECTOR_OPERATOR"] });
    expect(can(operator, "documents:registry.read", { classification: "HIGHLY_RESTRICTED" }).allowed).toBe(false);
    expect(can(operator, "documents:registry.read", { classification: "CONFIDENTIAL" }).allowed).toBe(true);
  });

  it("requires step-up authentication for high-risk operations", () => {
    const d = can(principal({ mfaSatisfied: false }), "finance:waterfall.commit");
    expect(d.allowed).toBe(false);
    expect(d.requiresMfa).toBe(true);
  });

  it("restricts data scope to granted legal entities", () => {
    const scoped = principal({ entityScope: ["LEN_A"] });
    expect(can(scoped, "finance:capital.read", { entityId: "LEN_B" }).allowed).toBe(false);
    expect(can(scoped, "finance:capital.read", { entityId: "LEN_A" }).allowed).toBe(true);
  });
});

describe("policy hierarchy", () => {
  it("detects a lower-level ALLOW contradicting a higher-level DENY", () => {
    const conflicts = detectHierarchyConflicts([
      { code: "CONST-1", level: "CONSTITUTION", rules: [{ id: "1", effect: "DENY", action: "finance:ledger.post", message: "no" }] },
      { code: "TEN-1", level: "TENANT", rules: [{ id: "2", effect: "ALLOW", action: "finance:ledger.post", message: "yes" }] },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ higher: "CONST-1", lower: "TEN-1" });
  });

  it("accepts a consistent hierarchy", () => {
    expect(
      detectHierarchyConflicts([
        { code: "CONST-1", level: "CONSTITUTION", rules: [{ id: "1", effect: "DENY", action: "finance:ledger.post", message: "no" }] },
        { code: "ENT-1", level: "ENTERPRISE", rules: [{ id: "2", effect: "REQUIRE_APPROVAL", action: "finance:capital.manage", message: "approve" }] },
      ]),
    ).toHaveLength(0);
  });
});

describe("cryptographic controls", () => {
  it("never stores plaintext and verifies correctly", () => {
    const sample = "SamplePassword-NotASecret-2026";
    const hash = hashPassword(sample);
    expect(hash).not.toContain(sample);
    expect(verifyPassword(sample, hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  it("produces order-independent canonical JSON (jsonb-safe hashing)", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
  });
});
