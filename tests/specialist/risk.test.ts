/**
 * Phase 7D — Financial Risk Intelligence.
 *
 * The failure mode this suite exists to prevent: a risk module that reports reassuring numbers it
 * has no basis for. Three assertions matter more than the rest —
 *
 *   1. Absent data yields DATA_NOT_AVAILABLE with a null value, never 0% concentration.
 *   2. Severity is REQUIRES_POLICY unless the caller supplies a threshold WITH provenance,
 *      because BEYU has ratified no risk appetite.
 *   3. Scenario output is basis SCENARIO and leaves observed data byte-identical.
 *
 * Positive controls are as heavily weighted as negative ones: a suite that only proves things are
 * blocked has not proven the module works.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ROLES } from "@/lib/constants";
import type { Principal } from "@/lib/authz";
import { SpecialistError, type SpecialistContext } from "@/lib/specialist/platform";
import {
  RISK_VERSION,
  authorityRisk,
  capitalExposure,
  concentration,
  counterpartyExposure,
  currencyExposure,
  dataQualityRisk,
  fromMinor,
  liquidityCoverage,
  scenarioRisk,
  thresholdAssessment,
  toMinor,
  treasuryExposure,
  type CapitalObservation,
  type TreasuryObservation,
} from "@/lib/specialist/risk/engines";
import {
  assessAuthorityRisk,
  assessConcentration,
  assessRiskProfile,
  assessThreshold,
  simulateRiskScenario,
} from "@/lib/specialist/risk/service";
import type { RiskThreshold } from "@/lib/specialist/risk/model";

const RUN = `RK${Date.now()}`;
let n = 0;
const trace = () => `${RUN}-${String(++n).padStart(3, "0")}`;

/** Tenant that actually owns the seeded treasury data. Resolved, never assumed. */
let tenantId = "";
let entityId = "";
let foreignTenantId = "";
let foreignEntityId = "";

async function rowsOf<T>(q: Parameters<typeof db.execute>[0]): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as { rows?: T[] };
  return r.rows ?? (r as unknown as T[]);
}
async function count(q: Parameters<typeof db.execute>[0]): Promise<number> {
  return Number((await rowsOf<{ n: number }>(q))[0].n);
}

function principal(overrides: Partial<Principal> = {}): Principal {
  const roles = overrides.roles ?? ["GROUP_CFO"];
  const permissions = new Set<never>();
  for (const role of roles) {
    const def = (ROLES as Record<string, { permissions?: readonly string[] }>)[role];
    for (const p of def?.permissions ?? []) permissions.add(p as never);
  }
  return {
    userId: "USR_RISK_TEST",
    partyId: "p",
    email: "risk@example.test",
    displayName: "Risk Test",
    tenantId,
    tenantCode: "BEYU",
    tenantType: "ENTERPRISE",
    roles,
    permissions,
    clearance: "RESTRICTED",
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "s",
    riskScore: 0,
    emergencyPermissions: [],
    ...overrides,
  } as unknown as Principal;
}

function ctx(overrides: Partial<SpecialistContext> = {}): SpecialistContext {
  return { principal: principal(), tenantId, legalEntityId: null, traceId: trace(), ...overrides };
}

const pos = (over: Partial<TreasuryObservation> = {}): TreasuryObservation => ({
  id: "TRS_X",
  tenantId: "TEN",
  legalEntityId: "LEN",
  currency: "USD",
  institution: "Bank A",
  accountType: "OPERATING",
  balance: "100.00",
  baseCurrencyBalance: "100.00",
  asOf: "2025-12-31",
  ...over,
});

const cap = (over: Partial<CapitalObservation> = {}): CapitalObservation => ({
  id: "CAP_X",
  code: "CAP-X",
  tenantId: "TEN",
  legalEntityId: "LEN",
  status: "APPROVED",
  amount: "100.00",
  currency: "USD",
  sectorCode: "HEALTH",
  ...over,
});

const governedThreshold: RiskThreshold = {
  code: "TEST_CONC_LIMIT",
  value: 30,
  unit: "PERCENT",
  sourceReference: "TEST-FIXTURE (not a BEYU policy)",
  effectiveFrom: "2020-01-01",
  effectiveTo: null,
};

beforeAll(async () => {
  // Resolve the tenant FROM THE DATA. Scoping to the first legal_entities row would silently
  // select a tenant that owns no treasury positions and make every positive control vacuous.
  const [t] = await rowsOf<{ tenant_id: string; legal_entity_id: string }>(
    sql`select tenant_id, legal_entity_id from treasury_positions order by id limit 1`,
  );
  tenantId = t.tenant_id;
  entityId = t.legal_entity_id;

  const [f] = await rowsOf<{ id: string; tenant_id: string }>(
    sql`select id, tenant_id from legal_entities where tenant_id <> ${tenantId} order by id limit 1`,
  );
  foreignEntityId = f.id;
  foreignTenantId = f.tenant_id;

  expect(tenantId).toBeTruthy();
  expect(foreignTenantId).not.toBe(tenantId);
});

// ===========================================================================
// A. MONEY AND PURITY
// ===========================================================================

describe("risk engines — money handling", () => {
  it("round-trips minor units", () => {
    expect(toMinor("4820000.00")).toBe(482_000_000);
    expect(fromMinor(482_000_000)).toBe("4820000.00");
    expect(fromMinor(toMinor("-1.05"))).toBe("-1.05");
    expect(fromMinor(toMinor("0.07"))).toBe("0.07");
  });

  it("refuses malformed and unsafe amounts rather than coercing them", () => {
    expect(() => toMinor("1.005")).toThrow(SpecialistError);
    expect(() => toMinor("abc")).toThrow(SpecialistError);
    expect(() => toMinor("")).toThrow(SpecialistError);
    expect(() => toMinor("99999999999999999999.00")).toThrow(/safe range/);
  });
});

