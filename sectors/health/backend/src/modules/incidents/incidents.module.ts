import { Module } from "@nestjs/common";
import { IncidentsService } from "./incidents.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  providers: [IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
