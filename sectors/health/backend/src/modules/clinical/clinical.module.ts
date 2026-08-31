import { Module } from "@nestjs/common";
import { ClinicalController } from "./clinical.controller";
import { ClinicalService } from "./clinical.service";
import { ClinicalRepository } from "./clinical.repository";
import { IdentityModule } from "../identity/identity.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [IdentityModule, AuthModule],
  controllers: [ClinicalController],
  providers: [ClinicalService, ClinicalRepository],
  exports: [ClinicalService, ClinicalRepository],
})
export class ClinicalModule {}
