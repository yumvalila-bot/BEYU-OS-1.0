/**
 * MULTI_COMPANY_MANAGEMENT — the consolidation arithmetic, as a pure function.
 *
 * WHY THIS IS SEPARATED FROM `consolidation.ts`
 * ---------------------------------------------------------------------
 * BEYU OS guarantees a ledger it cannot rewrite: `journal_entries` and
 * `journal_lines` carry `BEFORE UPDATE OR DELETE` triggers that refuse mutation,
 * and the suites around that control state the rule plainly — a test must never
 * commit financial data, because it would be permanent and the "the ledger is empty
 * while CAP_POSTING is LOCKED" invariant several finance suites assert would be
 * destroyed by any fixture that inserted a row.
 *
 * That leaves a consolidation engine with no way to be handed real balances in a
 * test. So the arithmetic lives HERE, in a function that takes ledger totals as
 * arguments and returns figures, exclusions and proposals — every rule below is
 * exercised in `tests/mcm/consolidation-core.test.ts` without a database. The
 * adapter in `consolidation.ts` owns permissions, reads, and the governed write, and
 * contains no arithmetic at all.
 *
 * THE RULES, AND WHY EACH ONE REFUSES INSTEAD OF GUESSING
 * ---------------------------------------------------------------------
 *   * Money is exact integer minor units. Ledger cells are `numeric(18,2)` MAJOR
 *     units; intercompany amounts are `numeric(38,0)` MINOR units. A value carrying
 *     precision finer than the currency's smallest unit is REFUSED, not rounded:
 *     `journal_lines` can store `1000.50` for TZS, whose exponent is 0, and deciding
 *     to round a fraction of a unit that does not exist is a decision about money.
 *   * Translation between currencies with different exponents rescales by
 *     `10^(exponent_to − exponent_from)`. Forgetting it is a silent 100× error that
 *     survives every integer check — TZS (0 decimals) into USD (2) is not the same
 *     multiplication as USD into USD.
 *   * A rate comes only from `RateLookup`, which the adapter backs with the FX rail.
 *     There is no default rate, no derived rate, and no caller-supplied number:
 *     when the lookup refuses, the member is EXCLUDED with the rail's reason.
 *   * Income and expense use the AVERAGE rate and balance-sheet items the CLOSING
 *     rate — the difference is what a cumulative translation reserve IS. Where no
 *     average rate exists, income is translated at closing and the member is marked
 *     `ESTIMATED` with that named: with one rate the reserve is zero by construction,
 *     and calling that a translation reserve would be a fabrication.
 *   * A member with no trial balance is EXCLUDED, never consolidated as nil. Zeros
 *     are a claim about the company; "nothing recorded" is the truth.
 *   * Group share comes from ownership records only. Conflicting percentages for the
 *     same owner are REFUSED rather than averaged or capped, because precedence
 *     between registry rows is not ratified anywhere.
 *   * Eliminations are PROPOSALS for transactions both sides have already
 *     authorized, and are skipped with a stated reason when the two sides still
 *     disagree by a reconciliation difference.
 */
import { currencyExponent, isSupportedCurrency } from "@/lib/payments/money";

/* ------------------------------------------------------------------ */
/* Exact integer money primitives                                      */
/* ------------------------------------------------------------------ */

/** 12dp, matching `fx_rates.rate numeric(24,12)` and `consolidation_entities.closing_rate`. */
export const RATE_SCALE = BigInt("1000000000000");
/** 6dp, matching `ownership_records.economic_pct numeric(9,6)`. */
export const PCT_SCALE = BigInt("1000000");

/** An input this module will not turn into a number by guessing. */
export class ConsolidationAmountError extends Error {}

/** Divide, rounding halves away from zero, on signed values. */
export function roundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  if (denominator === BigInt(0)) throw new ConsolidationAmountError("division by zero");
  const negative = numerator < BigInt(0) !== denominator < BigInt(0);
  const magnitude = (numerator < BigInt(0) ? -numerator : numerator) + denominator / BigInt(2);
  const quotient = magnitude / denominator;
  return negative ? -quotient : quotient;
}

