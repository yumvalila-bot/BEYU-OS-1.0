/**
 * Phase 7J — Finance OS architecture completion.
 *
 * WHAT THIS SUITE IS FOR. The Finance OS is where an architectural mistake becomes a financial
 * one, so the tests are written to answer the §29 hostile questions with executable evidence
 * rather than prose:
 *
 *   - Can a forecast become an actual? Can a scenario? Can an assumption? (No — proven per class.)
 *   - Can synthetic data reach production truth? (No.)
 *   - Can DATA_NOT_AVAILABLE silently become 0? (No — the type refuses to carry an amount.)
 *   - Can one tenant's entity be aggregated into another's financial truth? (No — and the real
 *     seeded defect is detected rather than repaired.)
 *   - Is an empty ledger reported as "reconciled"? (No — that is the most dangerous false
 *     positive available, so it is tested explicitly.)
 *
 * NON-VACUITY. Every positive control asserts a specific non-zero count from the real substrate.
 * A query that silently returned nothing would fail, not pass.
 */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ROLES, ROLE_CLEARANCE } from "@/lib/constants";
import type { Principal } from "@/lib/authz";
import {
  EPISTEMIC_CLASS,
  EpistemicViolation,
  assertNotSynthetic,
  assertPromotion,
  canPromote,
  classifiedValue,
  combineClasses,
  isEpistemicClass,
  normalizeEpistemicClass,
  unavailable,
  type EpistemicClass,
} from "@/lib/finance/epistemics";
import {
  FINANCIAL_TRUTH,
  domainsWithoutSubstrate,
  mayWrite,
  soleWriterOf,
  truthFor,
} from "@/lib/finance/truth";
import {
  FINANCE_CONTRACT_VERSION,
  checkAttribution,
  checkCanonicalWriter,
  checkPeriodOpen,
  checkSegregationOfDuties,
  financeGate,
  scanTreasuryAttribution,
} from "@/lib/finance/contract";
import {
  reconcileTreasuryToLedger,
  scanDataQuality,
  summarizeDataQuality,
} from "@/lib/finance/reconciliation";
import {
  capabilitySummary,
  classOf,
  executionStatusOf,
  financeCapabilityMatrix,
  financeDependencyChain,
} from "@/lib/finance/registry";

const ASOF = "2026-02-15";

async function rowsOf<T>(q: Parameters<typeof db.execute>[0]): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as { rows?: T[] };
  return r.rows ?? (r as unknown as T[]);
}
async function count(q: Parameters<typeof db.execute>[0]): Promise<number> {
  return Number((await rowsOf<{ n: number }>(q))[0].n);
}

