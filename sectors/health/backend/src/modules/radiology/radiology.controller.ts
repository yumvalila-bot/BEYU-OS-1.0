import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { RadiologyService } from "./radiology.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { RequiresClinicalSafety } from "../../common/security/clinical-safety.guard";
import { RequireHcmPractitioner } from "../../integrations/beyu/guards/hcm-authorization.guard";

@ApiTags("radiology")
@ApiBearerAuth("access-token")
@Controller("api/imaging")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RadiologyController {
  constructor(private readonly svc: RadiologyService) {}
  @Get() @RequirePermission("order:imaging")
  list(@Query("patient_id") p: string) { return this.svc.listForPatient(p); }
  @Post("orders") @RequirePermission("order:imaging") @RequiresClinicalSafety("radiology")
  create(@Body() d: any) { return this.svc.createOrder(d); }
  @Post("orders/:id/transition") @RequirePermission("order:imaging") @RequiresClinicalSafety("radiology")
  transition(@Param("id") id: string, @Body("to") to: string) { return this.svc.transition(id, to); }
  @Post("reports") @RequirePermission("phi:write") @RequireHcmPractitioner("radiology.report.add", { scope: ["radiology:report"] }) @RequiresClinicalSafety("general")
  report(@Body() d: any) { return this.svc.addReport(d); }
  @Post("reports/:id/verify") @RequirePermission("note:sign") @RequiresClinicalSafety("radiology") @RequireHcmPractitioner("radiology.report.verify", { scope: ["radiology:verify", "note:sign"] })
  verify(
    @Param("id") id: string,
    @Body() d: {
      verifiedByGlobalUserId?: string; equipmentAuthorized?: boolean; radiationSafetyCleared?: boolean;
      dicomIdentityLinked?: boolean; doseCaptured?: boolean; criticalFinding?: boolean;
      criticalEscalationLogged?: boolean; facilityId?: string; metadata?: Record<string, unknown>;
    } = {},
  ) { return this.svc.verifyReport(id, d); }
}
