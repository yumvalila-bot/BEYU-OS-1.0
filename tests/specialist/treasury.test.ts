/**
 * Phase 7F — Treasury Intelligence.
 *
 * The failure this suite prevents is a treasury module that produces a comforting number it cannot
 * justify. Five assertions matter above all:
 *
 *   1. Absent data returns DATA_NOT_AVAILABLE, never a fabricated zero balance.
 *   2. No maturity profile and no available-vs-restricted split are ever produced: the substrate
 *      has neither, and `classification` is a SECURITY marker, not restricted cash.
 *   3. HIGHLY_RESTRICTED positions are withheld from RESTRICTED-clearance callers, and the total
 *      says so rather than silently under-reporting.
 *   4. The inconsistent implied FX rates in the seeded data are surfaced, never averaged away.
 *   5. Attribution divergence is reported for governance, never repaired.
 *
 * Positive controls assert on specific known values from the real 5-row substrate, so an empty
 * result can never pass as success.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ROLES, ROLE_CLEARANCE } from "@/lib/constants";
import type { Principal } from "@/lib/authz";
import { SpecialistError, type SpecialistContext } from "@/lib/specialist/platform";
import {
  TREASURY_VERSION,
  attributionConsistency,
  bandTreasuryThreshold,
  cashPosition,
  liquidityCoverage,
  maturityProfile,
  treasuryConcentration,
  treasuryDataQuality,
  treasuryScenario,
} from "@/lib/specialist/treasury/engines";
import {
  analyzeCash,
  analyzeConcentration,
  analyzeLiquidity,
  analyzeMaturity,
  assessTreasuryDataQuality,
  generateTreasuryReport,
  readPositions,
  runTreasuryScenario,
} from "@/lib/specialist/treasury/service";
import type { TreasuryPositionView, TreasuryThreshold } from "@/lib/specialist/treasury/model";

const RUN = `TR${Date.now()}`;
let n = 0;
const trace = () => `${RUN}-${String(++n).padStart(3, "0")}`;

let tenantId = "";
let foreignTenantId = "";
let foreignEntityId = "";
/** An entity genuinely owned by the positions' tenant AND holding positions. */
let ownedEntityId = "";
let ownedEntityPositionCount = 0;

