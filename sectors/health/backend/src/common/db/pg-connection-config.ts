import type { PoolConfig } from "pg";

/**
 * The ONE Health OS database connection contract.
 *
 * Before this module existed, two providers built two different pools from
 * two different environment contracts: the domain modules read
 * `DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_DATABASE` (with a superuser
 * `postgres`/`password`@localhost default), while the identity module read
 * `DATABASE_URL`. Production boot validation only requires `DATABASE_URL`, so
 * a production process configured exactly as validated would have run its
 * identity path against one database/role and every domain module against
 * another (or against the localhost superuser default). Every connection now
 * comes from this single function.
 *
 * Contract:
 *   • `DATABASE_URL` is the canonical DSN and is REQUIRED in production.
 *   • Outside production only, when `DATABASE_URL` is absent, the legacy
 *     `DB_*` variables are accepted so the package's own docker-compose
 *     development stack keeps working unchanged.
 *   • Production TLS: for any non-local host the pool verifies the server
 *     certificate (`rejectUnauthorized: true`). A DSN that explicitly disables
 *     TLS (`sslmode=disable`, `ssl=false`) for a non-local host is REFUSED —
 *     node-postgres lets DSN parameters override the pool config, so without
 *     this check a single query-string flag would silently strip TLS.
 *
 * Never logs or returns credential material; errors name variables only.
 */

export type ConfigReader = (key: string) => string | undefined;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLocalHost(host: string | undefined | null): boolean {
  if (!host) return true; // unix socket / libpq default host
  return LOCAL_HOSTS.has(host) || host.startsWith("/");
}

export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigError";
  }
}

export function buildPgPoolConfig(read: ConfigReader): PoolConfig {
  const nodeEnv = read("NODE_ENV") ?? "development";
  const isProd = nodeEnv === "production";
  const pool: Pick<
    PoolConfig,
    "max" | "idleTimeoutMillis" | "connectionTimeoutMillis"
  > = {
    max: isProd ? 20 : 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };

  const url = read("DATABASE_URL");
  if (url) {
    let host: string | undefined;
    let tlsDisabled: boolean;
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol !== "postgres:" &&
        parsed.protocol !== "postgresql:"
      ) {
        throw new Error("scheme");
      }
      // `?host=` overrides the authority (libpq semantics, e.g. unix sockets).
      host = parsed.searchParams.get("host") ?? (parsed.hostname || undefined);
      const sslmode = parsed.searchParams.get("sslmode")?.toLowerCase();
      const ssl = parsed.searchParams.get("ssl")?.toLowerCase();
      tlsDisabled = sslmode === "disable" || ssl === "false" || ssl === "0";
    } catch {
      throw new DatabaseConfigError(
        "DATABASE_URL is not a valid PostgreSQL DSN",
      );
    }
    if (isProd && !isLocalHost(host) && tlsDisabled) {
      throw new DatabaseConfigError(
        "DATABASE_URL disables TLS for a non-local host in production — refused (remove sslmode=disable / ssl=false)",
      );
    }
    return {
      connectionString: url,
      ...pool,
      ...(isProd && !isLocalHost(host)
        ? { ssl: { rejectUnauthorized: true } }
        : {}),
    };
  }

  if (isProd) {
    throw new DatabaseConfigError(
      "DATABASE_URL is required in production (the DB_* fallback is development-only)",
    );
  }

  // Development / docker-compose fallback only.
  return {
    host: read("DB_HOST") ?? "localhost",
    port: Number(read("DB_PORT") ?? 5432),
    user: read("DB_USERNAME") ?? "postgres",
    password: read("DB_PASSWORD") ?? "",
    database: read("DB_DATABASE") ?? "beyu_health",
    ...pool,
  };
}
