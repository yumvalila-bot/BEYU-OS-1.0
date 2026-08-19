import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration.
 *
 * The connection string is read from DATABASE_URL only — no credentials are ever
 * committed to source control (SECURITY.md, .env.example).
 *
 * Migration authoring:  npx drizzle-kit generate
 * Migration APPLICATION: npm run migrate  (scripts/migrate.ts is the only runner;
 * `drizzle-kit push` must never be used against a non-development database).
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for drizzle-kit");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
});