const ASOF = "2026-02-15";

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
  let clearance: string = "PUBLIC";
  const rank = (c: string) => ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"].indexOf(c);
  for (const role of roles) {
    const c = (ROLE_CLEARANCE as Record<string, string>)[role] ?? "INTERNAL";
    if (rank(c) > rank(clearance)) clearance = c;
  }
  return {
    userId: "USR_TREASURY_TEST",
    partyId: "p",
    email: "treasury@example.test",
    displayName: "Treasury Test",
    tenantId,
    tenantCode: "BEYU",
    tenantType: "ENTERPRISE",
    roles,
    permissions,
    clearance,
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

/** SYNTHETIC engine fixture. Clearly not production data. */
const pos = (over: Partial<TreasuryPositionView> = {}): TreasuryPositionView => ({
  id: "TRS_SYN",
  tenantId: "TEN_SYN",
  legalEntityId: "LEN_SYN",
  institution: "Synthetic Bank",
  accountLabel: "Synthetic account",
  accountType: "OPERATING",
  currency: "USD",
  balance: "100.00",
  baseCurrencyBalance: "100.00",
  asOf: "2025-12-31",
  securityClassification: "RESTRICTED",
  basis: "OBSERVED",
  ...over,
});

const governedLimit: TreasuryThreshold = {
  code: "TEST_TREASURY_LIMIT",
  value: 30,
  unit: "PERCENT",
  sourceReference: "TEST-FIXTURE (not a BEYU policy)",
  effectiveFrom: "2020-01-01",
  effectiveTo: null,
};

/** Suite-level fingerprint, captured before any service call. Guards against the 7E FI-8 trap. */
const TREASURY_FINGERPRINT_SQL = sql`
  select id, tenant_id, legal_entity_id, institution, account_type, currency,
         balance::text as bal, base_currency_balance::text as base,
         as_of::text as asof, classification::text as cls
    from treasury_positions order by id
`;
let treasuryFingerprintBefore = "";

beforeAll(async () => {
  treasuryFingerprintBefore = JSON.stringify(await rowsOf(TREASURY_FINGERPRINT_SQL));
  expect(treasuryFingerprintBefore.length).toBeGreaterThan(100);

  const [t] = await rowsOf<{ tenant_id: string }>(
    sql`select tenant_id from treasury_positions order by id limit 1`,
  );
  tenantId = t.tenant_id;

  const [f] = await rowsOf<{ id: string; tenant_id: string }>(
    sql`select id, tenant_id from legal_entities where tenant_id <> ${tenantId} order by id limit 1`,
  );
  foreignEntityId = f.id;
  foreignTenantId = f.tenant_id;

  // Must be owned by this tenant, hold positions, AND those positions must be readable at the
  // default test clearance (RESTRICTED). Without the classification filter this resolves to
  // LEN_BEYU_FAMILY_TRUST, whose sole position is HIGHLY_RESTRICTED, and the "positive" control
  // would assert on an empty result — exactly the vacuity trap §10 warns about.
  const [owned] = await rowsOf<{ id: string; n: number }>(
    sql`select e.id, count(p.id)::int as n
        from legal_entities e
        join treasury_positions p on p.legal_entity_id = e.id and p.tenant_id = ${tenantId}
        where e.tenant_id = ${tenantId}
          and p.classification <> 'HIGHLY_RESTRICTED'
        group by e.id order by n desc, e.id limit 1`,
  );
  ownedEntityId = owned.id;
  ownedEntityPositionCount = Number(owned.n);

  // §10/§16 non-vacuity preconditions.
  expect(await count(sql`select count(*)::int as n from treasury_positions where tenant_id = ${tenantId}`)).toBe(5);
  expect(ownedEntityPositionCount).toBeGreaterThan(0);
  expect(foreignTenantId).not.toBe(tenantId);
});

// ===========================================================================
// A. NO FABRICATED ZEROS
// ===========================================================================

describe("treasury engines — absent data never becomes zero", () => {
  it("returns DATA_NOT_AVAILABLE, not a zero cash position, when there are no positions", () => {
    const c = cashPosition([], { asOf: ASOF });
    expect(c.baseCurrencyTotal).toBeNull();
    expect(c.baseCurrencyTotalBasis).toBe("DATA_NOT_AVAILABLE");
    expect(c.byCurrency).toEqual([]);
    expect(c.explanation.join(" ")).toMatch(/would falsely assert that the entity holds no cash/i);
  });

  it("returns DATA_NOT_AVAILABLE for concentration with no positions", () => {
    const r = treasuryConcentration([], "COUNTERPARTY", { asOf: ASOF });
    expect(r.basis).toBe("DATA_NOT_AVAILABLE");
    expect(r.value).toBeNull();
  });

  it("returns DATA_NOT_AVAILABLE for liquidity with no positions", () => {
    const r = liquidityCoverage([], [], { asOf: ASOF, liquidAccountTypes: ["OPERATING"], committedStatuses: ["APPROVED"] });
    expect(r.basis).toBe("DATA_NOT_AVAILABLE");
    expect(r.value).toBeNull();
    expect(r.explanation.join(" ")).toMatch(/undefined, not zero/i);
  });

  it("will not assume which account types are liquid", () => {
    const r = liquidityCoverage([pos()], [{ id: "C1", amount: "50.00", currency: "USD", status: "APPROVED" }], {
      asOf: ASOF, liquidAccountTypes: [], committedStatuses: ["APPROVED"],
    });
    expect(r.basis).toBe("DATA_NOT_AVAILABLE");
    expect(r.policyDependencies).toContain("LIQUIDITY_DEFINITION");
    expect(r.explanation.join(" ")).toMatch(/will not assume it/i);
  });

  it("treats zero committed outflow as undefined coverage, not infinite", () => {
    const r = liquidityCoverage([pos()], [{ id: "C1", amount: "50.00", currency: "USD", status: "DRAFT" }], {
      asOf: ASOF, liquidAccountTypes: ["OPERATING"], committedStatuses: ["APPROVED"],
    });
    expect(r.value).toBeNull();
    expect(r.explanation.join(" ")).toMatch(/undefined rather than infinite/i);
  });

  it("data quality over an empty scope is DATA_NOT_AVAILABLE", () => {
    const q = treasuryDataQuality([], { asOf: ASOF });
    expect(q.basis).toBe("DATA_NOT_AVAILABLE");
    expect(q.positionsAssessed).toBe(0);
  });
});

// ===========================================================================
// B. THE TWO STRUCTURAL REFUSALS
// ===========================================================================

describe("treasury engines — refuses what the substrate cannot support", () => {
  it("never produces a maturity profile, and says why", () => {
    const m = maturityProfile([pos(), pos({ id: "B", accountType: "RESERVE" })]);
    expect(m.basis).toBe("DATA_NOT_AVAILABLE");
    expect(m.buckets).toBeNull();
    expect(m.missingInputs.length).toBeGreaterThan(0);
    expect(m.explanation.join(" ")).toMatch(/would be fabrication/i);
  });

  it("does NOT derive maturity from account type", () => {
    const m = maturityProfile([pos({ accountType: "RESERVE" })]);
    expect(JSON.stringify(m)).not.toMatch(/\b(30|60|90|180|365)\s*day/i);
    expect(m.explanation.join(" ")).toMatch(/describes purpose, not tenor/i);
  });

  it("never reports available cash, because no encumbrance data exists", () => {
    const c = cashPosition([pos()], { asOf: ASOF });
    expect(c.availableCash).toBeNull();
    expect(c.availableCashBasis).toBe("DATA_NOT_AVAILABLE");
  });

  it("CRITICAL: does not read the security classification as a cash restriction", () => {
    // Two positions, both marked RESTRICTED/HIGHLY_RESTRICTED for ACCESS CONTROL purposes.
    // Their balances must still be counted in full: they are not encumbered funds.
    const c = cashPosition(
      [
        pos({ id: "A", balance: "100.00", baseCurrencyBalance: "100.00", securityClassification: "RESTRICTED" }),
        pos({ id: "B", balance: "50.00", baseCurrencyBalance: "50.00", securityClassification: "HIGHLY_RESTRICTED" }),
      ],
      { asOf: ASOF },
    );
    expect(c.baseCurrencyTotal).toBe("150.00");
    expect(c.explanation.join(" ")).toMatch(/access-control marker, not a cash restriction/i);
  });

  it("flags that only one snapshot exists, so no trend is possible", () => {
    const q = treasuryDataQuality([pos({ id: "A" }), pos({ id: "B", institution: "Other" })], { asOf: ASOF });
    expect(q.findings.map((f) => f.code)).toContain("SINGLE_SNAPSHOT_ONLY");
  });

  it("records that maturity and encumbrance data are absent as explicit findings", () => {
    const q = treasuryDataQuality([pos()], { asOf: ASOF });
    expect(q.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(["NO_MATURITY_DATA", "NO_ENCUMBRANCE_DATA", "BASE_RESTATEMENT_UNVERIFIABLE"]),
    );
  });

  it("produces no composite data-quality score", () => {
    const q = treasuryDataQuality([pos()], { asOf: ASOF });
    expect(q.score).toBeNull();
    expect(q.scoreBasis).toBe("REQUIRES_POLICY");
    expect(q.explanation.join(" ")).toMatch(/scoring implies a ratified tolerance/i);
  });
});

// ===========================================================================
// C. SEVERITY REQUIRES A GOVERNED LIMIT
// ===========================================================================

describe("treasury engines — severity is never invented", () => {
  const two = [
    pos({ id: "A", institution: "Bank A", baseCurrencyBalance: "800.00" }),
    pos({ id: "B", institution: "Bank B", baseCurrencyBalance: "200.00" }),
  ];

  it("computes concentration but refuses to grade it without a limit", () => {
    const r = treasuryConcentration(two, "COUNTERPARTY", { asOf: ASOF });
    expect(r.value).toBe("80.00");
    expect(r.basis).toBe("DERIVED");
    expect(r.severity).toBe("REQUIRES_POLICY");
    expect(r.severityBasis).toMatch(/No ratified risk appetite|No ratified treasury limit/i);
  });

  /**
   * REGRESSION — fault injection FI-8 initially failed only ONE test, because no assertion covered
   * the ungraded severity of every measure across a whole report. A single narrow assertion is a
   * thin guard for the module's most consequential promise: that it never grades exposure without
   * a ratified limit.
   */
  it("grades NOTHING across an entire real report while no treasury limit is ratified", async () => {
    const r = await generateTreasuryReport(ctx(), { asOf: ASOF });
    expect(r.data.concentration).toHaveLength(4);
    expect(r.data.concentration.every((c) => c.severity === "REQUIRES_POLICY")).toBe(true);
    for (const c of r.data.concentration) {
      expect(c.severityBasis).toMatch(/No ratified/i);
    }
  });

  it("grades no engine output anywhere without a supplied limit", () => {
    const measures = [
      treasuryConcentration(two, "COUNTERPARTY", { asOf: ASOF }),
      treasuryConcentration(two, "CURRENCY", { asOf: ASOF }),
      treasuryConcentration(two, "ENTITY", { asOf: ASOF }),
      treasuryConcentration(two, "ACCOUNT_TYPE", { asOf: ASOF }),
      liquidityCoverage(two, [{ id: "C", amount: "100.00", currency: "USD", status: "APPROVED" }], {
        asOf: ASOF, liquidAccountTypes: ["OPERATING"], committedStatuses: ["APPROVED"],
      }),
    ];
    expect(measures.every((m) => m.severity === "REQUIRES_POLICY")).toBe(true);
  });

  it("grades only when a limit with provenance is supplied", () => {
    const r = treasuryConcentration(two, "COUNTERPARTY", { asOf: ASOF, threshold: governedLimit });
    expect(r.severity).toBe("HIGH");
    expect(r.severityBasis).toContain("TEST_TREASURY_LIMIT");
  });

  it("refuses a limit with no source reference", () => {
    expect(() => bandTreasuryThreshold(50, { ...governedLimit, sourceReference: "  " }, ASOF))
      .toThrow(/source reference/i);
    expect(() => treasuryConcentration(two, "COUNTERPARTY", { asOf: ASOF, threshold: { ...governedLimit, sourceReference: "" } }))
      .toThrow(/source reference/i);
  });

  it("treats a concentration limit as a CEILING and a liquidity limit as a FLOOR", () => {
    expect(bandTreasuryThreshold(50, governedLimit, ASOF, "MAX").severity).toBe("HIGH");
    expect(bandTreasuryThreshold(50, governedLimit, ASOF, "MIN").severity).toBe("LOW");
    expect(bandTreasuryThreshold(50, governedLimit, ASOF, "MAX").basis).toMatch(/ceiling/i);
    expect(bandTreasuryThreshold(50, governedLimit, ASOF, "MIN").basis).toMatch(/floor/i);
  });

  it("thin liquidity coverage breaches a floor; healthy coverage does not", () => {
    const floor: TreasuryThreshold = { ...governedLimit, code: "LIQ_MIN", value: 1.5, unit: "RATIO" };
    const thin = liquidityCoverage([pos({ baseCurrencyBalance: "100.00" })], [{ id: "C", amount: "200.00", currency: "USD", status: "APPROVED" }],
      { asOf: ASOF, liquidAccountTypes: ["OPERATING"], committedStatuses: ["APPROVED"], threshold: floor });
    expect(thin.value).toBe("0.5000");
    expect(thin.severity).toBe("HIGH");

    const healthy = liquidityCoverage([pos({ baseCurrencyBalance: "1000.00" })], [{ id: "C", amount: "200.00", currency: "USD", status: "APPROVED" }],
      { asOf: ASOF, liquidAccountTypes: ["OPERATING"], committedStatuses: ["APPROVED"], threshold: floor });
    expect(healthy.value).toBe("5.0000");
    expect(healthy.severity).toBe("LOW");
  });
});

// ===========================================================================
// D. TEMPORAL (§12)
// ===========================================================================

describe("treasury engines — temporal boundaries", () => {
  const t = (from: string, to: string | null): TreasuryThreshold => ({ ...governedLimit, effectiveFrom: from, effectiveTo: to });

  it("BEFORE the window: limit not applied", () => {
    expect(bandTreasuryThreshold(50, t("2026-06-01", "2026-06-30"), "2026-05-31").severity).toBe("REQUIRES_POLICY");
  });
  it("ON effectiveFrom: applied (inclusive)", () => {
    expect(bandTreasuryThreshold(50, t("2026-06-01", "2026-06-30"), "2026-06-01").severity).toBe("HIGH");
  });
  it("INSIDE the window: applied", () => {
    expect(bandTreasuryThreshold(50, t("2026-06-01", "2026-06-30"), "2026-06-15").severity).toBe("HIGH");
  });
  it("ON effectiveTo: applied (inclusive)", () => {
    expect(bandTreasuryThreshold(50, t("2026-06-01", "2026-06-30"), "2026-06-30").severity).toBe("HIGH");
  });
  it("AFTER the window: not applied", () => {
    expect(bandTreasuryThreshold(50, t("2026-06-01", "2026-06-30"), "2026-07-01").severity).toBe("REQUIRES_POLICY");
  });
  it("rejects a malformed effectiveFrom rather than ignoring it", () => {
    expect(() => bandTreasuryThreshold(50, t("June 2026", null), ASOF)).toThrow(/ISO date/i);
  });
  it("flags a future-dated position", () => {
    const q = treasuryDataQuality([pos({ asOf: "2027-01-01" })], { asOf: ASOF });
    expect(q.findings.map((f) => f.code)).toContain("FUTURE_DATED_POSITION");
  });
  it("flags a stale snapshot only when the caller sets a window", () => {
    expect(treasuryDataQuality([pos({ asOf: "2024-01-01" })], { asOf: ASOF, staleAfterDays: 90 }).findings.map((f) => f.code))
      .toContain("STALE_SNAPSHOT");
    expect(treasuryDataQuality([pos({ asOf: "2024-01-01" })], { asOf: ASOF }).findings.filter((f) => f.code === "STALE_SNAPSHOT"))
      .toHaveLength(0);
  });
  it("rejects a malformed asOf everywhere rather than defaulting", () => {
    expect(() => cashPosition([pos()], { asOf: "15/02/2026" })).toThrow(/ISO date/i);
    expect(() => treasuryConcentration([pos()], "CURRENCY", { asOf: "nope" })).toThrow(/ISO date/i);
    expect(() => treasuryDataQuality([pos()], { asOf: "nope" })).toThrow(/ISO date/i);
  });
});

// ===========================================================================
// E. FX VERIFICATION AND ATTRIBUTION (§11)
// ===========================================================================

describe("treasury engines — FX restatement and attribution", () => {
  it("detects inconsistent implied FX rates across same-currency positions", () => {
    const q = treasuryDataQuality(
      [
        pos({ id: "A", currency: "TZS", balance: "6120000000.00", baseCurrencyBalance: "2340000.00" }),
        pos({ id: "B", currency: "TZS", balance: "2870000000.00", baseCurrencyBalance: "1098000.00" }),
      ],
      { asOf: ASOF },
    );
    const f = q.findings.find((x) => x.code === "INCONSISTENT_IMPLIED_FX_RATE");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("GOVERNANCE");
    expect(f!.detail).toMatch(/must not be used as an FX source/i);
  });

  it("does NOT flag consistent implied rates", () => {
    const q = treasuryDataQuality(
      [
        pos({ id: "A", currency: "TZS", balance: "2000.00", baseCurrencyBalance: "1000.00" }),
        pos({ id: "B", currency: "TZS", balance: "4000.00", baseCurrencyBalance: "2000.00" }),
      ],
      { asOf: ASOF },
    );
    expect(q.findings.map((f) => f.code)).not.toContain("INCONSISTENT_IMPLIED_FX_RATE");
  });

  it("never emits a usable FX rate anywhere in its output", () => {
    const q = treasuryDataQuality(
      [pos({ id: "A", currency: "TZS", balance: "6120000000.00", baseCurrencyBalance: "2340000.00" })],
      { asOf: ASOF },
    );
    expect(JSON.stringify(q)).not.toMatch(/"(rate|fxRate|exchangeRate)"\s*:/);
  });

  it("flags attribution divergence as GOVERNANCE_REVIEW_REQUIRED without deciding ownership", () => {
    const a = attributionConsistency([pos({ id: "A", tenantId: "TEN_A", legalEntityId: "LEN_B" })], { LEN_B: "TEN_B" });
    expect(a[0].consistent).toBe(false);
    expect(a[0].basis).toBe("GOVERNANCE_REVIEW_REQUIRED");
    expect(a[0].owningTenantId).toBe("TEN_B");
    expect(a[0].claimedTenantId).toBe("TEN_A");
    expect(a[0].explanation).toMatch(/not decided here/i);
  });

  it("flags an orphaned entity reference as DATA_NOT_AVAILABLE, not as consistent", () => {
    const a = attributionConsistency([pos({ id: "A", legalEntityId: "LEN_GHOST" })], {});
    expect(a[0].consistent).toBe(false);
    expect(a[0].basis).toBe("DATA_NOT_AVAILABLE");
  });

  it("confirms consistency when ownership agrees", () => {
    const a = attributionConsistency([pos({ id: "A", tenantId: "TEN_A", legalEntityId: "LEN_A" })], { LEN_A: "TEN_A" });
    expect(a[0].consistent).toBe(true);
    expect(a[0].basis).toBe("OBSERVED");
  });

  it("detects duplicate, malformed-currency, missing-institution and negative-balance rows", () => {
    const q = treasuryDataQuality(
      [
        pos({ id: "A" }), pos({ id: "B" }),
        pos({ id: "C", currency: "US" }),
        pos({ id: "D", institution: "" }),
        pos({ id: "E", balance: "-5.00", institution: "Neg Bank" }),
      ],
      { asOf: ASOF },
    );
    expect(q.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(["DUPLICATE_POSITION", "MALFORMED_CURRENCY", "MISSING_INSTITUTION", "NEGATIVE_BALANCE"]),
    );
  });

  it("every finding is advisory-only", () => {
    const q = treasuryDataQuality([pos({ institution: "" })], { asOf: ASOF });
    expect(q.findings.every((f) => f.advisoryOnly === true)).toBe(true);
  });
});

// ===========================================================================
// F. SCENARIO IMMUTABILITY
// ===========================================================================

describe("treasury engines — scenarios never mutate source truth", () => {
  const positions = [
    pos({ id: "S1", institution: "Bank A", balance: "600.00", baseCurrencyBalance: "600.00" }),
    pos({ id: "S2", institution: "Bank B", balance: "400.00", baseCurrencyBalance: "400.00" }),
  ];

  it("marks output SCENARIO, never DERIVED fact", () => {
    const r = treasuryScenario(positions, [{ targetPositionId: "S1", factor: 0.5, rationale: "stress" }], { asOf: ASOF, scenarioCode: "STRESS" });
    expect(r.basis).toBe("SCENARIO");
    expect(r.sources.every((s) => s.basis === "SCENARIO")).toBe(true);
    expect(r.explanation.join(" ")).toMatch(/not a basis for any action/i);
  });

  it("leaves the caller's observations byte-identical", () => {
    const snapshot = JSON.stringify(positions);
    treasuryScenario(positions, [{ targetPositionId: "S1", factor: 0, rationale: "total loss" }], { asOf: ASOF, scenarioCode: "WIPE" });
    expect(JSON.stringify(positions)).toBe(snapshot);
  });

  it("recomputes concentration under the adjustment", () => {
    const r = treasuryScenario(positions, [{ targetPositionId: "S1", factor: 0.5, rationale: "halve" }], { asOf: ASOF, scenarioCode: "S" });
    // 300 vs 400 => Bank B leads at 400/700.
    expect(r.buckets[0].key).toBe("Bank B");
    expect(r.value).toBe("57.14");
  });

  it("requires a rationale, a code and a valid factor", () => {
    expect(() => treasuryScenario(positions, [{ targetPositionId: "S1", factor: 0.5, rationale: "" }], { asOf: ASOF, scenarioCode: "S" })).toThrow(/rationale/i);
    expect(() => treasuryScenario(positions, [], { asOf: ASOF, scenarioCode: "" })).toThrow(/scenario code/i);
    for (const factor of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => treasuryScenario(positions, [{ targetPositionId: "S1", factor, rationale: "r" }], { asOf: ASOF, scenarioCode: "S" })).toThrow(/non-negative finite/i);
    }
  });

  it("records each adjustment as a named assumption", () => {
    const r = treasuryScenario(positions, [{ targetPositionId: "S1", factor: 0.25, rationale: "counterparty default" }], { asOf: ASOF, scenarioCode: "D" });
    expect(r.assumptions.join(" ")).toMatch(/S1 x0.25: counterparty default/);
  });
});