/** `10^n` as an exact BigInt, built from a string: no float, no exponent operator. */
function pow10(n: number): bigint {
  if (!Number.isInteger(n) || n < 0 || n > 18) throw new ConsolidationAmountError(`unsupported power of ten: ${n}`);
  return BigInt(n === 0 ? "1" : `1${"0".repeat(n)}`);
}

/**
 * A ledger total as a plain decimal, expressed in MINOR units of `currency`.
 *
 * `numeric(18,2)` prints trailing zeros, so `"1000.00"` in a 0-decimal currency is a
 * whole amount rather than a sub-minor one — the zeros are stripped before the
 * exponent is compared, which is why this is not simply "reject any fraction".
 */
export function minorFromMajorUnits(text: string, currency: string): bigint {
  const value = (text ?? "0").trim();
  if (!/^-?\d+(\.\d+)?$/.test(value)) throw new ConsolidationAmountError(`'${text}' is not a plain decimal amount`);
  const negative = value.startsWith("-");
  const [wholeRaw, fractionRaw = ""] = value.replace(/^-/, "").split(".");
  const fraction = fractionRaw.replace(/0+$/, "");
  if (!isSupportedCurrency(currency)) {
    throw new ConsolidationAmountError(`${currency} has no registered minor-unit exponent, so its amounts cannot be integer minor units`);
  }
  const exponent = BigInt(currencyExponent(currency));
  if (BigInt(fraction.length) > exponent) {
    throw new ConsolidationAmountError(
      `${wholeRaw}.${fractionRaw} in ${currency} carries ${fraction.length} digit(s) below the currency's smallest unit (${exponent} decimal places); refusing to round it`,
    );
  }
  const minor = BigInt(wholeRaw + fraction.padEnd(Number(exponent), "0"));
  return negative ? -minor : minor;
}

/** An already-minor amount (`numeric(38,0)`), parsed with no scaling at all. */
export function minorFromMinorUnits(text: string): bigint {
  const value = (text ?? "0").trim();
  if (!/^-?\d+$/.test(value)) throw new ConsolidationAmountError(`'${text}' is not an integer minor-unit amount`);
  return BigInt(value);
}

/** `"2613.333333"` → the rate scaled by 10^12, exact, never a float. */
export function scaleRate(rate: string): bigint {
  const value = rate.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) throw new ConsolidationAmountError(`'${rate}' is not a plain decimal rate`);
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > 12) {
    throw new ConsolidationAmountError(`rate ${rate} is finer than the 12 decimal places a rate column can hold`);
  }
  return BigInt(whole + fraction.padEnd(12, "0").slice(0, 12));
}

/**
 * `minor × rate`, rescaled between currencies whose exponents differ, rounded once.
 *
 * The rescale is the step a naive implementation omits: minor units of TZS
 * (exponent 0) into minor units of USD (exponent 2) is `× rate × 100`; the reverse
 * divides. Because both inputs and the output are integers, no downstream check
 * notices a missing factor of 100 — which is why it is a named function with a test
 * rather than an inline multiply.
 */
export function convertMinor(minor: bigint, rateScaled: bigint, fromCurrency: string, toCurrency: string): bigint {
  const delta = currencyExponent(toCurrency) - currencyExponent(fromCurrency);
  const factor = pow10(Math.abs(delta));
  if (delta >= 0) return roundHalfAwayFromZero(minor * rateScaled * factor, RATE_SCALE);
  return roundHalfAwayFromZero(minor * rateScaled, RATE_SCALE * factor);
}

/**
 * The part of `minor` the group does NOT hold, given a percentage as a decimal string.
 *
 * Computed as `minor − round(minor × pct)` rather than `minor × (100 − pct)/100` so
 * the two shares always add back to the original figure: rounding each side
 * independently is how a group ends up one minor unit short of its own total.
 */
