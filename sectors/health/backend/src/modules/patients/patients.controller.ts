import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { PatientsService } from "./patients.service";
import { CreatePatientDto } from "./dto/create-patient.dto";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequireHcmPractitioner } from "../../integrations/beyu/guards/hcm-authorization.guard";
import { RequiresClinicalSafety } from "../../common/security/clinical-safety.guard";

@ApiTags("patients")
@ApiBearerAuth("access-token")
@Controller("api/patients")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PatientsController {
  constructor(private readonly service: PatientsService) {}

  @Get()
  @RequirePermission("patient:read")
  @ApiOperation({ summary: "List patients (tenant-scoped, paginated)" })
  list(
    @Query("q") q?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.service.list(
      q,
      limit ? Math.min(parseInt(limit, 10), 200) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Get(":id")
  @RequirePermission("patient:read")
  @ApiOperation({ summary: "Get a patient by id" })
  get(@Param("id") id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequirePermission("patient:register")
  @RequireHcmPractitioner("patient.register", { scope: ["patient:register"] })
  @RequiresClinicalSafety("general")
  @ApiOperation({ summary: "Register a new patient" })
  create(@Body() dto: CreatePatientDto) {
    return this.service.create(dto);
  }
}
