/**
 * BEYU OS — database role bootstrap (C-02 remediation).
 *
 * PURPOSE
 *   Provision a NON-SUPERUSER runtime application role and grant it ordinary
 *   DML so PostgreSQL Row Level Security is actually enforced for the runtime
 *   application. Before this change the application connected as the `postgres`
 *   superuser, which bypasses RLS regardless of `FORCE ROW LEVEL SECURITY`.
 *
 * ARCHITECTURE
 *   MIGRATION/ADMIN role (superuser)  -> owns the schema; schema DDL
 *                                        (scripts/migrate.ts, seed, drizzle-kit)
 *   RUNTIME role (beyu_runtime)       -> ordinary SELECT/INSERT/UPDATE/DELETE
 *                                        subject to RLS (a NON-OWNER grantee)
 *
 * WHY A GRANTEE, NOT AN OWNER
 *   PostgreSQL bypasses RLS for a table OWNER unless the table is
 *   `FORCE ROW LEVEL SECURITY`. Some BEYU tables (e.g. `approvals`,
 *   `noelia_*`) are RLS-enabled WITHOUT FORCE. If the runtime role owned those
 *   tables it would bypass RLS on them. As a NON-OWNER GRANTEE the runtime role
 *   is ALWAYS subject to RLS, with or without FORCE. Ownership stays with the
 *   admin role. (The unit/integration regression suite runs with a privileged
 *   TEST role, so it does not rely on the runtime role owning objects.)
 *
 * SECURITY
 *   - The runtime role is created NOSUPERUSER NOBYPASSRLS NOCREATEROLE
 *     NOCREATEDB NOREPLICATION and holds no BYPASSRLS.
 *   - The runtime password is read ONLY from BEYU_RUNTIME_DB_PASSWORD (never
 *     committed, never hardcoded).
 *   - The admin connection is read from BEYU_ADMIN_DATABASE_URL (defaults to
 *     DATABASE_URL for environments where they are the same).
 *   - Idempotent: safe to re-run; it also corrects a table owner that was
 *     previously delegated to the runtime role (reverted to the admin role).
 *
 * USAGE
 *   BEYU_ADMIN_DATABASE_URL=... BEYU_RUNTIME_DB_PASSWORD=... npx tsx scripts/setup-db-role.ts
 */
import "dotenv/config";
import { Client } from "pg";

const adminUrl = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
const runtimePassword = process.env.BEYU_RUNTIME_DB_PASSWORD;
const runtimeRole = process.env.BEYU_RUNTIME_DB_ROLE ?? "beyu_runtime";

