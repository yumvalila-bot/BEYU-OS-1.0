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

const adminUrl = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;

if (!adminUrl) {
  throw new Error("BEYU_ADMIN_DATABASE_URL (or DATABASE_URL) is required");
}

const globalForAdmin = globalThis as typeof globalThis & {
  __beyuAdminPostgresqlPool?: Pool;
};

export const adminPool =
  globalForAdmin.__beyuAdminPostgresqlPool ??
  new Pool({
    connectionString: adminUrl,
    max: 5,
  });

if (process.env.NODE_ENV !== "production") {
  globalForAdmin.__beyuAdminPostgresqlPool = adminPool;
}

export const adminDb = drizzle(adminPool);
