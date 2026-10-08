import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { TheatreService } from "./theatre.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { RequiresClinicalSafety } from "../../common/security/clinical-safety.guard";
import { RequireHcmPractitioner } from "../../integrations/beyu/guards/hcm-authorization.guard";

/**
 * Theatre scheduling, surgical case lifecycle, team confirmation, WHO pre-op
 * checklist and anaesthesia records.
 *
 * Nothing here trusts a client's claim of readiness: `POST cases/:id/start`
 * re-derives the blockers inside the write transaction (signed checklist,
 * confirmed surgeon and anaesthetist with live credentials, consent, booked
 * theatre), and recovery occupies a REAL bed through the capacity domain.
 */
@ApiTags("theatre")
@ApiBearerAuth("access-token")
@Controller("api/theatre")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TheatreController {
  constructor(private readonly svc: TheatreService) {}

  @Post("theatres")
  @RequirePermission("bed:manage")
  createTheatre(@Body() dto: Record<string, unknown>) {
    return this.svc.createTheatre(dto);
  }

  @Get("theatres")
  @RequirePermission("theatre:read")
  board() {
    return this.svc.theatreBoard();
  }

  @Post("theatres/:theatreId/status")
  @RequirePermission("bed:manage")
  theatreStatus(
    @Param("theatreId", ParseUUIDPipe) theatreId: string,
    @Body() dto: { status: string },
  ) {
    return this.svc.setTheatreStatus(theatreId, dto?.status);
  }

  @Post("theatres/:theatreId/clean-complete")
  @RequirePermission("bed:manage")
  cleanComplete(@Param("theatreId", ParseUUIDPipe) theatreId: string) {
    return this.svc.markTheatreClean(theatreId);
  }

  @Post("cases")
  @RequirePermission("theatre:book")
  @RequireHcmPractitioner("theatre.case.create", { scope: ["clinical:write"] })
  @RequiresClinicalSafety("general")
  createCase(@Body() dto: Record<string, unknown>) {
    return this.svc.createCase(dto);
  }

  @Get("cases")
  @RequirePermission("theatre:read")
  cases(@Query("status") status?: string) {
    return this.svc.caseList(status);
  }

  @Get("cases/:caseId")
  @RequirePermission("theatre:read")
  getCase(@Param("caseId", ParseUUIDPipe) caseId: string) {
    return this.svc.getCase(caseId);
  }

  @Post("cases/:caseId/book")
  @RequirePermission("theatre:book")
  book(
    @Param("caseId", ParseUUIDPipe) caseId: string,
    @Body()
    dto: {
      theatre_id: string;
      scheduled_start_at: string;
      scheduled_end_at: string;
    },
  ) {
    return this.svc.scheduleCase(caseId, dto);
  }

  @Post("cases/:caseId/cancel")
  @RequirePermission("theatre:book")
  cancel(
    @Param("caseId", ParseUUIDPipe) caseId: string,
    @Body() dto: { reason: string },
  ) {
    return this.svc.cancelCase(caseId, dto?.reason);
  }

  @Post("cases/:caseId/postpone")
  @RequirePermission("theatre:book")
  postpone(
    @Param("caseId", ParseUUIDPipe) caseId: string,
    @Body() dto: { until: string; note?: string },
  ) {
    return this.svc.postponeCase(caseId, dto?.until, dto?.note);
  }

  @Post("cases/:caseId/consent")
  @RequirePermission("theatre:document")
  @RequiresClinicalSafety("general")
  consent(
    @Param("caseId", ParseUUIDPipe) caseId: string,
    @Body() dto: { consent_id: string },
  ) {
    return this.svc.verifyConsent(caseId, dto?.consent_id);
  }

  @Post("cases/:caseId/transition")
  @RequirePermission("theatre:book")
  @RequiresClinicalSafety("general")
  transition(
    @Param("caseId", ParseUUIDPipe) caseId: string,
    @Body() dto: { to: string },
  ) {
    return this.svc.transition(caseId, dto?.to);
  }

  @Get("cases/:caseId/readiness")
  @RequirePermission("theatre:read")
  readiness(@Param("caseId", ParseUUIDPipe) caseId: string) {
    return this.svc.readiness(caseId);
  }

  @Post("cases/:caseId/start")
  @RequirePermission("theatre:document")
  @RequireHcmPractitioner("theatre.case.start", { scope: ["clinical:write"] })
  @RequiresClinicalSafety("general")
  start(
    @Param("caseId", ParseUUIDPipe) caseId: string,
    @Body() dto: { consent_waiver_reason?: string },
  ) {
    return this.svc.startCase(caseId, dto ?? {});
  }

  @Post("cases/:caseId/recovery")
  @RequirePermission("theatre:document")
  @RequiresClinicalSafety("general")
  recovery(
    @Param("caseId", ParseUUIDPipe) caseId: string,
    @Body() dto: { recovery_bed_id: string },
  ) {
    return this.svc.moveToRecovery(caseId, dto?.recovery_bed_id);
  }

  @Post("cases/:caseId/complete")
  @RequirePermission("theatre:document")
  @RequiresClinicalSafety("general")
  complete(@Param("caseId", ParseUUIDPipe) caseId: string) {
    return this.svc.completeCase(caseId);
  }

  // ── team ────────────────────────────────────────────────────────────────────
  @Post("cases/:caseId/team")
  @RequirePermission("theatre:book")
  addMember(
    @Param("caseId", ParseUUIDPipe) caseId: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.svc.addTeamMember(caseId, dto);
  }

  @Get("cases/:caseId/team")
  @RequirePermission("theatre:read")
  team(@Param("caseId", ParseUUIDPipe) caseId: string) {
    return this.svc.listTeam(caseId);
  }

  @Post("team/:teamMemberId/confirm")
  @RequirePermission("theatre:read")
  confirm(@Param("teamMemberId", ParseUUIDPipe) teamMemberId: string) {
    return this.svc.confirmTeamMember(teamMemberId);
  }

  // ── checklist ───────────────────────────────────────────────────────────────
  @Post("cases/:caseId/checklist")
  @RequirePermission("theatre:document")
  startChecklist(
    @Param("caseId", ParseUUIDPipe) caseId: string,
    @Body() dto: { template?: string },
  ) {
    return this.svc.startChecklist(caseId, dto?.template);
  }

  @Get("checklists/:checklistId")
  @RequirePermission("theatre:read")
  checklist(@Param("checklistId", ParseUUIDPipe) checklistId: string) {
    return this.svc.checklist(checklistId);
  }

  @Post("checklist-items/:itemId/check")
  @RequirePermission("checklist:sign")
  checkItem(
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body() dto: { checked: boolean; note?: string },
  ) {
    return this.svc.checkItem(itemId, dto?.checked, dto?.note);
  }

  @Post("checklists/:checklistId/attest")
  @RequirePermission("checklist:sign")
  @RequiresClinicalSafety("general")
  attest(@Param("checklistId", ParseUUIDPipe) checklistId: string) {
    return this.svc.signChecklist(checklistId);
  }

  // ── anaesthesia ─────────────────────────────────────────────────────────────
  @Post("anaesthesia")
  @RequirePermission("theatre:document")
  @RequireHcmPractitioner("theatre.anaesthesia.record", {
    scope: ["clinical:write"],
  })
  @RequiresClinicalSafety("general")
  recordAnaesthesia(@Body() dto: Record<string, unknown>) {
    return this.svc.recordAnaesthesia(dto);
  }

  @Get("cases/:caseId/anaesthesia")
  @RequirePermission("theatre:read")
  anaesthesiaForCase(@Param("caseId", ParseUUIDPipe) caseId: string) {
    return this.svc.anaesthesiaForCase(caseId);
  }

  @Get("cases/:caseId/anaesthesia/history")
  @RequirePermission("theatre:read")
  anaesthesiaHistory(@Param("caseId", ParseUUIDPipe) caseId: string) {
    return this.svc.anaesthesiaHistory(caseId);
  }

  @Patch("anaesthesia/:recordId")
  @RequirePermission("theatre:document")
  updateAnaesthesia(
    @Param("recordId", ParseUUIDPipe) anaesthesiaId: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.svc.updateAnaesthesia(anaesthesiaId, dto);
  }

  @Post("anaesthesia/:recordId/attest")
  @RequirePermission("careplan:sign")
  @RequireHcmPractitioner("theatre.anaesthesia.attest", {
    scope: ["clinical:write"],
  })
  @RequiresClinicalSafety("general")
  attestAnaesthesia(@Param("recordId", ParseUUIDPipe) anaesthesiaId: string) {
    return this.svc.signAnaesthesia(anaesthesiaId);
  }

  @Post("anaesthesia/:recordId/amend")
  @RequirePermission("theatre:document")
  @RequiresClinicalSafety("general")
  amendAnaesthesia(
    @Param("recordId", ParseUUIDPipe) anaesthesiaId: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.svc.amendAnaesthesia(anaesthesiaId, dto);
  }
}
