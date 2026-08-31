import { Controller, Get, Post, Body, Query, UseGuards } from "@nestjs/common";
import { ReportingService } from "./reporting.service";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";

@Controller("reporting")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportingController {
  constructor(private readonly svc: ReportingService) {}

  @Get("mtuha")
  @RequirePermission("report:read")
  generate(@Query("period_start") start: string, @Query("period_end") end: string) {
    return this.svc.generatePeriodReport(start, end);
  }

  @Get("mtuha/submissions")
  @RequirePermission("report:read")
  list(@Query("period_start") start: string, @Query("period_end") end: string) {
    return this.svc.listReports(start, end);
  }

  @Post("mtuha/mark-submitted")
  @RequirePermission("report:submit")
  markSubmitted(@Body() body: any) {
    return this.svc.markSubmitted(body);
  }
}
