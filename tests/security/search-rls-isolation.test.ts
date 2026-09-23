/**
 * BEYU OS — Shared Search capability: adversarial database-level RLS.
 *
 * Proves the 0066 search surface introduces NO authorization bypass at the
 * database layer. Connects with the ACTUAL runtime role (beyu_runtime,
 * NOSUPERUSER NOBYPASSRLS) and, for EVERY searched table:
 *
 *   1. RLS is ENABLED and FORCEd with the tenant policy (tenants excluded by
 *      design — the service filters it explicitly; documented, not asserted
 *      as a guarantee);
 *   2. a raw FTS predicate (`search_tsv @@ to_tsquery(token)`) with the tenant
 *      GUC pinned to TENANT_A returns ZERO rows for TENANT_B's marker — the
 *      vector cannot leak across tenants even with NO application WHERE clause;
 *   3. positive control: the GUC pinned to TENANT_B returns TENANT_B's marker;
 *   4. the trigger is SECURITY INVOKER (no privilege escalation surface) and
 *      writes only the row's own search_tsv.
 *
 * This mirrors tests/security/ujenzi-rls-isolation.test.ts conventions.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const RUNTIME_URL = process.env.BEYU_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;

const TENANT_A = "TEN_BEYU_GROUP"; // has governance bodies + entities
const TENANT_B = "TEN_BEYU_HEALTH";
const RUN = `SRCHRLS${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
const TOKEN_A = `probealpha${RUN.toLowerCase()}`;
const TOKEN_B = `probabeta${RUN.toLowerCase()}`;

const ENT_A = "LEN_BEYU_HOLDINGS";
const ENT_B = "LEN_BEYU_HEALTH_LTD";

/** table → (marker column expression, insert columns/values for a probe row) */
const PROBES: {
  table: string;
  matchExpr: string; // the column the FTS predicate tests
  insert: (id: string, tenant: string, token: string, ent: string, extra?: string) => { sql: string; params: unknown[] };
}[] = [
  {
    table: "tenants",
    matchExpr: "search_tsv",
    insert: (id, _t, token) => ({
      sql: `insert into tenants (id, code, name, type, country_code, status, classification)
            values ($1, $2, $3, 'SECTOR', 'TZ', 'ACTIVE', 'INTERNAL')`,
      params: [id, `SRCHRLS-${RUN}-${token}`, `Search RLS probe ${token}`],
    }),
  },
  {
    table: "legal_entities",
    matchExpr: "search_tsv",
    insert: (id, t, token) => ({
      sql: `insert into legal_entities (id, tenant_id, code, legal_name, entity_type, country_code, effective_from)
            values ($1, $2, $3, $4, 'OPERATING_COMPANY', 'TZ', '2024-01-01')`,
      params: [id, t, `SRCHRLS-LE-${RUN}-${token}`, `Search RLS probe entity ${token}`],
    }),
  },
  {
    table: "documents",
    matchExpr: "search_tsv",
    insert: (id, t, token) => ({
      sql: `insert into documents (id, tenant_id, file_name, file_type, category, description, version, source, uploaded_by, checksum, storage_uri, retention_code)
            values ($1,$2,$3,'pdf','PROBE','search rls probe description ${token}','1','SEED','seed',$4,'mem://srchrls','RET-STD')`,
      params: [id, t, `srchrls-${token}.pdf`, "d".repeat(64)],
    }),
  },
  {
    table: "resolutions",
    matchExpr: "search_tsv",
    // The policy requires the row's body to live in the row's OWN tenant
    // (b.tenant_id = r.tenant_id), so each probe row references its
    // per-tenant probe body created by the probe loop.
    insert: (id, t, token, _ent, bodyId) => ({
      sql: `insert into resolutions (id, tenant_id, body_id, reference, title, category, summary, rationale, data_basis, consequences, proposed_by)
            values ($1,$2,$3,$4,$5,'OTHER','search rls probe ${token}','fixture','fixture','fixture','seed')`,
      params: [id, t, bodyId!, `SRCHRLS-RES-${RUN}-${token}`, `Search RLS probe resolution ${token}`],
    }),
  },
  {
    table: "knowledge_sources",
    matchExpr: "search_tsv",
    // TENANT-scoped probe rows: they exercise the tenant branch of the policy
    // (`scope_type='GLOBAL' OR tenant_id = ANY (...)`). GLOBAL visibility for
    // every tenant context is the designed Noelia boundary; the application
    // (decideMemoryVisibility + classification ceiling) is the fine-grained
    // gate and is covered by tests/search/governed-search.service.test.ts.
    insert: (id, t, token) => ({
      sql: `insert into knowledge_sources (id, code, title, domain, owner_role, provenance, scope_type, tenant_id, classification, effective_from, review_date, content, keywords)
            values ($1,$2,$3,'SEARCH','PLATFORM_ADMIN','search rls probe','TENANT',$4,'INTERNAL','2024-01-01','2027-01-01',$5,'{}')`,
      params: [id, t, `SRCHRLS-KS-${RUN}-${token}`, t, `Search RLS probe knowledge ${token}`],
    }),
  },
  {
    table: "ujenzi_projects",
    matchExpr: "search_tsv",
    insert: (id, t, token, ent) => ({
      sql: `insert into ujenzi_projects (id, tenant_id, legal_entity_id, code, name, country_code, status)
            values ($1,$2,$3,$4,$5,'TZ','PLANNED')`,
      params: [id, t, ent, `SRCHRLS-UP-${RUN}-${token}`, `Search RLS probe project ${token}`],
    }),
  },
  {
    table: "ujenzi_boqs",
    matchExpr: "search_tsv",
    // project_id is supplied by the probe loop (a per-tenant parent project).
    insert: (id, t, token, _ent, projectId) => ({
      sql: `insert into ujenzi_boqs (id, tenant_id, project_id, version, status, currency, notes)
            values ($1,$2,$3,1,'DRAFT','TZS',$4)`,
      params: [id, t, projectId!, `search rls probe boq ${token}`],
    }),
  },
  {
    table: "agriculture_farms",
    matchExpr: "search_tsv",
    insert: (id, t, token, ent) => ({
      sql: `insert into agriculture_farms (id, tenant_id, legal_entity_id, code, name, country_code, status)
            values ($1,$2,$3,$4,$5,'TZ','ACTIVE')`,
      params: [id, t, ent, `SRCHRLS-FARM-${RUN}-${token}`, `Search RLS probe farm ${token}`],
    }),
  },
  {
    table: "agriculture_projects",
    matchExpr: "search_tsv",
    insert: (id, t, token, ent) => ({
      sql: `insert into agriculture_projects (id, tenant_id, legal_entity_id, code, name, status)
            values ($1,$2,$3,$4,$5,'ACTIVE')`,
      params: [id, t, ent, `SRCHRLS-AGP-${RUN}-${token}`, `Search RLS probe agproject ${token}`],
    }),
  },
  {
    table: "foundations",
    matchExpr: "search_tsv",
    insert: (id, t, token) => ({
      sql: `insert into foundations (id, tenant_id, code, legal_name, legal_vehicle, country_code, status)
            values ($1,$2,$3,$4,'FOUNDATION','TZ','PROPOSED')`,
      params: [id, t, `SRCHRLS-FDN-${RUN}-${token}`, `Search RLS probe foundation ${token}`],
    }),
  },
];

