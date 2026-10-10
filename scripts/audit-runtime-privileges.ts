/**
 * Emit and verify the complete effective runtime table privilege matrix.
 *
 * Output contains no credentials or row data. Every public table/verb is
 * classified from the finite source allowlist and paired with its RLS/FORCE
 * state. Any effective privilege that differs from source policy fails closed.
 */
import "dotenv/config";
import { Client } from "pg";
import { buildPgConnectionConfig } from "../src/db/tls";
import {
  RUNTIME_COLUMN_PRIVILEGES,
  RUNTIME_INSERT_ONLY_TABLES,
  RUNTIME_NO_DELETE_TABLES,
  RUNTIME_READ_ONLY_TABLES,
  RUNTIME_TABLE_ALLOWLIST,
} from "./runtime-privilege-allowlist";
import { failSanitized } from "./lib/ci-annotation";

const adminUrl = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
const role = process.env.BEYU_RUNTIME_DB_ROLE ?? "beyu_runtime";
if (!adminUrl) throw new Error("BEYU_ADMIN_DATABASE_URL (or DATABASE_URL) is required");

const verbs = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;
type Verb = (typeof verbs)[number];

function expectedPrivileges(table: string): ReadonlySet<Verb> {
  if (!(RUNTIME_TABLE_ALLOWLIST as readonly string[]).includes(table)) return new Set();
  if ((RUNTIME_READ_ONLY_TABLES as readonly string[]).includes(table)) return new Set(["SELECT"]);
  if ((RUNTIME_INSERT_ONLY_TABLES as readonly string[]).includes(table)) return new Set(["SELECT", "INSERT"]);
  if ((RUNTIME_NO_DELETE_TABLES as readonly string[]).includes(table)) return new Set(["SELECT", "INSERT", "UPDATE"]);
  return new Set(verbs);
}

function reason(table: string, verb: Verb, allowed: boolean): string {
  if (!(RUNTIME_TABLE_ALLOWLIST as readonly string[]).includes(table)) return "DEFAULT_DENY_UNCLASSIFIED_TABLE";
  if ((RUNTIME_READ_ONLY_TABLES as readonly string[]).includes(table)) return allowed ? "REVIEWED_RUNTIME_READ" : "GOVERNANCE_OR_CONFIGURATION_READ_ONLY";
  if ((RUNTIME_INSERT_ONLY_TABLES as readonly string[]).includes(table)) return allowed ? "APPEND_ONLY_EVIDENCE" : "APPEND_ONLY_MUTATION_DENIED";
  if ((RUNTIME_NO_DELETE_TABLES as readonly string[]).includes(table)) return allowed ? "REVIEWED_NON_DESTRUCTIVE_RUNTIME_OPERATION" : "IMMUTABLE_HISTORY_DELETE_DENIED";
  return "REVIEWED_OPERATIONAL_RUNTIME_OPERATION";
}

async function main(): Promise<void> {
  const { connectionString, ssl } = buildPgConnectionConfig(adminUrl!, "BEYU_ADMIN_DATABASE_URL");
  const client = new Client({ connectionString, ssl });
  await client.connect();
  try {
    const tables = await client.query<{
      table_name: string;
      owner: string;
      rls_enabled: boolean;
      force_rls: boolean;
    }>(
      `select c.relname table_name, pg_get_userbyid(c.relowner) owner,
              c.relrowsecurity rls_enabled, c.relforcerowsecurity force_rls
         from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p')
        order by c.relname`,
    );
    const rows: Array<Record<string, unknown>> = [];
    const failures: string[] = [];
    for (const table of tables.rows) {
      const expected = expectedPrivileges(table.table_name);
      for (const verb of verbs) {
        const result = await client.query<{ allowed: boolean }>(
          `select has_table_privilege($1::text, format('public.%I',$2::text), $3::text) allowed`,
          [role, table.table_name, verb],
        );
        const allowed = result.rows[0]?.allowed === true;
        const shouldAllow = expected.has(verb);
        if (allowed !== shouldAllow) failures.push(`${table.table_name}:${verb}:expected=${shouldAllow}:actual=${allowed}`);
        rows.push({
          table: table.table_name,
          verb,
          role,
          allowed,
          expected: shouldAllow,
          reason: reason(table.table_name, verb, shouldAllow),
          owner: table.owner,
          rlsEnabled: table.rls_enabled,
          forceRls: table.force_rls,
        });
      }
    }

    // Audit explicit column-only grants independently. Table-level privileges
    // appear in information_schema.column_privileges too, so exclude any verb
    // already conferred at table level and compare only the narrow exceptions.
    const effectiveColumnPrivileges = await client.query<{
      table_name: string; column_name: string; privilege_type: string;
    }>(
      `with candidate_column_privileges as materialized (
         select cp.table_name, cp.column_name, cp.privilege_type
           from information_schema.column_privileges cp
          where cp.table_schema='public' and cp.grantee=$1
            and cp.privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
       )
       select table_name, column_name, privilege_type
         from candidate_column_privileges
        where not has_table_privilege($1::text, format('public.%I', table_name), privilege_type)
        order by table_name, column_name, privilege_type`,
      // MATERIALIZED is security-relevant here: PostgreSQL otherwise inlines
      // information_schema.column_privileges and may feed internal catalogue
      // relnames (for example pg_statistic) to has_table_privilege before the
      // public-schema output filter is applied.

      [role],
    );
    const expectedColumnPrivileges = Object.entries(RUNTIME_COLUMN_PRIVILEGES).flatMap(([table, columns]) =>
      Object.entries(columns).flatMap(([column, privileges]) =>
        (privileges as readonly string[]).map((privilege) => ({ table_name: table, column_name: column, privilege_type: privilege }))),
    ).sort((a, b) => `${a.table_name}.${a.column_name}.${a.privilege_type}`.localeCompare(`${b.table_name}.${b.column_name}.${b.privilege_type}`));
    const actualColumnKeys = new Set(effectiveColumnPrivileges.rows.map((row) => `${row.table_name}.${row.column_name}.${row.privilege_type}`));
    const expectedColumnKeys = new Set(expectedColumnPrivileges.map((row) => `${row.table_name}.${row.column_name}.${row.privilege_type}`));
    for (const key of actualColumnKeys) if (!expectedColumnKeys.has(key)) failures.push(`unexpected-column-privilege:${key}`);
    for (const key of expectedColumnKeys) if (!actualColumnKeys.has(key)) failures.push(`missing-column-privilege:${key}`);

    console.log(JSON.stringify({
      ok: failures.length === 0,
      role,
      tableCount: tables.rowCount,
      failures,
      rows,
      columnPrivileges: effectiveColumnPrivileges.rows,
    }, null, 2));
    if (failures.length > 0) throw new Error(`Runtime privilege matrix drift: ${failures.length} mismatch(es)`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => failSanitized("runtime privilege matrix audit", error));
