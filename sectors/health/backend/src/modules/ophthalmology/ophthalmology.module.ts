import { Module } from "@nestjs/common";
import { OphthalmologyController } from "./ophthalmology.controller";
import { OphthalmologyService } from "./ophthalmology.service";
import { OphthalmologyRepository } from "./ophthalmology.repository";
import { IdentityModule } from "../identity/identity.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
@Module({ imports:[IdentityModule,AuthModule,AuditModule], controllers:[OphthalmologyController], providers:[OphthalmologyService,OphthalmologyRepository], exports:[OphthalmologyService,OphthalmologyRepository] })
export class OphthalmologyModule {}
