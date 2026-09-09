/**
 * NHIF (National Health Insurance Fund, Tanzania) adapter.
 *
 * OFFICIAL CONTRACT (verified discovery evidence, docs/integrations registry):
 *   NHIF publishes a facility-integration REST/JSON API:
 *     token:        https://verification.nhif.or.tz/nhifservice/Token/
 *     verification: .../nhifservice/breeze/verification/* (card/eligibility,
 *                   AuthorizeCard, referral, reference-number status)
 *     claims:       https://verification.nhif.or.tz/claimsserver/api/v1/Claims/SubmitFolios
 *     reconcile:    .../claimsServer/api/v1/claims/getSubmittedClaims
 *   Authentication: per-facility username/password exchanged for a bearer
 *   token. NHIF issues facility credentials during onboarding — an EXTERNAL
 *   prerequisite. Each credential is bound to ONE facility: the gateway's
 *   tenant scoping guarantees one tenant/facility can never ride another
 *   tenant's NHIF authority (per-tenant credential refs).
 *
 * FAIL-CLOSED: a claim is never CLAIM_ACCEPTED unless NHIF's actual response
 * confirms receipt; without credentials everything is EXTERNAL_BLOCKED.
 */
import { z } from "zod";
import {
  GovernmentAdapterError,
  type AdapterCallOptions,
  type AdapterConfigReport,
  type AdapterSubmitResult,
  type AdapterVerifyResult,
  type GovernmentAdapter,
  type GovernmentIntegrationStatus,
} from "../adapter";

export const NHIF_CREDENTIAL_REFS = [
  "BEYU_NHIF_BASE_URL",
  "BEYU_NHIF_FACILITY_CODE",
  "BEYU_NHIF_USERNAME_REF",
  "BEYU_NHIF_PASSWORD_REF",
] as const;

const folioItemSchema = z.object({
  itemCode: z.string().min(1).max(32),
  itemQuantity: z.number().positive(),
  unitPriceMinor: z.number().int().nonnegative(),
  amountClaimedMinor: z.number().int().nonnegative(),
});

export const nhifClaimFolioSchema = z.object({
  kind: z.literal("NHIF_CLAIM_FOLIO"),
  cardNo: z.string().min(4).max(20),
  authorizationNo: z.string().max(32).optional(),
  attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  patientFileNo: z.string().min(1).max(32),
  practitionerNo: z.string().min(1).max(32),
  items: z.array(folioItemSchema).min(1),
  amountClaimedMinor: z.number().int().nonnegative(),
});

export class NhifAdapter implements GovernmentAdapter {
  readonly agencyCode = "NHIF";
  readonly displayName = "National Health Insurance Fund — facility integration";
  readonly isMock = false;
  readonly adapterVersion = "gov-nhif-1.0.0";
  readonly submitSchema = nhifClaimFolioSchema;

  validateConfiguration(): AdapterConfigReport {
    const missing = NHIF_CREDENTIAL_REFS.filter((name) => !process.env[name]);
    return {
      configured: missing.length === 0,
      missing: [...missing],
      environment: missing.length > 0 ? "UNCONFIGURED" : "UAT",
    };
  }

  status(): GovernmentIntegrationStatus {
    return this.validateConfiguration().configured ? "SANDBOX_READY" : "EXTERNAL_BLOCKED";
  }

  /** Card/eligibility verification (breeze verification API). */
  async verify(subject: Record<string, string>, _opts: AdapterCallOptions): Promise<AdapterVerifyResult> {
    if (!subject.cardNo) {
      throw new GovernmentAdapterError("INVALID_PAYLOAD", "NHIF verification requires cardNo.");
    }
    const config = this.validateConfiguration();
    if (!config.configured) return { outcome: "EXTERNAL_BLOCKED", missing: config.missing };
    return {
      outcome: "EXTERNAL_UNAVAILABLE",
      detail: "NHIF live verification requires activation on an authorized facility environment (runbook docs/integrations/runbooks/NHIF.md).",
    };
  }

  async submit(payload: unknown, _opts: AdapterCallOptions): Promise<AdapterSubmitResult> {
    const parsed = nhifClaimFolioSchema.safeParse(payload);
    if (!parsed.success) {
      throw new GovernmentAdapterError("INVALID_PAYLOAD", "Payload does not satisfy the NHIF folio contract.");
    }
    const config = this.validateConfiguration();
    if (!config.configured) return { outcome: "EXTERNAL_BLOCKED", missing: config.missing };
    return {
      outcome: "EXTERNAL_UNAVAILABLE",
      detail: "NHIF live claim submission requires activation on an authorized facility environment (runbook docs/integrations/runbooks/NHIF.md).",
    };
  }
}
