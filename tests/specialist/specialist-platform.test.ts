/**
 * Phase 7B — common specialist platform and the three production specialists.
 *
 * The governing test principle for this phase: a deny-only suite is unacceptable. Every security
 * boundary below has a NEGATIVE control (it refuses what it should refuse), a POSITIVE control
 * (it genuinely succeeds when it should), and the security-critical ones are fault-injected
 * separately. Without the positive controls, every test here would pass against a platform that
 * threw unconditionally.
 *
 * Destructive probes never touch seeded governance data: registry mutations are made inside the
 * `withActivated` helper which restores in `finally`, and the suite asserts afterwards that all
 * decisions are PENDING and all capabilities LOCKED.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ROLES } from "@/lib/constants";
import type { Principal } from "@/lib/authz";
import {
  SpecialistError,
  bandRisk,
  runSpecialist,
  selectEffectiveRules,
  type SpecialistContext,
} from "@/lib/specialist/platform";
import { forecast, project } from "@/lib/specialist/forecasting";
import { detectFindings, scanAuditIntelligence, verifyLedgerImmutability } from "@/lib/specialist/audit-intelligence";
import {
  assess,
  assessTax,
  clearTaxRules,
  listTaxRules,
  registerTaxRule,
  type TaxRule,
} from "@/lib/specialist/tax-intelligence";

const RUN = `SP${Date.now()}`;

let tenantId = "";
let entityId = "";
let foreignEntityId = "";

function principal(overrides: Partial<Principal> = {}): Principal {
  const roles = overrides.roles ?? ["GROUP_CFO", "AUDITOR"];
  const permissions = new Set<never>();
  for (const role of roles) {
    const def = (ROLES as Record<string, { permissions?: readonly string[] }>)[role];
    for (const p of def?.permissions ?? []) permissions.add(p as never);
  }
  return {
    userId: "USR_SPEC_TEST",
    partyId: "p",
    email: "s@example.test",
    displayName: "Specialist Test",
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
    traceId: `${RUN}-trace-01`,
    ...overrides,
  };
}

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  const r = (await db.execute(query)) as unknown as { rows?: T[] };
  return r.rows ?? (r as unknown as T[]);
}
async function count(query: Parameters<typeof db.execute>[0]): Promise<number> {
  return Number((await rows<{ n: number }>(query))[0].n);
}

/** Grants genuine authority for a capability, runs fn, always restores. */
async function withActivated<T>(capability: string, decisions: string[], fn: () => Promise<T>): Promise<T> {
  const [approved] = await rows<{ id: string }>(
    sql`select id from resolutions where status = 'APPROVED' limit 1`,
  );
  expect(approved?.id, "no APPROVED resolution available").toBeTruthy();
  try {
    for (const d of decisions) {
      await db.execute(sql`
        update governance_decision_registry
        set status = 'ACTIVATED', activation_status = 'ACTIVATED', resolution_id = ${approved.id},
            provenance = 'GOVERNED', effective_from = '2020-01-01', approving_body = 'TEST',
            decision_maker = 'TEST', evidence = 'test'
        where decision_id = ${d}
      `);
    }
    await db.execute(
      sql`update governance_capability_registry set activation_status = 'ACTIVATED' where capability_code = ${capability}`,
    );
    return await fn();
  } finally {
    for (const d of decisions) {
      await db.execute(sql`
        update governance_decision_registry
        set status = 'PENDING', activation_status = 'LOCKED', resolution_id = null, provenance = null,
            effective_from = null, effective_to = null, approving_body = null, decision_maker = null,
            evidence = null
        where decision_id = ${d}
      `);
    }
    await db.execute(
      sql`update governance_capability_registry set activation_status = 'LOCKED' where capability_code = ${capability}`,
    );
  }
}

beforeAll(async () => {
  const [entity] = await rows<{ id: string; tenant_id: string }>(
    sql`select id, tenant_id from legal_entities order by id limit 1`,
  );
  entityId = entity.id;
  tenantId = entity.tenant_id;
  const [foreign] = await rows<{ id: string }>(
    sql`select id from legal_entities where tenant_id <> ${tenantId} order by id limit 1`,
  );
  foreignEntityId = foreign?.id ?? "LEN_NONEXISTENT";
});

