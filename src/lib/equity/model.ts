/**
 * BEYU OS — Founder equity / capitalization DETERMINISTIC ENGINE (pure).
 *
 * X10THINK Phase 2 (§9–§15). This module is the single computational truth for
 * vesting accrual, change-of-control acceleration, leaver outcomes, cap-table
 * aggregation and dilution scenarios. It is PURE: no database, no clock (every
 * function takes `asOf` explicitly), no randomness — the same inputs always
 * produce the same outputs, which is what makes results reconstructable,
 * testable and auditable (§61).
 *
 * ============================== LEGAL BOUNDARY (§48) ==========================
 *
 * Nothing here decides legal enforceability:
 *   - the 48-month / 12-month-cliff / monthly schedule is a DEFAULT CANDIDATE
 *     input (`DEFAULT_FOUNDER_VESTING`), never a universal legal truth;
 *   - leaver condition vocabularies are candidate lists from the program spec —
 *     a real case is classified GOOD/BAD only after legal review and governance
 *     approval, and every outcome carries `requiresLegalReview: true` until
 *     closed by a human lawyer;
 *   - forfeiture of VESTED shares is never produced by default: it requires an
 *     explicit, documented treatment input (no arbitrary forfeiture, §10).
 *
 * ============================== FINANCE BOUNDARY (§22/§29) ====================
 *
 * Amounts are computed as exact decimal strings where money appears (repurchase
 * totals); this module never posts, never prices from market data and never
 * calls the Finance posting engine. CAP_POSTING is untouched.
 */

/* ------------------------------------------------------------------ */
/* Date arithmetic (UTC, deterministic)                                 */
/* ------------------------------------------------------------------ */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(value: string, field: string): void {
  if (!DATE_RE.test(value)) {
    throw new EquityModelError("INVALID_DATE", `${field} must be a YYYY-MM-DD date, got '${value}'.`);
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new EquityModelError("INVALID_DATE", `${field} is not a real calendar date ('${value}').`);
  }
}

/** Add calendar months in UTC, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonthsUtc(isoDate: string, months: number): string {
  assertIsoDate(isoDate, "addMonthsUtc input");
  const [y, m, d] = isoDate.split("-").map(Number);
  const total = m - 1 + months;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${String(ny).padStart(4, "0")}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/**
 * Whole calendar months elapsed from `from` to `to` (UTC). A partial month does
 * not count: 2024-01-15 → 2024-02-14 is 0 months; → 2024-02-15 is 1 month.
 * Negative when `to` precedes `from`.
 */
export function monthsBetweenUtc(fromIso: string, toIso: string): number {
  assertIsoDate(fromIso, "monthsBetweenUtc from");
  assertIsoDate(toIso, "monthsBetweenUtc to");
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return months;
}

/* ------------------------------------------------------------------ */
/* Errors                                                               */
/* ------------------------------------------------------------------ */

export type EquityModelErrorCode =
  | "INVALID_DATE"
  | "INVALID_TERMS"
  | "INVALID_CONDITION"
  | "CONDITION_CASE_MISMATCH"
  | "INVALID_SCENARIO"
  | "SHARE_OVERFLOW";

export class EquityModelError extends Error {
  constructor(
    readonly code: EquityModelErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EquityModelError";
  }
}

/* ------------------------------------------------------------------ */
/* §9 — Vesting                                                         */
/* ------------------------------------------------------------------ */

export const VESTING_FREQUENCIES = ["MONTHLY", "QUARTERLY", "ANNUAL"] as const;
export type VestingFrequency = (typeof VESTING_FREQUENCIES)[number];

/**
 * The DEFAULT CONFIGURABLE CANDIDATE (§9): 48-month vesting, 12-month cliff,
 * monthly thereafter. A default INPUT — jurisdictions, founders agreements and
 * board resolutions may lawfully specify different terms, which are stored per
 * schedule and legal-review flagged. Never a hard-coded universal legal truth.
 */
export const DEFAULT_FOUNDER_VESTING = {
  vestingMonths: 48,
  cliffMonths: 12,
  frequency: "MONTHLY" as VestingFrequency,
};

export type VestingTerms = {
  totalShares: number;
  vestingMonths: number;
  cliffMonths: number;
  frequency: VestingFrequency;
  /** YYYY-MM-DD vesting commencement. */
  startDate: string;
};

export type VestingState = {
  cliffDate: string;
  endDate: string;
  monthsElapsed: number;
  /** Whole months of accrual recognized at `asOf` (cliff- and frequency-aware). */
  vestedMonths: number;
  vestedShares: number;
  unvestedShares: number;
  completed: boolean;
  nextMilestoneDate: string | null;
};

function monthsPerMilestone(frequency: VestingFrequency): number {
  switch (frequency) {
    case "MONTHLY":
      return 1;
    case "QUARTERLY":
      return 3;
    case "ANNUAL":
      return 12;
  }
}

