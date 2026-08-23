/**
 * BEYU OS — Treasury Intelligence engines (Phase 7F).
 *
 * Pure functions over observed treasury records. No database, no principal, no authority — the
 * service layer applies those through the Phase 7B platform.
 *
 * REUSE, NOT REIMPLEMENTATION. Concentration arithmetic, minor-unit money handling and threshold
 * banding already exist in the 7D risk engines and are imported here. Re-deriving them would
 * create a second set of financial mathematics free to drift from the first, which is exactly the
 * failure mode the common platform exists to prevent. What this module adds is treasury-specific:
 * per-currency cash aggregation, FX-restatement verification, attribution consistency, and honest
 * refusals where the substrate is silent.
 *
 * FIVE REFUSALS ENCODED HERE, each because the data genuinely cannot support the answer:
 *
 *   1. NO MATURITY PROFILE. No maturity/tenor/value-date column exists. Deriving tenor from
 *      account_type would be invention.
 *   2. NO AVAILABLE-VS-RESTRICTED SPLIT. No encumbrance data exists. `classification` is the ABAC
 *      SECURITY marker, not restricted cash — conflating them would reclassify billions of
 *      operating shillings as unavailable.
 *   3. NO TREND OR MOVEMENT. One snapshot date exists.
 *   4. NO FX RATE. base_currency_balance carries a rate this system never recorded, and the three
 *      TZS rows imply three different rates. The inconsistency is reported, never averaged away.
 *   5. NO SEVERITY WITHOUT A GOVERNED LIMIT. Absent a ratified threshold, severity is
 *      REQUIRES_POLICY.
 */
import { SpecialistError } from "../platform";
// Deliberate reuse of the Phase 7D financial-risk mathematics.
import { concentration as riskConcentration, fromMinor, toMinor } from "../risk/engines";
import type { RiskThreshold } from "../risk/model";
import type {
  AttributionConsistency,
  CashPosition,
  CurrencyCashPosition,
  MaturityProfile,
  TreasuryBucket,
  TreasuryDataQuality,
  TreasuryFinding,
  TreasuryFindingCode,
  TreasuryPositionView,
  TreasuryResult,
  TreasuryScenarioAdjustment,
  TreasuryThreshold,
} from "./model";

export const TREASURY_VERSION = "treasury-1.0.0";

export { fromMinor, toMinor };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string, label: string): void {
  if (!ISO_DATE.test(value)) {
    throw new SpecialistError("RULE_VIOLATION", `${label} must be an ISO date (YYYY-MM-DD).`);
  }
}

function finding(
  code: TreasuryFindingCode,
  severity: TreasuryFinding["severity"],
  subjectType: TreasuryFinding["subjectType"],
  subjectId: string,
  detail: string,
): TreasuryFinding {
  return { code, severity, subjectType, subjectId, detail, advisoryOnly: true };
}

/** The FX caveat attached to every cross-currency figure this module produces. */
const FX_ASSUMPTION =
  "Aggregated over base_currency_balance, which was restated by an FX rate this system does not " +
  "record and cannot verify. The FX decision (P4) is unratified.";

// ===========================================================================
// 1. CASH POSITION
// ===========================================================================

/**
 * Cash position, aggregated per currency first.
 *
 * Per-currency native totals involve no FX and are therefore solid. The group base-currency total
 * is provided because it is operationally necessary, but it always carries the FX caveat and is
 * never presented as verified fact.
 */