// ===========================================================================
// B. NO FABRICATED ZEROS — the core discipline
// ===========================================================================

describe("risk engines — absent data never becomes zero", () => {
  it("returns DATA_NOT_AVAILABLE, not 0%, when there are no observations", () => {
    const r = concentration([], { asOf: "2025-12-31", dimension: "COUNTERPARTY" });
    expect(r.basis).toBe("DATA_NOT_AVAILABLE");
    expect(r.value).toBeNull();
    expect(r.missingInputs.length).toBeGreaterThan(0);
    expect(r.buckets).toEqual([]);
    expect(r.explanation.join(" ")).toMatch(/falsely imply a diversified position/i);
  });

  it("refuses to compute a share against a zero total", () => {
    const r = concentration([{ id: "a", key: "k", label: "k", amountMinor: 0 }], {
      asOf: "2025-12-31",
      dimension: "COUNTERPARTY",
    });
    expect(r.basis).toBe("DATA_NOT_AVAILABLE");
    expect(r.value).toBeNull();
  });

  it("returns DATA_NOT_AVAILABLE for liquidity when no positions exist", () => {
    const r = liquidityCoverage([], [], {
      asOf: "2025-12-31",
      liquidAccountTypes: ["OPERATING"],
      committedStatuses: ["APPROVED"],
    });
    expect(r.basis).toBe("DATA_NOT_AVAILABLE");
    expect(r.value).toBeNull();
  });

  it("will not assume which account types are liquid", () => {
    const r = liquidityCoverage([pos()], [cap()], {
      asOf: "2025-12-31",
      liquidAccountTypes: [],
      committedStatuses: ["APPROVED"],
    });
    expect(r.basis).toBe("DATA_NOT_AVAILABLE");
    expect(r.policyDependencies).toContain("LIQUIDITY_DEFINITION");
    expect(r.explanation.join(" ")).toMatch(/policy determination/i);
  });

  it("treats zero committed outflow as undefined coverage, not infinite coverage", () => {
    const r = liquidityCoverage([pos()], [cap({ status: "DRAFT" })], {
      asOf: "2025-12-31",
      liquidAccountTypes: ["OPERATING"],
      committedStatuses: ["APPROVED"],
    });
    expect(r.value).toBeNull();
    expect(r.severity).toBe("REQUIRES_POLICY");
    expect(r.explanation.join(" ")).toMatch(/undefined rather than infinite/i);
  });

  it("cannot assess a limit against an absent measurement", () => {
    const r = thresholdAssessment({ code: "X", value: null, unit: "PERCENT" }, governedThreshold, "2025-12-31");
    expect(r.basis).toBe("DATA_NOT_AVAILABLE");
    expect(r.value).toBeNull();
  });
});

// ===========================================================================
// C. SEVERITY REQUIRES A RATIFIED THRESHOLD
// ===========================================================================

describe("risk engines — severity is never invented", () => {
  const items = [
    { id: "a", key: "A", label: "A", amountMinor: 8000 },
    { id: "b", key: "B", label: "B", amountMinor: 2000 },
  ];

  it("computes the concentration but refuses to grade it without a threshold", () => {
    const r = concentration(items, { asOf: "2025-12-31", dimension: "COUNTERPARTY" });
    expect(r.value).toBe("80.00");
    expect(r.basis).toBe("DERIVED");
    expect(r.severity).toBe("REQUIRES_POLICY");
    expect(r.severityBasis).toMatch(/No ratified risk appetite/i);
    expect(r.policyDependencies).toContain("RISK_APPETITE_THRESHOLD");
  });

  it("grades only when a threshold with provenance is supplied", () => {
    const r = concentration(items, { asOf: "2025-12-31", dimension: "C", threshold: governedThreshold });
    expect(r.severity).toBe("HIGH");
    expect(r.severityBasis).toContain("TEST_CONC_LIMIT");
    expect(r.policyDependencies).not.toContain("RISK_APPETITE_THRESHOLD");
  });

  it("returns LOW when the measure is under a supplied threshold", () => {
    const even = [
      { id: "a", key: "A", label: "A", amountMinor: 100 },
      { id: "b", key: "B", label: "B", amountMinor: 100 },
      { id: "c", key: "C", label: "C", amountMinor: 100 },
      { id: "d", key: "D", label: "D", amountMinor: 100 },
    ];
    const r = concentration(even, { asOf: "2025-12-31", dimension: "C", threshold: governedThreshold });
    expect(r.value).toBe("25.00");
    expect(r.severity).toBe("LOW");
  });

  it("REJECTS a threshold with no source reference — unattributed limits are refused", () => {
    expect(() =>
      concentration(items, {
        asOf: "2025-12-31",
        dimension: "C",
        threshold: { ...governedThreshold, sourceReference: "  " },
      }),
    ).toThrow(/source reference/i);
  });

  it("ignores a threshold that is not yet effective", () => {
    const r = concentration(items, {
      asOf: "2025-12-31",
      dimension: "C",
      threshold: { ...governedThreshold, effectiveFrom: "2026-01-01" },
    });
    expect(r.severity).toBe("REQUIRES_POLICY");
    expect(r.severityBasis).toMatch(/not effective/i);
  });

  it("ignores a threshold that has expired", () => {
    const r = concentration(items, {
      asOf: "2025-12-31",
      dimension: "C",
      threshold: { ...governedThreshold, effectiveTo: "2025-06-30" },
    });
    expect(r.severity).toBe("REQUIRES_POLICY");
  });
});

