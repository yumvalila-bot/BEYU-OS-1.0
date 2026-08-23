/**
 * FINANCE OS — FX, period/close and reporting rails.
 *
 * These three engines share one failure mode: each is a place where a plausible-looking number can
 * be manufactured out of nothing.
 *
 *   - FX: three implied TZS rates sit in the seeded data. Any could be "derived" and would be a
 *     fabrication.
 *   - PERIOD: an empty fiscal calendar could be read as "everything is open".
 *   - REPORTING: an empty ledger could be rendered as a balance sheet of zeros.
 *
 * So the suite is built around proving the refusals hold, and that each refusal carries a reason
 * rather than a silent null.
 *
 * NON-VACUITY. Real-substrate assertions use specific counts (5 treasury positions, 3 distinct TZS
 * rates, 0 periods, 0 journal lines). A query that silently returned nothing would fail.
 */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  FX_ENGINE_VERSION,
  FxError,
  assertAllConvertible,
  convert,
  currencyView,
  deriveRateFromBalances,
  resolveRate,
  scanImpliedRates,
  sumMultiCurrency,
  type FxRate,
} from "@/lib/finance/fx";
import {
  LEGAL_TRANSITIONS,
  PERIOD_ENGINE_VERSION,
  PERIOD_STATE,
  assessCloseReadiness,
  evaluateTransition,
  isPeriodState,
  periodCalendar,
  periodForDate,
  postingAllowedIn,
  resolvePeriodForDate,
  type PeriodState,
} from "@/lib/finance/period";
import {
  REPORTING_ENGINE_VERSION,
  assertReportIntegrity,
  composeActualVsProjection,
  statement,
  trialBalance,
  type ReportLine,
} from "@/lib/finance/reporting";

const ASOF = "2026-02-15";
const TENANT = "TEN_BEYU_GROUP";

async function rowsOf<T>(q: Parameters<typeof db.execute>[0]): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as { rows?: T[] };
  return r.rows ?? (r as unknown as T[]);
}
async function count(q: Parameters<typeof db.execute>[0]): Promise<number> {
  return Number((await rowsOf<{ n: number }>(q))[0].n);
}

/** SYNTHETIC governed rate. Never persisted; exists so the positive path is exercisable. */
const synthRate = (over: Partial<FxRate> = {}): FxRate => ({
  fromCurrency: "TZS",
  toCurrency: "USD",
  rate: "0.000383",
  asOf: ASOF,
  sourceKind: "GOVERNED",
  sourceAuthority: "SYNTHETIC_RATE_AUTHORITY",
  approvedByResolutionId: "SYNTHETIC-RES-1",
  provenanceComplete: true,
  ...over,
});

// =============================================================================
// FX — the fabrication vector
// =============================================================================
describe("FX refuses to invent a rate", () => {
  it("returns REQUIRES_AUTHORITY when no governed rate exists — the real production state", async () => {
    const r = await resolveRate({ fromCurrency: "TZS", toCurrency: "USD", asOf: ASOF });
    expect(r.usable).toBe(false);
    expect(r.decision).toBe("REQUIRES_AUTHORITY");
    expect(r.reason).toContain("no ratified FX rate source");
  });

  it("converts a currency to itself without needing authority", async () => {
    const r = await resolveRate({ fromCurrency: "USD", toCurrency: "USD", asOf: ASOF });
    expect(r.usable).toBe(true);
    expect(r.decision).toBe("SAME_CURRENCY");
    expect(r.rate?.rate).toBe("1");
  });

  it("POSITIVE CONTROL: a governed rate is used when one genuinely exists", async () => {
    const r = await resolveRate({
      fromCurrency: "TZS", toCurrency: "USD", asOf: ASOF, governedRates: [synthRate()],
    });
    expect(r.usable).toBe(true);
    expect(r.decision).toBe("GOVERNED_RATE_AVAILABLE");
    expect(r.rate?.rate).toBe("0.000383");
  });

  it("refuses a rate whose provenance is incomplete", async () => {
    const r = await resolveRate({
      fromCurrency: "TZS", toCurrency: "USD", asOf: ASOF,
      governedRates: [synthRate({ provenanceComplete: false })],
    });
    expect(r.usable).toBe(false);
    expect(r.decision).toBe("REQUIRES_AUTHORITY");
  });

  it("refuses REFERENCE_DATA as a conversion rate — published is not ratified", async () => {
    const r = await resolveRate({
      fromCurrency: "TZS", toCurrency: "USD", asOf: ASOF,
      governedRates: [synthRate({ sourceKind: "REFERENCE_DATA" })],
    });
    expect(r.usable).toBe(false);
  });

  it("refuses a SYNTHETIC rate in the resolution path", async () => {
    const r = await resolveRate({
      fromCurrency: "TZS", toCurrency: "USD", asOf: ASOF,
      governedRates: [synthRate({ sourceKind: "SYNTHETIC" })],
    });
    expect(r.usable).toBe(false);
  });

  it("two conflicting governed rates yield RATE_CONFLICT, never a winner", async () => {
    const r = await resolveRate({
      fromCurrency: "TZS", toCurrency: "USD", asOf: ASOF,
      governedRates: [synthRate({ rate: "0.000383" }), synthRate({ rate: "0.000390" })],
    });
    expect(r.usable).toBe(false);
    expect(r.decision).toBe("RATE_CONFLICT");
    expect(r.rate).toBeNull();
  });

  it("a rate for a different date does not apply", async () => {
    const r = await resolveRate({
      fromCurrency: "TZS", toCurrency: "USD", asOf: "2026-03-01",
      governedRates: [synthRate({ asOf: ASOF })],
    });
    expect(r.usable).toBe(false);
  });

  it("rejects a malformed currency code rather than coercing it", async () => {
    await expect(resolveRate({ fromCurrency: "tzs", toCurrency: "USD", asOf: ASOF })).rejects.toThrow(FxError);
    await expect(resolveRate({ fromCurrency: "TZSX", toCurrency: "USD", asOf: ASOF })).rejects.toThrow(/ISO currency/);
  });
});

