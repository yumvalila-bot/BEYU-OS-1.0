import { Controller, Get, SetMetadata } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthService } from "./health.service";

const IS_PUBLIC_KEY = "csrf:is-public";
const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

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
