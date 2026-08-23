/**
 * BEYU OS — Treasury Intelligence domain model (Phase 7F).
 *
 * Types only. No limits, no minimum liquidity, no maximum concentration, no FX rates, no
 * maturity assumptions, no treasury policy of any kind.
 *
 * WHAT THE SUBSTRATE ACTUALLY CONTAINS (verified column by column against the live schema, not
 * assumed from the domain):
 *
 *   treasury_positions(id, tenant_id, legal_entity_id, institution, account_label, account_type,
 *                      currency, balance, base_currency_balance, as_of, classification)
 *
 * That is the whole of it. There is exactly ONE table, FIVE rows, and ONE as_of date.
 *
 * WHAT IS THEREFORE IMPOSSIBLE, AND IS MODELLED AS ABSENT RATHER THAN GUESSED:
 *
 *   MATURITY        — no maturity, tenor or value date column exists anywhere. A maturity profile
 *                     cannot be computed, and inferring one from `account_type` (OPERATING vs
 *                     RESERVE) would be invention. `maturityProfile` therefore reports
 *                     DATA_NOT_AVAILABLE and this model carries no maturity field.
 *   ENCUMBRANCE     — no pledge, lien, restriction or encumbrance column exists. Critically,
 *                     `classification` is the ABAC SECURITY classification (PUBLIC..
 *                     HIGHLY_RESTRICTED) used by can() for clearance checks — it is NOT a
 *                     restricted-cash marker. Treating "RESTRICTED" as restricted cash would
 *                     silently reclassify 9.98bn TZS of operating money as unavailable. This
 *                     module explicitly refuses that reading.
 *   AVAILABLE CASH  — follows from the above: with no encumbrance data, available-vs-restricted
 *                     cannot be split. Reporting "all cash is available" would be a fabrication.
 *   HISTORY         — every row shares as_of 2025-12-31. There is exactly one snapshot, so trend,
 *                     movement and historical comparison are DATA_NOT_AVAILABLE.
 *   FUNDING GAP     — requires committed outflows with dates, which treasury does not hold.
 *   FX RATES        — base_currency_balance was restated by a rate this system does not record.
 *                     The three TZS positions imply three DIFFERENT rates (2615.3846, 2613.8434,
 *                     2613.3333), so the data cannot even be used to reverse-engineer one. P4
 *                     remains unratified and no rate is ever applied here.
 */

/** Epistemic status of every treasury value. Extends the 7D/7E convention with the governance case. */
export const TREASURY_BASIS = [
  "OBSERVED",
  "DERIVED",
  "ASSUMED",
  "SCENARIO",
  "DATA_NOT_AVAILABLE",
  "REQUIRES_POLICY",
  "REQUIRES_AUTHORITY",
  "GOVERNANCE_REVIEW_REQUIRED",
] as const;
export type TreasuryBasis = (typeof TREASURY_BASIS)[number];

/**
 * Severity. REQUIRES_POLICY is the default and the only honest answer while no treasury limit,
 * minimum liquidity or concentration cap has been ratified.
 */
