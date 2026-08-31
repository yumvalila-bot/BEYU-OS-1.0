import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { DialysisService } from "./dialysis.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { RequiresClinicalSafety } from "../../common/security/clinical-safety.guard";

@ApiTags("dialysis")
@ApiBearerAuth("access-token")
@Controller("api/dialysis")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DialysisController {
  constructor(private readonly svc: DialysisService) {}

  @Post("sessions") @RequirePermission("dialysis:treat") @RequiresClinicalSafety("dialysis")
  startSession(@Body() d: any) {
    // schedule() creates in 'scheduled'; clinical-safety has already enforced
    // patient identity, consent, machine, water-quality, infection controls.
    return this.svc.schedule(d);
  }

  @Post("sessions/:id/interrupt") @RequirePermission("dialysis:treat")
  interrupt(@Param("id") id: string, @Body() d: any = {}) {
    return this.svc.transition(id, "interrupted", d);
  }
}
