/**
 * Provision the request-path governed-mutation role.
 *
 * This credential is deliberately separate from both the ordinary runtime role
 * and the migration/admin role. It is a non-owner, NOBYPASSRLS login with only
 * the finite privileges needed by the two canonical governed mutation services.
 *
 * Required environment:
 *   BEYU_ADMIN_DATABASE_URL
 *   BEYU_GOVERNANCE_DB_PASSWORD
 * Optional:
 *   BEYU_GOVERNANCE_DB_ROLE (default: beyu_governance)
 */
import "dotenv/config";
import { Client } from "pg";
import { buildPgConnectionConfig } from "../src/db/tls";
import { failSanitized } from "./lib/ci-annotation";

const adminUrl = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
const password = process.env.BEYU_GOVERNANCE_DB_PASSWORD;
const role = process.env.BEYU_GOVERNANCE_DB_ROLE ?? "beyu_governance";

if (!adminUrl) throw new Error("BEYU_ADMIN_DATABASE_URL (or DATABASE_URL) is required");
if (!password || password.length < 14) throw new Error("BEYU_GOVERNANCE_DB_PASSWORD of at least 14 characters is required");

const TABLE_PRIVILEGES: Readonly<Record<string, readonly string[]>> = {
  role_assignments: ["SELECT", "INSERT", "UPDATE"],
  tenant_domains: ["SELECT", "INSERT", "UPDATE"],
  audit_chain_heads: ["SELECT", "INSERT", "UPDATE"],
  audit_log: ["INSERT"],
  enterprise_events: ["INSERT"],
};
// Only transaction-setting readers referenced by RLS on the finite table set.
// Neither function is SECURITY DEFINER or performs data access/mutation.
const POLICY_FUNCTIONS = new Set(["beyu_tenant_ids", "beyu_global_scope"]);
const SEQUENCE_PRIVILEGES: Readonly<Record<string, readonly string[]>> = {
  audit_log_sequence_seq: ["USAGE"],
  enterprise_events_sequence_seq: ["USAGE"],
};