if (!adminUrl) throw new Error("BEYU_ADMIN_DATABASE_URL (or DATABASE_URL) is required");
if (!runtimePassword) {
  throw new Error("BEYU_RUNTIME_DB_PASSWORD is required. No default credentials are permitted.");
}
if (runtimePassword.length < 14) {
  throw new Error("BEYU_RUNTIME_DB_PASSWORD must be at least 14 characters.");
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    // PostgreSQL does not allow bind parameters in utility statements
    // (CREATE ROLE / ALTER ROLE), and role identifiers must never be
    // interpolated unquoted. Statements are therefore rendered with
    // format() %I / %L inside an ordinary SELECT (which does accept bind
    // parameters) and executed as generated, fully-escaped SQL. This is
    // protocol-correct on every PostgreSQL (local, Supabase direct or
    // pooler) and injection-safe.
    const execFormat = async (template: string, params: unknown[]): Promise<void> => {
      const slots = params.map((_, i) => `$${i + 1}::text`).join(", ");
      const rendered = await client.query<{ stmt: string }>(
        `select format(${template}${slots ? `, ${slots}` : ""}) as stmt`,
        params,
      );
      await client.query(rendered.rows[0].stmt);
    };
    // 1. Create the runtime role if it does not exist. Never elevate: it must
    //    remain non-superuser, non-bypassrls, non-createrole, non-createdb.
    const exists = await client.query(`select 1 from pg_roles where rolname = $1`, [runtimeRole]);
    if (exists.rowCount === 0) {
      await execFormat(
        `'create role %I login password %L nosuperuser nobypassrls nocreaterole nocreatedb noreplication'`,
        [runtimeRole, runtimePassword],
      );
      console.log(`created role ${runtimeRole}`);
    } else {
      // Re-assert the restrictive attributes in case a prior run elevated it.
      await execFormat(
        `'alter role %I nosuperuser nobypassrls nocreaterole nocreatedb noreplication'`,
        [runtimeRole],
      );
      console.log(`role ${runtimeRole} exists; attributes re-asserted`);
    }

    // 2. Ownership stays with the ADMIN role. If a previous run delegated any
    //    object to the runtime role, revert ownership so RLS binds the runtime
    //    role (an owner bypasses RLS unless FORCE is set).
    const adminRole = await client.query(`select current_user as r`);
    const owner = adminRole.rows[0].r as string;
    const tablesOwnedByRuntime = await client.query(
      `select tablename from pg_tables where schemaname='public' and tableowner = $1`,
      [runtimeRole],
    );
    for (const { tablename } of tablesOwnedByRuntime.rows) {
      await execFormat(`'alter table public.%I owner to %I'`, [tablename, owner]);
    }
    const revertedCount = tablesOwnedByRuntime.rowCount ?? 0;
    if (revertedCount > 0) {
      console.log(`reverted ownership of ${revertedCount} tables to ${owner}`);
    }

    // 3. Grant ordinary DML to the runtime role on the application schema.
    await execFormat(`'grant usage on schema public to %I'`, [runtimeRole]);
    await client.query(`grant select, insert, update, delete on all tables in schema public to ${runtimeRole}`);
    await client.query(`grant usage, select on all sequences in schema public to ${runtimeRole}`);
    await client.query(`grant execute on all functions in schema public to ${runtimeRole}`);

    // 4. Future objects created by the admin role are granted DML to the runtime
    //    role automatically (default privileges apply to the current role).
    await execFormat(
      `'alter default privileges for role %I in schema public grant select, insert, update, delete on tables to %I'`,
      [owner, runtimeRole],
    );
    await execFormat(
      `'alter default privileges for role %I in schema public grant usage, select on sequences to %I'`,
      [owner, runtimeRole],
    );
    await execFormat(
      `'alter default privileges for role %I in schema public grant execute on functions to %I'`,
      [owner, runtimeRole],
    );

    // 4b. Payment configuration authority is NEVER delegated to the runtime role.
    //
    //     Step 3 granted blanket DML on every existing table and step 4 grants it
    //     on every future one, which is why the runtime role can currently rewrite
    //     governance rows (finding F-01, still open, deliberately NOT remediated
    //     here). The payment domain was told not to inherit that: provider status,
    //     connection enablement, ledger account mappings, limits and settlement
    //     authority must not be silently mutable by the credentials of the very
    //     runtime those controls govern.
    //
    //     This runs here rather than only in 0028 because CI applies migrations
    //     BEFORE creating the role, so the migration's revocation is a no-op on a
    //     fresh database. Both paths exist so the control holds whether the role is
    //     created first or last.
    const paymentConfigTables = [
      "payment_providers",
      "payment_provider_connections",
      "payment_accounts",
      "payment_account_mappings",
      "payment_policies",
    ];
    const revoked: string[] = [];
    for (const table of paymentConfigTables) {
      const present = await client.query(`select 1 from pg_tables where schemaname = 'public' and tablename = $1`, [table]);
      if ((present.rowCount ?? 0) === 0) continue; // pre-0028 database: nothing to revoke yet
      await execFormat(`'revoke insert, update, delete on public.%I from %I'`, [table, runtimeRole]);
      const check = await client.query(
        `select has_table_privilege($1::text, 'public.' || $2, 'INSERT') as i,
                has_table_privilege($1::text, 'public.' || $2, 'UPDATE') as u,
                has_table_privilege($1::text, 'public.' || $2, 'DELETE') as d,
                has_table_privilege($1::text, 'public.' || $2, 'SELECT') as s`,
        [runtimeRole, table],
      );
      const p = check.rows[0];
      if (p.i || p.u || p.d) {
        throw new Error(`payment configuration table ${table} is still writable by ${runtimeRole} after revocation`);
      }
      if (!p.s) {
        throw new Error(`payment configuration table ${table} lost SELECT for ${runtimeRole}; the runtime could no longer read its own limits`);
      }
      revoked.push(table);
    }
    if (revoked.length > 0) {
      console.log(`revoked DML on payment configuration tables for ${runtimeRole}: ${revoked.join(", ")}`);
    }

    // 5. Verification of the runtime role's effective privileges.
    const attrs = await client.query(
      `select rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls
         from pg_roles where rolname = $1`,
      [runtimeRole],
    );
    const a = attrs.rows[0];
    const safe = !a.rolsuper && !a.rolbypassrls && !a.rolcreaterole && !a.rolcreatedb;
    if (!safe) {
      throw new Error(`Runtime role ${runtimeRole} must NOT be superuser/bypassrls/createrole/createdb`);
    }
    console.log(JSON.stringify({ ok: true, runtimeRole, attributes: a }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e) }, null, 2));
  process.exit(1);
});
