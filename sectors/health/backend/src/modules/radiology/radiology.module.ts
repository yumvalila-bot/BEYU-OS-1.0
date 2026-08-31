import { Module } from "@nestjs/common";
import { RadiologyController } from "./radiology.controller";
import { RadiologyService } from "./radiology.service";
import { RadiologyRepository } from "./radiology.repository";
import { IdentityModule } from "../identity/identity.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
@Module({ imports:[IdentityModule,AuthModule,AuditModule], controllers:[RadiologyController], providers:[RadiologyService,RadiologyRepository], exports:[RadiologyService,RadiologyRepository] })
export class RadiologyModule {}
