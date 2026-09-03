/**
 * HCM (Workforce) adapter — canonical source of practitioner/licence truth.
 *
 * Health OS must NEVER fabricate professional licences or promote an
 * unverified/expired/suspended/revoked licence through clinical
 * authorization gates. When HCM is unavailable (EXTERNAL-BLOCKED), the
 * adapter returns a conservative record with licenceState="blocked" or
 * "external_verification_required" so downstream guards fail closed.
 */
import { Injectable, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DbConnection,
  DB_CONNECTION,
} from "../../../modules/identity/db-connection";
import { TenantContext } from "../../../common/security/tenant-context";
import { CircuitBreaker } from "../../../modules/integrations/circuit-breaker";
import { AuditService } from "../../../modules/audit/audit.service";
import { inTx } from "../../../common/db/crud-factory";
import { BeyuBaseAdapter } from "../adapters/beyu-base.adapter";
import type {
  CanonicalActorContext,
  HcmPractitionerQuery,
  HcmPractitionerRecord,
  PractitionerLicenceState,
} from "../contracts/shared.types";

@Injectable()
export class HcmAdapter extends BeyuBaseAdapter {
  protected readonly config = {
    provider: "beyu.hcm",
    endpointEnv: "BEYU_HCM_ENDPOINT",
    credentialEnvs: ["BEYU_HCM_TOKEN"],
    requiredForBoot: false,
    defaultTimeoutMs: 3000,
    maxRetries: 1,
    baseBackoffMs: 200,
  };

  constructor(
    @Inject(DB_CONNECTION) db: DbConnection,
    tenantCtx: TenantContext,
    circuit: CircuitBreaker,
    cfg: ConfigService,
    auditService: AuditService,
  ) {
    super(db, tenantCtx, circuit, cfg, auditService);
  }

  async lookupPractitioner(
    q: HcmPractitionerQuery,
  ): Promise<HcmPractitionerRecord> {
    await this.auditQuery("hcm.practitioner.lookup", q);
    if (this.getState() === "NOT_CONFIGURED") {
      return this.localFallback(q);
    }
    return this.localFallback(q, { externalVerificationRequired: true });
  }

  async authorizeClinicalActor(opts: {
    action: string;
    facilityId: string | null;
    requiredScope?: string[];
  }): Promise<{
    authorized: boolean;
    reason: string | null;
    record: HcmPractitionerRecord;
  }> {
    const actor = this.currentActor();
    // If actor has no valid global_user_id (e.g. malformed/bogus UUID), deny outright
    // without touching the DB — prevents "invalid input syntax for type uuid"
    // from bubbling up as 500.
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (actor.globalUserId && !uuidRegex.test(String(actor.globalUserId))) {
      return {
        authorized: false,
        reason: "HCM_INVALID_GLOBAL_USER_ID",
        record: this.bogusRecord(actor),
      };
    }
    let rec: HcmPractitionerRecord;
    try {
      rec = await this.lookupPractitioner({
        actor,
        propagation: this.propagation(),
        globalUserId: actor.globalUserId,
        practitionerId: actor.practitionerId,
        licenceNumber: actor.licenceNumber,
      });
    } catch {
      return {
        authorized: false,
        reason: "HCM_LOOKUP_FAILED",
        record: this.bogusRecord(actor),
      };
    }

    // Fail closed when HCM is required but cannot verify licence / employment.
    // The ONLY exception is HTTP E2E/integration test harnesses that set
    // BEYU_HCM_BYPASS_FOR_TEST=true — never honored in the presence of a real
    // BEYU_HCM_ENDPOINT, and never honored when NODE_ENV=production (structural
    // refusal in addition to the boot-validation gate: production deployments
    // MUST configure BEYU_HCM_ENDPOINT or rely on the local practitioner
    // registry; a test flag can never strip clinical-safety enforcement).
    const hcmEndpointConfigured = !!process.env.BEYU_HCM_ENDPOINT;
    const testBypassAllowed =
      process.env.BEYU_HCM_BYPASS_FOR_TEST === "true" &&
      !hcmEndpointConfigured &&
      process.env.NODE_ENV !== "production";
    if (rec.externalVerificationRequired && this.highRiskAction(opts.action)) {
      return {
        authorized: false,
        reason: "HCM_EXTERNAL_VERIFICATION_REQUIRED",
        record: rec,
      };
    }
    if (rec.licenceState !== "verified") {
      if (!testBypassAllowed) {
        return {
          authorized: false,
          reason: `HCM_LICENCE_${rec.licenceState.toUpperCase()}`,
          record: rec,
        };
      }
    }
    if (rec.employmentStatus !== "active") {
      if (!testBypassAllowed) {
        return {
          authorized: false,
          reason: `HCM_EMPLOYMENT_${rec.employmentStatus.toUpperCase()}`,
          record: rec,
        };
      }
    }
    if (
      opts.facilityId &&
      rec.facilityIds.length &&
      !rec.facilityIds.includes(opts.facilityId)
    ) {
      return {
        authorized: false,
        reason: "HCM_FACILITY_CROSSOVER",
        record: rec,
      };
    }
    if (opts.requiredScope && opts.requiredScope.length) {
      const ok = testBypassAllowed
        ? true
        : rec.scopeOfPractice.length > 0 &&
          opts.requiredScope.every((s) => rec.scopeOfPractice.includes(s));
      if (!ok)
        return {
          authorized: false,
          reason: "HCM_SCOPE_INSUFFICIENT",
          record: rec,
        };
    }
    if (testBypassAllowed) {
      rec.externalVerificationRequired = true;
      rec.credentialStatus = "unverified";
      return {
        authorized: true,
        reason: "HCM_EXTERNAL_BYPASS_TEST_ONLY",
        record: rec,
      };
    }
    return { authorized: true, reason: null, record: rec };
  }

