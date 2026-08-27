/**
 * BEYU OS — Family Office event/audit engine.
 *
 * Events are EVIDENCE. They are not authority, not approval, not financial
 * truth. An event may describe that an approval happened (citing the human
 * approval reference); it may never GRANT one.
 *
 * No emission happens here: the canonical writer remains src/lib/audit.ts
 * (publishEventTx). Builders produce the canonical EventInput envelope so
 * that when a workflow step is persisted, its evidence row is deterministic.
 */

import type { EventInput } from "../../audit";

/** The office event catalogue (design; names are technical, not policy). */
export const OFFICE_EVENT_TYPES = [
  "FAMILY_OFFICE_CREATED",
  "FAMILY_OFFICE_SUBMITTED",
  "FAMILY_OFFICE_EVALUATED",
  "FAMILY_OFFICE_VALIDATED",
  "FAMILY_OFFICE_DENIED",
  "FAMILY_OFFICE_POLICY_REQUIRED",
  "FAMILY_OFFICE_AUTHORITY_REQUIRED",
  "FAMILY_OFFICE_APPROVED",
  "FAMILY_OFFICE_REJECTED",
  "FAMILY_OFFICE_AMENDED",
  "FAMILY_OFFICE_SUPERSEDED",
  "FAMILY_OFFICE_DELEGATED",
  "FAMILY_OFFICE_REVOKED",
  "FAMILY_FINANCE_HANDOFF",
  "FAMILY_ADVISORY_OUTPUT",
  "FAMILY_EXECUTION_REFERENCE",
  "FAMILY_LIFECYCLE_OBSERVATION",
] as const;
export type OfficeEventType = (typeof OFFICE_EVENT_TYPES)[number];

export function isOfficeEventType(value: string): value is OfficeEventType {
  return (OFFICE_EVENT_TYPES as readonly string[]).includes(value);
}

export interface OfficeEventInput {
  type: OfficeEventType;
  domain: string;
  objectType: string;
  objectId: string;
  actorType: "HUMAN" | "SERVICE" | "AI";
  actorUserId: string | null;
  tenantId: string | null;
  legalEntityId: string | null;
  /** ISO date-time of the observed step (explicit; never implicit now). */
  occurredAt: string;
  traceId: string;
  correlationId: string;
  causationId?: string | null;
  /**
   * For evidence events that cite an authority (e.g. APPROVED), the cited
   * reference goes in the PAYLOAD as evidence. Denial/gap events carry
   * authorityContext = null by construction: there is no ratified authority
   * to cite.
   */
  citedAuthorityRef?: string | null;
  payloadExtra?: Record<string, unknown>;
}

/**
 * Build a canonical EventInput for an office evidence event.
 * `classification` is an explicit caller input — the office layer never
 * chooses a classification default.
 */
export function buildOfficeEvent(input: OfficeEventInput, classification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "HIGHLY_RESTRICTED"): EventInput {
  const isGap = input.type === "FAMILY_OFFICE_POLICY_REQUIRED" || input.type === "FAMILY_OFFICE_AUTHORITY_REQUIRED" || input.type === "FAMILY_OFFICE_DENIED";
  const payload: Record<string, unknown> = {
    objectType: input.objectType,
    objectId: input.objectId,
    occurredAt: input.occurredAt,
    ...(input.citedAuthorityRef !== null && input.citedAuthorityRef !== undefined ? { citedAuthorityRef: input.citedAuthorityRef } : {}),
    ...(input.payloadExtra ?? {}),
  };
  return {
    type: input.type,
    source: "family-office",
    domain: input.domain,
    operation: input.type.toLowerCase(),
    destinationDomain: null,
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId,
    subjectType: input.objectType,
    subjectId: input.objectId,
    actorUserId: input.actorUserId,
    actorType: input.actorType,
    classification,
    payload,
    traceId: input.traceId,
    correlationId: input.correlationId,
    causationId: input.causationId ?? null,
    // Gap events record the ABSENCE of authority — they carry none.
    // The canonical interop AuthorityContext carries the cited reference in
    // authorityId; the other slots stay null (an evidence event never
    // synthesizes capability/permission codes).
    authorityContext:
      isGap || input.citedAuthorityRef === null || input.citedAuthorityRef === undefined
        ? null
        : {
            authorityId: input.citedAuthorityRef,
            decisionId: null,
            capabilityCode: null,
            permissionCode: null,
            policyVersion: null,
          },
    policyVersion: null,
  };
}

/**
 * Structural invariant: no office event type is an authority-granting
 * event. The authoritative set of non-authority events is the whole
 * catalogue — this guard prevents a future "FAMILY_OFFICE_AUTHORITY_GRANTED"
 * from sneaking into the evidence stream.
 */
export function assertEventCannotGrantAuthority(type: OfficeEventType): void {
  if (type.includes("AUTHORITY") && type !== "FAMILY_OFFICE_AUTHORITY_REQUIRED") {
    throw new Error(`Event "${type}" would imply authority granting. Events are evidence, not authority.`);
  }
  if (type.includes("GRANT") || type.includes("CONFERR")) {
    throw new Error(`Event "${type}" would imply authority granting. Events are evidence, not authority.`);
  }
}
