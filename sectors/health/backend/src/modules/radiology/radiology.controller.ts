import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { RadiologyService } from "./radiology.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";

@ApiTags("radiology")
@ApiBearerAuth("access-token")
@Controller("api/imaging")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RadiologyController {
  constructor(private readonly svc: RadiologyService) {}
  @Get() @RequirePermission("order:imaging")
  list(@Query("patient_id") p: string) { return this.svc.listForPatient(p); }
  @Post("orders") @RequirePermission("order:imaging")
  create(@Body() d: any) { return this.svc.createOrder(d); }
  @Post("orders/:id/transition") @RequirePermission("order:imaging")
  transition(@Param("id") id: string, @Body("to") to: string) { return this.svc.transition(id, to); }
  @Post("reports") @RequirePermission("phi:write")
  report(@Body() d: any) { return this.svc.addReport(d); }
  @Post("reports/:id/verify") @RequirePermission("note:sign")
  verify(@Param("id") id: string) { return this.svc.verifyReport(id); }
}
