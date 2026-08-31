import { Module } from "@nestjs/common";
import { SignaturesService } from "./signatures.service";
import { LegalHoldsService } from "./legal-holds.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  providers: [SignaturesService, LegalHoldsService],
  exports: [SignaturesService, LegalHoldsService],
})
export class RecordsModule {}
