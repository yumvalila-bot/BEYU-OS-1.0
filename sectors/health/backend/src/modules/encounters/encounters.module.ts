import { Module } from "@nestjs/common";
import { EncountersController } from "./encounters.controller";
import { EncountersService } from "./encounters.service";
import { EncounterRepository } from "./encounter.repository";
import { IdentityModule } from "../identity/identity.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [IdentityModule, AuthModule],
  controllers: [EncountersController],
  providers: [EncountersService, EncounterRepository],
  exports: [EncountersService, EncounterRepository],
})
export class EncountersModule {}