export function complementShare(minor: bigint, pct: string): bigint {
  const [whole, fraction = ""] = pct.trim().split(".");
  if (!/^\d+$/.test(whole)) throw new ConsolidationAmountError(`'${pct}' is not a percentage`);
  if (fraction.replace(/0+$/, "").length > 6) {
    throw new ConsolidationAmountError(`ownership percentage ${pct} is finer than the 6 decimal places the registry holds`);
  }
  const scaled = BigInt(whole + fraction.padEnd(6, "0").slice(0, 6));
  if (scaled > PCT_SCALE * BigInt(100)) throw new ConsolidationAmountError(`ownership percentage ${pct} exceeds 100%`);
  // `scaled` carries six decimal places, so `minor × scaled` is the percentage
  // multiplied by 100 too many: the denominator is 100 × the percentage scale. A
  // 100× error here would hand a 70%-held subsidiary a 7,000%-large non-controlling
  // interest and still return a perfectly shaped integer.
  const groupShare = roundHalfAwayFromZero(minor * scaled, PCT_SCALE * BigInt(100));
  return minor - groupShare;
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export type RateKind = "CLOSING" | "AVERAGE";

export type RateResolution =
  | { ok: true; rate: string; rowIds: string[] }
  | { ok: false; decision: string; reason: string };

/**
 * The FX authority, injected.
 *
 * The core never reads a table and never accepts a rate from a caller: whatever
 * "governed" means is decided by the adapter's implementation (in
 * `consolidation.ts`, `fx_rates` rows handed to `resolveRate`). Same-currency
 * identity is the one case the core resolves itself, because it is a property of
 * currency rather than a rate anyone must ratify.
 */
export type RateLookup = (input: { from: string; to: string; kind: RateKind }) => Promise<RateResolution>;

export type AccountTotals = {
  readonly ASSET: string;
  readonly LIABILITY: string;
  readonly EQUITY: string;
  readonly REVENUE: string;
  readonly EXPENSE: string;
};

export type MemberInput = {
  id: string;
  code: string;
  functionalCurrency: string;
  /** True when no parent entity is inside this run's scope, i.e. the run's root. */
  isRootInScope: boolean;
  /**
   * Trial balance per ENTRY currency, as ledger decimal strings in MAJOR units.
   * An entity posting in a currency other than its own functional currency has
   * several buckets, and each must be restated before it can be translated.
   */
  balancesByCurrency: ReadonlyArray<{ currency: string; accounts: AccountTotals }>;
  /**
   * In-scope ownership records effective at period end. Already filtered by the
   * adapter: the core does not know what a date means.
   */
  ownership: ReadonlyArray<{ id: string; ownerEntityId: string; pct: string; ownershipType: string }>;
  /** Present when the member has a parent in scope and the registry names no group owner. */
  ownershipEvidenceMissing: boolean;
};

export type IntercompanyInput = {
  id: string;
  reference: string;
  currency: string;
  /** Exact minor units of `currency`, as the column stores them. */
  amountMinor: string;
  /** Only a transaction authorized by BOTH sides is a fact both companies accept. */
  bothSidesAuthorized: boolean;
  state: string;
  receivableEntityId: string;
  payableEntityId: string;
  reconciliationDifferenceMinor: string | null;
};

export type ConsolidationCoreInput = {
  periodCode: string;
  asOf: string;
  reportingCurrency: string;
  members: ReadonlyArray<MemberInput>;
  intercompany: ReadonlyArray<IntercompanyInput>;
  rates: RateLookup;
};

/* ------------------------------------------------------------------ */
/* Outputs                                                             */
/* ------------------------------------------------------------------ */

export type EntityDataState = "ACTUAL" | "ESTIMATED" | "UNAVAILABLE";

export type EntityResult = {
  legalEntityId: string;
  entityCode: string;
  included: boolean;
  dataState: EntityDataState;
  /** Why a figure is absent — the column `consolidation_entities` requires with UNAVAILABLE. */
  unavailabilityReason: string | null;
  functionalCurrency: string;
  localCurrency: string;
  localAssetsMinor: string | null;
  localLiabilitiesMinor: string | null;
  localEquityMinor: string | null;
  translatedAssetsMinor: string | null;
  translatedLiabilitiesMinor: string | null;
  translatedEquityMinor: string | null;
  translationReserveMinor: string | null;
  ownershipPct: string | null;
  closingRate: string | null;
  averageRate: string | null;
  /** Provenance of the ownership and rate rows behind this member's figures. */
  sourceRefs: string[];
};

export type AdjustmentProposal = {
  adjustmentType: "INTERCOMPANY_ELIMINATION" | "NCI_RECOGNITION" | "FX_TRANSLATION";
  description: string;
  debitEntityId: string | null;
  creditEntityId: string | null;
  /** Positive magnitude: `consolidation_adjustments_amount_check` requires > 0. */
  amountMinor: string;
  currency: string;
  sourceReferences: string[];
};

export type OutstandingItem = { kind: string; subject: string; reason: string };

export type ConsolidationCoreOutput = {
  entities: EntityResult[];
  proposals: AdjustmentProposal[];
  includedCount: number;
  excludedCount: number;
  totalAssetsMinor: string;
  totalLiabilitiesMinor: string;
  totalEquityMinor: string;
  eliminationsMinor: string;
  residualMinor: string;
  /** `assets = liabilities + equity`, computed rather than asserted. */
  balances: boolean;
  outstanding: OutstandingItem[];
  /** True when every member was excluded: totals are then absent, not zero. */
  nothingTranslatable: boolean;
};

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;
type AccountType = (typeof ACCOUNT_TYPES)[number];

/* ------------------------------------------------------------------ */
/* The computation                                                     */
/* ------------------------------------------------------------------ */

export async function computeConsolidation(input: ConsolidationCoreInput): Promise<ConsolidationCoreOutput> {
  const reporting = input.reportingCurrency.toUpperCase();
  const outstanding: OutstandingItem[] = [];
  const entities: EntityResult[] = [];
  const proposals: AdjustmentProposal[] = [];
  const included: IncludedMember[] = [];

  for (const member of input.members) {
    const excluded = (reason: string, kind: string): undefined => {
      entities.push({
        legalEntityId: member.id,
        entityCode: member.code,
        included: false,
        dataState: "UNAVAILABLE",
        unavailabilityReason: reason,
        functionalCurrency: member.functionalCurrency,
        localCurrency: member.functionalCurrency,
        localAssetsMinor: null,
        localLiabilitiesMinor: null,
        localEquityMinor: null,
        translatedAssetsMinor: null,
        translatedLiabilitiesMinor: null,
        translatedEquityMinor: null,
        translationReserveMinor: null,
        ownershipPct: null,
        closingRate: null,
        averageRate: null,
        sourceRefs: [],
      });
      outstanding.push({ kind, subject: member.code, reason });
      return undefined;
    };

    /* 1. No trial balance is not a balance of zero. */
    if (member.balancesByCurrency.length === 0) {
      excluded(
        `Finance OS holds no journal entries for ${member.code} in period ${input.periodCode}, so there is no trial balance to consolidate. Reporting zero assets for a company whose assets are unrecorded would state a fact about the company that nobody has recorded.`,
        "TRIAL_BALANCE",
      );
      continue;
    }

    /* 2. Restate every entry currency into the functional currency, at CLOSING. */
    const local = emptyTotals();
    let localError: string | null = null;
    const localRows: Array<{ currency: string; totals: Record<AccountType, bigint> }> = [];
    for (const bucket of member.balancesByCurrency) {
      const currency = bucket.currency.toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) {
        localError = `'${bucket.currency}' is not a 3-letter ISO currency code, so no rate pair can be named for it`;
        break;
      }
      const parsed = { ASSET: BigInt(0), LIABILITY: BigInt(0), EQUITY: BigInt(0), REVENUE: BigInt(0), EXPENSE: BigInt(0) } as Record<AccountType, bigint>;
      try {
        for (const type of ACCOUNT_TYPES) {
          parsed[type] = minorFromMajorUnits(bucket.accounts[type] ?? "0", currency);
        }
      } catch (error) {
        localError = `${currency}: ${(error as Error).message}`;
        break;
      }
      localRows.push({ currency, totals: parsed });
    }
    if (localError) {
      excluded(`Excluded because a ledger total could not be turned into exact minor units — ${localError}`, "AMOUNT_PRECISION");
      continue;
    }

    if (!isSupportedCurrency(member.functionalCurrency)) {
      excluded(
        `The functional currency ${member.functionalCurrency} has no registered minor-unit exponent, so this member's amounts cannot be expressed in integer minor units.`,
        "FUNCTIONAL_CURRENCY",
      );
      continue;
    }
    const functional = member.functionalCurrency.toUpperCase();
    for (const row of localRows) {
      const use = await resolveForLookup(input.rates, row.currency, functional, "CLOSING");
      if (!use.ok) {
        localError = `${row.currency} entries cannot be restated into ${functional} — ${use.reason}`;
        break;
      }
      for (const type of ACCOUNT_TYPES) {
        // The adapter has already applied each account type's normal side while
        // summing debit-minus-credit; the core only ever sees signed totals.
        local[type] += convertMinor(row.totals[type], use.scaled, row.currency, functional);
      }
    }
    if (localError) {
      excluded(`Excluded because ${localError}`, "LOCAL_CURRENCY_RESTATEMENT");
      continue;
    }

    /* 3. Translate functional → reporting: closing for the balance sheet, average for P&L. */
    const closing = await resolveForLookup(input.rates, functional, reporting, "CLOSING");
    if (!closing.ok) {
      excluded(`${functional} → ${reporting} could not be translated as at ${input.asOf}. ${closing.reason}`, "FX_RATE");
      continue;
    }
    const averageLookup = await resolveForLookup(input.rates, functional, reporting, "AVERAGE");
    const averageIsEstimate = !averageLookup.ok;
    const average = averageIsEstimate ? closing : averageLookup;

    const translated = {
      ASSET: convertMinor(local.ASSET, closing.scaled, functional, reporting),
      LIABILITY: convertMinor(local.LIABILITY, closing.scaled, functional, reporting),
      EQUITY: convertMinor(local.EQUITY, closing.scaled, functional, reporting),
      REVENUE: convertMinor(local.REVENUE, average.scaled, functional, reporting),
      EXPENSE: convertMinor(local.EXPENSE, average.scaled, functional, reporting),
    };
    const profit = translated.REVENUE - translated.EXPENSE;
    // The balancing figure of the member's own translated trial balance. With one
    // rate this is zero (up to at most one minor unit per figure of rounding)
    // because the ledger is double-entry; it is non-zero precisely when income and
    // balance-sheet items carried different rates, which is what a cumulative
    // translation difference IS.
    const reserve = translated.ASSET - translated.LIABILITY - (translated.EQUITY + profit);

    /* 4. Group share, from the registry only. */
    if (member.ownershipEvidenceMissing) {
      excluded(
        `${member.code} has a parent inside the group but no ownership record naming a group owner effective for ${input.periodCode}, so the group's share is unknown. Treating it as 100%-owned would invent a wholly-owned subsidiary and silently drop a non-controlling interest.`,
        "OWNERSHIP",
      );
      continue;
    }
    let ownershipPct: string;
    let estimateNote: string | null = averageIsEstimate
      ? `Income and expense are translated at the CLOSING rate because no AVERAGE rate is recorded for ${functional}/${reporting} on ${input.asOf}; the translation reserve is therefore zero by construction and is not a cumulative translation adjustment.`
      : null;
    if (member.isRootInScope && member.ownership.length === 0) {
      ownershipPct = "100.000000";
    } else if (member.ownership.length > 0) {
      const byOwner = new Map<string, { pct: string; conflict: boolean }>();
      for (const record of member.ownership) {
        const existing = byOwner.get(record.ownerEntityId);
        if (!existing) byOwner.set(record.ownerEntityId, { pct: record.pct, conflict: false });
        else if (!sameNumber(existing.pct, record.pct)) byOwner.set(record.ownerEntityId, { pct: existing.pct, conflict: true });
      }
      const conflicts = [...byOwner.values()].filter((entry) => entry.conflict);
      if (conflicts.length > 0) {
        excluded(
          `${conflicts.length} ownership record(s) for ${member.code} state different percentages for the same owner. No precedence rule between registry rows is ratified, so the group share is not computed and no figure is produced for this member.`,
          "OWNERSHIP_CONFLICT",
        );
        continue;
      }
      let total = 0;
      for (const entry of byOwner.values()) total += Number(entry.pct);
      if (!Number.isFinite(total) || total > 100.000001) {
        excluded(
          `In-group ownership records for ${member.code} sum to ${total.toFixed(6)}%, which cannot all be separate holdings. A BENEFICIAL percentage may well restate a DIRECT one already counted, and no rule for netting the two is ratified, so the group share is not computed. The run does not cap the total at 100%: capping is a decision about who owns the company.`,
          "OWNERSHIP_IMPOSSIBLE",
        );
        continue;
      }
      ownershipPct = total.toFixed(6);
      if (member.ownership.every((record) => record.ownershipType === "CONTROL_ONLY")) {
        estimateNote =
          (estimateNote ? `${estimateNote} ` : "") +
          "Every in-group ownership record is CONTROL_ONLY, so the group holds control without economic interest: 0% of the equity is the group's and the whole of it is attributed to others.";
      }
    } else {
      excluded(
        `${member.code} has a parent outside this run's scope and no ownership record for it, so the group's share of this member is not known.`,
        "OWNERSHIP",
      );
      continue;
    }

    const sourceRefs = [
      ...member.ownership.map((record) => `ownership_records:${record.id}`),
      ...closing.rowIds.map((id) => `fx_rates:${id}:${rowPair(functional, reporting, "CLOSING")}`),
      ...(averageIsEstimate ? [] : averageLookup.ok ? averageLookup.rowIds.map((id) => `fx_rates:${id}:${rowPair(functional, reporting, "AVERAGE")}`) : []),
    ];

    entities.push({
      legalEntityId: member.id,
      entityCode: member.code,
      included: true,
      dataState: estimateNote ? "ESTIMATED" : "ACTUAL",
      unavailabilityReason: estimateNote,
      functionalCurrency: member.functionalCurrency,
      localCurrency: functional,
      localAssetsMinor: local.ASSET.toString(),
      localLiabilitiesMinor: local.LIABILITY.toString(),
      localEquityMinor: (local.EQUITY + local.REVENUE - local.EXPENSE).toString(),
      translatedAssetsMinor: translated.ASSET.toString(),
      translatedLiabilitiesMinor: translated.LIABILITY.toString(),
      translatedEquityMinor: (translated.EQUITY + profit).toString(),
      translationReserveMinor: reserve.toString(),
      ownershipPct,
      closingRate: closing.rate,
      averageRate: averageIsEstimate ? null : averageLookup.ok ? averageLookup.rate : null,
      sourceRefs,
    });
    included.push({
      id: member.id,
      code: member.code,
      ownershipPct,
      translated,
      equityWithProfit: translated.EQUITY + profit,
      reserve,
      sourceRefs,
    });
  }

  /* ---------------------------------------------------------------- */
  /* Totals                                                            */
  /* ---------------------------------------------------------------- */
  const totals = included.reduce(
    (acc, row) => ({
      assets: acc.assets + row.translated.ASSET,
      liabilities: acc.liabilities + row.translated.LIABILITY,
      equity: acc.equity + row.equityWithProfit,
      residual: acc.residual + row.reserve,
    }),
    { assets: BigInt(0), liabilities: BigInt(0), equity: BigInt(0), residual: BigInt(0) },
  );

  /* ---------------------------------------------------------------- */
  /* Elimination proposals                                             */
  /* ---------------------------------------------------------------- */
  const includedIds = new Set(included.map((row) => row.id));
  const memberIds = new Map(input.members.map((member) => [member.id, member.code]));
  for (const transaction of input.intercompany) {
    if (!includedIds.has(transaction.receivableEntityId) || !includedIds.has(transaction.payableEntityId)) {
      // Two different situations look the same from here and must not be reported the
      // same way. A counterparty that is not part of this group at all is not this
      // run's business — listing it would fill `outstanding` with noise no preparer
      // can close. A counterparty that IS a member but was excluded from the run is a
      // gap this run created: the balance is real, one side of it is consolidated,
      // and the elimination is impossible until the other side is translated.
      const outside = [transaction.receivableEntityId, transaction.payableEntityId].filter((id) => !includedIds.has(id));
      const excludedMember = outside.find((id) => memberIds.has(id));
      if (excludedMember) {
        outstanding.push({
          kind: "ELIMINATION_PARTIAL",
          subject: transaction.reference,
          reason:
            `${memberIds.get(excludedMember)} is a member of this group but was excluded from this run, so only one side of ${transaction.reference} is consolidated. ` +
            "Leaving the other side in would leave the group owing itself an amount that shows up as a real asset or liability; eliminating it against an excluded member would delete a balance the run never measured. Reported, not resolved.",
        });
      }
      continue;
    }
    if (!transaction.bothSidesAuthorized) {
      outstanding.push({
        kind: "ELIMINATION",
        subject: transaction.reference,
        reason: `state ${transaction.state}: only a transaction authorized by both sides is a fact both companies accept, so it is not eliminated. A unilateral elimination would delete the counterparty's claim on one company's say-so.`,
      });
      continue;
    }
    if (transaction.reconciliationDifferenceMinor !== null && !isZero(transaction.reconciliationDifferenceMinor)) {
      outstanding.push({
        kind: "ELIMINATION",
        subject: transaction.reference,
        reason: `the two sides differ by ${transaction.reconciliationDifferenceMinor} ${transaction.currency} minor units and the difference is unresolved; eliminating either amount would pick a side`,
      });
      continue;
    }
    let amount = BigInt(0);
    const currency = transaction.currency.toUpperCase();
    try {
      amount = minorFromMinorUnits(transaction.amountMinor);
    } catch (error) {
      outstanding.push({ kind: "ELIMINATION", subject: transaction.reference, reason: (error as Error).message });
      continue;
    }
    if (currency !== reporting) {
      if (!/^[A-Z]{3}$/.test(currency) || !isSupportedCurrency(currency)) {
        outstanding.push({
          kind: "ELIMINATION",
          subject: transaction.reference,
          reason: `the transaction currency '${transaction.currency}' cannot be expressed in integer minor units, so no elimination amount can be stated for it`,
        });
        continue;
      }
      const use = await resolveForLookup(input.rates, currency, reporting, "CLOSING");
      if (!use.ok) {
        outstanding.push({
          kind: "ELIMINATION",
          subject: transaction.reference,
          reason: `a ${currency} elimination cannot be expressed in ${reporting} — ${use.reason} Leaving it in ${currency} inside a ${reporting} column would mix units in one total`,
        });
        continue;
      }
      amount = convertMinor(amount, use.scaled, currency, reporting);
    }
    if (amount <= BigInt(0)) {
      outstanding.push({
        kind: "ELIMINATION",
        subject: transaction.reference,
        reason: `the amount is ${amount} ${reporting} minor units; a nil or negative intra-group balance is a finding to read, not an elimination, and ` + "`consolidation_adjustments_amount_check`" + " admits only a positive magnitude",
      });
      continue;
    }
    proposals.push({
      adjustmentType: "INTERCOMPANY_ELIMINATION",
      description:
        `Eliminate intra-group balance ${transaction.reference} (${transaction.state}): ${currency} ${transaction.amountMinor} minor units. ` +
        "The receivable of one member is the payable of another, so the group owes this to itself and it is not a claim on anyone outside the group. Proposed, not applied: no journal is written.",
      debitEntityId: transaction.payableEntityId,
      creditEntityId: transaction.receivableEntityId,
      amountMinor: amount.toString(),
      currency: reporting,
      sourceReferences: [`intercompany_transactions:${transaction.id}`, `reference:${transaction.reference}`],
    });
  }

  /* ---------------------------------------------------------------- */
  /* Non-controlling interests                                          */
  /* ---------------------------------------------------------------- */
  for (const row of included) {
    const pct = Number(row.ownershipPct);
    if (!Number.isFinite(pct) || pct >= 100) continue;
    if (row.equityWithProfit <= BigInt(0)) {
      outstanding.push({
        kind: "NCI_RECOGNITION",
        subject: row.code,
        reason:
          `attributable equity is ${row.equityWithProfit} ${reporting} minor units; whether a deficit is apportioned to a non-controlling interest is a policy question this engine does not answer, and ` +
          "`consolidation_adjustments_amount_check` accepts only a positive magnitude, so no entry is proposed",
      });
      continue;
    }
    const nci = complementShare(row.equityWithProfit, row.ownershipPct);
    if (nci <= BigInt(0)) continue;
    proposals.push({
      adjustmentType: "NCI_RECOGNITION",
      description:
        `Non-controlling interest in ${row.code}: the group's recorded economic share is ${row.ownershipPct}%, so ${nci} ${reporting} minor units of the ${row.equityWithProfit} translated equity belong to holders outside the group. ` +
        "Measured on equity including the translation difference, so the outside holders carry their share of it too.",
      debitEntityId: null,
      creditEntityId: row.id,
      amountMinor: nci.toString(),
      currency: reporting,
      sourceReferences: row.sourceRefs.length > 0 ? row.sourceRefs : [`legal_entities:${row.id}`, `ownership_pct:${row.ownershipPct}`],
    });
  }

  /* ---------------------------------------------------------------- */
  /* The balancing difference                                           */
  /* ---------------------------------------------------------------- */
  const residualMagnitude = totals.residual < BigInt(0) ? -totals.residual : totals.residual;
  if (residualMagnitude !== BigInt(0)) {
    const rateSources = [...new Set(included.flatMap((row) => row.sourceRefs.filter((ref) => ref.startsWith("fx_rates:"))))];
    proposals.push({
      adjustmentType: "FX_TRANSLATION",
      description:
        `Balancing difference of ${totals.residual} ${reporting} minor units across ${included.length} consolidated member(s): the cumulative translation difference from income items carried at an average rate against balance-sheet items at closing, plus at most one minor unit per translated figure of rounding. ` +
        "It is the figure the per-entity reserves already add up to — not a plug, and no balance was adjusted to make the run look square.",
      debitEntityId: null,
      creditEntityId: null,
      amountMinor: residualMagnitude.toString(),
      currency: reporting,
      sourceReferences: rateSources.length > 0 ? rateSources : [`fx:none_recorded@${input.asOf}`, `period:${input.periodCode}`],
    });
  }

  const eliminations = proposals
    .filter((proposal) => proposal.adjustmentType === "INTERCOMPANY_ELIMINATION")
    .reduce((sum, proposal) => sum + BigInt(proposal.amountMinor), BigInt(0));

  return {
    entities,
    proposals,
    includedCount: included.length,
    excludedCount: entities.length - included.length,
    totalAssetsMinor: included.length === 0 ? "" : totals.assets.toString(),
    totalLiabilitiesMinor: included.length === 0 ? "" : totals.liabilities.toString(),
    totalEquityMinor: included.length === 0 ? "" : totals.equity.toString(),
    eliminationsMinor: included.length === 0 ? "" : eliminations.toString(),
    residualMinor: included.length === 0 ? "" : totals.residual.toString(),
    balances: included.length > 0 && totals.residual === BigInt(0),
    outstanding,
    nothingTranslatable: included.length === 0,
  };
}

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

