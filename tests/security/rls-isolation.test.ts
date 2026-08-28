/**
 * C-02 remediation — adversarial Row Level Security isolation test.
 *
 * Connects with the ACTUAL application runtime role (beyu_runtime) and proves
 * that PostgreSQL RLS independently enforces tenant isolation at the database
 * layer, i.e. even if an application developer removed a tenant WHERE clause,
 * the database still prevents cross-tenant access.
 *
 * This is the runtime-role proof. The unit/integration suite runs with a
 * privileged TEST role (tests/setup-env.ts) because it invokes domain services
 * directly without the guarded() tenant-context wrapper; that is a test-harness
 * property, not a runtime property. The runtime role is exercised here and by
 * the HTTP/E2E suite (the server runs on the runtime role).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const RUNTIME_URL = process.env.BEYU_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;

const TENANT_A = "TEN_BEYU_TZ"; // tenant A
const TENANT_B = "TEN_BEYU_FINTECH"; // tenant B

function runtimeConnection(): Client {
  if (!RUNTIME_URL) throw new Error("BEYU_RUNTIME_DATABASE_URL is required for the RLS runtime-role test");
  return new Client({ connectionString: RUNTIME_URL });
}

/**
 * Set the tenant context for the DEDICATED runtime-role test connection.
 * We use session-level scope (`is_local = false`) so the context persists
 * across the separate autocommit queries below. This mirrors the application
 * semantics (a request runs under one resolved tenant scope); the 
 * transaction-scoped `SET LOCAL` case (the real production mechanism) is
 * covered by the dedicated connection-reuse test at the bottom.
 */
async function setContext(client: Client, tenantIds: string): Promise<void> {
  await client.query(`select set_config('beyu.current_tenant_ids', $1, false)`, [tenantIds]);
}

async function insertApproval(client: Client, id: string, tenantId: string): Promise<void> {
  await client.query(
    `insert into approvals (id, tenant_id, object_type, object_id, approver_role, decision, requested_by)
     values ($1, $2, 'RLS_ATTACK', 'OBJ', 'TEST', 'APPROVED', 'RLS_TEST')`,
    [id, tenantId],
  );
}