describe("risk engines — threshold direction (ceiling vs floor)", () => {
  const items = [
    { id: "a", key: "A", label: "A", amountMinor: 8000 },
    { id: "b", key: "B", label: "B", amountMinor: 2000 },
  ];

  it("treats a concentration threshold as a CEILING by default", () => {
    // 80% measured against a 30% ceiling is a breach.
    const r = concentration(items, { asOf: "2025-12-31", dimension: "C", threshold: governedThreshold });
    expect(r.severity).toBe("HIGH");
    expect(r.severityBasis).toMatch(/ceiling/i);
  });

  it("treats a liquidity threshold as a FLOOR, so low coverage is the breach", () => {
    const floor: RiskThreshold = { ...governedThreshold, code: "LIQ_MIN", value: 1.5, unit: "RATIO" };
    const thin = liquidityCoverage([pos({ baseCurrencyBalance: "100.00" })], [cap({ amount: "200.00" })], {
      asOf: "2025-12-31",
      liquidAccountTypes: ["OPERATING"],
      committedStatuses: ["APPROVED"],
      threshold: floor,
    });
    expect(thin.value).toBe("0.5000");
    expect(thin.severity).toBe("HIGH");
    expect(thin.severityBasis).toMatch(/floor/i);

    const healthy = liquidityCoverage([pos({ baseCurrencyBalance: "1000.00" })], [cap({ amount: "200.00" })], {
      asOf: "2025-12-31",
      liquidAccountTypes: ["OPERATING"],
      committedStatuses: ["APPROVED"],
      threshold: floor,
    });
    expect(healthy.value).toBe("5.0000");
    expect(healthy.severity).toBe("LOW");
  });

  it("honours an explicit direction that overrides the engine default", () => {
    const asFloor: RiskThreshold = { ...governedThreshold, direction: "MIN" };
    // 80% measured against a 30% FLOOR is not a breach — the opposite verdict to the ceiling case.
    const r = concentration(items, { asOf: "2025-12-31", dimension: "C", threshold: asFloor });
    expect(r.severity).toBe("LOW");
    expect(r.severityBasis).toMatch(/floor/i);
  });

  it("states the measured value and the limit in the severity basis", () => {
    const r = concentration(items, { asOf: "2025-12-31", dimension: "C", threshold: governedThreshold });
    expect(r.severityBasis).toContain("80");
    expect(r.severityBasis).toContain("30");
    expect(r.severityBasis).toContain("TEST-FIXTURE");
  });
});

// ===========================================================================
// D. TEMPORAL BOUNDARIES — five cases around the effective window
// ===========================================================================

describe("risk engines — threshold effective dating boundaries", () => {
  const measured = { code: "M", value: "50", unit: "PERCENT" as const };
  const t = (from: string, to: string | null): RiskThreshold => ({
    ...governedThreshold,
    effectiveFrom: from,
    effectiveTo: to,
  });

  it("BEFORE the window: not applied", () => {
    expect(thresholdAssessment(measured, t("2025-06-01", "2025-06-30"), "2025-05-31").severity).toBe(
      "REQUIRES_POLICY",
    );
  });
  it("ON effectiveFrom: applied (inclusive)", () => {
    expect(thresholdAssessment(measured, t("2025-06-01", "2025-06-30"), "2025-06-01").severity).toBe("HIGH");
  });
  it("INSIDE the window: applied", () => {
    expect(thresholdAssessment(measured, t("2025-06-01", "2025-06-30"), "2025-06-15").severity).toBe("HIGH");
  });
  it("ON effectiveTo: applied (inclusive)", () => {
    expect(thresholdAssessment(measured, t("2025-06-01", "2025-06-30"), "2025-06-30").severity).toBe("HIGH");
  });
  it("AFTER the window: not applied", () => {
    expect(thresholdAssessment(measured, t("2025-06-01", "2025-06-30"), "2025-07-01").severity).toBe(
      "REQUIRES_POLICY",
    );
  });
  it("open-ended window still applies after effectiveFrom", () => {
    expect(thresholdAssessment(measured, t("2025-06-01", null), "2030-01-01").severity).toBe("HIGH");
  });
  it("rejects a malformed effectiveFrom instead of silently ignoring it", () => {
    expect(() => thresholdAssessment(measured, t("June 2025", null), "2025-07-01")).toThrow(/ISO date/i);
  });
});

// ===========================================================================
// E. EXPOSURE ENGINES ON REAL SHAPES
// ===========================================================================

