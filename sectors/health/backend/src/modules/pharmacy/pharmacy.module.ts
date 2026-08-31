import { Module } from "@nestjs/common";
import { PharmacyController } from "./pharmacy.controller";
import { PharmacyService } from "./pharmacy.service";
import { PharmacyRepository } from "./pharmacy.repository";
import { IdentityModule } from "../identity/identity.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [IdentityModule, AuthModule, AuditModule],
  controllers: [PharmacyController],
  providers: [PharmacyService, PharmacyRepository],
  exports: [PharmacyService, PharmacyRepository],
})
export class PharmacyModule {}
