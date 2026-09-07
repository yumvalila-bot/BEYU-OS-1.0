/**
 * Payment money arithmetic — integer minor units only.
 *
 * WHY THIS MODULE EXISTS
 *   Provider payloads express money in wildly different shapes: M-Pesa-style
 *   rails quote "250000" for TZS (zero decimal places), card and bank rails
 *   quote "250000.00", some APIs quote the smallest unit ("25000000" for a
 *   2-decimal currency), and a naive `parseFloat(amount * 100)` introduces the
 *   binary-float drift that turns a reconciled million into 999999.98 and a
 *   settlement shortfall into a phantom variance.
 *
 *   So every payment amount in this program is an INTEGER number of minor
 *   units, held end-to-end, and only the ledger's `numeric(18,2)` columns ever
 *   see a decimal string. Conversion goes through `parseProviderAmount` /
 *   `majorUnitsFromMinor` and nothing else.
 *
 * RULES
 *   - Float is never an intermediate representation. Parsing is decimal-string
 *     based; there is no path from a JS `number` with a fractional part to
 *     minor units (it is refused, not rounded).
 *   - A currency the platform has no exponent for is an ERROR, never a default
 *     of 2. Inventing an exponent is inventing money's size.
 *   - Magnitudes must fit `Number.isSafeInteger` and the storage precision
 *     (18 digits). Overflow fails closed.
 *   - This module performs NO currency conversion. FX belongs to
 *     `src/lib/finance/fx.ts` and its `deriveRateFromBalances(): never`
 *     prohibition applies here too.
 */

/**
 * Minor-unit exponents for the currencies this program can legitimately speak
 * about. Zero-decimal currencies (TZS, UGX, JPY, KRW, VND, CLP) are the ones a
 * generic "multiply by 100" library silently breaks, which is exactly the
 * failure this program must not ship.
 *
 * Extend only with authoritative evidence for the currency in question.
 */
export const CURRENCY_EXPONENTS = {
  TZS: 0,
  UGX: 0,
  KES: 2,
  RWF: 0,
  BIF: 0,
  CDF: 2,
  ETB: 2,
  ZMW: 2,
  MWK: 2,
  MZN: 2,
  NGN: 2,
  GHS: 2,
  XOF: 0,
  XAF: 0,
  ZAR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  CHF: 2,
  CNY: 2,
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  INR: 2,
  AED: 2,
} as const;

export type CurrencyCode = keyof typeof CURRENCY_EXPONENTS;

export const MAX_MINOR_DIGITS = 18;

export type MoneyErrorCode =
  | "UNSUPPORTED_CURRENCY"
  | "INVALID_AMOUNT"
  | "AMOUNT_OVERFLOW"
  | "FRACTIONAL_MINOR_UNIT"
  | "NEGATIVE_AMOUNT";

export class MoneyError extends Error {
  constructor(
    readonly code: MoneyErrorCode,
    message: string,
    readonly context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "MoneyError";
  }
}

export function isSupportedCurrency(value: unknown): value is CurrencyCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CURRENCY_EXPONENTS, value.toUpperCase());
}

export function currencyExponent(currency: string): number {
  const key = currency.toUpperCase() as CurrencyCode;
  if (!isSupportedCurrency(key)) {
    throw new MoneyError("UNSUPPORTED_CURRENCY", `No minor-unit exponent is registered for currency "${currency}".`, {
      currency,
    });
  }
  return CURRENCY_EXPONENTS[key];
}

/**
 * Accepts only what a provider can legitimately send: a non-negative decimal
 * string or a safe integer. `"250000.001"` in a zero-decimal currency is
 * refused rather than rounded, because rounding a fraction of the smallest unit
 * that exists is a decision about money, not a formatting detail.
 */
export function parseProviderAmount(raw: unknown, currency: string): number {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) throw new MoneyError("INVALID_AMOUNT", "Amount is not finite.", { raw });
    if (raw < 0) throw new MoneyError("NEGATIVE_AMOUNT", "Amount is negative.", { raw });
    if (!Number.isInteger(raw)) {
      return fromDecimalString(String(raw), currency);
    }
    return assertRange(raw * 10 ** currencyExponent(currency), currency, raw);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") throw new MoneyError("INVALID_AMOUNT", "Amount is an empty string.");
    if (trimmed.startsWith("-")) throw new MoneyError("NEGATIVE_AMOUNT", "Amount is negative.", { raw: trimmed });
    return fromDecimalString(trimmed, currency);
  }
  throw new MoneyError("INVALID_AMOUNT", `Amount must be a decimal string or integer, got ${typeof raw}.`, {
    type: typeof raw,
  });
}

