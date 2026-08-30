import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthService } from "./health.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: "Health check" })
  async check() {
    return this.healthService.check();
  }

  @Get("ready")
  @ApiOperation({ summary: "Readiness check" })
  async ready() {
    return this.healthService.checkReadiness();
  }

  @Get("live")
  @ApiOperation({ summary: "Liveness check" })
  async live() {
    return this.healthService.checkLiveness();
  }
}
