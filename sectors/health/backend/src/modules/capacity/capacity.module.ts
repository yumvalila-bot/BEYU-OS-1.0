import { Module } from "@nestjs/common";
import { CapacityController } from "./capacity.controller";
import { CapacityService } from "./capacity.service";
import {
  BedAllocationRepository,
  BedRepository,
  PatientFlowRepository,
  ServiceTurnaroundRepository,
  WardRepository,
} from "./capacity.repository";
import { IdentityModule } from "../identity/identity.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { EventsModule } from "../events/events.module";

/**
 * Capacity domain: wards, beds, allocation, turnaround and patient flow.
 *
 * Depends on the canonical AuditModule (one hash-chained ledger) and the
 * canonical EventsModule outbox (one governed event surface) — the domain adds
 * no logging or messaging of its own.
 */
@Module({
  imports: [IdentityModule, AuthModule, AuditModule, EventsModule],
  controllers: [CapacityController],
  providers: [
    CapacityService,
    WardRepository,
    BedRepository,
    BedAllocationRepository,
    ServiceTurnaroundRepository,
    PatientFlowRepository,
  ],
  exports: [CapacityService, BedAllocationRepository, BedRepository],
})
export class CapacityModule {}
