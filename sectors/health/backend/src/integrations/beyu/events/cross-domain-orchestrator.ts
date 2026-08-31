/**
 * Cross-domain orchestration service — canonical governed transaction flow:
 *   GlobalUserID → HCM practitioner validation → Governance authorization
 *   → Health clinical transaction → Audit envelope → Finance event
 *   → Tax determination → Noelia/HIVE assistance → Final state.
 *
 * Distributed atomicity is NOT claimed; idempotency + outbox + explicit
 * BLOCKED/PENDING states are used instead. No fabricated success.
 */
import { Injectable } from "@nestjs/common";
import { GovernanceAdapter } from "../governance/governance.adapter";
import { HcmAdapter } from "../hcm/hcm.adapter";
import { FinanceAdapter } from "../finance/finance.adapter";
import { TaxAdapter } from "../tax/tax.adapter";
import { NoeliaAdapter } from "../noelia/noelia.adapter";
import { TransactionEnvelopeBuilder } from "../shared/transaction-envelope";
import { TenantContext } from "../../../common/security/tenant-context";
import type {
  RiskLevel,
  CanonicalActorContext,
  PropagationEnvelope,
} from "../contracts/shared.types";
import { randomUUID } from "crypto";

export interface ClinicalActionRequest {
  action: string;
  resourceType: string;
  riskLevel: RiskLevel;
  requiredScope?: string[];
  facilityId?: string | null;
  execute: () => Promise<{ resourceId: string; amount?: { value: string; currency: string } }>;
  financeEvent?: { type: "charge" | "invoice_request" | "claim" };
  taxCategory?: string | null;
  aiAssistance?: {
    capability:
      | "clinical_decision_support"
      | "documentation_assist"
      | "risk_analysis"
      | "compliance_analysis"
      | "anomaly_detection";
  };
}

export interface ClinicalActionOutcome {
  status: "committed" | "blocked" | "pending" | "denied";
  envelopeId: string;
  steps: Array<{ step: string; status: string; detail?: any; reason?: string | null }>;
  resourceId: string | null;
  financeStatus: string | null;
  taxStatus: string | null;
  aiStatus: string | null;
  denialReason: string | null;
}

@Injectable()
export class CrossDomainOrchestrator {
  constructor(
    private readonly gov: GovernanceAdapter,
    private readonly hcm: HcmAdapter,
    private readonly fin: FinanceAdapter,
    private readonly tax: TaxAdapter,
    private readonly noelia: NoeliaAdapter,
    private readonly env: TransactionEnvelopeBuilder,
    private readonly tenantCtx: TenantContext,
  ) {}

