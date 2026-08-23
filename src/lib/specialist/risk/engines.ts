/**
 * BEYU OS — Financial Risk engines (Phase 7D).
 *
 * Ten deterministic, pure functions. No database, no principal, no authority — those are applied
 * by the service layer through the Phase 7B specialist platform. Purity makes every calculation
 * independently replayable and unit-testable, which matters because a risk number that cannot be
 * reproduced cannot be defended.
 *
 * TWO RULES ENFORCED THROUGHOUT:
 *
 *   1. ABSENT INPUT NEVER BECOMES ZERO. Every engine returns `value: null` with
 *      `basis: "DATA_NOT_AVAILABLE"` and a populated `missingInputs` list when it cannot compute.
 *      Reporting "0% concentration" for an entity with no data would be a lie that looks like a
 *      clean bill of health.
 *
 *   2. SEVERITY REQUIRES A THRESHOLD. BEYU has ratified no risk appetite, so severity defaults to
 *      `REQUIRES_POLICY`. A caller may supply a governed threshold with provenance, and only then
 *      does the engine band the result.
 */
import { SpecialistError } from "../platform";
import type {
  ConcentrationBucket,
  RiskResult,
  RiskSource,
  RiskThreshold,
  ScenarioAdjustment,
} from "./model";

export const RISK_VERSION = "risk-1.0.0";

// ---------------------------------------------------------------------------
// Money — integer minor units, same convention as the posting and FP&A engines.
// ---------------------------------------------------------------------------

export function toMinor(value: string): number {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) {
    throw new SpecialistError("RULE_VIOLATION", `Value '${value}' is not a valid amount.`);
  }
  const [whole, frac = ""] = value.split(".");
  const negative = whole.startsWith("-");
  const magnitude = Number(`${whole.replace("-", "")}${frac.padEnd(2, "0")}`);
  if (!Number.isSafeInteger(magnitude)) {
    throw new SpecialistError("RULE_VIOLATION", `Value '${value}' exceeds the safe range.`);
  }
  return negative ? -magnitude : magnitude;
}

export function fromMinor(minor: number): string {
  const rounded = Math.round(minor);
  const negative = rounded < 0;
  const s = Math.abs(rounded).toString().padStart(3, "0");
  return `${negative ? "-" : ""}${s.slice(0, -2)}.${s.slice(-2)}`;
}

/** Inputs the engines operate on. All supplied by the service from canonical sources. */
export type TreasuryObservation = {
  id: string;
  tenantId: string;
  legalEntityId: string;
  currency: string;
  institution: string;
  accountType: string;
  /** Balance in the position's own currency. */
  balance: string;
  /** Balance restated in the group base currency. The ONLY field safe to aggregate. */
  baseCurrencyBalance: string;
  asOf: string;
};

export type CapitalObservation = {
  id: string;
  code: string;
  tenantId: string;
  legalEntityId: string;
  status: string;
  amount: string;
  currency: string;
  sectorCode: string | null;
};

/**
 * Applies a governed threshold if one is supplied and effective. Without one, severity stays
 * REQUIRES_POLICY — the engines never invent a band.
 */
