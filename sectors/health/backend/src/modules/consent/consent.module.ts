import { Module } from "@nestjs/common";
import { ConsentService } from "./consent.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
