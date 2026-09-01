import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { LaboratoryService } from "./laboratory.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { RequiresClinicalSafety } from "../../common/security/clinical-safety.guard";
import { RequireHcmPractitioner } from "../../integrations/beyu/guards/hcm-authorization.guard";

@ApiTags("laboratory")
@ApiBearerAuth("access-token")
@Controller("api/lab")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LaboratoryController {
  constructor(private readonly svc: LaboratoryService) {}
  @Get("tests") @RequirePermission("order:lab") listTests() { return this.svc.listTests(); }
  @Post("tests") @RequirePermission("order:lab") @RequiresClinicalSafety("lab") createTest(@Body() d: Record<string, unknown>) { return this.svc.createTest(d); }
  @Get("orders") @RequirePermission("phi:read") listOrders(@Query("patient_id") p?: string) { return this.svc.listOrders(p); }
  @Post("orders") @RequirePermission("order:lab") @RequiresClinicalSafety("lab") createOrder(@Body() d: any) { return this.svc.createOrder(d); }
  @Post("orders/:id/transition") @RequirePermission("order:lab") @RequiresClinicalSafety("lab")
  transition(@Param("id") id: string, @Body("to") to: string) { return this.svc.transition(id, to); }
  @Post("results/:itemId") @RequirePermission("phi:write") @RequireHcmPractitioner("lab.result.enter", { scope: ["lab:result"] }) @RequiresClinicalSafety("general")
  enterResult(@Param("itemId") id: string, @Body() d: any) { return this.svc.enterResult(id, d); }
  @Post("results/:itemId/verify") @RequirePermission("order:lab") @RequiresClinicalSafety("lab") @RequireHcmPractitioner("lab.result.verify", { scope: ["lab:verify", "order:lab"] })
  verify(
    @Param("itemId") id: string,
    @Body() d: {
      verifiedByGlobalUserId?: string; qcPassed?: boolean; specimenIntegrity?: boolean;
      analyzerAuthorized?: boolean; criticalResult?: boolean; criticalCallbackLogged?: boolean;
      facilityId?: string; metadata?: Record<string, unknown>;
    } = {},
  ) { return this.svc.verifyResult(id, d); }
}
