import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { BillingService } from "./billing.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { RequiresMfaStepUp } from "../../common/security/mfa-stepup.guard";

@ApiTags("billing")
@ApiBearerAuth("access-token")
@Controller("api/billing")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BillingController {
  constructor(private readonly svc: BillingService) {}
  @Get("services") @RequirePermission("billing:read") services() { return this.svc.listServices(); }
  @Post("services") @RequirePermission("billing:write") @RequiresMfaStepUp("billing:service:create") addService(@Body() d: any) { return this.svc.createService(d); }
  @Get("invoices") @RequirePermission("billing:read") list(@Query("patient_id") p: string) { return this.svc.listForPatient(p); }
  @Get("invoices/:id") @RequirePermission("billing:read") get(@Param("id") id: string) { return this.svc.getInvoice(id); }
  @Post("invoices") @RequirePermission("billing:write") @RequiresMfaStepUp("billing:invoice:create") create(@Body() d: any) { return this.svc.createInvoice(d); }
  @Post("payments") @RequirePermission("payment:receive") @RequiresMfaStepUp("billing:payment:record") pay(@Body() d: any) { return this.svc.recordPayment(d); }
}