describe("FX conversion never fabricates a figure", () => {
  it("an unconvertible amount yields a null amount with a reason, never zero", async () => {
    const v = await convert({ amount: "1000000.00", fromCurrency: "TZS", toCurrency: "USD", asOf: ASOF });
    expect(v.amount).toBeNull();
    expect(v.epistemicClass).toBe("REQUIRES_AUTHORITY");
    expect(v.reason).toBeTruthy();
  });

  it("POSITIVE CONTROL: a governed rate produces a DERIVED figure, not an OBSERVED one", async () => {
    const v = await convert({
      amount: "1000000.00", fromCurrency: "TZS", toCurrency: "USD", asOf: ASOF,
      governedRates: [synthRate()],
    });
    expect(v.amount).toBe("383.00");
    expect(v.epistemicClass).toBe("DERIVED");
  });

  it("refuses to total mixed currencies without a governed rate", async () => {
    const v = await sumMultiCurrency({
      amounts: [{ amount: "100", currency: "USD" }, { amount: "100000", currency: "TZS" }],
      targetCurrency: "USD", asOf: ASOF,
    });
    expect(v.amount).toBeNull();
    expect(v.epistemicClass).toBe("REQUIRES_AUTHORITY");
  });

  it("POSITIVE CONTROL: a single-currency total is computed", async () => {
    const v = await sumMultiCurrency({
      amounts: [{ amount: "100.00", currency: "USD" }, { amount: "50.00", currency: "USD" }],
      targetCurrency: "USD", asOf: ASOF,
    });
    expect(v.amount).toBe("150.00");
  });

  it("an empty set is DATA_NOT_AVAILABLE, not 0", async () => {
    const v = await sumMultiCurrency({ amounts: [], targetCurrency: "USD", asOf: ASOF });
    expect(v.amount).toBeNull();
    expect(v.epistemicClass).toBe("DATA_NOT_AVAILABLE");
  });

  it("the three currency roles are distinct, and untranslatable ones stay absent", async () => {
    const view = await currencyView({
      amount: "1000000.00", transactionCurrency: "TZS", functionalCurrency: "USD",
      reportingCurrency: "USD", asOf: ASOF,
    });
    expect(view.TRANSACTION.amount).toBe("1000000.00");
    expect(view.TRANSACTION.epistemicClass).toBe("OBSERVED");
    expect(view.FUNCTIONAL.amount).toBeNull();
    expect(view.REPORTING.amount).toBeNull();
  });
});

