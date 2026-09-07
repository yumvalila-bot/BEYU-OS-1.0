/**
 * Governed-event envelope for payments. One builder so every payment event
 * carries the same authority context (or the same explicit absence of it) and no
 * call site can quietly omit `capabilityCode`.
 *
 * `authorityContext.capabilityCode` is filled ONLY with the capability that
 * actually authorised the act. Ingestion has none — a webhook is not an
 * accounting authority — so it is null and the payload says so. Inventing a
 * capability reference for an event that had none would launder an unauthorised
 * act into an audited one.
 */
import type { AuthorityContext, InteropClassification } from "@/lib/interoperability/contract";
import type { EventInput } from "@/lib/audit";

export const PAYMENT_EVENT_SOURCE = "payments/ingest";
export const PAYMENT_EVENT_DOMAIN = "FINANCE";

export type PaymentEventInput = {
  type: string;
  operation: string;
  tenantId: string;
  legalEntityId: string | null;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
  traceId: string | null;
  correlationId: string | null;
  classification?: InteropClassification;
  actorUserId?: string | null;
  actorType?: "HUMAN" | "SERVICE" | "AI";
  authorityContext?: AuthorityContext | null;
  policyVersion?: string | null;
  causationId?: string | null;
  occurredAt?: string;
};

export function paymentEvent(input: PaymentEventInput): EventInput {
  return {
    type: input.type,
    source: PAYMENT_EVENT_SOURCE,
    domain: PAYMENT_EVENT_DOMAIN,
    operation: input.operation,
    destinationDomain: PAYMENT_EVENT_DOMAIN,
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorType ?? "SERVICE",
    classification: input.classification ?? "CONFIDENTIAL",
    payload: input.payload,
    traceId: input.traceId ?? "",
    correlationId: input.correlationId ?? "",
    causationId: input.causationId ?? null,
    authorityContext: input.authorityContext ?? null,
    policyVersion: input.policyVersion ?? null,
    occurredAt: input.occurredAt,
  };
}

export const NO_AUTHORITY_CONTEXT: AuthorityContext = {
  authorityId: null,
  decisionId: null,
  capabilityCode: null,
  permissionCode: null,
  policyVersion: null,
};