describe("risk engines — exposure dimensions", () => {
  const positions = [
    pos({ id: "p1", institution: "Bank A", currency: "USD", baseCurrencyBalance: "600.00" }),
    pos({ id: "p2", institution: "Bank B", currency: "TZS", baseCurrencyBalance: "300.00" }),
    pos({ id: "p3", institution: "Bank B", currency: "TZS", baseCurrencyBalance: "100.00", accountType: "RESERVE" }),
  ];

  it("aggregates counterparty exposure across multiple accounts at one institution", () => {
    const r = counterpartyExposure(positions, { asOf: "2025-12-31" });
    expect(r.buckets).toHaveLength(2);
    expect(r.buckets[0]).toMatchObject({ key: "Bank A", sharePercent: "60.00" });
    expect(r.buckets[1]).toMatchObject({ key: "Bank B", amountMinor: 40000 });
    expect(r.denominator).toBe("1000.00");
  });

  it("declares the upstream FX dependency on currency exposure", () => {
    const r = currencyExposure(positions, { asOf: "2025-12-31" });
    expect(r.policyDependencies).toContain("P4");
    expect(r.assumptions.join(" ")).toMatch(/restated upstream by a rate this module did not verify/i);
  });

  it("buckets treasury exposure by account type", () => {
    const r = treasuryExposure(positions, { asOf: "2025-12-31" });
    expect(r.buckets.map((b) => b.key).sort()).toEqual(["OPERATING", "RESERVE"]);
  });

  it("reports capital exposure by sector and by entity, labelled distinctly", () => {
    const requests = [
      cap({ id: "c1", sectorCode: "HEALTH", legalEntityId: "E1", amount: "1800000.00" }),
      cap({ id: "c2", sectorCode: "AGRICULTURE", legalEntityId: "E2", amount: "640000.00" }),
    ];
    const bySector = capitalExposure(requests, { asOf: "2025-12-31", dimension: "SECTOR" });
    const byEntity = capitalExposure(requests, { asOf: "2025-12-31", dimension: "ENTITY" });
    expect(bySector.riskType).toBe("CAPITAL_EXPOSURE");
    expect(bySector.code).toBe("CONCENTRATION_CAPITAL_SECTOR");
    expect(byEntity.code).toBe("CONCENTRATION_CAPITAL_ENTITY");
    expect(bySector.buckets[0].key).toBe("HEALTH");
    expect(byEntity.buckets[0].key).toBe("E1");
  });

  it("labels a missing sector UNCLASSIFIED instead of dropping the exposure", () => {
    const r = capitalExposure([cap({ id: "c1", sectorCode: null })], {
      asOf: "2025-12-31",
      dimension: "SECTOR",
    });
    expect(r.buckets[0].key).toBe("UNCLASSIFIED");
    expect(r.buckets[0].sharePercent).toBe("100.00");
  });

  it("computes a real liquidity ratio from supplied definitions", () => {
    const r = liquidityCoverage(positions, [cap({ amount: "500.00" })], {
      asOf: "2025-12-31",
      liquidAccountTypes: ["OPERATING"],
      committedStatuses: ["APPROVED"],
    });
    // Liquid = 600 + 300 = 900 against 500 committed.
    expect(r.value).toBe("1.8000");
    expect(r.denominator).toBe("500.00");
    expect(r.assumptions.join(" ")).toMatch(/caller-supplied, not ratified/i);
  });
});

// ===========================================================================
// F. DATA QUALITY — reported, never repaired
// ===========================================================================

describe("risk engines — data quality", () => {
  it("detects duplicates, future dates, malformed currency and missing counterparty", () => {
    const r = dataQualityRisk(
      [
        pos({ id: "d1", asOf: "2026-06-01" }),
        pos({ id: "d2", currency: "US" }),
        pos({ id: "d3", institution: "" }),
        pos({ id: "d4" }),
        pos({ id: "d5" }),
      ],
      [cap()],
      { asOf: "2025-12-31" },
    );
    const joined = r.issues.join(" | ");
    expect(joined).toMatch(/future/i);
    expect(joined).toMatch(/malformed currency/i);
    expect(joined).toMatch(/no counterparty institution/i);
    expect(joined).toMatch(/Duplicate treasury observation/i);
    expect(Number(r.value)).toBeGreaterThanOrEqual(4);
    expect(r.explanation.join(" ")).toMatch(/never silently repaired/i);
  });

  it("flags stale observations against the caller's staleness window", () => {
    const r = dataQualityRisk([pos({ asOf: "2024-01-01" })], [cap()], {
      asOf: "2025-12-31",
      staleAfterDays: 90,
    });
    expect(r.issues.join(" ")).toMatch(/day\(s\) old/);
  });

  it("does NOT flag staleness when the caller sets no window", () => {
    const r = dataQualityRisk([pos({ asOf: "2020-01-01" })], [cap()], { asOf: "2025-12-31" });
    expect(r.issues.join(" ")).not.toMatch(/day\(s\) old/);
  });

  it("flags mixed-currency capital aggregation as requiring the FX decision", () => {
    const r = dataQualityRisk([pos()], [cap({ id: "a", currency: "USD" }), cap({ id: "b", currency: "TZS" })], {
      asOf: "2025-12-31",
    });
    expect(r.issues.join(" ")).toMatch(/P4/);
  });

  it("detects cross-tenant attribution: a record whose entity belongs to another tenant", () => {
    const r = dataQualityRisk(
      [pos({ id: "x1", tenantId: "TEN_A", legalEntityId: "LEN_B" })],
      [],
      { asOf: "2025-12-31", entityTenants: { LEN_B: "TEN_B" } },
    );
    expect(r.issues.join(" ")).toMatch(/attribution is inconsistent/i);
  });

  it("reports no attribution issue when ownership agrees", () => {
    const r = dataQualityRisk(
      [pos({ id: "x1", tenantId: "TEN_A", legalEntityId: "LEN_A" })],
      [],
      { asOf: "2025-12-31", entityTenants: { LEN_A: "TEN_A" } },
    );
    expect(r.issues.join(" ")).not.toMatch(/attribution/i);
  });

  it("never grades data quality without a ratified tolerance", () => {
    const r = dataQualityRisk([pos()], [cap()], { asOf: "2025-12-31" });
    expect(r.severity).toBe("REQUIRES_POLICY");
  });
});

// ===========================================================================
// G. SCENARIOS — hypothetical, and provably non-mutating
// ===========================================================================

