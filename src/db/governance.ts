/**
 * Least-privileged governed-mutation database handle.
 *
 * This is intentionally NOT the migration/admin DSN. Request-path services that
 * mutate runtime-governing registries use a dedicated NOLOGIN-owner-independent,
 * NOSUPERUSER/NOBYPASSRLS role with a finite table allowlist. The production web
 * process must not receive BEYU_ADMIN_DATABASE_URL.
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { buildPgConnectionConfig } from "./tls";

const globalForGovernance = globalThis as typeof globalThis & {
  __beyuGovernancePostgresqlPool?: Pool;
};

function governanceDatabaseUrl(): string {
  const url = process.env.BEYU_GOVERNANCE_DATABASE_URL;
  if (!url) throw new Error("BEYU_GOVERNANCE_DATABASE_URL is required for governed request-path mutations");
  if (process.env.NODE_ENV === "production" && process.env.BEYU_ADMIN_DATABASE_URL && url === process.env.BEYU_ADMIN_DATABASE_URL) {
    throw new Error("BEYU_GOVERNANCE_DATABASE_URL must not use the migration/admin credential");
  }
  return url;
}

function createGovernancePool(): Pool {
  if (globalForGovernance.__beyuGovernancePostgresqlPool) return globalForGovernance.__beyuGovernancePostgresqlPool;
  const { connectionString, ssl } = buildPgConnectionConfig(governanceDatabaseUrl(), "BEYU_GOVERNANCE_DATABASE_URL");
  const pool = new Pool({ connectionString, ssl, max: 5, connectionTimeoutMillis: 10_000 });
  if (process.env.NODE_ENV !== "production") globalForGovernance.__beyuGovernancePostgresqlPool = pool;
  return pool;
}

let database: ReturnType<typeof drizzle> | undefined;
function getDatabase(): ReturnType<typeof drizzle> {
  return database ??= drizzle(createGovernancePool());
}

export const governanceDb = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, property) {
    const target = getDatabase();
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
