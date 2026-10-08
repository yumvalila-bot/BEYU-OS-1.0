import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { InsuranceService } from "./insurance.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { RequiresMfaStepUp } from "../../common/security/mfa-stepup.guard";
import { RequiresGovernance } from "../../integrations/beyu/guards/governance-authorization.guard";

/**
 * Payer cover, eligibility, pre-authorisation and claim reconciliation.
 *
 * Submission honesty is the point of this controller: a claim is only
 * `submitted` when the caller presents the payer's receipt, and a remittance is
 * only `posted_to_finance` when it names the finance payment it reconciles to.
 * Everything else is recorded as pending with the reason, so the revenue cycle
 * queue reflects what the hospital is actually waiting for.
 */
@ApiTags("insurance")
@ApiBearerAuth("access-token")
@Controller("api/insurance")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InsuranceController {
  constructor(private readonly svc: InsuranceService) {}

  // ── cover on file ───────────────────────────────────────────────────────────
  @Post("profiles")
  @RequirePermission("insurance:write")
  register(@Body() dto: Record<string, unknown>) {
    return this.svc.registerProfile(dto);
  }

  @Get("profiles/owner/:patientId")
  @RequirePermission("insurance:read")
  forPatient(@Param("patientId", ParseUUIDPipe) patientId: string) {
    return this.svc.profilesForPatient(patientId);
  }

  @Post("profiles/:profileId/verify")
  @RequirePermission("insurance:write")
  @RequiresMfaStepUp("insurance:write")
  verify(
    @Param("profileId", ParseUUIDPipe) profileId: string,
    @Body()
    dto: { evidence: string; outcome?: "verified" | "verification_failed" },
  ) {
    return this.svc.verifyProfile(profileId, dto);
  }

  @Post("profiles/:profileId/benefits")
  @RequirePermission("insurance:write")
  benefits(
    @Param("profileId", ParseUUIDPipe) profileId: string,
    @Body()
    dto: { annual_used?: number; deductible_used?: number; note: string },
  ) {
    return this.svc.recordBenefitUsage(profileId, dto);
  }

  // ── eligibility ───────────────────────────────────────────────────────────────
  @Post("profiles/:profileId/eligibility")
  @RequirePermission("insurance:read")
  runCheck(@Param("profileId", ParseUUIDPipe) profileId: string) {
    return this.svc.runEligibilityCheck(profileId);
  }

  @Post("profiles/:profileId/eligibility/record")
  @RequirePermission("insurance:write")
  recordCheck(
    @Param("profileId", ParseUUIDPipe) profileId: string,
    @Body()
    dto: {
      result: "eligible" | "partially_eligible" | "ineligible";
      source: "external_api" | "document";
      response_summary?: unknown;
      valid_until?: string;
      denial_reason?: string;
      idempotency_key?: string;
    },
  ) {
    return this.svc.recordEligibilityResult(profileId, dto.result, dto);
  }

  @Get("profiles/:profileId/eligibility/latest")
  @RequirePermission("insurance:read")
  latestCheck(@Param("profileId", ParseUUIDPipe) profileId: string) {
    return this.svc.latestEligibility(profileId);
  }

  // ── pre-authorisation ───────────────────────────────────────────────────────
  @Post("preauth")
  @RequirePermission("preauth:write")
  request(@Body() dto: Record<string, unknown>) {
    return this.svc.requestPreauth(dto);
  }

  @Get("preauth/queue")
  @RequirePermission("insurance:read")
  queue() {
    return this.svc.preauthQueue();
  }

  @Post("preauth/:preauthId/decide")
  @RequirePermission("preauth:write")
  @RequiresGovernance("insurance.preauth.decide", "medium")
  decide(
    @Param("preauthId", ParseUUIDPipe) preauthId: string,
    @Body()
    dto: {
      decision:
        "approved" | "partially_approved" | "denied" | "expired" | "cancelled";
      authorization_number?: string;
      approved_amount?: number;
      denial_reason?: string;
      valid_until?: string;
    },
  ) {
    return this.svc.decidePreauth(preauthId, dto?.decision, dto);
  }

  @Post("preauth/sweep-expiry")
  @RequirePermission("insurance:write")
  sweep() {
    return this.svc.sweepExpiredPreauths();
  }

  // ── claims ──────────────────────────────────────────────────────────────────
  @Post("claims/from-invoice/:invoiceId")
  @RequirePermission("claim:submit")
  @RequiresGovernance("insurance.claim.generate", "medium")
  generate(
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
    @Body()
    dto: { profile_id: string; preauth_id?: string; eligibility_id?: string },
  ) {
    return this.svc.createClaimFromInvoice(invoiceId, dto);
  }

  @Get("claims/:claimId")
  @RequirePermission("claim:read")
  ledger(@Param("claimId", ParseUUIDPipe) claimId: string) {
    return this.svc.claimLedger(claimId);
  }

  @Get("claims/:claimId/lines")
  @RequirePermission("claim:read")
  lines(@Param("claimId", ParseUUIDPipe) claimId: string) {
    return this.svc.claimLines(claimId);
  }

  @Post("claims/:claimId/ready")
  @RequirePermission("claim:submit")
  ready(
    @Param("claimId", ParseUUIDPipe) claimId: string,
    @Body() dto: { due_submission_date?: string },
  ) {
    return this.svc.readyClaim(claimId, dto?.due_submission_date);
  }

  @Post("claims/:claimId/submit")
  @RequirePermission("claim:submit")
  @RequiresMfaStepUp("claim:submit")
  @RequiresGovernance("insurance.claim.submit", "high")
  submit(
    @Param("claimId", ParseUUIDPipe) claimId: string,
    @Body() dto?: { external_reference: string; submitted_at?: string },
  ) {
    return this.svc.submitClaim(
      claimId,
      dto?.external_reference ? dto : undefined,
    );
  }

  @Post("claims/:claimId/reject")
  @RequirePermission("claim:reconcile")
  reject(
    @Param("claimId", ParseUUIDPipe) claimId: string,
    @Body() dto: { reason: string },
  ) {
    return this.svc.rejectClaim(claimId, dto?.reason);
  }

  @Post("claims/:claimId/resubmit")
  @RequirePermission("claim:submit")
  @RequiresGovernance("insurance.claim.resubmit", "medium")
  resubmit(
    @Param("claimId", ParseUUIDPipe) claimId: string,
    @Body() dto: { reason: string },
  ) {
    return this.svc.resubmitClaim(claimId, dto?.reason);
  }

  // ── remittances ─────────────────────────────────────────────────────────────
  @Post("claims/:claimId/remittances")
  @RequirePermission("claim:reconcile")
  @RequiresMfaStepUp("claim:reconcile")
  @RequiresGovernance("insurance.remittance.post", "high")
  remit(
    @Param("claimId", ParseUUIDPipe) claimId: string,
    @Body() dto: Parameters<InsuranceService["recordRemittance"]>[1],
  ) {
    return this.svc.recordRemittance(claimId, dto);
  }

  // ── reporting ───────────────────────────────────────────────────────────────
  @Get("reporting/outstanding")
  @RequirePermission("claim:read")
  outstanding() {
    return this.svc.outstandingReport();
  }

  @Get("reporting/filing-window")
  @RequirePermission("claim:read")
  filingWindow(@Query("days") days?: string) {
    return this.svc.filingDeadlineWatch(days ? Number(days) : undefined);
  }
}
