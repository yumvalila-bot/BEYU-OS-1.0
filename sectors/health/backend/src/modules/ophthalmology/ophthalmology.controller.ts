import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { OphthalmologyService } from "./ophthalmology.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { RequiresClinicalSafety } from "../../common/security/clinical-safety.guard";
import { RequireHcmPractitioner } from "../../integrations/beyu/guards/hcm-authorization.guard";

@ApiTags("ophthalmology")
@ApiBearerAuth("access-token")
@Controller("api/eye-exams")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OphthalmologyController {
  constructor(private readonly svc: OphthalmologyService) {}
  @Get() @RequirePermission("phi:read") list(@Query("patient_id") p: string) {
    return this.svc.listForPatient(p);
  }
  @Post() @RequirePermission("phi:write") create(@Body() d: any) {
    return this.svc.addExam(d);
  }
  @Post(":id/sign")
  @RequirePermission("note:sign")
  @RequiresClinicalSafety("ophthalmology")
  @RequireHcmPractitioner("ophthalmology.sign", {
    scope: ["ophthalmology:sign", "note:sign"],
  })
  sign(@Param("id") id: string, @Body() d: any = {}) {
    return this.svc.sign(id, d);
  }
}
