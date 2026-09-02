import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { AmbulanceService } from "./ambulance.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { RequiresMfaStepUp } from "../../common/security/mfa-stepup.guard";
import { RequireHcmPractitioner } from "../../integrations/beyu/guards/hcm-authorization.guard";
import { RequiresClinicalSafety } from "../../common/security/clinical-safety.guard";

@ApiTags("ambulance")
@ApiBearerAuth("access-token")
@Controller("api/ambulance")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AmbulanceController {
  constructor(private readonly svc: AmbulanceService) {}
  @Get("vehicles") @RequirePermission("tenant:admin") vehicles() {
    return this.svc.listVehicles();
  }
  @Post("vehicles")
  @RequirePermission("tenant:admin")
  @RequiresMfaStepUp("ambulance.vehicle.register")
  addVehicle(@Body() d: any) {
    return this.svc.registerVehicle(d);
  }
  @Post("requests")
  @RequirePermission("phi:write")
  @RequireHcmPractitioner("ambulance.dispatch", {
    scope: ["ems:dispatch", "clinical:write"],
  })
  @RequiresClinicalSafety("general")
  createRequest(@Body() d: any) {
    return this.svc.createRequest(d);
  }
  @Post("requests/:id/transition")
  @RequirePermission("phi:write")
  @RequireHcmPractitioner("ambulance.transition", {
    scope: ["ems:dispatch", "clinical:write"],
  })
  @RequiresClinicalSafety("general")
  transition(@Param("id") id: string, @Body() d: any) {
    return this.svc.transition(id, d.to, d.patch || {});
  }
}
