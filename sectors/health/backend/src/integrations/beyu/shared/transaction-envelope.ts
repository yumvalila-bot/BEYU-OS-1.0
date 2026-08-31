/**
 * Canonical Health OS transaction envelope builder.
 *
 * Every consequential Health OS business action MUST attach an envelope
 * capturing all governance-mandated fields. If a mandatory canonical field
 * is unavailable, we fail CLOSED — do not fabricate GlobalUserIDs,
 * practitioner IDs, facility IDs, licences, locations, or external
 * references. Fields that cannot be sourced (Finance event ID, Tax
 * determination ID, external references, AI results) are left null and
 * the corresponding status field records `blocked` / `not_evaluated`.
 */
import { Injectable } from "@nestjs/common";
import { TenantContext, ActorContext } from "../../../common/security/tenant-context";
import { currentCorrelationId, requestStorage } from "../../../common/observability/correlation-id.middleware";
import { randomUUID } from "crypto";

export interface TransactionEnvelope {
  // Canonical identity
  globalUserId: string;
  tenantId: string;
  entityCode: string | null;
  entityId: string | null;
  countryCode: string | null;
  // Practitioner / facility (never fabricated)
  professionalLicenseNumber: string | null;
  practitionerId: string | null;
  facilityId: string | null;
  ward: string | null;
  department: string | null;
  room: string | null;
  servicePoint: string | null;
  // Timing
  timestamp: string;
  timezone: string | null;
  location: string | null;
  // Action / resource
  action: string;
  actionPerformed: string;
  operation: string;
  resourceType: string;
  resourceId: string | null;
  // Correlation / request identity
  correlationId: string;
  causationId: string;
  requestId: string;
  transactionId: string;
  idempotencyKey: string | null;
  sessionId: string | null;
  // Before / after (filled by service where appropriate)
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  // Governance outcome
  authorizationDecision: "allowed" | "denied" | "approval_required" | "not_evaluated";
  resultStatus: "ok" | "error" | "blocked" | "pending";
  // Audit / data classification
  auditRecordId: string | null;
  dataClassification: "PHI" | "PII" | "FINANCIAL" | "AUDIT" | "PUBLIC" | "INTERNAL" | "RESTRICTED";
  legalHoldState: "not_held" | "held" | "not_evaluated";
  retentionPolicy: string | null;
  // Governance / external references (null unless legitimately produced)
  governanceDecisionReference: string | null;
  hcmVerificationReference: string | null;
  financeEventReference: string | null;
  taxDeterminationReference: string | null;
  aiInvocationReference: string | null;
  externalReference: string | null;
}

@Injectable()
export class TransactionEnvelopeBuilder {
  constructor(private readonly tenantCtx: TenantContext) {}

  build(input: {
    action: string;
    resourceType: string;
    resourceId?: string | null;
    causationId?: string | null;
    idempotencyKey?: string | null;
    dataClassification?: TransactionEnvelope["dataClassification"];
  }): TransactionEnvelope {
    const actor: ActorContext | null = this.tenantCtx.current();
    if (!actor) {
      throw new Error("NO_ACTOR: cannot build transaction envelope outside actor context");
    }
    const globalUserId = actor.globalUserId ?? actor.userId;
    if (!globalUserId) throw new Error("NO_GLOBAL_USER_ID: fail-closed");
    const reqCtx = (requestStorage as any).getStore?.() as any;
    const correlationId = currentCorrelationId();
    const txnId = randomUUID();
    const idem = input.idempotencyKey
      ?? reqCtx?.headers?.["idempotency-key"]
      ?? reqCtx?.headers?.["x-idempotency-key"]
      ?? null;
    const dataClassification = input.dataClassification ?? inferClassification(input.resourceType);
    return {
      globalUserId,
      tenantId: actor.tenantId,
      entityCode: actor.entityCode ?? null,
      entityId: actor.organizationId ?? null,
      countryCode: actor.countryCode ?? null,
      professionalLicenseNumber: actor.licenceNumber ?? null,
      practitionerId: actor.practitionerId ?? null,
      facilityId: actor.facilityId ?? null,
      ward: actor.ward ?? null,
      department: actor.department ?? null,
      room: actor.room ?? null,
      servicePoint: actor.servicePoint ?? null,
      timestamp: new Date().toISOString(),
      timezone: actor.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
      location: null,
      action: input.action,
      actionPerformed: input.action,
      operation: reqCtx?.method ?? "UNKNOWN",
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      correlationId,
      causationId: input.causationId ?? correlationId,
      requestId: reqCtx?.requestId ?? randomUUID(),
      transactionId: txnId,
      idempotencyKey: idem,
      sessionId: actor.sessionId ?? null,
      before: null,
      after: null,
      authorizationDecision: "not_evaluated",
      resultStatus: "pending",
      auditRecordId: null,
      dataClassification,
      legalHoldState: "not_evaluated",
      retentionPolicy: null,
      governanceDecisionReference: null,
      hcmVerificationReference: null,
      financeEventReference: null,
      taxDeterminationReference: null,
      aiInvocationReference: null,
      externalReference: null,
    };
  }
}

function inferClassification(resourceType: string): TransactionEnvelope["dataClassification"] {
  const rt = (resourceType || "").toLowerCase();
  if (/(invoice|payment|bill|finance|ledger|claim)/.test(rt)) return "FINANCIAL";
  if (/(audit)/.test(rt)) return "AUDIT";
  if (/(patient|encounter|prescription|lab|imaging|clinical|note|eye|dialysis|dispense|medication|appointment|observation|problem|allergy|sign)/.test(rt)) return "PHI";
  if (/(user|identity|mfa|session|membership)/.test(rt)) return "PII";
  return "RESTRICTED";
}
