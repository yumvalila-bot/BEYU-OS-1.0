import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { FhirService } from "./fhir.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { RequiresConsent } from "../../common/security/consent.guard";

@ApiTags("fhir")
@ApiBearerAuth("access-token")
@Controller("fhir/R4")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FhirController {
  constructor(private readonly svc: FhirService) {}

  @Get("Patient/:id")
  @RequirePermission("phi:read")
  @RequiresConsent("fhir:read", "patient", "id")
  patient(@Param("id") id: string) {
    return this.svc.patient(id);
  }

  @Get("Encounter/:id")
  @RequirePermission("phi:read")
  encounter(@Param("id") id: string) {
    return this.svc.encounter(id);
  }

  @Get("Condition")
  @RequirePermission("phi:read")
  @RequiresConsent("fhir:read", "conditions", "patient")
  conditions(@Query("patient") pid: string) {
    return this.svc.conditions(pid);
  }

  @Get("Observation")
  @RequirePermission("phi:read")
  @RequiresConsent("fhir:read", "observations", "patient")
  observations(@Query("patient") pid: string) {
    return this.svc.observations(pid);
  }

  @Get("MedicationRequest")
  @RequirePermission("phi:read")
  @RequiresConsent("fhir:read", "medications", "patient")
  medications(@Query("patient") pid: string) {
    return this.svc.medicationRequests(pid);
  }

  @Get("AllergyIntolerance")
  @RequirePermission("phi:read")
  @RequiresConsent("fhir:read", "allergies", "patient")
  allergies(@Query("patient") pid: string) {
    return this.svc.allergyIntolerances(pid);
  }

  @Get("Patient/:id/$everything")
  @RequirePermission("phi:read")
  @RequiresConsent("fhir:export", "all_phi", "id")
  everything(@Param("id") id: string) {
    return this.svc.bundle(id);
  }
}