function bandBySuppliedThreshold(
  measured: number,
  threshold: RiskThreshold | undefined,
  asOf: string,
  /** Default direction when the caller's threshold does not state one. */
  defaultDirection: "MAX" | "MIN" = "MAX",
): { severity: RiskResult["severity"]; basis: string } {
  if (!threshold) {
    return {
      severity: "REQUIRES_POLICY",
      basis:
        "No ratified risk appetite or limit exists. Severity cannot be determined without a " +
        "governed threshold.",
    };
  }
  if (!threshold.sourceReference || threshold.sourceReference.trim() === "") {
    throw new SpecialistError(
      "RULE_VIOLATION",
      "A threshold without a source reference cannot be applied; unattributed limits are refused.",
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(threshold.effectiveFrom)) {
    throw new SpecialistError("RULE_VIOLATION", "Threshold effectiveFrom must be an ISO date.");
  }
  const effective =
    threshold.effectiveFrom <= asOf && (!threshold.effectiveTo || threshold.effectiveTo >= asOf);
  if (!effective) {
    return {
      severity: "REQUIRES_POLICY",
      basis: `Supplied threshold ${threshold.code} is not effective at ${asOf}; severity not determined.`,
    };
  }
  const direction = threshold.direction ?? defaultDirection;
  const breached = direction === "MAX" ? measured >= threshold.value : measured <= threshold.value;
  const unitSuffix = threshold.unit === "PERCENT" ? "%" : "";
  return {
    severity: breached ? "HIGH" : "LOW",
    basis:
      `Measured ${measured}${unitSuffix} against governed ${direction === "MAX" ? "ceiling" : "floor"} ` +
      `${threshold.code} (${threshold.value}${unitSuffix}) from ${threshold.sourceReference}.`,
  };
}

function unavailable(
  riskType: RiskResult["riskType"],
  code: string,
  title: string,
  missing: string[],
  explanation: string[],
  policyDeps: string[] = [],
  authorityDeps: string[] = [],
): RiskResult {
  return {
    riskType,
    code,
    title,
    basis: "DATA_NOT_AVAILABLE",
    value: null,
    unit: "NONE",
    denominator: null,
    currency: null,
    severity: "REQUIRES_POLICY",
    severityBasis: "Severity cannot be assessed because the required input is absent.",
    sources: [],
    calculationMethod: "Not computed: required input absent.",
    assumptions: [],
    missingInputs: missing,
    policyDependencies: policyDeps,
    authorityDependencies: authorityDeps,
    explanation,
  };
}

// ---------------------------------------------------------------------------
// 1. CONCENTRATION
// ---------------------------------------------------------------------------

/**
 * Concentration of value across buckets (institution, currency, sector, entity).
 * Pure arithmetic over observed balances: a DERIVED fact about the data, not a measurement.
 */
export function concentration(
  items: Array<{ id: string; key: string; label: string; amountMinor: number }>,
  options: { asOf: string; threshold?: RiskThreshold; dimension: string; currency?: string },
): RiskResult & { buckets: ConcentrationBucket[] } {
  const base = { buckets: [] as ConcentrationBucket[] };

  if (items.length === 0) {
    return {
      ...unavailable(
        "CONCENTRATION",
        `CONCENTRATION_${options.dimension}`,
        `Concentration by ${options.dimension}`,
        [`No observations available for dimension ${options.dimension}`],
        [
          `No records exist to measure ${options.dimension} concentration.`,
          "Reporting zero concentration would falsely imply a diversified position.",
        ],
      ),
      ...base,
    };
  }

  const totals = new Map<string, { label: string; amount: number }>();
  for (const item of items) {
    const existing = totals.get(item.key);
    totals.set(item.key, {
      label: item.label,
      amount: (existing?.amount ?? 0) + item.amountMinor,
    });
  }

  const total = [...totals.values()].reduce((a, b) => a + b.amount, 0);
  if (total <= 0) {
    return {
      ...unavailable(
        "CONCENTRATION",
        `CONCENTRATION_${options.dimension}`,
        `Concentration by ${options.dimension}`,
        ["Total exposure is zero or negative; a share cannot be computed"],
        ["A concentration percentage against a zero total is undefined, not zero."],
      ),
      ...base,
    };
  }

  const buckets: ConcentrationBucket[] = [...totals.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      amountMinor: v.amount,
      sharePercent: ((v.amount / total) * 100).toFixed(2),
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor);

  const largest = buckets[0];
  const measured = Number(largest.sharePercent);
  const { severity, basis } = bandBySuppliedThreshold(measured, options.threshold, options.asOf);

  return {
    riskType: "CONCENTRATION",
    code: `CONCENTRATION_${options.dimension}`,
    title: `Concentration by ${options.dimension}`,
    basis: "DERIVED",
    value: largest.sharePercent,
    unit: "PERCENT",
    denominator: fromMinor(total),
    currency: options.currency ?? null,
    severity,
    severityBasis: basis,
    sources: items.map((i) => ({ type: "OBSERVATION", id: i.id, basis: "OBSERVED" as const })),
    calculationMethod:
      "largest bucket total / sum of all bucket totals * 100, over observed base-currency amounts",
    assumptions: [],
    missingInputs: [],
    policyDependencies: options.threshold ? [] : ["RISK_APPETITE_THRESHOLD"],
    authorityDependencies: [],
    explanation: [
      `${buckets.length} bucket(s) across ${items.length} observation(s), total ${fromMinor(total)}.`,
      `Largest: ${largest.label} at ${largest.sharePercent}%.`,
      "This is a derived fact about observed balances. Whether it is acceptable is risk appetite, which is unratified.",
    ],
    buckets,
  };
}

// ---------------------------------------------------------------------------
// 2. LIQUIDITY COVERAGE
// ---------------------------------------------------------------------------

/**
 * Ratio of liquid treasury to committed outflow.
 *
 * Which account types count as "liquid" is a policy question; the caller must state it, and the
 * choice is recorded as an assumption rather than baked in.
 */
export function liquidityCoverage(
  positions: TreasuryObservation[],
  commitments: CapitalObservation[],
  options: { asOf: string; liquidAccountTypes: string[]; threshold?: RiskThreshold; committedStatuses: string[] },
): RiskResult {
  if (positions.length === 0) {
    return unavailable(
      "LIQUIDITY",
      "LIQUIDITY_COVERAGE",
      "Liquidity coverage",
      ["No treasury positions available"],
      ["Cannot assess liquidity with no observed treasury positions."],
    );
  }
  if (options.liquidAccountTypes.length === 0) {
    return unavailable(
      "LIQUIDITY",
      "LIQUIDITY_COVERAGE",
      "Liquidity coverage",
      ["Caller did not state which account types are liquid"],
      [
        "Which account types count as liquid is a policy determination.",
        "The engine will not assume it.",
      ],
      ["LIQUIDITY_DEFINITION"],
    );
  }

  const liquid = positions.filter((p) => options.liquidAccountTypes.includes(p.accountType));
  const liquidTotal = liquid.reduce((a, p) => a + toMinor(p.baseCurrencyBalance), 0);

  const committed = commitments.filter((c) => options.committedStatuses.includes(c.status));
  const outflowTotal = committed.reduce((a, c) => a + toMinor(c.amount), 0);

  if (outflowTotal === 0) {
    return {
      riskType: "LIQUIDITY",
      code: "LIQUIDITY_COVERAGE",
      title: "Liquidity coverage",
      basis: "DERIVED",
      value: null,
      unit: "RATIO",
      denominator: "0.00",
      currency: null,
      severity: "REQUIRES_POLICY",
      severityBasis: "No committed outflow in scope; a coverage ratio against zero is undefined.",
      sources: liquid.map((p) => ({ type: "TREASURY_POSITION", id: p.id, basis: "OBSERVED" as const })),
      calculationMethod: "liquid base-currency balances / committed outflow",
      assumptions: [`Liquid account types: ${options.liquidAccountTypes.join(", ")} (caller-supplied).`],
      missingInputs: ["No committed outflow to measure coverage against"],
      policyDependencies: ["LIQUIDITY_DEFINITION"],
      authorityDependencies: [],
      explanation: [
        `Liquid balances total ${fromMinor(liquidTotal)} in base currency.`,
        "No committed outflow exists in scope, so a ratio is undefined rather than infinite.",
      ],
    };
  }

  const ratio = liquidTotal / outflowTotal;
  // Coverage is a FLOOR: falling to or below the threshold is the breach. Passing MIN here rather
  // than inverting the value keeps the reported severityBasis truthful about what was compared.
  const { severity, basis } = bandBySuppliedThreshold(
    Number(ratio.toFixed(4)),
    options.threshold,
    options.asOf,
    "MIN",
  );

  return {
    riskType: "LIQUIDITY",
    code: "LIQUIDITY_COVERAGE",
    title: "Liquidity coverage",
    basis: "DERIVED",
    value: ratio.toFixed(4),
    unit: "RATIO",
    denominator: fromMinor(outflowTotal),
    currency: null,
    severity,
    severityBasis: basis,
    sources: [
      ...liquid.map((p) => ({ type: "TREASURY_POSITION", id: p.id, basis: "OBSERVED" as const })),
      ...committed.map((c) => ({ type: "CAPITAL_REQUEST", id: c.id, basis: "OBSERVED" as const })),
    ],
    calculationMethod: "sum(liquid base-currency balances) / sum(committed capital amounts)",
    assumptions: [
      `Liquid account types: ${options.liquidAccountTypes.join(", ")} (caller-supplied, not ratified).`,
      `Committed statuses: ${options.committedStatuses.join(", ")} (caller-supplied, not ratified).`,
      "Capital amounts are compared to base-currency balances without FX conversion; see P4.",
    ],
    missingInputs: [],
    policyDependencies: ["LIQUIDITY_DEFINITION", "P4"],
    authorityDependencies: [],
    explanation: [
      `Liquid ${fromMinor(liquidTotal)} against committed ${fromMinor(outflowTotal)} = ${ratio.toFixed(4)}x.`,
      "Whether this coverage is adequate depends on a risk appetite that has not been ratified.",
    ],
  };
}

// ---------------------------------------------------------------------------
// 3-6. EXPOSURE ENGINES
// ---------------------------------------------------------------------------

export function counterpartyExposure(
  positions: TreasuryObservation[],
  options: { asOf: string; threshold?: RiskThreshold },
): RiskResult & { buckets: ConcentrationBucket[] } {
  return concentration(
    positions.map((p) => ({
      id: p.id,
      key: p.institution,
      label: p.institution,
      amountMinor: toMinor(p.baseCurrencyBalance),
    })),
    { asOf: options.asOf, threshold: options.threshold, dimension: "COUNTERPARTY" },
  );
}

export function currencyExposure(
  positions: TreasuryObservation[],
  options: { asOf: string; threshold?: RiskThreshold },
): RiskResult & { buckets: ConcentrationBucket[] } {
  const result = concentration(
    positions.map((p) => ({
      id: p.id,
      key: p.currency,
      label: p.currency,
      amountMinor: toMinor(p.baseCurrencyBalance),
    })),
    { asOf: options.asOf, threshold: options.threshold, dimension: "CURRENCY" },
  );
  // Currency exposure is computed on already-restated base amounts, so it does not itself apply
  // an FX rate — but the restatement upstream did, and that provenance must not be hidden.
  return {
    ...result,
    assumptions: [
      ...result.assumptions,
      "Computed over base_currency_balance, which was restated upstream by a rate this module did not verify (P4).",
    ],
    policyDependencies: [...new Set([...result.policyDependencies, "P4"])],
  };
}

export function treasuryExposure(
  positions: TreasuryObservation[],
  options: { asOf: string; threshold?: RiskThreshold },
): RiskResult & { buckets: ConcentrationBucket[] } {
  return concentration(
    positions.map((p) => ({
      id: p.id,
      key: p.accountType,
      label: p.accountType,
      amountMinor: toMinor(p.baseCurrencyBalance),
    })),
    { asOf: options.asOf, threshold: options.threshold, dimension: "TREASURY_ACCOUNT_TYPE" },
  );
}

export function capitalExposure(
  requests: CapitalObservation[],
  options: { asOf: string; threshold?: RiskThreshold; dimension?: "SECTOR" | "ENTITY" },
): RiskResult & { buckets: ConcentrationBucket[] } {
  const dimension = options.dimension ?? "SECTOR";
  const result = concentration(
    requests.map((c) => ({
      id: c.id,
      key: dimension === "SECTOR" ? (c.sectorCode ?? "UNCLASSIFIED") : c.legalEntityId,
      label: dimension === "SECTOR" ? (c.sectorCode ?? "UNCLASSIFIED") : c.legalEntityId,
      amountMinor: toMinor(c.amount),
    })),
    { asOf: options.asOf, threshold: options.threshold, dimension: `CAPITAL_${dimension}` },
  );
  return { ...result, riskType: "CAPITAL_EXPOSURE" };
}

// ---------------------------------------------------------------------------
// 7. DATA QUALITY RISK
// ---------------------------------------------------------------------------

export function dataQualityRisk(
  positions: TreasuryObservation[],
  requests: CapitalObservation[],
  options: {
    asOf: string;
    staleAfterDays?: number;
    /** entity id -> owning tenant id, used to detect cross-tenant attribution. */
    entityTenants?: Record<string, string>;
  },
): RiskResult & { issues: string[] } {
  const issues: string[] = [];

  /**
   * Cross-tenant attribution check.
   *
   * A record can carry tenant A while pointing at a legal entity owned by tenant B. Aggregating
   * those balances under tenant A silently overstates it. This is reported, never corrected:
   * deciding which of the two attributions is right is an ownership question for governance.
   */
  if (options.entityTenants) {
    for (const rec of [
      ...positions.map((p) => ({ kind: "Treasury position", id: p.id, tenantId: p.tenantId, entityId: p.legalEntityId })),
      ...requests.map((r) => ({ kind: "Capital request", id: r.code, tenantId: r.tenantId, entityId: r.legalEntityId })),
    ]) {
      const owner = options.entityTenants[rec.entityId];
      if (owner && owner !== rec.tenantId) {
        issues.push(
          `${rec.kind} ${rec.id} is recorded under tenant ${rec.tenantId} but its legal entity ` +
            `${rec.entityId} belongs to tenant ${owner}; attribution is inconsistent.`,
        );
      }
    }
  }

  if (positions.length === 0) issues.push("No treasury positions available.");
  if (requests.length === 0) issues.push("No capital requests available.");

  const seen = new Set<string>();
  for (const p of positions) {
    const key = `${p.institution}|${p.currency}|${p.accountType}|${p.asOf}`;
    if (seen.has(key)) issues.push(`Duplicate treasury observation: ${key}.`);
    seen.add(key);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.asOf)) issues.push(`Invalid as_of date on position ${p.id}.`);
    else if (p.asOf > options.asOf) issues.push(`Position ${p.id} is dated in the future.`);
    if (!/^[A-Z]{3}$/.test(p.currency)) issues.push(`Position ${p.id} has a malformed currency.`);
    if (!p.institution || p.institution.trim() === "")
      issues.push(`Position ${p.id} has no counterparty institution recorded.`);
  }

  if (options.staleAfterDays !== undefined && positions.length > 0) {
    const latest = positions
      .map((p) => p.asOf)
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
      .pop();
    if (latest) {
      const ageDays = Math.floor(
        (Date.parse(`${options.asOf}T00:00:00Z`) - Date.parse(`${latest}T00:00:00Z`)) / 86_400_000,
      );
      if (ageDays > options.staleAfterDays) {
        issues.push(`Most recent treasury observation is ${ageDays} day(s) old.`);
      }
    }
  }

  const currencies = new Set(requests.map((r) => r.currency));
  if (currencies.size > 1) {
    issues.push(
      `Capital requests span ${currencies.size} currencies; aggregation requires the FX decision (P4).`,
    );
  }

  return {
    riskType: "DATA_QUALITY",
    code: "DATA_QUALITY_RISK",
    title: "Data quality risk",
    basis: "DERIVED",
    value: String(issues.length),
    unit: "COUNT",
    denominator: String(positions.length + requests.length),
    currency: null,
    severity: "REQUIRES_POLICY",
    severityBasis: "No ratified data-quality tolerance exists; issue count is reported without a band.",
    sources: [
      ...positions.map((p) => ({ type: "TREASURY_POSITION", id: p.id, basis: "OBSERVED" as const })),
      ...requests.map((r) => ({ type: "CAPITAL_REQUEST", id: r.id, basis: "OBSERVED" as const })),
    ],
    calculationMethod: "structural checks over observed records; no data is repaired",
    assumptions: [],
    missingInputs: [],
    policyDependencies: [],
    authorityDependencies: [],
    explanation: [
      `${issues.length} data-quality issue(s) across ${positions.length + requests.length} record(s).`,
      "Issues are reported, never silently repaired: financial data is not corrected by an analysis layer.",
    ],
    issues,
  };
}

