import { Module } from "@nestjs/common";
import { DialysisService } from "./dialysis.service";
import { DialysisController } from "./dialysis.controller";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  controllers: [DialysisController],
  providers: [DialysisService],
  exports: [DialysisService],
})
export class DialysisModule {}
