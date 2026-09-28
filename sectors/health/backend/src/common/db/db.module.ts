import { Global, Module, DynamicModule } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DB_CONNECTION,
  DbConnection,
  PgConnection,
} from "../../modules/identity/db-connection";
import { buildPgPoolConfig } from "./pg-connection-config";

/**
 * Shared database module — the ONE provider of DB_CONNECTION for the whole
 * Health backend (domain modules AND the identity module resolve this same
 * pool; the identity module no longer builds a second one).
 *
 * Connection parameters come exclusively from `buildPgPoolConfig`
 * (./pg-connection-config.ts): `DATABASE_URL` is canonical and required in
 * production; the legacy DB_* variables are a development-only fallback.
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
        return new PgConnection(
          buildPgPoolConfig((key) => config.get<string>(key)),
        );
      },
    };

    return {
      module: DbModule,
      providers: [connectionProvider],
      exports: [connectionProvider],
    };
  }
}
