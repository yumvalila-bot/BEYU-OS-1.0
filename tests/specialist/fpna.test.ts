/**
 * Phase 7C — FP&A / Management Intelligence.
 *
 * Test principle carried from 7B: a deny-only suite is unacceptable. Every boundary has a
 * NEGATIVE control and a POSITIVE control, and the security-critical ones are fault-injected.
 *
 * The single most important assertion in this file is that FP&A NEVER FABRICATES AN ACTUAL.
 * The ledger is empty, so `readActuals` must return DATA_NOT_AVAILABLE with zero observations —
 * not zero-as-a-figure, not an estimate, not a treasury balance dressed up as a ledger position.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ROLES } from "@/lib/constants";
import type { Principal } from "@/lib/authz";
import type { SpecialistContext } from "@/lib/specialist/platform";
import {
  assessDataQuality,
  calculateVariance,
  compareScenarios,
  deriveRiskSignals,
  effectiveAssumptions,
  effectiveDrivers,
  fromMinor,
  publishScenario,
  assertScenarioMutable,
  toMinor,
} from "@/lib/specialist/fpna/engines";
import {
  analyseVariance,
  compareScenariosGoverned,
  fpnaForecast,
  generateManagementReport,
  readActuals,
  readKpis,
  readTreasuryPositions,
} from "@/lib/specialist/fpna/service";
import type { Assumption, Driver, FpnaObservation, Scenario } from "@/lib/specialist/fpna/model";

const RUN = `FP${Date.now()}`;
let tenantId = "";
let entityId = "";
let foreignEntityId = "";

function principal(overrides: Partial<Principal> = {}): Principal {
  const roles = overrides.roles ?? ["GROUP_CFO"];
  const permissions = new Set<never>();
  for (const role of roles) {
    const def = (ROLES as Record<string, { permissions?: readonly string[] }>)[role];
    for (const p of def?.permissions ?? []) permissions.add(p as never);
  }
  return {
    userId: "USR_FPNA_TEST",
    partyId: "p",
    email: "f@example.test",
    displayName: "FPA Test",
    tenantId,
    tenantCode: "BEYU",
    tenantType: "GROUP",
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
  return {
    principal: principal(),
    tenantId,
    legalEntityId: entityId,
    traceId: `${RUN}-t01`,
    ...overrides,
  };
}

async function rowsOf<T>(q: Parameters<typeof db.execute>[0]): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as { rows?: T[] };
  return r.rows ?? (r as unknown as T[]);
}
async function count(q: Parameters<typeof db.execute>[0]): Promise<number> {
  return Number((await rowsOf<{ n: number }>(q))[0].n);
}

const prov = (id: string) => ({
  tenantId: "T",
  legalEntityId: null,
  sourceType: "TEST",
  sourceId: id,
  version: "v1",
  createdBy: "tester",
  createdAt: "2025-01-01T00:00:00Z",
  auditReference: "trace",
});

const obs = (period: string, value: string, over: Partial<FpnaObservation> = {}): FpnaObservation => ({
  seriesCode: "REVENUE",
  periodDate: period,
  value,
  currency: "USD",
  basis: "OBSERVED",
  provenance: prov(`OBS-${period}`),
  ...over,
});

const driver = (code: string, value: string, over: Partial<Driver> = {}): Driver => ({
  driverCode: code,
  label: code,
  value,
  unit: "UNITS",
  basis: "ASSUMED",
  confidence: 0.6,
  effectiveFrom: "2024-01-01",
  effectiveTo: null,
  owner: "planner",
  sourceType: "TEST",
  sourceId: code,
  ...over,
});

const scenario = (code: string, over: Partial<Scenario> = {}): Scenario => ({
  scenarioCode: code,
  kind: "BASELINE",
  label: code,
  published: false,
  version: "1",
  drivers: [driver("VOLUME", "100.00")],
  assumptions: [],
  provenance: { ...prov(code), tenantId },
  ...over,
});

beforeAll(async () => {
  const [e] = await rowsOf<{ id: string; tenant_id: string }>(
    sql`select id, tenant_id from legal_entities order by id limit 1`,
  );
  entityId = e.id;
  tenantId = e.tenant_id;
  const [f] = await rowsOf<{ id: string }>(
    sql`select id from legal_entities where tenant_id <> ${tenantId} order by id limit 1`,
  );
  foreignEntityId = f?.id ?? "LEN_NONE";
});

// ---------------------------------------------------------------------------
// §4 ACTUALS — the anti-fabrication guarantee
// ---------------------------------------------------------------------------

describe("FP&A actuals adapter never fabricates financial data", () => {
  it("POSITIVE: returns DATA_NOT_AVAILABLE with zero observations when the ledger is empty", async () => {
    expect(await count(sql`select count(*)::int n from journal_entries`)).toBe(0); // precondition

    const result = await readActuals(ctx({ traceId: `${RUN}-actuals` }));
    expect(result.data.state).toBe("DATA_NOT_AVAILABLE");
    expect(result.data.observations).toEqual([]);
    expect(result.data.blockedBy).toEqual(expect.arrayContaining(["P1", "P6"]));
    expect(result.data.reason).toMatch(/no posted entries|ratified/i);
  });

  it("creates no second source of financial truth", async () => {
    const tables = await rowsOf<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and (table_name like 'fpna%' or table_name like '%_actuals')
    `);
    expect(tables).toEqual([]);
  });

  it("writes nothing to the ledger when read", async () => {
    const before = await count(sql`select count(*)::int n from journal_lines`);
    await readActuals(ctx({ traceId: `${RUN}-noleak` }));
    expect(await count(sql`select count(*)::int n from journal_lines`)).toBe(before);
  });

  it("NEGATIVE: refuses a cross-tenant actuals read", async () => {
    await expect(
      readActuals(ctx({ tenantId: "TEN_OTHER", legalEntityId: null, traceId: `${RUN}-xt` })),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("NEGATIVE: refuses an entity from another tenant", async () => {
    await expect(
      readActuals(ctx({ legalEntityId: foreignEntityId, traceId: `${RUN}-xe` })),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("NEGATIVE: denies a principal without ledger read permission", async () => {
    await expect(
      readActuals(ctx({ principal: principal({ roles: ["HCM_DIRECTOR"] }), traceId: `${RUN}-deny` })),
    ).rejects.toMatchObject({ code: "DENIED" });
  });

  it("POSITIVE: treasury positions read successfully and are labelled as non-accounting", async () => {
    // Treasury positions are seeded under TEN_BEYU_GROUP, so the probe must be scoped to the
    // tenant that actually holds them. Using the default fixture tenant would return zero rows
    // and make this positive control vacuous.
    const [treasuryTenant] = await rowsOf<{ tenant_id: string }>(
      sql`select tenant_id from treasury_positions limit 1`,
    );
    const result = await readTreasuryPositions(
      ctx({
        tenantId: treasuryTenant.tenant_id,
        legalEntityId: null,
        principal: principal({ tenantId: treasuryTenant.tenant_id }),
        traceId: `${RUN}-treasury`,
      }),
    );
    expect(result.data.positions.length).toBeGreaterThan(0); // real seeded data exists
    expect(result.data.note).toMatch(/not recognised accounting figures/i);
  });
});

// ---------------------------------------------------------------------------
// §6 VARIANCE
// ---------------------------------------------------------------------------

describe("variance engine", () => {
  const side = (value: string, basis: FpnaObservation["basis"] = "OBSERVED") => ({
    label: "L",
    value,
    currency: "USD",
    basis,
  });

  it("POSITIVE: computes absolute and percentage variance correctly", () => {
    const v = calculateVariance({
      kind: "ACTUAL_VS_BUDGET",
      seriesCode: "REV",
      periodDate: "2025-01-01",
      left: { ...side("110.00"), label: "Actual" },
      right: { ...side("100.00"), label: "Budget" },
      higherIsFavourable: true,
    });
    expect(v.absoluteVariance).toBe("10.00");
    expect(v.percentageVariance).toBe("10.00");
    expect(v.direction).toBe("FAVOURABLE");
  });

  it("reports ADVERSE when the sign runs against the stated preference", () => {
    const v = calculateVariance({
      kind: "ACTUAL_VS_BUDGET",
      seriesCode: "COST",
      periodDate: "2025-01-01",
      left: { ...side("120.00"), label: "Actual" },
      right: { ...side("100.00"), label: "Budget" },
      higherIsFavourable: false,
    });
    expect(v.direction).toBe("ADVERSE");
  });

  it("returns UNDETERMINED rather than guessing when direction preference is unstated", () => {
    const v = calculateVariance({
      kind: "CURRENT_VS_PRIOR",
      seriesCode: "X",
      periodDate: "2025-01-01",
      left: side("110.00"),
      right: side("100.00"),
    });
    expect(v.direction).toBe("UNDETERMINED");
  });

  it("never invents a materiality threshold", () => {
    const v = calculateVariance({
      kind: "ACTUAL_VS_FORECAST",
      seriesCode: "X",
      periodDate: "2025-01-01",
      left: side("1000000.00"),
      right: side("1.00"),
    });
    expect(v.materiality).toBe("REQUIRES_POLICY");
    expect(v.materialityBasis).toMatch(/P3/);
  });

  it("POSITIVE: applies a governed threshold when one is supplied", () => {
    const v = calculateVariance({
      kind: "ACTUAL_VS_FORECAST",
      seriesCode: "X",
      periodDate: "2025-01-01",
      left: side("150.00"),
      right: side("100.00"),
      materialityThresholdMinor: 1000,
    });
    expect(v.materiality).toBe("MATERIAL");
  });

  it("returns a null percentage against a zero base rather than infinity", () => {
    const v = calculateVariance({
      kind: "CURRENT_VS_PRIOR",
      seriesCode: "X",
      periodDate: "2025-01-01",
      left: side("50.00"),
      right: side("0.00"),
    });
    expect(v.percentageVariance).toBeNull();
  });

  it("NEGATIVE: refuses a cross-currency comparison rather than assuming a rate", () => {
    expect(() =>
      calculateVariance({
        kind: "ACTUAL_VS_BUDGET",
        seriesCode: "X",
        periodDate: "2025-01-01",
        left: side("100.00"),
        right: { label: "R", value: "100.00", currency: "TZS", basis: "OBSERVED" },
      }),
    ).toThrow(/different currencies|P4/i);
  });

  it("propagates epistemic basis so a forecast is never reported as a fact", () => {
    const v = calculateVariance({
      kind: "FORECAST_VS_PLAN",
      seriesCode: "X",
      periodDate: "2025-01-01",
      left: side("100.00", "FORECAST"),
      right: side("100.00", "ASSUMED"),
    });
    expect(v.leftBasis).toBe("FORECAST");
    expect(v.rightBasis).toBe("ASSUMED");
    expect(v.confidence).toBeLessThan(1);
    expect(v.explanation).toMatch(/not an observed fact/i);
  });

  it("handles money without floating-point drift", () => {
    expect(fromMinor(toMinor("0.10") * 3)).toBe("0.30");
    expect(toMinor("1234567.89")).toBe(123456789);
  });
});

// ---------------------------------------------------------------------------
// §10 DATA QUALITY
// ---------------------------------------------------------------------------

describe("data quality engine", () => {
  it("POSITIVE: reports no issues for clean data", () => {
    const issues = assessDataQuality([obs("2025-01-01", "10.00"), obs("2025-02-01", "11.00")], {
      asOf: "2025-03-01",
    });
    expect(issues).toEqual([]);
  });

  it("detects duplicates, future observations, currency mixing and missing provenance", () => {
    const codes = (list: FpnaObservation[], opts = {}) =>
      assessDataQuality(list, { asOf: "2025-03-01", ...opts }).map((i) => i.code);

    expect(codes([obs("2025-01-01", "1.00"), obs("2025-01-01", "2.00")])).toContain("DUPLICATE_OBSERVATION");
    expect(codes([obs("2030-01-01", "1.00")])).toContain("FUTURE_OBSERVATION");
    expect(codes([obs("2025-01-01", "1.00"), obs("2025-02-01", "1.00", { currency: "TZS" })])).toContain(
      "CURRENCY_MISMATCH",
    );
    expect(
      codes([obs("2025-01-01", "1.00", { provenance: { ...prov(""), sourceId: "" } })]),
    ).toContain("MISSING_PROVENANCE");
    expect(codes([obs("bad-date", "1.00")])).toContain("INVALID_DATE");
  });

  it("detects missing expected periods and stale data", () => {
    const issues = assessDataQuality([obs("2025-01-01", "1.00")], {
      asOf: "2025-06-01",
      expectedPeriods: ["2025-01-01", "2025-02-01"],
      staleAfterDays: 30,
    });
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("MISSING_PERIOD");
    expect(codes).toContain("STALE_DATA");
  });

  it("flags an empty input rather than silently reporting clean", () => {
    expect(assessDataQuality([]).map((i) => i.code)).toEqual(["INCOMPLETE_FORECAST_INPUT"]);
  });
});

// ---------------------------------------------------------------------------
// §14 TEMPORAL SECURITY
// ---------------------------------------------------------------------------

describe("temporal security — effective dating", () => {
  const drivers = [
    driver("D_WINDOW", "1.00", { effectiveFrom: "2025-01-01", effectiveTo: "2025-12-31" }),
    driver("D_FUTURE", "2.00", { effectiveFrom: "2030-01-01" }),
    driver("D_OPEN", "3.00", { effectiveFrom: "2020-01-01", effectiveTo: null }),
  ];

  it.each([
    ["before effective", "2024-12-31", ["D_OPEN"]],
    ["at window start", "2025-01-01", ["D_WINDOW", "D_OPEN"]],
    ["inside window", "2025-06-01", ["D_WINDOW", "D_OPEN"]],
    ["at window end", "2025-12-31", ["D_WINDOW", "D_OPEN"]],
    ["after expiry", "2026-01-01", ["D_OPEN"]],
  ])("%s selects the correct drivers", (_label, asOf, expected) => {
    expect(effectiveDrivers(drivers, asOf).map((d) => d.driverCode).sort()).toEqual(expected.sort());
  });

  it("a future driver never becomes effective early", () => {
    expect(effectiveDrivers(drivers, "2029-12-31").map((d) => d.driverCode)).not.toContain("D_FUTURE");
    expect(effectiveDrivers(drivers, "2030-01-01").map((d) => d.driverCode)).toContain("D_FUTURE");
  });

  it("an expired or retired assumption does not silently remain active", () => {
    const assumptions: Assumption[] = [
      { assumptionCode: "A1", statement: "s", basis: "ASSUMED", owner: "o", effectiveFrom: "2020-01-01", effectiveTo: "2020-12-31", status: "OPEN" },
      { assumptionCode: "A2", statement: "s", basis: "ASSUMED", owner: "o", effectiveFrom: "2020-01-01", status: "RETIRED" },
      { assumptionCode: "A3", statement: "s", basis: "ASSUMED", owner: "o", effectiveFrom: "2020-01-01", status: "OPEN" },
    ];
    expect(effectiveAssumptions(assumptions, "2025-06-01").map((a) => a.assumptionCode)).toEqual(["A3"]);
  });
});

// ---------------------------------------------------------------------------
// §8 SCENARIOS
// ---------------------------------------------------------------------------

describe("scenario engine", () => {
  it("POSITIVE: compares two scenarios and reports driver deltas", () => {
    const left = scenario("BASE");
    const right = scenario("DOWN", { drivers: [driver("VOLUME", "80.00")] });
    const comparison = compareScenarios(left, right);
    expect(comparison.driverDeltas[0].delta).toBe("20.00");
  });

  it("reports a driver present in only one scenario without inventing a delta", () => {
    const left = scenario("BASE", { drivers: [driver("VOLUME", "80.00"), driver("PRICE", "5.00")] });
    const right = scenario("DOWN", { drivers: [driver("VOLUME", "80.00")] });
    const priceDelta = compareScenarios(left, right).driverDeltas.find((d) => d.driverCode === "PRICE");
    expect(priceDelta?.delta).toBeNull();
    expect(priceDelta?.note).toMatch(/only one scenario/i);
  });

  it("refuses to compute a delta across mismatched units", () => {
    const left = scenario("A", { drivers: [driver("X", "10.00", { unit: "KG" })] });
    const right = scenario("B", { drivers: [driver("X", "10.00", { unit: "TONNES" })] });
    expect(compareScenarios(left, right).driverDeltas[0].delta).toBeNull();
  });

  it("NEGATIVE: refuses to compare scenarios from different tenants", () => {
    const left = scenario("A");
    const right = scenario("B", { provenance: { ...prov("B"), tenantId: "TEN_FOREIGN" } });
    expect(() => compareScenarios(left, right)).toThrow(/different tenants/i);
  });

  it("freezes a scenario on publication and refuses further mutation", () => {
    const published = publishScenario(scenario("PUB"));
    expect(published.published).toBe(true);
    expect(() => assertScenarioMutable(published)).toThrow(/immutable/i);
    expect(() => publishScenario(published)).toThrow(/already published/i);
  });

  it("POSITIVE: governed comparison succeeds and is marked simulation-only", async () => {
    const result = await compareScenariosGoverned(
      ctx({ traceId: `${RUN}-scen` }),
      scenario("BASE"),
      scenario("DOWN", { drivers: [driver("VOLUME", "70.00")] }),
    );
    expect(result.qualifier).toBe("SIMULATION_ONLY");
    expect(result.data.driverDeltas[0].delta).toBe("30.00");
  });
});

// ---------------------------------------------------------------------------
// §11 RISK SIGNALS
// ---------------------------------------------------------------------------

describe("risk signal engine", () => {
  const adverse = (period: string, amount: string) =>
    calculateVariance({
      kind: "ACTUAL_VS_BUDGET",
      seriesCode: "COST",
      periodDate: period,
      left: { label: "A", value: amount, currency: "USD", basis: "OBSERVED" },
      right: { label: "B", value: "0.00", currency: "USD", basis: "OBSERVED" },
      higherIsFavourable: false,
    });

  it("POSITIVE: detects accelerating adverse variance", () => {
    const signals = deriveRiskSignals({
      variances: [adverse("2025-01-01", "10.00"), adverse("2025-02-01", "20.00"), adverse("2025-03-01", "40.00")],
    });
    const s = signals.find((x) => x.code === "VARIANCE_ACCELERATION");
    expect(s).toBeDefined();
    expect(s?.severity).toBe("HIGH");
    expect(s?.advisoryOnly).toBe(true);
  });

  it("detects data-quality degradation and scenario fragility", () => {
    const signals = deriveRiskSignals({
      dataQuality: [
        { code: "DUPLICATE_OBSERVATION", severity: "HIGH", detail: "d", affected: [] },
        { code: "MISSING_PROVENANCE", severity: "HIGH", detail: "d", affected: [] },
        { code: "INVALID_DATE", severity: "HIGH", detail: "d", affected: [] },
      ],
      scenarios: [
        scenario("FRAGILE", {
          assumptions: [
            { assumptionCode: "A1", statement: "s", basis: "ASSUMED", owner: "o", effectiveFrom: "2020-01-01", status: "OPEN" },
            { assumptionCode: "A2", statement: "s", basis: "ASSUMED", owner: "o", effectiveFrom: "2020-01-01", status: "CONFIRMED" },
          ],
        }),
      ],
    });
    expect(signals.map((s) => s.code)).toEqual(
      expect.arrayContaining(["DATA_QUALITY_DEGRADATION", "SCENARIO_FRAGILITY"]),
    );
  });

  it("NEGATIVE: raises nothing on clean, stable inputs", () => {
    expect(deriveRiskSignals({ variances: [], dataQuality: [], scenarios: [] })).toEqual([]);
  });

  it("every signal is advisory and carries no execution field", () => {
    const signals = deriveRiskSignals({ variances: [adverse("2025-01-01", "10.00"), adverse("2025-02-01", "20.00")] });
    for (const s of signals) {
      expect(s.advisoryOnly).toBe(true);
      expect(Object.keys(s)).not.toContain("execute");
    }
  });
});

// ---------------------------------------------------------------------------
// §9 MANAGEMENT REPORTING + §21 ACCOUNTING FIREWALL
// ---------------------------------------------------------------------------

describe("management reporting", () => {
  it("POSITIVE: generates a classified report and states that actuals are unavailable", async () => {
    const result = await generateManagementReport(ctx({ traceId: `${RUN}-report` }), {
      reportCode: "MR-1",
      periodLabel: "2025-Q1",
      variances: [
        calculateVariance({
          kind: "ACTUAL_VS_FORECAST",
          seriesCode: "REV",
          periodDate: "2025-01-01",
          left: { label: "A", value: "100.00", currency: "USD", basis: "FORECAST" },
          right: { label: "F", value: "90.00", currency: "USD", basis: "FORECAST" },
        }),
      ],
      scenarios: [scenario("BASE")],
      observations: [obs("2025-01-01", "10.00")],
      assumptions: [
        { assumptionCode: "A1", statement: "Growth continues", basis: "ASSUMED", owner: "cfo", effectiveFrom: "2020-01-01", status: "OPEN" },
      ],
    });

    const report = result.data;
    expect(report.executiveSummary.join(" ")).toMatch(/DATA_NOT_AVAILABLE/);
    expect(report.sections.map((s) => s.classification)).toEqual(
      expect.arrayContaining(["FACT", "FORECAST", "SCENARIO", "ASSUMPTION"]),
    );
    expect(report.openAssumptions).toHaveLength(1);
  });

  it("ACCOUNTING FIREWALL: every recommendation terminates at RECOMMENDATION or REQUIRES_AUTHORITY", async () => {
    const result = await generateManagementReport(ctx({ traceId: `${RUN}-firewall` }), {
      reportCode: "MR-2",
      periodLabel: "2025-Q1",
      variances: [
        calculateVariance({
          kind: "ACTUAL_VS_BUDGET",
          seriesCode: "X",
          periodDate: "2025-01-01",
          left: { label: "A", value: "10.00", currency: "USD", basis: "OBSERVED" },
          right: { label: "B", value: "5.00", currency: "USD", basis: "OBSERVED" },
        }),
      ],
    });
    expect(result.data.recommendations.length).toBeGreaterThan(0);
    for (const rec of result.data.recommendations) {
      expect(["RECOMMENDATION", "REQUIRES_AUTHORITY"]).toContain(rec.status);
    }
    const authorityBound = result.data.recommendations.filter((r) => r.status === "REQUIRES_AUTHORITY");
    expect(authorityBound.length).toBeGreaterThan(0);
    expect(authorityBound[0].blockedBy.length).toBeGreaterThan(0);
  });

  it("cannot be poisoned by a caller-supplied 'actual' — actuals are re-read canonically", async () => {
    const result = await generateManagementReport(ctx({ traceId: `${RUN}-poison` }), {
      reportCode: "MR-3",
      periodLabel: "2025-Q1",
      // A caller cannot inject actuals: the report re-reads them through the adapter.
      observations: [obs("2025-01-01", "999999.00", { basis: "ASSUMED" })],
    });
    expect(result.data.executiveSummary.join(" ")).toMatch(/DATA_NOT_AVAILABLE/);
  });

  it("writes no ledger rows", async () => {
    const before = await count(sql`select count(*)::int n from journal_entries`);
    await generateManagementReport(ctx({ traceId: `${RUN}-nowrite` }), {
      reportCode: "MR-4",
      periodLabel: "X",
    });
    expect(await count(sql`select count(*)::int n from journal_entries`)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// GOVERNED OPERATIONS + KPIs
// ---------------------------------------------------------------------------

describe("governed FP&A operations", () => {
  it("POSITIVE: variance analysis runs through the platform and emits audit", async () => {
    const traceId = `${RUN}-varsvc`;
    const result = await analyseVariance(ctx({ traceId }), [
      {
        kind: "ACTUAL_VS_BUDGET",
        seriesCode: "REV",
        periodDate: "2025-01-01",
        left: { label: "A", value: "110.00", currency: "USD", basis: "OBSERVED" },
        right: { label: "B", value: "100.00", currency: "USD", basis: "OBSERVED" },
        higherIsFavourable: true,
      },
    ]);
    expect(result.data.variances).toHaveLength(1);
    expect(await count(sql`select count(*)::int n from audit_log where object_id = ${traceId}`)).toBe(1);
  });

  it("POSITIVE: forecasting is reused, not reimplemented", async () => {
    const result = await fpnaForecast(ctx({ traceId: `${RUN}-fc` }), {
      seriesCode: "REV",
      observations: [
        { periodDate: "2025-01-01", value: "100.00", currency: "USD", sourceType: "T", sourceId: "1" },
        { periodDate: "2025-02-01", value: "110.00", currency: "USD", sourceType: "T", sourceId: "2" },
      ],
      horizon: 2,
      method: "LINEAR_TREND",
    });
    expect(result.specialist).toBe("FORECASTING"); // delegated, not duplicated
    expect(result.data.points).toHaveLength(2);
  });

  it("POSITIVE: KPIs return values only where structurally derivable", async () => {
    const result = await readKpis(ctx({ traceId: `${RUN}-kpi` }));
    const byCode = Object.fromEntries(result.data.kpis.map((k) => [k.code, k]));
    expect(byCode.LEDGER_ENTRY_COUNT.state).toBe("AVAILABLE");
    expect(byCode.NET_INCOME.value).toBeNull();
    expect(byCode.NET_INCOME.state).toBe("REQUIRES_AUTHORITY");
    expect(byCode.EBITDA.note).toMatch(/P1|P2|P6/);
  });
});

// ---------------------------------------------------------------------------
// STATE INTEGRITY
// ---------------------------------------------------------------------------

describe("FP&A suite leaves the system exactly as found", () => {
  it("changed no financial state", async () => {
    const row = (
      await rowsOf<Record<string, number>>(sql`
        select (select count(*) from journal_entries)::int je,
               (select count(*) from journal_lines)::int jl,
               (select count(*) from ledger_accounts)::int la,
               (select count(*) from financial_periods)::int fp,
               (select count(*) from capital_requests where status = 'FUNDED')::int funded
      `)
    )[0];
    expect(row).toEqual({ je: 0, jl: 0, la: 0, fp: 0, funded: 0 });
  });

  it("left every decision PENDING and every capability LOCKED", async () => {
    expect(
      await count(sql`select count(*)::int n from governance_decision_registry where status <> 'PENDING'`),
    ).toBe(0);
    expect(
      await count(
        sql`select count(*)::int n from governance_capability_registry where activation_status <> 'LOCKED'`,
      ),
    ).toBe(0);
  });

  it("left no production trigger disabled", async () => {
    expect(
      await count(sql`
        select count(*)::int n from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where not t.tgisinternal and t.tgenabled <> 'O'
      `),
    ).toBe(0);
  });
});
