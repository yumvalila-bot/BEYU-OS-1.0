/**
 * Shared parsing helpers for provider adapters, and the honest re-exports of the
 * domain validators. Adapters must not each invent their own tolerance rules.
 */
import { MoneyError, parseProviderAmount } from "../money";

export { assertSafeExternalRef, describeUntrustedText, isSafeExternalRef } from "../domain";

/**
 * Like `parseProviderAmount`, but a missing or unusable amount is recorded as a
 * gap and yields 0 *only* for non-mandatory fields (fee, tax). A mandatory
 * amount must throw in the caller. The distinction exists because "0" is a
 * different claim from "unknown", and this function never silently converts one
 * into the other: when the value is absent the caller decides, and `gaps` records
 * what the provider actually omitted.
 */
export function parseProviderAmountStrict(
  raw: unknown,
  currency: string,
  gaps: string[],
  label: string,
): number | null {
  const absent = raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");
  if (absent) {
    gaps.push(`${label.toUpperCase()}_ABSENT`);
    return null;
  }
  try {
    return parseProviderAmount(raw, currency);
  } catch (e) {
    if (e instanceof MoneyError) {
      gaps.push(`${label.toUpperCase()}_${e.code}`);
      return null;
    }
    throw e;
  }
}

/** A declared net is honoured; an absent one is left null rather than invented. */
export function parseOptionalAmount(
  raw: unknown,
  currency: string,
  gaps: string[],
  label: string,
): number | null {
  return parseProviderAmountStrict(raw, currency, gaps, label);
}
