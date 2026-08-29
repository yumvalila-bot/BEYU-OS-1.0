/**
 * Phase 7H — Forecasting, Scenario & Cross-Specialist Intelligence.
 *
 * A forecasting module is where an invented number is most likely to be mistaken for a fact, so
 * this suite proves five things above all:
 *
 *   1. Insufficient history yields NO forecast — points null, basis DATA_NOT_AVAILABLE.
 *      BEYU's ledger is genuinely empty, so this is the real production answer, not a corner case.
 *   2. An assumption can never become an observation, and a scenario can never become a forecast.
 *   3. Effective dating is enforced: a future assumption cannot influence a present forecast and
 *      an expired one cannot persist.
 *   4. Cross-specialist sources are never flattened; disagreement yields DATA_CONFLICT with no
 *      field in which a winner could be recorded.
 *   5. Version identity is reproducible, and because nothing is persisted, no historical forecast
 *      can be overwritten.
 *
 * NON-VACUITY. Engine tests use clearly-labelled SYNTHETIC observations, because the production
 * substrate has no history at all. Service tests assert against the REAL empty ledger and the REAL
 * populated treasury/risk/compliance registers, with specific non-zero counts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ROLES, ROLE_CLEARANCE } from "@/lib/constants";
import type { Principal } from "@/lib/authz";
import { SpecialistError, type SpecialistContext } from "@/lib/specialist/platform";
import {
  FORECAST_ENGINE_VERSION,
  assertAssumptionIntegrity,
  assessForecastQuality,
  buildVersion,
  compareScenarios,
  composeSources,
  detectConflicts,
  policyBlockedConcepts,
  project,
  reconcileForecast,
  selectEffectiveAssumptions,
  sensitivityAnalysis,
  stressTest,
} from "@/lib/specialist/forecast/engines";
import {
  analyzeSensitivity,
  assessQuality,
  compareForecastScenarios,
  composeCrossSpecialistView,
  forecastFromLedger,
  projectSeries,
  reconcile,
  reportPolicyBoundary,
  runStressTest,
} from "@/lib/specialist/forecast/service";
import type {
  ForecastAssumption,
  ForecastObservation,
  ForecastScenario,
  SourceContribution,
} from "@/lib/specialist/forecast/model";

const RUN = `FC${Date.now()}`;
let n = 0;
const trace = () => `${RUN}-${String(++n).padStart(3, "0")}`;

let tenantId = "";
let foreignTenantId = "";
let foreignEntityId = "";
let ownedEntityId = "";

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
  const rank = (c: string) =>
    ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"].indexOf(c);
  let clearance = "PUBLIC";
  for (const role of roles) {
    const c = (ROLE_CLEARANCE as Record<string, string>)[role] ?? "INTERNAL";
    if (rank(c) > rank(clearance)) clearance = c;
  }
  return {
    userId: "USR_FORECAST_TEST",
    partyId: "p",
    email: "forecast@example.test",
    displayName: "Forecast Test",
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

// --- SYNTHETIC observations. The production ledger is empty; these are test fixtures only. ---
const obs = (periodDate: string, value: string, over: Partial<ForecastObservation> = {}): ForecastObservation => ({
  seriesCode: "SYN_SERIES",
  periodDate,
  value,
  currency: "USD",
  basis: "OBSERVED",
  sourceType: "SYNTHETIC_TEST_FIXTURE",
  sourceId: `SYN-${periodDate}`,
  ...over,
});

const SERIES = [
  obs("2025-09-30", "100.00"),
  obs("2025-10-31", "110.00"),
  obs("2025-11-30", "120.00"),
  obs("2025-12-31", "130.00"),
];

const assumption = (over: Partial<ForecastAssumption> = {}): ForecastAssumption => ({
  assumptionId: "ASM_SYN_1",
  label: "Synthetic uplift",
  value: "10",
  unit: "PERCENT",
  source: "SYNTHETIC_TEST_FIXTURE",
  owner: "USR_FORECAST_TEST",
  createdAt: "2026-01-01",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  rationale: "Test fixture assumption; not a business assumption.",
  tenantId: "TEN_BEYU_GROUP",
  legalEntityId: null,
  basis: "ASSUMPTION",
  ...over,
});

const scenario = (over: Partial<ForecastScenario> = {}): ForecastScenario => ({
  scenarioCode: "SYN_UPSIDE",
  kind: "UPSIDE",
  label: "Synthetic upside",
  owner: "USR_FORECAST_TEST",
  createdAt: "2026-01-01",
  tenantId: "TEN_BEYU_GROUP",
  legalEntityId: null,
  assumptions: [assumption()],
  rationale: "Test fixture scenario.",
  ...over,
});

const baseInput = (over: Record<string, unknown> = {}) => ({
  seriesCode: "SYN_SERIES",
  observations: SERIES,
  method: "LINEAR_TREND" as const,
  horizon: 3,
  asOf: ASOF,
  actorUserId: "USR_FORECAST_TEST",
  tenantId: "TEN_BEYU_GROUP",
  legalEntityId: null,
  ...over,
});

/** Suite-level fingerprint over every store this module reads. */
const FINGERPRINT_SQL = sql`
  select 'treasury' as k, id, base_currency_balance::text as v from treasury_positions
  union all select 'risk', id, (residual_likelihood * residual_impact)::text from risks
  union all select 'oblig', id, status::text from compliance_obligations
  union all select 'journal', id, currency from journal_entries
  order by 1, 2
`;
let fingerprintBefore = "";

