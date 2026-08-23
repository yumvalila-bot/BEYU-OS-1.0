/**
 * BEYU OS — Multi-currency and FX rails (Finance OS, Phase 19).
 *
 * THE DEFECT THIS EXISTS TO PREVENT. `treasury_positions` stores both `balance` (transaction
 * currency) and `base_currency_balance` (USD). Dividing one by the other yields an implied rate,
 * and for TZS the seeded data yields THREE DIFFERENT ONES:
 *
 *     LEN_BEYU_AGRI_LTD     980,000,000 TZS / 375,000 USD   = 2613.333333
 *     LEN_BEYU_HEALTH_LTD 2,870,000,000 TZS / 1,098,000 USD = 2613.843352
 *     LEN_BEYU_TZ_HOLDING 6,120,000,000 TZS / 2,340,000 USD = 2615.384615
 *
 * Any of the three could be "derived" and presented as the TZS/USD rate. All three would be
 * fabrications: none was ever published by a rate authority, and the system cannot know which — if
 * any — is correct. Averaging them would invent a fourth number that appears nowhere.
 *
 * So this module does the opposite of what a naive implementation would do: it REFUSES to derive a
 * rate from balances, reports the inconsistency as a data-quality finding, and returns
 * REQUIRES_AUTHORITY until a governed rate source exists.
 *
 * NO RATE IS INVENTED HERE. There is no hardcoded table, no default, no fallback. A currency
 * conversion without a governed rate is not an approximation — it is a fabricated financial
 * figure, and the correct answer is that it cannot be computed.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { treasuryPositions } from "@/db/schema";
import { unavailable, type ClassifiedValue, type EpistemicClass } from "./epistemics";

export const FX_ENGINE_VERSION = "fx-1.0.0";

/** Where a rate came from. Only GOVERNED rates may be used for conversion. */
export const FX_SOURCE_KIND = [
  /** Published by a rate authority and ratified for use. The only usable kind. */
  "GOVERNED",
  /** A real published rate that has not been ratified for accounting use. */
  "REFERENCE_DATA",
  /** Back-computed from two balances. NEVER usable — see the module header. */
  "IMPLIED_FROM_BALANCES",
  /** A test fixture. */
  "SYNTHETIC",
] as const;
export type FxSourceKind = (typeof FX_SOURCE_KIND)[number];

/** The three currency roles a figure can occupy. */
export const CURRENCY_ROLE = ["TRANSACTION", "FUNCTIONAL", "REPORTING"] as const;
export type CurrencyRole = (typeof CURRENCY_ROLE)[number];

export type FxRate = {
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  /** The date the rate applies to — a rate without a date cannot be verified. */
  asOf: string;
  sourceKind: FxSourceKind;
  /** The publishing authority, e.g. a central bank. Null means unattributed. */
  sourceAuthority: string | null;
  /** The governance record authorising this rate for accounting use. */
  approvedByResolutionId: string | null;
  provenanceComplete: boolean;
};

export type FxResolution = {
  usable: boolean;
  rate: FxRate | null;
  decision:
    | "GOVERNED_RATE_AVAILABLE"
    | "REQUIRES_AUTHORITY"
    | "DATA_NOT_AVAILABLE"
    | "RATE_CONFLICT"
    | "SAME_CURRENCY";
  reason: string;
  /** Every candidate considered, so a refusal is explainable. */
  candidatesConsidered: number;
};

export class FxError extends Error {
  constructor(
    readonly code: "NO_GOVERNED_RATE" | "RATE_CONFLICT" | "FABRICATION_ATTEMPT" | "INVALID_CURRENCY",
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "FxError";
  }
}

const CURRENCY_CODE = /^[A-Z]{3}$/;

function assertCurrency(code: string, label: string): void {
  if (!CURRENCY_CODE.test(code)) {
    throw new FxError("INVALID_CURRENCY", `${label} must be a 3-letter ISO currency code, got '${code}'.`);
  }
}

