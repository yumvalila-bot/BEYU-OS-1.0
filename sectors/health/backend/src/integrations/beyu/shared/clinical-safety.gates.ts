/**
 * Clinical safety gates — shared validation for high-risk clinical actions.
 *
 * Each gate returns Promise<{ allowed: boolean; reason: string | null }>.
 * Gates compose with HcmAuthorizationGuard + GovernanceAuthorizationGuard.
 * Fail-closed: any missing/invalid field ⇒ allowed=false. Never fabricates
 * controlled-substance authorizations, critical-result callbacks, radiation
 * safety, dialysis water-quality, or optical device verification.
 */
import { Injectable } from "@nestjs/common";
import { TenantContext } from "../../../common/security/tenant-context";
import type { CanonicalActorContext } from "../contracts/shared.types";
import { HcmAdapter } from "../hcm/hcm.adapter";

export interface SafetyGateInput {
  action: string;
  resourceType: string;
  facilityId: string | null;
  metadata?: Record<string, unknown>;
}

export interface SafetyGateResult {
  allowed: boolean;
  reason: string | null;
  failedGate: string | null;
}

@Injectable()
export class ClinicalSafetyGates {
  constructor(
    private readonly tenantCtx: TenantContext,
    private readonly hcm: HcmAdapter,
  ) {}

  async pharmacyDispense(input: SafetyGateInput & {
    controlledSubstance?: boolean;
    prescriptionId: string;
    quantity: number;
    requiresDualControl?: boolean;
    secondReviewerGlobalUserId?: string | null;
  }): Promise<SafetyGateResult> {
    const scope = ["rx:dispense", ...(input.controlledSubstance ? ["rx:controlled"] : [])];
    const hcmRes = await this.hcm.authorizeClinicalActor({
      action: input.action,
      facilityId: input.facilityId,
      requiredScope: scope,
    });
    if (!hcmRes.authorized) return deny("HCM", hcmRes.reason ?? "HCM_DENIED");
    if (input.controlledSubstance && input.requiresDualControl && !input.secondReviewerGlobalUserId) {
      return deny("DUAL_CONTROL", "DUAL_CONTROL_REQUIRED_FOR_CONTROLLED_SUBSTANCE");
    }
    if (input.quantity <= 0) return deny("QUANTITY", "INVALID_QUANTITY");
    return allow();
  }

  async labRelease(input: SafetyGateInput & {
    criticalResult?: boolean;
    qcPassed?: boolean;
    specimenIntegrity?: boolean;
    analyzerAuthorized?: boolean;
    verifiedByGlobalUserId?: string | null;
  }): Promise<SafetyGateResult> {
    const scope = ["order:lab", "lab:verify"];
    const hcmRes = await this.hcm.authorizeClinicalActor({
      action: input.action, facilityId: input.facilityId, requiredScope: scope,
    });
    if (!hcmRes.authorized) return deny("HCM", hcmRes.reason ?? "HCM_DENIED");
    if (!input.specimenIntegrity) return deny("SPECIMEN", "SPECIMEN_INTEGRITY_FAILED");
    if (!input.analyzerAuthorized) return deny("ANALYZER", "ANALYZER_NOT_AUTHORIZED");
    if (!input.qcPassed) return deny("QC", "QC_NOT_PASSED");
    if (!input.verifiedByGlobalUserId) return deny("VERIFICATION", "LAB_RESULT_VERIFICATION_REQUIRED");
    if (input.criticalResult && !input.metadata?.criticalCallbackLogged) {
      return deny("CRITICAL_CALLBACK", "CRITICAL_RESULT_CALLBACK_REQUIRED");
    }
    return allow();
  }

  async radiologyVerify(input: SafetyGateInput & {
    equipmentAuthorized?: boolean;
    radiationSafetyCleared?: boolean;
    dicomIdentityLinked?: boolean;
    doseCaptured?: boolean;
    verifiedByGlobalUserId?: string | null;
    criticalFinding?: boolean;
  }): Promise<SafetyGateResult> {
    const hcmRes = await this.hcm.authorizeClinicalActor({
      action: input.action, facilityId: input.facilityId,
      requiredScope: ["order:imaging", "radiology:verify"],
    });
    if (!hcmRes.authorized) return deny("HCM", hcmRes.reason ?? "HCM_DENIED");
    if (!input.equipmentAuthorized) return deny("EQUIPMENT", "EQUIPMENT_NOT_AUTHORIZED");
    if (!input.radiationSafetyCleared) return deny("RADIATION", "RADIATION_SAFETY_NOT_CLEARED");
    if (!input.dicomIdentityLinked) return deny("DICOM", "DICOM_PATIENT_IDENTITY_NOT_LINKED");
    if (!input.doseCaptured) return deny("DOSE", "RADIATION_DOSE_NOT_CAPTURED");
    if (!input.verifiedByGlobalUserId) return deny("VERIFICATION", "RADIOLOGY_REPORT_VERIFICATION_REQUIRED");
    if (input.criticalFinding && !input.metadata?.criticalEscalationLogged) {
      return deny("CRITICAL_ESCALATION", "CRITICAL_FINDING_ESCALATION_REQUIRED");
    }
    return allow();
  }