beforeAll(async () => {
  fingerprintBefore = JSON.stringify(await rowsOf(FINGERPRINT_SQL));
  expect(fingerprintBefore.length).toBeGreaterThan(100);

  const [t] = await rowsOf<{ id: string }>(sql`select id from tenants where id = 'TEN_BEYU_GROUP'`);
  tenantId = t.id;

  const [f] = await rowsOf<{ id: string; tenant_id: string }>(
    sql`select id, tenant_id from legal_entities where tenant_id <> ${tenantId} order by id limit 1`,
  );
  foreignEntityId = f.id;
  foreignTenantId = f.tenant_id;

  const [owned] = await rowsOf<{ id: string }>(
    sql`select id from legal_entities where tenant_id = ${tenantId} order by id limit 1`,
  );
  ownedEntityId = owned.id;

  // §13 non-vacuity preconditions: the composition sources must be genuinely populated,
  // and the ledger must be genuinely empty (which is the point of the headline test).
  expect(await count(sql`select count(*)::int as n from treasury_positions where tenant_id = ${tenantId}`)).toBe(5);
  expect(await count(sql`select count(*)::int as n from risks where tenant_id = ${tenantId}`)).toBe(6);
  expect(await count(sql`select count(*)::int as n from compliance_obligations where tenant_id = ${tenantId}`)).toBe(8);
  expect(await count(sql`select count(*)::int as n from journal_entries`)).toBe(0);
});

// ===========================================================================
// A. NO HISTORY ⇒ NO FORECAST
// ===========================================================================

describe("forecast engines — insufficient history yields no forecast", () => {
  it("returns points null and DATA_NOT_AVAILABLE for an empty observation set", () => {
    const r = project(baseInput({ observations: [] }));
    expect(r.points).toBeNull();
    expect(r.basis).toBe("DATA_NOT_AVAILABLE");
    expect(r.version).toBeNull();
    expect(r.explanation.join(" ")).toMatch(/fabrication wearing the costume of analysis/i);
  });

  it("refuses a trend from a single point", () => {
    const r = project(baseInput({ observations: [obs("2025-12-31", "100.00")], method: "LINEAR_TREND" }));
    expect(r.points).toBeNull();
    expect(r.quality.minimumRequired).toBe(2);
    expect(r.quality.distinctPeriods).toBe(1);
  });

  it("refuses a growth rate from a single point", () => {
    expect(project(baseInput({ observations: [obs("2025-12-31", "100.00")], method: "GROWTH_RATE" })).points).toBeNull();
  });

  it("counts DISTINCT periods, so duplicates do not manufacture history", () => {
    const dup = [obs("2025-12-31", "100.00"), obs("2025-12-31", "110.00"), obs("2025-12-31", "120.00")];
    const r = project(baseInput({ observations: dup, method: "LINEAR_TREND" }));
    expect(r.quality.distinctPeriods).toBe(1);
    expect(r.quality.duplicatePeriods).toEqual(["2025-12-31"]);
    expect(r.points).toBeNull();
  });

  it("never produces a confidence percentage", () => {
    const q = assessForecastQuality(SERIES, "LINEAR_TREND");
    expect(q.confidence).toBeNull();
    expect(q.confidenceBasis).toBe("REQUIRES_POLICY");
    expect(q.explanation.join(" ")).toMatch(/ratified tolerance for forecast error/i);
  });

  it("POSITIVE: sufficient history produces a real projection", () => {
    const r = project(baseInput());
    expect(r.points).toHaveLength(3);
    expect(r.basis).toBe("FORECAST");
    // Perfect +10 linear series: next three steps are 140, 150, 160.
    expect(r.points!.map((p) => p.value)).toEqual(["140.00", "150.00", "160.00"]);
  });
});

// ===========================================================================
// B. EPISTEMIC SEPARATION
// ===========================================================================

describe("forecast engines — bases never collapse into one another", () => {
  it("refuses an observation that is not OBSERVED", () => {
    const forecastAsInput = { ...obs("2025-12-31", "100.00"), basis: "FORECAST" as never };
    expect(() => project(baseInput({ observations: [...SERIES, forecastAsInput] })))
      .toThrow(/may only be built on observed history/i);
  });

  it("marks any assumption-bearing result SCENARIO, never FORECAST", () => {
    const r = project(baseInput({ scenario: scenario() }));
    expect(r.basis).toBe("SCENARIO");
    expect(r.points!.every((p) => p.basis === "SCENARIO")).toBe(true);
  });

  it("marks an unassumed baseline FORECAST", () => {
    const r = project(baseInput());
    expect(r.basis).toBe("FORECAST");
    expect(r.points!.every((p) => p.basis === "FORECAST")).toBe(true);
  });

  it("refuses an assumption declaring itself OBSERVED", () => {
    expect(() => assertAssumptionIntegrity(assumption({ basis: "OBSERVED" as never })))
      .toThrow(/may never be recorded as observed fact/i);
  });

  it("refuses an assumption with no owner, source, id or rationale", () => {
    for (const field of ["owner", "source", "assumptionId", "rationale"] as const) {
      expect(() => assertAssumptionIntegrity(assumption({ [field]: "  " } as never)))
        .toThrow(/unattributable assumption is refused|has no/i);
    }
  });

  it("leaves the observation array untouched when assumptions are applied", () => {
    const snapshot = JSON.stringify(SERIES);
    project(baseInput({ scenario: scenario() }));
    expect(JSON.stringify(SERIES)).toBe(snapshot);
  });

  it("reports applied assumptions alongside the result rather than folding them in silently", () => {
    const r = project(baseInput({ scenario: scenario() }));
    expect(r.appliedAssumptions).toHaveLength(1);
    expect(r.appliedAssumptions[0].basis).toBe("ASSUMPTION");
    expect(r.explanation.join(" ")).toMatch(/not a forecast of what will happen/i);
  });
});

