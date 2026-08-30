import { Module, Global } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  PgConnection,
  DB_CONNECTION,
  type DbConnection,
} from "./db-connection";
import { IdentityRepository } from "./identity.repository";
import { SessionService } from "./session.service";
import { AuditService } from "./audit.service";
import { MfaService } from "./mfa.service";

/**
 * Identity foundation module — owns the persistent identity repositories and
 * services. In production a node-postgres connection is built from env config.
 * Integration tests construct the repositories with a PGlite connection directly.
 */
@Global()
@Module({
  providers: [
    {
      provide: DB_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService): DbConnection => {
        const connectionString =
          config.get<string>("DATABASE_URL") ||
          `postgres://${config.get("DB_USERNAME", "postgres")}:${config.get(
            "DB_PASSWORD",
            "",
          )}@${config.get("DB_HOST", "localhost")}:${config.get("DB_PORT", 5432)}/${config.get(
            "DB_DATABASE",
            "beyu_health",
          )}`;
        return new PgConnection({ connectionString });
      },
    },
    IdentityRepository,
    SessionService,
    AuditService,
    MfaService,
  ],
  exports: [
    DB_CONNECTION,
    IdentityRepository,
    SessionService,
    AuditService,
    MfaService,
  ],
})
export class IdentityModule {}
