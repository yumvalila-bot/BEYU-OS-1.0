/**
 * BEYU OS — administrative database handle (C-02 remediation).
 *
 * Distinct from the runtime `db` in `./index`. The runtime handle connects with
 * the non-superuser application role and is subject to Row Level Security. The
 * admin handle connects with the migration/admin (superuser) role and is used
 * ONLY by privileged, one-time or off-path operations that legitimately need
 * DDL / bootstrap / seed authority:
 *
 *   - scripts/migrate.ts          (schema migrations)
 *   - src/db/seed.ts              (constitutional bootstrap)
 *   - drizzle-kit                  (migration authoring)
 *   - the RLS probe test          (creating a throwaway non-superuser probe role)
 *
 * The admin handle is NEVER used by the runtime application request path.
 *
 * Credentials are read from BEYU_ADMIN_DATABASE_URL and fall back to
 * DATABASE_URL for environments that still share one connection string. No
 * credentials are ever hardcoded or committed.
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const globalForAdmin = globalThis as typeof globalThis & {
  __beyuAdminPostgresqlPool?: Pool;
};

function adminDatabaseUrl(): string {
  const url = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("BEYU_ADMIN_DATABASE_URL (or DATABASE_URL) is required");
  }
  return url;
}

function createAdminPool(): Pool {
  const existing = globalForAdmin.__beyuAdminPostgresqlPool;
  if (existing) return existing;
  const created = new Pool({
    connectionString: adminDatabaseUrl(),
    max: 5,
    connectionTimeoutMillis: 10_000,
  });
  if (process.env.NODE_ENV !== "production") {
    globalForAdmin.__beyuAdminPostgresqlPool = created;
  }
  return created;
}

function lazyAdminPool(): Pool {
  let instance: Pool | undefined;
  const get = () => (instance ??= createAdminPool());
  return new Proxy({} as Pool, {
    get(_target, property) {
      const value = Reflect.get(get(), property, get());
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(get()) : value;
    },
    set(_target, property, value) {
      Reflect.set(get(), property, value);
      return true;
    },
    has(_target, property) {
      return property in get();
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(get());
    },
    ownKeys() {
      return Reflect.ownKeys(get());
    },
    getOwnPropertyDescriptor(_target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(get(), property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  });
}

export const adminPool: Pool = lazyAdminPool();

function lazyAdminDb(): ReturnType<typeof drizzle> {
  let instance: ReturnType<typeof drizzle> | undefined;
  const get = () => (instance ??= drizzle(adminPool));
  return new Proxy({} as ReturnType<typeof drizzle>, {
    get(_target, property) {
      const value = Reflect.get(get(), property, get());
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(get()) : value;
    },
    set(_target, property, value) {
      Reflect.set(get(), property, value);
      return true;
    },
    has(_target, property) {
      return property in get();
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(get());
    },
    ownKeys() {
      return Reflect.ownKeys(get());
    },
    getOwnPropertyDescriptor(_target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(get(), property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  });
}

export const adminDb = lazyAdminDb();
