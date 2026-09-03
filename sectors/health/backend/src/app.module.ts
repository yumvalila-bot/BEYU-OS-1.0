import { Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { CacheModule } from "@nestjs/cache-manager";
import { BullModule } from "@nestjs/bull";
import { APP_GUARD } from "@nestjs/core";
import { TenantContextMiddleware } from "./common/security/tenant-context.middleware";
import { AuthContextMiddleware } from "./common/security/auth-context.middleware";
import { PermissionsGuard } from "./common/security/permissions.guard";
import { CsrfDoubleSubmitGuard } from "./common/security/csrf-double-submit.guard";
import { JwtAuthGuard } from "./modules/auth/guards/jwt.guard";
import { ClinicalSafetyGuard } from "./common/security/clinical-safety.guard";
import { LegalHoldGuard } from "./common/security/legal-hold.guard";
import { MfaStepUpGuard } from "./common/security/mfa-stepup.guard";
import { ConsentGuard } from "./common/security/consent.guard";
import { RateLimiter } from "./common/security/rate-limiter";
import { QueueService } from "./common/queue/queue.service";
import { HcmAuthorizationGuard } from "./integrations/beyu/guards/hcm-authorization.guard";
import { GovernanceAuthorizationGuard } from "./integrations/beyu/guards/governance-authorization.guard";
import { CommonSecurityModule } from "./common/security/common-security.module";
import { CorrelationIdMiddleware } from "./common/observability/correlation-id.middleware";

// Configuration
import databaseConfig from "./config/database.config";
import { DbModule } from "./common/db/db.module";

// Modules
import { AuthModule } from "./modules/auth/auth.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { TenantsModule } from "./modules/tenants/tenants.module";
import { HealthModule } from "./modules/health/health.module";
import { PatientsModule } from "./modules/patients/patients.module";
import { EncountersModule } from "./modules/encounters/encounters.module";
import { ClinicalModule } from "./modules/clinical/clinical.module";
import { AppointmentsModule } from "./modules/appointments/appointments.module";
import { PharmacyModule } from "./modules/pharmacy/pharmacy.module";
import { LaboratoryModule } from "./modules/laboratory/laboratory.module";
import { RadiologyModule } from "./modules/radiology/radiology.module";
import { OphthalmologyModule } from "./modules/ophthalmology/ophthalmology.module";
import { BillingModule } from "./modules/billing/billing.module";
import { AmbulanceModule } from "./modules/ambulance/ambulance.module";
import { TelehealthModule } from "./modules/telehealth/telehealth.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { AuditModule } from "./modules/audit/audit.module";
import { SearchModule } from "./modules/search/search.module";
import { FhirModule } from "./modules/fhir/fhir.module";
import { AiModule } from "./modules/ai/ai.module";
import { IntegrationsModule } from "./modules/integrations/integrations.module";
import { ReportingModule } from "./modules/reporting/reporting.module";
import { ComplianceModule } from "./modules/compliance/compliance.module";
import { DialysisModule } from "./modules/dialysis/dialysis.module";
import { ConsentModule } from "./modules/consent/consent.module";
import { IncidentsModule } from "./modules/incidents/incidents.module";
import { RecordsModule } from "./modules/records/records.module";
import { BeyuIntegrationModule } from "./integrations/beyu/beyu.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
      expandVariables: true,
    }),
    CommonSecurityModule,
    DbModule.forRoot(),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      useFactory: (configService: ConfigService) => ({
        autoSchemaFile: true,
        playground: configService.get("NODE_ENV") === "development",
        context: ({ req }: { req: Express.Request }) => ({ req }),
        introspection: configService.get("NODE_ENV") !== "production",
      }),
      inject: [ConfigService],
    }),
    CacheModule.register({ isGlobal: true, ttl: 60000, max: 100 }),
    ...(process.env.REDIS_HOST
      ? [
          BullModule.forRootAsync({
            useFactory: (configService: ConfigService) => ({
              redis: {
                host: configService.get("REDIS_HOST"),
                port: configService.get("REDIS_PORT", 6379),
                password: configService.get("REDIS_PASSWORD") ?? undefined,
              },
            }),
            inject: [ConfigService],
          }),
        ]
      : []),
    HealthModule,
    AuthModule,
    IdentityModule,
    TenantsModule,
    PatientsModule,
    EncountersModule,
    ClinicalModule,
    AppointmentsModule,
    PharmacyModule,
    LaboratoryModule,
    RadiologyModule,
    OphthalmologyModule,
    BillingModule,
    AmbulanceModule,
    TelehealthModule,
    NotificationsModule,
    AuditModule,
    SearchModule,
    FhirModule,
    AiModule,
    IntegrationsModule,
    ReportingModule,
    ComplianceModule,
    DialysisModule,
    ConsentModule,
    IncidentsModule,
    RecordsModule,
    BeyuIntegrationModule,
  ],
  providers: [
    RateLimiter,
    QueueService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfDoubleSubmitGuard },
    { provide: APP_GUARD, useClass: MfaStepUpGuard },
    { provide: APP_GUARD, useClass: ClinicalSafetyGuard },
    { provide: APP_GUARD, useClass: HcmAuthorizationGuard },
    { provide: APP_GUARD, useClass: LegalHoldGuard },
    { provide: APP_GUARD, useClass: ConsentGuard },
    { provide: APP_GUARD, useClass: GovernanceAuthorizationGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        CorrelationIdMiddleware,
        TenantContextMiddleware,
        AuthContextMiddleware,
      )
      .forRoutes("*");
  }
}
