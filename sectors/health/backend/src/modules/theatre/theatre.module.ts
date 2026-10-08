import { Module } from "@nestjs/common";
import { TheatreController } from "./theatre.controller";
import {
  AnaesthesiaRepository,
  PreopChecklistRepository,
  PreopItemRepository,
  SurgicalCaseRepository,
  SurgicalTeamRepository,
  TheatreRepository,
  TheatreService,
} from "./theatre.service";
import { IdentityModule } from "../identity/identity.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { EventsModule } from "../events/events.module";
import { CapacityModule } from "../capacity/capacity.module";

/**
 * Theatre domain. Recovery beds and turnaround requests are DELEGATED to
 * CapacityModule rather than modelled again here, so there is one bed registry
 * with one occupancy truth.
 */
@Module({
  imports: [
    IdentityModule,
    AuthModule,
    AuditModule,
    EventsModule,
    CapacityModule,
  ],
  controllers: [TheatreController],
  providers: [
    TheatreService,
    TheatreRepository,
    SurgicalCaseRepository,
    SurgicalTeamRepository,
    PreopChecklistRepository,
    PreopItemRepository,
    AnaesthesiaRepository,
  ],
  exports: [TheatreService, SurgicalCaseRepository],
})
export class TheatreModule {}