  async ophthalmologyDispense(input: SafetyGateInput & {
    prescriptionValid?: boolean;
    practitionerScopeOk?: boolean;
    deviceLinked?: boolean;
    deviceTraceability?: boolean;
    dispensingVerified?: boolean;
  }): Promise<SafetyGateResult> {
    const hcmRes = await this.hcm.authorizeClinicalActor({
      action: input.action, facilityId: input.facilityId, requiredScope: ["optical:dispense"],
    });
    if (!hcmRes.authorized) return deny("HCM", hcmRes.reason ?? "HCM_DENIED");
    if (!input.prescriptionValid) return deny("RX", "OPTICAL_PRESCRIPTION_INVALID");
    if (!input.practitionerScopeOk) return deny("SCOPE", "PRACTITIONER_SCOPE_INSUFFICIENT");
    if (!input.deviceLinked) return deny("DEVICE", "OPTICAL_DEVICE_NOT_LINKED");
    if (!input.deviceTraceability) return deny("TRACEABILITY", "MEDICAL_DEVICE_TRACEABILITY_REQUIRED");
    if (!input.dispensingVerified) return deny("DISPENSE", "OPTICAL_DISPENSING_VERIFICATION_REQUIRED");
    return allow();
  }

  async dialysisTreatment(input: SafetyGateInput & {
    machineAuthorized?: boolean;
    maintenanceCurrent?: boolean;
    waterQualityPassed?: boolean;
    patientMatched?: boolean;
    treatmentParamsValid?: boolean;
    adverseEventOpen?: boolean;
    consented?: boolean;
  }): Promise<SafetyGateResult> {
    const hcmRes = await this.hcm.authorizeClinicalActor({
      action: input.action, facilityId: input.facilityId, requiredScope: ["dialysis:treat"],
    });
    if (!hcmRes.authorized) return deny("HCM", hcmRes.reason ?? "HCM_DENIED");
    if (!input.machineAuthorized) return deny("MACHINE", "DIALYSIS_MACHINE_NOT_AUTHORIZED");
    if (!input.maintenanceCurrent) return deny("MAINTENANCE", "DIALYSIS_MACHINE_MAINTENANCE_OVERDUE");
    if (!input.waterQualityPassed) return deny("WATER", "DIALYSIS_WATER_QUALITY_FAILED");
    if (!input.patientMatched) return deny("PATIENT", "PATIENT_IDENTITY_MISMATCH");
    if (!input.treatmentParamsValid) return deny("PARAMS", "INVALID_TREATMENT_PARAMETERS");
    if (input.adverseEventOpen) return deny("ADVERSE", "OPEN_ADVERSE_EVENT_MUST_BE_RESOLVED");
    if (!input.consented) return deny("CONSENT", "PATIENT_CONSENT_REQUIRED");
    return allow();
  }

  private current(): CanonicalActorContext {
    const a = this.tenantCtx.current();
    if (!a) throw new Error("NO_ACTOR");
    return {
      globalUserId: a.globalUserId ?? a.userId, email: a.email ?? null,
      tenantId: a.tenantId, entityCode: a.entityCode ?? null, countryCode: a.countryCode ?? null,
      licenceNumber: a.licenceNumber ?? null, practitionerId: a.practitionerId ?? null,
      facilityId: a.facilityId ?? null, sessionId: a.sessionId ?? null, role: a.role,
      permissions: a.permissions ?? [], timezone: a.timezone ?? null, sourceService: "health-os",
    };
  }
}

function deny(gate: string, reason: string): SafetyGateResult {
  return { allowed: false, reason, failedGate: gate };
}
function allow(): SafetyGateResult {
  return { allowed: true, reason: null, failedGate: null };
}
