import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { IntegrationsService } from "./integrations.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { RequiresMfaStepUp } from "../../common/security/mfa-stepup.guard";
import { AdapterRegistry } from "./adapter-registry";

@ApiTags("integrations")
@ApiBearerAuth("access-token")
@Controller("api/integrations")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IntegrationsController {
  constructor(
    private readonly svc: IntegrationsService,
    private readonly adapters: AdapterRegistry,
  ) {}
  @Get() @RequirePermission("tenant:admin") list() {
    return this.svc.list();
  }
  @Get("adapters/probe") @RequirePermission("tenant:admin") probe() {
    return this.adapters.probeAll();
  }
  @Get(":provider") @RequirePermission("tenant:admin") get(
    @Param("provider") p: string,
  ) {
    return this.svc.get(p);
  }
  @Post(":provider/configured")
  @RequirePermission("tenant:admin")
  @RequiresMfaStepUp("integrations:configure")
  cfg(@Param("provider") p: string) {
    return this.svc.markConfigured(p);
  }
}
