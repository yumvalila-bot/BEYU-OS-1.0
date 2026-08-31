import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthService } from "./health.service";
import { Public } from "../../common/security/public.decorator";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private healthService: HealthService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: "Health check (legacy)" })
  async check() {
    return this.healthService.check();
  }

  @Get("ready")
  @Public()
  @ApiOperation({ summary: "Readiness check" })
  async ready() {
    return this.healthService.checkReadiness();
  }

  @Get("live")
  @Public()
  @ApiOperation({ summary: "Liveness check" })
  async live() {
    return this.healthService.checkLiveness();
  }
}