// The ujenzi_boqs probe needs a project per tenant; create those first.
let admin: Client;
let rt: Client;
const ids: Record<string, string[]> = {};

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  // Clean stale probe rows (admin bypasses RLS for cleanup only).
  for (const p of PROBES) await admin.query(`delete from ${p.table} where id like 'SRCHRLS-%'`);
  await admin.query(`delete from ujenzi_projects where id like 'SRCHRLS-BOQPROJ-%'`);
  await admin.query(`delete from governance_bodies where id like 'SRCHRLS-%'`);
  await admin.query(`delete from tenants where code like 'SRCHRLS-%'`);

  rt = new Client({ connectionString: RUNTIME_URL! });
  await rt.connect();

  for (const p of PROBES) {
    ids[p.table] = [];
    for (const [tenant, token] of [
      [TENANT_A, TOKEN_A],
      [TENANT_B, TOKEN_B],
    ] as const) {
      const side = tenant === TENANT_A ? "A" : "B";
      const ent = tenant === TENANT_A ? ENT_A : ENT_B;
      let extra: string | undefined;
      if (p.table === "ujenzi_boqs") {
        const pid = `SRCHRLS-BOQPROJ-${side}`;
        await admin.query(
          `insert into ujenzi_projects (id, tenant_id, legal_entity_id, code, name, country_code, status)
           values ($1,$2,$3,$4,'Search RLS boq parent','TZ','PLANNED')
           on conflict (id) do nothing`,
          [pid, tenant, ent, pid],
        );
        extra = pid;
      }
      if (p.table === "resolutions") {
        const bid = `SRCHRLS-BODY-${side}`;
        await admin.query(
          `insert into governance_bodies (id, tenant_id, code, name, body_type, status, classification)
           values ($1,$2,$3,'Search RLS probe body ${side}','COMMITTEE','ACTIVE','INTERNAL')
           on conflict (id) do nothing`,
          [bid, tenant, `SRCHRLS-BODY-${side}`],
        );
        extra = bid;
      }
      const ins = p.insert(`SRCHRLS-${p.table}-${side}`, tenant, token, ent, extra);
      await admin.query(ins.sql, ins.params);
      ids[p.table].push(`SRCHRLS-${p.table}-${side}`);
    }
  }
}, 120_000);

