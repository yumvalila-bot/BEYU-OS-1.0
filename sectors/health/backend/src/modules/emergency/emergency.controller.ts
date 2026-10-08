import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { EmergencyService } from "./emergency.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { RequiresClinicalSafety } from "../../common/security/clinical-safety.guard";
import { RequireHcmPractitioner } from "../../integrations/beyu/guards/hcm-authorization.guard";

/**
 * Emergency operations HTTP surface.
 *
 * PATH NAMING IS A SECURITY DECISION HERE, NOT A COSMETIC ONE.
 * `endpoint-tier.classification.ts` routes any path containing `triage` to the
 * AI_HIGH_RISK tier, whose controls are built for model invocation (human
 * approval of an output, MFA step-up per call, governance kill-switch). A
 * nurse recording a triage assessment is not invoking a model; making her clear
 * an MFA step-up for every assessment would push her to record less, which is
 * worse for safety than the control it buys. So the human acts live under
 * `api/emergency/clinical/*`, which the same classifier routes to the CLINICAL
 * tier — practitioner identity, verified licence, scope of practice,
 * clinical-safety gate, idempotency and mandatory audit. The AI controls stay
 * where they belong, on `api/noelia/*`.
 */
@ApiTags("emergency")
@ApiBearerAuth("access-token")
@Controller("api/emergency")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmergencyController {
  constructor(private readonly svc: EmergencyService) {}

  // ── triage (CLINICAL) ───────────────────────────────────────────────────────
  @Post("clinical/assessments")
  @RequirePermission("triage:write")
  @RequireHcmPractitioner("emergency.triage.assess", {
    scope: ["clinical:write", "emergency:triage"],
  })
  @RequiresClinicalSafety("general")
  assess(@Body() dto: Record<string, unknown>) {
    return this.svc.assess(dto);
  }

  @Post("clinical/assessments/:assessmentId/reassess")
  @RequirePermission("triage:write")
  @RequireHcmPractitioner("emergency.triage.reassess", {
    scope: ["clinical:write", "emergency:triage"],
  })
  @RequiresClinicalSafety("general")
  reassess(
    @Param("assessmentId") assessmentId: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.svc.reassess(assessmentId, dto);
  }

  @Post("clinical/assessments/:assessmentId/disposition")
  @RequirePermission("triage:write")
  @RequireHcmPractitioner("emergency.triage.disposition", {
    scope: ["clinical:write", "emergency:triage"],
  })
  @RequiresClinicalSafety("general")
  disposition(
    @Param("assessmentId") assessmentId: string,
    @Body() dto: { outcome_action: string },
  ) {
    return this.svc.dispose(assessmentId, dto?.outcome_action);
  }

  @Get("clinical/assessments/encounter/:encounterId")
  @RequirePermission("triage:read")
  timeline(@Param("encounterId") encounterId: string) {
    return this.svc.assessmentTimeline(encounterId);
  }

  // ── department flow (reads) ─────────────────────────────────────────────────
  @Get("queue")
  @RequirePermission("triage:read")
  waiting() {
    return this.svc.waitingList();
  }

  @Get("reassessments/overdue")
  @RequirePermission("triage:read")
  overdueReassessments() {
    return this.svc.overdueReassessments();
  }

  // ── escalations ─────────────────────────────────────────────────────────────
  @Post("clinical/escalations")
  @RequirePermission("escalation:raise")
  @RequiresClinicalSafety("general")
  raise(@Body() dto: Record<string, unknown>) {
    return this.svc.raiseEscalation(dto);
  }

  @Get("escalations/open")
  @RequirePermission("escalation:respond")
  open() {
    return this.svc.openEscalations();
  }

  @Get("escalation-targets")
  @RequirePermission("escalation:raise")
  escalationTargets() {
    return this.svc.escalationTargets();
  }

  @Post("clinical/escalations/:escalationId/acknowledge")
  @RequirePermission("escalation:respond")
  @RequiresClinicalSafety("general")
  acknowledge(@Param("escalationId") escalationId: string) {
    return this.svc.acknowledgeEscalation(escalationId);
  }

  @Post("clinical/escalations/:escalationId/action")
  @RequirePermission("escalation:respond")
  @RequiresClinicalSafety("general")
  action(
    @Param("escalationId") escalationId: string,
    @Body() dto: { note: string },
  ) {
    return this.svc.actionEscalation(escalationId, dto?.note);
  }

  @Post("clinical/escalations/:escalationId/resolve")
  @RequirePermission("escalation:respond")
  @RequiresClinicalSafety("general")
  resolve(
    @Param("escalationId") escalationId: string,
    @Body() dto: { note: string },
  ) {
    return this.svc.resolveEscalation(escalationId, dto?.note);
  }

  @Post("clinical/escalations/:escalationId/cancel")
  @RequirePermission("escalation:respond")
  @RequiresClinicalSafety("general")
  cancel(
    @Param("escalationId") escalationId: string,
    @Body() dto: { note: string },
  ) {
    return this.svc.cancelEscalation(escalationId, dto?.note);
  }

  // ── handovers (SBAR) ────────────────────────────────────────────────────────
  @Post("clinical/handovers")
  @RequirePermission("handover:write")
  @RequiresClinicalSafety("general")
  createHandover(@Body() dto: Record<string, unknown>) {
    return this.svc.createHandover(dto);
  }

  @Post("clinical/handovers/:handoverId/accept")
  @RequirePermission("handover:accept")
  @RequiresClinicalSafety("general")
  accept(@Param("handoverId") handoverId: string) {
    return this.svc.acceptHandover(handoverId);
  }

  @Post("clinical/handovers/:handoverId/decline")
  @RequirePermission("handover:accept")
  @RequiresClinicalSafety("general")
  decline(
    @Param("handoverId") handoverId: string,
    @Body() dto: { reason: string },
  ) {
    return this.svc.declineHandover(handoverId, dto?.reason);
  }

  @Post("clinical/handovers/:handoverId/supersede")
  @RequirePermission("handover:write")
  @RequiresClinicalSafety("general")
  supersede(
    @Param("handoverId") handoverId: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.svc.supersedeHandover(handoverId, dto);
  }

  @Get("handovers/pending")
  @RequirePermission("handover:read")
  pendingHandovers(@Query("ward_id") wardId?: string) {
    return this.svc.handoversForWard(wardId);
  }

  // ── resuscitation records ───────────────────────────────────────────────────
  @Post("clinical/resus")
  @RequirePermission("resus:document")
  @RequireHcmPractitioner("emergency.resus.start", {
    scope: ["clinical:write", "emergency:resus"],
  })
  @RequiresClinicalSafety("general")
  startResus(@Body() dto: Record<string, unknown>) {
    return this.svc.startResus(dto);
  }

  @Post("clinical/resus/:recordId/note")
  @RequirePermission("resus:document")
  @RequiresClinicalSafety("general")
  note(@Param("recordId") recordId: string, @Body() dto: { note: string }) {
    return this.svc.noteResus(recordId, dto?.note);
  }

  @Post("clinical/resus/:recordId/shock")
  @RequirePermission("resus:document")
  @RequiresClinicalSafety("general")
  shock(@Param("recordId") recordId: string, @Body() dto: { count?: number }) {
    return this.svc.recordShocks(recordId, dto?.count ?? 1);
  }

  @Post("clinical/resus/:recordId/epinephrine")
  @RequirePermission("resus:document")
  @RequiresClinicalSafety("general")
  epinephrine(
    @Param("recordId") recordId: string,
    @Body() dto: { count?: number },
  ) {
    return this.svc.recordEpinephrine(recordId, dto?.count ?? 1);
  }

  @Post("clinical/resus/:recordId/close")
  @RequirePermission("resus:document")
  @RequiresClinicalSafety("general")
  close(
    @Param("recordId") recordId: string,
    @Body()
    dto: { outcome: string; ended_at?: string; reversible_causes?: string },
  ) {
    return this.svc.closeResus(recordId, dto?.outcome, {
      ended_at: dto?.ended_at,
      reversible_causes: dto?.reversible_causes,
    });
  }

  @Post("clinical/resus/:recordId/attest")
  @RequirePermission("careplan:sign")
  @RequireHcmPractitioner("emergency.resus.sign", {
    scope: ["clinical:write", "emergency:resus"],
  })
  @RequiresClinicalSafety("general")
  attest(@Param("recordId") recordId: string) {
    return this.svc.signResus(recordId);
  }

  @Patch("clinical/resus/:recordId")
  @RequirePermission("resus:document")
  @RequiresClinicalSafety("general")
  updateResus(
    @Param("recordId") recordId: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.svc.updateResusClinical(recordId, dto);
  }

  @Patch("clinical/assessments/:assessmentId")
  @RequirePermission("triage:write")
  @RequiresClinicalSafety("general")
  updateAssessment(
    @Param("assessmentId") assessmentId: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.svc.update(assessmentId, dto);
  }
}
