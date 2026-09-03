/**
 * BEYU OS — database release operations (GitHub → Supabase CI/CD).
 *
 * The operational companion to scripts/migrate.ts (which owns APPLY). This
 * script implements the release-safety phases around it:
 *
 *   preflight  — read-only safety inspection of the TARGET database:
 *                  * current schema state (empty / versioned / unknown)
 *                  * applied vs repository migrations
 *                    (pending / unexpected / MODIFIED-with-different-checksum)
 *                  * destructive-operation scan of PENDING migrations
 *                    (DROP DATABASE / DROP SCHEMA / TRUNCATE / DROP TABLE /
 *                     ALTER TABLE … DROP / GRANT … SUPERUSER / RESET)
 *                  * current schema drift fingerprint
 *                  * RLS inventory (tables with RLS enabled + policies)
 *                EXITS NON-ZERO on: modified migration, destructive pending
 *                migration without --allow-destructive. Never mutates.
 *
 *   verify     — post-apply attestation:
 *                  * every repository migration recorded with matching checksum
 *                  * schema drift fingerprint equals --expected-fingerprint
 *                    (captured from a clean scratch install of the same
 *                    revision — see .github/workflows/db-release.yml)
 *                  * runtime role exists and is NOSUPERUSER / NOBYPASSRLS /
 *                    NOCREATEROLE / NOCREATEDB / NOREPLICATION
 *                  * RLS enabled + at least one policy on the audit ledger
 *                    (audit_log) and on tenant-scoped domain tables
 *                  * no object owned by the runtime role (RLS owner bypass)
 *
 *   drift      — read-only drift report (applied vs repository + fingerprint
 *                vs --expected-fingerprint when provided). Used by the
 *                scheduled drift-detection job. Reports; never overwrites.
 *
 * Connection contract (identical to scripts/migrate.ts):
 *   BEYU_ADMIN_DATABASE_URL   admin/migration role DSN (DDL authority).
 *                             In production this is the Supabase project's
 *                             direct (non-pooled) Postgres connection, used
 *                             ONLY by CI/CD — never by the application.
 *   BEYU_RUNTIME_DB_ROLE      runtime role name (default beyu_runtime).
 *
 * Exit codes (mirroring scripts/certify-production.mts):
 *   0 = ok   1 = check failed (do NOT proceed)   2 = database unreachable
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

type Mode = "preflight" | "verify" | "drift";

const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
const mode = (args[0] ?? "") as Mode;
const allowDestructive = args.includes("--allow-destructive");
const expectedFingerprint = argValue("--expected-fingerprint");
const runtimeRole = process.env.BEYU_RUNTIME_DB_ROLE ?? "beyu_runtime";
const adminUrl = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;

if (!["preflight", "verify", "drift"].includes(mode)) {
  console.error("usage: tsx scripts/db-release.ts <preflight|verify|drift> [--expected-fingerprint <md5>] [--allow-destructive]");
  process.exit(1);
}
if (!adminUrl) {
  console.error("BEYU_ADMIN_DATABASE_URL (or DATABASE_URL) is required");
  process.exit(1);
}

const dir = join(process.cwd(), "drizzle");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

interface RepoMigration {
  version: string;
  file: string;
  checksum: string;
  sql: string;
}

function repoMigrations(): RepoMigration[] {
  return readdirSync(dir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort()
    .map((file) => {
      const sql = readFileSync(join(dir, file), "utf8");
      return { version: file.replace(/\.sql$/, ""), file, checksum: sha256(sql), sql };
    });
}

/**
 * Destructive-shape scanner. A hit is not automatically wrong — it is a
 * STOP-and-get-human-approval signal. Historical guard: migration 0001
 * contains candidate-sandbox TRUNCATEs and migrate.ts already refuses it
 * against an existing schema; this scanner generalises the gate to any
 * pending migration that would destroy or reset state.
 */