afterAll(() => {
  clearTaxRules();
});

// ---------------------------------------------------------------------------
// PLATFORM
// ---------------------------------------------------------------------------

describe("specialist platform — canonical execution pattern", () => {
  const descriptor = {
    specialist: "TEST",
    operation: "PROBE",
    kind: "ANALYSIS" as const,
    permission: "finance:ledger.read" as const,
    version: "test-1",
    riskClass: "LOW" as const,
  };
  const body = async () => ({
    data: { ok: true },
    provenance: { sources: [], assumptions: [], blockedBy: [] },
    explanation: ["probe"],
  });

  it("POSITIVE: runs and returns a fully-formed result with provenance", async () => {
    const result = await runSpecialist(descriptor, ctx(), body);
    expect(result.data).toEqual({ ok: true });
    expect(result.qualifier).toBe("AUTHORITATIVE");
    expect(result.specialist).toBe("TEST");
    expect(result.version).toBe("test-1");
    expect(result.traceId).toBe(`${RUN}-trace-01`);
    expect(result.explanation.length).toBeGreaterThan(0);
    expect(result.producedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("POSITIVE: emits exactly one audit record and one event for an ANALYSIS run", async () => {
    const traceId = `${RUN}-audited`;
    await runSpecialist(descriptor, ctx({ traceId }), body);
    expect(
      await count(sql`select count(*)::int n from audit_log where object_id = ${traceId}`),
    ).toBe(1);
    expect(
      await count(sql`select count(*)::int n from enterprise_events where subject_id = ${traceId}`),
    ).toBe(1);
  });

  it("NEGATIVE: refuses a principal lacking the declared permission", async () => {
    await expect(
      runSpecialist(descriptor, ctx({ principal: principal({ roles: ["HCM_DIRECTOR"] }) }), body),
    ).rejects.toMatchObject({ code: "DENIED" });
  });

  it("NEGATIVE: refuses a cross-tenant request without confirming existence", async () => {
    await expect(
      runSpecialist(descriptor, ctx({ tenantId: "TEN_SOMEONE_ELSE" }), body),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  /**
   * Isolates the TENANT control specifically. The earlier cross-tenant test also supplies an
   * entity, so the entity check would reject it even if tenant isolation were removed — fault
   * injection proved exactly that, and this test was added to close the gap. With
   * legalEntityId null, only the tenant predicate can refuse.
   */
  it("NEGATIVE: refuses a cross-tenant request with NO entity, isolating the tenant control", async () => {
    await expect(
      runSpecialist(descriptor, ctx({ tenantId: "TEN_SOMEONE_ELSE", legalEntityId: null }), body),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("NEGATIVE: refuses an entity belonging to another tenant", async () => {
    await expect(
      runSpecialist(descriptor, ctx({ legalEntityId: foreignEntityId }), body),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("NEGATIVE: refuses an entity outside the principal's entity scope", async () => {
    await expect(
      runSpecialist(
        descriptor,
        ctx({ principal: principal({ entityScope: [`${entityId}_OTHER`] }) }),
        body,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("NEGATIVE: rejects a malformed trace id, keeping log correlation trustworthy", async () => {
    await expect(runSpecialist(descriptor, ctx({ traceId: "x" }), body)).rejects.toMatchObject({
      code: "RULE_VIOLATION",
    });
  });

  it("NEGATIVE: a WRITE operation with a locked capability fails closed", async () => {
    await expect(
      runSpecialist(
        { ...descriptor, kind: "WRITE", capabilityCode: "CAP_POSTING" },
        ctx({ traceId: `${RUN}-write` }),
        body,
      ),
    ).rejects.toMatchObject({ code: "CAPABILITY_LOCKED" });
  });

  it("qualifies an ANALYSIS result as REQUIRES_AUTHORITY when its capability is locked", async () => {
    const result = await runSpecialist(
      { ...descriptor, capabilityCode: "CAP_SPEC_TAX_ASSESS" },
      ctx({ traceId: `${RUN}-qualified` }),
      body,
    );
    expect(result.qualifier).toBe("REQUIRES_AUTHORITY");
    expect(result.provenance.blockedBy).toContain("P3");
  });

  it("POSITIVE: the same ANALYSIS becomes AUTHORITATIVE once the capability is activated", async () => {
    // P3 depends on P1, so both must be activated. The gate's transitive dependency check is
    // correct to refuse a partial chain; the fixture must satisfy it honestly.
    await withActivated("CAP_SPEC_TAX_ASSESS", ["P1", "P3"], async () => {
      const result = await runSpecialist(
        { ...descriptor, capabilityCode: "CAP_SPEC_TAX_ASSESS" },
        ctx({ traceId: `${RUN}-unqualified` }),
        body,
      );
      expect(result.qualifier).toBe("AUTHORITATIVE");
    });
  });

  it("marks SIMULATION results as simulation-only even with no capability", async () => {
    const result = await runSpecialist(
      { ...descriptor, kind: "SIMULATION" },
      ctx({ traceId: `${RUN}-sim` }),
      body,
    );
    expect(result.qualifier).toBe("SIMULATION_ONLY");
  });
});

describe("specialist platform — shared helpers", () => {
  it("selects effective rules inclusively at both boundaries", () => {
    const rules = [
      { code: "A", effectiveFrom: "2024-01-01", effectiveTo: "2024-12-31" },
      { code: "B", effectiveFrom: "2025-01-01", effectiveTo: null },
      { code: "C", effectiveFrom: "2030-01-01", effectiveTo: null },
    ];
    expect(selectEffectiveRules(rules, "2024-12-31").map((r) => r.code)).toEqual(["A"]);
    expect(selectEffectiveRules(rules, "2025-01-01").map((r) => r.code)).toEqual(["B"]);
    expect(selectEffectiveRules(rules, "2029-12-31").map((r) => r.code)).toEqual(["B"]);
  });

  it("rejects a malformed asOf date rather than guessing", () => {
    expect(() => selectEffectiveRules([], "01/01/2025")).toThrow(SpecialistError);
  });

  it("bands risk deterministically and rejects out-of-range scores", () => {
    expect(bandRisk(0)).toBe("LOW");
    expect(bandRisk(24)).toBe("LOW");
    expect(bandRisk(25)).toBe("MEDIUM");
    expect(bandRisk(50)).toBe("HIGH");
    expect(bandRisk(75)).toBe("CRITICAL");
    expect(() => bandRisk(101)).toThrow(SpecialistError);
    expect(() => bandRisk(-1)).toThrow(SpecialistError);
  });
});

// ---------------------------------------------------------------------------
// FORECASTING
// ---------------------------------------------------------------------------

describe("forecasting intelligence", () => {
  const obs = (n: number, value: string) => ({
    periodDate: `2025-${String(n).padStart(2, "0")}-01`,
    value,
    currency: "USD",
    sourceType: "TEST_OBSERVATION",
    sourceId: `OBS-${n}`,
  });

  it("POSITIVE: projects a flat series with NAIVE_LAST", () => {
    const out = project({
      seriesCode: "S1",
      observations: [obs(1, "100.00"), obs(2, "100.00"), obs(3, "100.00")],
      horizon: 3,
      method: "NAIVE_LAST",
    });
    expect(out.points).toHaveLength(3);
    expect(out.points.every((p) => p.value === "100.00")).toBe(true);
    expect(out.confidence).toBeGreaterThan(0);
  });

  it("POSITIVE: LINEAR_TREND extrapolates a rising series", () => {
    const out = project({
      seriesCode: "S2",
      observations: [obs(1, "100.00"), obs(2, "110.00"), obs(3, "120.00")],
      horizon: 2,
      method: "LINEAR_TREND",
    });
    expect(out.points[0].value).toBe("130.00");
    expect(out.points[1].value).toBe("140.00");
  });

  it("POSITIVE: MOVING_AVERAGE smooths a volatile series", () => {
    const out = project({
      seriesCode: "S3",
      observations: [obs(1, "100.00"), obs(2, "200.00"), obs(3, "300.00")],
      horizon: 1,
      method: "MOVING_AVERAGE",
      window: 3,
    });
    expect(out.points[0].value).toBe("200.00");
  });

  it("is deterministic — identical inputs give byte-identical output", () => {
    const req = {
      seriesCode: "S4",
      observations: [obs(1, "10.00"), obs(2, "20.00"), obs(3, "31.00")],
      horizon: 4,
      method: "LINEAR_TREND" as const,
    };
    expect(JSON.stringify(project(req))).toBe(JSON.stringify(project(req)));
  });

  it("widens the uncertainty band as the horizon extends", () => {
    const out = project({
      seriesCode: "S5",
      observations: [obs(1, "100.00"), obs(2, "150.00"), obs(3, "90.00")],
      horizon: 3,
      method: "NAIVE_LAST",
    });
    const spread = (p: { upperBound: string; lowerBound: string }) =>
      Number(p.upperBound) - Number(p.lowerBound);
    expect(spread(out.points[2])).toBeGreaterThan(spread(out.points[0]));
  });

  it("NEGATIVE: refuses cross-currency observations rather than assuming an FX rate", () => {
    expect(() =>
      project({
        seriesCode: "S6",
        observations: [obs(1, "100.00"), { ...obs(2, "100.00"), currency: "TZS" }],
        horizon: 1,
        method: "NAIVE_LAST",
      }),
    ).toThrow(/multiple currencies|P4/i);
  });

  it("NEGATIVE: rejects empty observations, bad horizons and malformed amounts", () => {
    expect(() => project({ seriesCode: "X", observations: [], horizon: 1, method: "NAIVE_LAST" })).toThrow();
    expect(() =>
      project({ seriesCode: "X", observations: [obs(1, "1.00")], horizon: 0, method: "NAIVE_LAST" }),
    ).toThrow();
    expect(() =>
      project({ seriesCode: "X", observations: [obs(1, "1.005")], horizon: 1, method: "NAIVE_LAST" }),
    ).toThrow();
  });

  it("POSITIVE: governed forecast succeeds and declares its accounting dependency", async () => {
    const result = await forecast(ctx({ traceId: `${RUN}-forecast` }), {
      seriesCode: "REVENUE",
      observations: [obs(1, "1000.00"), obs(2, "1100.00")],
      horizon: 2,
      method: "LINEAR_TREND",
      assumptions: ["Trading conditions unchanged"],
    });
    expect(result.data.points).toHaveLength(2);
    expect(result.provenance.sources).toHaveLength(2);
    expect(result.provenance.assumptions).toContain("Trading conditions unchanged");
    // It must never silently imply an accounting basis.
    expect(result.provenance.blockedBy).toEqual(expect.arrayContaining(["P1", "P6"]));
    expect(result.explanation.join(" ")).toMatch(/not a measurement|not an instruction/i);
  });

  it("writes no ledger rows, ever", async () => {
    const before = await count(sql`select count(*)::int n from journal_entries`);
    await forecast(ctx({ traceId: `${RUN}-noledger` }), {
      seriesCode: "X",
      observations: [obs(1, "5.00"), obs(2, "6.00")],
      horizon: 1,
      method: "NAIVE_LAST",
    });
    expect(await count(sql`select count(*)::int n from journal_entries`)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// AUDIT INTELLIGENCE
// ---------------------------------------------------------------------------

describe("audit intelligence", () => {
  const row = (over: Partial<Record<string, unknown>> = {}) => ({
    id: `AUD-${Math.random().toString(36).slice(2, 8)}`,
    action: "governance.resolution.vote",
    actorUserId: "USR_A",
    objectType: "RESOLUTION",
    objectId: "RES_1",
    outcome: "SUCCESS",
    occurredAt: new Date(),
    ...over,
  });

  it("POSITIVE: detects repeated authorisation denials", () => {
    const findings = detectFindings([
      row({ outcome: "DENIED" }),
      row({ outcome: "DENIED" }),
      row({ outcome: "DENIED" }),
      row({ outcome: "DENIED" }),
    ] as never);
    const f = findings.find((x) => x.code === "REPEATED_AUTHORIZATION_DENIAL");
    expect(f).toBeDefined();
    expect(f?.evidence.length).toBeGreaterThan(0);
    expect(f?.requiresAuthority).toBe(false);
  });

  it("POSITIVE: flags privileged financial actions for authority confirmation", () => {
    const findings = detectFindings([row({ action: "finance.ledger.post" })] as never);
    const f = findings.find((x) => x.code === "PRIVILEGED_FINANCIAL_ACTION_OBSERVED");
    expect(f).toBeDefined();
    expect(f?.requiresAuthority).toBe(true);
  });

  it("POSITIVE: detects a segregation-of-duties concern and defers to P9", () => {
    const findings = detectFindings([
      row({ action: "governance.resolution.propose", actorUserId: "USR_SOLO" }),
      row({ action: "governance.resolution.approve", actorUserId: "USR_SOLO" }),
    ] as never);
    const f = findings.find((x) => x.code === "SEGREGATION_OF_DUTIES_CONCERN");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("HIGH");
    expect(f?.recommendedAction).toMatch(/P9/);
  });

  it("NEGATIVE: raises nothing on clean, unremarkable history", () => {
    const findings = detectFindings([
      row({ actorUserId: "U1", objectId: "R1" }),
      row({ actorUserId: "U2", objectId: "R2" }),
    ] as never);
    expect(findings.filter((f) => f.code !== "PRIVILEGED_FINANCIAL_ACTION_OBSERVED")).toEqual([]);
  });

  it("POSITIVE: governed scan runs, tests structural controls and returns findings", async () => {
    const result = await scanAuditIntelligence(ctx({ traceId: `${RUN}-auditscan` }), {
      windowDays: 3650,
    });
    expect(result.data.controls.length).toBeGreaterThanOrEqual(4);
    // These are policy-independent structural controls and must pass on a healthy system.
    expect(result.data.controls.filter((c) => c.status === "FAIL")).toEqual([]);
    expect(result.data.auditRecordsExamined).toBeGreaterThan(0);
    expect(result.qualifier).toBe("AUTHORITATIVE");
  });

  it("NEGATIVE: denies a principal without audit read permission", async () => {
    await expect(
      scanAuditIntelligence(
        ctx({ principal: principal({ roles: ["HCM_DIRECTOR"] }), traceId: `${RUN}-auditdeny` }),
      ),
    ).rejects.toMatchObject({ code: "DENIED" });
  });

  it("confirms the append-only ledgers remain protected", async () => {
    const result = await verifyLedgerImmutability();
    expect(result.intact).toBe(true);
    expect(result.auditTriggers).toBeGreaterThanOrEqual(2);
    expect(result.eventTriggers).toBeGreaterThanOrEqual(2);
  });

  it("cannot authorise anything — every finding is advisory", () => {
    const findings = detectFindings([row({ action: "finance.ledger.post" })] as never);
    for (const f of findings) {
      expect(f).toHaveProperty("recommendedAction");
      expect(Object.keys(f)).not.toContain("execute");
    }
  });
});

// ---------------------------------------------------------------------------
// TAX INTELLIGENCE
// ---------------------------------------------------------------------------

describe("tax intelligence", () => {
  /** Synthetic rule in a fictitious jurisdiction. No real rate or legal position is expressed. */
  const syntheticRule = (over: Partial<TaxRule> = {}): TaxRule => ({
    ruleCode: `${RUN}-RULE-A`,
    jurisdictionCode: "ZZ",
    taxType: "VAT",
    description: "synthetic test rule",
    legalSource: "Fictitious Test Act, s.1",
    effectiveFrom: "2020-01-01",
    effectiveTo: null,
    authority: "AUTHORITATIVE",
    applicability: {},
    evidenceRequirements: ["Test evidence"],
    auditRiskScore: 10,
    ...over,
  });

  it("ships with an empty rule registry — no rate or position is hard-coded", () => {
    clearTaxRules();
    expect(listTaxRules()).toEqual([]);
  });

  it("NEGATIVE: refuses to register a rule lacking legal source, dates or evidence", () => {
    clearTaxRules();
    expect(() => registerTaxRule(syntheticRule({ legalSource: "" }))).toThrow(/legal source/i);
    expect(() => registerTaxRule(syntheticRule({ evidenceRequirements: [] }))).toThrow(/evidence/i);
    expect(() => registerTaxRule(syntheticRule({ effectiveFrom: "not-a-date" }))).toThrow();
    expect(() =>
      registerTaxRule(syntheticRule({ effectiveFrom: "2025-01-01", effectiveTo: "2020-01-01" })),
    ).toThrow(/precede/i);
    expect(() => registerTaxRule(syntheticRule({ auditRiskScore: 500 }))).toThrow();
    expect(listTaxRules()).toEqual([]);
  });

  it("POSITIVE: an authoritative, in-scope, effective rule yields an APPLICABLE candidate", () => {
    clearTaxRules();
    registerTaxRule(syntheticRule());
    const out = assess({
      jurisdictionCode: "ZZ",
      taxType: "VAT",
      amountMinor: 100_00,
      currency: "USD",
      asOf: "2025-06-01",
    });
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0].status).toBe("APPLICABLE");
    expect(out.complianceChecklist).toContain("Test evidence");
  });

  it("never computes a liability, even for an applicable rule", () => {
    clearTaxRules();
    registerTaxRule(syntheticRule());
    const out = assess({
      jurisdictionCode: "ZZ",
      taxType: "VAT",
      amountMinor: 1_000_00,
      currency: "USD",
      asOf: "2025-06-01",
    });
    expect(out.computedLiability).toBeNull();
    expect(out.computedLiabilityReason).toMatch(/P3|locked/i);
  });

  it("routes a non-authoritative rule to specialist review rather than applying it", () => {
    clearTaxRules();
    registerTaxRule(syntheticRule({ authority: "UNVERIFIED" }));
    const out = assess({
      jurisdictionCode: "ZZ",
      taxType: "VAT",
      amountMinor: 100_00,
      currency: "USD",
      asOf: "2025-06-01",
    });
    expect(out.candidates[0].status).toBe("REQUIRES_SPECIALIST_REVIEW");
  });

  it("excludes a rule that is not yet effective and one that has expired", () => {
    clearTaxRules();
    registerTaxRule(syntheticRule({ ruleCode: "FUTURE", effectiveFrom: "2030-01-01" }));
    registerTaxRule(
      syntheticRule({ ruleCode: "EXPIRED", effectiveFrom: "2019-01-01", effectiveTo: "2019-12-31" }),
    );
    const out = assess({
      jurisdictionCode: "ZZ",
      taxType: "VAT",
      amountMinor: 100_00,
      currency: "USD",
      asOf: "2025-06-01",
    });
    expect(out.candidates).toEqual([]);
    expect(out.overallRisk).toBe("HIGH"); // no applicable rule is itself a risk
  });

  it("marks an out-of-scope rule NOT_APPLICABLE with a reason", () => {
    clearTaxRules();
    registerTaxRule(syntheticRule({ applicability: { minAmountMinor: 1_000_000_00 } }));
    const out = assess({
      jurisdictionCode: "ZZ",
      taxType: "VAT",
      amountMinor: 100_00,
      currency: "USD",
      asOf: "2025-06-01",
    });
    expect(out.candidates[0].status).toBe("NOT_APPLICABLE");
    expect(out.candidates[0].reason).toMatch(/lower bound/i);
  });

  it("POSITIVE: governed assessment runs but is qualified REQUIRES_AUTHORITY while P3 is pending", async () => {
    clearTaxRules();
    registerTaxRule(syntheticRule());
    const result = await assessTax(ctx({ traceId: `${RUN}-tax` }), {
      jurisdictionCode: "ZZ",
      taxType: "VAT",
      amountMinor: 500_00,
      currency: "USD",
      asOf: "2025-06-01",
    });
    expect(result.qualifier).toBe("REQUIRES_AUTHORITY");
    expect(result.provenance.blockedBy).toContain("P3");
    expect(result.data.computedLiability).toBeNull();
    expect(result.explanation.join(" ")).toMatch(/no legal conclusion is asserted/i);
  });

  it("NEGATIVE: denies a principal without tax read permission", async () => {
    await expect(
      assessTax(ctx({ principal: principal({ roles: ["HCM_DIRECTOR"] }), traceId: `${RUN}-taxdeny` }), {
        jurisdictionCode: "ZZ",
        taxType: "VAT",
        amountMinor: 100,
        currency: "USD",
        asOf: "2025-06-01",
      }),
    ).rejects.toMatchObject({ code: "DENIED" });
  });
});

// ---------------------------------------------------------------------------
// STATE INTEGRITY
// ---------------------------------------------------------------------------

describe("specialist suite leaves the system exactly as found", () => {
  it("wrote no financial state", async () => {
    const row = (
      await rows<Record<string, number>>(sql`
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
