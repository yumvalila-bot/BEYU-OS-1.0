#!/usr/bin/env node
/**
 * BEYU OS 2.0 migration infra — embedded PostgreSQL 16 harness.
 *
 * Starts a disposable PostgreSQL 16 server using `embedded-postgres` (npm
 * devDependency). This lets the DB-backed verification gates (migrations,
 * RLS, ledger, CAP_POSTING, audit, tenant/entity/country/OS isolation,
 * Health real-PostgreSQL security suite) run where no apt/docker Postgres
 * is available.
 *
 * The harness mirrors the canonical .github/workflows/ci.yml role/database
 * model:
 *   - databases: beyu_os (root control plane), beyu_health (Health sector)
 *   - roles:     beyu_runtime (root runtime, NOSUPERUSER NOBYPASSRLS),
 *                beyu_health_runtime (Health runtime, NOSUPERUSER NOBYPASSRLS)
 *   - admin DSN is the superuser (postgres:postgres), used only for DDL/seeding.
 *
 * No real secret is used anywhere; passwords are the same ephemeral literals
 * as the CI service container and are never treated as production secrets.
 *
 * Lifecycle:
 *   node scripts/infra/pg16-server.mjs start [--port 5432] [--data pgdata]
 *   node scripts/infra/pg16-server.mjs stop
 *
 * On `start` the process stays alive and prints `PG16_READY` once the server
 * is accepting connections and the databases/roles are provisioned.
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = resolve(import.meta.dirname ?? (await import("node:path")).dirname(fileURLToPath(import.meta.url)));
const root = resolve(here, "..", "..");

const args = process.argv.slice(2);
const mode = args[0] ?? "start";
const fresh = args.includes("--fresh");
const portArg = args.indexOf("--port") >= 0 ? Number(args[args.indexOf("--port") + 1]) : 5432;
const dataArg = args.indexOf("--data") >= 0 ? resolve(root, args[args.indexOf("--data") + 1]) : resolve(root, "pgdata");
const pidFile = resolve(root, "pgdata", "pg16.pid");
const logFile = resolve(root, "pgdata", "pg16.log");
const versionFile = resolve(root, "pgdata", "PG_VERSION");

function readPid() {
  try {
    return Number(require("fs").readFileSync(pidFile, "utf8").trim());
  } catch {
    return null;
  }
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (mode === "stop") {
  const pid = readPid();
  if (pid && isAlive(pid)) {
    process.kill(pid, "SIGTERM");
    console.log(`PG16 stop requested for pid ${pid}`);
  } else {
    console.log("PG16 not running.");
  }
  process.exit(0);
}

if (mode !== "start") {
  console.error("Usage: pg16-server.mjs start|stop [--port n] [--data path]");
  process.exit(2);
}

const EmbeddedPostgres = require("embedded-postgres").default;
const { Client } = require("pg");

async function bootstrap(pg) {
  const admin = new Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${portArg}/postgres` });
  await admin.connect();

  const createDb = async (name) => {
    const r = await admin.query("select 1 from pg_database where datname=$1", [name]);
    if (r.rowCount === 0) {
      await admin.query(`create database ${name} owner postgres`);
      console.log(`created database ${name}`);
    } else {
      console.log(`database ${name} exists`);
    }
  };
  await createDb("beyu_os");
  await createDb("beyu_health");

  const ensureRole = async (name, { createdb = false } = {}) => {
    const r = await admin.query("select 1 from pg_roles where rolname=$1", [name]);
    if (r.rowCount === 0) {
      const attrs = `NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOREPLICATION${createdb ? "" : ""}`;
      await admin.query(`create role ${name} login password '${"ephemeral_" + name + "_password_not_secret"}' nocreatedb ${attrs}`);
      console.log(`created role ${name}`);
    } else {
      await admin.query(`alter role ${name} nosuperuser nobypassrls nocreaterole nocreatedb noreplication`);
      console.log(`role ${name} exists; attributes pinned`);
    }
  };
  // Root runtime: strictly constrained (as CI).
  await ensureRole("beyu_runtime", { createdb: false });
  // Health runtime: CI grants CREATEDB because its test harness creates scratch DBs.
  const hr = await admin.query("select rolcreatedb from pg_roles where rolname=$1", ["beyu_health_runtime"]);
  if (hr.rowCount === 0) {
    await admin.query(
      `create role beyu_health_runtime login password 'ephemeral_beyu_health_runtime_password_not_secret' createdb nosuperuser nobypassrls nocreaterole noreplication`
    );
  } else {
    await admin.query(`alter role beyu_health_runtime nosuperuser nobypassrls nocreaterole noreplication createdb`);
  }

  // Root runtime needs access to owning schema for migration-created objects.
  await admin.query("grant all on schema public to beyu_runtime");
  // Health runtime needs public schema create to run against a database it owns
  // in the real-PG specs; CI uses a postgres-owned db and its specs SET ROLE.
  await admin.query("grant all on schema public to beyu_health_runtime");

  await admin.end();
}

async function main() {
  if (existsSync(pidFile)) {
    const old = readPid();
    if (old && isAlive(old)) {
      console.log(`PG16 already running pid ${old}; exiting.`);
      process.exit(0);
    }
    rmSync(pidFile, { force: true });
  }

  const pg = new EmbeddedPostgres({
    databaseDir: dataArg,
    user: "postgres",
    password: "postgres",
    port: portArg,
    persistent: true,
    startCluster: true,
    binaryVersion: "16.14.0-beta.17",
  });

  const clusterExists = existsSync(versionFile);
  if (fresh && clusterExists) {
    console.log("PG16 --fresh: removing existing data cluster.");
    rmSync(dataArg, { recursive: true, force: true });
  }
  if (!existsSync(versionFile)) {
    await pg.initialise();
  } else {
    console.log("PG16 resuming existing cluster.");
  }
  await pg.start();

  let booted = false;
  for (let i = 0; i < 60; i++) {
    try {
      const probe = new Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${portArg}/postgres` });
      await probe.connect();
      const v = await probe.query("select version()");
      console.log(`PG16 accepting connections: ${v.rows[0].version}`);
      await probe.end();
      booted = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!booted) {
    console.error("PG16 failed to accept connections.");
    await pg.stop();
    process.exit(1);
  }

  await bootstrap(pg);
  const pid = process.pid;
  require("fs").writeFileSync(pidFile, String(pid), "utf8");
  console.log("PG16_READY");

  const shutdown = async () => {
    console.log("PG16 shutdown requested");
    try {
      await pg.stop();
    } catch {
      // already stopping
    }
    try {
      rmSync(pidFile, { force: true });
    } catch {}
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Keep the event loop alive; embedded-postgres manages the native child.
  setInterval(() => {}, 1 << 30);
}

main().catch(async (e) => {
  console.error("PG16 server error:", e && e.message, e && e.stack);
  process.exit(1);
});
