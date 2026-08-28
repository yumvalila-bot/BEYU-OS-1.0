import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration.
 *
 * drizzle-kit is a schema-DDL tool and therefore connects with the
 * migration/admin (superuser) role via BEYU_ADMIN_DATABASE_URL, never the
 * RLS-subject runtime role. No credentials are ever committed to source control
 * (SECURITY.md, .env.example).
 *
 * Migration authoring:  npx drizzle-kit generate
 * Migration APPLICATION: npm run migrate  (scripts/migrate.ts is the only runner;
 * `drizzle-kit push` must never be used against a non-development database).
 */
const url = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("BEYU_ADMIN_DATABASE_URL (or DATABASE_URL) is required for drizzle-kit");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
});
