import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { ComplianceService, ComplianceControlRecord, EvidenceRecord } from "./compliance.service";

@Controller("api/compliance")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ComplianceController {
  constructor(private readonly svc: ComplianceService) {}

  @Get("controls")
  @RequirePermission("tenant:admin")
  list(@Query("category") category?: string, @Query("authority") authority?: string) {
    return this.svc.listControls({ category, authority });
  }

  @Get("coverage")
  @RequirePermission("tenant:admin")
  coverage() {
    return this.svc.coverageReport();
  }

  @Post("controls")
  @RequirePermission("tenant:admin")
  register(@Body() body: ComplianceControlRecord) {
    return this.svc.upsertControl(body);
  }

  @Post("controls/:id/evidence")
  @RequirePermission("tenant:admin")
  evidence(@Param("id") id: string, @Body() body: Omit<EvidenceRecord, "control_id">) {
    return this.svc.addEvidence({ ...body, control_id: id });
  }
}