// ===========================================================================
// G. POSITIVE CONTROLS ON REAL DATA (§10)
// ===========================================================================

describe("treasury service — positive controls on real substrate", () => {
  it("reads the real positions available to a RESTRICTED-clearance CFO", async () => {
    const r = await readPositions(ctx(), { asOf: ASOF });
    // 5 positions exist; TRS_T4 is HIGHLY_RESTRICTED so a RESTRICTED CFO sees 4.
    expect(r.data.positions).toHaveLength(4);
    expect(r.data.withheldPositionCount).toBe(1);
    expect(r.data.positions.map((p) => p.id)).not.toContain("TRS_T4");
    expect(r.explanation.join(" ")).toMatch(/withheld/i);
  });

  it("reports real per-currency cash without inventing an FX rate", async () => {
    const r = await analyzeCash(ctx(), { asOf: ASOF });
    const usd = r.data.byCurrency.find((c) => c.currency === "USD")!;
    const tzs = r.data.byCurrency.find((c) => c.currency === "TZS")!;
    // Visible to RESTRICTED clearance: USD = TRS_T1 4,820,000 only (T4 withheld).
    expect(usd.nativeTotal).toBe("4820000.00");
    // TZS native = 6,120,000,000 + 2,870,000,000 + 980,000,000.
    expect(tzs.nativeTotal).toBe("9970000000.00");
    expect(tzs.baseTotal).toBe("3813000.00");
    expect(r.data.availableCash).toBeNull();
    expect(r.data.withheldPositionCount).toBe(1);
  });

  it("computes real counterparty concentration over visible positions", async () => {
    const r = await analyzeConcentration(ctx(), "COUNTERPARTY", { asOf: ASOF });
    // Visible base total = 4,820,000 + 2,340,000 + 1,098,000 + 375,000 = 8,633,000.
    expect(r.data.denominator).toBe("8633000.00");
    expect(r.data.buckets[0].key).toBe("Emirates NBD");
    expect(r.data.value).toBe("55.83");
    expect(r.data.severity).toBe("REQUIRES_POLICY");
    expect(r.data.policyDependencies).toContain("P4");
  });

  it("computes real liquidity coverage from caller-stated definitions", async () => {
    const r = await analyzeLiquidity(ctx(), {
      asOf: ASOF, liquidAccountTypes: ["OPERATING"], committedStatuses: ["APPROVED"],
    });
    // Liquid OPERATING (visible) = 4,820,000 + 2,340,000 + 1,098,000 + 375,000 = 8,633,000.
    // APPROVED capital = 640,000 + 180,000 = 820,000.
    expect(r.data.denominator).toBe("820000.00");
    expect(r.data.value).toBe("10.5280");
    expect(r.data.severity).toBe("REQUIRES_POLICY");
  });

  it("refuses maturity analysis against real data", async () => {
    const r = await analyzeMaturity(ctx(), { asOf: ASOF });
    expect(r.data.basis).toBe("DATA_NOT_AVAILABLE");
    expect(r.data.buckets).toBeNull();
  });

  it("surfaces the REAL attribution defect: 3 positions point at other tenants' entities", async () => {
    // Use a HIGHLY_RESTRICTED-clearance role so all 5 positions are in scope.
    const r = await assessTreasuryDataQuality(ctx({ principal: principal({ roles: ["GROUP_CEO", "GROUP_CFO"] }) }), { asOf: ASOF });
    const inconsistent = r.data.attribution.filter((a) => !a.consistent);
    expect(inconsistent.map((a) => a.positionId).sort()).toEqual(["TRS_T2", "TRS_T3", "TRS_T5"]);
    expect(inconsistent.every((a) => a.basis === "GOVERNANCE_REVIEW_REQUIRED")).toBe(true);
    expect(r.data.findings.filter((f) => f.code === "TENANT_ENTITY_ATTRIBUTION_MISMATCH")).toHaveLength(3);
  });

  it("surfaces the REAL inconsistent FX rates in the seeded TZS positions", async () => {
    const r = await assessTreasuryDataQuality(ctx(), { asOf: ASOF });
    const fx = r.data.findings.find((f) => f.code === "INCONSISTENT_IMPLIED_FX_RATE");
    expect(fx).toBeDefined();
    expect(fx!.detail).toMatch(/2613\.|2615\./);
  });

  it("generates a full report over real data", async () => {
    const r = await generateTreasuryReport(ctx(), { asOf: ASOF, staleAfterDays: 365 });
    expect(r.specialist).toBe("TREASURY");
    expect(r.version).toBe(TREASURY_VERSION);
    expect(r.data.concentration).toHaveLength(4);
    expect(r.data.cash.positionCount).toBe(4);
    expect(r.data.maturity.basis).toBe("DATA_NOT_AVAILABLE");
    expect(r.data.policyDependencies).toContain("P4");
    expect(r.data.withheldPositionCount).toBe(1);
    expect(r.explanation.join(" ")).toMatch(/authorises no settlement/i);
  });

  it("runs a real scenario and marks it SIMULATION_ONLY", async () => {
    const r = await runTreasuryScenario(ctx(), "BANK_FAILURE", [
      { targetPositionId: "TRS_T1", factor: 0, rationale: "Counterparty failure stress test" },
    ], { asOf: ASOF });
    expect(r.qualifier).toBe("SIMULATION_ONLY");
    expect(r.data.basis).toBe("SCENARIO");
  });

  it("emits exactly one audit row and one event per ANALYSIS run", async () => {
    const t = trace();
    expect(await count(sql`select count(*)::int as n from audit_log where object_id = ${t}`)).toBe(0);
    await analyzeCash(ctx({ traceId: t }), { asOf: ASOF });
    expect(await count(sql`select count(*)::int as n from audit_log where object_id = ${t}`)).toBe(1);
    expect(await count(sql`select count(*)::int as n from enterprise_events where subject_id = ${t}`)).toBe(1);
  });

  it("does NOT audit a pure READ", async () => {
    const t = trace();
    await readPositions(ctx({ traceId: t }), { asOf: ASOF });
    expect(await count(sql`select count(*)::int as n from audit_log where object_id = ${t}`)).toBe(0);
  });

  it("is deterministic across repeated runs", async () => {
    const a = await generateTreasuryReport(ctx(), { asOf: ASOF });
    const b = await generateTreasuryReport(ctx(), { asOf: ASOF });
    expect(JSON.stringify(a.data)).toBe(JSON.stringify(b.data));
  });
});

