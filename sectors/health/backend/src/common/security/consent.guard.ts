/**
 * @RequiresConsent(purpose, dataCategory) + ConsentGuard.
 *
 * Global APP_GUARD that enforces consent for PHI disclosure/export endpoints.
 * When a handler carries @RequiresConsent, the guard calls ConsentService.assert
 * to verify an active (or legal-obligation/vital-interest/public-task) consent
 * exists for the given patient+purpose+dataCategory.
 *
 * Outcomes:
 *   - Missing patient id in request      → 422 CONSENT_PATIENT_REQUIRED
 *   - Consent not present/withdrawn/expired/refused → 403 CONSENT_DENIED
 *   - Consent granted / legal basis      → request proceeds
 *
 * Emergency/legal exceptions (legal_basis = vital_interest/legal_obligation/
 * public_task) bypass explicit consent but still require a consent-table entry
 * so the decision is audited; the service enforces that.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConsentService } from "../../modules/consent/consent.service";

export const CONSENT_KEY = "consent:requirement";
export interface ConsentRequirement {
  purpose: string;
  dataCategory: string;
  patientIdParam?: string;
}
export const RequiresConsent = (
  purpose: string,
  dataCategory: string,
  patientIdParam: string = "patientId",
) => SetMetadata(CONSENT_KEY, { purpose, dataCategory, patientIdParam });

@Injectable()
export class ConsentGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly consent: ConsentService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = this.reflector.getAllAndOverride<ConsentRequirement | null>(
      CONSENT_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!req) return true;
    const http = ctx.switchToHttp().getRequest();
    const pidKey = req.patientIdParam ?? "patientId";
    const patientId =
      http.params?.[pidKey] ??
      http.query?.[pidKey] ??
      http.body?.[pidKey] ??
      http.params?.patient_id ??
      http.query?.patient_id ??
      http.body?.patient_id ??
      http.params?.patientId ??
      http.query?.patientId ??
      http.body?.patientId ??
      null;
    if (!patientId) {
      throw new UnprocessableEntityException({ code: "CONSENT_PATIENT_REQUIRED" });
    }
    const recipient = http.user?.tenantId ?? null;
    const ok = await this.consent.assert(
      String(patientId),
      req.purpose,
      req.dataCategory,
      recipient ? String(recipient) : undefined,
    );
    if (!ok) {
      throw new ForbiddenException({
        code: "CONSENT_DENIED",
        purpose: req.purpose,
        dataCategory: req.dataCategory,
      });
    }
    return true;
  }
}
