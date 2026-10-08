import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CapacityService } from "./capacity.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";

/**
 * Capacity / bed management HTTP surface.
 *
 * Authorization is enforced here by the same global guard chain as every other
 * sector route (JwtAuthGuard → PermissionsGuard → …) and again by RLS in the
 * database. Nothing on this controller trusts a path or query parameter as a
 * grant: `ward_id` / `tenant` scoping is resolved from the authenticated actor,
 * and a route that a role cannot hold is absent rather than hidden.
 */
@ApiTags("capacity")
@ApiBearerAuth("access-token")
@Controller("api/capacity")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CapacityController {
  constructor(private readonly svc: CapacityService) {}

  // ── read models ─────────────────────────────────────────────────────────────
  @Get("wards")
  @RequirePermission("bed:read")
  listWards() {
    return this.svc.listWards();
  }

  @Get("beds")
  @RequirePermission("bed:read")
  listBeds() {
    return this.svc.listBeds();
  }

  @Get("beds/ward/:wardId")
  @RequirePermission("bed:read")
  listBedsForWard(@Param("wardId", ParseUUIDPipe) wardId: string) {
    return this.svc.listBeds(wardId);
  }

  @Get("snapshot")
  @RequirePermission("bed:read")
  snapshot() {
    return this.svc.capacitySnapshot();
  }

  @Get("allocations/open")
  @RequirePermission("bed:read")
  openAllocations() {
    return this.svc.openAllocations();
  }

  @Get("allocations/patient/:patientId")
  @RequirePermission("bed:read")
  patientHistory(@Param("patientId", ParseUUIDPipe) patientId: string) {
    return this.svc.historyForPatient(patientId);
  }

  @Get("turnarounds/pending")
  @RequirePermission("bed:read")
  pendingTurnarounds() {
    return this.svc.pendingTurnarounds();
  }

  @Get("flow/encounter/:encounterId")
  @RequirePermission("flow:read")
  flowForEncounter(@Param("encounterId", ParseUUIDPipe) encounterId: string) {
    return this.svc.flowForEncounter(encounterId);
  }

  // ── registry writes ─────────────────────────────────────────────────────────
  @Post("wards")
  @RequirePermission("bed:manage")
  createWard(@Body() dto: Record<string, unknown>) {
    return this.svc.createWard(dto);
  }

  @Post("beds")
  @RequirePermission("bed:manage")
  createBed(@Body() dto: Record<string, unknown>) {
    return this.svc.createBed(dto);
  }

  @Patch("beds/:bedId/status")
  @RequirePermission("bed:manage")
  setBedStatus(
    @Param("bedId", ParseUUIDPipe) bedId: string,
    @Body() dto: { status: string },
  ) {
    return this.svc.setBedStatus(bedId, dto?.status);
  }

  // ── allocation lifecycle ────────────────────────────────────────────────────
  @Post("allocations")
  @RequirePermission("bed:allocate")
  allocate(
    @Body()
    dto: {
      bed_id: string;
      patient_id: string;
      encounter_id?: string;
      reason?: string;
      idempotency_key?: string;
    },
  ) {
    return this.svc.allocate(dto);
  }

  @Post("allocations/:allocationId/occupy")
  @RequirePermission("bed:allocate")
  occupy(@Param("allocationId", ParseUUIDPipe) allocationId: string) {
    return this.svc.markOccupied(allocationId);
  }

  @Post("allocations/:allocationId/transfer")
  @RequirePermission("bed:allocate")
  transfer(
    @Param("allocationId", ParseUUIDPipe) allocationId: string,
    @Body() dto: { to_bed_id: string; note?: string },
  ) {
    return this.svc.transfer(allocationId, dto?.to_bed_id, dto?.note);
  }

  @Post("allocations/:allocationId/pending-discharge")
  @RequirePermission("bed:allocate")
  pendingDischarge(@Param("allocationId", ParseUUIDPipe) allocationId: string) {
    return this.svc.requestDischarge(allocationId);
  }

  @Post("allocations/:allocationId/release")
  @RequirePermission("bed:allocate")
  release(
    @Param("allocationId", ParseUUIDPipe) allocationId: string,
    @Body() dto: { reason?: string },
  ) {
    return this.svc.discharge(allocationId, dto?.reason);
  }

  // ── turnaround ──────────────────────────────────────────────────────────────
  @Post("turnarounds")
  @RequirePermission("bed:manage")
  requestTurnaround(@Body() dto: Record<string, unknown>) {
    return this.svc.requestTurnaround(dto);
  }

  @Post("turnarounds/:turnaroundId/complete")
  @RequirePermission("bed:manage")
  completeTurnaround(
    @Param("turnaroundId", ParseUUIDPipe) turnaroundId: string,
  ) {
    return this.svc.completeTurnaround(turnaroundId);
  }

  // ── flow trace ──────────────────────────────────────────────────────────────
  @Post("flow")
  @RequirePermission("flow:read")
  recordFlow(@Body() dto: Record<string, unknown>) {
    return this.svc.recordFlow(dto);
  }
}