/**
 * Resolves the rate to use for a conversion.
 *
 * THERE IS NO GOVERNED RATE STORE IN THIS SYSTEM. No `exchange_rates` table exists, and creating
 * one populated with numbers would be inventing FX policy — which rate provider is authoritative,
 * which timestamp convention applies, and whether rates are ratified for accounting use are all
 * governance decisions (P4).
 *
 * So this function is honest about the current state: same-currency conversions are the identity
 * and always work; everything else returns REQUIRES_AUTHORITY. The signature is the production
 * one, so when a governed rate source is ratified the rail is already in place.
 */
export async function resolveRate(input: {
  fromCurrency: string;
  toCurrency: string;
  asOf: string;
  /** Governed rates supplied by a caller that already holds them. Empty in production today. */
  governedRates?: FxRate[];
}): Promise<FxResolution> {
  assertCurrency(input.fromCurrency, "fromCurrency");
  assertCurrency(input.toCurrency, "toCurrency");

  if (input.fromCurrency === input.toCurrency) {
    return {
      usable: true,
      rate: {
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        rate: "1",
        asOf: input.asOf,
        sourceKind: "GOVERNED",
        sourceAuthority: "identity",
        approvedByResolutionId: null,
        provenanceComplete: true,
      },
      decision: "SAME_CURRENCY",
      reason: "A currency converts to itself at 1. No rate authority is required for the identity.",
      candidatesConsidered: 0,
    };
  }

  const candidates = (input.governedRates ?? []).filter(
    (r) =>
      r.fromCurrency === input.fromCurrency &&
      r.toCurrency === input.toCurrency &&
      r.asOf === input.asOf,
  );

  // Only GOVERNED rates may convert. Reference data is a real published number that nobody has
  // ratified for accounting use; using it would substitute a vendor's judgement for the Board's.
  const governed = candidates.filter((r) => r.sourceKind === "GOVERNED" && r.provenanceComplete);

  if (governed.length === 0) {
    return {
      usable: false,
      rate: null,
      decision: "REQUIRES_AUTHORITY",
      reason:
        `No governed ${input.fromCurrency}/${input.toCurrency} rate exists for ${input.asOf}. ` +
        "BEYU OS has no ratified FX rate source (P4). A rate cannot be derived, defaulted or " +
        "estimated: an unauthorised rate produces a fabricated financial figure.",
      candidatesConsidered: candidates.length,
    };
  }

  // Two governed rates that disagree is a governance failure, not a tie to break.
  const distinct = new Set(governed.map((r) => r.rate));
  if (distinct.size > 1) {
    return {
      usable: false,
      rate: null,
      decision: "RATE_CONFLICT",
      reason:
        `${distinct.size} conflicting governed rates exist for ${input.fromCurrency}/${input.toCurrency} ` +
        `on ${input.asOf}: ${[...distinct].join(", ")}. No precedence rule is ratified, so no rate is selected.`,
      candidatesConsidered: candidates.length,
    };
  }

  return {
    usable: true,
    rate: governed[0],
    decision: "GOVERNED_RATE_AVAILABLE",
    reason: `Governed rate ${governed[0].rate} from ${governed[0].sourceAuthority ?? "unattributed"}.`,
    candidatesConsidered: candidates.length,
  };
}

/**
 * Converts an amount, or explains why it cannot.
 *
 * Never returns a number it could not justify. The result is a ClassifiedValue so the absence
 * carries its reason instead of collapsing to zero.
 */
