import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { BillingService } from "./billing.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { RequiresMfaStepUp } from "../../common/security/mfa-stepup.guard";
import { RequiresGovernance } from "../../integrations/beyu/guards/governance-authorization.guard";

@ApiTags("billing")
@ApiBearerAuth("access-token")
@Controller("api/billing")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BillingController {
  constructor(private readonly svc: BillingService) {}
  @Get("services")
  @RequirePermission("billing:read")
  @RequiresGovernance("billing.service.read", "low")
  services() {
    return this.svc.listServices();
  }
  @Post("services")
  @RequirePermission("billing:write")
  @RequiresMfaStepUp("billing:service:create")
  @RequiresGovernance("billing.service.create", "medium")
  addService(@Body() d: any) {
    return this.svc.createService(d);
  }
  @Get("invoices")
  @RequirePermission("billing:read")
  @RequiresGovernance("billing.invoice.list", "low")
  list(@Query("patient_id") p: string) {
    return this.svc.listForPatient(p);
  }
  @Get("invoices/:id")
  @RequirePermission("billing:read")
  @RequiresGovernance("billing.invoice.read", "low")
  get(@Param("id") id: string) {
    return this.svc.getInvoice(id);
  }
  @Post("invoices")
  @RequirePermission("billing:write")
  @RequiresMfaStepUp("billing:invoice:create")
  @RequiresGovernance("billing.invoice.create", "high")
  create(@Body() d: any) {
    return this.svc.createInvoice(d);
  }
  @Post("payments")
  @RequirePermission("payment:receive")
  @RequiresMfaStepUp("billing:payment:record")
  @RequiresGovernance("billing.payment.record", "high")
  pay(@Body() d: any) {
    return this.svc.recordPayment(d);
  }
}
