/**
 * FOUNDATION OS — adversarial Row Level Security isolation test (runtime role).
 *
 * Connects with the ACTUAL application runtime role (beyu_runtime,
 * NOSUPERUSER NOBYPASSRLS) and proves PostgreSQL RLS independently enforces
 * tenant isolation for the Foundation OS substrate at the database layer: even
 * if an application developer removed a tenant WHERE clause, the database still
 * prevents cross-tenant access. Mirrors tests/security/rls-isolation.test.ts
 * and tests/security/ujenzi-rls-isolation.test.ts.
 *
 * WHY THIS SUITE EXISTS
 *   `foundation_programs` was created by the 0000 kernel baseline, before the
 *   RLS hardening wave. Migration 0035 enabled Row Level Security on the 39
 *   Foundation tables IT created and enumerated them by name in its grant and
 *   verification blocks — so the pre-existing program table was never covered.
 *   The result was that one Foundation substrate had no RLS at all: as the
 *   runtime role, a FOREIGN or even EMPTY tenant context returned every
 *   Foundation program row. Migration 0069 closes that gap; this suite is the
 *   executable proof, and it asserts the WHOLE Foundation substrate so the gap
 *   cannot silently reappear on any table.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const RUNTIME_URL = process.env.BEYU_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;

/** The canonical Foundation Sector OS tenant (seeded in src/db/seed.ts). */
const TENANT_A = "TEN_BEYU_FOUNDATION";
/** A foreign sector tenant: holds Foundation capabilities for no reason here. */
const TENANT_B = "TEN_BEYU_HEALTH";
/** A tenant that does not exist at all. */
const TENANT_UNKNOWN = "TEN_DOES_NOT_EXIST";

const RUN = `RLSFDN${Date.now()}`;

/**
 * The canonical Foundation OS substrate: the 39 tables created by migration
 * 0035 plus `foundation_programs` (0000 baseline, covered by 0069). Every one
 * of these must be RLS-bound — this list is the durable regression guard.
 */
const FOUNDATION_TABLES = [
  "foundation_types",
  "foundations",
  "formation_cases",
  "structure_proposals",
  "structure_scenarios",
  "foundation_meetings",
  "foundation_conflicts",
  "foundation_tax_profiles",
  "foundation_tax_rules",
  "foundation_tax_assessments",
  "foundation_obligations",
  "foundation_deadlines",
  "foundation_compliance_tasks",
  "foundation_notification_log",
  "foundation_escalations",
  "foundation_evidence",
  "donors",
  "donations",
  "donation_pledges",
  "funds",
  "fund_restrictions",
  "fund_allocations",
  "grantees",
  "grants",
  "grant_milestones",
  "grant_disbursements",
  "foundation_programs",
  "foundation_projects",
  "foundation_project_tasks",
  "foundation_beneficiaries",
  "beneficiary_services",
  "foundation_suppliers",
  "procurements",
  "foundation_assets",
  "foundation_investment_policies",
  "foundation_investments",
  "safeguarding_cases",
  "foundation_impact_metrics",
  "foundation_impact_measurements",
  "foundation_workforce_assignments",
] as const;

function runtimeConnection(): Client {
  if (!RUNTIME_URL) {
    throw new Error("BEYU_RUNTIME_DATABASE_URL is required for the Foundation RLS runtime-role test");
  }
  return new Client({ connectionString: RUNTIME_URL });
}

/**
 * Session-level tenant context (`is_local = false`) so it persists across the
 * separate autocommit queries below. This mirrors the application semantics —
 * one request runs under one resolved tenant scope. The transaction-scoped
 * `SET LOCAL` production mechanism is covered by the dedicated
 * connection-reuse test at the bottom of this suite.
 */
async function setContext(client: Client, tenantIds: string): Promise<void> {
  await client.query(`select set_config('beyu.current_tenant_ids', $1, false)`, [tenantIds]);
}

async function insertProgram(client: Client, id: string, tenantId: string, code: string): Promise<void> {
  await client.query(
    `insert into foundation_programs
       (id, tenant_id, code, name, theme, country_code, budget, currency, status)
     values ($1, $2, $3, 'RLS probe programme', 'HEALTH', 'TZ', '1000.00', 'USD', 'ACTIVE')`,
    [id, tenantId, code],
  );
}

