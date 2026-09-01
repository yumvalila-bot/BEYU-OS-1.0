import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { PharmacyService } from "./pharmacy.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { RequiresClinicalSafety } from "../../common/security/clinical-safety.guard";
import { RequireHcmPractitioner } from "../../integrations/beyu/guards/hcm-authorization.guard";

@ApiTags("pharmacy")
@ApiBearerAuth("access-token")
@Controller("api/pharmacy")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PharmacyController {
  constructor(private readonly svc: PharmacyService) {}

  @Get("items") @RequirePermission("inventory:read")
  listItems() { return this.svc.listItems(); }

  @Post("items") @RequirePermission("inventory:write")
  createItem(@Body() dto: Record<string, unknown>) { return this.svc.createCatalogItem(dto); }

  @Post("stock/receive") @RequirePermission("inventory:write")
  receive(@Body() dto: { item_id: string; lot_number: string; expiry_date: string; qty: number }) {
    return this.svc.receiveStock(dto);
  }

  @Post("dispense") @RequirePermission("rx:dispense") @RequiresClinicalSafety("pharmacy") @RequireHcmPractitioner("pharmacy.dispense", { scope: ["rx:dispense"] })
  dispense(@Body() dto: {
    medication_id: string; patient_id: string; item_id: string; qty: number;
    dose_given?: string; encounter_id?: string; idempotency_key?: string;
    prescriptionId: string; quantity: number; controlledSubstance?: boolean;
    secondReviewerGlobalUserId?: string; facilityId?: string; metadata?: Record<string, unknown>;
  }) {
    return this.svc.dispense(dto);
  }

  @Get("patients/:patientId/dispenses") @RequirePermission("phi:read")
  patientDispenses(@Param("patientId") patientId: string) {
    return this.svc.listPatientDispenses(patientId);
  }
}
