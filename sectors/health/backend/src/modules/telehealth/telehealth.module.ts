import { Module } from "@nestjs/common";
import { TelehealthController } from "./telehealth.controller";
import { TelehealthService } from "./telehealth.service";
import { TelehealthRepository } from "./telehealth.repository";
import { IdentityModule } from "../identity/identity.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
@Module({ imports:[IdentityModule,AuthModule,AuditModule], controllers:[TelehealthController], providers:[TelehealthService,TelehealthRepository], exports:[TelehealthService,TelehealthRepository] })
export class TelehealthModule {}
