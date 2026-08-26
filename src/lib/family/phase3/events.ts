/**
 * BEYU OS — Family Institution Phase 3A event contracts.
 *
 * Phase 3A technical architecture specification §28–29. Event NAMES and the
 * canonical envelope shape only. No emission happens here: the canonical
 * writer remains src/lib/audit.ts (publishEventTx), and per-object event
 * PROFILES remain POLICY DECISION REQUIRED (FIR-016) until ratified.
 *
 * Exactly one event type is ungated — FAMILY_POLICY_GATE_DENIED (KDD-7):
 * it records the ABSENCE of policy, so it is the only event that may be
 * produced before any ratification.
 */

import type { EventInput } from "../../audit";
import { FC1_CONSEQUENCES, type FirRef } from "./fail-closed";

/** Event catalogue (spec §28.2), flattened. */
export const FAMILY_EVENT_TYPES = [
  "FAMILY_MEMBER_PROPOSED",
  "FAMILY_MEMBER_VERIFIED",
  "FAMILY_MEMBER_DISPUTED",
  "FAMILY_MEMBER_DISPUTE_RESOLVED",
  "FAMILY_LINEAGE_CORRECTED",
  "FAMILY_EVIDENCE_LINKED",
  "FAMILY_CONSTITUTION_PROPOSED",
  "FAMILY_CONSTITUTION_RATIFIED",
  "FAMILY_CONSTITUTION_ACTIVATED",
  "FAMILY_CONSTITUTION_SUSPENDED",
  "FAMILY_CONSTITUTION_SUPERSEDED",
  "FAMILY_BODY_MEMBER_APPOINTED",
  "FAMILY_BODY_MEMBER_REMOVED",
  "FAMILY_ELIGIBILITY_DETERMINED",
  "FAMILY_BENEFICIARY_PROPOSED",
  "FAMILY_BENEFICIARY_VERIFIED",
  "FAMILY_BENEFICIARY_CHANGED",
  "FAMILY_CAPITAL_INSTRUCTION_CREATED",
  "FAMILY_CAPITAL_INSTRUCTION_SUBMITTED",
  "FAMILY_LOAN_INSTRUCTION_CREATED",
  "FAMILY_LOAN_INSTRUCTION_SUBMITTED",
  "FAMILY_VAULT_ACCESS",
  "FAMILY_VAULT_SEALED",
  "FAMILY_VAULT_UNSEALED",
  "FAMILY_VAULT_SUCCESSION",
  "POLICY_DECISION_RAISED",
  "POLICY_DECISION_RESOLVED",
  "FAMILY_POLICY_GATE_DENIED",
] as const;
export type FamilyEventType = (typeof FAMILY_EVENT_TYPES)[number];

/**
 * The only event producible without ratified policy: it is the audit trail of
 * fail-closed denials themselves. Every other family event requires its
 * object's ratified scope (FIR-016 profile + the object's own FIRs).
 */
export const UNGATED_FAMILY_EVENT_TYPES: readonly FamilyEventType[] = ["FAMILY_POLICY_GATE_DENIED"];

/** Observability metric names (spec §38.1). Names only; no telemetry store. */
export const FAMILY_METRIC_NAMES = [
  "family.denial.rate",
  "family.policy.decisions.open",
  "family.lineage.disputes.open",
  "family.sealed.vault.items",
  "family.audit.completeness",
] as const;
export type FamilyMetricName = (typeof FAMILY_METRIC_NAMES)[number];

export function isFamilyEventType(value: string): value is FamilyEventType {
  return (FAMILY_EVENT_TYPES as readonly string[]).includes(value);
}

export function isUngatedFamilyEventType(value: string): boolean {
  return (UNGATED_FAMILY_EVENT_TYPES as readonly string[]).includes(value);
}

export interface PolicyGateDeniedEventInput {
  operation: string;
  objectType: string;
  objectId: string;
  actorType: "HUMAN" | "SERVICE" | "AI";
  actorUserId: string | null;
  /** The unratified FIRs the denial names. */
  firRefs: readonly FirRef[];
  traceId: string;
  correlationId: string;
  causationId?: string | null;
  tenantId?: string | null;
  legalEntityId?: string | null;
}

/**
 * Pure builder for the denial event on the canonical EventInput envelope.
 * authorityContext is null BY CONSTRUCTION: a policy-gated denial has no
 * ratified authority to cite. policyVersion is null: no ratified policy
 * version exists for the missing value.
 */
export function buildPolicyGateDeniedEvent(input: PolicyGateDeniedEventInput): EventInput {
  return {
    type: "FAMILY_POLICY_GATE_DENIED",
    source: "family-institution",
    domain: "family",
    operation: input.operation,
    destinationDomain: null,
    tenantId: input.tenantId ?? null,
    legalEntityId: input.legalEntityId ?? null,
    subjectType: input.objectType,
    subjectId: input.objectId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorType,
    classification: "INTERNAL",
    payload: {
      code: "POLICY_DECISION_REQUIRED",
      firRefs: [...input.firRefs],
      consequences: [...FC1_CONSEQUENCES],
    },
    traceId: input.traceId,
    correlationId: input.correlationId,
    causationId: input.causationId ?? null,
    authorityContext: null,
    policyVersion: null,
  };
}

export interface DenialSummary {
  total: number;
  byFir: Record<string, number>;
  byOperation: Record<string, number>;
}

/**
 * Pure, deterministic denial summarizer (observability contract). Reads
 * canonical event rows; never mutates. The primary fail-closed health signal
 * is the denial rate by code (spec §38.1).
 */
export function summariseDenials(events: readonly EventInput[]): DenialSummary {
  const summary: DenialSummary = { total: 0, byFir: {}, byOperation: {} };
  for (const event of events) {
    if (event.type !== "FAMILY_POLICY_GATE_DENIED") continue;
    summary.total += 1;
    const operation = event.operation || "UNKNOWN";
    summary.byOperation[operation] = (summary.byOperation[operation] ?? 0) + 1;
    const payload = event.payload ?? {};
    const refs = Array.isArray(payload.firRefs) ? payload.firRefs : [];
    for (const ref of refs) {
      const key = String(ref);
      summary.byFir[key] = (summary.byFir[key] ?? 0) + 1;
    }
  }
  return summary;
}
