import { Module } from "@nestjs/common";
import { ReferralController } from "./referrals.controller";
import { ReferralService, ReferralEventRepository, ReferralRepository } from "./referrals.service";
import { IdentityModule } from "../identity/identity.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { EventsModule } from "../events/events.module";

/**
 * Referral domain. Document availability is resolved against the continuity
 * module's clinical-document registry, and the consent link against the
 * canonical consent table — this module owns the workflow, not the artefacts.
 */
@Module({
  imports: [IdentityModule, AuthModule, AuditModule, EventsModule],
  controllers: [ReferralController],
  providers: [ReferralService, ReferralRepository, ReferralEventRepository],
  exports: [ReferralService, ReferralRepository],
})
export class ReferralModule {}
