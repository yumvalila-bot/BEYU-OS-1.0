import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { ClinicalService } from "./clinical.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";

@ApiTags("clinical")
@ApiBearerAuth("access-token")
@Controller("api/clinical")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClinicalController {
  constructor(private readonly svc: ClinicalService) {}

  // Problems
  @Get("patients/:patientId/problems") @RequirePermission("phi:read")
  listProblems(@Param("patientId") patientId: string) { return this.svc.listProblems(patientId); }
  @Post("problems") @RequirePermission("phi:write")
  addProblem(@Body() dto: Record<string, unknown>) { return this.svc.addProblem(dto); }

  // Observations/Vitals
  @Get("patients/:patientId/observations") @RequirePermission("phi:read")
  listObservations(@Param("patientId") patientId: string, @Query("category") category?: string) {
    return this.svc.listObservations(patientId, category);
  }
  @Post("observations") @RequirePermission("phi:write")
  addObservation(@Body() dto: Record<string, unknown>) { return this.svc.addObservation(dto); }

  // Medications
  @Get("patients/:patientId/medications") @RequirePermission("phi:read")
  listMedications(@Param("patientId") patientId: string, @Query("active") active?: string) {
    return this.svc.listMedications(patientId, active !== "false");
  }
  @Post("medications") @RequirePermission("rx:write")
  addMedication(@Body() dto: Record<string, unknown>) { return this.svc.addMedication(dto); }

  // Allergies
  @Get("patients/:patientId/allergies") @RequirePermission("phi:read")
  listAllergies(@Param("patientId") patientId: string) { return this.svc.listAllergies(patientId); }
  @Post("allergies") @RequirePermission("phi:write")
  addAllergy(@Body() dto: Record<string, unknown>) { return this.svc.addAllergy(dto); }
}
