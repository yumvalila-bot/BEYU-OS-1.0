/**
 * MONEY MODEL — program §8, §44, §60.
 *
 * Every value in the payment domain is an integer count of minor units. This file
 * pins the properties that make that true at the boundary, because the failure
 * mode it prevents is silent: a provider sending "250000.50" in a zero-decimal
 * currency is rounded away by `parseFloat`, `Math.round`, or a float sum, and the
 * ledger then contains money that nobody sent.
 *
 * TZS is the interesting case because its exponent is 0: minor units and major
 * units are the same integer, so any conversion error is immediately visible as a
 * 100× error.
 */
import { describe, expect, it } from "vitest";
import {
  CURRENCY_EXPONENTS,
  MAX_MINOR_DIGITS,
  currencyExponent,
  isSupportedCurrency,
  majorUnitsString,
  netOf,
  parseProviderAmount,
  sumMinor,
} from "@/lib/payments/money";

describe("payment money model", () => {
  it("Tanzanian shilling is zero-decimal, so 250000 minor units IS 250000 shillings", () => {
    expect(currencyExponent("TZS")).toBe(0);
    expect(parseProviderAmount("250000", "TZS")).toBe(250000);
    expect(parseProviderAmount(250000, "TZS")).toBe(250000);
    expect(majorUnitsString(250000, "TZS")).toBe("250000.00");
  });

  it("a two-decimal currency scales by its exponent, never by an assumed 100", () => {
    expect(currencyExponent("USD")).toBe(2);
    expect(parseProviderAmount("250.00", "USD")).toBe(25000);
    expect(majorUnitsString(25000, "USD")).toBe("250.00");
  });

  it("refuses to round a fraction of the smallest unit that exists", () => {
    expect(() => parseProviderAmount("250000.50", "TZS")).toThrowError(/FRACTIONAL|refusing to round/i);
    expect(() => parseProviderAmount("250.001", "USD")).toThrowError(/decimal places/i);
  });

  it("refuses negative and non-decimal shapes rather than coercing them", () => {
    expect(() => parseProviderAmount("-1", "TZS")).toThrowError(/negative/i);
    expect(() => parseProviderAmount(-1000, "TZS")).toThrowError(/negative/i);
    expect(() => parseProviderAmount("1,000.00", "TZS")).toThrowError(/plain non-negative decimal/i);
    expect(() => parseProviderAmount("1e5", "TZS")).toThrowError(/plain non-negative decimal/i);
    expect(() => parseProviderAmount("", "TZS")).toThrowError(/empty string/i);
    expect(() => parseProviderAmount(null, "TZS")).toThrowError(/decimal string or integer/i);
    expect(() => parseProviderAmount(Number.NaN, "TZS")).toThrowError(/not finite/i);
  });

  it("refuses an unknown currency instead of defaulting to an exponent", () => {
    expect(isSupportedCurrency("XX1")).toBe(false);
    expect(() => currencyExponent("XX1")).toThrowError(/No minor-unit exponent/i);
    expect(() => parseProviderAmount("10", "XX1")).toThrowError(/No minor-unit exponent/i);
  });

  it("keeps amounts inside the numeric(18,0) column that stores them", () => {
    expect(MAX_MINOR_DIGITS).toBe(18);
    const tooBig = `${"9".repeat(MAX_MINOR_DIGITS + 1)}.00`;
    expect(() => parseProviderAmount(tooBig, "USD")).toThrowError(/AMOUNT_OVERFLOW|safe integer/i);
    expect(() => parseProviderAmount(Number.MAX_SAFE_INTEGER + 10, "TZS")).toThrowError(/safe integer/i);
  });

  it("sums in integers and reproduces the float-trap that motivated the rule", () => {
    const parts = [0.1, 0.2] as const;
    // The classic demonstration, asserted so the shape of the bug is on record:
    expect(parts[0] + parts[1]).not.toBe(0.3);
    // In minor units there is no such error. 10 + 20 cents is 30 cents.
    expect(sumMinor([10, 20])).toBe(30);
    expect(sumMinor([333, 333, 334])).toBe(1000);
    expect(sumMinor([])).toBe(0);
    expect(() => sumMinor([1.5])).toThrowError();
    expect(() => sumMinor([-1])).toThrowError();
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrowError();
  });

  it("netOf is arithmetic that refuses a contradiction instead of absorbing it", () => {
    expect(netOf({ grossMinor: 250000, feeMinor: 1000, taxMinor: 0 })).toEqual({
      netMinor: 249000,
      grossMinor: 250000,
      feeMinor: 1000,
      taxMinor: 0,
    });
    expect(netOf({ grossMinor: 250000, feeMinor: 0 }).netMinor).toBe(250000);

    // Fee + tax greater than gross is a contradiction about money, not a rounding
    // case: it must be surfaced, never clamped to zero.
    expect(() => netOf({ grossMinor: 1000, feeMinor: 2000, taxMinor: 0 })).toThrowError(/exceed gross|negative net/i);
    // And `netOf` takes numbers, so an unreported fee cannot be smuggled in as a
    // null and silently treated as zero — the adapter records that case as a gap
    // with netBasis UNRESOLVED/DERIVED_FROM_GROSS, which is a separate fact.
    expect(() => netOf({ grossMinor: 1000, feeMinor: null as never })).toThrowError(/non-negative safe integer/i);
    expect(() => netOf({ grossMinor: 1.5, feeMinor: 0 })).toThrowError(/non-negative safe integer/i);
  });

  it("every registered currency has an explicit integer exponent", () => {
    for (const [code, exponent] of Object.entries(CURRENCY_EXPONENTS)) {
      expect(Number.isInteger(exponent), code).toBe(true);
      expect(exponent, code).toBeGreaterThanOrEqual(0);
      expect(exponent, code).toBeLessThanOrEqual(3);
    }
  });
});
