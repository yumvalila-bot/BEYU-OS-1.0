import { Module } from "@nestjs/common";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { BillingRepository } from "./billing.repository";
import { IdentityModule } from "../identity/identity.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
@Module({ imports:[IdentityModule,AuthModule,AuditModule], controllers:[BillingController], providers:[BillingService,BillingRepository], exports:[BillingService,BillingRepository] })
export class BillingModule {}