// ===========================================================================
// H. CLEARANCE (the control this phase adds)
// ===========================================================================

describe("treasury service — clearance enforcement", () => {
  it("withholds a HIGHLY_RESTRICTED position from a RESTRICTED-clearance caller", async () => {
    const cfo = principal({ roles: ["GROUP_CFO"] });
    expect(cfo.clearance).toBe("RESTRICTED");
    const r = await readPositions(ctx({ principal: cfo }), { asOf: ASOF });
    expect(r.data.positions.map((p) => p.id)).not.toContain("TRS_T4");
    expect(r.data.withheldPositionCount).toBe(1);
  });

  it("POSITIVE: a HIGHLY_RESTRICTED-clearance caller sees all five positions", async () => {
    // GROUP_CEO carries HIGHLY_RESTRICTED clearance; combined with CFO for treasury permission.
    const exec = principal({ roles: ["GROUP_CEO", "GROUP_CFO"] });
    expect(exec.clearance).toBe("HIGHLY_RESTRICTED");
    const r = await readPositions(ctx({ principal: exec }), { asOf: ASOF });
    expect(r.data.positions).toHaveLength(5);
    expect(r.data.positions.map((p) => p.id)).toContain("TRS_T4");
    expect(r.data.withheldPositionCount).toBe(0);
  });

  it("CRITICAL: the withheld balance does not leak through an aggregate total", async () => {
    const restricted = await analyzeCash(ctx({ principal: principal({ roles: ["GROUP_CFO"] }) }), { asOf: ASOF });
    const full = await analyzeCash(ctx({ principal: principal({ roles: ["GROUP_CEO", "GROUP_CFO"] }) }), { asOf: ASOF });
    // The trust reserve is 3,150,000 USD. It must be absent from the restricted total.
    expect(restricted.data.baseCurrencyTotal).toBe("8633000.00");
    expect(full.data.baseCurrencyTotal).toBe("11783000.00");
    expect(Number(full.data.baseCurrencyTotal) - Number(restricted.data.baseCurrencyTotal)).toBe(3150000);
  });

  it("states that a clearance-limited figure is PARTIAL rather than reporting it as complete", async () => {
    const r = await analyzeCash(ctx({ principal: principal({ roles: ["GROUP_CFO"] }) }), { asOf: ASOF });
    expect(r.explanation.join(" ")).toMatch(/PARTIAL/);
    expect(r.data.withheldPositionCount).toBeGreaterThan(0);
  });

  it("withholding also applies to scenarios and reports", async () => {
    const sc = await runTreasuryScenario(ctx({ principal: principal({ roles: ["GROUP_CFO"] }) }), "S",
      [{ targetPositionId: "TRS_T4", factor: 0, rationale: "attempt to reach a withheld position" }], { asOf: ASOF });
    // TRS_T4 is not in scope, so the adjustment silently matches nothing and cannot reveal it.
    expect(sc.data.sources.map((s) => s.id)).not.toContain("TRS_T4");
    const rep = await generateTreasuryReport(ctx({ principal: principal({ roles: ["GROUP_CFO"] }) }), { asOf: ASOF });
    expect(JSON.stringify(rep.data)).not.toContain("3150000");
  });
});