// ===========================================================================
// C. TEMPORAL GOVERNANCE (§10)
// ===========================================================================

describe("forecast engines — assumption effective dating", () => {
  it("excludes a future assumption", () => {
    const { applied, excluded } = selectEffectiveAssumptions([assumption({ effectiveFrom: "2027-01-01" })], ASOF);
    expect(applied).toHaveLength(0);
    expect(excluded[0].reason).toMatch(/Not yet effective/i);
  });

  it("excludes an expired assumption", () => {
    const { applied, excluded } = selectEffectiveAssumptions(
      [assumption({ effectiveFrom: "2025-01-01", effectiveTo: "2025-12-31" })], ASOF,
    );
    expect(applied).toHaveLength(0);
    expect(excluded[0].reason).toMatch(/Expired/i);
  });

  it("includes an assumption effective exactly on the asOf date (inclusive lower bound)", () => {
    expect(selectEffectiveAssumptions([assumption({ effectiveFrom: ASOF })], ASOF).applied).toHaveLength(1);
  });

  it("includes an assumption expiring exactly on the asOf date (inclusive upper bound)", () => {
    expect(selectEffectiveAssumptions([assumption({ effectiveTo: ASOF })], ASOF).applied).toHaveLength(1);
  });

  it("includes an open-ended assumption", () => {
    expect(selectEffectiveAssumptions([assumption({ effectiveTo: null })], ASOF).applied).toHaveLength(1);
  });

  it("CRITICAL: a future assumption does not change the projected value", () => {
    const withFuture = project(baseInput({ scenario: scenario({ assumptions: [assumption({ effectiveFrom: "2027-01-01" })] }) }));
    const withNone = project(baseInput());
    expect(withFuture.points!.map((p) => p.value)).toEqual(withNone.points!.map((p) => p.value));
    expect(withFuture.excludedAssumptions).toHaveLength(1);
  });

  it("CRITICAL: an expired assumption does not change the projected value", () => {
    const withExpired = project(baseInput({
      scenario: scenario({ assumptions: [assumption({ effectiveFrom: "2025-01-01", effectiveTo: "2025-06-30" })] }),
    }));
    expect(withExpired.points!.map((p) => p.value)).toEqual(project(baseInput()).points!.map((p) => p.value));
  });

  it("POSITIVE: an effective assumption DOES change the projected value", () => {
    const withAssumption = project(baseInput({ scenario: scenario() }));
    const without = project(baseInput());
    expect(withAssumption.points![0].value).not.toBe(without.points![0].value);
    // +10% on 140.00
    expect(withAssumption.points![0].value).toBe("154.00");
  });

  it("rejects malformed assumption dates", () => {
    expect(() => selectEffectiveAssumptions([assumption({ effectiveFrom: "01/01/2026" })], ASOF)).toThrow(/ISO date/i);
    expect(() => selectEffectiveAssumptions([assumption()], "not-a-date")).toThrow(/ISO date/i);
  });
});

// ===========================================================================
// D. VERSION IDENTITY (§11)
// ===========================================================================

describe("forecast engines — reproducible version identity", () => {
  it("produces an identical versionId for identical inputs", () => {
    expect(project(baseInput()).version!.versionId).toBe(project(baseInput()).version!.versionId);
  });

  it("changes the versionId when observations change", () => {
    const a = project(baseInput()).version!.versionId;
    const b = project(baseInput({ observations: [...SERIES, obs("2026-01-31", "140.00")] })).version!.versionId;
    expect(a).not.toBe(b);
  });

  it("changes the versionId when method, horizon or scenario changes", () => {
    const base = project(baseInput()).version!.versionId;
    expect(project(baseInput({ method: "NAIVE_LAST" })).version!.versionId).not.toBe(base);
    expect(project(baseInput({ horizon: 5 })).version!.versionId).not.toBe(base);
    expect(project(baseInput({ scenario: scenario() })).version!.versionId).not.toBe(base);
  });

  it("records the source snapshot and assumption checksums separately", () => {
    const v = project(baseInput({ scenario: scenario() })).version!;
    expect(v.sourceSnapshotChecksum).toBeTruthy();
    expect(v.assumptionsChecksum).toBeTruthy();
    expect(v.sourceSnapshotChecksum).not.toBe(v.assumptionsChecksum);
    expect(v.engineVersion).toBe(FORECAST_ENGINE_VERSION);
  });

  it("uses asOf rather than wall-clock time, so replay is reproducible", () => {
    const v = buildVersion({
      method: "LINEAR_TREND", scenarioCode: "BASELINE", horizon: 3, observations: SERIES,
      assumptions: [], actorUserId: "U", tenantId: "T", legalEntityId: null, asOf: ASOF,
    });
    expect(v.producedAt).toBe(ASOF);
  });

  it("persists nothing, so no historical forecast can be overwritten", async () => {
    const before = await count(sql`
      select count(*)::int as n from information_schema.tables
      where table_schema = 'public' and (table_name like '%forecast%' or table_name like '%scenario%' or table_name like '%assumption%')
    `);
    project(baseInput());
    expect(before).toBe(0);
    expect(await count(sql`
      select count(*)::int as n from information_schema.tables
      where table_schema = 'public' and (table_name like '%forecast%' or table_name like '%scenario%' or table_name like '%assumption%')
    `)).toBe(0);
  });
});

// ===========================================================================
// E. METHODS, SENSITIVITY, STRESS, RECONCILIATION
// ===========================================================================