export async function convert(input: {
  amount: string;
  fromCurrency: string;
  toCurrency: string;
  asOf: string;
  governedRates?: FxRate[];
  sourceClass?: EpistemicClass;
}): Promise<ClassifiedValue> {
  const resolution = await resolveRate({
    fromCurrency: input.fromCurrency,
    toCurrency: input.toCurrency,
    asOf: input.asOf,
    governedRates: input.governedRates,
  });

  if (!resolution.usable || !resolution.rate) {
    return unavailable(
      resolution.decision === "RATE_CONFLICT" ? "DATA_CONFLICT" : "REQUIRES_AUTHORITY",
      resolution.reason,
      "fx",
    );
  }

  const converted = (Number(input.amount) * Number(resolution.rate.rate)).toFixed(2);

  return {
    amount: converted,
    currency: input.toCurrency,
    // A converted figure is DERIVED: it is arithmetic over an observation and a rate, never an
    // observation in its own right.
    epistemicClass: "DERIVED",
    sourceType: "fx:convert",
    sourceId: `${input.fromCurrency}/${input.toCurrency}@${input.asOf}`,
    reason: null,
  };
}

/**
 * REFUSES to derive a rate from stored balances, and says why.
 *
 * This function exists specifically so the temptation has a name and a test. A future engineer
 * looking for "how do I get the TZS rate?" finds this, and finds the refusal documented rather
 * than discovering the trap by shipping it.
 */
export function deriveRateFromBalances(): never {
  throw new FxError(
    "FABRICATION_ATTEMPT",
    "A rate must never be back-computed from stored balances. The seeded treasury data implies " +
      "three different TZS/USD rates (2613.333333, 2613.843352, 2615.384615); none was published " +
      "by a rate authority and the system cannot know which is correct. Averaging them would " +
      "invent a fourth number appearing nowhere. Use a governed rate or return REQUIRES_AUTHORITY.",
  );
}

export type ImpliedRateFinding = {
  currency: string;
  distinctRates: string[];
  positions: number;
  consistent: boolean;
  /** Always false — an implied rate is never promoted to a usable one. */
  usableAsFxSource: false;
  detail: string;
};

/**
 * Reports implied-rate inconsistency as a DATA-QUALITY finding.
 *
 * The rates are surfaced as evidence of a problem, never as a rate source — `usableAsFxSource` is
 * a literal `false` so no caller can flip it.
 */
export async function scanImpliedRates(): Promise<ImpliedRateFinding[]> {
  const rows = await db
    .select({
      currency: treasuryPositions.currency,
      implied: sql<string>`round(${treasuryPositions.balance} / nullif(${treasuryPositions.baseCurrencyBalance}, 0), 6)::text`,
    })
    .from(treasuryPositions)
    .where(sql`${treasuryPositions.baseCurrencyBalance} <> 0`);

  const byCurrency = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.implied) continue;
    byCurrency.set(r.currency, [...(byCurrency.get(r.currency) ?? []), r.implied]);
  }

  const findings: ImpliedRateFinding[] = [];
  for (const [currency, rates] of byCurrency) {
    const distinct = [...new Set(rates)].sort();
    findings.push({
      currency,
      distinctRates: distinct,
      positions: rates.length,
      consistent: distinct.length <= 1,
      usableAsFxSource: false,
      detail:
        distinct.length <= 1
          ? `${currency}: all ${rates.length} position(s) imply the same rate (${distinct[0]}). ` +
            "Consistency still does not make it a governed rate."
          : `${currency}: ${rates.length} positions imply ${distinct.length} DIFFERENT rates ` +
            `(${distinct.join(", ")}). The balances cannot all be correct under one rate. ` +
            "Reported as a data-quality defect; never used as an FX source.",
    });
  }

  return findings.sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * The three currency roles for a figure.
 *
 * Translation to functional or reporting currency requires a governed rate, so where the
 * currencies differ the translated values are deliberately absent rather than estimated.
 */
