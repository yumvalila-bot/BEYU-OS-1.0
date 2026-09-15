/**
 * BEYU OS — GOVERNED CONTRACTING PURE PRIMITIVES.
 *
 * Deterministic date/hash/reference math shared by every contracting engine.
 * Deliberately free of database, session and clock access: the governed services
 * supply `asOf` dates explicitly so any computation can be reproduced later from
 * recorded inputs (§61 provenance, §70 determinism).
 */

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const HASH32 = /^0x[0-9a-fA-F]{64}$/;
const MAX_DAY_OFFSET = 36_600; // ±100 years

export type ContractModelErrorCode =
  | "UNKNOWN_STATE"
  | "UNKNOWN_TYPE"
  | "INVALID_TRANSITION"
  | "TERMINAL_STATE"
  | "INVALID_DATE"
  | "INVALID_AMOUNT"
  | "INVALID_REFERENCE"
  | "REVIEW_NOT_CLOSED"
  | "EVIDENCE_REQUIRED"
  | "AUTHORITY_BLOCKED"
  | "RULE_VIOLATION"
  | "OUT_OF_RANGE";

/** Thrown by the deterministic engines; the governed services map it to a typed ContractError. */
export class ContractModelError extends Error {
  constructor(
    readonly code: ContractModelErrorCode,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ContractModelError";
  }
}

/** Exact ISO calendar date (UTC semantics; no timezone drift). */
export function assertIsoDate(value: string, field: string): string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) {
    throw new ContractModelError("INVALID_DATE", `${field} must be an ISO date (YYYY-MM-DD).`, { field, value });
  }
  const [y, m, d] = value.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth) {
    throw new ContractModelError("INVALID_DATE", `${field} is not a real calendar date.`, { field, value });
  }
  return value;
}

/** Non-negative integer amount in major currency units (fixed-point safe, never float math). */
export function assertAmount(value: number, field: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new ContractModelError("INVALID_AMOUNT", `${field} must be a non-negative integer.`, { field, value });
  }
  return value;
}

/** A reference is a non-empty trimmed string. Empty means "not supplied" — never "satisfied". */
export function assertRef(value: string | null | undefined, field: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) {
    throw new ContractModelError("INVALID_REFERENCE", `${field} is required — an empty reference is not evidence.`, {
      field,
    });
  }
  if (v.length > 400) {
    throw new ContractModelError("INVALID_REFERENCE", `${field} exceeds 400 characters.`, { field });
  }
  return v;
}

/** 0x-prefixed 32-byte hex digest, normalised to lower case. */
import { createHash } from "node:crypto";

export function assertHash32(value: string, field: string): string {
  if (typeof value !== "string" || !HASH32.test(value)) {
    throw new ContractModelError("INVALID_REFERENCE", `${field} must be a 0x-prefixed 32-byte hex hash.`, {
      field,
      value,
    });
  }
  return value.toLowerCase();
}

export function sha256Hex(payload: string): string {
  return `0x${createHash("sha256").update(payload).digest("hex")}`;
}

/**
 * Deterministic canonical serialisation with recursively sorted keys, so a hash
 * computed before a `jsonb` write is reproducible after read (PostgreSQL does
 * not preserve object key order). Same contract as `src/lib/crypto.ts`.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** Add a day offset to an ISO date, deterministically in UTC. */
export function addDaysIso(iso: string, days: number): string {
  assertIsoDate(iso, "baseDate");
  if (!Number.isInteger(days) || Math.abs(days) > MAX_DAY_OFFSET) {
    throw new ContractModelError("OUT_OF_RANGE", "day offset must be an integer within ±36,600 days.", { days });
  }
  const ms = Date.parse(`${iso}T00:00:00.000Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whole days between two ISO dates (b − a). */
export function daysBetweenIso(a: string, b: string): number {
  assertIsoDate(a, "from");
  assertIsoDate(b, "to");
  return Math.round((Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / 86_400_000);
}