// ---------------------------------------------------------------------------
// 8. AUTHORITY RISK
// ---------------------------------------------------------------------------

/**
 * Reports governance/authority conditions that constrain the organisation. Read-only: it observes
 * the registry, never alters it.
 */
export function authorityRisk(input: {
  pendingDecisions: string[];
  lockedCapabilities: string[];
  policiesWithoutProvenance: number;
  totalPolicies: number;
}): RiskResult & { items: Array<{ code: string; detail: string; advisoryOnly: true }> } {
  const items: Array<{ code: string; detail: string; advisoryOnly: true }> = [];

  if (input.pendingDecisions.length > 0) {
    items.push({
      code: "DECISIONS_PENDING",
      detail: `${input.pendingDecisions.length} governance decision(s) remain unratified: ${input.pendingDecisions.slice(0, 8).join(", ")}${input.pendingDecisions.length > 8 ? "…" : ""}.`,
      advisoryOnly: true,
    });
  }
  if (input.lockedCapabilities.length > 0) {
    items.push({
      code: "CAPABILITIES_LOCKED",
      detail: `${input.lockedCapabilities.length} capability/capabilities cannot execute pending ratification.`,
      advisoryOnly: true,
    });
  }
  if (input.policiesWithoutProvenance > 0) {
    items.push({
      code: "POLICY_PROVENANCE_ABSENT",
      detail:
        `${input.policiesWithoutProvenance} of ${input.totalPolicies} active policies carry no approving ` +
        "resolution; policy authority cannot be evidenced in-system (C-1).",
      advisoryOnly: true,
    });
  }

  return {
    riskType: "GOVERNANCE_AUTHORITY",
    code: "AUTHORITY_RISK",
    title: "Governance and authority risk",
    basis: "OBSERVED",
    value: String(items.length),
    unit: "COUNT",
    denominator: null,
    currency: null,
    severity: "REQUIRES_POLICY",
    severityBasis: "No ratified tolerance for governance risk exists; conditions are reported unbanded.",
    sources: [],
    calculationMethod: "direct observation of the decision and capability registries",
    assumptions: [],
    missingInputs: [],
    policyDependencies: [],
    authorityDependencies: input.pendingDecisions.slice(0, 16),
    explanation: [
      `${items.length} authority condition(s) observed.`,
      "This analysis reports registry state. It cannot alter authority or activate a capability.",
    ],
    items,
  };
}

