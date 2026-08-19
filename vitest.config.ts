import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * BEYU OS test runner.
 *
 * Suites are a mix of pure engine tests and governed-mutation/integration tests
 * that require PostgreSQL. `dotenv/config` is loaded centrally as a setup file:
 * several kernel modules (policy.ts, authz.ts, audit.ts) transitively import
 * src/db, which requires DATABASE_URL at module load. Without this, the pure
 * engine suite fails to collect even though it exercises no database.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["dotenv/config"],
    // Governed-mutation suites share the audit hash chain and chain-head lock.
    // Running files serially keeps ledger assertions deterministic.
    fileParallelism: false,
  },
});