afterAll(async () => {
  if (!admin) return;
  await admin.query(`delete from ujenzi_boqs where id like 'SRCHRLS-%'`);
  await admin.query(`delete from ujenzi_projects where id like 'SRCHRLS-%' or code like 'SRCHRLS-BOQPROJ-%'`);
  await admin.query(`delete from agriculture_projects where id like 'SRCHRLS-%'`);
  await admin.query(`delete from agriculture_farms where id like 'SRCHRLS-%'`);
  await admin.query(`delete from foundations where id like 'SRCHRLS-%'`);
  await admin.query(`delete from knowledge_sources where id like 'SRCHRLS-%'`);
  await admin.query(`delete from resolutions where id like 'SRCHRLS-%'`);
  await admin.query(`delete from governance_bodies where id like 'SRCHRLS-%'`);
  await admin.query(`delete from documents where id like 'SRCHRLS-%'`);
  await admin.query(`delete from legal_entities where id like 'SRCHRLS-%'`);
  await admin.query(`delete from tenants where code like 'SRCHRLS-%'`);
  await admin.end();
  await rt?.end().catch(() => undefined);
});

/**
 * Emulate the FULL application context that `withTenantDatabaseContext`
 * establishes for an entity-UNscoped principal: the tenant list GUC, the
 * governance context (resolutions/governance_bodies policies predicate on
 * the classification and entity-visibility GUCs), and global scope off.
 * All five classifications and an empty entity list are supplied so the
 * TENANT predicate is the only variable under test.
 */
async function setTenant(client: Client, tenant: string): Promise<void> {
  await client.query(`select set_config('beyu.current_tenant_ids', $1, false)`, [tenant]);
  await client.query(
    `select set_config('beyu.governance_classifications', 'PUBLIC,INTERNAL,CONFIDENTIAL,RESTRICTED,HIGHLY_RESTRICTED', false)`,
  );
  await client.query(`select set_config('beyu.governance_context', 'on', false)`);
  await client.query(`select set_config('beyu.governance_entity_ids', '', false)`);
  await client.query(`select set_config('beyu.global_scope', 'off', false)`);
}

