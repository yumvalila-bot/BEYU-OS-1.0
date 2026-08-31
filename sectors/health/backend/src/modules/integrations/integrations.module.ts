import { Module, OnModuleInit } from "@nestjs/common";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { IntegrationsRepository } from "./integrations.repository";
import { IdentityModule } from "../identity/identity.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { AdapterRegistry, registerStubAdapters } from "./adapter-registry";

@Module({
  imports: [IdentityModule, AuthModule, AuditModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, IntegrationsRepository, AdapterRegistry],
  exports: [IntegrationsService, IntegrationsRepository, AdapterRegistry],
})
export class IntegrationsModule implements OnModuleInit {
  constructor(private readonly registry: AdapterRegistry) {}
  onModuleInit() {
    registerStubAdapters(this.registry);
  }
}