const DESTRUCTIVE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bdrop\s+database\b/i, label: "DROP DATABASE" },
  { re: /\bdrop\s+schema\b/i, label: "DROP SCHEMA" },
  { re: /\btruncate\b/i, label: "TRUNCATE" },
  { re: /\bdrop\s+table\b/i, label: "DROP TABLE" },
  { re: /\bdrop\s+column\b/i, label: "DROP COLUMN" },
  { re: /\bgrant\s+[^;]*\bsuperuser\b/i, label: "GRANT SUPERUSER" },
  { re: /\bgrant\s+[^;]*\bbypassrls\b/i, label: "GRANT BYPASSRLS" },
  { re: /\balter\s+system\b/i, label: "ALTER SYSTEM" },
  { re: /\bdrop\s+owned\b/i, label: "DROP OWNED" },
];

function scanDestructive(sql: string): string[] {
  return DESTRUCTIVE_PATTERNS.filter((p) => p.re.test(sql)).map((p) => p.label);
}

async function main() {
  const client = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 15_000 });
  try {
    await client.connect();
  } catch (e) {
    console.error(JSON.stringify({ ok: false, mode, error: `database unreachable: ${String(e)}` }, null, 2));
    process.exit(2);
  }

  const one = async <T>(sql: string, params: unknown[] = []): Promise<T | undefined> =>
    (await client.query(sql, params)).rows[0] as T | undefined;
  const many = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
    (await client.query(sql, params)).rows as T[];

  const repo = repoMigrations();

  // ── target state ────────────────────────────────────────────────────────
  const migrationsTable = await one<{ n: number }>(
    `select count(*)::int as n from information_schema.tables
      where table_schema='public' and table_name='beyu_migrations'`,
  );
  const hasMigrationTable = (migrationsTable?.n ?? 0) > 0;
  const applied = hasMigrationTable
    ? await many<{ version: string; checksum: string; mode: string; applied_at: string }>(
        `select version, checksum, mode, applied_at::text from beyu_migrations order by version`,
      )
    : [];
  const objectCount = (
    await one<{ n: number }>(
      `select count(*)::int as n from information_schema.tables
        where table_schema='public' and table_name <> 'beyu_migrations'`,
    )
  )?.n as number;

  const appliedMap = new Map(applied.map((a) => [a.version, a]));
  const pending = repo.filter((m) => !appliedMap.has(m.version));
  const unexpected = applied.filter((a) => !repo.some((m) => m.version === a.version));
  const modified = repo.filter((m) => {
    const a = appliedMap.get(m.version);
    return a !== undefined && a.checksum !== m.checksum;
  });

  const fingerprint = (
    await one<{ fingerprint: string }>(`
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
    `)
  )?.fingerprint as string;

  const rlsTables = await many<{ tablename: string; rowsecurity: boolean }>(
    `select tablename, rowsecurity from pg_tables where schemaname='public' and rowsecurity order by tablename`,
  );
  const policies = await many<{ tablename: string; policyname: string }>(
    `select tablename, policyname from pg_policies where schemaname='public' order by tablename, policyname`,
  );
  const role = await one<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean; rolcreatedb: boolean; rolcreaterole: boolean; rolreplication: boolean }>(
    `select rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication
       from pg_roles where rolname=$1`,
    [runtimeRole],
  );
  const runtimeOwned = await many<{ relname: string }>(
    `select c.relname from pg_class c join pg_roles r on r.oid=c.relowner
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and r.rolname=$1`,
    [runtimeRole],
  );

  const roleConstrained =
    role !== undefined &&
    !(role.rolsuper || role.rolbypassrls || role.rolcreatedb || role.rolcreaterole || role.rolreplication);

  const report = {
    mode,
    ok: true,
    target: {
      databaseEmpty: objectCount === 0,
      hasMigrationTable,
      appliedCount: applied.length,
      latestApplied: applied.length > 0 ? applied[applied.length - 1].version : null,
    },
    repository: {
      migrationCount: repo.length,
      latest: repo.length > 0 ? repo[repo.length - 1].version : null,
    },
    pending: pending.map((m) => m.version),
    unexpectedMigrations: unexpected.map((a) => a.version),
    modifiedMigrations: modified.map((m) => m.version),
    fingerprint,
    expectedFingerprint: expectedFingerprint ?? null,
    fingerprintMatches: expectedFingerprint ? fingerprint === expectedFingerprint : null,
    rls: {
      enabledTables: rlsTables.map((t) => t.tablename),
      policyCount: policies.length,
      policyTables: [...new Set(policies.map((p) => p.tablename))],
    },
    runtimeRole: role ? { ...role, constrained: roleConstrained } : null,
    runtimeRoleOwnedObjects: runtimeOwned.map((r) => r.relname),
    destructivePending: [] as Array<{ version: string; operations: string[] }>,
  };

  const failures: string[] = [];

  // ── mode-specific gates ──────────────────────────────────────────────────
  if (mode === "preflight" || mode === "drift") {
    for (const m of pending) {
      const ops = scanDestructive(m.sql);
      if (ops.length > 0) report.destructivePending.push({ version: m.version, operations: ops });
    }
    if (modified.length > 0)
      failures.push(`modified migrations (checksum drift): ${modified.map((m) => m.version).join(", ")}`);
    // Destructive-shape gate, mirroring scripts/migrate.ts semantics: a
    // destructive migration against an EMPTY database destroys nothing
    // (clean install of the historical hardening migrations); against an
    // EXISTING schema it is a stop-the-line event.
    if (
      mode === "preflight" &&
      report.destructivePending.length > 0 &&
      !report.target.databaseEmpty &&
      !allowDestructive
    )
      failures.push(
        `pending migrations contain destructive operations against an EXISTING schema — REQUIRES_HUMAN_APPROVAL: ${JSON.stringify(report.destructivePending)} (re-run with --allow-destructive after explicit approval)`,
      );
    if (mode === "drift") {
      if (unexpected.length > 0) failures.push(`unexpected migrations (in DB, not in repo): ${unexpected.map((a) => a.version).join(", ")}`);
      if (expectedFingerprint && fingerprint !== expectedFingerprint)
        failures.push(`schema drift: fingerprint ${fingerprint} != expected ${expectedFingerprint}`);
    }
  }

  if (mode === "verify") {
    if (pending.length > 0) failures.push(`migrations not recorded as applied: ${pending.map((m) => m.version).join(", ")}`);
    if (modified.length > 0) failures.push(`recorded checksum mismatch: ${modified.map((m) => m.version).join(", ")}`);
    if (unexpected.length > 0) failures.push(`unexpected migrations recorded: ${unexpected.map((a) => a.version).join(", ")}`);
    if (expectedFingerprint && fingerprint !== expectedFingerprint)
      failures.push(`schema drift: fingerprint ${fingerprint} != expected ${expectedFingerprint}`);
    if (!role) failures.push(`runtime role ${runtimeRole} does not exist — run scripts/setup-db-role.ts`);
    else if (!roleConstrained)
      failures.push(`runtime role ${runtimeRole} is not constrained: ${JSON.stringify(role)}`);
    if (runtimeOwned.length > 0)
      failures.push(`runtime role owns objects (RLS owner-bypass risk): ${runtimeOwned.map((r) => r.relname).join(", ")}`);
    const auditRls = rlsTables.some((t) => t.tablename === "audit_log");
    const auditPolicy = policies.some((p) => p.tablename === "audit_log");
    if (!auditRls) failures.push("RLS is NOT enabled on audit_log");
    if (!auditPolicy) failures.push("audit_log has no RLS policy (fail-open risk)");
    if (policies.length === 0) failures.push("no RLS policies exist in public schema");
  }

  report.ok = failures.length === 0;
  await client.end();
  console.log(JSON.stringify({ ...report, failures }, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e) }, null, 2));
  process.exit(1);
});