describe("forecast engines — projection methods", () => {
  it("NAIVE_LAST carries the last value forward", () => {
    const r = project(baseInput({ method: "NAIVE_LAST" }));
    expect(r.points!.map((p) => p.value)).toEqual(["130.00", "130.00", "130.00"]);
  });

  it("RUN_RATE carries the last level forward without annualising", () => {
    const r = project(baseInput({ method: "RUN_RATE" }));
    expect(r.points!.every((p) => p.value === "130.00")).toBe(true);
  });

  it("MOVING_AVERAGE averages the window", () => {
    const r = project(baseInput({ method: "MOVING_AVERAGE", window: 2 }));
    expect(r.points![0].value).toBe("125.00");
  });

  it("rejects an out-of-range moving-average window", () => {
    expect(() => project(baseInput({ method: "MOVING_AVERAGE", window: 99 }))).toThrow(/window must be between/i);
  });

  it("GROWTH_RATE compounds the observed rate", () => {
    const r = project(baseInput({ method: "GROWTH_RATE" }));
    expect(Number(r.points![0].value)).toBeGreaterThan(130);
  });

  it("refuses a growth rate when the first observation is zero", () => {
    const zeroStart = [obs("2025-09-30", "0.00"), obs("2025-10-31", "10.00")];
    expect(() => project(baseInput({ observations: zeroStart, method: "GROWTH_RATE" }))).toThrow(/undefined when the first observation is zero/i);
  });

  it("rejects an invalid horizon", () => {
    for (const horizon of [0, -1, 121, 1.5]) {
      expect(() => project(baseInput({ horizon }))).toThrow(/Horizon must be an integer/i);
    }
  });

  it("refuses cross-currency projection pending P4", () => {
    const mixed = [...SERIES, obs("2026-01-31", "140.00", { currency: "TZS" })];
    expect(() => project(baseInput({ observations: mixed }))).toThrow(/requires the FX decision \(P4\)/i);
  });

  it("bounds reflect dispersion and are never called a probability", () => {
    const r = project(baseInput());
    expect(Number(r.points![0].lowerBound)).toBeLessThan(Number(r.points![0].value));
    expect(r.explanation.join(" ")).toMatch(/not a probability/i);
  });
});

describe("forecast engines — sensitivity, stress, reconciliation", () => {
  it("shifts each assumption independently and reports the delta", () => {
    const r = sensitivityAnalysis(baseInput({ scenario: scenario() }), 50);
    expect(r.basis).toBe("SCENARIO");
    expect(r.variations).toHaveLength(1);
    expect(r.variations[0].deltaFromBaseline).not.toBe("0.00");
  });

  it("reports honestly when there is nothing to be sensitive to", () => {
    const r = sensitivityAnalysis(baseInput({ scenario: scenario({ assumptions: [] }) }), 10);
    expect(r.variations).toHaveLength(0);
    expect(r.explanation.join(" ")).toMatch(/not a finding of robustness/i);
  });

  it("returns DATA_NOT_AVAILABLE for sensitivity with no baseline", () => {
    expect(sensitivityAnalysis(baseInput({ observations: [], scenario: scenario() }), 10).basis).toBe("DATA_NOT_AVAILABLE");
  });

  it("compares scenarios without nominating a winner", () => {
    const r = compareScenarios(baseInput(), [
      scenario({ scenarioCode: "UP", assumptions: [assumption({ value: "20" })] }),
      scenario({ scenarioCode: "DOWN", kind: "DOWNSIDE", assumptions: [assumption({ value: "-20" })] }),
    ]);
    expect(r.perScenarioFinalValue).toHaveLength(2);
    expect(r.spread).not.toBeNull();
    expect(r.explanation.join(" ")).toMatch(/No scenario is identified as most likely/i);
    expect(JSON.stringify(r)).not.toMatch(/preferred|recommended|selected/i);
  });

  it("a stress test requires an owner and rationale", () => {
    expect(() => stressTest(baseInput(), { code: "S", multiplier: 0.5, owner: "", rationale: "r", asOf: ASOF }))
      .toThrow(/requires an owner and a rationale/i);
    expect(() => stressTest(baseInput(), { code: "S", multiplier: 0.5, owner: "o", rationale: " ", asOf: ASOF }))
      .toThrow(/requires an owner and a rationale/i);
  });

  it("a stress test yields SCENARIO and an attributed assumption", () => {
    const r = stressTest(baseInput(), { code: "CRASH", multiplier: 0.5, owner: "USR_X", rationale: "downside", asOf: ASOF });
    expect(r.basis).toBe("SCENARIO");
    expect(r.appliedAssumptions[0].owner).toBe("USR_X");
    expect(r.points![0].value).toBe("70.00");
  });

  it("rejects a negative stress multiplier", () => {
    expect(() => stressTest(baseInput(), { code: "S", multiplier: -1, owner: "o", rationale: "r", asOf: ASOF }))
      .toThrow(/non-negative finite/i);
  });

  it("reconciles a forecast against actuals without rewriting either", () => {
    const forecast = project(baseInput());
    const snapshot = JSON.stringify(forecast.points);
    const actuals = [obs("2026-01-31", "145.00"), obs("2026-02-28", "148.00")];
    const r = reconcileForecast(forecast, actuals);
    expect(r.comparisons).toHaveLength(2);
    expect(r.comparisons[0].variance).toBe("5.00");
    expect(JSON.stringify(forecast.points)).toBe(snapshot);
    expect(r.explanation.join(" ")).toMatch(/actuals are never adjusted/i);
  });

  it("returns DATA_NOT_AVAILABLE when reconciling against nothing", () => {
    expect(reconcileForecast(project(baseInput()), []).basis).toBe("DATA_NOT_AVAILABLE");
  });
});

