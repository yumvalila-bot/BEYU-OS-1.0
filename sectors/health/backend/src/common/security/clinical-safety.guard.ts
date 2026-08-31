/**
 * @RequiresClinicalSafety(domain) + ClinicalSafetyGuard.
 *
 * Global APP_GUARD. When a handler carries `@RequiresClinicalSafety(domain)`,
 * extracts clinical-safety evidence from the request body and invokes the
 * matching ClinicalSafetyGate before allowing the request through.
 *
 * Outcomes:
 *   - Missing/insufficient evidence → HTTP 422 CLINICAL_SAFETY_BLOCKED
 *   - HCM denies scope                → HTTP 403
 *   - All gates pass                  → request proceeds
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SetMetadata } from "@nestjs/common";
import { ClinicalSafetyGates } from "../../integrations/beyu/shared/clinical-safety.gates";
import { TenantContext } from "./tenant-context";

export const CLINICAL_SAFETY_DOMAIN_KEY = "clinicalsafety:domain";
export const RequiresClinicalSafety = (domain: ClinicalDomain) =>
  SetMetadata(CLINICAL_SAFETY_DOMAIN_KEY, domain);

export type ClinicalDomain = "pharmacy" | "lab" | "radiology" | "ophthalmology" | "dialysis";

@Injectable()
export class ClinicalSafetyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly gates: ClinicalSafetyGates,
    private readonly tenantCtx: TenantContext,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const domain = this.reflector.getAllAndOverride<ClinicalDomain | null>(
      CLINICAL_SAFETY_DOMAIN_KEY, [ctx.getHandler(), ctx.getClass()],
    );
    if (!domain) return true;
    const req = ctx.switchToHttp().getRequest();
    const actor = this.tenantCtx.current();
    const body = req.body ?? {};
    const facilityId = body.facilityId ?? actor?.facilityId ?? null;
    const handler = ctx.getHandler();
    const controller = ctx.getClass();
    const action = `${controller.name}.${handler.name}`;

    const gateInput = (resourceType: string) => ({
      action, facilityId, resourceType, metadata: body.metadata ?? {},
    });
    let result: { allowed: boolean; reason: string | null };

    switch (domain) {
      case "pharmacy":
        result = await this.gates.pharmacyDispense({
          ...gateInput("dispense"),
          prescriptionId: body.prescriptionId ?? "",
          quantity: Number(body.quantity ?? body.qty ?? 0),
          controlledSubstance: Boolean(body.controlledSubstance),
          requiresDualControl: Boolean(body.controlledSubstance),
          secondReviewerGlobalUserId: body.secondReviewerGlobalUserId ?? null,
        });
        break;
      case "lab":
        result = await this.gates.labRelease({
          ...gateInput("lab_result"),
          verifiedByGlobalUserId: body.verifiedByGlobalUserId ?? null,
          qcPassed: Boolean(body.qcPassed),
          specimenIntegrity: Boolean(body.specimenIntegrity),
          analyzerAuthorized: Boolean(body.analyzerAuthorized),
          criticalResult: Boolean(body.criticalResult),
          metadata: { ...(body.metadata ?? {}), criticalCallbackLogged: Boolean(body.criticalCallbackLogged) },
        });
        break;
      case "radiology":
        result = await this.gates.radiologyVerify({
          ...gateInput("radiology_report"),
          verifiedByGlobalUserId: body.verifiedByGlobalUserId ?? null,
          equipmentAuthorized: Boolean(body.equipmentAuthorized),
          radiationSafetyCleared: Boolean(body.radiationSafetyCleared),
          dicomIdentityLinked: Boolean(body.dicomIdentityLinked),
          doseCaptured: Boolean(body.doseCaptured),
          criticalFinding: Boolean(body.criticalFinding),
          metadata: { ...(body.metadata ?? {}), criticalEscalationLogged: Boolean(body.criticalEscalationLogged) },
        });
        break;
      case "ophthalmology":
        result = await this.gates.ophthalmologyDispense({
          ...gateInput("optical_dispense"),
          prescriptionValid: body.prescriptionValid !== false,
          practitionerScopeOk: body.practitionerScopeAuthorized !== false,
          deviceLinked: body.deviceLinked !== false,
          deviceTraceability: body.deviceTraceable !== false,
          dispensingVerified: body.dispensingVerified !== false,
        });
        break;
      case "dialysis":
        result = await this.gates.dialysisTreatment({
          ...gateInput("dialysis_session"),
          machineAuthorized: Boolean(body.machineAuthorized),
          maintenanceCurrent: Boolean(body.maintenanceCurrent ?? body.machineMaintenanceCurrent),
          waterQualityPassed: Boolean(body.waterQualityPassed ?? body.waterQualityCleared),
          patientMatched: Boolean(body.patientIdentityConfirmed ?? body.patientMatched),
          treatmentParamsValid: body.treatmentParamsValid !== false,
          adverseEventOpen: Boolean(body.adverseEvent && !body.adverseEventDocumented),
          consented: Boolean(body.consentObtained ?? body.consented),
        });
        break;
      default:
        result = { allowed: false, reason: `UNKNOWN_DOMAIN:${domain}` };
    }

    if (!result.allowed) {
      const reason = result.reason ?? "CLINICAL_SAFETY_UNKNOWN";
      if (typeof reason === "string" && reason.startsWith("HCM")) {
        throw new ForbiddenException({ code: "CLINICAL_SAFETY_HCM_DENIED", reason });
      }
      throw new UnprocessableEntityException({ code: "CLINICAL_SAFETY_BLOCKED", reason, domain });
    }
    return true;
  }
}
