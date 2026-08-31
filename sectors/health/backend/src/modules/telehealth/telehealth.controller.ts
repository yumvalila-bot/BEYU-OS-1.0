import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { TelehealthService } from "./telehealth.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";

@ApiTags("telehealth")
@ApiBearerAuth("access-token")
@Controller("api/telehealth")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TelehealthController {
  constructor(private readonly svc: TelehealthService) {}
  @Post("sessions") @RequirePermission("appointment:book")
  create(@Body() d: any) { return this.svc.createSession(d); }
  @Post("sessions/:id/transition") @RequirePermission("appointment:transition")
  transition(@Param("id") id: string, @Body() d: any) { return this.svc.transition(id, d.to, d.patch || {}); }
}