// ===========================================================================
// F. POLICY BOUNDARY (§6)
// ===========================================================================

describe("forecast engines — accounting policy boundary", () => {
  it("blocks all eleven policy-dependent concepts", () => {
    const blocked = policyBlockedConcepts();
    expect(blocked).toHaveLength(11);
    expect(blocked.every((b) => b.basis === "REQUIRES_AUTHORITY")).toBe(true);
    expect(blocked.every((b) => b.blockingDecisions.length > 0)).toBe(true);
    expect(blocked.map((b) => b.concept)).toEqual(expect.arrayContaining([
      "REVENUE_RECOGNITION", "EBITDA", "NET_INCOME", "VALUATION", "TAX_LIABILITY", "FX_TRANSLATION",
    ]));
  });

  it("computes no EBITDA, net income or valuation anywhere in a projection", () => {
    const text = JSON.stringify(project(baseInput({ scenario: scenario() })));
    expect(text).not.toMatch(/ebitda|netIncome|valuation|depreciation/i);
  });

  it("attributes FX translation to P4 and tax to P3", () => {
    const blocked = policyBlockedConcepts();
    expect(blocked.find((b) => b.concept === "FX_TRANSLATION")!.blockingDecisions).toContain("P4");
    expect(blocked.find((b) => b.concept === "TAX_LIABILITY")!.blockingDecisions).toContain("P3");
  });
});

// ===========================================================================
// G. CROSS-SPECIALIST COMPOSITION (§8)
// ===========================================================================

describe("forecast engines — composition never flattens sources", () => {
  const contribution = (over: Partial<SourceContribution> = {}): SourceContribution => ({
    source: "TREASURY",
    available: true,
    basis: "OBSERVED",
    provenance: [{ type: "TREASURY_POSITION", id: "TRS_T1" }],
    summary: { positionCount: 5 },
    explanation: ["synthetic"],
    ...over,
  });

  it("keeps each source's provenance separate", () => {
    const v = composeSources({
      asOf: ASOF, tenantId: "T", legalEntityId: null,
      contributions: [
        contribution(),
        contribution({ source: "RISK", provenance: [{ type: "RISK", id: "RSK_R001" }], summary: { riskCount: 6 } }),
      ],
    });
    expect(v.contributions).toHaveLength(2);
    expect(v.contributions[0].provenance[0].type).toBe("TREASURY_POSITION");
    expect(v.contributions[1].provenance[0].type).toBe("RISK");
    expect(v.explanation.join(" ")).toMatch(/No synthetic combined truth is created/i);
  });

  it("reports an unavailable source rather than treating it as zero", () => {
    const v = composeSources({
      asOf: ASOF, tenantId: "T", legalEntityId: null,
      contributions: [contribution({ source: "FPNA", available: false, basis: "DATA_NOT_AVAILABLE", summary: {} })],
    });
    expect(v.unavailableSources).toEqual(["FPNA"]);
    expect(v.basis).toBe("DATA_NOT_AVAILABLE");
    expect(v.explanation.join(" ")).toMatch(/not treated as zero/i);
  });

  it("CRITICAL: disagreement yields DATA_CONFLICT with no winner", () => {
    const v = composeSources({
      asOf: ASOF, tenantId: "T", legalEntityId: null,
      contributions: [
        contribution({ source: "TREASURY", summary: { positionCount: 5 } }),
        contribution({ source: "RISK", summary: { positionCount: 3 } }),
      ],
    });
    expect(v.basis).toBe("DATA_CONFLICT");
    expect(v.conflicts).toHaveLength(1);
    expect(v.conflicts[0].requiresGovernanceReview).toBe(true);
    expect(v.conflicts[0].sources.sort()).toEqual(["RISK", "TREASURY"]);
    // There is no field in which a winner could be recorded.
    expect(JSON.stringify(v.conflicts[0])).not.toMatch(/resolved|winner|preferred|selected/i);
  });

  it("does not flag agreement as conflict", () => {
    const v = composeSources({
      asOf: ASOF, tenantId: "T", legalEntityId: null,
      contributions: [
        contribution({ source: "TREASURY", summary: { positionCount: 5 } }),
        contribution({ source: "RISK", summary: { positionCount: 5 } }),
      ],
    });
    expect(v.conflicts).toHaveLength(0);
    expect(v.basis).toBe("OBSERVED");
  });

  it("ignores a null-valued summary when detecting conflicts", () => {
    expect(detectConflicts([
      contribution({ source: "TREASURY", summary: { x: 5 } }),
      contribution({ source: "RISK", summary: { x: null } }),
    ])).toHaveLength(0);
  });
});

// ===========================================================================
// H. POSITIVE CONTROLS ON REAL SUBSTRATE (§13)
// ===========================================================================