describe("FX implied-rate defect is reported, never used", () => {
  it("detects THREE distinct implied TZS rates in the real substrate", async () => {
    const findings = await scanImpliedRates();
    const tzs = findings.find((f) => f.currency === "TZS")!;
    expect(tzs).toBeDefined();
    expect(tzs.distinctRates.length).toBe(3);
    expect(tzs.consistent).toBe(false);
    expect(tzs.positions).toBe(3);
  });

  it("names the actual conflicting rates", async () => {
    const tzs = (await scanImpliedRates()).find((f) => f.currency === "TZS")!;
    expect(tzs.distinctRates).toEqual(["2613.333333", "2613.843352", "2615.384615"]);
  });

  it("an implied rate is NEVER usable as an FX source, even when consistent", async () => {
    const findings = await scanImpliedRates();
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(f.usableAsFxSource).toBe(false);
    // USD is internally consistent (rate 1.0) and still not usable.
    const usd = findings.find((f) => f.currency === "USD")!;
    expect(usd.consistent).toBe(true);
    expect(usd.usableAsFxSource).toBe(false);
  });

  it("deriving a rate from balances throws, and explains why", () => {
    expect(() => deriveRateFromBalances()).toThrow(FxError);
    expect(() => deriveRateFromBalances()).toThrow(/three different TZS\/USD rates/);
  });
});

// =============================================================================
// PERIOD & CLOSE
// =============================================================================
describe("period state machine", () => {
  it("permits only legal transitions", () => {
    expect(evaluateTransition({ from: "OPEN", to: "IN_PROGRESS" }).permitted).toBe(true);
    expect(evaluateTransition({ from: "IN_PROGRESS", to: "SOFT_CLOSE" }).permitted).toBe(true);
    expect(evaluateTransition({ from: "SOFT_CLOSE", to: "HARD_CLOSE" }).permitted).toBe(true);
    expect(evaluateTransition({ from: "HARD_CLOSE", to: "CLOSED" }).permitted).toBe(true);
  });

  it("refuses a skipped state", () => {
    const r = evaluateTransition({ from: "OPEN", to: "CLOSED" });
    expect(r.permitted).toBe(false);
    expect(r.decision).toBe("ILLEGAL_TRANSITION");
  });

  it("refuses a duplicate close", () => {
    const r = evaluateTransition({ from: "CLOSED", to: "CLOSED" });
    expect(r.permitted).toBe(false);
    expect(r.decision).toBe("DUPLICATE_CLOSE");
  });

  it("FINAL is terminal — no transition escapes it", () => {
    for (const to of PERIOD_STATE) {
      expect(evaluateTransition({ from: "FINAL", to }).permitted).toBe(false);
    }
  });

  it("reopening a closed period requires explicit authority", () => {
    const without = evaluateTransition({ from: "CLOSED", to: "REOPENED" });
    expect(without.permitted).toBe(false);
    expect(without.decision).toBe("REQUIRES_AUTHORITY");
    expect(without.requiresAuthority).toBe(true);
  });

  it("POSITIVE CONTROL: reopening succeeds when authority is supplied", () => {
    const withAuth = evaluateTransition({ from: "CLOSED", to: "REOPENED", hasGovernanceAuthority: true });
    expect(withAuth.permitted).toBe(true);
    expect(withAuth.requiresAuthority).toBe(true);
  });

  it("finalising a period requires authority", () => {
    expect(evaluateTransition({ from: "CLOSED", to: "FINAL" }).decision).toBe("REQUIRES_AUTHORITY");
    expect(evaluateTransition({ from: "CLOSED", to: "FINAL", hasGovernanceAuthority: true }).permitted).toBe(true);
  });

  it("an unknown state fails closed rather than being treated as OPEN", () => {
    const r = evaluateTransition({ from: "TOTALLY_OPEN", to: "CLOSED" });
    expect(r.permitted).toBe(false);
    expect(r.decision).toBe("UNKNOWN_STATE");
  });

  it("does not normalise case — 'open' is not OPEN", () => {
    expect(evaluateTransition({ from: "open", to: "IN_PROGRESS" }).decision).toBe("UNKNOWN_STATE");
    expect(isPeriodState("open")).toBe(false);
  });

  it("EXHAUSTIVE: every one of the 49 state pairs is decided explicitly", () => {
    for (const from of PERIOD_STATE) {
      for (const to of PERIOD_STATE) {
        const r = evaluateTransition({ from, to, hasGovernanceAuthority: true });
        expect(typeof r.permitted).toBe("boolean");
        expect(r.reason.length).toBeGreaterThan(10);
      }
    }
  });
});