export function assertValidVestingTerms(terms: VestingTerms): void {
  if (!Number.isInteger(terms.totalShares) || terms.totalShares < 0) {
    throw new EquityModelError("INVALID_TERMS", "totalShares must be a non-negative integer.");
  }
  if (!Number.isInteger(terms.vestingMonths) || terms.vestingMonths <= 0) {
    throw new EquityModelError("INVALID_TERMS", "vestingMonths must be a positive integer.");
  }
  if (!Number.isInteger(terms.cliffMonths) || terms.cliffMonths < 0) {
    throw new EquityModelError("INVALID_TERMS", "cliffMonths must be a non-negative integer.");
  }
  if (terms.cliffMonths > terms.vestingMonths) {
    throw new EquityModelError("INVALID_TERMS", "cliffMonths cannot exceed vestingMonths.");
  }
  if (!VESTING_FREQUENCIES.includes(terms.frequency)) {
    throw new EquityModelError("INVALID_TERMS", `frequency must be one of ${VESTING_FREQUENCIES.join(", ")}.`);
  }
  assertIsoDate(terms.startDate, "startDate");
}

/**
 * Deterministic vesting accrual at a given date.
 *
 * Model (the standard cumulative-proportional schedule):
 *   - before the cliff: nothing vests;
 *   - at the cliff: the cumulative accrual up to the cliff vests
 *     (cliffMonths / vestingMonths of the total);
 *   - thereafter: accrual advances in whole `frequency` milestones;
 *   - at/after endDate: fully vested (no rounding residue — the final state is
 *     exact, so Σ milestone deltas always equals totalShares).
 *
 * Share counts floor at each intermediate milestone; the completion case is
 * exact. This keeps every milestone delta a non-negative integer and the ledger
 * sum reconcilable to the schedule total.
 */
export function computeVesting(terms: VestingTerms, asOf: string): VestingState {
  assertValidVestingTerms(terms);
  assertIsoDate(asOf, "asOf");

  const cliffDate = addMonthsUtc(terms.startDate, terms.cliffMonths);
  const endDate = addMonthsUtc(terms.startDate, terms.vestingMonths);
  const monthsElapsed = Math.max(0, monthsBetweenUtc(terms.startDate, asOf));
  const per = monthsPerMilestone(terms.frequency);

  let vestedMonths: number;
  if (monthsElapsed >= terms.vestingMonths) {
    vestedMonths = terms.vestingMonths;
  } else if (monthsElapsed < terms.cliffMonths) {
    vestedMonths = 0;
  } else {
    vestedMonths =
      terms.cliffMonths + Math.floor((monthsElapsed - terms.cliffMonths) / per) * per;
    vestedMonths = Math.min(vestedMonths, terms.vestingMonths);
  }

  const completed = vestedMonths >= terms.vestingMonths;
  const vestedShares = completed
    ? terms.totalShares
    : Math.floor((terms.totalShares * vestedMonths) / terms.vestingMonths);
  const unvestedShares = terms.totalShares - vestedShares;

  let nextMilestoneDate: string | null = null;
  if (!completed) {
    nextMilestoneDate =
      monthsElapsed < terms.cliffMonths
        ? cliffDate
        : addMonthsUtc(terms.startDate, vestedMonths + per);
    if (nextMilestoneDate > endDate) nextMilestoneDate = endDate;
  }

  return {
    cliffDate,
    endDate,
    monthsElapsed,
    vestedMonths,
    vestedShares,
    unvestedShares,
    completed,
    nextMilestoneDate,
  };
}

/**
 * The milestone dates a schedule will produce from `fromDate` to `toDate`
 * (inclusive of `toDate`), used by the governed runner to append one ledger
 * event per milestone — never a lump. Deterministic and idempotent: running to
 * the same date twice yields no new milestones.
 */
