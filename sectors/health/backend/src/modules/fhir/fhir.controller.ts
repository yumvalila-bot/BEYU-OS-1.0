import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { FhirService } from "./fhir.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";

@ApiTags("fhir")
@ApiBearerAuth("access-token")
@Controller("fhir/R4")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FhirController {
  constructor(private readonly svc: FhirService) {}

  @Get("Patient/:id") @RequirePermission("phi:read")
  patient(@Param("id") id: string) { return this.svc.patient(id); }

  @Get("Encounter/:id") @RequirePermission("phi:read")
  encounter(@Param("id") id: string) { return this.svc.encounter(id); }

  @Get("Condition") @RequirePermission("phi:read")
  conditions(@Query("patient") pid: string) { return this.svc.conditions(pid); }

  @Get("Observation") @RequirePermission("phi:read")
  observations(@Query("patient") pid: string) { return this.svc.observations(pid); }

  @Get("MedicationRequest") @RequirePermission("phi:read")
  medications(@Query("patient") pid: string) { return this.svc.medicationRequests(pid); }

  @Get("AllergyIntolerance") @RequirePermission("phi:read")
  allergies(@Query("patient") pid: string) { return this.svc.allergyIntolerances(pid); }

  @Get("Patient/:id/$everything") @RequirePermission("phi:read")
  everything(@Param("id") id: string) { return this.svc.bundle(id); }
}
