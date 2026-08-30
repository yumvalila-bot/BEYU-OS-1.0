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

  return { url, drop };
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