export async function currencyView(input: {
  amount: string;
  transactionCurrency: string;
  functionalCurrency: string;
  reportingCurrency: string;
  asOf: string;
  governedRates?: FxRate[];
}): Promise<Record<CurrencyRole, ClassifiedValue>> {
  const transaction: ClassifiedValue = {
    amount: input.amount,
    currency: input.transactionCurrency,
    epistemicClass: "OBSERVED",
    sourceType: "transaction",
    sourceId: null,
    reason: null,
  };

  return {
    TRANSACTION: transaction,
    FUNCTIONAL: await convert({
      amount: input.amount,
      fromCurrency: input.transactionCurrency,
      toCurrency: input.functionalCurrency,
      asOf: input.asOf,
      governedRates: input.governedRates,
    }),
    REPORTING: await convert({
      amount: input.amount,
      fromCurrency: input.transactionCurrency,
      toCurrency: input.reportingCurrency,
      asOf: input.asOf,
      governedRates: input.governedRates,
    }),
  };
}

/**
 * Can every currency in a set be converted to the target?
 *
 * EXPORTED FOR DIRECT TESTING. FI-7 deleted the guard inside sumMultiCurrency() and no test
 * failed: the later per-amount conversion also returns null, so the aggregate still refused. The
 * precheck exists so a partial total is never assembled before discovering it cannot be completed,
 * and that intent needs its own assertion rather than relying on a downstream accident.
 */
export async function assertAllConvertible(input: {
  currencies: string[];
  targetCurrency: string;
  asOf: string;
  governedRates?: FxRate[];
}): Promise<{ allConvertible: boolean; unconvertible: string[]; reason: string }> {
  const unconvertible: string[] = [];
  for (const currency of input.currencies) {
    const r = await resolveRate({
      fromCurrency: currency,
      toCurrency: input.targetCurrency,
      asOf: input.asOf,
      governedRates: input.governedRates,
    });
    if (!r.usable) unconvertible.push(currency);
  }
  return {
    allConvertible: unconvertible.length === 0,
    unconvertible,
    reason:
      unconvertible.length === 0
        ? `All ${input.currencies.length} currency/currencies convert to ${input.targetCurrency}.`
        : `No governed rate to ${input.targetCurrency} for: ${unconvertible.join(", ")}.`,
  };
}

/** Totals a multi-currency set — or refuses, which is the common case. */
export async function sumMultiCurrency(input: {
  amounts: Array<{ amount: string; currency: string }>;
  targetCurrency: string;
  asOf: string;
  governedRates?: FxRate[];
}): Promise<ClassifiedValue> {
  if (input.amounts.length === 0) {
    return unavailable("DATA_NOT_AVAILABLE", "No amounts were supplied.", "fx");
  }

  const currencies = new Set(input.amounts.map((a) => a.currency));

  // Summing mixed currencies without conversion produces a meaningless number — the exact defect
  // found in Phase 7J when sum(balance) added TZS to USD.
  if (currencies.size === 1 && currencies.has(input.targetCurrency)) {
    const total = input.amounts.reduce((s, a) => s + Number(a.amount), 0).toFixed(2);
    return {
      amount: total,
      currency: input.targetCurrency,
      epistemicClass: "DERIVED",
      sourceType: "fx:sum",
      sourceId: null,
      reason: null,
    };
  }

  const convertibility = await assertAllConvertible({
    currencies: [...currencies],
    targetCurrency: input.targetCurrency,
    asOf: input.asOf,
    governedRates: input.governedRates,
  });
  if (!convertibility.allConvertible) {
    return unavailable(
      "REQUIRES_AUTHORITY",
      `Cannot total ${currencies.size} currencies into ${input.targetCurrency}: ${convertibility.reason}`,
      "fx",
    );
  }

  let total = 0;
  for (const a of input.amounts) {
    const c = await convert({
      amount: a.amount,
      fromCurrency: a.currency,
      toCurrency: input.targetCurrency,
      asOf: input.asOf,
      governedRates: input.governedRates,
    });
    if (c.amount === null) {
      return unavailable("REQUIRES_AUTHORITY", c.reason ?? "Conversion unavailable.", "fx");
    }
    total += Number(c.amount);
  }

  return {
    amount: total.toFixed(2),
    currency: input.targetCurrency,
    epistemicClass: "DERIVED",
    sourceType: "fx:sum",
    sourceId: null,
    reason: null,
  };
}