describe("posting eligibility by period state", () => {
  it("permits posting only in OPEN, IN_PROGRESS and REOPENED", () => {
    const allowed = PERIOD_STATE.filter((s) => postingAllowedIn(s).allowed);
    expect(allowed.sort()).toEqual(["IN_PROGRESS", "OPEN", "REOPENED"]);
  });

  it("refuses posting into a closed period", () => {
    for (const s of ["SOFT_CLOSE", "HARD_CLOSE", "CLOSED", "FINAL"] as PeriodState[]) {
      const r = postingAllowedIn(s);
      expect(r.allowed).toBe(false);
      expect(r.decision).toBe("PERIOD_LOCKED");
    }
  });

  it("directs correction to reversal, never to editing history", () => {
    expect(postingAllowedIn("CLOSED").reason).toContain("never by editing history");
  });

  it("an unknown state refuses posting", () => {
    expect(postingAllowedIn("WIDE_OPEN").allowed).toBe(false);
  });
});

describe("period substrate is genuinely absent", () => {
  it("the fiscal calendar is empty — the real production state", async () => {
    expect(await count(sql`select count(*)::int as n from financial_periods`)).toBe(0);
  });

  it("no period covering a date is DATA_NOT_AVAILABLE, not an open period", async () => {
    const r = await periodForDate({ legalEntityId: "LEN_BEYU_HOLDINGS", date: ASOF });
    expect(r.found).toBe(false);
    expect(r.decision).toBe("DATA_NOT_AVAILABLE");
  });

  it("an empty calendar returns no periods", async () => {
    expect(await periodCalendar("LEN_BEYU_HOLDINGS")).toEqual([]);
  });

  it("close readiness reports DATA_NOT_AVAILABLE with the calendar absent", async () => {
    const r = await assessCloseReadiness({ legalEntityId: "LEN_BEYU_HOLDINGS" });
    expect(r.ready).toBe(false);
    expect(r.decision).toBe("DATA_NOT_AVAILABLE");
    expect(r.blockers).toContain("NO_PERIOD_DEFINED");
  });

  it("never invents a period implicitly", async () => {
    await assessCloseReadiness({ legalEntityId: "LEN_BEYU_HOLDINGS" });
    await periodForDate({ legalEntityId: "LEN_BEYU_HOLDINGS", date: ASOF });
    expect(await count(sql`select count(*)::int as n from financial_periods`)).toBe(0);
  });
});

// =============================================================================
// REPORTING
// =============================================================================
describe("trial balance", () => {
  it("an empty ledger yields null totals, never 0.00", async () => {
    const r = await trialBalance({ tenantId: TENANT, asOf: ASOF });
    expect(r.lines).toEqual([]);
    expect(r.totalDebits).toBeNull();
    expect(r.totalCredits).toBeNull();
    expect(r.balanced).toBeNull();
    expect(r.overallClass).toBe("DATA_NOT_AVAILABLE");
  });

  it("explains that null is not zero", async () => {
    const r = await trialBalance({ tenantId: TENANT, asOf: ASOF });
    expect(r.limitations.join(" ")).toContain("NOT 0.00");
  });

  it("is never authoritative without data", async () => {
    expect((await trialBalance({ tenantId: TENANT, asOf: ASOF })).authoritative).toBe(false);
  });

  it("carries the full provenance envelope", async () => {
    const r = await trialBalance({ tenantId: TENANT, asOf: ASOF });
    expect(r.tenantId).toBe(TENANT);
    expect(r.asOf).toBe(ASOF);
    expect(r.provenance.engineVersion).toBe(REPORTING_ENGINE_VERSION);
    expect(r.provenance.sourceTables).toContain("journal_lines");
  });
});

describe("financial statements", () => {
  it("returns the structure but refuses to classify accounts", async () => {
    const r = await statement({ kind: "BALANCE_SHEET", tenantId: TENANT, asOf: ASOF });
    expect(r.lines.map((l) => l.caption)).toEqual(["Assets", "Liabilities", "Equity"]);
    for (const l of r.lines) {
      expect(l.epistemicClass).toBe("REQUIRES_AUTHORITY");
      expect(l.balance).toBeNull();
      expect(l.reason).toContain("ratified account-classification policy");
    }
  });

  it("declares its policy dependency explicitly", async () => {
    const r = await statement({ kind: "INCOME_STATEMENT", tenantId: TENANT, asOf: ASOF });
    expect(r.policyDependencies).toContain("P1");
    expect(r.authoritative).toBe(false);
  });

  it("every statement kind behaves identically — no partial guessing", async () => {
    for (const kind of ["BALANCE_SHEET", "INCOME_STATEMENT", "CASH_FLOW", "CHANGES_IN_EQUITY"] as const) {
      const r = await statement({ kind, tenantId: TENANT, asOf: ASOF });
      expect(r.overallClass).toBe("REQUIRES_AUTHORITY");
      expect(r.lines.every((l) => l.balance === null)).toBe(true);
    }
  });
});