function fromDecimalString(text: string, currency: string): number {
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new MoneyError("INVALID_AMOUNT", `Amount "${text}" is not a plain non-negative decimal.`, { text });
  }
  const exponent = currencyExponent(currency);
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > exponent) {
    throw new MoneyError(
      "FRACTIONAL_MINOR_UNIT",
      `Amount "${text}" has ${fraction.length} decimal places but ${currency.toUpperCase()} has ${exponent}. Refusing to round.`,
      { text, currency, exponent },
    );
  }
  const padded = (fraction + "0".repeat(exponent)).slice(0, exponent);
  const minorText = `${whole}${padded}`.replace(/^0+(?=\d)/, "");
  const minor = Number(minorText);
  if (!/^\d+$/.test(minorText) || !Number.isSafeInteger(minor)) {
    throw new MoneyError("AMOUNT_OVERFLOW", `Amount "${text}" does not resolve to a safe integer of minor units.`, {
      text,
    });
  }
  return assertRange(minor, currency, text);
}

function assertRange(minor: number, currency: string, original: unknown): number {
  if (!Number.isSafeInteger(minor) || minor < 0) {
    throw new MoneyError("INVALID_AMOUNT", `Amount is not a non-negative safe integer.`, { original, currency });
  }
  if (String(minor).length > MAX_MINOR_DIGITS) {
    throw new MoneyError(
      "AMOUNT_OVERFLOW",
      `Amount exceeds ${MAX_MINOR_DIGITS} digits of minor units for ${currency.toUpperCase()}.`,
      { original, minor: String(minor) },
    );
  }
  return minor;
}

/** Sum in minor units. Never `parseFloat` a reduction of these. */
export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    if (!Number.isSafeInteger(v) || v < 0) {
      throw new MoneyError("INVALID_AMOUNT", "Cannot sum a non-negative-safe-integer amount.", { value: v });
    }
    total += v;
    if (!Number.isSafeInteger(total)) throw new MoneyError("AMOUNT_OVERFLOW", "Sum overflowed safe integers.");
  }
  return total;
}

/**
 * Decimal STRING for the ledger's `numeric(18,2)` columns. The major-unit value
 * is derived, so a zero-decimal currency like TZS converts by 10^0 and never
 * gains phantom cents.
 */
export function majorUnitsString(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor) || minor < 0) {
    throw new MoneyError("INVALID_AMOUNT", "Cannot render a non-negative integer minor amount.", { minor });
  }
  const exponent = currencyExponent(currency);
  if (exponent === 0) return `${minor}.00`;
  const scale = 10 ** exponent;
  const whole = Math.floor(minor / scale);
  const frac = String(minor % scale).padStart(exponent, "0");
  return `${whole}.${frac}${exponent < 2 ? "0".repeat(2 - exponent) : ""}`;
}

/** gross − fees − tax = net, asserted, never assumed. */
export function netOf(input: {
  grossMinor: number;
  feeMinor: number;
  taxMinor?: number;
}): { netMinor: number; grossMinor: number; feeMinor: number; taxMinor: number } {
  const { grossMinor, feeMinor } = input;
  const taxMinor = input.taxMinor ?? 0;
  for (const [label, value] of [
    ["gross", grossMinor],
    ["fee", feeMinor],
    ["tax", taxMinor],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new MoneyError("INVALID_AMOUNT", `${label} amount must be a non-negative safe integer.`, { value });
    }
  }
  const netMinor = grossMinor - feeMinor - taxMinor;
  if (netMinor < 0) {
    throw new MoneyError(
      "INVALID_AMOUNT",
      `Fees and tax (${feeMinor} + ${taxMinor}) exceed gross (${grossMinor}); a negative net is a data conflict, not arithmetic.`,
      { grossMinor, feeMinor, taxMinor },
    );
  }
  return { netMinor, grossMinor, feeMinor, taxMinor };
}

export const MONEY_RULES_VERSION = "payment-money-1.0.0";
