import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { AmbulanceService } from "./ambulance.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";

@ApiTags("ambulance")
@ApiBearerAuth("access-token")
@Controller("api/ambulance")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AmbulanceController {
  constructor(private readonly svc: AmbulanceService) {}
  @Get("vehicles") @RequirePermission("tenant:admin") vehicles() { return this.svc.listVehicles(); }
  @Post("vehicles") @RequirePermission("tenant:admin") addVehicle(@Body() d: any) { return this.svc.registerVehicle(d); }
  @Post("requests") @RequirePermission("phi:write") createRequest(@Body() d: any) { return this.svc.createRequest(d); }
  @Post("requests/:id/transition") @RequirePermission("phi:write")
  transition(@Param("id") id: string, @Body() d: any) { return this.svc.transition(id, d.to, d.patch || {}); }
}
