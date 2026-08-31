import { Module } from "@nestjs/common";
import { AmbulanceController } from "./ambulance.controller";
import { AmbulanceService } from "./ambulance.service";
import { AmbulanceRepository } from "./ambulance.repository";
import { IdentityModule } from "../identity/identity.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
@Module({ imports:[IdentityModule,AuthModule,AuditModule], controllers:[AmbulanceController], providers:[AmbulanceService,AmbulanceRepository], exports:[AmbulanceService,AmbulanceRepository] })
export class AmbulanceModule {}
