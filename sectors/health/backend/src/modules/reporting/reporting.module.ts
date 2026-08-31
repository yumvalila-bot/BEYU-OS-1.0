import { Module } from "@nestjs/common";
import { ReportingController } from "./reporting.controller";
import { ReportingService } from "./reporting.service";
import { ReportingRepository } from "./reporting.repository";
import { IdentityModule } from "../identity/identity.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [IdentityModule, AuthModule, AuditModule],
  controllers: [ReportingController],
  providers: [ReportingService, ReportingRepository],
  exports: [ReportingService, ReportingRepository],
})
export class ReportingModule {}
