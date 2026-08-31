import { Module } from "@nestjs/common";
import { DialysisService } from "./dialysis.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  providers: [DialysisService],
  exports: [DialysisService],
})
export class DialysisModule {}