  async executeClinicalAction(req: ClinicalActionRequest): Promise<ClinicalActionOutcome> {
    const steps: ClinicalActionOutcome["steps"] = [];

    // 1. Build envelope (fail-closed if no canonical actor).
    let envelope;
    try {
      envelope = this.env.build({ action: req.action, resourceType: req.resourceType });
      steps.push({ step: "envelope", status: "ok" });
    } catch (e: any) {
      return {
        ...empty(randomUUID()),
        steps: [{ step: "envelope", status: "denied", reason: e.message }],
        denialReason: e.message,
      };
    }

    const actor = this.buildActor(envelope);
    const baseProp = (suffix: string): PropagationEnvelope => ({
      correlationId: envelope.correlationId,
      causationId: envelope.causationId,
      requestId: envelope.requestId,
      idempotencyKey: `${envelope.causationId}:${suffix}`,
      timestamp: envelope.timestamp,
    });

    // 2. HCM practitioner authorization.
    const hcmRes = await this.hcm.authorizeClinicalActor({
      action: req.action,
      facilityId: (req.facilityId ?? null) as string | null,
      requiredScope: req.requiredScope ?? [],
    });
    if (!hcmRes.authorized) {
      steps.push({ step: "hcm", status: "denied", reason: hcmRes.reason });
      return { ...empty(envelope.causationId), steps, denialReason: hcmRes.reason ?? "HCM_DENIED" };
    }
    steps.push({ step: "hcm", status: "ok" });

    // 3. Governance decision.
    const gres = await this.gov.decideOrFailClosed({
      actor,
      propagation: baseProp("gov"),
      action: req.action,
      resourceType: req.resourceType,
      resourceId: null,
      riskLevel: req.riskLevel,
    });
    if (gres.decision !== "APPROVE") {
      steps.push({ step: "governance", status: "denied", reason: gres.reasonCode ?? "GOVERNANCE_DENIED", detail: gres });
      return { ...empty(envelope.causationId), steps, denialReason: gres.reasonCode ?? "GOVERNANCE_DENIED" };
    }
    steps.push({ step: "governance", status: "ok", detail: { decisionId: gres.decisionId, policyVersion: gres.policyVersion } });

    // 4. Execute health transaction.
    let tx;
    try {
      tx = await req.execute();
      steps.push({ step: "health-tx", status: "ok", detail: { resourceId: tx.resourceId } });
    } catch (e: any) {
      steps.push({ step: "health-tx", status: "denied", reason: e.message });
      return { ...empty(envelope.causationId), steps, denialReason: `HEALTH_TX_FAILED: ${e.message}` };
    }

    // 5. Finance event.
    let financeStatus: string | null = null;
    if (req.financeEvent && tx.amount) {
      const fr = await this.fin.emitEvent({
        actor, propagation: baseProp(`finance:${req.financeEvent.type}`),
        eventType: req.financeEvent.type,
        healthResourceType: req.resourceType,
        healthResourceId: tx.resourceId,
        facilityId: envelope.facilityId,
        amount: tx.amount,
      });
      financeStatus = fr.status;
      steps.push({ step: "finance", status: fr.status, detail: { reasonCode: fr.reasonCode } });
    }

    // 6. Tax determination.
    let taxStatus: string | null = null;
    if (req.financeEvent && tx.amount && req.taxCategory !== null) {
      const tr = await this.tax.determine({
        actor, propagation: baseProp("tax"),
        taxableEventType: req.financeEvent.type,
        jurisdiction: envelope.countryCode ?? "TZ",
        entityCode: envelope.entityCode,
        taxpayerReference: null,
        amount: tx.amount,
        taxCategory: req.taxCategory ?? null,
        effectiveDate: envelope.timestamp,
      });
      taxStatus = tr.status;
      steps.push({ step: "tax", status: tr.status, detail: { reasonCode: tr.reasonCode } });
    }

    // 7. AI assistance.
    let aiStatus: string | null = null;
    if (req.aiAssistance) {
      const air = await this.noelia.invoke({
        actor, propagation: baseProp("ai"),
        capability: req.aiAssistance.capability,
        inputRef: `health://${req.resourceType}/${tx.resourceId}`,
        riskLevel: req.riskLevel,
      });
      aiStatus = air.blocked ? "blocked" : (air.approvalStatus === "pending" ? "pending" : "ok");
      steps.push({ step: "ai", status: aiStatus, detail: { outputClass: air.outputClass, failureReason: air.failureReason } });
    }

    const committed = (!req.financeEvent || financeStatus === "accepted")
      && (req.taxCategory === null || req.taxCategory === undefined || taxStatus === "determined");
    return {
      status: committed ? "committed" : (financeStatus === "blocked" || taxStatus === "blocked" ? "blocked" : "pending"),
      envelopeId: envelope.causationId,
      steps,
      resourceId: tx.resourceId,
      financeStatus,
      taxStatus,
      aiStatus,
      denialReason: null,
    };
  }

  private buildActor(envelope: ReturnType<TransactionEnvelopeBuilder["build"]>): CanonicalActorContext {
    const cur = this.tenantCtx.current();
    return {
      globalUserId: envelope.globalUserId,
      email: cur?.email ?? null,
      tenantId: envelope.tenantId,
      entityCode: envelope.entityCode,
      countryCode: envelope.countryCode,
      licenceNumber: envelope.professionalLicenseNumber,
      practitionerId: envelope.practitionerId,
      facilityId: envelope.facilityId,
      sessionId: envelope.sessionId,
      role: cur?.role ?? "doctor",
      permissions: (cur?.permissions as string[]) ?? [],
      timezone: envelope.timezone,
      sourceService: "health-os",
    };
  }
}

function empty(envelopeId: string): ClinicalActionOutcome {
  return {
    status: "denied",
    envelopeId,
    steps: [],
    resourceId: null,
    financeStatus: null,
    taxStatus: null,
    aiStatus: null,
    denialReason: null,
  };
}