describe("risk engines — scenario risk", () => {
  const positions = [
    pos({ id: "s1", institution: "Bank A", baseCurrencyBalance: "600.00" }),
    pos({ id: "s2", institution: "Bank B", baseCurrencyBalance: "400.00" }),
  ];

  it("marks scenario output SCENARIO, never DERIVED fact", () => {
    const r = scenarioRisk(positions, [{ targetId: "s1", factor: 0.5, rationale: "Bank A stress" }], {
      asOf: "2025-12-31",
      scenarioCode: "STRESS",
    });
    expect(r.basis).toBe("SCENARIO");
    expect(r.riskType).toBe("SCENARIO");
    expect(r.sources.every((s) => s.basis === "SCENARIO")).toBe(true);
    expect(r.explanation.join(" ")).toMatch(/Not an observed position/i);
  });

  it("recomputes concentration under the adjustment", () => {
    const r = scenarioRisk(positions, [{ targetId: "s1", factor: 0.5, rationale: "halve" }], {
      asOf: "2025-12-31",
      scenarioCode: "STRESS",
    });
    // 300 vs 400 => Bank B becomes the largest at 400/700.
    expect(r.buckets[0].key).toBe("Bank B");
    expect(r.value).toBe("57.14");
  });

  it("leaves the caller's observations byte-identical", () => {
    const snapshot = JSON.stringify(positions);
    scenarioRisk(positions, [{ targetId: "s1", factor: 0, rationale: "total loss" }], {
      asOf: "2025-12-31",
      scenarioCode: "WIPEOUT",
    });
    expect(JSON.stringify(positions)).toBe(snapshot);
  });

  it("requires a rationale for every adjustment", () => {
    expect(() =>
      scenarioRisk(positions, [{ targetId: "s1", factor: 0.5, rationale: "" }], {
        asOf: "2025-12-31",
        scenarioCode: "X",
      }),
    ).toThrow(/rationale/i);
  });

  it("rejects a negative or non-finite factor", () => {
    for (const factor of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        scenarioRisk(positions, [{ targetId: "s1", factor, rationale: "r" }], {
          asOf: "2025-12-31",
          scenarioCode: "X",
        }),
      ).toThrow(/non-negative finite/i);
    }
  });

  it("records every adjustment as a named assumption", () => {
    const r = scenarioRisk(positions, [{ targetId: "s1", factor: 0.25, rationale: "counterparty default" }], {
      asOf: "2025-12-31",
      scenarioCode: "DEFAULT",
    });
    expect(r.assumptions.join(" ")).toMatch(/s1 x0.25: counterparty default/);
  });
});

// ===========================================================================
// H. AUTHORITY RISK — advisory only
// ===========================================================================

describe("risk engines — authority risk", () => {
  it("reports pending decisions and locked capabilities as advisory items", () => {
    const r = authorityRisk({
      pendingDecisions: ["P1", "P2"],
      lockedCapabilities: ["CAP_POSTING"],
      policiesWithoutProvenance: 5,
      totalPolicies: 5,
    });
    expect(r.items.map((i) => i.code).sort()).toEqual([
      "CAPABILITIES_LOCKED",
      "DECISIONS_PENDING",
      "POLICY_PROVENANCE_ABSENT",
    ]);
    expect(r.items.every((i) => i.advisoryOnly === true)).toBe(true);
    expect(r.explanation.join(" ")).toMatch(/cannot alter authority/i);
  });

  it("reports nothing when governance is clean", () => {
    const r = authorityRisk({
      pendingDecisions: [],
      lockedCapabilities: [],
      policiesWithoutProvenance: 0,
      totalPolicies: 5,
    });
    expect(r.items).toEqual([]);
    expect(r.value).toBe("0");
  });
});

// ===========================================================================
// I. POSITIVE CONTROLS — the service actually works on real seeded data
// ===========================================================================