export const TREASURY_SEVERITY = ["REQUIRES_POLICY", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type TreasurySeverity = (typeof TREASURY_SEVERITY)[number];

/** A reference to a real treasury record a value was derived from. */
export type TreasurySource = {
  type: "TREASURY_POSITION" | "LEGAL_ENTITY" | "CAPITAL_REQUEST";
  id: string;
  basis: Extract<TreasuryBasis, "OBSERVED" | "DERIVED" | "SCENARIO">;
};

/**
 * A treasury limit supplied by a caller. BEYU has ratified none, so none is hard-coded. A limit
 * without provenance is refused outright — an unattributed threshold is indistinguishable from an
 * invented one.
 */
export type TreasuryThreshold = {
  code: string;
  value: number;
  unit: "PERCENT" | "MINOR_UNITS" | "RATIO";
  /** MAX = ceiling (concentration); MIN = floor (coverage). */
  direction?: "MAX" | "MIN";
  sourceReference: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
};

/**
 * A single observed position, as read. `balance` and `baseCurrencyBalance` are kept distinct
 * because only the latter is safe to aggregate across currencies, and even that carries an
 * unverified FX restatement.
 */
export type TreasuryPositionView = {
  id: string;
  tenantId: string;
  legalEntityId: string;
  institution: string;
  accountLabel: string;
  accountType: string;
  currency: string;
  balance: string;
  baseCurrencyBalance: string;
  asOf: string;
  /** ABAC security classification — NOT an encumbrance or restricted-cash marker. */
  securityClassification: string;
  basis: Extract<TreasuryBasis, "OBSERVED">;
};

/** The canonical result shape for every treasury measure. */
export type TreasuryResult = {
  code: string;
  title: string;
  basis: TreasuryBasis;
  /** Null whenever the required input is absent — never zero-as-an-answer. */
  value: string | null;
  unit: "PERCENT" | "MINOR_UNITS" | "RATIO" | "COUNT" | "NONE";
  /** The denominator behind a ratio, so any percentage can be independently rechecked. */
  denominator: string | null;
  currency: string | null;
  severity: TreasurySeverity;
  severityBasis: string;
  sources: TreasurySource[];
  calculationMethod: string;
  assumptions: string[];
  missingInputs: string[];
  policyDependencies: string[];
  authorityDependencies: string[];
  explanation: string[];
};

export type TreasuryBucket = {
  key: string;
  label: string;
  amountMinor: number;
  sharePercent: string;
  positionIds: string[];
};

/** Cash position for one currency. Cross-currency totalling is a separate, flagged decision. */
export type CurrencyCashPosition = {
  currency: string;
  /** Sum of native balances in this currency. Safe: no FX involved. */
  nativeTotal: string;
  /** Sum of the restated base amounts, carrying an FX rate this module cannot verify. */
  baseTotal: string;
  positionCount: number;
  positionIds: string[];
  basis: Extract<TreasuryBasis, "OBSERVED" | "DERIVED">;
};

export type CashPosition = {
  asOf: string;
  /** Per-currency totals. The ONLY totalling this module performs without an FX caveat. */
  byCurrency: CurrencyCashPosition[];
  /** Group total in base currency. Always carries the unverified-FX assumption. */
  baseCurrencyTotal: string | null;
  baseCurrencyTotalBasis: TreasuryBasis;
  positionCount: number;
  /**
   * Cash that is genuinely spendable. Always null: no encumbrance data exists, and the
   * `classification` column is a security marker, not a restriction.
   */
  availableCash: null;
  availableCashBasis: Extract<TreasuryBasis, "DATA_NOT_AVAILABLE">;
  explanation: string[];
};

export type MaturityProfile = {
  /** Always DATA_NOT_AVAILABLE: the schema holds no maturity, tenor or value date. */
  basis: Extract<TreasuryBasis, "DATA_NOT_AVAILABLE">;
  buckets: null;
  missingInputs: string[];
  explanation: string[];
};

/** A treasury data-quality or governance defect. Reported, never repaired. */
export type TreasuryFinding = {
  code: TreasuryFindingCode;
  severity: "INFO" | "WARNING" | "GOVERNANCE";
  subjectType: TreasurySource["type"];
  subjectId: string;
  detail: string;
  /** Always true: identifying a defect never authorises correcting it. */
  advisoryOnly: true;
};

export const TREASURY_FINDING_CODE = [
  "TENANT_ENTITY_ATTRIBUTION_MISMATCH",
  "ORPHANED_ENTITY_REFERENCE",
  "INCONSISTENT_IMPLIED_FX_RATE",
  "MISSING_INSTITUTION",
  "MISSING_CURRENCY",
  "MALFORMED_CURRENCY",
  "NEGATIVE_BALANCE",
  "ZERO_BALANCE",
  "STALE_SNAPSHOT",
  "FUTURE_DATED_POSITION",
  "DUPLICATE_POSITION",
  "SINGLE_SNAPSHOT_ONLY",
  "NO_MATURITY_DATA",
  "NO_ENCUMBRANCE_DATA",
  "BASE_RESTATEMENT_UNVERIFIABLE",
] as const;
export type TreasuryFindingCode = (typeof TREASURY_FINDING_CODE)[number];

export type TreasuryDataQuality = {
  findings: TreasuryFinding[];
  positionsAssessed: number;
  /**
   * Deliberately NOT a score out of 100. A single number would imply a ratified tolerance for
   * treasury data defects, and none exists.
   */
  score: null;
  scoreBasis: Extract<TreasuryBasis, "REQUIRES_POLICY">;
  basis: Extract<TreasuryBasis, "DERIVED" | "DATA_NOT_AVAILABLE">;
  explanation: string[];
};

export type AttributionConsistency = {
  positionId: string;
  claimedTenantId: string;
  legalEntityId: string;
  owningTenantId: string | null;
  consistent: boolean;
  /** GOVERNANCE_REVIEW_REQUIRED when claimed and owning tenant diverge. */
  basis: Extract<TreasuryBasis, "OBSERVED" | "GOVERNANCE_REVIEW_REQUIRED" | "DATA_NOT_AVAILABLE">;
  explanation: string;
};

/** A hypothetical adjustment. Applied to an in-memory copy only. */
export type TreasuryScenarioAdjustment = {
  targetPositionId: string;
  /** Multiplier on the observed base amount. 0 models total loss, 0.5 a halving. */
  factor: number;
  rationale: string;
};

export type TreasuryReport = {
  asOf: string;
  tenantId: string;
  legalEntityId: string | null;
  cash: CashPosition;
  concentration: TreasuryResult[];
  dataQuality: TreasuryDataQuality;
  attribution: AttributionConsistency[];
  maturity: MaturityProfile;
  /** Every distinct unresolved policy dependency surfaced anywhere in the report. */
  policyDependencies: string[];
  authorityDependencies: string[];
  /** Positions withheld from this caller by clearance, so a total is never silently short. */
  withheldPositionCount: number;
  explanation: string[];
};