// ---------------------------------------------------------------------------
// 9. THRESHOLD ASSESSMENT
// ---------------------------------------------------------------------------

export function thresholdAssessment(
  measured: { code: string; value: string | null; unit: RiskResult["unit"] },
  threshold: RiskThreshold | undefined,
  asOf: string,
): RiskResult {
  if (measured.value === null) {
    return unavailable(
      "LIMIT_BREACH",
      `LIMIT_${measured.code}`,
      `Limit assessment for ${measured.code}`,
      ["The measured value is unavailable"],
      ["A limit cannot be assessed against an absent measurement."],
    );
  }
  const numeric = Number(measured.value);
  if (!Number.isFinite(numeric)) {
    throw new SpecialistError("RULE_VIOLATION", `Measured value '${measured.value}' is not numeric.`);
  }
  const { severity, basis } = bandBySuppliedThreshold(numeric, threshold, asOf);

  return {
    riskType: "LIMIT_BREACH",
    code: `LIMIT_${measured.code}`,
    title: `Limit assessment for ${measured.code}`,
    basis: "DERIVED",
    value: measured.value,
    unit: measured.unit,
    denominator: threshold ? String(threshold.value) : null,
    currency: null,
    severity,
    severityBasis: basis,
    sources: [],
    calculationMethod: threshold
      ? `measured value compared against governed threshold ${threshold.code}`
      : "no threshold supplied; no comparison performed",
    assumptions: [],
    missingInputs: threshold ? [] : ["No governed threshold supplied"],
    policyDependencies: threshold ? [] : ["RISK_APPETITE_THRESHOLD"],
    authorityDependencies: [],
    explanation: [
      threshold
        ? `Measured ${measured.value} against ${threshold.value} from ${threshold.sourceReference}.`
        : "No governed threshold was supplied, so no breach determination is possible.",
    ],
  };
}