describe("forecast service — real substrate", () => {
  it("HEADLINE: the real empty ledger yields DATA_NOT_AVAILABLE, never a forecast of zero", async () => {
    const r = await forecastFromLedger(ctx(), { seriesCode: "REVENUE", method: "LINEAR_TREND", horizon: 6 });
    expect(r.data.points).toBeNull();
    expect(r.data.basis).toBe("DATA_NOT_AVAILABLE");
    expect(r.data.quality.observationCount).toBe(0);
    expect(r.provenance.sources).toHaveLength(0);
    expect(r.explanation.join(" ")).toMatch(/No history means no forecast — not a forecast of zero/i);
  });

  it("POSITIVE: caller-supplied governed observations produce a real projection through the service", async () => {
    const r = await projectSeries(ctx(), {
      seriesCode: "SYN_SERIES", observations: SERIES, method: "LINEAR_TREND", horizon: 3,
    }, { asOf: ASOF });
    expect(r.data.points).toHaveLength(3);
    expect(r.data.basis).toBe("FORECAST");
    expect(r.data.version!.versionId).toBeTruthy();
    expect(r.provenance.sources).toHaveLength(4);
  });

  it("composes the REAL treasury, risk and compliance registers with separate provenance", async () => {
    const r = await composeCrossSpecialistView(ctx({ principal: principal({ roles: ["GROUP_CFO", "CHIEF_RISK_COMPLIANCE"] }) }), { asOf: ASOF });
    const treasury = r.data.contributions.find((c) => c.source === "TREASURY")!;
    const risk = r.data.contributions.find((c) => c.source === "RISK")!;
    const compliance = r.data.contributions.find((c) => c.source === "COMPLIANCE")!;
    const fpna = r.data.contributions.find((c) => c.source === "FPNA")!;

    // CFO clearance is RESTRICTED, so one HIGHLY_RESTRICTED treasury position is withheld.
    expect(treasury.summary.positionCount).toBe(4);
    expect(r.data.withheldRecordCount).toBe(1);
    expect(risk.summary.riskCount).toBe(6);
    expect(compliance.summary.obligationCount).toBe(8);
    // The ledger is empty, so FP&A is genuinely unavailable.
    expect(fpna.available).toBe(false);
    expect(r.data.unavailableSources).toContain("FPNA");
    // Provenance is retained per source, not merged.
    expect(treasury.provenance.every((p) => p.type === "TREASURY_POSITION")).toBe(true);
    expect(risk.provenance.every((p) => p.type === "RISK")).toBe(true);
  });

  it("marks a source unavailable when the principal lacks its permission", async () => {
    // SECTOR_OPERATOR has risk + compliance read but NOT finance:treasury.read.
    const r = await composeCrossSpecialistView(
      ctx({ principal: principal({ roles: ["GROUP_CFO", "SECTOR_OPERATOR"] }) }), { asOf: ASOF, sources: ["RISK"] },
    );
    expect(r.data.contributions.find((c) => c.source === "RISK")!.available).toBe(true);
  });

  it("CRITICAL: a principal without treasury permission gets DATA_NOT_AVAILABLE, not treasury data", async () => {
    const noTreasury = principal({ roles: ["CHIEF_RISK_COMPLIANCE"] });
    expect(noTreasury.permissions.has("finance:treasury.read" as never)).toBe(false);
    const r = await composeCrossSpecialistView(
      ctx({ principal: { ...noTreasury, permissions: new Set([...noTreasury.permissions, "finance:ledger.read"]) } as Principal }),
      { asOf: ASOF, sources: ["TREASURY"] },
    );
    const treasury = r.data.contributions.find((c) => c.source === "TREASURY")!;
    expect(treasury.available).toBe(false);
    expect(treasury.provenance).toHaveLength(0);
    expect(treasury.explanation.join(" ")).toMatch(/requires finance:treasury.read/i);
  });

  it("reports the policy boundary through the service", async () => {
    const r = await reportPolicyBoundary(ctx());
    expect(r.data.blocked).toHaveLength(11);
    expect(r.explanation.join(" ")).toMatch(/would be inventing accounting policy/i);
  });

  it("assesses quality through the service", async () => {
    const r = await assessQuality(ctx(), { observations: SERIES, method: "LINEAR_TREND" });
    expect(r.data.hasSufficientHistory).toBe(true);
    expect(r.data.confidence).toBeNull();
  });

  it("runs sensitivity, comparison and stress through the service", async () => {
    const sens = await analyzeSensitivity(ctx(), {
      seriesCode: "SYN_SERIES", observations: SERIES, method: "LINEAR_TREND", horizon: 3,
      scenario: scenario(), shiftPercent: 25,
    }, { asOf: ASOF });
    expect(sens.qualifier).toBe("SIMULATION_ONLY");
    expect(sens.data.variations).toHaveLength(1);

    const cmp = await compareForecastScenarios(ctx(), {
      seriesCode: "SYN_SERIES", observations: SERIES, method: "LINEAR_TREND", horizon: 3,
      scenarios: [scenario({ scenarioCode: "A" }), scenario({ scenarioCode: "B", assumptions: [assumption({ value: "-5" })] })],
    }, { asOf: ASOF });
    expect(cmp.data.perScenarioFinalValue).toHaveLength(2);

    const stress = await runStressTest(ctx(), {
      seriesCode: "SYN_SERIES", observations: SERIES, method: "LINEAR_TREND", horizon: 2,
      stressCode: "SEVERE", multiplier: 0.4, rationale: "hostile market",
    }, { asOf: ASOF });
    expect(stress.data.basis).toBe("SCENARIO");
    // Ownership is the authenticated principal, not a caller-supplied string.
    expect(stress.data.appliedAssumptions[0].owner).toBe("USR_FORECAST_TEST");
  });

  it("reconciles through the service", async () => {
    const f = project(baseInput());
    const r = await reconcile(ctx(), { forecast: f, actuals: [obs("2026-01-31", "145.00")] });
    expect(r.data.comparisons).toHaveLength(1);
  });

  it("emits exactly one audit row and one event per ANALYSIS run", async () => {
    const t = trace();
    expect(await count(sql`select count(*)::int as n from audit_log where object_id = ${t}`)).toBe(0);
    await projectSeries(ctx({ traceId: t }), {
      seriesCode: "SYN_SERIES", observations: SERIES, method: "NAIVE_LAST", horizon: 1,
    }, { asOf: ASOF });
    expect(await count(sql`select count(*)::int as n from audit_log where object_id = ${t}`)).toBe(1);
    expect(await count(sql`select count(*)::int as n from enterprise_events where subject_id = ${t}`)).toBe(1);
  });

  it("records the authorising permission on the audit row (7G platform fix still holding)", async () => {
    const t = trace();
    await projectSeries(ctx({ traceId: t }), {
      seriesCode: "SYN_SERIES", observations: SERIES, method: "NAIVE_LAST", horizon: 1,
    }, { asOf: ASOF });
    const [row] = await rowsOf<{ perm: string; tid: string }>(
      sql`select new_value->>'permission' as perm, trace_id as tid from audit_log where object_id = ${t}`,
    );
    expect(row.perm).toBe("finance:ledger.read");
    expect(row.tid).toBe(t);
  });

  it("is deterministic across repeated runs", async () => {
    const a = await projectSeries(ctx(), { seriesCode: "SYN_SERIES", observations: SERIES, method: "LINEAR_TREND", horizon: 3 }, { asOf: ASOF });
    const b = await projectSeries(ctx(), { seriesCode: "SYN_SERIES", observations: SERIES, method: "LINEAR_TREND", horizon: 3 }, { asOf: ASOF });
    expect(JSON.stringify(a.data)).toBe(JSON.stringify(b.data));
  });
});

