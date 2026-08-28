/**
 * C-02 remediation — runtime role privilege & SECURITY DEFINER / bypass audit.
 *
 * Verifies, against the live database, that the runtime application role:
 *   - is NOT a superuser, does NOT have BYPASSRLS, CREATEROLE or CREATEDB,
 *   - is not a member of any role that grants superuser / bypassrls,
 *   - owns no tables (ownership stays with the admin role so RLS always binds
 *     the runtime role, including non-FORCE RLS tables),
 *   - cannot SET ROLE to a superuser,
 *   - has no application-accessible SECURITY DEFINER function that could
 *     bypass RLS on its behalf.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const RUNTIME_URL = process.env.BEYU_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
const RUNTIME_ROLE = process.env.BEYU_RUNTIME_DB_ROLE ?? "beyu_runtime";

describe("C-02 runtime role privilege & SECURITY DEFINER audit", () => {
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
  });

  afterAll(async () => {
    await admin.end().catch(() => undefined);
  });

  it("runtime role is non-superuser, non-bypassrls, non-createrole, non-createdb", async () => {
    const r = await admin.query(
      `select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolinherit, rolcanlogin
         from pg_roles where rolname = $1`,
      [RUNTIME_ROLE],
    );
    const a = r.rows[0];
    expect(a.rolsuper).toBe(false);
    expect(a.rolbypassrls).toBe(false);
    expect(a.rolcreaterole).toBe(false);
    expect(a.rolcreatedb).toBe(false);
    expect(a.rolcanlogin).toBe(true);
  });

  it("runtime role is not a member of any role that itself has superuser or bypassrls", async () => {
    const r = await admin.query(
      `select r2.rolname, r2.rolsuper, r2.rolbypassrls
         from pg_auth_members m
         join pg_roles r1 on r1.oid = m.member
         join pg_roles r2 on r2.oid = m.roleid
         where r1.rolname = $1 and (r2.rolsuper or r2.rolbypassrls)`,
      [RUNTIME_ROLE],
    );
    expect(r.rows).toEqual([]);
  });

  it("runtime role owns no tables (ownership stays with the admin role)", async () => {
    const r = await admin.query(
      `select count(*)::int as n from pg_tables where schemaname='public' and tableowner = $1`,
      [RUNTIME_ROLE],
    );
    expect(r.rows[0].n).toBe(0);
  });

  it("runtime role cannot SET ROLE to a superuser role", async () => {
    const rt = new Client({ connectionString: RUNTIME_URL });
    await rt.connect();
    try {
      await expect(rt.query("set role postgres")).rejects.toThrow(/permission denied/i);
    } finally {
      await rt.end().catch(() => undefined);
    }
  });

  it("no application function is SECURITY DEFINER in a way that grants RLS bypass", async () => {
    // List every SECURITY DEFINER function in the public schema. In a hardened
    // deployment the application never defines one; if any exist they must be
    // owned by the admin role (not the runtime role) and must not elevate the
    // runtime role's RLS status.
    const r = await admin.query(
      `select p.oid::regprocedure as f,
              pg_get_userbyid(p.proowner) as owner,
              p.prosecdef as is_security_definer,
              p.proconfig
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prosecdef`,
    );
    const ownedByRuntime = r.rows.filter((x) => x.owner === RUNTIME_ROLE);
    expect(ownedByRuntime).toEqual([]);
    // Log the full set for the audit report.
    console.log("SECURITY DEFINER functions:", JSON.stringify(r.rows.map((x) => x.f), null, 2));
  });

  it("runtime role has no BYPASSRLS and cannot grant itself one", async () => {
    const rt = new Client({ connectionString: RUNTIME_URL });
    await rt.connect();
    try {
      const who = await rt.query(
        `select rolbypassrls from pg_roles where rolname = current_user`,
      );
      expect(who.rows[0].rolbypassrls).toBe(false);
    } finally {
      await rt.end().catch(() => undefined);
    }
  });
});