// ---------------------------------------------------------------------------
// 10. SCENARIO RISK
// ---------------------------------------------------------------------------

/**
 * Recomputes concentration under hypothetical adjustments.
 *
 * Operates on an in-memory copy. The returned result is basis SCENARIO and can never be mistaken
 * for an observed position; scenario output never touches production data.
 */
export function scenarioRisk(
  positions: TreasuryObservation[],
  adjustments: ScenarioAdjustment[],
  options: { asOf: string; scenarioCode: string },
): RiskResult & { buckets: ConcentrationBucket[] } {
  for (const adj of adjustments) {
    if (!Number.isFinite(adj.factor) || adj.factor < 0) {
      throw new SpecialistError("RULE_VIOLATION", "Scenario factor must be a non-negative finite number.");
    }
    if (!adj.rationale || adj.rationale.trim() === "") {
      throw new SpecialistError("RULE_VIOLATION", "Every scenario adjustment must state a rationale.");
    }
  }

  // Deep copy: the caller's observations must be unchanged after this call.
  const adjusted = positions.map((p) => {
    const adj = adjustments.find((a) => a.targetId === p.id);
    if (!adj) return { ...p };
    return { ...p, baseCurrencyBalance: fromMinor(Math.round(toMinor(p.baseCurrencyBalance) * adj.factor)) };
  });

  const result = concentration(
    adjusted.map((p) => ({
      id: p.id,
      key: p.institution,
      label: p.institution,
      amountMinor: toMinor(p.baseCurrencyBalance),
    })),
    { asOf: options.asOf, dimension: `SCENARIO_${options.scenarioCode}` },
  );

  const sources: RiskSource[] = adjusted.map((p) => ({
    type: "TREASURY_POSITION",
    id: p.id,
    basis: "SCENARIO" as const,
  }));

  return {
    ...result,
    riskType: "SCENARIO",
    // Overriding basis is the whole point: a scenario is never DERIVED fact.
    basis: "SCENARIO",
    sources,
    assumptions: adjustments.map((a) => `${a.targetId} x${a.factor}: ${a.rationale}`),
    explanation: [
      `Hypothetical recomputation under scenario ${options.scenarioCode} with ${adjustments.length} adjustment(s).`,
      "SCENARIO output. Not an observed position and not a forecast of one.",
    ],
    buckets: result.buckets,
  };
}
