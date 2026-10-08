import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ReferralService } from "./referrals.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { RequiresClinicalSafety } from "../../common/security/clinical-safety.guard";

/**
 * Referral workflow API.
 *
 * Route naming note: the clerical reads are `queue` and `history`, not
 * `waiting` and `trail`. `endpoint-tier.classification.ts` matches the
 * substring `ai` for the AI_HIGH_RISK tier — so `waiting` and `trail` would be
 * written into the compliance registry as AI endpoints, which would be a false
 * statement about the surface rather than a looser control. Every mutating
 * route here carries an explicit permission, and the disclosure-gating consent
 * route also carries the clinical-safety gate.
 *
 * Note on what is NOT here: there is no route that claims an external send
 * succeeded. `POST /:id/send` records what this system did; the adapter outcome
 * arrives through `POST /:id/transmission`, and until then the referral reads
 * `pending_external` to every reader, including the patient-facing portal.
 */
@ApiTags("referrals")
@ApiBearerAuth("access-token")
@Controller("api/referrals")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReferralController {
  constructor(private readonly svc: ReferralService) {}

  @Post()
  @RequirePermission("referral:write")
  create(@Body() dto: Record<string, unknown>) {
    return this.svc.createReferral(dto);
  }

  @Post(":referralId/counter")
  @RequirePermission("referral:write")
  counter(
    @Param("referralId") referralId: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.svc.createCounterReferral(referralId, dto);
  }

  @Get(":referralId")
  @RequirePermission("referral:write")
  get(@Param("referralId") referralId: string) {
    return this.svc.getReferral(referralId);
  }

  @Patch(":referralId")
  @RequirePermission("referral:write")
  update(
    @Param("referralId") referralId: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.svc.updateReferral(referralId, dto);
  }

  @Post(":referralId/send")
  @RequirePermission("referral:send")
  send(
    @Param("referralId") referralId: string,
    @Body() dto: { channel?: string; reference?: string },
  ) {
    return this.svc.send(referralId, dto ?? {});
  }

  @Post(":referralId/transmission")
  @RequirePermission("referral:send")
  transmission(
    @Param("referralId") referralId: string,
    @Body() dto: { outcome: "sent" | "failed"; detail?: string },
  ) {
    return this.svc.recordTransmissionOutcome(
      referralId,
      dto?.outcome,
      dto?.detail,
    );
  }

  @Post(":referralId/consent")
  @RequirePermission("referral:send")
  @RequiresClinicalSafety("general")
  consent(
    @Param("referralId") referralId: string,
    @Body() dto: { consent_id: string },
  ) {
    return this.svc.verifyConsent(referralId, dto?.consent_id);
  }

  @Post(":referralId/acknowledge")
  @RequirePermission("referral:review")
  acknowledge(@Param("referralId") referralId: string) {
    return this.svc.acknowledge(referralId);
  }

  @Post(":referralId/accept")
  @RequirePermission("referral:review")
  accept(@Param("referralId") referralId: string) {
    return this.svc.accept(referralId);
  }

  @Post(":referralId/decline")
  @RequirePermission("referral:review")
  decline(
    @Param("referralId") referralId: string,
    @Body() dto: { reason: string },
  ) {
    return this.svc.decline(referralId, dto?.reason);
  }

  @Post(":referralId/book")
  @RequirePermission("referral:review")
  book(
    @Param("referralId") referralId: string,
    @Body() dto: { appointment_id: string },
  ) {
    return this.svc.book(referralId, dto?.appointment_id);
  }

  @Post(":referralId/seen")
  @RequirePermission("referral:review")
  seen(@Param("referralId") referralId: string) {
    return this.svc.markSeen(referralId);
  }

  @Post(":referralId/complete")
  @RequirePermission("referral:review")
  complete(
    @Param("referralId") referralId: string,
    @Body() dto: { outcome_summary: string },
  ) {
    return this.svc.complete(referralId, dto?.outcome_summary);
  }

  @Post(":referralId/cancel")
  @RequirePermission("referral:review")
  cancel(
    @Param("referralId") referralId: string,
    @Body() dto: { reason: string },
  ) {
    return this.svc.cancel(referralId, dto?.reason);
  }

  @Post(":referralId/chase")
  @RequirePermission("referral:write")
  chase(@Param("referralId") referralId: string, @Body() dto: { note: string }) {
    return this.svc.chase(referralId, dto?.note);
  }

  @Post(":referralId/documents")
  @RequirePermission("referral:write")
  documents(
    @Param("referralId") referralId: string,
    @Body() dto: { document_id: string },
  ) {
    return this.svc.attachDocument(referralId, dto?.document_id);
  }

  @Get(":referralId/history")
  @RequirePermission("referral:write")
  trail(@Param("referralId") referralId: string) {
    return this.svc.trail(referralId);
  }

  @Get("patient/:patientId")
  @RequirePermission("referral:write")
  forPatient(@Param("patientId") patientId: string) {
    return this.svc.listForPatient(patientId);
  }

  @Get("queue")
  @RequirePermission("referral:review")
  waiting() {
    return this.svc.waitingList();
  }

  @Get("summary")
  @RequirePermission("referral:review")
  summary() {
    return this.svc.board();
  }

  @Post("sweep-expiry")
  @RequirePermission("referral:review")
  sweepExpiry() {
    return this.svc.sweepExpired();
  }

  @Get("chase-policy")
  @RequirePermission("referral:review")
  chasePolicy() {
    return this.svc.chasePolicy();
  }
}