  /* -------- local fallback -------- */

  private async localFallback(
    q: HcmPractitionerQuery,
    flags: { externalVerificationRequired?: boolean } = {},
  ): Promise<HcmPractitionerRecord> {
    const rows = await this.db.query<any>(
      `SELECT practitioner_id, global_user_id, license_number, licensing_authority,
              license_status, scope_of_practice, cadre, department,
              facility_ids, employment_status, cpd_status,
              supervisor_global_user_id, employment_start, employment_end
         FROM health.practitioners
        WHERE ($1::uuid IS NULL OR global_user_id = $1::uuid)
          AND ($2::text IS NULL OR practitioner_id::text = $2)
          AND ($3::text IS NULL OR license_number = $3)
        LIMIT 1`,
      [
        q.globalUserId ?? null,
        q.practitionerId ?? null,
        q.licenceNumber ?? null,
      ],
    );
    const r = rows[0];
    // Map license_status to PractitionerLicenceState (existing values:
    // unverified | verified_pending | verified | expired | suspended |
    // revoked | external_verification_required).
    let licenceState: PractitionerLicenceState =
      (r?.license_status as PractitionerLicenceState) ?? "blocked";
    if (r && r.license_status === "verified_pending")
      licenceState = "unverified";
    // When no record found and the caller did not provide a licence number,
    // we cannot assume licensure -> blocked.
    if (!r && !q.licenceNumber) licenceState = "blocked";
    else if (!r && q.licenceNumber)
      licenceState = "external_verification_required";

    return {
      globalUserId: r?.global_user_id ?? q.globalUserId ?? null,
      practitionerId: r?.practitioner_id ?? q.practitionerId ?? null,
      employmentStatus: (r?.employment_status as any) ?? "unknown",
      facilityIds: Array.isArray(r?.facility_ids) ? r.facility_ids : [],
      department: r?.department ?? null,
      ward: null,
      role: r?.cadre ?? q.actor.role ?? null,
      professionalCategory: r?.cadre ?? null,
      licenceNumber: r?.license_number ?? q.licenceNumber ?? null,
      licensingAuthority: r?.licensing_authority ?? null,
      licenceState,
      scopeOfPractice: Array.isArray(r?.scope_of_practice)
        ? r.scope_of_practice
        : [],
      credentialStatus:
        r?.license_status === "verified" ? "verified" : "unverified",
      cpdStatus: (r?.cpd_status as any) ?? "unknown",
      supervisorGlobalUserId: r?.supervisor_global_user_id ?? null,
      employmentStart: r?.employment_start
        ? new Date(r.employment_start).toISOString()
        : null,
      employmentEnd: r?.employment_end
        ? new Date(r.employment_end).toISOString()
        : null,
      externalVerificationRequired:
        flags.externalVerificationRequired === true ||
        licenceState === "external_verification_required",
    };
  }

  private bogusRecord(actor: CanonicalActorContext): HcmPractitionerRecord {
    return {
      globalUserId: actor.globalUserId ?? null,
      practitionerId: null,
      employmentStatus: "unknown",
      facilityIds: [],
      department: null,
      ward: null,
      role: actor.role ?? null,
      professionalCategory: null,
      licenceNumber: null,
      licensingAuthority: null,
      licenceState: "blocked",
      scopeOfPractice: [],
      credentialStatus: "unverified",
      cpdStatus: "unknown",
      supervisorGlobalUserId: null,
      employmentStart: null,
      employmentEnd: null,
      externalVerificationRequired: true,
    };
  }

  private highRiskAction(action: string): boolean {
    return /^pharmacy\.dispense\.controlled|lab\.critical_result|radiology\.critical|prescription\.controlled|surgery|anesthesia|governance\.override|legal_hold|billing\.finalize/i.test(
      action,
    );
  }

  private async auditQuery(op: string, q: HcmPractitionerQuery): Promise<void> {
    try {
      await inTx(this.db, this.tenantCtx, (tx) =>
        this.auditService.record(tx, {
          operation: op,
          resourceType: "hcm",
          resourceId: null,
          metadata: {
            requestedGlobalUserId: q.globalUserId,
            requestedPractitionerId: q.practitionerId,
            // Never store the licence value itself — only whether one was
            // supplied. This redaction is the privacy control for this record.
            requestedLicence: q.licenceNumber ? "__REDACTED__" : null,
            propagationCorrelationId: q.propagation?.correlationId ?? null,
          },
          authDecision: "allowed",
          resultStatus: "ok",
          sourceService: "health-api",
        }),
      );
    } catch (e) {
      // Best-effort, deliberately: a practitioner lookup must still return its
      // fail-closed result. The mandatory pre-call gate for any outbound
      // dispatch is the health.beyu_outbox row execute() writes before the
      // call. The failure is never silent.
      this.logger.error(
        `hcm audit write failed for operation '${op}': ` + (e as Error).message,
      );
    }
  }
}
