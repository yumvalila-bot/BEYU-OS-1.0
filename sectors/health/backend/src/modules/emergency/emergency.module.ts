import { Module } from "@nestjs/common";
import { EmergencyController } from "./emergency.controller";
import { EmergencyService } from "./emergency.service";
import {
  EscalationRepository,
  HandoverRepository,
  ResusRepository,
  TriageRepository,
} from "./emergency.service";
import { IdentityModule } from "../identity/identity.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { EventsModule } from "../events/events.module";

/**
 * Emergency operations: triage, escalation, SBAR handover and resuscitation
 * records. Escalations reuse the ward/bed registry from the capacity domain by
 * reference only — no duplicate bed state is kept here.
 */
@Module({
  imports: [IdentityModule, AuthModule, AuditModule, EventsModule],
  controllers: [EmergencyController],
  providers: [
    EmergencyService,
    TriageRepository,
    EscalationRepository,
    HandoverRepository,
    ResusRepository,
  ],
  exports: [EmergencyService, TriageRepository],
})
export class EmergencyModule {}