describe("C-02 database-level RLS isolation (runtime role)", () => {
  let rt: Client;
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    // Clean any stale test rows (admin bypasses RLS for cleanup).
    await admin.query(`delete from approvals where object_type = 'RLS_ATTACK'`);

    rt = runtimeConnection();
    await rt.connect();

    // 1. Runtime role is a NON-SUPERUSER, NON-bypassrls role.
    const who = await rt.query(
      `select current_user, rolsuper, rolbypassrls, rolcreaterole
         from pg_roles where rolname = current_user`,
    );
    expect(who.rows[0].current_user).toBe("beyu_runtime");
    expect(who.rows[0].rolsuper).toBe(false);
    expect(who.rows[0].rolbypassrls).toBe(false);
    expect(who.rows[0].rolcreaterole).toBe(false);

    // Seed representative records for both tenants using the runtime role with
    // the correct per-tenant context (mirrors real application writes).
    await setContext(rt, TENANT_A);
    await insertApproval(rt, "APP_RLS_A", TENANT_A);
    await setContext(rt, TENANT_B);
    await insertApproval(rt, "APP_RLS_B", TENANT_B);
    await setContext(rt, ""); // clear
  });

  afterAll(async () => {
    try {
      await admin.query(`delete from approvals where id in ('APP_RLS_A','APP_RLS_B')`);
    } catch {
      /* best effort */
    }
    await rt.end().catch(() => undefined);
    await admin.end().catch(() => undefined);
  });

  it("SELECT: TENANT_A context sees tenant A rows and hides tenant B rows", async () => {
    await setContext(rt, TENANT_A);
    const r = await rt.query(`select id, tenant_id from approvals where id in ('APP_RLS_A','APP_RLS_B') order by id`);
    expect(r.rows).toEqual([{ id: "APP_RLS_A", tenant_id: TENANT_A }]);
  });

  it("SELECT: TENANT_B context sees tenant B rows and hides tenant A rows", async () => {
    await setContext(rt, TENANT_B);
    const r = await rt.query(`select id, tenant_id from approvals where id in ('APP_RLS_A','APP_RLS_B') order by id`);
    expect(r.rows).toEqual([{ id: "APP_RLS_B", tenant_id: TENANT_B }]);
  });

  it("UPDATE: TENANT_A context cannot mutate a TENANT_B row (0 rows affected)", async () => {
    await setContext(rt, TENANT_A);
    const r = await rt.query(
      `update approvals set comment = 'tampered' where id = 'APP_RLS_B'`,
    );
    expect(Number(r.rowCount)).toBe(0);
  });

  it("DELETE: TENANT_A context cannot delete a TENANT_B row (0 rows affected)", async () => {
    await setContext(rt, TENANT_A);
    const r = await rt.query(`delete from approvals where id = 'APP_RLS_B'`);
    expect(Number(r.rowCount)).toBe(0);
  });

  it("INSERT: forged TENANT_B tenant_id under TENANT_A context is rejected by WITH CHECK", async () => {
    await setContext(rt, TENANT_A);
    await expect(
      insertApproval(rt, "APP_RLS_FORGED", TENANT_B),
    ).rejects.toThrow(/row-level security|WITH CHECK|violates row-level/);
  });

  it("JOIN: joining across tenants exposes only the in-context rows", async () => {
    await setContext(rt, TENANT_A);
    const r = await rt.query(
      `select a.id from approvals a join approvals b on a.id = b.id
        where a.id in ('APP_RLS_A','APP_RLS_B')`,
    );
    expect(r.rows.map((x) => x.id)).toEqual(["APP_RLS_A"]);
  });

  it("AGGREGATE: cross-tenant aggregation counts only the in-context rows", async () => {
    await setContext(rt, TENANT_A);
    const r = await rt.query(
      `select count(*)::int as n from approvals where object_type = 'RLS_ATTACK'`,
    );
    expect(r.rows[0].n).toBe(1);
  });

  it("SUBQUERY: a subquery across a foreign tenant cannot surface its rows", async () => {
    await setContext(rt, TENANT_A);
    const r = await rt.query(
      `select id from approvals
        where id in (select id from approvals where tenant_id = $1)
        and id in ('APP_RLS_A','APP_RLS_B')`,
      [TENANT_B],
    );
    expect(r.rows).toEqual([]);
  });

  it("NO context: a fresh/cleared connection sees zero tenant rows (fail safe)", async () => {
    await setContext(rt, "");
    const r = await rt.query(`select count(*)::int as n from approvals where object_type = 'RLS_ATTACK'`);
    expect(r.rows[0].n).toBe(0);
  });

  it("INVALID context: a nonexistent tenant sees zero rows", async () => {
    await setContext(rt, "TEN_DOES_NOT_EXIST");
    const r = await rt.query(`select count(*)::int as n from approvals where object_type = 'RLS_ATTACK'`);
    expect(r.rows[0].n).toBe(0);
  });

  it("MULTIPLE context: a composite tenant context sees both in-scope tenants", async () => {
    await setContext(rt, `${TENANT_A},${TENANT_B}`);
    const r = await rt.query(`select id from approvals where id in ('APP_RLS_A','APP_RLS_B') order by id`);
    expect(r.rows.map((x) => x.id)).toEqual(["APP_RLS_A", "APP_RLS_B"]);
  });

  it("CONTEXT GUC is transaction-scoped: it cannot leak across transactions on a reused connection", async () => {
    // Simulate the application's SET LOCAL (transaction-scoped) design.
    const c = runtimeConnection();
    await c.connect();
    await c.query("begin");
    await c.query(`select set_config('beyu.current_tenant_ids', $1, true)`, [TENANT_A]);
    await c.query("commit");
    // After commit the SET LOCAL value is gone; the reused connection must not
    // retain tenant A visibility for the next (unrelated) transaction.
    const after = await c.query(`select count(*)::int as n from approvals where object_type = 'RLS_ATTACK'`);
    expect(after.rows[0].n).toBe(0);
    await c.end();
  });

  it("DEFENSE-IN-DEPTH: dropping the tenant WHERE clause still cannot leak the foreign tenant", async () => {
    // An application developer accidentally removing the WHERE clause must not
    // expose cross-tenant rows: RLS is the backstop.
    await setContext(rt, TENANT_A);
    const r = await rt.query(`select id, tenant_id from approvals where object_type = 'RLS_ATTACK' order by id`);
    expect(r.rows.map((x) => x.id)).toEqual(["APP_RLS_A"]);
    expect(r.rows.every((x) => x.tenant_id === TENANT_A)).toBe(true);
  });
});
