import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString: url });
const dir = join(process.cwd(), "drizzle");

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

function splitStatements(sql: string) {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function schemaIsEmpty() {
  const r = await pool.query(`select count(*)::int as n from information_schema.tables where table_schema='public' and table_name <> 'beyu_migrations'`);
  return Number(r.rows[0]?.n ?? 0) === 0;
}

async function ensureMetadata() {
  await pool.query(`create table if not exists beyu_migrations (
    version text primary key,
    checksum text not null,
    applied_at timestamptz not null default now(),
    mode text not null,
    description text
  )`);
}

async function applied(version: string) {
  const r = await pool.query(`select checksum from beyu_migrations where version=$1`, [version]);
  return r.rows[0]?.checksum as string | undefined;
}

async function driftFingerprint() {
  const r = await pool.query(`
    select md5(string_agg(item, '\n' order by item)) as fingerprint
    from (
      select 'table:'||table_name as item from information_schema.tables where table_schema='public'
      union all
      select 'column:'||table_name||'.'||column_name||':'||data_type||':'||is_nullable from information_schema.columns where table_schema='public'
      union all
      select 'constraint:'||conname||':'||contype::text from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public'
      union all
      select 'index:'||indexname||':'||indexdef from pg_indexes where schemaname='public'
    ) s
  `);
  return r.rows[0]?.fingerprint as string;
}

async function migrate() {
  const migrations = readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  if (migrations.length === 0) throw new Error("No SQL migrations found in drizzle/");

  await ensureMetadata();
  const empty = await schemaIsEmpty();
  const before = await driftFingerprint();

  for (const file of migrations) {
    const version = file.replace(/\.sql$/, "");
    const path = join(dir, file);
    const sql = readFileSync(path, "utf8");
    const checksum = sha256(sql);
    const existing = await applied(version);
    if (existing) {
      if (existing !== checksum) throw new Error(`Migration checksum drift for ${version}`);
      continue;
    }

    if (!empty && version.startsWith("0000_")) {
      // Baseline an already-created v0.1 candidate DB only after recording drift fingerprint.
      await pool.query(`insert into beyu_migrations(version, checksum, mode, description) values($1,$2,'BASELINED_EXISTING',$3)`, [
        version,
        checksum,
        `Existing schema fingerprint before baseline: ${before}`,
      ]);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext('BEYU_OS_MIGRATION'))");
      for (const statement of splitStatements(sql)) await client.query(statement);
      await client.query(`insert into beyu_migrations(version, checksum, mode, description) values($1,$2,'APPLIED','Forward migration applied')`, [version, checksum]);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }

  const after = await driftFingerprint();
  console.log(JSON.stringify({ ok: true, migrations, fingerprintBefore: before, fingerprintAfter: after }, null, 2));
}

migrate()
  .catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String(e) }, null, 2));
    process.exit(1);
  })
  .finally(() => pool.end());
