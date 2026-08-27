/**
 * BEYU OS — Family Office: shared engineering types.
 *
 * The Family Office is a first-class capability INSIDE BEYU OS (never a
 * separate OS). This layer engineers the complete policy-CONFIGURABLE rails:
 *
 *   ENGINEER the rails now.
 *   RATIFY the rules later.
 *   ACTIVATE the rules after ratification.
 *   NEVER re-engineer the foundation because policy was ratified.
 *
 * Three things are kept strictly separate:
 *   A. ENGINEERING — capability, interfaces, lifecycle, validation, rails.
 *   B. POLICY     — the configurable rule or value governing behavior.
 *   C. RATIFICATION — the authoritative act that makes a policy effective.
 *
 * Nothing in this layer is a policy value. Every policy-dependent field is
 * either a reference to a ratified record, a value container that is empty
 * until ratification, or an explicit UNRESOLVED marker that fails closed.
 */

import { FAMILY_ACTOR_TYPES, type FamilyActorType } from "../model";
import type { FamilyErrorCode } from "../phase3/errors";

export const FAMILY_OFFICE_ENGINE_VERSION = "family-office-1.0.0";

/** The six canonical Family Office categories plus the cross-cutting layers. */
export const OFFICE_DOMAINS = [
  "BUSINESS_DEVELOPMENT",
  "WEALTH_MANAGEMENT",
  "WEALTH_PLANNING",
  "FAMILY_GOVERNANCE",
  "LIFESTYLE_MANAGEMENT",
  "PHILANTHROPY",
  "FAMILY_EDUCATION",
  "FAMILY_INSTITUTION",
  "FAMILY_CAPITAL",
  "FAMILY_LOAN",
] as const;
export type OfficeDomain = (typeof OFFICE_DOMAINS)[number];

export function isOfficeDomain(value: string): value is OfficeDomain {
  return (OFFICE_DOMAINS as readonly string[]).includes(value);
}

/** Deterministic ISO date (YYYY-MM-DD) check. No timezone assumptions. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Effective period. `to === null` means "no end" (explicitly open-ended). */
export interface EffectivePeriod {
  effectiveFrom: string;
  effectiveTo: string | null;
}

export function isIsoPeriod(p: { effectiveFrom: unknown; effectiveTo: unknown }): p is EffectivePeriod {
  return isIsoDate(p.effectiveFrom) && (p.effectiveTo === null || isIsoDate(p.effectiveTo));
}

export function periodContains(p: EffectivePeriod, at: string): boolean {
  if (!isIsoDate(at)) return false;
  if (at < p.effectiveFrom) return false;
  return p.effectiveTo === null || at <= p.effectiveTo;
}

export function assertIsoPeriod(p: EffectivePeriod, label: string): void {
  if (!isIsoPeriod(p)) {
    throw new Error(`${label}: effectiveFrom must be an ISO date and effectiveTo an ISO date or null.`);
  }
  if (p.effectiveTo !== null && p.effectiveTo < p.effectiveFrom) {
    throw new Error(`${label}: effectiveTo must not precede effectiveFrom.`);
  }
}

/**
 * Tenant + legal-entity + jurisdiction scope. Every office object is
 * tenant-scoped; entity and jurisdiction scope must be explicit (never
 * inferred). `null` = tenant-wide (an explicit choice by the caller),
 * never an implicit default.
 */
export interface OfficeScope {
  tenantId: string;
  legalEntityId: string | null;
  jurisdictionRef: string | null;
}

export function assertScopeShape(s: OfficeScope, label: string): void {
  if (typeof s.tenantId !== "string" || s.tenantId.trim() === "") {
    throw new Error(`${label}: tenantId is required (tenant isolation is canonical).`);
  }
}

/**
 * Scope containment: `inner` must be inside `outer`. A scope may only NARROW
 * (e.g. tenant-wide outer permits entity-specific inner). An attempt to
 * widen (entity escape, jurisdiction escape, tenant escape) is a violation.
 */
export function scopeIsContained(outer: OfficeScope, inner: OfficeScope): boolean {
  if (outer.tenantId !== inner.tenantId) return false; // tenant escape
  if (outer.legalEntityId !== null && outer.legalEntityId !== inner.legalEntityId) return false; // entity escape
  if (outer.jurisdictionRef !== null && outer.jurisdictionRef !== inner.jurisdictionRef) return false; // jurisdiction escape
  return true;
}

export const OFFICE_ACTOR_TYPES = FAMILY_ACTOR_TYPES;
export type OfficeActorType = FamilyActorType;

/**
 * The universal "why nothing happened" marker. A result that is not a
 * success carries exactly this — never a permissive fallback.
 */
export interface OfficePolicyRequired {
  state: "POLICY_DECISION_REQUIRED";
  policyKey: string;
  reason: string;
}

/** A deterministic office evaluation result: exactly one of the two. */
export type OfficeOutcome<T> =
  | { state: "RESOLVED"; value: T }
  | OfficePolicyRequired
  | { state: "ARCHITECTURE_DECISION_REQUIRED"; policyKey: string; reason: string }
  | { state: "DENIED"; code: FamilyErrorCode; reason: string };

export function isPolicyRequired(outcome: OfficeOutcome<unknown>): outcome is OfficePolicyRequired {
  return outcome.state === "POLICY_DECISION_REQUIRED";
}

/**
 * A reference to a canonical audit record. Every office record that changes
 * state or carries an effect-bearing reference must name its audit trail.
 */
export interface AuditReference {
  auditRef: string;
}
