/**
 * Test database connection factory.
 *
 * When `TEST_DATABASE_URL` (or `DATABASE_URL`) is set, integration tests run
 * against a REAL PostgreSQL server via `PgConnection`. When unset (the default,
 * e.g. CI without a server), tests fall back to PGlite — a genuine in-process
 * PostgreSQL engine — so the same test suite still executes against real SQL.
 *
 * Isolation model (real server): each call gets its OWN freshly-created scratch
 * database (created on demand, dropped on close). This mirrors the per-spec
 * isolation PGlite gives by default (a fresh in-memory database per instance),
 * so repeated `ensureSchema()` calls from independent specs do not collide —
 * and because the scratch database is fresh, the double-`ensureSchema()` guards
 * in the specs still exercise the idempotency of `IDENTITY_SCHEMA_SQL`.
 *
 * Two factories are provided:
 *  - `createTestDbConnection()` connects as the `TEST_DATABASE_URL` role (the
 *    application role, e.g. `beyu_app`) and owns the scratch DB it creates —
 *    this is the "application database role" path used by the functional specs.
 *  - `createTestSuperuserConnection()` connects as `TEST_DATABASE_URL_SUPERUSER`
 *    (fallback: the same URL). It is required by the RLS-isolation spec, which
 *    exercises non-owner policies by `SET ROLE` to a helper role — an operation
 *    only a superuser session may perform (mirroring the Phase 1F-A manual
 *    superuser harness).
 *
 * This lets the full backend suite be run against a real PostgreSQL instance
 * (Phase 1F-A STEP 12) without removing PGlite as the default engine.
 */
import { randomUUID } from "crypto";
import { PGlite } from "@electric-sql/pglite";
import { Client } from "pg";
import { PgConnection, PGliteConnection } from "./db-connection";
import { migrationRequiresPrivilegedRole } from "../../database/migration-governance";

export type TestDbConnection = PgConnection | PGliteConnection;

interface ConnInfo {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function parseConnectionString(url: string): ConnInfo {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  };
}

async function createScratchDatabase(base: ConnInfo): Promise<{
  url: string;
  scratchName: string;
  drop: () => Promise<void>;
}> {
  const scratchName = `test_${randomUUID().replace(/-/g, "")}`;
  const admin = new Client({ ...base, database: "postgres" });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${scratchName}"`);
  } finally {
    await admin.end();
  }

  const url = new URL(
    `postgresql://${encodeURIComponent(base.user)}:${encodeURIComponent(
      base.password,
    )}@${base.host}:${base.port}/${scratchName}`,
  ).toString();

  const drop = async () => {
    const term = new Client({ ...base, database: "postgres" });
    await term.connect();
    try {
      await term.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [scratchName],
      );
      await term.query(`DROP DATABASE IF EXISTS "${scratchName}"`);
    } catch {
      // best-effort cleanup
    } finally {
      await term.end();
    }
  };

  return { url, scratchName, drop };
}

function wrap(conn: PgConnection, drop: () => Promise<void>): PgConnection {
  const originalClose = conn.close.bind(conn);
  conn.close = async () => {
    await originalClose();
    await drop();
  };
  return conn;
}

async function realPg(url: string): Promise<TestDbConnection> {
  const base = parseConnectionString(url);
  const { url: scratchUrl, drop } = await createScratchDatabase(base);
  return wrap(new PgConnection({ connectionString: scratchUrl }), drop);
}

/**
 * Default test connection. When `TEST_DATABASE_URL`/`DATABASE_URL` is set, this
 * connects as that role (the application role) to a fresh scratch database.
 * Otherwise returns an in-memory PGlite connection.
 */
export async function createTestDbConnection(): Promise<TestDbConnection> {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (url) {
    return realPg(url);
  }
  return new PGliteConnection(new PGlite());
}

/**
 * Superuser test connection (for the RLS spec). When a superuser URL is
 * available it connects as superuser to a fresh scratch database. Otherwise it
 * falls back to the default test connection (PGlite's default role is already a
 * superuser, so `SET ROLE` works there).
 */
export async function createTestSuperuserConnection(): Promise<TestDbConnection> {
  const superUrl =
    process.env.TEST_DATABASE_URL_SUPERUSER ||
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL;
  if (superUrl) {
    return realPg(superUrl);
  }
  return new PGliteConnection(new PGlite());
}

/**
 * Application-role test connection paired with a privileged migration channel
 * on the SAME scratch database.
 *
 * WHY: role-level DDL (`CREATE ROLE` / `ALTER ROLE` / `COMMENT ON ROLE` —
 * e.g. migration 032) requires CREATEROLE and can never run through the
 * NOSUPERUSER application role; the canonical path (CI's
 * `npm run migration:identity:up`, production deploys) executes DDL with a
 * privileged/admin role. `applySchemaSql` routes ONLY role-level DDL to
 * `TEST_DATABASE_URL_SUPERUSER` and applies everything else through the
 * application role, preserving the established scratch-database ownership
 * model (the app role owns the schema objects it creates, so its DML works).
 * The classification lives in `migrationRequiresPrivilegedRole()`
 * (src/database/migration-governance.ts) — one source of truth.
 *
 * PGlite mode: the in-process engine's default role is already a superuser, so
 * `applySchemaSql` is just `conn.exec`.
 */
export interface TestDbWithMigrationRole {
  /** Application-role connection (or PGlite) — the functional path under test. */
  conn: TestDbConnection;
  /** Apply schema DDL on the same database via the privileged role. */
  applySchemaSql(sql: string): Promise<void>;
  /** Close both connections and drop the scratch database. */
  close(): Promise<void>;
}

export async function createTestDbConnectionWithMigrationRole(): Promise<TestDbWithMigrationRole> {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    const conn = new PGliteConnection(new PGlite());
    return {
      conn,
      applySchemaSql: (sql) => conn.exec(sql),
      close: () => conn.close(),
    };
  }
  const base = parseConnectionString(url);
  const {
    url: scratchUrl,
    scratchName,
    drop,
  } = await createScratchDatabase(base);
  const conn = wrap(new PgConnection({ connectionString: scratchUrl }), drop);
  const superInfo = parseConnectionString(
    process.env.TEST_DATABASE_URL_SUPERUSER || url,
  );
  const migrationConn = new PgConnection({
    connectionString: `postgresql://${encodeURIComponent(
      superInfo.user,
    )}:${encodeURIComponent(superInfo.password)}@${superInfo.host}:${
      superInfo.port
    }/${scratchName}`,
  });
  return {
    conn,
    applySchemaSql: (sql) =>
      migrationRequiresPrivilegedRole(sql)
        ? migrationConn.exec(sql)
        : conn.exec(sql),
    close: async () => {
      await migrationConn.close();
      await conn.close(); // wrapped: also drops the scratch database
    },
  };
}