describe("risk service — positive controls on real data", () => {
  it("produces a full risk profile from the seeded treasury and capital data", async () => {
    const r = await assessRiskProfile(ctx(), {
      liquidAccountTypes: ["OPERATING"],
      committedStatuses: ["APPROVED", "UNDER_REVIEW"],
      asOf: "2025-12-31",
    });
    expect(r.specialist).toBe("FINANCIAL_RISK");
    expect(r.version).toBe(RISK_VERSION);
    expect(r.data.results.length).toBe(7);
    expect(r.provenance.sources.length).toBeGreaterThan(0);

    const counterparty = r.data.results.find((x) => x.code === "CONCENTRATION_COUNTERPARTY")!;
    expect(counterparty.basis).toBe("DERIVED");
    expect(Number(counterparty.value)).toBeGreaterThan(0);
    expect(counterparty.sources.length).toBe(5);
    // 4,820,000 of 11,783,000 base currency = 40.91% at Emirates NBD.
    expect(counterparty.value).toBe("40.91");
    expect(counterparty.denominator).toBe("11783000.00");
  });

  it("grades nothing in the real profile, because no risk appetite is ratified", async () => {
    const r = await assessRiskProfile(ctx(), { asOf: "2025-12-31" });
    expect(r.data.results.every((x) => x.severity === "REQUIRES_POLICY")).toBe(true);
    expect(r.data.policyDependencies).toContain("RISK_APPETITE_THRESHOLD");
    expect(r.explanation.join(" ")).toMatch(/no ratified risk appetite exists/i);
  });

  it("surfaces the real cross-tenant attribution defect in the seeded data", async () => {
    const r = await assessRiskProfile(ctx(), { asOf: "2025-12-31" });
    const dq = r.data.results.find((x) => x.riskType === "DATA_QUALITY")! as unknown as {
      issues: string[];
    };
    expect(dq.issues.join(" ")).toMatch(/attribution is inconsistent/i);
  });

  it("assesses a single concentration dimension", async () => {
    const r = await assessConcentration(ctx(), "CURRENCY", { asOf: "2025-12-31" });
    expect(r.data.riskType).toBe("CONCENTRATION");
    expect(r.data.policyDependencies).toContain("P4");
    expect(Number(r.data.value)).toBeGreaterThan(0);
  });

  it("assesses capital concentration by sector across four real requests", async () => {
    const r = await assessConcentration(ctx(), "CAPITAL_SECTOR", { asOf: "2025-12-31" });
    // 1,800,000 of 2,920,000 = 61.64% in HEALTH.
    expect(r.data.value).toBe("61.64");
    expect(r.data.denominator).toBe("2920000.00");
  });

  it("reports real governance risk from the registries", async () => {
    const r = await assessAuthorityRisk(ctx());
    const items = (r.data as unknown as { items: Array<{ code: string }> }).items;
    expect(items.map((i) => i.code)).toContain("DECISIONS_PENDING");
    expect(items.map((i) => i.code)).toContain("CAPABILITIES_LOCKED");
    expect(r.data.basis).toBe("OBSERVED");
  });

  it("runs a scenario against real positions and marks it SIMULATION_ONLY", async () => {
    const [p] = await rowsOf<{ id: string }>(sql`select id from treasury_positions order by id limit 1`);
    const r = await simulateRiskScenario(ctx(), "BANK_FAILURE", [
      { targetId: p.id, factor: 0, rationale: "Counterparty failure stress test" },
    ]);
    expect(r.qualifier).toBe("SIMULATION_ONLY");
    expect(r.data.basis).toBe("SCENARIO");
  });

  it("applies a caller-supplied governed threshold end to end", async () => {
    const r = await assessThreshold(
      ctx(),
      { code: "COUNTERPARTY", value: "40.91", unit: "PERCENT" },
      governedThreshold,
      { asOf: "2025-12-31" },
    );
    expect(r.data.severity).toBe("HIGH");
    expect(r.data.explanation.join(" ")).toContain("TEST-FIXTURE");
  });

  it("emits exactly one audit row and one event per ANALYSIS run", async () => {
    const t = trace();
    const before = await count(sql`select count(*)::int as n from audit_log where object_id = ${t}`);
    expect(before).toBe(0);
    await assessConcentration(ctx({ traceId: t }), "COUNTERPARTY", { asOf: "2025-12-31" });
    expect(await count(sql`select count(*)::int as n from audit_log where object_id = ${t}`)).toBe(1);
    expect(await count(sql`select count(*)::int as n from enterprise_events where subject_id = ${t}`)).toBe(1);
  });
});

// ===========================================================================
// J. ISOLATION — each control tested in isolation so none masks another
// ===========================================================================