type ResolvedRate = { ok: true; rate: string; scaled: bigint; rowIds: string[] } | { ok: false; reason: string };

/**
 * Same-currency identity, resolved here; everything else delegated.
 *
 * `1` for USD → USD is arithmetic, not a policy judgement, which is why the core is
 * allowed to produce it. A rate between two different currencies never comes from
 * this function.
 */
async function resolveForLookup(lookup: RateLookup, from: string, to: string, kind: RateKind): Promise<ResolvedRate> {
  if (from === to) return { ok: true, rate: "1", scaled: RATE_SCALE, rowIds: [] };
  const resolution = await lookup({ from, to, kind });
  if (!resolution.ok) return { ok: false, reason: `${resolution.decision}: ${resolution.reason}` };
  return { ok: true, rate: resolution.rate, scaled: scaleRate(resolution.rate), rowIds: resolution.rowIds };
}

type IncludedMember = {
  id: string;
  code: string;
  ownershipPct: string;
  translated: Record<AccountType, bigint>;
  equityWithProfit: bigint;
  reserve: bigint;
  sourceRefs: string[];
};

function emptyTotals(): Record<AccountType, bigint> {
  return { ASSET: BigInt(0), LIABILITY: BigInt(0), EQUITY: BigInt(0), REVENUE: BigInt(0), EXPENSE: BigInt(0) };
}

/** Numeric equality of two registry decimals, compared as BigInts, not floats. */
function sameNumber(a: string, b: string): boolean {
  const normalise = (value: string): string => {
    const [whole, fraction = ""] = value.trim().split(".");
    const padded = fraction.replace(/0+$/, "").padEnd(6, "0").slice(0, 6);
    return `${whole.replace(/^0+(?=\d)/, "")}${padded}`;
  };
  return normalise(a) === normalise(b) && /^-?\d+(\.\d+)?$/.test(a.trim()) && /^-?\d+(\.\d+)?$/.test(b.trim());
}

function isZero(value: string): boolean {
  return /^-?0*$/.test(value.trim()) || /^-?0+\.0+$/.test(value.trim());
}

function rowPair(from: string, to: string, kind: RateKind): string {
  return `${from}/${to}@${kind}`;
}