export function cashPosition(
  positions: TreasuryPositionView[],
  options: { asOf: string },
): CashPosition {
  assertIsoDate(options.asOf, "asOf");

  if (positions.length === 0) {
    return {
      asOf: options.asOf,
      byCurrency: [],
      baseCurrencyTotal: null,
      baseCurrencyTotalBasis: "DATA_NOT_AVAILABLE",
      positionCount: 0,
      availableCash: null,
      availableCashBasis: "DATA_NOT_AVAILABLE",
      explanation: [
        "No treasury positions in scope. A zero cash position would falsely assert that the entity holds no cash.",
      ],
    };
  }

  const byCurrencyMap = new Map<string, TreasuryPositionView[]>();
  for (const p of positions) {
    byCurrencyMap.set(p.currency, [...(byCurrencyMap.get(p.currency) ?? []), p]);
  }

  const byCurrency: CurrencyCashPosition[] = [...byCurrencyMap.entries()]
    .map(([currency, group]) => ({
      currency,
      nativeTotal: fromMinor(group.reduce((a, p) => a + toMinor(p.balance), 0)),
      baseTotal: fromMinor(group.reduce((a, p) => a + toMinor(p.baseCurrencyBalance), 0)),
      positionCount: group.length,
      positionIds: group.map((p) => p.id).sort(),
      basis: "OBSERVED" as const,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  const baseTotalMinor = positions.reduce((a, p) => a + toMinor(p.baseCurrencyBalance), 0);

  return {
    asOf: options.asOf,
    byCurrency,
    baseCurrencyTotal: fromMinor(baseTotalMinor),
    baseCurrencyTotalBasis: "DERIVED",
    positionCount: positions.length,
    availableCash: null,
    availableCashBasis: "DATA_NOT_AVAILABLE",
    explanation: [
      `${positions.length} position(s) across ${byCurrency.length} currency/currencies.`,
      `Per-currency native totals involve no FX conversion and are directly observed.`,
      `Group base-currency total ${fromMinor(baseTotalMinor)}. ${FX_ASSUMPTION}`,
      "Available (unencumbered) cash is DATA_NOT_AVAILABLE: the schema records no pledge, lien or " +
        "restriction. The `classification` column is an access-control marker, not a cash restriction.",
    ],
  };
}

// ===========================================================================
// 2. CONCENTRATION FAMILY — thin treasury wrappers over the 7D engine
// ===========================================================================

function toRiskThreshold(t: TreasuryThreshold | undefined): RiskThreshold | undefined {
  if (!t) return undefined;
  return {
    code: t.code,
    value: t.value,
    unit: t.unit,
    direction: t.direction,
    sourceReference: t.sourceReference,
    effectiveFrom: t.effectiveFrom,
    effectiveTo: t.effectiveTo,
  };
}

function adaptRiskResult(
  r: ReturnType<typeof riskConcentration>,
  overrides: { code: string; title: string; extraAssumptions?: string[] },
): TreasuryResult & { buckets: TreasuryBucket[] } {
  return {
    code: overrides.code,
    title: overrides.title,
    basis: r.basis === "DERIVED" ? "DERIVED" : r.basis === "SCENARIO" ? "SCENARIO" : "DATA_NOT_AVAILABLE",
    value: r.value,
    unit: r.unit,
    denominator: r.denominator,
    currency: r.currency,
    severity: r.severity,
    severityBasis: r.severityBasis,
    sources: r.sources.map((s) => ({
      type: "TREASURY_POSITION" as const,
      id: s.id,
      basis: s.basis,
    })),
    calculationMethod: r.calculationMethod,
    assumptions: [...r.assumptions, ...(overrides.extraAssumptions ?? [])],
    missingInputs: r.missingInputs,
    policyDependencies: r.policyDependencies,
    authorityDependencies: r.authorityDependencies,
    explanation: r.explanation,
    buckets: r.buckets.map((b) => ({
      key: b.key,
      label: b.label,
      amountMinor: b.amountMinor,
      sharePercent: b.sharePercent,
      positionIds: [],
    })),
  };
}

/** Concentration by a chosen treasury dimension. Reuses the 7D engine unchanged. */
export function treasuryConcentration(
  positions: TreasuryPositionView[],
  dimension: "COUNTERPARTY" | "CURRENCY" | "ENTITY" | "ACCOUNT_TYPE",
  options: { asOf: string; threshold?: TreasuryThreshold },
): TreasuryResult & { buckets: TreasuryBucket[] } {
  assertIsoDate(options.asOf, "asOf");

  const keyOf = (p: TreasuryPositionView): string =>
    dimension === "COUNTERPARTY" ? p.institution
      : dimension === "CURRENCY" ? p.currency
      : dimension === "ENTITY" ? p.legalEntityId
      : p.accountType;

  const items = positions.map((p) => ({
    id: p.id,
    key: keyOf(p) || "UNSPECIFIED",
    label: keyOf(p) || "UNSPECIFIED",
    amountMinor: toMinor(p.baseCurrencyBalance),
  }));

  const result = riskConcentration(items, {
    asOf: options.asOf,
    threshold: toRiskThreshold(options.threshold),
    dimension: `TREASURY_${dimension}`,
  });

  const adapted = adaptRiskResult(result, {
    code: `TREASURY_CONCENTRATION_${dimension}`,
    title: `Treasury concentration by ${dimension.toLowerCase().replace("_", " ")}`,
    extraAssumptions: [FX_ASSUMPTION],
  });

  // Attach the contributing position ids to each bucket for traceability.
  for (const bucket of adapted.buckets) {
    bucket.positionIds = positions.filter((p) => (keyOf(p) || "UNSPECIFIED") === bucket.key).map((p) => p.id).sort();
  }

  return {
    ...adapted,
    policyDependencies: [...new Set([...adapted.policyDependencies, "P4"])],
  };
}

// ===========================================================================
// 3. LIQUIDITY COVERAGE
// ===========================================================================

/**
 * Coverage of committed outflow by treasury cash.
 *
 * Which account types count as liquid is a policy question the caller must state; the choice is
 * recorded as an assumption rather than assumed by the engine.
 */
export function liquidityCoverage(
  positions: TreasuryPositionView[],
  commitments: Array<{ id: string; amount: string; currency: string; status: string }>,
  options: {
    asOf: string;
    liquidAccountTypes: string[];
    committedStatuses: string[];
    threshold?: TreasuryThreshold;
  },
): TreasuryResult {
  assertIsoDate(options.asOf, "asOf");

  const base = {
    code: "TREASURY_LIQUIDITY_COVERAGE",
    title: "Treasury liquidity coverage",
    unit: "RATIO" as const,
    currency: null,
    sources: positions.map((p) => ({ type: "TREASURY_POSITION" as const, id: p.id, basis: "OBSERVED" as const })),
    calculationMethod: "sum(liquid base-currency balances) / sum(committed amounts)",
    authorityDependencies: [] as string[],
  };

  if (positions.length === 0) {
    return {
      ...base, basis: "DATA_NOT_AVAILABLE", value: null, denominator: null,
      severity: "REQUIRES_POLICY",
      severityBasis: "No positions in scope; coverage cannot be measured.",
      assumptions: [], missingInputs: ["No treasury positions in scope"],
      policyDependencies: ["LIQUIDITY_DEFINITION"],
      explanation: ["No treasury positions. Coverage is undefined, not zero."],
    };
  }

  if (options.liquidAccountTypes.length === 0) {
    return {
      ...base, basis: "DATA_NOT_AVAILABLE", value: null, denominator: null,
      severity: "REQUIRES_POLICY",
      severityBasis: "Which account types are liquid is a policy determination the caller did not supply.",
      assumptions: [], missingInputs: ["Caller did not state which account types count as liquid"],
      policyDependencies: ["LIQUIDITY_DEFINITION"],
      explanation: [
        "Liquidity requires a definition of which balances are liquid. That is policy, and this engine will not assume it.",
      ],
    };
  }

  const liquid = positions.filter((p) => options.liquidAccountTypes.includes(p.accountType));
  const liquidMinor = liquid.reduce((a, p) => a + toMinor(p.baseCurrencyBalance), 0);
  const committed = commitments.filter((c) => options.committedStatuses.includes(c.status));
  const outflowMinor = committed.reduce((a, c) => a + toMinor(c.amount), 0);

  if (outflowMinor === 0) {
    return {
      ...base, basis: "DERIVED", value: null, denominator: "0.00",
      severity: "REQUIRES_POLICY",
      severityBasis: "No committed outflow in scope; a coverage ratio against zero is undefined.",
      assumptions: [`Liquid account types: ${options.liquidAccountTypes.join(", ")} (caller-supplied, not ratified).`, FX_ASSUMPTION],
      missingInputs: ["No committed outflow to measure coverage against"],
      policyDependencies: ["LIQUIDITY_DEFINITION", "P4"],
      explanation: [
        `Liquid balances total ${fromMinor(liquidMinor)} in base currency.`,
        "No committed outflow in scope, so the ratio is undefined rather than infinite.",
      ],
    };
  }

  const ratio = liquidMinor / outflowMinor;
  const banded = bandTreasuryThreshold(Number(ratio.toFixed(4)), options.threshold, options.asOf, "MIN");

  return {
    ...base,
    basis: "DERIVED",
    value: ratio.toFixed(4),
    denominator: fromMinor(outflowMinor),
    severity: banded.severity,
    severityBasis: banded.basis,
    sources: [
      ...liquid.map((p) => ({ type: "TREASURY_POSITION" as const, id: p.id, basis: "OBSERVED" as const })),
      ...committed.map((c) => ({ type: "CAPITAL_REQUEST" as const, id: c.id, basis: "OBSERVED" as const })),
    ],
    assumptions: [
      `Liquid account types: ${options.liquidAccountTypes.join(", ")} (caller-supplied, not ratified).`,
      `Committed statuses: ${options.committedStatuses.join(", ")} (caller-supplied, not ratified).`,
      "Commitment amounts are compared to base-currency balances without conversion; see P4.",
      FX_ASSUMPTION,
    ],
    missingInputs: [],
    policyDependencies: ["LIQUIDITY_DEFINITION", "P4"],
    explanation: [
      `Liquid ${fromMinor(liquidMinor)} against committed ${fromMinor(outflowMinor)} = ${ratio.toFixed(4)}x.`,
      "Whether that coverage is adequate depends on a minimum-liquidity policy that has not been ratified.",
    ],
  };
}

/**
 * Applies a caller-supplied treasury limit. Mirrors the 7D banding contract, including the
 * direction fix: a coverage FLOOR and a concentration CEILING must not be compared identically.
 */
export function bandTreasuryThreshold(
  measured: number,
  threshold: TreasuryThreshold | undefined,
  asOf: string,
  defaultDirection: "MAX" | "MIN" = "MAX",
): { severity: TreasuryResult["severity"]; basis: string } {
  if (!threshold) {
    return {
      severity: "REQUIRES_POLICY",
      basis:
        "No ratified treasury limit, minimum liquidity or concentration cap exists. Severity cannot " +
        "be determined without a governed threshold.",
    };
  }
  if (!threshold.sourceReference || threshold.sourceReference.trim() === "") {
    throw new SpecialistError(
      "RULE_VIOLATION",
      "A treasury limit without a source reference cannot be applied; unattributed limits are refused.",
    );
  }
  assertIsoDate(threshold.effectiveFrom, "threshold.effectiveFrom");

  const effective =
    threshold.effectiveFrom <= asOf && (!threshold.effectiveTo || threshold.effectiveTo >= asOf);
  if (!effective) {
    return {
      severity: "REQUIRES_POLICY",
      basis: `Supplied limit ${threshold.code} is not effective at ${asOf}; severity not determined.`,
    };
  }

  const direction = threshold.direction ?? defaultDirection;
  const breached = direction === "MAX" ? measured >= threshold.value : measured <= threshold.value;
  const suffix = threshold.unit === "PERCENT" ? "%" : "";
  return {
    severity: breached ? "HIGH" : "LOW",
    basis:
      `Measured ${measured}${suffix} against governed ${direction === "MAX" ? "ceiling" : "floor"} ` +
      `${threshold.code} (${threshold.value}${suffix}) from ${threshold.sourceReference}.`,
  };
}

// ===========================================================================
// 4. MATURITY PROFILE — an honest refusal
// ===========================================================================

/**
 * The schema holds no maturity, tenor or value date. Rather than omit the operation (which would
 * leave a treasury user assuming it was never considered), it is implemented as an explicit,
 * documented refusal.
 */
export function maturityProfile(positions: TreasuryPositionView[]): MaturityProfile {
  return {
    basis: "DATA_NOT_AVAILABLE",
    buckets: null,
    missingInputs: [
      "treasury_positions has no maturity, tenor or value-date column",
      "no instrument or deposit table exists to join for maturity",
    ],
    explanation: [
      `${positions.length} position(s) carry no maturity information of any kind.`,
      "A maturity profile is therefore DATA_NOT_AVAILABLE.",
      "Account type (OPERATING vs RESERVE) describes purpose, not tenor. Deriving a maturity ladder " +
        "from it would be fabrication, so this engine returns nothing rather than something plausible.",
    ],
  };
}

// ===========================================================================
// 5. ATTRIBUTION CONSISTENCY
// ===========================================================================

/**
 * Compares the tenant a position claims against the tenant that owns its legal entity.
 * Divergence is GOVERNANCE_REVIEW_REQUIRED. Ownership is never decided here.
 */
export function attributionConsistency(
  positions: TreasuryPositionView[],
  entityOwners: Record<string, string>,
): AttributionConsistency[] {
  return positions.map((p) => {
    const owner = entityOwners[p.legalEntityId] ?? null;

    if (!owner) {
      return {
        positionId: p.id,
        claimedTenantId: p.tenantId,
        legalEntityId: p.legalEntityId,
        owningTenantId: null,
        consistent: false,
        basis: "DATA_NOT_AVAILABLE" as const,
        explanation: `Legal entity ${p.legalEntityId} does not exist; ownership cannot be established.`,
      };
    }
    if (owner !== p.tenantId) {
      return {
        positionId: p.id,
        claimedTenantId: p.tenantId,
        legalEntityId: p.legalEntityId,
        owningTenantId: owner,
        consistent: false,
        basis: "GOVERNANCE_REVIEW_REQUIRED" as const,
        explanation:
          `Position claims tenant ${p.tenantId} but legal entity ${p.legalEntityId} is owned by ${owner}. ` +
          "Which attribution is correct is a governance question and is not decided here.",
      };
    }
    return {
      positionId: p.id,
      claimedTenantId: p.tenantId,
      legalEntityId: p.legalEntityId,
      owningTenantId: owner,
      consistent: true,
      basis: "OBSERVED" as const,
      explanation: "Claimed tenant matches recorded entity ownership.",
    };
  });
}

// ===========================================================================
// 6. DATA QUALITY
// ===========================================================================

/**
 * Structural checks over observed positions, including verification of the FX restatement.
 *
 * No score is produced. A "treasury data quality: 72/100" would imply a ratified tolerance for
 * defects, and none exists.
 */
export function treasuryDataQuality(
  positions: TreasuryPositionView[],
  options: { asOf: string; entityOwners?: Record<string, string>; staleAfterDays?: number },
): TreasuryDataQuality {
  assertIsoDate(options.asOf, "asOf");
  const findings: TreasuryFinding[] = [];

  if (positions.length === 0) {
    return {
      findings: [],
      positionsAssessed: 0,
      score: null,
      scoreBasis: "REQUIRES_POLICY",
      basis: "DATA_NOT_AVAILABLE",
      explanation: ["No treasury positions in scope; data quality cannot be assessed."],
    };
  }

  const seen = new Set<string>();
  for (const p of positions) {
    const key = `${p.institution}|${p.currency}|${p.accountType}|${p.asOf}|${p.legalEntityId}`;
    if (seen.has(key)) {
      findings.push(finding("DUPLICATE_POSITION", "WARNING", "TREASURY_POSITION", p.id, `Duplicate position signature: ${key}.`));
    }
    seen.add(key);

    if (!p.institution || p.institution.trim() === "") {
      findings.push(finding("MISSING_INSTITUTION", "WARNING", "TREASURY_POSITION", p.id, "No counterparty institution recorded; counterparty exposure is incomplete."));
    }
    if (!p.currency || p.currency.trim() === "") {
      findings.push(finding("MISSING_CURRENCY", "WARNING", "TREASURY_POSITION", p.id, "No currency recorded."));
    } else if (!/^[A-Z]{3}$/.test(p.currency)) {
      findings.push(finding("MALFORMED_CURRENCY", "WARNING", "TREASURY_POSITION", p.id, `Currency '${p.currency}' is not a 3-letter code.`));
    }

    const balMinor = toMinor(p.balance);
    if (balMinor < 0) {
      findings.push(finding("NEGATIVE_BALANCE", "WARNING", "TREASURY_POSITION", p.id, `Negative balance ${p.balance}; an overdraft or data error, not verified here.`));
    } else if (balMinor === 0) {
      findings.push(finding("ZERO_BALANCE", "INFO", "TREASURY_POSITION", p.id, "Balance is zero."));
    }

    if (!ISO_DATE.test(p.asOf)) {
      findings.push(finding("STALE_SNAPSHOT", "WARNING", "TREASURY_POSITION", p.id, `as_of '${p.asOf}' is not a valid date.`));
    } else if (p.asOf > options.asOf) {
      findings.push(finding("FUTURE_DATED_POSITION", "WARNING", "TREASURY_POSITION", p.id, `Position is dated ${p.asOf}, after the date under review.`));
    }

    if (options.entityOwners) {
      const owner = options.entityOwners[p.legalEntityId];
      if (!owner) {
        findings.push(finding("ORPHANED_ENTITY_REFERENCE", "GOVERNANCE", "TREASURY_POSITION", p.id, `Legal entity ${p.legalEntityId} does not exist.`));
      } else if (owner !== p.tenantId) {
        findings.push(finding("TENANT_ENTITY_ATTRIBUTION_MISMATCH", "GOVERNANCE", "TREASURY_POSITION", p.id,
          `Claims tenant ${p.tenantId} but entity ${p.legalEntityId} is owned by ${owner}.`));
      }
    }
  }

  // --- Snapshot recency, measured on the newest position ---
  const dates = positions.map((p) => p.asOf).filter((d) => ISO_DATE.test(d)).sort();
  if (options.staleAfterDays !== undefined && dates.length > 0) {
    const latest = dates[dates.length - 1];
    const ageDays = Math.round(
      (Date.parse(`${options.asOf}T00:00:00Z`) - Date.parse(`${latest}T00:00:00Z`)) / 86_400_000,
    );
    if (ageDays > options.staleAfterDays) {
      findings.push(finding("STALE_SNAPSHOT", "WARNING", "TREASURY_POSITION", latest,
        `Most recent treasury snapshot is ${ageDays} day(s) old.`));
    }
  }

  // --- Single snapshot means no trend is possible ---
  const distinctDates = new Set(dates);
  if (distinctDates.size <= 1) {
    findings.push(finding("SINGLE_SNAPSHOT_ONLY", "INFO", "TREASURY_POSITION", [...distinctDates][0] ?? "UNKNOWN",
      "All positions share one as_of date; movement, trend and historical comparison are impossible."));
  }

  // --- FX restatement verification: the implied rate must be internally consistent ---
  const impliedByCurrency = new Map<string, Array<{ id: string; rate: number }>>();
  for (const p of positions) {
    const baseMinor = toMinor(p.baseCurrencyBalance);
    const nativeMinor = toMinor(p.balance);
    if (baseMinor === 0 || nativeMinor === 0) continue;
    if (nativeMinor === baseMinor) continue; // base-currency position, no restatement
    const rate = nativeMinor / baseMinor;
    impliedByCurrency.set(p.currency, [...(impliedByCurrency.get(p.currency) ?? []), { id: p.id, rate }]);
  }
  for (const [currency, entries] of impliedByCurrency) {
    if (entries.length < 2) continue;
    const rates = entries.map((e) => e.rate);
    const min = Math.min(...rates);
    const max = Math.max(...rates);
    // Any divergence beyond rounding means several different rates were used.
    if ((max - min) / min > 0.0001) {
      findings.push(finding("INCONSISTENT_IMPLIED_FX_RATE", "GOVERNANCE", "TREASURY_POSITION", entries.map((e) => e.id).join(","),
        `${currency} positions imply ${entries.length} different FX rates (${min.toFixed(4)} to ${max.toFixed(4)}). ` +
        "The base-currency restatement cannot be reproduced from a single rate; these balances must not be used as an FX source."));
    }
  }

  findings.push(finding("NO_MATURITY_DATA", "INFO", "TREASURY_POSITION", "ALL",
    "No maturity/tenor column exists; maturity analysis is impossible."));
  findings.push(finding("NO_ENCUMBRANCE_DATA", "INFO", "TREASURY_POSITION", "ALL",
    "No encumbrance/pledge column exists; available-vs-restricted cash cannot be split. " +
    "`classification` is an access-control marker and is deliberately NOT read as a cash restriction."));
  findings.push(finding("BASE_RESTATEMENT_UNVERIFIABLE", "GOVERNANCE", "TREASURY_POSITION", "ALL",
    "base_currency_balance carries an FX rate that is not recorded in the system and cannot be verified."));

  return {
    findings,
    positionsAssessed: positions.length,
    score: null,
    scoreBasis: "REQUIRES_POLICY",
    basis: "DERIVED",
    explanation: [
      `${findings.length} finding(s) across ${positions.length} position(s).`,
      `${findings.filter((f) => f.severity === "GOVERNANCE").length} require a governance decision.`,
      "No composite score is produced: scoring implies a ratified tolerance for treasury data defects, and none exists.",
      "Findings are reported, never repaired. Treasury data is not corrected by an analysis layer.",
    ],
  };
}

// ===========================================================================
// 7. SCENARIO — hypothetical, provably non-mutating
// ===========================================================================

/**
 * Recomputes counterparty concentration under hypothetical adjustments.
 * Operates on a deep copy; the caller's observations are unchanged after the call.
 */
export function treasuryScenario(
  positions: TreasuryPositionView[],
  adjustments: TreasuryScenarioAdjustment[],
  options: { asOf: string; scenarioCode: string },
): TreasuryResult & { buckets: TreasuryBucket[] } {
  assertIsoDate(options.asOf, "asOf");

  if (!options.scenarioCode || options.scenarioCode.trim() === "") {
    throw new SpecialistError("RULE_VIOLATION", "A scenario code is required.");
  }
  for (const a of adjustments) {
    if (!Number.isFinite(a.factor) || a.factor < 0) {
      throw new SpecialistError("RULE_VIOLATION", "Scenario factor must be a non-negative finite number.");
    }
    if (!a.rationale || a.rationale.trim() === "") {
      throw new SpecialistError("RULE_VIOLATION", "Every scenario adjustment must state a rationale.");
    }
  }

  const adjusted: TreasuryPositionView[] = positions.map((p) => {
    const adj = adjustments.find((a) => a.targetPositionId === p.id);
    if (!adj) return { ...p };
    return {
      ...p,
      balance: fromMinor(Math.round(toMinor(p.balance) * adj.factor)),
      baseCurrencyBalance: fromMinor(Math.round(toMinor(p.baseCurrencyBalance) * adj.factor)),
    };
  });

  const result = treasuryConcentration(adjusted, "COUNTERPARTY", { asOf: options.asOf });

  return {
    ...result,
    code: `TREASURY_SCENARIO_${options.scenarioCode}`,
    title: `Treasury scenario ${options.scenarioCode}`,
    // A scenario is never DERIVED fact, whatever the underlying arithmetic produced.
    basis: "SCENARIO",
    sources: adjusted.map((p) => ({ type: "TREASURY_POSITION" as const, id: p.id, basis: "SCENARIO" as const })),
    assumptions: [
      ...adjustments.map((a) => `${a.targetPositionId} x${a.factor}: ${a.rationale}`),
      FX_ASSUMPTION,
    ],
    explanation: [
      `Hypothetical recomputation under scenario ${options.scenarioCode} with ${adjustments.length} adjustment(s).`,
      "SCENARIO output. Not an observed position, not a forecast, and not a basis for any action.",
    ],
  };
}