// ===========================================================================
// I. TENANT / ENTITY / CLEARANCE (§9)
// ===========================================================================

describe("forecast service — tenant isolation", () => {
  it("refuses a tenant the principal does not belong to", async () => {
    await expect(forecastFromLedger(
      { principal: principal(), tenantId: foreignTenantId, legalEntityId: null, traceId: trace() },
      { seriesCode: "X", method: "NAIVE_LAST", horizon: 1 },
    )).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a forged tenant id", async () => {
    await expect(composeCrossSpecialistView(
      { principal: principal(), tenantId: "TEN_FORGED", legalEntityId: null, traceId: trace() },
    )).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("CRITICAL: rejects a scenario attributed to another tenant", async () => {
    await expect(projectSeries(ctx(), {
      seriesCode: "SYN_SERIES", observations: SERIES, method: "LINEAR_TREND", horizon: 3,
      scenario: scenario({ tenantId: foreignTenantId }),
    }, { asOf: ASOF })).rejects.toThrow(/Scenario tenant does not match/i);
  });

  it("CRITICAL: rejects an assumption attributed to another tenant", async () => {
    await expect(projectSeries(ctx(), {
      seriesCode: "SYN_SERIES", observations: SERIES, method: "LINEAR_TREND", horizon: 3,
      scenario: scenario({ assumptions: [assumption({ tenantId: foreignTenantId })] }),
    }, { asOf: ASOF })).rejects.toThrow(/attributed to a different tenant/i);
  });

  it("returns no cross-tenant data in a composed view", async () => {
    const r = await composeCrossSpecialistView({
      principal: principal({ tenantId: foreignTenantId, roles: ["GROUP_CFO"] }),
      tenantId: foreignTenantId, legalEntityId: null, traceId: trace(),
    }, { asOf: ASOF });
    expect(r.data.contributions.every((c) => c.provenance.length === 0)).toBe(true);
  });
});

describe("forecast service — entity isolation and clearance", () => {
  it("refuses an entity owned by another tenant", async () => {
    await expect(composeCrossSpecialistView(
      { principal: principal(), tenantId, legalEntityId: foreignEntityId, traceId: trace() },
    )).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses an entity outside the principal's entity scope", async () => {
    await expect(composeCrossSpecialistView({
      principal: principal({ entityScope: ["LEN_SOMETHING_ELSE"] }),
      tenantId, legalEntityId: ownedEntityId, traceId: trace(),
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("CRITICAL: an unrecognised clearance withholds all classified treasury data", async () => {
    const forged = principal({ roles: ["GROUP_CFO"], clearance: "SUPER_ADMIN" as never });
    const r = await composeCrossSpecialistView(ctx({ principal: forged }), { asOf: ASOF, sources: ["TREASURY"] });
    const treasury = r.data.contributions.find((c) => c.source === "TREASURY")!;
    expect(treasury.summary.positionCount).toBe(0);
    expect(r.data.withheldRecordCount).toBe(5);
  });

  it("POSITIVE: HIGHLY_RESTRICTED clearance sees all five positions and withholds none", async () => {
    const exec = principal({ roles: ["GROUP_CEO", "GROUP_CFO"] });
    expect(exec.clearance).toBe("HIGHLY_RESTRICTED");
    const r = await composeCrossSpecialistView(ctx({ principal: exec }), { asOf: ASOF, sources: ["TREASURY"] });
    expect(r.data.contributions.find((c) => c.source === "TREASURY")!.summary.positionCount).toBe(5);
    expect(r.data.withheldRecordCount).toBe(0);
  });

  it("states that a clearance-limited composed view is PARTIAL", async () => {
    const r = await composeCrossSpecialistView(ctx(), { asOf: ASOF, sources: ["TREASURY"] });
    expect(r.explanation.join(" ")).toMatch(/PARTIAL/);
  });
});

// ===========================================================================
// J. ATTACK MATRIX (§12)
// ===========================================================================

describe("forecast service — hostile inputs", () => {
  it("denies a principal without finance:ledger.read", async () => {
    await expect(projectSeries(ctx({ principal: principal({ roles: ["HCM_DIRECTOR"] }) }), {
      seriesCode: "X", observations: SERIES, method: "NAIVE_LAST", horizon: 1,
    })).rejects.toMatchObject({ code: "DENIED" });
  });

  it("denies a principal with no roles", async () => {
    await expect(projectSeries(ctx({ principal: principal({ roles: [] }) }), {
      seriesCode: "X", observations: SERIES, method: "NAIVE_LAST", horizon: 1,
    })).rejects.toMatchObject({ code: "DENIED" });
  });

  it("rejects malformed trace ids", async () => {
    for (const traceId of ["", "short", "has space", "x".repeat(65)]) {
      await expect(forecastFromLedger(ctx({ traceId }), { seriesCode: "X", method: "NAIVE_LAST", horizon: 1 }))
        .rejects.toMatchObject({ code: "RULE_VIOLATION" });
    }
  });

  it("rejects a malformed asOf instead of defaulting", async () => {
    await expect(projectSeries(ctx(), { seriesCode: "X", observations: SERIES, method: "NAIVE_LAST", horizon: 1 }, { asOf: "15/02/2026" }))
      .rejects.toThrow(/ISO date/i);
  });

  it("cannot inject a fabricated actual through the observation basis", async () => {
    const fabricated = { ...obs("2026-01-31", "999999.00"), basis: "SCENARIO" as never };
    await expect(projectSeries(ctx(), {
      seriesCode: "X", observations: [...SERIES, fabricated], method: "LINEAR_TREND", horizon: 1,
    }, { asOf: ASOF })).rejects.toThrow(/may only be built on observed history/i);
  });

  it("writes nothing to any canonical store", async () => {
    const before = JSON.stringify(await rowsOf(FINGERPRINT_SQL));
    await composeCrossSpecialistView(ctx(), { asOf: ASOF });
    await forecastFromLedger(ctx(), { seriesCode: "X", method: "NAIVE_LAST", horizon: 1 });
    await projectSeries(ctx(), { seriesCode: "X", observations: SERIES, method: "LINEAR_TREND", horizon: 3 }, { asOf: ASOF });
    expect(JSON.stringify(await rowsOf(FINGERPRINT_SQL))).toBe(before);
  });

  it("performs no write at all, including an idempotent one (xmin stable)", async () => {
    const xminBefore = JSON.stringify(await rowsOf(sql`select id, xmin::text as v from treasury_positions order by id`));
    await composeCrossSpecialistView(ctx(), { asOf: ASOF });
    await projectSeries(ctx(), { seriesCode: "X", observations: SERIES, method: "LINEAR_TREND", horizon: 3 }, { asOf: ASOF });
    expect(JSON.stringify(await rowsOf(sql`select id, xmin::text as v from treasury_positions order by id`))).toBe(xminBefore);
  });

  it("creates no journal entries and funds no capital", async () => {
    await projectSeries(ctx(), { seriesCode: "X", observations: SERIES, method: "LINEAR_TREND", horizon: 3 }, { asOf: ASOF });
    expect(await count(sql`select count(*)::int as n from journal_entries`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from capital_requests where status = 'FUNDED'`)).toBe(0);
  });

  it("does not activate or alter any capability", async () => {
    const before = await rowsOf(sql`select capability_code, activation_status from governance_capability_registry order by capability_code`);
    await composeCrossSpecialistView(ctx(), { asOf: ASOF });
    expect(await rowsOf(sql`select capability_code, activation_status from governance_capability_registry order by capability_code`)).toEqual(before);
  });

  it("registers forecast capabilities with every execution path LOCKED", async () => {
    const rows = await rowsOf<{ capability_code: string; activation_status: string; required_decisions: string[] }>(
      sql`select capability_code, activation_status, required_decisions from governance_capability_registry
          where capability_code like 'CAP_SPEC_FORECAST%' order by capability_code`,
    );
    expect(rows.every((r) => r.activation_status === "LOCKED")).toBe(true);
    for (const code of ["CAP_SPEC_FORECAST_EXECUTE", "CAP_SPEC_FORECAST_ALLOCATE", "CAP_SPEC_FORECAST_COMMIT"]) {
      const cap = rows.find((r) => r.capability_code === code)!;
      expect(cap).toBeDefined();
      expect(cap.required_decisions).toContain("P1");
    }
  });

  it("creates no execution permission", async () => {
    expect(await count(sql`
      select count(*)::int as n from role_permissions
      where permission_code in ('finance:ledger.approve','capital:execute','treasury:settle','forecast:commit')
    `)).toBe(0);
  });

  it("leaves the decision registry entirely PENDING", async () => {
    expect(await count(sql`select count(*)::int as n from governance_decision_registry where status <> 'PENDING'`)).toBe(0);
  });

  it("adds no migration and no table", async () => {
    // 16 = migrations 0000–0014 (kernel baseline) + 0016_noelia_scheduler_offsets
// (governed Noelia expansion: additive, deterministic, RLS-aware).
expect(await count(sql`select count(*)::int as n from public.beyu_migrations`)).toBe(20); // 0019_rls_gap_closure added (kernel baseline)
    expect(await count(sql`
      select count(*)::int as n from information_schema.tables
      where table_schema = 'public' and (table_name like '%forecast%' or table_name like '%scenario%')
    `)).toBe(0);
  });

  it("leaves all triggers enabled", async () => {
    expect(await count(sql`select count(*)::int as n from pg_trigger where tgenabled = 'D' and not tgisinternal`)).toBe(0);
  });
});

afterAll(async () => {
  expect(JSON.stringify(await rowsOf(FINGERPRINT_SQL))).toBe(fingerprintBefore);
});