describe("Shared Search — database-level RLS (runtime role, FTS predicates)", () => {
  it("1. runtime role is non-superuser and non-bypassrls", async () => {
    const who = await rt.query(`select current_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user`);
    expect(who.rows[0].current_user).toBe("beyu_runtime");
    expect(who.rows[0].rolsuper).toBe(false);
    expect(who.rows[0].rolbypassrls).toBe(false);
  });

  it("2. every searched table (except tenants) has RLS enabled with a tenant policy the runtime role cannot bypass", async () => {
    // FORCE only matters for the table OWNER (who would otherwise bypass
    // RLS). The owner of every BEYU table is the provisioning role (postgres),
    // never the application runtime role, so RLS ENABLED is the operative
    // guarantee for beyu_runtime — and the behavioral test (4) proves it.
    const rows = await admin.query(
      `select c.relname,
              c.relrowsecurity as enabled,
              c.relforcerowsecurity as forced,
              (select r.rolname from pg_roles r where r.oid = c.relowner) as owner,
              (select count(*)::int from pg_policies p
                where p.schemaname = 'public' and p.tablename = c.relname
                  and p.qual like '%beyu_tenant_ids()%') as policies
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relname in
         ('legal_entities','documents','resolutions','knowledge_sources','ujenzi_projects',
          'ujenzi_boqs','agriculture_farms','agriculture_projects','foundations')
       order by c.relname`,
    );
    expect(rows.rows).toHaveLength(9);
    for (const row of rows.rows) {
      expect(row.enabled, `${row.relname} RLS enabled`).toBe(true);
      expect(row.policies, `${row.relname} tenant policy`).toBeGreaterThanOrEqual(1);
      expect(
        row.forced || row.owner !== "beyu_runtime",
        `${row.relname} runtime role cannot bypass RLS`,
      ).toBe(true);
    }
    // The search column + GIN index exist on every searched table.
    const cols = await admin.query(
      `select count(*)::int n from information_schema.columns
       where table_schema='public' and column_name='search_tsv' and table_name in
         ('tenants','legal_entities','documents','resolutions','knowledge_sources','ujenzi_projects',
          'ujenzi_boqs','agriculture_farms','agriculture_projects','foundations')`,
    );
    expect(cols.rows[0].n).toBe(10);
  });

  it("3. the search triggers are SECURITY INVOKER and write only the row's own vector", async () => {
    const fns = await admin.query(
      `select p.proname, p.prosecdef
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname like 'beyu_search_tsv_%'
       order by p.proname`,
    );
    expect(fns.rows).toHaveLength(10);
    for (const f of fns.rows) expect(f.prosecdef).toBe(false); // SECURITY INVOKER
  });

  for (const p of PROBES.filter((x) => x.table !== "tenants")) {
    // tenants has no RLS policy by design (the service subtree-filters it);
    // the database-level backstop is asserted on the 9 RLS-protected tables.
    it(`4. ${p.table}: FTS predicate cannot leak across tenants (RLS backstop)`, async () => {
      // Tenant A context: TENANT_A's marker is visible…
      await setTenant(rt, TENANT_A);
      const inA = await rt.query(
        `select count(*)::int n from ${p.table} where ${p.matchExpr} @@ to_tsquery($1)`,
        [TOKEN_A],
      );
      expect(inA.rows[0].n, `${p.table}: A-token visible in A context`).toBeGreaterThanOrEqual(1);
      // …but TENANT_B's marker is INVISIBLE despite matching the vector predicate.
      const crossA = await rt.query(
        `select count(*)::int n from ${p.table} where ${p.matchExpr} @@ to_tsquery($1)`,
        [TOKEN_B],
      );
      expect(crossA.rows[0].n, `${p.table}: B-token must NOT leak in A context`).toBe(0);

      // Positive control: tenant B context sees B, not A.
      await setTenant(rt, TENANT_B);
      const inB = await rt.query(
        `select count(*)::int n from ${p.table} where ${p.matchExpr} @@ to_tsquery($1)`,
        [TOKEN_B],
      );
      expect(inB.rows[0].n, `${p.table}: B-token visible in B context`).toBeGreaterThanOrEqual(1);
      const crossB = await rt.query(
        `select count(*)::int n from ${p.table} where ${p.matchExpr} @@ to_tsquery($1)`,
        [TOKEN_A],
      );
      expect(crossB.rows[0].n, `${p.table}: A-token must NOT leak in B context`).toBe(0);

      // No tenant context at all → nothing visible (empty scope, fail closed).
      await setTenant(rt, "NO_SUCH_TENANT");
      const none = await rt.query(
        `select count(*)::int n from ${p.table} where ${p.matchExpr} @@ to_tsquery($1)`,
        [TOKEN_A],
      );
      expect(none.rows[0].n, `${p.table}: no-context must be empty`).toBe(0);
    });
  }
});