describe("actual vs projection never launders a forecast", () => {
  const actual: ReportLine = {
    caption: "Revenue", accountCode: "4000", debit: "0", credit: "1000",
    balance: "1000.00", currency: "USD", epistemicClass: "DERIVED", reason: null,
  };

  it("downgrades a projection line that claims to be POSTED", () => {
    const r = composeActualVsProjection({
      kind: "FORECAST_VS_ACTUAL", tenantId: TENANT, asOf: ASOF,
      actualLines: [actual],
      projectionLines: [{ ...actual, epistemicClass: "POSTED" }],
    });
    const projected = r.lines.find((l) => l.caption.includes("projected"))!;
    expect(projected.epistemicClass).toBe("FORECAST");
  });

  it("downgrades a projection line claiming to be OBSERVED", () => {
    const r = composeActualVsProjection({
      kind: "BUDGET_VS_ACTUAL", tenantId: TENANT, asOf: ASOF,
      actualLines: [actual], projectionLines: [{ ...actual, epistemicClass: "OBSERVED" }],
    });
    expect(r.lines.find((l) => l.caption.includes("projected"))!.epistemicClass).toBe("FORECAST");
  });

  it("is never authoritative, by construction", () => {
    const r = composeActualVsProjection({
      kind: "FORECAST_VS_ACTUAL", tenantId: TENANT, asOf: ASOF,
      actualLines: [actual], projectionLines: [{ ...actual, epistemicClass: "FORECAST" }],
    });
    expect(r.authoritative).toBe(false);
    expect(r.overallClass).toBe("FORECAST");
  });

  it("labels projected lines visibly", () => {
    const r = composeActualVsProjection({
      kind: "FORECAST_VS_ACTUAL", tenantId: TENANT, asOf: ASOF,
      actualLines: [actual], projectionLines: [actual],
    });
    expect(r.lines.filter((l) => l.caption.endsWith("(projected)")).length).toBe(1);
  });
});

describe("report integrity assertion", () => {
  it("accepts an honest empty report", async () => {
    const r = await trialBalance({ tenantId: TENANT, asOf: ASOF });
    expect(assertReportIntegrity(r).valid).toBe(true);
  });

  it("accepts an honest REQUIRES_AUTHORITY statement", async () => {
    const r = await statement({ kind: "BALANCE_SHEET", tenantId: TENANT, asOf: ASOF });
    expect(assertReportIntegrity(r).valid).toBe(true);
  });

  it("rejects an authoritative report containing a forecast", async () => {
    const r = await trialBalance({ tenantId: TENANT, asOf: ASOF });
    const tampered = {
      ...r,
      authoritative: true,
      lines: [{
        caption: "Revenue", accountCode: "4000", debit: null, credit: null,
        balance: "1000.00", currency: "USD", epistemicClass: "FORECAST" as const, reason: null,
      }],
    };
    const v = assertReportIntegrity(tampered);
    expect(v.valid).toBe(false);
    expect(v.violations[0]).toContain("non-factual");
  });

  it("rejects a non-value line that carries a balance", async () => {
    const r = await statement({ kind: "BALANCE_SHEET", tenantId: TENANT, asOf: ASOF });
    const tampered = { ...r, lines: r.lines.map((l) => ({ ...l, balance: "0.00" })) };
    const v = assertReportIntegrity(tampered);
    expect(v.valid).toBe(false);
    expect(v.violations.join(" ")).toContain("carries a balance");
  });

  it("rejects a fabricated zero total on an unavailable report", async () => {
    const r = await trialBalance({ tenantId: TENANT, asOf: ASOF });
    const v = assertReportIntegrity({ ...r, totalDebits: "0.00" });
    expect(v.valid).toBe(false);
    expect(v.violations.join(" ")).toContain("fabricated zero");
  });

  it("rejects a non-value line with no reason given", async () => {
    const r = await statement({ kind: "BALANCE_SHEET", tenantId: TENANT, asOf: ASOF });
    const v = assertReportIntegrity({ ...r, lines: r.lines.map((l) => ({ ...l, reason: null })) });
    expect(v.valid).toBe(false);
  });
});