async function main(): Promise<void> {
  const { connectionString, ssl } = buildPgConnectionConfig(adminUrl!, "BEYU_ADMIN_DATABASE_URL");
  const client = new Client({ connectionString, ssl });
  await client.connect();
  try {
    const render = async (template: string, values: unknown[]): Promise<string> => {
      const slots = values.map((_, index) => `$${index + 1}::text`).join(", ");
      const result = await client.query<{ stmt: string }>(`select format(${template}${slots ? `, ${slots}` : ""}) stmt`, values);
      return result.rows[0].stmt;
    };
    const exec = async (template: string, values: unknown[]): Promise<void> => {
      await client.query(await render(template, values));
    };

    const found = await client.query<{
      rolsuper: boolean; rolbypassrls: boolean; rolcreaterole: boolean;
      rolcreatedb: boolean; rolreplication: boolean;
    }>(`select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication from pg_roles where rolname=$1`, [role]);
    if (found.rowCount === 0) {
      await exec(`'create role %I login password %L nosuperuser nobypassrls nocreaterole nocreatedb noreplication'`, [role, password]);
    } else {
      const attributes = found.rows[0];
      if (attributes.rolsuper || attributes.rolbypassrls || attributes.rolcreaterole || attributes.rolcreatedb || attributes.rolreplication) {
        throw new Error(`Governance role ${role} has forbidden elevated attributes; refusing reconciliation`);
      }
      await exec(`'alter role %I login password %L'`, [role, password]);
    }

    const ownerResult = await client.query<{ owner: string }>("select current_user owner");
    const owner = ownerResult.rows[0].owner;
    const owned = await client.query<{ object_name: string }>(
      `select c.relname object_name from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relowner=(select oid from pg_roles where rolname=$1)`,
      [role],
    );
    if (owned.rows.length > 0) throw new Error(`Governance role ${role} owns public objects; ownership must remain with the migration role`);

    await exec(`'grant usage on schema public to %I'`, [role]);
    const tables = await client.query<{ tablename: string }>("select tablename from pg_tables where schemaname='public'");
    for (const { tablename } of tables.rows) {
      await exec(`'revoke all privileges on table public.%I from %I'`, [tablename, role]);
      const privileges = TABLE_PRIVILEGES[tablename];
      if (privileges) await exec(`'grant ${privileges.join(", ")} on table public.%I to %I'`, [tablename, role]);
    }
    for (const table of Object.keys(TABLE_PRIVILEGES)) {
      if (!tables.rows.some((row) => row.tablename === table)) throw new Error(`Required governance table public.${table} does not exist`);
    }

    console.log("governance table privileges reconciled");
    const sequences = await client.query<{ sequence_name: string }>("select sequence_name from information_schema.sequences where sequence_schema='public'");
    for (const { sequence_name } of sequences.rows) {
      await exec(`'revoke all privileges on sequence public.%I from %I'`, [sequence_name, role]);
      const privileges = SEQUENCE_PRIVILEGES[sequence_name];
      if (privileges) await exec(`'grant ${privileges.join(", ")} on sequence public.%I to %I'`, [sequence_name, role]);
    }
    for (const sequence of Object.keys(SEQUENCE_PRIVILEGES)) {
      if (!sequences.rows.some((row) => row.sequence_name === sequence)) throw new Error(`Required governance sequence public.${sequence} does not exist`);
    }

    console.log("governance sequence privileges reconciled");
    const functions = await client.query<{ oid: string; proname: string }>(
      `select p.oid::text oid, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`,
    );
    for (const fn of functions.rows) {
      const statements = await client.query<{ revoke_stmt: string; grant_stmt: string }>(
        `select format('revoke execute on function %s from %I',$1::oid::regprocedure,$2::text) revoke_stmt,
                format('grant execute on function %s to %I',$1::oid::regprocedure,$2::text) grant_stmt`,
        [fn.oid, role],
      );
      await client.query(statements.rows[0].revoke_stmt);
      if (POLICY_FUNCTIONS.has(fn.proname)) await client.query(statements.rows[0].grant_stmt);
    }
    for (const fn of POLICY_FUNCTIONS) {
      if (!functions.rows.some((row) => row.proname === fn)) throw new Error(`Required governance policy function public.${fn} does not exist`);
    }
    console.log("governance function privileges reconciled");

    await exec(`'alter default privileges for role %I in schema public revoke all privileges on tables from %I'`, [owner, role]);
    await exec(`'alter default privileges for role %I in schema public revoke all privileges on sequences from %I'`, [owner, role]);
    await exec(`'alter default privileges for role %I in schema public revoke all privileges on functions from %I'`, [owner, role]);

    const verified = await client.query<{ rolsuper: boolean; rolbypassrls: boolean; owned: string }>(
      `select r.rolsuper, r.rolbypassrls,
              (select count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relowner=r.oid) owned
         from pg_roles r where r.rolname=$1`,
      [role],
    );
    const state = verified.rows[0];
    if (!state || state.rolsuper || state.rolbypassrls || state.owned !== "0") throw new Error("Governance role verification failed");

    const effective = await client.query<{ table_name: string; privilege_type: string }>(
      `select table_name, privilege_type from information_schema.table_privileges
        where table_schema='public' and grantee=$1 order by table_name, privilege_type`,
      [role],
    );
    const expected = new Set(Object.entries(TABLE_PRIVILEGES).flatMap(([table, privileges]) => privileges.map((privilege) => `${table}:${privilege}`)));
    const actual = new Set(effective.rows.map((row) => `${row.table_name}:${row.privilege_type}`));
    if (expected.size !== actual.size || [...expected].some((entry) => !actual.has(entry))) {
      throw new Error("Governance role effective table privileges differ from the finite allowlist");
    }
    console.log(`governance role ${role} reconciled: NOBYPASSRLS, non-owner, finite privileges`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => failSanitized("governance role provisioning", error));
