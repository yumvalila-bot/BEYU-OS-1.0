import { Global, Module, DynamicModule } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PoolConfig } from "pg";
import {
  DB_CONNECTION,
  DbConnection,
  PgConnection,
} from "../../modules/identity/db-connection";

/**
 * Shared database module. Provides the DB_CONNECTION (PgConnection for
 * production) globally so every domain module can inject the canonical pool.
 *
 * Connection parameters are read from the ConfigService (see config/
 * database.config.ts): DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD,
 * DB_DATABASE.
 *
 * The identity module also uses a PGlite in-memory instance for isolated
 * integration tests; that test-only factory remains in identity/db-connection.ts.
 */
@Global()
@Module({})
export class DbModule {
  static forRoot(): DynamicModule {
    const connectionProvider = {
      provide: DB_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService): DbConnection => {
        const nodeEnv = config.get<string>("NODE_ENV", "development");
        if (nodeEnv === "test") {
          // Tests build their own PGliteConnection via PGliteConnectionFactory
          // and override DB_CONNECTION at the test module level. Returning
          // a placeholder here keeps production wiring from requiring a real
          // PG server during unit tests.
          throw new Error(
            "DB_CONNECTION must be overridden in test modules; use PGliteConnectionFactory.",
          );
        }
        const pgConfig: PoolConfig = {
          host: config.get<string>("DB_HOST", "localhost"),
          port: config.get<number>("DB_PORT", 5432),
          user: config.get<string>("DB_USERNAME", "postgres"),
          password: config.get<string>("DB_PASSWORD", "password"),
          database: config.get<string>("DB_DATABASE", "beyu_health"),
          max: nodeEnv === "production" ? 20 : 10,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 10_000,
          // Always require TLS in production when the host is non-localhost.
          ssl:
            nodeEnv === "production" &&
            config.get<string>("DB_HOST", "localhost") !== "localhost"
              ? { rejectUnauthorized: true }
              : undefined,
        };
        return new PgConnection(pgConfig);
      },
    };

    return {
      module: DbModule,
      providers: [connectionProvider],
      exports: [connectionProvider],
    };
  }
}