// =============================================================================
// MASKED CONTROLS, TESTED AT THEIR OWN BOUNDARY.
//
// Added after FI-7, FI-10 and FI-15 were NOT detected. Same root cause each time: the control sits
// behind an earlier guard, or behind a database path that cannot produce the triggering case
// today. Deleting it changed nothing observable — but each becomes load-bearing once a fiscal
// calendar exists or the guard is refactored.
// =============================================================================
describe("masked controls, tested directly", () => {
  it("FI-10: the transition table itself makes FINAL terminal", () => {
    // Asserting the DATA, not just the guard that currently shadows it.
    expect(LEGAL_TRANSITIONS.FINAL).toEqual([]);
  });

  it("FI-10: every transition target in the table is a real state", () => {
    for (const [from, targets] of Object.entries(LEGAL_TRANSITIONS)) {
      expect(isPeriodState(from)).toBe(true);
      for (const t of targets) expect(isPeriodState(t)).toBe(true);
    }
  });

  it("FI-10: no state may transition to itself in the table", () => {
    for (const [from, targets] of Object.entries(LEGAL_TRANSITIONS)) {
      expect(targets).not.toContain(from);
    }
  });

  it("FI-15: overlapping periods yield DATA_CONFLICT, with no winner chosen", () => {
    // Unreachable via the database today (0 periods), so exercised directly.
    const r = resolvePeriodForDate(
      [
        { id: "P1", code: "2026-M02", status: "OPEN" },
        { id: "P2", code: "2026-Q1", status: "OPEN" },
      ],
      "2026-02-15",
    );
    expect(r.found).toBe(false);
    expect(r.decision).toBe("DATA_CONFLICT");
    expect(r.periodId).toBeNull();
    expect(r.reason).toContain("chosen by row order");
  });

  it("FI-15: exactly one covering period resolves normally", () => {
    const r = resolvePeriodForDate([{ id: "P1", code: "2026-M02", status: "OPEN" }], "2026-02-15");
    expect(r.found).toBe(true);
    expect(r.periodId).toBe("P1");
    expect(r.state).toBe("OPEN");
  });

  it("FI-15: no candidates is DATA_NOT_AVAILABLE", () => {
    expect(resolvePeriodForDate([], "2026-02-15").decision).toBe("DATA_NOT_AVAILABLE");
  });

  it("FI-15: an unknown status on a matched period does not become a valid state", () => {
    const r = resolvePeriodForDate([{ id: "P1", code: "X", status: "WIDE_OPEN" }], "2026-02-15");
    expect(r.found).toBe(true);
    expect(r.state).toBeNull();
  });

  it("FI-7: the convertibility precheck names every unconvertible currency", async () => {
    const r = await assertAllConvertible({
      currencies: ["TZS", "KES", "USD"], targetCurrency: "USD", asOf: ASOF,
    });
    expect(r.allConvertible).toBe(false);
    expect(r.unconvertible.sort()).toEqual(["KES", "TZS"]);
  });

  it("FI-7: POSITIVE CONTROL — the precheck passes when governed rates cover everything", async () => {
    const r = await assertAllConvertible({
      currencies: ["TZS", "USD"], targetCurrency: "USD", asOf: ASOF,
      governedRates: [synthRate()],
    });
    expect(r.allConvertible).toBe(true);
    expect(r.unconvertible).toEqual([]);
  });

  it("FI-7: a same-currency set is trivially convertible", async () => {
    const r = await assertAllConvertible({ currencies: ["USD"], targetCurrency: "USD", asOf: ASOF });
    expect(r.allConvertible).toBe(true);
  });
});

// =============================================================================
// NO MUTATION
// =============================================================================
describe("no financial mutation", () => {
  it("engine versions are pinned", () => {
    expect(FX_ENGINE_VERSION).toBe("fx-1.0.0");
    expect(PERIOD_ENGINE_VERSION).toBe("period-1.0.0");
    expect(REPORTING_ENGINE_VERSION).toBe("reporting-1.0.0");
  });

  it("the ledger, calendar and treasury are unchanged after every operation above", async () => {
    expect(await count(sql`select count(*)::int as n from journal_entries`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from journal_lines`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from financial_periods`)).toBe(0);
    const [t] = await rowsOf<{ n: string }>(
      sql`select coalesce(sum(base_currency_balance),0)::text as n from treasury_positions`,
    );
    expect(t.n).toBe("11783000.00");
  });

  it("no capability was activated and no decision ratified", async () => {
    expect(await count(sql`select count(*)::int as n from governance_capability_registry where activation_status <> 'LOCKED'`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from governance_decision_registry where status <> 'PENDING'`)).toBe(0);
  });
});
