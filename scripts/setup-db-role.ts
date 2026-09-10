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
 *   - Idempotent: safe to re-run. On Supabase the admin role is NOT a
 *     PostgreSQL superuser, so an ALREADY EXISTING runtime role is reconciled
 *     by CATALOG VERIFICATION (read pg_roles, fail closed on any elevated
 *     attribute) plus the legal credential re-assert — never by superuser-only
 *     ALTER ROLE attribute statements (see the role-exists branch below).
 *   - It also corrects a table owner that was previously delegated to the
 *     runtime role (reverted to the admin role).
 *
 * USAGE
 *   BEYU_ADMIN_DATABASE_URL=... BEYU_RUNTIME_DB_PASSWORD=... npx tsx scripts/setup-db-role.ts
 */
import "dotenv/config";
import { annotateError, failSanitized } from "./lib/ci-annotation";
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
    //    The existence probe also reads the role's catalog attributes so the
    //    role-exists branch can reconcile by VERIFICATION rather than mutation.
    const existing = await client.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolreplication: boolean;
    }>(
      `select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication
         from pg_roles where rolname = $1`,
      [runtimeRole],
    );
    if (existing.rowCount === 0) {
      await execFormat(
        `'create role %I login password %L nosuperuser nobypassrls nocreaterole nocreatedb noreplication'`,
        [runtimeRole, runtimePassword],
      );
      console.log(`created role ${runtimeRole}`);
    } else {
      // Reconcile the EXISTING role by catalog verification, not by attribute
      // mutation. Production incident (2026-09-08..10, SQLSTATE 42501 in this
      // step): on Supabase the customer-facing `postgres` administrative role
      // is NOT a PostgreSQL superuser, and PostgreSQL requires SUPERUSER
      // merely to SPECIFY the SUPERUSER attribute in ALTER ROLE — including
      // its NO-form ("must be superuser to alter superuser roles or change
      // superuser attribute" on PG <= 15; "permission denied to alter role …
      // SUPERUSER attribute" on PG >= 16). BYPASSRLS and REPLICATION attribute
      // changes carry the same boundary. The previous unconditional
      // `alter role %I nosuperuser nobypassrls nocreaterole nocreatedb
      // noreplication` therefore failed the entire governed release with
      // PERMISSION_DENIED the moment the role already existed — even when
      // every attribute was already correct.
      //
      // The attributes are security invariants. An elevated runtime role is an
      // incident that a human must resolve through an authorized path, never
      // something this script repairs in place: a repair may itself require
      // privileges the governed admin connection does not hold (SUPERUSER for
      // the SUPERUSER/BYPASSRLS/REPLICATION attributes; on PG >= 16,
      // CREATEROLE plus ADMIN OPTION on the role for CREATEROLE/CREATEDB,
      // which is only guaranteed when THIS connection created the role). So
      // the script fails closed BEFORE any credential, grant or ownership
      // mutation, naming the exact violated invariant. The message is fixed
      // vocabulary (role name + public PostgreSQL attribute names), matching
      // the ci-annotation publication contract; no driver text is forwarded.
      const a = existing.rows[0];
      const elevated = [
        ["SUPERUSER", a.rolsuper],
        ["BYPASSRLS", a.rolbypassrls],
        ["REPLICATION", a.rolreplication],
        ["CREATEROLE", a.rolcreaterole],
        ["CREATEDB", a.rolcreatedb],
      ]
        .filter(([, isElevated]) => isElevated)
        .map(([attribute]) => attribute);
      if (elevated.length > 0) {
        const detail =
          `runtime role ${runtimeRole} is ELEVATED (${elevated.join(", ")}). ` +
          `The governed runtime role must be NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION. ` +
          `Elevated attributes are never repaired from the governed admin connection: the Supabase administrative role is not a ` +
          `PostgreSQL superuser, and changing the SUPERUSER, BYPASSRLS or REPLICATION attributes requires one (CREATEROLE/CREATEDB ` +
          `additionally require ADMIN OPTION on the role, which this connection may not hold). Resolve the elevated state through an ` +
          `authorized administrative path, then re-run the release. No password, grant or ownership change was made.`;
        annotateError("runtime role provisioning", detail);
        console.error(JSON.stringify({ ok: false, context: "runtime role provisioning", error: detail }, null, 2));
        process.exit(1);
      }
      // Catalog attributes are safe (all five invariants hold). Re-assert the
      // LOGIN credential. Without this the password is only ever set by the
      // CREATE ROLE branch above, so once the role exists the governed secret
      // can never reach it: rotating BEYU_RUNTIME_DB_PASSWORD (or provisioning
      // it for the first time after the role was created by hand) leaves the
      // database holding a credential that no longer matches the DSN Vercel
      // authenticates with. That surfaces in production as RUNTIME_AUTH_FAILURE
      // on /api/health while every migration, RLS and role-attribute check
      // still passes — the deploy looks green and only the runtime cannot log
      // in. `ALTER ROLE … LOGIN PASSWORD` needs only CREATEROLE (plus ADMIN
      // OPTION on PG >= 16, held by this connection when it created the role),
      // never SUPERUSER, so it is legal on the Supabase admin connection.
      // Rendering the literal through format() %L keeps this injection-safe
      // and the value out of argv.
      await execFormat(`'alter role %I login password %L'`, [runtimeRole, runtimePassword]);
      console.log(`role ${runtimeRole} exists; catalog attributes verified safe; login credential re-asserted`);
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

    // 4c. Pure governance tables are NEVER writable by the runtime role (F-01 remediation).
    //
    //     The runtime role must not be able to modify the rules that govern it.
    //     Governance mutations must go through authorized administrative paths
    //     (migrations, governed workflows with proper approvals).
    //
    //     Identity and organization tables (users, tenants, legal_entities) are
    //     intentionally left writable because the auth flow legitimately updates
    //     user state (last_login_at, failed_attempts, MFA fields), and operational
    //     workflows may need to update tenant/entity metadata.
    const governanceTables = [
      "os_registry",
      "governance_capability_registry",
      "governance_decision_registry",
      "role_assignments",
    ];
    const governanceRevoked: string[] = [];
    for (const table of governanceTables) {
      const present = await client.query(`select 1 from pg_tables where schemaname = 'public' and tablename = $1`, [table]);
      if ((present.rowCount ?? 0) === 0) continue; // table doesn't exist yet
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
        throw new Error(`governance table ${table} is still writable by ${runtimeRole} after revocation`);
      }
      if (!p.s) {
        throw new Error(`governance table ${table} lost SELECT for ${runtimeRole}; the runtime could no longer enforce governance`);
      }
      governanceRevoked.push(table);
    }
    if (governanceRevoked.length > 0) {
      console.log(`revoked DML on governance tables for ${runtimeRole}: ${governanceRevoked.join(", ")}`);
    }

    // 4d. Government Integration Fabric privileges (mirror of migration 0036).
    //
    //     Step 3's blanket grant would otherwise override 0036's revocations,
    //     exactly as it did for the payment configuration tables. The contract:
    //       - government_agencies    : registry = runtime-immutable configuration.
    //         The application must never promote an agency to LIVE, clear an
    //         EXTERNAL_BLOCKED reason, or edit credential references at runtime.
    //       - government_submissions : runtime INSERT/UPDATE only — the record of
    //         a government interaction is never erased by the application (no DELETE).
    //     Both paths (migration + this script) exist so the control holds whether
    //     the role is created before or after the migration runs.
    const govRegistryPresent = await client.query(
      `select 1 from pg_tables where schemaname = 'public' and tablename = 'government_agencies'`,
    );
    if ((govRegistryPresent.rowCount ?? 0) > 0) {
      await execFormat(`'revoke insert, update, delete on public.government_agencies from %I'`, [runtimeRole]);
      const reg = await client.query(
        `select has_table_privilege($1::text, 'public.government_agencies', 'INSERT') as i,
                has_table_privilege($1::text, 'public.government_agencies', 'UPDATE') as u,
                has_table_privilege($1::text, 'public.government_agencies', 'DELETE') as d,
                has_table_privilege($1::text, 'public.government_agencies', 'SELECT') as s`,
        [runtimeRole],
      );
      const rp = reg.rows[0];
      if (rp.i || rp.u || rp.d) {
        throw new Error(`government_agencies is still writable by ${runtimeRole} after revocation`);
      }
      if (!rp.s) {
        throw new Error(`government_agencies lost SELECT for ${runtimeRole}; the gateway could no longer read the registry`);
      }
      console.log(`revoked DML on government_agencies for ${runtimeRole} (registry is runtime-immutable)`);
    }
    const govSubmissionsPresent = await client.query(
      `select 1 from pg_tables where schemaname = 'public' and tablename = 'government_submissions'`,
    );
    if ((govSubmissionsPresent.rowCount ?? 0) > 0) {
      await execFormat(`'revoke delete on public.government_submissions from %I'`, [runtimeRole]);
      const sub = await client.query(
        `select has_table_privilege($1::text, 'public.government_submissions', 'DELETE') as d,
                has_table_privilege($1::text, 'public.government_submissions', 'INSERT') as i,
                has_table_privilege($1::text, 'public.government_submissions', 'UPDATE') as u,
                has_table_privilege($1::text, 'public.government_submissions', 'SELECT') as s`,
        [runtimeRole],
      );
      const sp = sub.rows[0];
      if (sp.d) {
        throw new Error(`government_submissions is still deletable by ${runtimeRole} after revocation`);
      }
      if (!sp.i || !sp.u || !sp.s) {
        throw new Error(`government_submissions lost required DML for ${runtimeRole}; the gateway could no longer record submissions`);
      }
      console.log(`revoked DELETE on government_submissions for ${runtimeRole} (interaction history is never erased)`);
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
  failSanitized("runtime role provisioning", e);
});