export function vestingMilestones(terms: VestingTerms, fromDate: string, toDate: string): Array<{ date: string; vestedShares: number; cumulativeVestedShares: number }> {
  assertValidVestingTerms(terms);
  assertIsoDate(fromDate, "fromDate");
  assertIsoDate(toDate, "toDate");
  if (toDate < fromDate) {
    throw new EquityModelError("INVALID_TERMS", "toDate cannot precede fromDate.");
  }
  const per = monthsPerMilestone(terms.frequency);
  const out: Array<{ date: string; vestedShares: number; cumulativeVestedShares: number }> = [];
  let prevCumulative = computeVesting(terms, fromDate).vestedShares;
  const boundaryMonths: number[] = [];
  if (terms.cliffMonths > 0) boundaryMonths.push(terms.cliffMonths);
  for (let m = terms.cliffMonths + per; m < terms.vestingMonths; m += per) boundaryMonths.push(m);
  boundaryMonths.push(terms.vestingMonths);
  for (const m of boundaryMonths) {
    const date = addMonthsUtc(terms.startDate, m);
    if (date <= fromDate || date > toDate) continue;
    const cumulative = computeVesting(terms, date).vestedShares;
    const delta = cumulative - prevCumulative;
    prevCumulative = cumulative;
    if (delta > 0) out.push({ date, vestedShares: delta, cumulativeVestedShares: cumulative });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* §12 — Change-of-control acceleration                                 */
/* ------------------------------------------------------------------ */

export const ACCELERATION_POLICIES = [
  "NONE",
  "SINGLE_TRIGGER",
  "DOUBLE_TRIGGER",
  "PARTIAL_DOUBLE_TRIGGER",
] as const;
export type AccelerationPolicy = (typeof ACCELERATION_POLICIES)[number];

/**
 * Default policy candidate (§12): DOUBLE TRIGGER — acceleration requires BOTH a
 * declared Change of Control AND a Qualifying Termination. A default, not law.
 */
export const DEFAULT_ACCELERATION_POLICY: AccelerationPolicy = "DOUBLE_TRIGGER";

export type AccelerationInput = {
  policy: AccelerationPolicy;
  /** Acceleration percentage in millionths (1_000_000 = 100%). Required for PARTIAL. */
  pctMillionths?: number | null;
  unvestedShares: number;
  changeOfControlDeclared: boolean;
  qualifyingTermination: boolean;
};

export type AccelerationOutcome = {
  acceleratedShares: number;
  remainingUnvestedShares: number;
  triggersSatisfied: boolean;
  reason: string;
};

/**
 * Acceleration is COMPUTED here and only APPLIED by the governed service with
 * authority, approval, legal-review state, evidence and audit (§12). This
 * function never touches a database and never authorizes anything.
 */
export function computeAcceleration(input: AccelerationInput): AccelerationOutcome {
  if (!ACCELERATION_POLICIES.includes(input.policy)) {
    throw new EquityModelError("INVALID_TERMS", `Unknown acceleration policy '${input.policy}'.`);
  }
  if (!Number.isInteger(input.unvestedShares) || input.unvestedShares < 0) {
    throw new EquityModelError("INVALID_TERMS", "unvestedShares must be a non-negative integer.");
  }
  const none = {
    acceleratedShares: 0,
    remainingUnvestedShares: input.unvestedShares,
    triggersSatisfied: false,
  };

  if (input.policy === "NONE") {
    return { ...none, reason: "Acceleration policy is NONE." };
  }

  const single = input.policy === "SINGLE_TRIGGER";
  const triggersSatisfied = single
    ? input.changeOfControlDeclared
    : input.changeOfControlDeclared && input.qualifyingTermination;

  if (!triggersSatisfied) {
    return {
      ...none,
      reason: single
        ? "SINGLE_TRIGGER requires a declared Change of Control."
        : `${input.policy} requires BOTH a declared Change of Control AND a Qualifying Termination (double trigger).`,
    };
  }

  let pct = 1_000_000;
  if (input.policy === "PARTIAL_DOUBLE_TRIGGER") {
    if (!Number.isInteger(input.pctMillionths) || (input.pctMillionths as number) <= 0 || (input.pctMillionths as number) > 1_000_000) {
      throw new EquityModelError(
        "INVALID_TERMS",
        "PARTIAL_DOUBLE_TRIGGER requires pctMillionths in (0, 1000000].",
      );
    }
    pct = input.pctMillionths as number;
  }

  const acceleratedShares =
    pct >= 1_000_000
      ? input.unvestedShares
      : Math.floor((input.unvestedShares * pct) / 1_000_000);
  return {
    acceleratedShares,
    remainingUnvestedShares: input.unvestedShares - acceleratedShares,
    triggersSatisfied: true,
    reason: `${input.policy} triggers satisfied; ${pct / 10_000}% of unvested shares accelerated.`,
  };
}

/* ------------------------------------------------------------------ */
/* §10 — Good / bad leaver outcomes                                     */
/* ------------------------------------------------------------------ */

/**
 * GOOD LEAVER candidate conditions (§10). Candidate vocabulary — the definitive
 * list for a given company lives in its founders/shareholders agreement, is
 * document-linked and jurisdiction-aware.
 */
export const GOOD_LEAVER_CONDITIONS = [
  "DEATH",
  "DISABILITY",
  "RETIREMENT",
  "MUTUAL_AGREEMENT",
  "TERMINATION_WITHOUT_CAUSE",
  "OTHER_APPROVED",
] as const;

/**
 * BAD LEAVER candidate conditions (§10) — deliberately NARROW. An arbitrary or
 * open-ended bad-leaver classification is refused: forfeiture must never be
 * created by software discretion.
 */
export const BAD_LEAVER_CONDITIONS = [
  "FRAUD",
  "THEFT",
  "INTENTIONAL_MATERIAL_BREACH",
  "SERIOUS_MISCONDUCT",
  "IP_MISAPPROPRIATION",
  "CONFIDENTIALITY_BREACH",
  "ENFORCEABLE_COMPETITIVE_MISCONDUCT",
] as const;

export type LeaverCaseType = "GOOD_LEAVER" | "BAD_LEAVER";
export type LeaverCondition =
  | (typeof GOOD_LEAVER_CONDITIONS)[number]
  | (typeof BAD_LEAVER_CONDITIONS)[number];

export const VESTED_TREATMENTS = [
  "RETAIN",
  "REPURCHASE_AT_FMV",
  "REPURCHASE_AT_COST",
  "REPURCHASE_AT_LOWER_OF_COST_AND_FMV",
] as const;
export type VestedTreatment = (typeof VESTED_TREATMENTS)[number];

export const UNVESTED_TREATMENTS = ["FORFEIT", "VEST_ACCELERATED", "RETAIN_UNVESTED"] as const;
export type UnvestedTreatment = (typeof UNVESTED_TREATMENTS)[number];

export type LeaverPolicy = {
  vested: VestedTreatment;
  unvested: UnvestedTreatment;
};

/**
 * Default treatment candidates (§10). Good leaver: vested retained, unvested
 * forfeited (cancelled). Bad leaver: vested repurchased at the LOWER of cost
 * and FMV *only where the governing documents provide for it*, unvested
 * forfeited. These are DEFAULTS supplied to `computeLeaverOutcome`; the
 * effective treatment for a real case is the document-linked, legally reviewed
 * one recorded on the case.
 */
export const DEFAULT_GOOD_LEAVER_POLICY: LeaverPolicy = {
  vested: "RETAIN",
  unvested: "FORFEIT",
};
export const DEFAULT_BAD_LEAVER_POLICY: LeaverPolicy = {
  vested: "REPURCHASE_AT_LOWER_OF_COST_AND_FMV",
  unvested: "FORFEIT",
};

export type LeaverOutcomeInput = {
  caseType: LeaverCaseType;
  conditionCode: string;
  vestedShares: number;
  unvestedShares: number;
  policy?: LeaverPolicy | null;
  /** Price inputs in minor-unit-safe decimal strings; required by repurchase treatments. */
  costPricePerShare?: string | null;
  fmvPricePerShare?: string | null;
};

export type LeaverOutcome = {
  caseType: LeaverCaseType;
  conditionCode: string;
  policy: LeaverPolicy;
  retainedShares: number;
  repurchaseShares: number;
  forfeitedShares: number;
  /** Decimal string, or null when nothing is repurchased / prices not provided. */
  repurchaseTotal: string | null;
  repurchasePricePerShare: string | null;
  /** Always true until a human lawyer closes legal review (§48). */
  requiresLegalReview: true;
  notes: string[];
};

export function isGoodLeaverCondition(code: string): boolean {
  return (GOOD_LEAVER_CONDITIONS as readonly string[]).includes(code);
}
export function isBadLeaverCondition(code: string): boolean {
  return (BAD_LEAVER_CONDITIONS as readonly string[]).includes(code);
}

/**
 * Exact decimal helpers — money is never float.
 *
 * Implementation note: the repository targets ES2017, so BigInt literals are
 * unavailable. These helpers use 6-decimal fixed-point INTEGER arithmetic on
 * `number` with explicit safe-integer guards: any product that would leave the
 * exactly-representable range throws SHARE_OVERFLOW rather than silently
 * rounding — fail closed, deterministic, and exact for every realistic
 * price × share-count combination (price ≤ 1e12, shares ≤ 1e9 at 6 decimals).
 */
const FIXED_SCALE = 1_000_000; // 6 decimals — matches numeric(18,6) price columns.

function toFixed6(value: string, field: string): number {
  if (!/^-?\d+(\.\d+)?$/.test(value)) {
    throw new EquityModelError("INVALID_TERMS", `${field} must be a decimal string, got '${value}'.`);
  }
  const [whole, frac = ""] = value.split(".");
  const scaled = Number(whole) * FIXED_SCALE + Number((frac.padEnd(6, "0").slice(0, 6)) || "0") * (value.startsWith("-") ? -1 : 1);
  if (!Number.isSafeInteger(scaled)) {
    throw new EquityModelError("SHARE_OVERFLOW", `${field} exceeds the exact-arithmetic range.`);
  }
  return scaled;
}

function fromFixed6(scaled: number): string {
  const neg = scaled < 0;
  const abs = Math.abs(scaled);
  const whole = Math.floor(abs / FIXED_SCALE);
  const frac = (abs % FIXED_SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${frac.length > 0 ? `${whole}.${frac}` : `${whole}`}`;
}

function decimalMultiply(a: string, shares: number): string {
  const aScaled = toFixed6(a, "price");
  const product = aScaled * shares;
  if (!Number.isSafeInteger(product)) {
    throw new EquityModelError("SHARE_OVERFLOW", "price × shares exceeds the exact-arithmetic range.");
  }
  return fromFixed6(product);
}

function decimalMin(a: string, b: string): string {
  return toFixed6(a, "price a") <= toFixed6(b, "price b") ? a : b;
}

/**
 * Deterministic leaver share disposition. NEVER produces forfeiture of vested
 * shares by default and NEVER invents a condition: an unknown or mismatched
 * condition code is refused. The outcome is a PROPOSAL — applying it is a
 * governed mutation requiring legal review + governance approval.
 */
export function computeLeaverOutcome(input: LeaverOutcomeInput): LeaverOutcome {
  if (!Number.isInteger(input.vestedShares) || input.vestedShares < 0) {
    throw new EquityModelError("INVALID_TERMS", "vestedShares must be a non-negative integer.");
  }
  if (!Number.isInteger(input.unvestedShares) || input.unvestedShares < 0) {
    throw new EquityModelError("INVALID_TERMS", "unvestedShares must be a non-negative integer.");
  }
  const good = isGoodLeaverCondition(input.conditionCode);
  const bad = isBadLeaverCondition(input.conditionCode);
  if (!good && !bad) {
    throw new EquityModelError(
      "INVALID_CONDITION",
      `Condition '${input.conditionCode}' is not in the governed candidate vocabulary. Arbitrary forfeiture conditions are refused (§10).`,
    );
  }
  if (input.caseType === "GOOD_LEAVER" && !good) {
    throw new EquityModelError(
      "CONDITION_CASE_MISMATCH",
      `Condition '${input.conditionCode}' is a BAD_LEAVER candidate and cannot classify a GOOD_LEAVER case.`,
    );
  }
  if (input.caseType === "BAD_LEAVER" && !bad) {
    throw new EquityModelError(
      "CONDITION_CASE_MISMATCH",
      `Condition '${input.conditionCode}' is a GOOD_LEAVER candidate and cannot classify a BAD_LEAVER case. Bad-leaver conditions are narrowly defined (§10).`,
    );
  }

  const policy =
    input.policy ?? (input.caseType === "GOOD_LEAVER" ? DEFAULT_GOOD_LEAVER_POLICY : DEFAULT_BAD_LEAVER_POLICY);
  if (!VESTED_TREATMENTS.includes(policy.vested)) {
    throw new EquityModelError("INVALID_TERMS", `Unknown vested treatment '${policy.vested}'.`);
  }
  if (!UNVESTED_TREATMENTS.includes(policy.unvested)) {
    throw new EquityModelError("INVALID_TERMS", `Unknown unvested treatment '${policy.unvested}'.`);
  }

  const notes: string[] = [];
  let retainedShares = 0;
  let repurchaseShares = 0;
  let forfeitedShares = 0;

  switch (policy.vested) {
    case "RETAIN":
      retainedShares = input.vestedShares;
      break;
    case "REPURCHASE_AT_FMV":
    case "REPURCHASE_AT_COST":
    case "REPURCHASE_AT_LOWER_OF_COST_AND_FMV":
      repurchaseShares = input.vestedShares;
      break;
  }

  switch (policy.unvested) {
    case "FORFEIT":
      forfeitedShares = input.unvestedShares;
      notes.push("Unvested shares are forfeited (cancelled) per the recorded treatment.");
      break;
    case "VEST_ACCELERATED":
      retainedShares += input.unvestedShares;
      notes.push("Unvested shares vest (accelerate) per the recorded treatment.");
      break;
    case "RETAIN_UNVESTED":
      retainedShares += input.unvestedShares;
      notes.push("Unvested shares are retained unvested per the recorded treatment (schedule continues).");
      break;
  }

  let repurchasePricePerShare: string | null = null;
  let repurchaseTotal: string | null = null;
  if (repurchaseShares > 0) {
    if (policy.vested === "REPURCHASE_AT_FMV") {
      if (!input.fmvPricePerShare) {
        notes.push("REPURCHASE_AT_FMV requires an FMV price; total left null until valuation evidence is recorded.");
      } else {
        repurchasePricePerShare = input.fmvPricePerShare;
        repurchaseTotal = decimalMultiply(input.fmvPricePerShare, repurchaseShares);
      }
    } else if (policy.vested === "REPURCHASE_AT_COST") {
      if (!input.costPricePerShare) {
        notes.push("REPURCHASE_AT_COST requires the original issue price; total left null until recorded.");
      } else {
        repurchasePricePerShare = input.costPricePerShare;
        repurchaseTotal = decimalMultiply(input.costPricePerShare, repurchaseShares);
      }
    } else if (policy.vested === "REPURCHASE_AT_LOWER_OF_COST_AND_FMV") {
      if (!input.costPricePerShare || !input.fmvPricePerShare) {
        notes.push("LOWER_OF_COST_AND_FMV requires both prices; total left null until valuation evidence is recorded.");
      } else {
        repurchasePricePerShare = decimalMin(input.costPricePerShare, input.fmvPricePerShare);
        repurchaseTotal = decimalMultiply(repurchasePricePerShare, repurchaseShares);
      }
    }
    if (repurchaseTotal !== null) {
      notes.push("Repurchase total is a governed reference amount; payment execution remains Finance OS / treasury authority.");
    }
  }

  notes.push(
    input.caseType === "BAD_LEAVER"
      ? "BAD_LEAVER classification requires legal review and governance approval before any forfeiture or repurchase is applied (§10)."
      : "GOOD_LEAVER classification requires legal review confirmation and governance approval before execution (§10).",
  );

  return {
    caseType: input.caseType,
    conditionCode: input.conditionCode,
    policy,
    retainedShares,
    repurchaseShares,
    forfeitedShares,
    repurchaseTotal,
    repurchasePricePerShare,
    requiresLegalReview: true,
    notes,
  };
}

/* ------------------------------------------------------------------ */
/* §13 — Cap-table aggregation                                          */
/* ------------------------------------------------------------------ */

export type CapTablePositionRow = {
  positionId: string;
  holderType: string; // FOUNDER | INVESTOR | ESOP_POOL | TREASURY | EMPLOYEE | TRUST | OTHER
  holderName: string;
  shareClassId: string;
  shareClassCode: string;
  votesPerShare: string; // decimal string
  totalShares: number;
  vestedShares: number;
  unvestedShares: number;
  status: string;
};

export type CapTableGrantRow = {
  grantId: string;
  holderName: string;
  optionShares: number;
  exercisedShares: number;
  status: string;
};

export type CapTablePlanRow = {
  planId: string;
  poolSharesAuthorized: number;
  poolSharesIssued: number;
  status: string;
};

export type CapTableShareClassRow = {
  shareClassId: string;
  code: string;
  authorizedShares: number;
  issuedShares: number;
  votesPerShare: string;
};

export type CapTableComputation = {
  authorizedShares: number;
  issuedShares: number;
  outstandingShares: number;
  vestedShares: number;
  unvestedShares: number;
  esopPoolShares: number;
  esopGrantedShares: number;
  optionsOutstanding: number;
  treasuryShares: number;
  cancelledShares: number;
  fullyDilutedShares: number;
  breakdown: {
    holders: Array<{
      holderType: string;
      holderName: string;
      shareClassCode: string;
      totalShares: number;
      vestedShares: number;
      unvestedShares: number;
      votingPct: string | null;
      economicPct: string | null;
    }>;
    byHolderType: Record<string, { totalShares: number; votingPct: string | null; economicPct: string | null }>;
  };
};

const ACTIVE_POSITION_STATUSES = ["ACTIVE", "FULLY_VESTED"];
const CANCELLED_POSITION_STATUSES = ["FORFEITED", "CANCELLED", "REPURCHASED"];
const OUTSTANDING_GRANT_STATUSES = [
  "APPROVED",
  "ACTIVE",
  "PARTIALLY_EXERCISED",
];

/**
 * Percent with 6-decimal precision as a decimal string. Deterministic: pure
 * IEEE-754 division rounded once at the 6th decimal — the same inputs always
 * produce the identical string (no float accumulation: one division, one round).
 */
function pctOf(part: number, whole: number): string | null {
  if (whole <= 0) return null;
  const pct = (part / whole) * 100;
  const fixed = pct.toFixed(6);
  const [q, fracRaw] = fixed.split(".");
  const frac = (fracRaw ?? "").replace(/0+$/, "");
  return frac.length > 0 ? `${q}.${frac}` : q;
}

/**
 * Votes for a position: shares × votesPerShare, computed in 4-decimal
 * fixed-point integers (votes_per_share is numeric(9,4)) then truncated to
 * whole votes — deterministic and exact within safe-integer range.
 */
function votesOf(row: { totalShares: number; votesPerShare: string }): number {
  const [w, f = ""] = row.votesPerShare.split(".");
  const perShareScaled = Number(w) * 10_000 + Number((f.padEnd(4, "0").slice(0, 4)) || "0");
  const product = perShareScaled * row.totalShares;
  if (!Number.isSafeInteger(product)) {
    throw new EquityModelError("SHARE_OVERFLOW", "votes computation exceeds the exact-arithmetic range.");
  }
  return Math.floor(product / 10_000);
}

/**
 * Financing-grade cap-table computation (§13). Outstanding = issued positions
 * that are ACTIVE/FULLY_VESTED (founders, investors, employees, trust); the
 * ESOP pool position counts toward poolShares, treasury toward treasuryShares,
 * cancelled/forfeited/repurchased toward cancelledShares. Fully diluted adds
 * unexercised outstanding grants and the unallocated authorized pool.
 */
export function computeCapTable(input: {
  shareClasses: CapTableShareClassRow[];
  positions: CapTablePositionRow[];
  plans: CapTablePlanRow[];
  grants: CapTableGrantRow[];
  /**
   * Cumulative shares cancelled through executed leaver forfeitures, taken from
   * the leaver/vesting ledgers. Closed positions are zeroed on execution, so
   * this ledger sum — not the position rows — is the reconstruction source for
   * cancelled shares (§13: reconstructable).
   */
  ledgerCancelledShares?: number;
}): CapTableComputation {
  const authorizedShares = input.shareClasses.reduce((s, c) => s + c.authorizedShares, 0);

  let outstandingShares = 0;
  let vestedShares = 0;
  let unvestedShares = 0;
  let esopPoolShares = 0;
  let treasuryShares = 0;
  let cancelledShares = 0;
  let totalVotes = 0;

  const holders: CapTableComputation["breakdown"]["holders"] = [];
  const byType: Record<string, { shares: number; votes: number }> = {};

  for (const p of input.positions) {
    if (CANCELLED_POSITION_STATUSES.includes(p.status)) {
      cancelledShares += p.totalShares;
      continue;
    }
    if (p.holderType === "TREASURY") {
      treasuryShares += p.totalShares;
      continue;
    }
    if (p.holderType === "ESOP_POOL") {
      esopPoolShares += p.totalShares;
      continue;
    }
    if (!ACTIVE_POSITION_STATUSES.includes(p.status)) continue;

    outstandingShares += p.totalShares;
    vestedShares += p.vestedShares;
    unvestedShares += p.unvestedShares;
    const votes = votesOf(p);
    totalVotes += votes;
    holders.push({
      holderType: p.holderType,
      holderName: p.holderName,
      shareClassCode: p.shareClassCode,
      totalShares: p.totalShares,
      vestedShares: p.vestedShares,
      unvestedShares: p.unvestedShares,
      votingPct: null, // filled after totalVotes known
      economicPct: null,
    });
    const t = (byType[p.holderType] ??= { shares: 0, votes: 0 });
    t.shares += p.totalShares;
    t.votes += votes;
  }

  // Voting percentages (votes-weighted) and economic percentages (share-weighted).
  let holderIdx = 0;
  for (const p of input.positions) {
    if (CANCELLED_POSITION_STATUSES.includes(p.status)) continue;
    if (["TREASURY", "ESOP_POOL"].includes(p.holderType)) continue;
    if (!ACTIVE_POSITION_STATUSES.includes(p.status)) continue;
    const votes = votesOf(p);
    const h = holders[holderIdx++];
    h.votingPct = totalVotes > 0 ? pctOf(votes, totalVotes) : null;
    h.economicPct = pctOf(p.totalShares, outstandingShares);
  }

  const byHolderType: CapTableComputation["breakdown"]["byHolderType"] = {};
  for (const [type, t] of Object.entries(byType)) {
    byHolderType[type] = {
      totalShares: t.shares,
      votingPct: totalVotes > 0 ? pctOf(t.votes, totalVotes) : null,
      economicPct: pctOf(t.shares, outstandingShares),
    };
  }

  let esopGrantedShares = 0;
  let optionsOutstanding = 0;
  for (const g of input.grants) {
    if (CANCELLED_POSITION_STATUSES.includes(g.status) || g.status === "EXPIRED" || g.status === "TERMINATED") {
      continue;
    }
    const unexercised = g.optionShares - g.exercisedShares;
    if (g.status === "EXERCISED") continue;
    esopGrantedShares += g.optionShares;
    if (OUTSTANDING_GRANT_STATUSES.includes(g.status) || g.status === "PROPOSED") {
      optionsOutstanding += unexercised;
    }
  }

  const activePlans = input.plans.filter((p) => ["APPROVED", "ACTIVE"].includes(p.status));
  const poolAuthorized = activePlans.reduce((s, p) => s + p.poolSharesAuthorized, 0);
  const poolIssued = activePlans.reduce((s, p) => s + p.poolSharesIssued, 0);
  const poolUnallocated = Math.max(0, poolAuthorized - poolIssued);
  // The pool POSITION (reserved shares issued to the pool) counts once; the
  // unallocated authorized reserve adds to fully diluted only if no pool
  // position was issued for it.
  const esopPoolForDilution = Math.max(esopPoolShares, poolIssued);

  const issuedShares = input.shareClasses.reduce((s, c) => s + c.issuedShares, 0);
  const fullyDilutedShares =
    outstandingShares + treasuryShares * 0 + esopPoolForDilution + optionsOutstanding + poolUnallocated;

  return {
    authorizedShares,
    issuedShares,
    outstandingShares,
    vestedShares,
    unvestedShares,
    esopPoolShares: esopPoolForDilution,
    esopGrantedShares,
    optionsOutstanding,
    treasuryShares,
    cancelledShares: cancelledShares + (input.ledgerCancelledShares ?? 0),
    fullyDilutedShares,
    breakdown: { holders, byHolderType },
  };
}


/* ------------------------------------------------------------------ */
/* §14 — Dilution engine                                                */
/* ------------------------------------------------------------------ */

export const DILUTION_SCENARIO_TYPES = [
  "NEW_FINANCING",
  "ESOP_EXPANSION",
  "FOUNDER_ISSUANCE",
  "INVESTOR_ISSUANCE",
  "CONVERSION",
  "OPTION_EXERCISE",
  "ACQUISITION",
  "SECONDARY_TRANSFER",
  "RECAPITALIZATION",
] as const;
export type DilutionScenarioType = (typeof DILUTION_SCENARIO_TYPES)[number];

export type DilutionHolding = {
  /** Stable holder key (party id, pool id, …). */
  holder: string;
  group: string; // FOUNDER | INVESTOR | ESOP_POOL | EMPLOYEE | TREASURY | OTHER
  shares: number;
};

export type DilutionTransaction =
  | { type: "NEW_ISSUANCE"; toHolder: string; toGroup: string; shares: number }
  | { type: "ESOP_POOL_EXPANSION"; shares: number }
  | { type: "OPTION_EXERCISE"; holder: string; group: string; shares: number }
  | { type: "CONVERSION"; toHolder: string; toGroup: string; shares: number }
  | { type: "SECONDARY_TRANSFER"; fromHolder: string; toHolder: string; group: string; shares: number };

export type DilutionResult = {
  pre: { holdings: DilutionHolding[]; optionsOutstanding: number; poolUnallocated: number; fullyDilutedShares: number };
  post: { holdings: DilutionHolding[]; optionsOutstanding: number; poolUnallocated: number; fullyDilutedShares: number };
  deltas: Array<{ holder: string; group: string; prePct: string | null; postPct: string | null; dilutionPctPoints: string | null }>;
};

/**
 * Pre → transaction → post dilution computation (§14). Pure analysis: it never
 * alters a position, a schedule, a snapshot or any historical actual. Executing
 * a scenario is a separate governed mutation with its own authority.
 */
export function computeDilution(input: {
  holdings: DilutionHolding[];
  optionsOutstanding: number;
  poolUnallocated: number;
  transactions: DilutionTransaction[];
}): DilutionResult {
  const holdings = new Map<string, DilutionHolding>();
  for (const h of input.holdings) {
    if (!Number.isInteger(h.shares) || h.shares < 0) {
      throw new EquityModelError("INVALID_SCENARIO", `Holding '${h.holder}' has an invalid share count.`);
    }
    holdings.set(h.holder, { ...h });
  }
  let optionsOutstanding = input.optionsOutstanding;
  let poolUnallocated = input.poolUnallocated;

  const fullyDiluted = (): number =>
    [...holdings.values()].reduce((s, h) => s + h.shares, 0) + optionsOutstanding + poolUnallocated;

  const preFd = fullyDiluted();
  const preHoldings = [...holdings.values()].map((h) => ({ ...h }));

  for (const txn of input.transactions) {
    const bump = (holder: string, group: string, delta: number) => {
      const existing = holdings.get(holder);
      if (existing) {
        const next = existing.shares + delta;
        if (next < 0) {
          throw new EquityModelError("INVALID_SCENARIO", `Transaction would drive holder '${holder}' negative.`);
        }
        existing.shares = next;
      } else if (delta > 0) {
        holdings.set(holder, { holder, group, shares: delta });
      } else {
        throw new EquityModelError("INVALID_SCENARIO", `Holder '${holder}' does not exist in the pre-transaction cap table.`);
      }
    };
    switch (txn.type) {
      case "NEW_ISSUANCE":
      case "CONVERSION":
        if (!Number.isInteger(txn.shares) || txn.shares <= 0) {
          throw new EquityModelError("INVALID_SCENARIO", `${txn.type} requires a positive integer share count.`);
        }
        bump(txn.toHolder, txn.toGroup, txn.shares);
        break;
      case "ESOP_POOL_EXPANSION":
        if (!Number.isInteger(txn.shares) || txn.shares <= 0) {
          throw new EquityModelError("INVALID_SCENARIO", "ESOP_POOL_EXPANSION requires a positive integer share count.");
        }
        poolUnallocated += txn.shares;
        break;
      case "OPTION_EXERCISE": {
        if (!Number.isInteger(txn.shares) || txn.shares <= 0) {
          throw new EquityModelError("INVALID_SCENARIO", "OPTION_EXERCISE requires a positive integer share count.");
        }
        if (txn.shares > optionsOutstanding) {
          throw new EquityModelError("INVALID_SCENARIO", "OPTION_EXERCISE exceeds outstanding options.");
        }
        optionsOutstanding -= txn.shares;
        bump(txn.holder, txn.group, txn.shares);
        break;
      }
      case "SECONDARY_TRANSFER": {
        if (!Number.isInteger(txn.shares) || txn.shares <= 0) {
          throw new EquityModelError("INVALID_SCENARIO", "SECONDARY_TRANSFER requires a positive integer share count.");
        }
        // Fully diluted total is unchanged: shares move between holders.
        bump(txn.fromHolder, txn.group, -txn.shares);
        bump(txn.toHolder, txn.group, txn.shares);
        break;
      }
    }
  }

  const postFd = fullyDiluted();
  const postHoldings = [...holdings.values()].map((h) => ({ ...h }));

  const deltas = postHoldings.map((h) => {
    const pre = preHoldings.find((p) => p.holder === h.holder)?.shares ?? 0;
    const prePct = pctOf(pre, preFd);
    const postPct = pctOf(h.shares, postFd);
    return {
      holder: h.holder,
      group: h.group,
      prePct,
      postPct,
      dilutionPctPoints: prePct !== null && postPct !== null ? decimalSubtract(postPct, prePct) : null,
    };
  });

  return {
    pre: { holdings: preHoldings, optionsOutstanding: input.optionsOutstanding, poolUnallocated: input.poolUnallocated, fullyDilutedShares: preFd },
    post: { holdings: postHoldings, optionsOutstanding, poolUnallocated, fullyDilutedShares: postFd },
    deltas,
  };
}

function decimalSubtract(a: string, b: string): string {
  return fromFixed6(toFixed6(a, "a") - toFixed6(b, "b"));
}
