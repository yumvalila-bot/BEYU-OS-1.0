/**
 * Phase 8 regression — role-level DDL privilege contract.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Migration 032 (`032_federation_read_grants`) creates the
 * `beyu_health_federation_read` role: `CREATE ROLE` / `COMMENT ON ROLE` require
 * CREATEROLE and can NEVER run through the NOSUPERUSER application role. At the
 * Phase 3-7 merge this broke every spec that replayed the full migration set
 * through `createTestDbConnection()` ("permission denied"), and CI did not see
 * it because the real-PG job step omitted the affected suite.
 *
 * This spec pins the routing contract that keeps that class of failure from
 * returning:
 *   1. `migrationRequiresPrivilegedRole()` classifies role-level DDL precisely;
 *   2. the set of migrations that require the privileged channel is exactly
 *      what the contract expects (update THIS list deliberately when adding
 *      role-level DDL to a migration);
 *   3. the full migration set applies cleanly through the shared harness
 *      (`createTestDbConnectionWithMigrationRole`) and produces a constrained
 *      NOLOGIN role — the Phase 5 least-privilege shape — on both PGlite and
 *      real PostgreSQL.
 */
import { describe, it, expect, afterAll } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import {
  migrationRequiresPrivilegedRole,
  readHealthMigrations,
} from "./migration-governance";
import {
  createTestDbConnectionWithMigrationRole,
  type TestDbWithMigrationRole,
} from "../modules/identity/test-connection";

const MIGRATIONS_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "database",
  "migrations",
);

describe("migration role-DDL privilege contract", () => {
  it("classifies role-level DDL as requiring the privileged channel", () => {
    expect(migrationRequiresPrivilegedRole("CREATE ROLE r NOLOGIN;")).toBe(
      true,
    );
    expect(
      migrationRequiresPrivilegedRole("ALTER ROLE r NOSUPERUSER NOBYPASSRLS;"),
    ).toBe(true);
    expect(migrationRequiresPrivilegedRole("DROP ROLE r;")).toBe(true);
    expect(migrationRequiresPrivilegedRole("COMMENT ON ROLE r IS 'x';")).toBe(
      true,
    );
    expect(
      migrationRequiresPrivilegedRole(
        "DO $$ BEGIN IF NOT EXISTS (...) THEN CREATE ROLE r NOLOGIN; END IF; END $$;",
      ),
    ).toBe(true);
  });

  it("does not misclassify ordinary DDL or owner-level grants", () => {
    expect(migrationRequiresPrivilegedRole("CREATE TABLE t (id int);")).toBe(
      false,
    );
    expect(
      migrationRequiresPrivilegedRole("ALTER TABLE t ADD COLUMN c text;"),
    ).toBe(false);
    expect(
      migrationRequiresPrivilegedRole("CREATE SCHEMA IF NOT EXISTS s;"),
    ).toBe(false);
    // Owner-level table grants are fine on the application role; only role
    // DDL is routed to the privileged channel.
    expect(
      migrationRequiresPrivilegedRole(
        "GRANT SELECT ON t TO beyu_health_federation_read;",
      ),
    ).toBe(false);
    expect(
      migrationRequiresPrivilegedRole(
        "GRANT EXECUTE ON FUNCTION f() TO PUBLIC;",
      ),
    ).toBe(false);
  });

  it("the privileged-DDL migration surface is exactly the contract set", () => {
    const files = readHealthMigrations(MIGRATIONS_DIR);
    const privileged = files
      .filter((f) =>
        migrationRequiresPrivilegedRole(
          fs.readFileSync(path.join(MIGRATIONS_DIR, f.file), "utf8"),
        ),
      )
      .map((f) => f.file)
      .sort();
    // CONSCIOUS UPDATE REQUIRED to change this set: role-level DDL in a
    // migration is a governance event (it creates cluster-level authority).
    expect(privileged).toEqual(["032_federation_read_grants.up.sql"]);
  });

  describe("full migration set through the shared harness", () => {
    let db: TestDbWithMigrationRole | undefined;

    afterAll(async () => {
      if (db) await db.close();
    });

    it("applies cleanly and yields a constrained NOLOGIN federation-read role", async () => {
      db = await createTestDbConnectionWithMigrationRole();
      const files = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".up.sql"))
        .sort();
      expect(files.length).toBeGreaterThanOrEqual(32);
      for (const f of files) {
        await db.applySchemaSql(
          fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"),
        );
      }
      const rows = await (
        db.conn as unknown as {
          query: (sql: string) => Promise<
            Array<{
              rolcanlogin: boolean;
              rolsuper: boolean;
              rolbypassrls: boolean;
            }>
          >;
        }
      ).query(
        `SELECT rolcanlogin, rolsuper, rolbypassrls
           FROM pg_roles WHERE rolname = 'beyu_health_federation_read'`,
      );
      expect(rows.length).toBe(1);
      expect(rows[0]).toEqual({
        rolcanlogin: false,
        rolsuper: false,
        rolbypassrls: false,
      });
    });
  });
});
