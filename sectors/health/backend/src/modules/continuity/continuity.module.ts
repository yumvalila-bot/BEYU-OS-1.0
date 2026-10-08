import { Module } from "@nestjs/common";
import { ContinuityController } from "./continuity.controller";
import { ContinuityService } from "./continuity.service";
import {
  CarePlanRepository,
  CareTaskRepository,
  ClinicalDocumentRepository,
  DischargeSummaryRepository,
  FollowupRepository,
} from "./continuity.repository";
import { IdentityModule } from "../identity/identity.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { EventsModule } from "../events/events.module";

/**
 * Continuity-of-care domain. Reuses the canonical audit ledger and governed
 * event outbox; adds no logging or messaging of its own.
 */
@Module({
  imports: [IdentityModule, AuthModule, AuditModule, EventsModule],
  controllers: [ContinuityController],
  providers: [
    ContinuityService,
    CarePlanRepository,
    CareTaskRepository,
    DischargeSummaryRepository,
    FollowupRepository,
    ClinicalDocumentRepository,
  ],
  exports: [ContinuityService, CarePlanRepository, ClinicalDocumentRepository],
})
export class ContinuityModule {}