// ===========================================================================
// I. TENANT ISOLATION (entity deliberately null)
// ===========================================================================

describe("treasury service — tenant isolation", () => {
  it("refuses a tenant the principal does not belong to", async () => {
    await expect(readPositions({ principal: principal(), tenantId: foreignTenantId, legalEntityId: null, traceId: trace() }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a forged tenant id", async () => {
    await expect(readPositions({ principal: principal(), tenantId: "TEN_FORGED", legalEntityId: null, traceId: trace() }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns no positions for a legitimate but different tenant", async () => {
    const r = await analyzeCash({
      principal: principal({ tenantId: foreignTenantId }),
      tenantId: foreignTenantId, legalEntityId: null, traceId: trace(),
    }, { asOf: ASOF });
    expect(r.data.positionCount).toBe(0);
    expect(r.data.baseCurrencyTotal).toBeNull();
  });

  it("CRITICAL: does not follow entity ownership across the tenant boundary", async () => {
    // TRS_T2/T3/T5 point at entities owned by other tenants. Those owners must still see nothing:
    // aggregating by ownership would silently repair the attribution defect.
    const owner = (await rowsOf<{ tenant_id: string }>(sql`select tenant_id from legal_entities where id = 'LEN_BEYU_TZ_HOLDING'`))[0].tenant_id;
    expect(owner).not.toBe(tenantId);
    const r = await analyzeCash({
      principal: principal({ tenantId: owner }), tenantId: owner, legalEntityId: null, traceId: trace(),
    }, { asOf: ASOF });
    expect(r.data.positionCount).toBe(0);
  });
});

// ===========================================================================
// J. ENTITY ISOLATION (tenant deliberately valid)
// ===========================================================================

describe("treasury service — entity isolation", () => {
  it("refuses an entity owned by another tenant", async () => {
    await expect(readPositions({ principal: principal(), tenantId, legalEntityId: foreignEntityId, traceId: trace() }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses an entity outside the principal's entity scope", async () => {
    await expect(readPositions({
      principal: principal({ entityScope: ["LEN_SOMETHING_ELSE"] }),
      tenantId, legalEntityId: ownedEntityId, traceId: trace(),
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("POSITIVE: an in-scope owned entity narrows to its own positions", async () => {
    const r = await readPositions({
      principal: principal({ entityScope: [ownedEntityId] }),
      tenantId, legalEntityId: ownedEntityId, traceId: trace(),
    }, { asOf: ASOF });
    expect(ownedEntityPositionCount).toBeGreaterThan(0);
    expect(r.data.positions.length).toBeGreaterThan(0);
    expect(r.data.positions.every((p) => p.legalEntityId === ownedEntityId)).toBe(true);
    expect(r.data.positions.length).toBeLessThan(5);
  });
});

// ===========================================================================
// K. ATTACK MATRIX (§9)
// ===========================================================================

describe("treasury service — hostile inputs", () => {
  it("denies a principal without treasury permission", async () => {
    await expect(readPositions(ctx({ principal: principal({ roles: ["HCM_DIRECTOR"] }) })))
      .rejects.toMatchObject({ code: "DENIED" });
  });

  it("denies a principal with no roles", async () => {
    await expect(readPositions(ctx({ principal: principal({ roles: [] }) })))
      .rejects.toMatchObject({ code: "DENIED" });
  });

  it("POSITIVE: AUDITOR holds treasury read and succeeds", async () => {
    const r = await readPositions(ctx({ principal: principal({ roles: ["AUDITOR"] }) }), { asOf: ASOF });
    expect(r.data.positions.length).toBeGreaterThan(0);
  });

  it("a forged permission set cannot cross the tenant boundary", async () => {
    const forged = principal({ roles: [] });
    (forged.permissions as Set<string>).add("finance:treasury.read");
    await expect(readPositions({ principal: forged, tenantId: foreignTenantId, legalEntityId: null, traceId: trace() }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a forged clearance string cannot exceed the real classification ordering", async () => {
    // Even a nonsense clearance value must not unlock HIGHLY_RESTRICTED rows: rank() returns -1.
    const forged = principal({ roles: ["GROUP_CFO"], clearance: "SUPER_ADMIN" as never });
    const r = await readPositions(ctx({ principal: forged }), { asOf: ASOF });
    expect(r.data.positions.map((p) => p.id)).not.toContain("TRS_T4");
  });

  it("rejects malformed trace ids", async () => {
    for (const traceId of ["", "short", "has space", "x".repeat(65)]) {
      await expect(readPositions(ctx({ traceId }))).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    }
  });

  it("rejects a malformed asOf instead of defaulting to today", async () => {
    await expect(analyzeCash(ctx(), { asOf: "15/02/2026" })).rejects.toThrow(/ISO date/i);
    await expect(generateTreasuryReport(ctx(), { asOf: "nope" })).rejects.toThrow(/ISO date/i);
  });

  it("a scenario targeting an out-of-scope position cannot pull it in", async () => {
    const r = await runTreasuryScenario(ctx(), "GHOST",
      [{ targetPositionId: "TRS_NOT_MINE", factor: 0, rationale: "attempt to reach a foreign record" }], { asOf: ASOF });
    expect(r.data.sources.every((s) => s.id.startsWith("TRS_T"))).toBe(true);
    expect(r.data.sources).toHaveLength(4);
  });

  it("writes nothing to treasury or any financial table", async () => {
    const before = {
      tp: await count(sql`select count(*)::int as n from treasury_positions`),
      cap: await count(sql`select count(*)::int as n from capital_requests`),
      sum: (await rowsOf<{ s: string }>(sql`select coalesce(sum(base_currency_balance),0)::text as s from treasury_positions`))[0].s,
      raw: (await rowsOf<{ s: string }>(sql`select coalesce(sum(balance),0)::text as s from treasury_positions`))[0].s,
    };
    await generateTreasuryReport(ctx(), { asOf: ASOF });
    await runTreasuryScenario(ctx(), "S", [{ targetPositionId: "TRS_T1", factor: 0, rationale: "wipe" }], { asOf: ASOF });
    await analyzeLiquidity(ctx(), { asOf: ASOF, liquidAccountTypes: ["OPERATING"], committedStatuses: ["APPROVED"] });

    expect(await count(sql`select count(*)::int as n from treasury_positions`)).toBe(before.tp);
    expect(await count(sql`select count(*)::int as n from capital_requests`)).toBe(before.cap);
    expect((await rowsOf<{ s: string }>(sql`select coalesce(sum(base_currency_balance),0)::text as s from treasury_positions`))[0].s).toBe(before.sum);
    expect((await rowsOf<{ s: string }>(sql`select coalesce(sum(balance),0)::text as s from treasury_positions`))[0].s).toBe(before.raw);
  });

  it("creates no journal entries and funds no capital", async () => {
    await generateTreasuryReport(ctx(), { asOf: ASOF });
    expect(await count(sql`select count(*)::int as n from journal_entries`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from journal_lines`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from capital_requests where status = 'FUNDED'`)).toBe(0);
  });

  it("does not activate or alter any capability", async () => {
    const before = await rowsOf(sql`select capability_code, activation_status from governance_capability_registry order by capability_code`);
    await generateTreasuryReport(ctx(), { asOf: ASOF });
    expect(await rowsOf(sql`select capability_code, activation_status from governance_capability_registry order by capability_code`)).toEqual(before);
  });

  it("registers treasury capabilities with every execution path LOCKED", async () => {
    const rows = await rowsOf<{ capability_code: string; activation_status: string; required_decisions: string[] }>(
      sql`select capability_code, activation_status, required_decisions from governance_capability_registry
          where capability_code like 'CAP_SPEC_TREASURY%' order by capability_code`,
    );
    expect(rows).toHaveLength(9);
    expect(rows.every((r) => r.activation_status === "LOCKED")).toBe(true);
    for (const code of ["CAP_SPEC_TREASURY_SETTLE", "CAP_SPEC_TREASURY_TRANSFER", "CAP_SPEC_TREASURY_ENFORCE_BREACH"]) {
      expect(rows.find((r) => r.capability_code === code)!.required_decisions).toContain("P1");
    }
    expect(rows.find((r) => r.capability_code === "CAP_SPEC_TREASURY_SET_LIMIT")!.required_decisions.length).toBeGreaterThan(0);
  });

  it("creates no treasury execution permission", async () => {
    expect(await count(sql`
      select count(*)::int as n from role_permissions
      where permission_code in ('treasury:settle','treasury:transfer','finance:ledger.approve','capital:execute')
    `)).toBe(0);
  });
});

// ===========================================================================
// L. NO SECOND TRUTH (§15)
// ===========================================================================

describe("treasury module — creates no second truth", () => {
  it("defines no tables of its own", async () => {
    const names = (await rowsOf<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and (table_name like '%treasur%' or table_name like '%cash%' or table_name like '%fx%')
      order by table_name
    `)).map((r) => r.table_name);
    expect(names).toEqual(["treasury_positions"]);
  });

  it("adds no migration", async () => {
    // 23 = migrations 0000-0014 (kernel baseline) + 0016_noelia_scheduler_offsets
// (governed Noelia expansion: additive, deterministic, RLS-aware)
// + 0019 internal receipts + 0020 service principals
// + 0021 financial-ledger RLS + 0022 chart-of-accounts tenant uniqueness
// + 0023_noelia_ai_platform
// (all additive/hardening; specialist modules add no migration).
expect(await count(sql`select count(*)::int as n from public.beyu_migrations`)).toBe(24);
  });

  it("leaves all triggers enabled", async () => {
    expect(await count(sql`select count(*)::int as n from pg_trigger where tgenabled = 'D' and not tgisinternal`)).toBe(0);
  });

  it("leaves the decision registry entirely PENDING", async () => {
    expect(await count(sql`select count(*)::int as n from governance_decision_registry where status <> 'PENDING'`)).toBe(0);
  });

  it("has not written to treasury since the suite began", async () => {
    expect(JSON.stringify(await rowsOf(TREASURY_FINGERPRINT_SQL))).toBe(treasuryFingerprintBefore);
  });

  /**
   * REGRESSION — fault injection FI-10.
   *
   * A row-level fingerprint cannot see an idempotent UPDATE (e.g. `set institution = institution
   * || ''`), which rewrites the row to the same value. Postgres still bumps the row version, so
   * xmin exposes the write that content comparison misses. Without this, a service could mutate
   * treasury on every call and every content assertion would still pass.
   */
  it("performs no write at all, including an idempotent one (xmin unchanged)", async () => {
    const xminBefore = JSON.stringify(
      await rowsOf(sql`select id, xmin::text as v from treasury_positions order by id`),
    );

    await generateTreasuryReport(ctx(), { asOf: ASOF });
    await analyzeCash(ctx(), { asOf: ASOF });
    await readPositions(ctx(), { asOf: ASOF });

    expect(JSON.stringify(await rowsOf(sql`select id, xmin::text as v from treasury_positions order by id`)))
      .toBe(xminBefore);

    // Prove the probe can detect an idempotent write, so the assertion above is not vacuous.
    try {
      await db.execute(sql`update treasury_positions set institution = institution || '' where id = 'TRS_T1'`);
      expect(JSON.stringify(await rowsOf(sql`select id, xmin::text as v from treasury_positions order by id`)))
        .not.toBe(xminBefore);
      // Content is byte-identical even though a write occurred — which is exactly why the
      // content fingerprint alone was insufficient.
      expect(JSON.stringify(await rowsOf(TREASURY_FINGERPRINT_SQL))).toBe(treasuryFingerprintBefore);
    } finally {
      await db.execute(sql`update treasury_positions set institution = 'Emirates NBD' where id = 'TRS_T1'`);
    }
  });

  it("the treasury fingerprint can detect a change", async () => {
    // Proves the assertion above is not vacuous.
    try {
      await db.execute(sql`update treasury_positions set institution = 'PROBE' where id = 'TRS_T1'`);
      expect(JSON.stringify(await rowsOf(TREASURY_FINGERPRINT_SQL))).not.toBe(treasuryFingerprintBefore);
    } finally {
      await db.execute(sql`update treasury_positions set institution = 'Emirates NBD' where id = 'TRS_T1'`);
    }
    expect(JSON.stringify(await rowsOf(TREASURY_FINGERPRINT_SQL))).toBe(treasuryFingerprintBefore);
  });
});

afterAll(async () => {
  expect(JSON.stringify(await rowsOf(TREASURY_FINGERPRINT_SQL))).toBe(treasuryFingerprintBefore);
});