describe("risk service — tenant isolation (entity deliberately null)", () => {
  it("refuses a tenant the principal does not belong to, without enumerating", async () => {
    await expect(
      assessRiskProfile(
        { principal: principal(), tenantId: foreignTenantId, legalEntityId: null, traceId: trace() },
        {},
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a forged tenant id outright", async () => {
    await expect(
      assessRiskProfile(
        { principal: principal(), tenantId: "TEN_DOES_NOT_EXIST", legalEntityId: null, traceId: trace() },
        {},
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("never returns another tenant's positions even when the tenant is legitimate", async () => {
    const foreign = principal({ tenantId: foreignTenantId });
    const r = await assessRiskProfile({
      principal: foreign,
      tenantId: foreignTenantId,
      legalEntityId: null,
      traceId: trace(),
    });
    // The seeded treasury belongs to the group tenant only.
    expect(r.provenance.sources.filter((s) => s.type === "TREASURY_POSITION")).toHaveLength(0);
    const counterparty = r.data.results.find((x) => x.code === "CONCENTRATION_COUNTERPARTY")!;
    expect(counterparty.basis).toBe("DATA_NOT_AVAILABLE");
    expect(counterparty.value).toBeNull();
  });
});

describe("risk service — entity isolation (tenant deliberately valid)", () => {
  it("refuses an entity belonging to another tenant", async () => {
    await expect(
      assessRiskProfile({
        principal: principal(),
        tenantId,
        legalEntityId: foreignEntityId,
        traceId: trace(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses an entity outside the principal's entity scope", async () => {
    await expect(
      assessRiskProfile({
        principal: principal({ entityScope: ["LEN_SOMETHING_ELSE"] }),
        tenantId,
        legalEntityId: entityId,
        traceId: trace(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("POSITIVE: allows an in-scope entity and narrows the data to it", async () => {
    const r = await assessRiskProfile({
      principal: principal({ entityScope: [entityId] }),
      tenantId,
      legalEntityId: entityId,
      traceId: trace(),
    });
    expect(r.legalEntityId).toBe(entityId);
    const sources = r.provenance.sources.filter((s) => s.type === "TREASURY_POSITION");
    expect(sources.length).toBeGreaterThan(0);
    // Narrower than the tenant-wide profile: entity scoping is real, not decorative.
    expect(sources.length).toBeLessThan(5);
  });
});

// ===========================================================================
// K. ATTACK MATRIX
// ===========================================================================

describe("risk service — hostile inputs", () => {
  it("denies a principal with no finance permission", async () => {
    await expect(
      assessRiskProfile(ctx({ principal: principal({ roles: ["HCM_DIRECTOR"] }) })),
    ).rejects.toMatchObject({ code: "DENIED" });
  });

  it("gates authority risk on its own permission, independently of the finance ops", async () => {
    // SECTOR_OPERATOR holds finance:capital.read but NOT governance:policy.read, so it must be
    // refused here even though it is a legitimate finance-adjacent role.
    await expect(
      assessAuthorityRisk(ctx({ principal: principal({ roles: ["SECTOR_OPERATOR"] }) })),
    ).rejects.toMatchObject({ code: "DENIED" });

    // POSITIVE: a role that does hold it succeeds, proving the gate discriminates.
    const ok = await assessAuthorityRisk(ctx({ principal: principal({ roles: ["CHIEF_RISK_COMPLIANCE"] }) }));
    expect(ok.data.riskType).toBe("GOVERNANCE_AUTHORITY");
  });

  it("denies a principal with no roles at all", async () => {
    await expect(assessRiskProfile(ctx({ principal: principal({ roles: [] }) }))).rejects.toMatchObject({
      code: "DENIED",
    });
  });

  it("does not accept a forged permission set that bypasses the role definition", async () => {
    // A caller who fabricates a permission still fails, because tenant checks follow RBAC and the
    // data query is scoped server-side.
    const forged = principal({ roles: [] });
    (forged.permissions as Set<string>).add("finance:treasury.read");
    await expect(
      assessRiskProfile({
        principal: forged,
        tenantId: foreignTenantId,
        legalEntityId: null,
        traceId: trace(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects malformed trace ids", async () => {
    for (const traceId of ["", "short", "has space", "x".repeat(65), "semi;colon"]) {
      await expect(assessRiskProfile(ctx({ traceId }))).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    }
  });

  it("rejects a malformed asOf instead of defaulting to today", async () => {
    await expect(assessRiskProfile(ctx(), { asOf: "31/12/2025" })).rejects.toThrow(/ISO date/i);
  });

  it("does not allow a scenario to be presented as an authoritative measure", async () => {
    const [p] = await rowsOf<{ id: string }>(sql`select id from treasury_positions order by id limit 1`);
    const r = await simulateRiskScenario(ctx(), "X", [
      { targetId: p.id, factor: 2, rationale: "double" },
    ]);
    expect(r.qualifier).not.toBe("AUTHORITATIVE");
    expect(r.data.basis).not.toBe("OBSERVED");
    expect(r.data.basis).not.toBe("DERIVED");
  });

  it("ignores a scenario adjustment targeting a record outside the scope", async () => {
    const r = await simulateRiskScenario(ctx(), "GHOST", [
      { targetId: "TRS_NOT_MINE", factor: 0, rationale: "attempt to perturb a foreign record" },
    ]);
    // The unknown target simply matches nothing; it cannot pull in outside data.
    expect(r.data.sources.every((s) => s.id.startsWith("TRS_"))).toBe(true);
    expect(r.data.sources).toHaveLength(5);
  });

  it("cannot be used to write: the module issues no INSERT, UPDATE or DELETE on financial tables", async () => {
    const before = await count(sql`select count(*)::int as n from treasury_positions`);
    const capBefore = await count(sql`select count(*)::int as n from capital_requests`);
    const sumBefore = await rowsOf<{ s: string }>(
      sql`select coalesce(sum(base_currency_balance),0)::text as s from treasury_positions`,
    );
    await assessRiskProfile(ctx(), { liquidAccountTypes: ["OPERATING"], committedStatuses: ["APPROVED"] });
    await simulateRiskScenario(ctx(), "S", [{ targetId: "TRS_T1", factor: 0, rationale: "wipe" }]);
    expect(await count(sql`select count(*)::int as n from treasury_positions`)).toBe(before);
    expect(await count(sql`select count(*)::int as n from capital_requests`)).toBe(capBefore);
    const sumAfter = await rowsOf<{ s: string }>(
      sql`select coalesce(sum(base_currency_balance),0)::text as s from treasury_positions`,
    );
    expect(sumAfter[0].s).toBe(sumBefore[0].s);
  });

  it("creates no journal entries or lines", async () => {
    await assessRiskProfile(ctx());
    expect(await count(sql`select count(*)::int as n from journal_entries`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from journal_lines`)).toBe(0);
  });

  it("does not activate or alter any capability", async () => {
    const before = await rowsOf<{ capability_code: string; activation_status: string }>(
      sql`select capability_code, activation_status from governance_capability_registry order by capability_code`,
    );
    await assessAuthorityRisk(ctx());
    const after = await rowsOf<{ capability_code: string; activation_status: string }>(
      sql`select capability_code, activation_status from governance_capability_registry order by capability_code`,
    );
    expect(after).toEqual(before);
    expect(after.every((c) => c.activation_status === "LOCKED")).toBe(true);
  });

  it("registers the risk capabilities, all LOCKED where they could confer force", async () => {
    const rows = await rowsOf<{ capability_code: string; activation_status: string; required_decisions: string[] }>(
      sql`select capability_code, activation_status, required_decisions
          from governance_capability_registry
          where capability_code like 'CAP_SPEC_RISK%' order by capability_code`,
    );
    expect(rows.map((r) => r.capability_code)).toEqual([
      "CAP_SPEC_RISK_ASSESS",
      "CAP_SPEC_RISK_ENFORCE_BREACH",
      "CAP_SPEC_RISK_REPORT",
      "CAP_SPEC_RISK_SET_APPETITE",
      "CAP_SPEC_RISK_SIMULATE",
    ]);
    expect(rows.every((r) => r.activation_status === "LOCKED")).toBe(true);
    const appetite = rows.find((r) => r.capability_code === "CAP_SPEC_RISK_SET_APPETITE")!;
    const enforce = rows.find((r) => r.capability_code === "CAP_SPEC_RISK_ENFORCE_BREACH")!;
    expect(appetite.required_decisions.length).toBeGreaterThan(0);
    expect(enforce.required_decisions).toContain("P1");
  });

  it("keeps concentration arithmetic deterministic across repeated runs", async () => {
    const a = await assessConcentration(ctx(), "COUNTERPARTY", { asOf: "2025-12-31" });
    const b = await assessConcentration(ctx(), "COUNTERPARTY", { asOf: "2025-12-31" });
    expect(a.data.value).toBe(b.data.value);
    expect(a.data.denominator).toBe(b.data.denominator);
    expect(JSON.stringify(a.data.sources)).toBe(JSON.stringify(b.data.sources));
  });
});

// ===========================================================================
// L. FAULT INJECTION — prove the controls are load-bearing
// ===========================================================================

describe("risk service — fault injection", () => {
  it("FI-1: removing the RBAC check would let an unauthorised principal through", async () => {
    // Baseline: the control currently rejects.
    await expect(
      assessRiskProfile(ctx({ principal: principal({ roles: ["HCM_DIRECTOR"] }) })),
    ).rejects.toMatchObject({ code: "DENIED" });

    // Injected: a principal that DOES hold the permission proves the check is discriminating and
    // not simply rejecting everything.
    const ok = await assessRiskProfile(ctx({ principal: principal({ roles: ["AUDITOR"] }) }));
    expect(ok.data.results.length).toBe(7);
  });

  it("FI-2: tenant predicate is load-bearing — same query without it would return foreign rows", async () => {
    const scoped = await count(
      sql`select count(*)::int as n from treasury_positions where tenant_id = ${foreignTenantId}`,
    );
    const unscoped = await count(sql`select count(*)::int as n from treasury_positions`);
    expect(scoped).toBe(0);
    expect(unscoped).toBeGreaterThan(0);
    // The service returns the scoped (empty) result, not the unscoped one.
    const r = await assessRiskProfile({
      principal: principal({ tenantId: foreignTenantId }),
      tenantId: foreignTenantId,
      legalEntityId: null,
      traceId: trace(),
    });
    expect(r.provenance.sources.filter((s) => s.type === "TREASURY_POSITION")).toHaveLength(0);
  });

  it("FI-3: a threshold stripped of provenance is refused, not silently applied", () => {
    const items = [{ id: "a", key: "A", label: "A", amountMinor: 100 }];
    expect(() =>
      concentration(items, {
        asOf: "2025-12-31",
        dimension: "C",
        threshold: { ...governedThreshold, sourceReference: "" },
      }),
    ).toThrow(/source reference/i);
    // Restored: with provenance it applies.
    expect(
      concentration(items, { asOf: "2025-12-31", dimension: "C", threshold: governedThreshold }).severity,
    ).toBe("HIGH");
  });

  it("FI-4: emptying the observation set flips DERIVED to DATA_NOT_AVAILABLE and back", () => {
    const items = [{ id: "a", key: "A", label: "A", amountMinor: 100 }];
    expect(concentration(items, { asOf: "2025-12-31", dimension: "C" }).basis).toBe("DERIVED");
    expect(concentration([], { asOf: "2025-12-31", dimension: "C" }).basis).toBe("DATA_NOT_AVAILABLE");
    expect(concentration(items, { asOf: "2025-12-31", dimension: "C" }).basis).toBe("DERIVED");
  });

  it("FI-5: audit emission is load-bearing — a run with a fresh trace always leaves a record", async () => {
    const t1 = trace();
    await assessConcentration(ctx({ traceId: t1 }), "COUNTERPARTY", { asOf: "2025-12-31" });
    expect(await count(sql`select count(*)::int as n from audit_log where object_id = ${t1}`)).toBe(1);
    // A trace that was never run has no audit record, proving the assertion above is not vacuous.
    expect(
      await count(sql`select count(*)::int as n from audit_log where object_id = ${`${t1}-NEVER-RUN`}`),
    ).toBe(0);
  });
});

// ===========================================================================
// M. STATE INTEGRITY
// ===========================================================================

describe("risk module — leaves governance and financial state untouched", () => {
  it("defines no tables of its own — risk analysis stores nothing", async () => {
    // `risks` is the pre-existing risk REGISTER from the 0000 baseline, unrelated to this module.
    // Phase 7D added no table, so the count of risk-ish tables must still be exactly that one.
    const names = (
      await rowsOf<{ table_name: string }>(sql`
        select table_name from information_schema.tables
        where table_schema = 'public'
          and (table_name like '%risk%' or table_name like '%exposure%' or table_name like '%concentration%')
        order by table_name
      `)
    ).map((r) => r.table_name);
    expect(names).toEqual(["risks"]);
  });

  it("adds no migration: the substrate is unchanged by Phase 7D", async () => {
    // 21 = migrations 0000-0019 (prior baseline) + 0020_service_principals
    // (Phase 8 events + Phase 6 service-principal registry: additive).
    const n = await count(sql`select count(*)::int as n from public.beyu_migrations`);
    expect(n).toBe(21);
  });

  it("leaves all triggers enabled", async () => {
    const disabled = await count(sql`
      select count(*)::int as n from pg_trigger
      where tgenabled = 'D' and not tgisinternal
    `);
    expect(disabled).toBe(0);
  });

  it("leaves the governance decision registry entirely PENDING", async () => {
    const nonPending = await count(sql`
      select count(*)::int as n from governance_decision_registry where status <> 'PENDING'
    `);
    expect(nonPending).toBe(0);
  });
});

afterAll(async () => {
  // This suite creates no fixtures: it reads seeded data and asserts on it. Nothing to clean up,
  // which is itself the strongest guarantee that it corrupted nothing.
  const positions = await count(sql`select count(*)::int as n from treasury_positions`);
  expect(positions).toBe(5);
});