describe("Foundation OS database-level RLS isolation (runtime role)", () => {
  let rt: Client;
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    // Clean any stale probe rows (admin bypasses RLS for cleanup only).
    await admin.query(`delete from foundation_programs where code like 'RLSFDN%'`);

    rt = runtimeConnection();
    await rt.connect();

    // 1. The runtime role is a NON-SUPERUSER, NON-bypassrls role: RLS is not
    //    optional for it, which is what makes this suite a security test rather
    //    than a query test.
    const who = await rt.query(
      `select current_user, rolsuper, rolbypassrls, rolcreaterole
         from pg_roles where rolname = current_user`,
    );
    expect(who.rows[0].current_user).toBe("beyu_runtime");
    expect(who.rows[0].rolsuper).toBe(false);
    expect(who.rows[0].rolbypassrls).toBe(false);
    expect(who.rows[0].rolcreaterole).toBe(false);

    // 2. Seed one programme per tenant through the RUNTIME role with the
    //    correct per-tenant context, mirroring a real application write. Both
    //    inserts must succeed — the WITH CHECK clause is satisfied by context.
    await setContext(rt, TENANT_A);
    await insertProgram(rt, `${RUN}_A`, TENANT_A, `${RUN}A`);
    await setContext(rt, TENANT_B);
    await insertProgram(rt, `${RUN}_B`, TENANT_B, `${RUN}B`);
    await setContext(rt, ""); // clear
  });

  afterAll(async () => {
    await admin?.query(`delete from foundation_programs where code like 'RLSFDN%'`);
    await rt?.end().catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  describe("structural coverage — every Foundation substrate is RLS-bound", () => {
    it("all 40 Foundation OS tables have RLS enabled and exactly one canonical tenant policy", async () => {
      const rls = await admin.query(
        `select c.relname,
                c.relrowsecurity as enabled,
                (select count(*)::int from pg_policies p
                  where p.schemaname = 'public' and p.tablename = c.relname
                    and p.policyname = c.relname || '_tenant_isolation'
                    and p.qual like '%beyu_tenant_ids()%'
                    and p.with_check like '%beyu_tenant_ids()%') as policies
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r'
            and c.relname = any($1::text[])
          order by c.relname`,
        [[...FOUNDATION_TABLES]],
      );

      // The canonical substrate must actually exist — a renamed or dropped table
      // would otherwise make the per-row assertions below vacuously true.
      expect(rls.rows.map((r) => r.relname).sort()).toEqual([...FOUNDATION_TABLES].sort());

      for (const row of rls.rows) {
        expect(
          { table: row.relname, enabled: row.enabled, policies: Number(row.policies) },
          `${row.relname} must be RLS-bound with the canonical beyu_tenant_ids() policy`,
        ).toEqual({ table: row.relname, enabled: true, policies: 1 });
      }
    });

    it("foundation_programs specifically carries the 0069 isolation policy and tenant index", async () => {
      const policy = await admin.query(
        `select policyname, cmd, qual, with_check from pg_policies
          where schemaname = 'public' and tablename = 'foundation_programs'`,
      );
      expect(policy.rows).toHaveLength(1);
      expect(policy.rows[0].policyname).toBe("foundation_programs_tenant_isolation");
      expect(policy.rows[0].cmd).toBe("ALL");
      expect(policy.rows[0].qual).toMatch(/beyu_tenant_ids\(\)/);
      expect(policy.rows[0].with_check).toMatch(/beyu_tenant_ids\(\)/);

      const index = await admin.query(
        `select 1 from pg_indexes
          where schemaname = 'public' and tablename = 'foundation_programs'
            and indexname = 'foundation_programs_tenant_idx'`,
      );
      expect(index.rows).toHaveLength(1);
    });
  });

  describe("reads — a foreign or empty tenant context sees nothing", () => {
    it("TENANT A sees only its own Foundation programs", async () => {
      await setContext(rt, TENANT_A);
      const rows = await rt.query(
        `select id, tenant_id from foundation_programs where code like 'RLSFDN%'`,
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].id).toBe(`${RUN}_A`);
      expect(rows.rows[0].tenant_id).toBe(TENANT_A);
    });

    it("TENANT B sees only its own Foundation programs", async () => {
      await setContext(rt, TENANT_B);
      const rows = await rt.query(
        `select id, tenant_id from foundation_programs where code like 'RLSFDN%'`,
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].id).toBe(`${RUN}_B`);
      expect(rows.rows[0].tenant_id).toBe(TENANT_B);
    });

    it("an unknown tenant context sees no Foundation program at all", async () => {
      await setContext(rt, TENANT_UNKNOWN);
      const rows = await rt.query(
        `select id from foundation_programs where code like 'RLSFDN%'`,
      );
      expect(rows.rows).toHaveLength(0);
    });

    it("an EMPTY tenant context sees no Foundation program at all (fail closed)", async () => {
      // This is the exact condition migration 0069 was written for: before it,
      // an empty context returned every row in the table.
      await setContext(rt, "");
      const rows = await rt.query(`select id from foundation_programs`);
      expect(rows.rows).toHaveLength(0);
    });

    it("the seeded canonical Foundation programs are invisible from a foreign tenant", async () => {
      // The real seeded rows (FDN-HEALTH-01, FDN-EDU-02, FDN-AGRI-03) live in
      // TEN_BEYU_FOUNDATION. A foreign context must not see any of them.
      await setContext(rt, TENANT_B);
      const foreign = await rt.query(
        `select id, code from foundation_programs
          where code in ('FDN-HEALTH-01','FDN-EDU-02','FDN-AGRI-03')`,
      );
      expect(foreign.rows).toHaveLength(0);

      await setContext(rt, TENANT_A);
      const own = await rt.query(
        `select id, code from foundation_programs
          where code in ('FDN-HEALTH-01','FDN-EDU-02','FDN-AGRI-03')`,
      );
      expect(own.rows.length).toBeGreaterThan(0);
      await setContext(rt, "");
    });

    it("RLS survives a JOIN: programs cannot be reached through a foreign-tenant foundation", async () => {
      await setContext(rt, TENANT_B);
      const joined = await rt.query(
        `select p.id from foundation_programs p
           join foundations f on f.id = p.id
          where p.code like 'RLSFDN%'`,
      );
      expect(joined.rows).toHaveLength(0);
      await setContext(rt, "");
    });
  });

  describe("writes — WITH CHECK refuses a cross-tenant row", () => {
    it("inserting a TENANT B row under a TENANT A context is rejected", async () => {
      await setContext(rt, TENANT_A);
      await expect(
        insertProgram(rt, `${RUN}_X`, TENANT_B, `${RUN}X`),
      ).rejects.toThrow(/row-level security|row level security/i);
      await setContext(rt, "");
    });

    it("UPDATE cannot relocate a Foundation program into another tenant", async () => {
      await setContext(rt, TENANT_A);
      const move = rt.query(
        `update foundation_programs set tenant_id = $1 where id = $2`,
        [TENANT_B, `${RUN}_A`],
      );
      // The row is visible to A, but WITH CHECK rejects the new tenant_id, so
      // the statement errors rather than silently smuggling the row across.
      await expect(move).rejects.toThrow(/row-level security|row level security/i);
      await setContext(rt, "");

      // Prove the row did not move.
      await setContext(rt, TENANT_A);
      const still = await rt.query(
        `select tenant_id from foundation_programs where id = $1`,
        [`${RUN}_A`],
      );
      expect(still.rows[0]?.tenant_id).toBe(TENANT_A);
      await setContext(rt, "");
    });

    it("DELETE under a foreign context removes nothing", async () => {
      await setContext(rt, TENANT_B);
      const del = await rt.query(
        `delete from foundation_programs where id = $1`,
        [`${RUN}_A`],
      );
      expect(del.rowCount).toBe(0);
      await setContext(rt, "");

      await setContext(rt, TENANT_A);
      const still = await rt.query(
        `select id from foundation_programs where id = $1`,
        [`${RUN}_A`],
      );
      expect(still.rows).toHaveLength(1);
      await setContext(rt, "");
    });
  });

  describe("the context is transaction-scoped in production usage", () => {
    it("SET LOCAL cannot leak across transactions on a reused connection", async () => {
      const c = runtimeConnection();
      await c.connect();
      await c.query("begin");
      await c.query(`select set_config('beyu.current_tenant_ids', $1, true)`, [TENANT_A]);
      const inside = await c.query(
        `select count(*)::int as n from foundation_programs where code like 'RLSFDN%'`,
      );
      expect(inside.rows[0].n).toBe(1);
      await c.query("commit");

      // A new transaction on the same pooled connection must start with NO
      // tenant context, and therefore see nothing.
      const after = await c.query(
        `select count(*)::int as n from foundation_programs where code like 'RLSFDN%'`,
      );
      expect(after.rows[0].n).toBe(0);
      await c.end();
    });
  });
});
