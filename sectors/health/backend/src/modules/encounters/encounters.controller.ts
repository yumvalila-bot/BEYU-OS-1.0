import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { EncountersService } from "./encounters.service";
import { StartEncounterDto } from "./dto/start-encounter.dto";
import { CompleteEncounterDto } from "./dto/complete-encounter.dto";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { RequireHcmPractitioner } from "../../integrations/beyu/guards/hcm-authorization.guard";
import { RequiresClinicalSafety } from "../../common/security/clinical-safety.guard";

@ApiTags("encounters")
@ApiBearerAuth("access-token")
@Controller("api/encounters")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EncountersController {
  constructor(private readonly service: EncountersService) {}

  @Get()
  @RequirePermission("phi:read")
  @ApiOperation({ summary: "List encounters for a patient" })
  list(@Query("patient_id") patientId: string) {
    return this.service.forPatient(patientId);
  }

  @Get(":id")
  @RequirePermission("phi:read")
  get(@Param("id") id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequirePermission("encounter:start")
  @RequireHcmPractitioner("encounter.start", { scope: ["encounter:start", "clinical:write"] })
  @RequiresClinicalSafety("general")
  @ApiOperation({ summary: "Start a clinical encounter" })
  start(@Body() dto: StartEncounterDto) {
    return this.service.start(dto);
  }

  @Post(":id/complete")
  @RequirePermission("encounter:complete")
  @RequireHcmPractitioner("encounter.complete", { scope: ["encounter:complete", "clinical:write"] })
  @RequiresClinicalSafety("general")
  @ApiOperation({ summary: "Complete an encounter with a disposition" })
  complete(@Param("id") id: string, @Body() dto: CompleteEncounterDto) {
    return this.service.complete(id, dto.disposition, dto.present_illness);
  }
}
