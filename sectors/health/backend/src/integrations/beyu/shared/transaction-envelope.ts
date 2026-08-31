/**
 * Canonical Health OS transaction envelope builder.
 *
 * Every consequential Health OS business action MUST attach an envelope
 * capturing all governance-mandated fields. If a mandatory canonical field
 * is unavailable, we fail CLOSED — do not fabricate GlobalUserIDs,
 * practitioner IDs, facility IDs, licences, or locations.
 */
import { Injectable } from "@nestjs/common";
import { TenantContext, ActorContext } from "../../../common/security/tenant-context";
import { currentCorrelationId, requestStorage } from "../../../common/observability/correlation-id.middleware";
import { randomUUID } from "crypto";

export interface TransactionEnvelope {
  globalUserId: string;
  professionalLicenseNumber: string | null;
  practitionerId: string | null;
  facilityId: string | null;
  tenantId: string;
  entityCode: string | null;
  countryCode: string | null;
  timestamp: string;
  timezone: string | null;
  location: string | null; // not fabricated — only present if supplied by actor context
  sessionId: string | null;
  correlationId: string;
  causationId: string;
  requestId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  authorizationDecision: "allowed" | "denied" | "approval_required" | "not_evaluated";
  resultStatus: "ok" | "error" | "blocked" | "pending";
  auditRecordId: string | null;
}

@Injectable()
export class TransactionEnvelopeBuilder {
  constructor(private readonly tenantCtx: TenantContext) {}

  /** Build an envelope for the current request. Throws if canonical
   *  identity is missing (fail-closed). */
  build(input: {
    action: string;
    resourceType: string;
    resourceId?: string | null;
    causationId?: string | null;
  }): TransactionEnvelope {
    const actor: ActorContext | null = this.tenantCtx.current();
    if (!actor) {
      throw new Error("NO_ACTOR: cannot build transaction envelope outside actor context");
    }
    const globalUserId = actor.globalUserId ?? actor.userId;
    if (!globalUserId) throw new Error("NO_GLOBAL_USER_ID: fail-closed");
    const reqCtx = (requestStorage as any).getStore?.() as any;
    return {
      globalUserId,
      professionalLicenseNumber: actor.licenceNumber ?? null, // never fabricate
      practitionerId: actor.practitionerId ?? null,
      facilityId: actor.facilityId ?? null,
      tenantId: actor.tenantId,
      entityCode: actor.entityCode ?? null,
      countryCode: actor.countryCode ?? null,
      timestamp: new Date().toISOString(),
      timezone: actor.timezone ?? null,
      location: null, // location only when legitimately available; NOT fabricated
      sessionId: actor.sessionId ?? null,
      correlationId: currentCorrelationId(),
      causationId: input.causationId ?? randomUUID(),
      requestId: reqCtx?.requestId ?? randomUUID(),
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      authorizationDecision: "not_evaluated",
      resultStatus: "pending",
      auditRecordId: null,
    };
  }
}
