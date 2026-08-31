import { Module } from "@nestjs/common";
import { LaboratoryController } from "./laboratory.controller";
import { LaboratoryService } from "./laboratory.service";
import { LaboratoryRepository } from "./laboratory.repository";
import { IdentityModule } from "../identity/identity.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [IdentityModule, AuthModule, AuditModule],
  controllers: [LaboratoryController],
  providers: [LaboratoryService, LaboratoryRepository],
  exports: [LaboratoryService, LaboratoryRepository],
})
export class LaboratoryModule {}