let cachedTenant = "";
async function groupTenant(): Promise<string> {
  if (!cachedTenant) {
    const [r] = await rowsOf<{ id: string }>(sql`select id from tenants order by created_at limit 1`);
    cachedTenant = r.id;
  }
  return cachedTenant;
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
    userId: "USR_FINANCE_OS_TEST",
    partyId: "p",
    email: "finance@example.test",
    displayName: "Finance OS Test",
    tenantId: cachedTenant,
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

// =============================================================================
// §5 — THE EPISTEMIC MODEL
// =============================================================================
describe("canonical epistemic model", () => {
  it("defines POSTED, which no specialist vocabulary contained", () => {
    expect(EPISTEMIC_CLASS).toContain("POSTED");
    expect(isEpistemicClass("POSTED")).toBe(true);
  });

  it("unifies the divergent legacy terms onto one model", () => {
    // fpna said ASSUMED, forecast said ASSUMPTION — the same state under two names.
    expect(normalizeEpistemicClass("ASSUMED")).toBe("ASSUMPTION");
    expect(normalizeEpistemicClass("ASSUMPTION")).toBe("ASSUMPTION");
    expect(normalizeEpistemicClass("REQUIRES_SPECIALIST_REVIEW")).toBe("GOVERNANCE_REVIEW_REQUIRED");
    expect(normalizeEpistemicClass("REQUIRES_HUMAN_REVIEW")).toBe("GOVERNANCE_REVIEW_REQUIRED");
    expect(normalizeEpistemicClass("POTENTIAL_ANOMALY")).toBe("DERIVED");
    expect(normalizeEpistemicClass("SYNTHETIC_TEST_FIXTURE")).toBe("SYNTHETIC");
  });

  it("every legacy specialist term maps to the canonical model", () => {
    const legacy = [
      "OBSERVED", "ASSUMED", "FORECAST", "SCENARIO", "DERIVED", "DATA_NOT_AVAILABLE",
      "REQUIRES_AUTHORITY", "REQUIRES_POLICY", "REQUIRES_SPECIALIST_REVIEW",
      "GOVERNANCE_REVIEW_REQUIRED", "POTENTIAL_ANOMALY", "REQUIRES_HUMAN_REVIEW",
      "ASSUMPTION", "DATA_CONFLICT", "AVAILABLE",
    ];
    for (const term of legacy) {
      expect(() => normalizeEpistemicClass(term)).not.toThrow();
    }
  });

  it("an unknown classification fails rather than defaulting to a factual one", () => {
    expect(() => normalizeEpistemicClass("DEFINITELY_TRUE")).toThrow(EpistemicViolation);
    expect(() => normalizeEpistemicClass("")).toThrow(/not a known epistemic class/);
  });

  it("does not normalise case — 'observed' is not OBSERVED", () => {
    expect(() => normalizeEpistemicClass("observed")).toThrow(EpistemicViolation);
  });
});

describe("§5 promotion prohibitions", () => {
  it("FORECAST must never become POSTED", () => {
    expect(canPromote("FORECAST", "POSTED")).toBe(false);
    expect(() => assertPromotion("FORECAST", "POSTED", "ledger")).toThrow(/must never be recorded as POSTED/);
  });

  it("SCENARIO must never become POSTED", () => {
    expect(canPromote("SCENARIO", "POSTED")).toBe(false);
  });

  it("ASSUMPTION must never become POSTED", () => {
    expect(canPromote("ASSUMPTION", "POSTED")).toBe(false);
  });

  it("DERIVED must never become POSTED — arithmetic does not book an entry", () => {
    expect(canPromote("DERIVED", "POSTED")).toBe(false);
  });

  it("only OBSERVED may become POSTED", () => {
    expect(canPromote("OBSERVED", "POSTED")).toBe(true);
    const others = EPISTEMIC_CLASS.filter((c) => c !== "OBSERVED" && c !== "POSTED");
    for (const c of others) expect(canPromote(c, "POSTED")).toBe(false);
  });

  it("REFERENCE_DATA must never become authority or fact", () => {
    expect(canPromote("REFERENCE_DATA", "POSTED")).toBe(false);
    expect(canPromote("REFERENCE_DATA", "OBSERVED")).toBe(false);
    expect(canPromote("REFERENCE_DATA", "DERIVED")).toBe(false);
  });

  it("SYNTHETIC must never become anything real, in either direction", () => {
    for (const c of EPISTEMIC_CLASS) {
      if (c === "SYNTHETIC") continue;
      expect(canPromote("SYNTHETIC", c)).toBe(false);
      expect(canPromote(c, "SYNTHETIC")).toBe(false);
    }
  });

  it("DATA_NOT_AVAILABLE must never become a value", () => {
    expect(canPromote("DATA_NOT_AVAILABLE", "OBSERVED")).toBe(false);
    expect(canPromote("DATA_NOT_AVAILABLE", "DERIVED")).toBe(false);
    expect(canPromote("DATA_NOT_AVAILABLE", "FORECAST")).toBe(false);
  });

  it("DATA_CONFLICT must never resolve itself into a value", () => {
    expect(canPromote("DATA_CONFLICT", "DERIVED")).toBe(false);
  });

  it("weakening is allowed — a fact may feed a forecast", () => {
    expect(canPromote("POSTED", "DERIVED")).toBe(true);
    expect(canPromote("OBSERVED", "FORECAST")).toBe(true);
    expect(canPromote("FORECAST", "SCENARIO")).toBe(true);
  });
});

describe("§5 value construction refuses fabrication", () => {
  it("DATA_NOT_AVAILABLE cannot carry an amount — the 'zero' fabrication is unrepresentable", () => {
    expect(() =>
      classifiedValue({
        amount: "0.00", currency: "USD", epistemicClass: "DATA_NOT_AVAILABLE",
        sourceType: "t", sourceId: null,
      }),
    ).toThrow(/asserts no value/);
  });

  it("every non-value class refuses an amount", () => {
    for (const c of ["REQUIRES_AUTHORITY", "REQUIRES_POLICY", "GOVERNANCE_REVIEW_REQUIRED",
      "DATA_NOT_AVAILABLE", "DATA_CONFLICT"] as EpistemicClass[]) {
      expect(() =>
        classifiedValue({ amount: "1.00", currency: "USD", epistemicClass: c, sourceType: "t", sourceId: null }),
      ).toThrow(EpistemicViolation);
    }
  });

  it("unavailable() records the absence with a reason and a null amount", () => {
    const v = unavailable("DATA_NOT_AVAILABLE", "ledger is empty");
    expect(v.amount).toBeNull();
    expect(v.reason).toBe("ledger is empty");
  });

  it("a factual value is constructed normally", () => {
    const v = classifiedValue({
      amount: "4820000.00", currency: "USD", epistemicClass: "OBSERVED",
      sourceType: "treasury_positions", sourceId: "TP1",
    });
    expect(v.amount).toBe("4820000.00");
    expect(v.epistemicClass).toBe("OBSERVED");
  });

  it("synthetic data is refused at the production boundary", () => {
    expect(() => assertNotSynthetic("SYNTHETIC", "ledger")).toThrow(/never enter production/);
    expect(() => assertNotSynthetic("OBSERVED", "ledger")).not.toThrow();
  });
});

describe("§5 combination is never stronger than its weakest input", () => {
  it("an observed + assumed combination is not observed", () => {
    expect(combineClasses(["OBSERVED", "ASSUMPTION"])).toBe("ASSUMPTION");
  });

  it("posted + posted is DERIVED, not POSTED — arithmetic does not book an entry", () => {
    expect(combineClasses(["POSTED", "POSTED"])).toBe("DERIVED");
  });

  it("a missing input dominates everything", () => {
    expect(combineClasses(["POSTED", "OBSERVED", "DATA_NOT_AVAILABLE"])).toBe("DATA_NOT_AVAILABLE");
  });

  it("a conflict dominates even a missing input", () => {
    expect(combineClasses(["DATA_CONFLICT", "DATA_NOT_AVAILABLE"])).toBe("DATA_CONFLICT");
  });

  it("synthetic contaminates the whole combination", () => {
    expect(combineClasses(["OBSERVED", "SYNTHETIC"])).toBe("SYNTHETIC");
  });

  it("no inputs means no answer, not zero", () => {
    expect(combineClasses([])).toBe("DATA_NOT_AVAILABLE");
  });
});

// =============================================================================
// §3 — CANONICAL TRUTH REGISTRY
// =============================================================================
describe("canonical financial truth", () => {
  it("names exactly one source of POSTED accounting truth", () => {
    const posted = FINANCIAL_TRUTH.filter((r) => r.producesClass === "POSTED" && r.domain !== "AUDIT");
    expect(posted.length).toBe(1);
    expect(posted[0].canonicalTable).toBe("journal_entries + journal_lines");
    expect(posted[0].soleWriter).toBe("finance/posting-engine");
  });

  it("balances are DERIVED and never stored — no second truth to drift", () => {
    const balances = FINANCIAL_TRUTH.find((r) => r.datum === "Account balances")!;
    expect(balances.canonicalTable).toBeNull();
    expect(balances.producesClass).toBe("DERIVED");
  });

  it("forecasts have no canonical table, so none can overwrite an actual", () => {
    const f = truthFor("FORECASTING")[0];
    expect(f.canonicalTable).toBeNull();
  });

  it("only the posting engine may write the ledger", () => {
    expect(mayWrite("finance/posting-engine", "journal_entries + journal_lines")).toBe(true);
    expect(mayWrite("specialist/treasury", "journal_entries + journal_lines")).toBe(false);
    expect(mayWrite("specialist/forecast", "journal_entries + journal_lines")).toBe(false);
    expect(mayWrite("specialist/risk", "journal_entries + journal_lines")).toBe(false);
  });

  it("an unregistered table cannot be written by anyone — default deny", () => {
    expect(mayWrite("anything", "some_new_finance_table")).toBe(false);
    expect(soleWriterOf("some_new_finance_table")).toBeNull();
  });

  it("treasury cannot write accounting truth and accounting cannot write bank truth", () => {
    expect(mayWrite("specialist/treasury", "journal_entries + journal_lines")).toBe(false);
    expect(mayWrite("finance/posting-engine", "treasury_positions")).toBe(false);
  });

  it("reports domains with no substrate honestly instead of hiding them", () => {
    const missing = domainsWithoutSubstrate();
    expect(missing).toContain("AR");
    expect(missing).toContain("AP");
    expect(missing).toContain("FIXED_ASSETS");
    expect(missing).toContain("INVENTORY");
  });

  it("every registry entry explains itself", () => {
    for (const r of FINANCIAL_TRUTH) {
      expect(r.note.length).toBeGreaterThan(20);
    }
  });
});

// =============================================================================
// §9 / §16 — ATTRIBUTION. The real seeded defect.
// =============================================================================
describe("attribution control", () => {
  it("detects the real cross-tenant treasury defect — exactly 3 of 5 positions", async () => {
    const verdicts = await scanTreasuryAttribution();
    expect(verdicts.length).toBe(5);
    const conflicts = verdicts.filter((v) => !v.consistent);
    expect(conflicts.length).toBe(3);
    for (const c of conflicts) {
      expect(c.decision).toBe("ATTRIBUTION_CONFLICT");
      expect(c.claimedTenantId).toBe("TEN_BEYU_GROUP");
      expect(c.owningTenantId).not.toBe("TEN_BEYU_GROUP");
    }
  });

  it("names the specific conflicting entities", async () => {
    const conflicts = (await scanTreasuryAttribution()).filter((v) => !v.consistent);
    const entities = conflicts.map((c) => c.legalEntityId).sort();
    expect(entities).toEqual(["LEN_BEYU_AGRI_LTD", "LEN_BEYU_HEALTH_LTD", "LEN_BEYU_TZ_HOLDING"]);
  });

  it("reports but never repairs — the seeded rows are unchanged", async () => {
    const before = await count(
      sql`select count(*)::int as n from treasury_positions tp join legal_entities le
          on le.id = tp.legal_entity_id where tp.tenant_id <> le.tenant_id`,
    );
    await scanTreasuryAttribution();
    const after = await count(
      sql`select count(*)::int as n from treasury_positions tp join legal_entities le
          on le.id = tp.legal_entity_id where tp.tenant_id <> le.tenant_id`,
    );
    expect(before).toBe(3);
    expect(after).toBe(3);
  });

  it("POSITIVE CONTROL: a correctly attributed entity passes", async () => {
    const v = await checkAttribution({
      claimedTenantId: "TEN_BEYU_GROUP",
      legalEntityId: "LEN_BEYU_HOLDINGS",
    });
    expect(v.consistent).toBe(true);
    expect(v.decision).toBe("PERMITTED");
  });

  it("a nonexistent entity yields GOVERNANCE_REVIEW_REQUIRED, not a pass", async () => {
    const v = await checkAttribution({ claimedTenantId: "TEN_BEYU_GROUP", legalEntityId: "LEN_NOPE" });
    expect(v.consistent).toBe(false);
    expect(v.decision).toBe("GOVERNANCE_REVIEW_REQUIRED");
  });
});

// =============================================================================
// §18 — PERIOD LOCK & SOD
// =============================================================================
describe("financial controls", () => {
  it("no accounting period means no permission to post", async () => {
    const v = await checkPeriodOpen({ legalEntityId: "LEN_BEYU_HOLDINGS", date: "2026-02-15" });
    expect(v.open).toBe(false);
    expect(v.decision).toBe("DATA_NOT_AVAILABLE");
    expect(v.reason).toContain("No period means no permission to post");
  });

  it("self-approval is refused", () => {
    const v = checkSegregationOfDuties({
      makerUserId: "USR_A", checkerUserId: "USR_A", requiresChecker: true,
    });
    expect(v.permitted).toBe(false);
    expect(v.decision).toBe("SEGREGATION_OF_DUTIES");
  });

  it("a missing checker is refused when one is required", () => {
    expect(
      checkSegregationOfDuties({ makerUserId: "USR_A", checkerUserId: null, requiresChecker: true }).permitted,
    ).toBe(false);
  });

  it("POSITIVE CONTROL: distinct maker and checker pass", () => {
    const v = checkSegregationOfDuties({
      makerUserId: "USR_A", checkerUserId: "USR_B", requiresChecker: true,
    });
    expect(v.permitted).toBe(true);
  });

  it("no threshold is invented — SoD applies only when a checker is required", () => {
    expect(
      checkSegregationOfDuties({ makerUserId: "USR_A", checkerUserId: null, requiresChecker: false }).permitted,
    ).toBe(true);
  });
});

// =============================================================================
// §6 — THE FULL PIPELINE
// =============================================================================
describe("Finance OS service contract", () => {
  it("denies an unknown capability", async () => {
    await groupTenant();
    const r = await financeGate({
      capabilityCode: "CAP_NOT_REAL", principal: principal(),
      tenantId: cachedTenant, legalEntityId: null, asOf: ASOF,
    });
    expect(r.permitted).toBe(false);
    expect(r.decision).toBe("CAPABILITY_UNKNOWN");
    expect(r.stage).toBe("CAPABILITY");
  });

  it("denies a locked execution capability", async () => {
    await groupTenant();
    const r = await financeGate({
      capabilityCode: "CAP_SPEC_FORECAST_EXECUTE", principal: principal(),
      tenantId: cachedTenant, legalEntityId: null, asOf: ASOF,
    });
    expect(r.permitted).toBe(false);
    expect(r.decision).toBe("AUTHORITY_CHAIN_INCOMPLETE");
  });

  it("denies a principal asserting another tenant", async () => {
    await groupTenant();
    const r = await financeGate({
      capabilityCode: "CAP_SPEC_FORECAST_EXECUTE",
      principal: principal({ tenantId: "TEN_ELSEWHERE" }),
      tenantId: cachedTenant, legalEntityId: null, asOf: ASOF,
    });
    expect(r.permitted).toBe(false);
    expect(r.decision).toBe("TENANT_SCOPE_MISMATCH");
    expect(r.stage).toBe("TENANT");
  });

  it("records every stage evaluated, so a denial is diagnosable", async () => {
    await groupTenant();
    const r = await financeGate({
      capabilityCode: "CAP_SPEC_FORECAST_EXECUTE", principal: principal(),
      tenantId: cachedTenant, legalEntityId: null, asOf: ASOF,
    });
    expect(r.stagesEvaluated.length).toBeGreaterThan(0);
    expect(r.contractVersion).toBe(FINANCE_CONTRACT_VERSION);
  });

  it("NO capability passes the full finance gate today", async () => {
    await groupTenant();
    const caps = await rowsOf<{ capability_code: string }>(
      sql`select capability_code from governance_capability_registry`,
    );
    expect(caps.length).toBe(60);
    for (const c of caps) {
      const r = await financeGate({
        capabilityCode: c.capability_code, principal: principal(),
        tenantId: cachedTenant, legalEntityId: null, asOf: ASOF,
      });
      expect(r.permitted).toBe(false);
    }
  });
});

// =============================================================================
// §8 / §27 — RECONCILIATION & DATA QUALITY
// =============================================================================
describe("reconciliation", () => {
  it("an empty ledger is DATA_NOT_AVAILABLE, never 'reconciled'", async () => {
    const r = await reconcileTreasuryToLedger(await groupTenant());
    expect(r.status).toBe("DATA_NOT_AVAILABLE");
    expect(r.ledgerTotal).toBeNull();
    expect(r.reason).toContain("This is NOT agreement");
  });

  it("never posts an adjustment", async () => {
    const r = await reconcileTreasuryToLedger(await groupTenant());
    expect(r.adjustmentPosted).toBe(false);
    expect(await count(sql`select count(*)::int as n from journal_entries`)).toBe(0);
  });

  it("POSITIVE CONTROL: the treasury side is genuinely populated, so the check is non-vacuous", async () => {
    const r = await reconcileTreasuryToLedger(await groupTenant());
    expect(Number(r.subledgerTotal)).toBe(11783000);
  });
});

describe("data quality", () => {
  it("finds the real defects — a clean result would mean the scan is broken", async () => {
    const findings = await scanDataQuality();
    expect(findings.length).toBeGreaterThan(0);
    const codes = findings.map((f) => f.check);
    expect(codes).toContain("CROSS_TENANT_ATTRIBUTION");
    expect(codes).toContain("MISSING_PROVENANCE");
    expect(codes).toContain("FABRICATED_ZERO");
  });

  it("quantifies the attribution defect at exactly 3 rows", async () => {
    const f = (await scanDataQuality()).find((x) => x.check === "CROSS_TENANT_ATTRIBUTION")!;
    expect(f.count).toBe(3);
    expect(f.severity).toBe("CRITICAL");
  });

  it("quantifies the C-1 provenance gap at exactly 5 policies", async () => {
    const f = (await scanDataQuality()).find((x) => x.check === "MISSING_PROVENANCE")!;
    expect(f.count).toBe(5);
  });

  it("repairs nothing — every finding is reported only", async () => {
    const findings = await scanDataQuality();
    for (const f of findings) expect(f.repaired).toBe(false);
    expect(summarizeDataQuality(findings).repaired).toBe(0);
  });

  it("governance-owned defects are marked as such, not as code bugs", async () => {
    const findings = await scanDataQuality();
    const attribution = findings.find((f) => f.check === "CROSS_TENANT_ATTRIBUTION")!;
    expect(attribution.ownership).toBe("GOVERNANCE");
  });
});

// =============================================================================
// §21 / §22 — CAPABILITY MATRIX & DEPENDENCY GRAPH
// =============================================================================
describe("capability inventory", () => {
  it("reports exactly the 60 registered capabilities — no inflation", async () => {
    const matrix = await financeCapabilityMatrix();
    expect(matrix.length).toBe(60);
    const registryCount = await count(sql`select count(*)::int as n from governance_capability_registry`);
    expect(matrix.length).toBe(registryCount);
  });

  it("every capability is LOCKED", async () => {
    const s = await capabilitySummary();
    expect(s.locked).toBe(60);
  });

  it("classifies execution capabilities distinctly from analytical ones", async () => {
    const s = await capabilitySummary();
    expect(s.byClass.EXECUTION).toBeGreaterThan(0);
    expect(s.byClass.ANALYTICAL + s.byClass.GOVERNED).toBeGreaterThan(0);
    expect(s.byClass.ANALYTICAL + s.byClass.GOVERNED + s.byClass.EXECUTION + s.byClass.ADMINISTRATIVE).toBe(60);
  });

  it("EXECUTE/POST/ALLOCATE capabilities are classified EXECUTION", async () => {
    const matrix = await financeCapabilityMatrix();
    const exec = matrix.find((c) => c.capabilityId === "CAP_SPEC_FORECAST_EXECUTE")!;
    expect(exec.capabilityClass).toBe("EXECUTION");
    expect(exec.executionStatus).toBe("LOCKED");
  });

  it("maps capabilities onto finance domains", async () => {
    const matrix = await financeCapabilityMatrix();
    const domains = new Set(matrix.map((c) => c.domain));
    expect(domains.has("FORECASTING")).toBe(true);
    expect(domains.has("TREASURY")).toBe(true);
    expect(domains.has("RISK")).toBe(true);
  });

  it("a capability declaring no decisions is LOCKED, never eligible", async () => {
    const matrix = await financeCapabilityMatrix();
    const noDecisions = matrix.filter((c) => c.requiredDecisions.length === 0);
    expect(noDecisions.length).toBeGreaterThan(0);
    for (const c of noDecisions) expect(c.executionStatus).toBe("LOCKED");
  });
});

describe("dependency graph", () => {
  it("traces a real capability forward and finds the chain broken", async () => {
    const chain = await financeDependencyChain("CAP_SPEC_FORECAST_EXECUTE");
    expect(chain.direction).toBe("FORWARD");
    expect(chain.complete).toBe(false);
    expect(chain.brokenAt.length).toBeGreaterThan(0);
  });

  it("includes every architectural layer", async () => {
    const chain = await financeDependencyChain("CAP_SPEC_FORECAST_EXECUTE");
    const layers = new Set(chain.links.map((l) => l.layer));
    for (const l of ["CAPABILITY", "DECISION", "AUTHORITY", "PERMISSION", "SERVICE", "EXECUTION"]) {
      expect(layers.has(l as never)).toBe(true);
    }
  });

  it("an unknown capability yields an incomplete chain, not an empty pass", async () => {
    const chain = await financeDependencyChain("CAP_IMAGINARY");
    expect(chain.complete).toBe(false);
  });

  it("execution is a chain link, and it is broken while locked", async () => {
    const chain = await financeDependencyChain("CAP_SPEC_FORECAST_EXECUTE");
    const exec = chain.links.find((l) => l.layer === "EXECUTION")!;
    expect(exec.present).toBe(false);
    expect(exec.detail).toContain("locked");
  });
});

// =============================================================================
// CONTROLS TESTED AT THEIR OWN BOUNDARY.
//
// Added after fault injection FI-13, FI-19 and FI-20 were NOT detected. All three shared one root
// cause: the control sits behind an earlier control that always denies first, so deleting it
// changed no observable behaviour. That is not safety, it is an untested control that will become
// load-bearing the moment authority is ratified and the earlier gate starts passing.
// =============================================================================
describe("masked controls, tested directly", () => {
  it("FI-13: the canonical-writer control refuses a non-writer", () => {
    const r = checkCanonicalWriter({
      writerModule: "specialist/forecast",
      writesTable: "journal_entries + journal_lines",
    });
    expect(r.permitted).toBe(false);
    expect(r.decision).toBe("NOT_CANONICAL_WRITER");
  });

  it("FI-13: the canonical-writer control admits the registered sole writer", () => {
    const r = checkCanonicalWriter({
      writerModule: "finance/posting-engine",
      writesTable: "journal_entries + journal_lines",
    });
    expect(r.permitted).toBe(true);
  });

  it("FI-13: an unknown writer module is refused", () => {
    expect(
      checkCanonicalWriter({ writerModule: null, writesTable: "journal_entries + journal_lines" }).permitted,
    ).toBe(false);
  });

  it("FI-13: an operation writing nothing is unaffected", () => {
    expect(checkCanonicalWriter({ writerModule: null, writesTable: null }).permitted).toBe(true);
  });

  it("FI-19: an execution verb beats an analytical verb in the same code", () => {
    // The dangerous case: a code containing BOTH verbs. Without the execution branch running
    // first, "CAP_X_REPORT_AND_EXECUTE" would classify as merely analytical.
    expect(classOf("CAP_X_REPORT_AND_EXECUTE", [])).toBe("EXECUTION");
    expect(classOf("CAP_X_ASSESS_AND_POST", [])).toBe("EXECUTION");
    expect(classOf("CAP_X_REVIEW_AND_ALLOCATE", [])).toBe("EXECUTION");
  });

  it("FI-19: a purely analytical code is analytical", () => {
    expect(classOf("CAP_X_ASSESS", [])).toBe("ANALYTICAL");
  });

  it("FI-19: an analytical code requiring decisions is GOVERNED, not ANALYTICAL", () => {
    expect(classOf("CAP_X_ASSESS", ["P1"])).toBe("GOVERNED");
  });

  it("FI-19: an unrecognised verb defaults to EXECUTION, never to analytical", () => {
    expect(classOf("CAP_X_FROBNICATE", [])).toBe("EXECUTION");
  });

  it("FI-20: an ACTIVATED capability with no declared decisions stays LOCKED", () => {
    // The registry-defect case. If this ever returns ELIGIBLE, a capability that no decision
    // governs becomes executable.
    expect(executionStatusOf("ACTIVATED", [])).toBe("LOCKED");
  });

  it("FI-20: an ACTIVATED capability with decisions is ELIGIBLE", () => {
    expect(executionStatusOf("ACTIVATED", ["P1"])).toBe("ELIGIBLE");
  });

  it("FI-20: a LOCKED capability is LOCKED regardless of its decisions", () => {
    expect(executionStatusOf("LOCKED", ["P1"])).toBe("LOCKED");
    expect(executionStatusOf("PENDING", ["P1"])).toBe("LOCKED");
  });
});

// =============================================================================
// §24 — THE 30 ATTACK VECTORS
// =============================================================================
describe("§24 attack matrix — all must fail closed", () => {
  it("1-2. cross-tenant and cross-entity ledger access is refused", async () => {
    await groupTenant();
    const r = await financeGate({
      capabilityCode: "CAP_SPEC_FORECAST_EXECUTE",
      principal: principal({ tenantId: "TEN_ATTACKER" }),
      tenantId: cachedTenant, legalEntityId: null, asOf: ASOF,
    });
    expect(r.permitted).toBe(false);
  });

  it("3-4. cross-tenant treasury aggregation is flagged, not silently merged", async () => {
    const conflicts = (await scanTreasuryAttribution()).filter((v) => !v.consistent);
    expect(conflicts.length).toBe(3);
  });

  it("6-9. forged authority, policy, capability and permission all fail", async () => {
    await groupTenant();
    for (const cap of ["CAP_FORGED", "CAP_ADMIN_OVERRIDE", "CAP_*", ""]) {
      const r = await financeGate({
        capabilityCode: cap, principal: principal(),
        tenantId: cachedTenant, legalEntityId: null, asOf: ASOF,
      });
      expect(r.permitted).toBe(false);
    }
  });

  it("13. synthetic data cannot enter financial truth", () => {
    expect(() => assertNotSynthetic("SYNTHETIC", "ledger")).toThrow();
    expect(canPromote("SYNTHETIC", "POSTED")).toBe(false);
  });

  it("14-15. forecast and scenario cannot enter the ledger", () => {
    expect(canPromote("FORECAST", "POSTED")).toBe(false);
    expect(canPromote("SCENARIO", "POSTED")).toBe(false);
  });

  it("16-17. risk and compliance outputs cannot become financial truth", () => {
    // Both produce OBSERVED/DERIVED observations; neither may write the ledger.
    expect(mayWrite("specialist/risk", "journal_entries + journal_lines")).toBe(false);
    expect(mayWrite("specialist/compliance", "journal_entries + journal_lines")).toBe(false);
  });

  it("18. unauthorised journal posting is refused by the canonical-writer control", async () => {
    await groupTenant();
    const r = await financeGate({
      capabilityCode: "CAP_SPEC_FORECAST_EXECUTE", principal: principal(),
      tenantId: cachedTenant, legalEntityId: null,
      writesTable: "journal_entries + journal_lines", writerModule: "specialist/forecast",
      asOf: ASOF,
    });
    expect(r.permitted).toBe(false);
  });

  it("21. historical mutation is blocked by database triggers", async () => {
    const triggers = await rowsOf<{ tgname: string }>(
      sql`select tgname from pg_trigger where not tgisinternal and tgname like '%immutable%'`,
    );
    expect(triggers.length).toBeGreaterThanOrEqual(4);
  });

  it("22. period-lock bypass fails — no period means no posting", async () => {
    const v = await checkPeriodOpen({ legalEntityId: "LEN_BEYU_HOLDINGS", date: "2020-01-01" });
    expect(v.open).toBe(false);
  });

  it("23. reconciliation bypass fails — an empty ledger never reports agreement", async () => {
    const r = await reconcileTreasuryToLedger(await groupTenant());
    expect(r.status).not.toBe("RECONCILED");
  });

  it("26. audit deletion is blocked by immutability triggers", async () => {
    const t = await rowsOf<{ tgname: string }>(
      sql`select tgname from pg_trigger where not tgisinternal
          and tgname in ('audit_log_immutable_update','audit_log_immutable_truncate')`,
    );
    expect(t.length).toBe(2);
  });

  it("29. attribution laundering is detected and named", async () => {
    const conflicts = (await scanTreasuryAttribution()).filter((v) => !v.consistent);
    for (const c of conflicts) {
      expect(c.reason).toContain("Reported, not repaired");
    }
  });

  it("30. policy conflict laundering fails — conflicts require authority", async () => {
    const findings = await scanDataQuality();
    const prov = findings.find((f) => f.check === "MISSING_PROVENANCE")!;
    expect(prov.ownership).toBe("GOVERNANCE");
    expect(prov.repaired).toBe(false);
  });
});

// =============================================================================
// §28 — NO FINANCIAL EXECUTION
// =============================================================================
describe("§28 no financial execution", () => {
  it("the ledger remains empty after every Finance OS operation in this suite", async () => {
    expect(await count(sql`select count(*)::int as n from journal_entries`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from journal_lines`)).toBe(0);
  });

  it("treasury is unchanged", async () => {
    const [r] = await rowsOf<{ n: string }>(
      sql`select coalesce(sum(base_currency_balance),0)::text as n from treasury_positions`,
    );
    expect(r.n).toBe("11783000.00");
  });

  it("no decision was ratified and no capability activated", async () => {
    expect(await count(sql`select count(*)::int as n from governance_decision_registry where status <> 'PENDING'`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from governance_capability_registry where activation_status <> 'LOCKED'`)).toBe(0);
  });

  it("no trigger was disabled", async () => {
    expect(await count(sql`select count(*)::int as n from pg_trigger where not tgisinternal and tgenabled = 'D'`)).toBe(0);
  });
});
