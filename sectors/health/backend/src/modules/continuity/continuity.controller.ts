import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ContinuityService } from "./continuity.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { RequiresClinicalSafety } from "../../common/security/clinical-safety.guard";
import { RequireHcmPractitioner } from "../../integrations/beyu/guards/hcm-authorization.guard";

/**
 * Continuity of care: care plans, plan tasks, discharge summaries, follow-ups
 * and the clinical-document registry.
 *
 * Endpoints that author or attest clinical content declare themselves CLINICAL
 * (HCM practitioner + clinical-safety gate + permission), so a role that can
 * read a ward cannot sign a discharge summary. Document endpoints publish
 * metadata only — there is deliberately no route here that returns file bytes,
 * because object retrieval is governed by the storage adapter, not by this API.
 */
@ApiTags("continuity")
@ApiBearerAuth("access-token")
@Controller("api/continuity")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContinuityController {
  constructor(private readonly svc: ContinuityService) {}

  // ── care plans ──────────────────────────────────────────────────────────────
  @Post("plans")
  @RequirePermission("careplan:write")
  @RequireHcmPractitioner("continuity.care_plan.create", {
    scope: ["clinical:write"],
  })
  @RequiresClinicalSafety("general")
  createPlan(@Body() dto: Record<string, unknown>) {
    return this.svc.createPlan(dto);
  }

  @Get("plans/patient/:patientId")
  @RequirePermission("careplan:write")
  plansForPatient(
    @Param("patientId", ParseUUIDPipe) patientId: string,
    @Query("include_closed") includeClosed?: string,
  ) {
    return this.svc.listPlansForPatient(
      patientId,
      includeClosed === "true" || includeClosed === "1",
    );
  }

  @Get("plans/:planId")
  @RequirePermission("careplan:write")
  getPlan(@Param("planId", ParseUUIDPipe) planId: string) {
    return this.svc.getPlan(planId);
  }

  @Patch("plans/:planId")
  @RequirePermission("careplan:write")
  updatePlan(
    @Param("planId", ParseUUIDPipe) planId: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.svc.updatePlan(planId, dto);
  }

  @Post("plans/:planId/transition")
  @RequirePermission("careplan:write")
  transitionPlan(
    @Param("planId", ParseUUIDPipe) planId: string,
    @Body() dto: { to: string },
  ) {
    return this.svc.transitionPlan(planId, dto?.to);
  }

  @Post("plans/:planId/attest")
  @RequirePermission("careplan:sign")
  @RequireHcmPractitioner("continuity.care_plan.attest", {
    scope: ["clinical:write"],
  })
  @RequiresClinicalSafety("general")
  attestPlan(@Param("planId", ParseUUIDPipe) planId: string) {
    return this.svc.signPlan(planId);
  }

  @Get("plans/:planId/tasks")
  @RequirePermission("task:read")
  listTasks(@Param("planId", ParseUUIDPipe) planId: string) {
    return this.svc.listTasksForPlan(planId);
  }

  @Post("plans/:planId/tasks")
  @RequirePermission("careplan:write")
  addTask(
    @Param("planId", ParseUUIDPipe) planId: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.svc.addTask(planId, dto);
  }

  // ── tasks ───────────────────────────────────────────────────────────────────
  @Get("tasks/worklist")
  @RequirePermission("task:read")
  worklist(
    @Query("assignee") assignee?: string,
    @Query("role") role?: string,
    @Query("ward_id") wardId?: string,
  ) {
    return this.svc.taskWorklist({ assignee, role, wardId });
  }

  @Post("tasks/sweep-overdue")
  @RequirePermission("task:complete")
  sweepOverdue() {
    return this.svc.sweepOverdueTasks();
  }

  @Post("tasks/:taskId/start")
  @RequirePermission("task:complete")
  startTask(@Param("taskId", ParseUUIDPipe) taskId: string) {
    return this.svc.startTask(taskId);
  }

  @Post("tasks/:taskId/complete")
  @RequirePermission("task:complete")
  completeTask(
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Body() dto: { outcome_note?: string },
  ) {
    return this.svc.completeTask(taskId, dto?.outcome_note);
  }

  @Post("tasks/:taskId/skip")
  @RequirePermission("task:complete")
  skipTask(
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Body() dto: { reason: string },
  ) {
    return this.svc.skipTask(taskId, dto?.reason);
  }

  @Post("tasks/:taskId/cancel")
  @RequirePermission("task:complete")
  cancelTask(
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Body() dto: { reason?: string },
  ) {
    return this.svc.cancelTask(taskId, dto?.reason);
  }

  // ── discharge summaries ─────────────────────────────────────────────────────
  @Post("discharge")
  @RequirePermission("discharge:write")
  @RequireHcmPractitioner("continuity.discharge.create", {
    scope: ["clinical:write"],
  })
  @RequiresClinicalSafety("general")
  createSummary(@Body() dto: Record<string, unknown>) {
    return this.svc.createSummary(dto);
  }

  @Get("discharge/:summaryId")
  @RequirePermission("discharge:write")
  getSummary(@Param("summaryId", ParseUUIDPipe) summaryId: string) {
    return this.svc.getSummary(summaryId);
  }

  @Patch("discharge/:summaryId")
  @RequirePermission("discharge:write")
  updateSummary(
    @Param("summaryId", ParseUUIDPipe) summaryId: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.svc.updateSummary(summaryId, dto);
  }

  @Post("discharge/:summaryId/attest")
  @RequirePermission("careplan:sign")
  @RequireHcmPractitioner("continuity.discharge.attest", {
    scope: ["clinical:write"],
  })
  @RequiresClinicalSafety("general")
  attestSummary(@Param("summaryId", ParseUUIDPipe) summaryId: string) {
    return this.svc.signSummary(summaryId);
  }

  @Post("discharge/:summaryId/amend")
  @RequirePermission("discharge:write")
  @RequireHcmPractitioner("continuity.discharge.amend", {
    scope: ["clinical:write"],
  })
  @RequiresClinicalSafety("general")
  amendSummary(
    @Param("summaryId", ParseUUIDPipe) summaryId: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.svc.amendSummary(summaryId, dto);
  }

  @Get("discharge/encounter/:encounterId/versions")
  @RequirePermission("discharge:write")
  summaryVersions(@Param("encounterId", ParseUUIDPipe) encounterId: string) {
    return this.svc.summaryVersions(encounterId);
  }

  // ── follow-ups ──────────────────────────────────────────────────────────────
  @Post("followups")
  @RequirePermission("careplan:write")
  schedule(@Body() dto: Record<string, unknown>) {
    return this.svc.scheduleFollowup(dto);
  }

  @Get("followups/due")
  @RequirePermission("task:read")
  due() {
    return this.svc.dueFollowups();
  }

  @Get("followups/patient/:patientId")
  @RequirePermission("careplan:write")
  followupsForPatient(@Param("patientId", ParseUUIDPipe) patientId: string) {
    return this.svc.listFollowupsForPatient(patientId);
  }

  @Post("followups/:followupId/transition")
  @RequirePermission("task:complete")
  transitionFollowup(
    @Param("followupId", ParseUUIDPipe) followupId: string,
    @Body() dto: { to: string; note?: string },
  ) {
    return this.svc.transitionFollowup(followupId, dto?.to, dto?.note);
  }

  // ── document registry (metadata only) ───────────────────────────────────────
  @Post("documents")
  @RequirePermission("document:write")
  registerDocument(@Body() dto: Record<string, unknown>) {
    return this.svc.registerDocument(dto);
  }

  @Get("documents/patient/:patientId")
  @RequirePermission("document:read")
  documentsForPatient(@Param("patientId", ParseUUIDPipe) patientId: string) {
    return this.svc.documentsForPatient(patientId);
  }

  @Post("documents/:documentId/revise")
  @RequirePermission("document:write")
  reviseDocument(
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.svc.reviseDocument(documentId, dto);
  }

  /**
   * Voids the registry row. DELETE is used because the operation is
   * destructive from the caller's point of view, but the service never removes
   * the row: the metadata and hash survive so a previously disclosed document
   * can still be accounted for.
   */
  @Delete("documents/:documentId")
  @RequirePermission("document:write")
  voidDocument(
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Query("reason") reason: string,
  ) {
    return this.svc.voidDocument(documentId, reason);
  }

  @Get("snapshot/patient/:patientId")
  @RequirePermission("task:read")
  board(@Param("patientId", ParseUUIDPipe) patientId: string) {
    return this.svc.planBoard(patientId);
  }
}
