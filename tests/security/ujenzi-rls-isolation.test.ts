/**
 * UJENZI OS — adversarial Row Level Security isolation test (runtime role).
 *
 * Connects with the ACTUAL application runtime role (beyu_runtime,
 * NOSUPERUSER NOBYPASSRLS) and proves PostgreSQL RLS independently enforces
 * tenant isolation for the construction domain at the database layer: even if
 * an application developer removed a tenant WHERE clause, the database still
 * prevents cross-tenant access. Mirrors tests/security/rls-isolation.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const RUNTIME_URL = process.env.BEYU_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;

const TENANT_A = "TEN_BEYU_UJENZI"; // construction tenant
const TENANT_B = "TEN_BEYU_HEALTH"; // foreign sector tenant
const RUN = `RLSUJZ${Date.now()}`;

function runtimeConnection(): Client {
  if (!RUNTIME_URL) throw new Error("BEYU_RUNTIME_DATABASE_URL is required for the Ujenzi RLS runtime-role test");
  return new Client({ connectionString: RUNTIME_URL });
}

async function setContext(client: Client, tenantIds: string): Promise<void> {
  await client.query(`select set_config('beyu.current_tenant_ids', $1, false)`, [tenantIds]);
}

async function insertProject(client: Client, id: string, tenantId: string, code: string): Promise<void> {
  await client.query(
    `insert into ujenzi_projects (id, tenant_id, legal_entity_id, code, name, country_code, status)
     values ($1, $2, 'LEN_BEYU_UJENZI_LTD', $3, 'RLS probe project', 'TZ', 'PLANNED')`,
    [id, tenantId, code],
  );
}

describe("Ujenzi database-level RLS isolation (runtime role)", () => {
  let rt: Client;
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    // Clean any stale probe rows (admin bypasses RLS for cleanup only).
    await admin.query(`delete from ujenzi_projects where code like 'RLSUJZ%'`);

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

    // 2. Every Ujenzi table has RLS ENABLED and FORCEd with a tenant policy.
    const rls = await admin.query(`
      select c.relname,
             c.relrowsecurity as enabled,
             c.relforcerowsecurity as forced,
             (select count(*)::int from pg_policies p
               where p.schemaname = 'public' and p.tablename = c.relname
                 and p.qual like '%beyu_tenant_ids()%') as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'ujenzi_%'
      order by c.relname`);
    expect(rls.rows.length).toBe(23);
    for (const row of rls.rows) {
      expect({ table: row.relname, enabled: row.enabled, forced: row.forced, policies: row.policies }).toEqual({
        table: row.relname,
        enabled: true,
        forced: true,
        policies: 1,
      });
    }

    // 3. Seed representative construction rows per tenant via the runtime role
    //    with the correct per-tenant context (mirrors real application writes).
    await setContext(rt, TENANT_A);
    await insertProject(rt, `${RUN}_A`, TENANT_A, `${RUN}A`);
    await setContext(rt, TENANT_B);
    await insertProject(rt, `${RUN}_B`, TENANT_B, `${RUN}B`);
    await setContext(rt, ""); // clear
  });

  afterAll(async () => {
    try {
      await admin.query(`delete from ujenzi_projects where code like 'RLSUJZ%'`);
    } catch {
      /* best effort */
    }
    await rt.end().catch(() => undefined);
    await admin.end().catch(() => undefined);
  });

  it("SELECT: construction tenant context sees its rows and hides the foreign sector's rows", async () => {
    await setContext(rt, TENANT_A);
    const r = await rt.query(`select id, tenant_id from ujenzi_projects where code like $1 order by id`, [`${RUN}%`]);
    expect(r.rows).toEqual([{ id: `${RUN}_A`, tenant_id: TENANT_A }]);
  });

  it("SELECT: the foreign sector tenant context cannot see construction rows", async () => {
    await setContext(rt, TENANT_B);
    const r = await rt.query(`select id from ujenzi_projects where code like $1`, [`${RUN}%`]);
    expect(r.rows.map((x: { id: string }) => x.id)).toEqual([`${RUN}_B`]);
  });

  it("UPDATE: construction context cannot mutate a foreign tenant row (0 rows affected)", async () => {
    await setContext(rt, TENANT_A);
    const r = await rt.query(`update ujenzi_projects set name = 'tampered' where id = $1`, [`${RUN}_B`]);
    expect(Number(r.rowCount)).toBe(0);
  });

  it("DELETE: construction context cannot delete a foreign tenant row (0 rows affected)", async () => {
    await setContext(rt, TENANT_A);
    const r = await rt.query(`delete from ujenzi_projects where id = $1`, [`${RUN}_B`]);
    expect(Number(r.rowCount)).toBe(0);
  });

  it("INSERT: forged foreign tenant_id under construction context is rejected by WITH CHECK", async () => {
    await setContext(rt, TENANT_A);
    await expect(insertProject(rt, `${RUN}_FORGED`, TENANT_B, `${RUN}X`)).rejects.toThrow(
      /row-level security|WITH CHECK|violates row-level/,
    );
  });

  it("CHECK constraint: an invalid project status is rejected at the database layer", async () => {
    await setContext(rt, TENANT_A);
    await expect(
      rt.query(
        `insert into ujenzi_projects (id, tenant_id, legal_entity_id, code, name, country_code, status)
         values ($1, $2, 'LEN_BEYU_UJENZI_LTD', $3, 'bad status probe', 'TZ', 'NOT_A_STATUS')`,
        [`${RUN}_BADSTATUS`, TENANT_A, `${RUN}S`],
      ),
    ).rejects.toThrow(/ujenzi_projects_status_ck|check constraint/i);
  });

  it("CHECK constraint: cost records enforce the five-kind distinction", async () => {
    await setContext(rt, TENANT_A);
    await expect(
      rt.query(
        `insert into ujenzi_cost_records (id, tenant_id, project_id, kind, amount)
         values ($1, $2, $3, 'NOT_A_KIND', 1)`,
        [`${RUN}_BADCOST`, TENANT_A, `${RUN}_A`],
      ),
    ).rejects.toThrow(/ujenzi_cost_records_kind_ck|check constraint/i);
  });

  it("AGGREGATE: cross-tenant aggregation counts only the in-context rows", async () => {
    await setContext(rt, TENANT_A);
    const r = await rt.query(`select count(*)::int as n from ujenzi_projects where code like $1`, [`${RUN}%`]);
    expect(r.rows[0].n).toBe(1);
  });

  it("NO context: a fresh/cleared connection sees zero construction rows (fail safe)", async () => {
    await setContext(rt, "");
    const r = await rt.query(`select count(*)::int as n from ujenzi_projects where code like $1`, [`${RUN}%`]);
    expect(r.rows[0].n).toBe(0);
  });

  it("INVALID context: a nonexistent tenant sees zero rows", async () => {
    await setContext(rt, "TEN_DOES_NOT_EXIST");
    const r = await rt.query(`select count(*)::int as n from ujenzi_projects where code like $1`, [`${RUN}%`]);
    expect(r.rows[0].n).toBe(0);
  });

  it("child tables inherit the same isolation (BOQ + cost records under a project)", async () => {
    await setContext(rt, TENANT_A);
    const boq = await rt.query(
      `insert into ujenzi_boqs (id, tenant_id, project_id, version, status)
       values ($1, $2, $3, 1, 'DRAFT') returning id`,
      [`${RUN}_BOQ`, TENANT_A, `${RUN}_A`],
    );
    expect(boq.rows[0].id).toBe(`${RUN}_BOQ`);
    await rt.query(
      `insert into ujenzi_cost_records (id, tenant_id, project_id, kind, amount)
       values ($1, $2, $3, 'BUDGET', 100)`,
      [`${RUN}_COST`, TENANT_A, `${RUN}_A`],
    );
    // Foreign tenant context cannot see those children...
    await setContext(rt, TENANT_B);
    const hidden = await rt.query(`select count(*)::int as n from ujenzi_boqs where id = $1`, [`${RUN}_BOQ`]);
    expect(hidden.rows[0].n).toBe(0);
    // ...and cannot attach rows to them: inserting with the owner tenant's id
    // under a foreign context is rejected by WITH CHECK.
    await expect(
      rt.query(
        `insert into ujenzi_boq_items (id, tenant_id, boq_id, code, description, unit, quantity, rate)
         values ($1, $2, $3, '01', 'x', 'M3', 1, 1)`,
        [`${RUN}_ITEM`, TENANT_A, `${RUN}_BOQ`],
      ),
    ).rejects.toThrow(/row-level security|WITH CHECK|violates row-level/);
    // cleanup via admin (foreign-context runtime must not be able to).
    await admin.query(`delete from ujenzi_boq_items where id = $1`, [`${RUN}_ITEM`]).catch(() => undefined);
    await admin.query(`delete from ujenzi_cost_records where id = $1`, [`${RUN}_COST`]);
    await admin.query(`delete from ujenzi_boqs where id = $1`, [`${RUN}_BOQ`]);
  });
});
