/**
 * BEYU OS — one cross-domain interoperability envelope.
 *
 * This is a contract, not a second event bus or authorization engine. Domain
 * services use it to prove that identity, scope, authority context, version and
 * correlation survive a boundary. The canonical event writer remains
 * src/lib/audit.ts.
 */

export const INTEROP_MESSAGE_TYPES = [
  "DOMAIN_EVENT",
  "DOMAIN_COMMAND",
  "DOMAIN_QUERY",
  "DOMAIN_REFERENCE",
  "DOMAIN_DOCUMENT",
  "DOMAIN_STATUS",
] as const;
export type InteropMessageType = (typeof INTEROP_MESSAGE_TYPES)[number];

export const INTEROP_CLASSIFICATIONS = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
  "HIGHLY_RESTRICTED",
] as const;
export type InteropClassification = (typeof INTEROP_CLASSIFICATIONS)[number];

export type AuthorityContext = {
  authorityId: string | null;
  decisionId: string | null;
  capabilityCode: string | null;
  permissionCode: string | null;
  policyVersion: string | null;
};

export type InteroperabilityEnvelope<TPayload = Record<string, unknown>> = {
  messageId: string;
  messageType: InteropMessageType;
  eventType: string;
  eventVersion: string;
  schemaVersion: string;
  sourceDomain: string;
  destinationDomain: string | null;
  operation: string;
  globalUserId: string | null;
  principalId: string | null;
  actorType: "HUMAN" | "SERVICE" | "AI";
  tenantId: string | null;
  legalEntityId: string | null;
  traceId: string;
  correlationId: string;
  causationId: string | null;
  occurredAt: string;
  classification: InteropClassification;
  authorityContext: AuthorityContext | null;
  policyVersion: string | null;
  payload: TPayload;
};

export class InteroperabilityContractError extends Error {
  constructor(readonly field: string, message: string) {
    super(message);
    this.name = "InteroperabilityContractError";
  }
}

const ID = /^[A-Za-z0-9_-]{8,128}$/;

function required(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new InteroperabilityContractError(field, `${field} is required in the common interoperability envelope.`);
  }
}

function identifier(value: string, field: string): void {
  if (!ID.test(value)) {
    throw new InteroperabilityContractError(field, `${field} must be a bounded traceable identifier.`);
  }
}

/**
 * Validates a domain event before it reaches the one enterprise event writer.
 * Null is explicit for root causation, actorless system work, entity-wide work
 * or authority-free read/analysis; omitted required fields are not accepted.
 */
export function assertInteroperabilityEnvelope(input: InteroperabilityEnvelope): void {
  required(input.messageId, "messageId");
  required(input.eventType, "eventType");
  required(input.eventVersion, "eventVersion");
  required(input.sourceDomain, "sourceDomain");
  required(input.operation, "operation");
  required(input.traceId, "traceId");
  required(input.correlationId, "correlationId");
  required(input.occurredAt, "occurredAt");
  required(input.schemaVersion, "schemaVersion");
  identifier(input.messageId, "messageId");
  identifier(input.traceId, "traceId");
  identifier(input.correlationId, "correlationId");
  if (input.causationId !== null) {
    required(input.causationId, "causationId");
    identifier(input.causationId, "causationId");
  }
  if (input.destinationDomain !== null) required(input.destinationDomain, "destinationDomain");
  if (!(INTEROP_MESSAGE_TYPES as readonly string[]).includes(input.messageType)) {
    throw new InteroperabilityContractError("messageType", "Unknown interoperability message type.");
  }
  if (!(INTEROP_CLASSIFICATIONS as readonly string[]).includes(input.classification)) {
    throw new InteroperabilityContractError("classification", "Unknown data classification.");
  }
  if (input.globalUserId !== null) required(input.globalUserId, "globalUserId");
  if (input.principalId !== null) required(input.principalId, "principalId");
  if (input.globalUserId !== input.principalId) {
    throw new InteroperabilityContractError(
      "principalId",
      "GlobalUserID and principalId must resolve to the same canonical identity; no shadow actor is allowed.",
    );
  }
  if (input.actorType === "HUMAN" || input.actorType === "AI") {
    if (!input.globalUserId || !input.principalId) {
      throw new InteroperabilityContractError(
        "globalUserId",
        "Human and AI domain events require the canonical GlobalUserID actor.",
      );
    }
  }
  if (input.authorityContext) {
    for (const [field, value] of Object.entries(input.authorityContext)) {
      if (value !== null && typeof value !== "string") {
        throw new InteroperabilityContractError(
          `authorityContext.${field}`,
          `authorityContext.${field} must be a string or null.`,
        );
      }
    }
  }
}

/** Root message correlation: causation is deliberately absent, never invented. */
export function rootCorrelation(traceId: string): { correlationId: string; causationId: null } {
  identifier(traceId, "traceId");
  return { correlationId: traceId, causationId: null };
}
