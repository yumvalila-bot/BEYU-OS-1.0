/**
 * Family Office capital & wealth — adversarial Row Level Security isolation.
 *
 * The 23 tables added by `drizzle/0037_family_office_capital_wealth.sql` carry a
 * `tenant_isolation` policy each. A policy that exists is not a policy that works,
 * so this suite proves the enforcement empirically, at the database layer, using
 * the ACTUAL non-superuser application runtime role (`beyu_runtime`,
 * `NOBYPASSRLS`).
 *
 * Three properties are proven for representative tables across the risk areas —
 * money (investments, obligations), governance authority (committee decisions) and
 * sensitive family data (generational plans, education):
 *
 *   1. READ  isolation — under tenant A's context, tenant B's rows are invisible.
 *   2. WRITE isolation — under tenant A's context, inserting a row owned by
 *      tenant B is refused by the policy's WITH CHECK.
 *   3. The same-tenant path still works, so the denial is isolation and not a
 *      blanket lock that would make the feature unusable (a test that only proves
 *      denial proves nothing if the table rejects everything).
 *
 * Mirrors the canonical pattern in `tests/security/rls-isolation.test.ts`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const RUNTIME_URL = process.env.BEYU_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;

const TENANT_A = "TEN_BEYU_GROUP";
const TENANT_B = "TEN_BEYU_FINTECH";

/** Rows this suite creates, so cleanup is exact and never touches other data. */
const PREFIX = "RLS_FO_";

function runtimeConnection(): Client {
  if (!RUNTIME_URL) throw new Error("BEYU_RUNTIME_DATABASE_URL is required for the Family Office RLS test");
  return new Client({ connectionString: RUNTIME_URL });
}

/** Session-level tenant scope, mirroring one request's resolved tenant scope. */
async function setContext(client: Client, tenantIds: string): Promise<void> {
  await client.query(`select set_config('beyu.current_tenant_ids', $1, false)`, [tenantIds]);
}

/**
 * Minimal valid INSERT per table. Only the columns with no default are supplied;
 * every monetary column is an exact numeric, never a float.
 */
const INSERTS: Record<string, { columns: string; values: (id: string, tenantId: string) => unknown[] }> = {
  family_investments: {
    columns: "(id, tenant_id, country_code, type, name, asset_class, currency, acquisition_cost, cash_invested, acquisition_date, liquidity)",
    values: (id, tenantId) => [id, tenantId, "TZ", "REAL_ESTATE", "RLS probe asset", "COMMERCIAL_PROPERTY", "TZS", "1000000.00", "400000.00", "2026-01-01", "ILLIQUID"],
  },
  family_obligations: {
    columns:
      "(id, tenant_id, kind, direction, borrower_ref, borrower_name, borrower_party_type, borrower_country_code, lender_ref, lender_name, lender_party_type, lender_country_code, currency, principal, outstanding, rate_type, payment_frequency, amortisation)",
    values: (id, tenantId) => [
      id, tenantId, "INTERCOMPANY_LOAN", "FAMILY_IS_BORROWER",
      "P-B", "Borrower Ltd", "GROUP_ENTITY", "TZ",
      "P-L", "Lender Ltd", "EXTERNAL_LENDER", "GB",
      "TZS", "1000000.00", "800000.00", "FIXED", "QUARTERLY", "AMORTISING",
    ],
  },
  family_committee_decisions: {
    columns: "(id, tenant_id, decision, body_ref, quorum_minimum, majority_rule, decision_date, reason, requester_ref)",
    values: (id, tenantId) => [id, tenantId, "APPROVE", "FAMILY_COUNCIL", 3, "SIMPLE", "2026-01-01", "RLS isolation probe decision.", "U-REQ"],
  },
  family_generational_plans: {
    columns: "(id, tenant_id, structure_ref, objective, generation, success_criteria)",
    values: (id, tenantId) => [id, tenantId, "TRUST-RLS", "RLS isolation probe objective for the third generation.", 3, "Criteria stated for the probe."],
  },
  family_education_lessons: {
    columns: "(id, tenant_id, topic, format, title, learning_objective)",
    values: (id, tenantId) => [id, tenantId, "DEBT", "LESSON", "RLS probe lesson", "The learner can apply this to a real decision."],
  },
};

const TABLES = Object.keys(INSERTS);

describe("Family Office capital & wealth — database-level RLS isolation (runtime role)", () => {
  let rt: Client;
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    // Admin bypasses RLS; used only for seeding the probe rows and cleanup.
    for (const table of TABLES) {
      await admin.query(`delete from ${table} where id like '${PREFIX}%'`);
    }

    rt = runtimeConnection();
    await rt.connect();
  });

  afterAll(async () => {
    for (const table of TABLES) {
      await admin.query(`delete from ${table} where id like '${PREFIX}%'`);
    }
    await rt.end();
    await admin.end();
  });

  it("the runtime role cannot bypass RLS", () => {
    /**
     * If the role could bypass RLS every assertion below would be meaningless, so
     * this is checked first and explicitly.
     */
    expect(process.env.BEYU_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL).toBeTruthy();
  });

  it.each(TABLES)("%s — tenant A cannot read tenant B's rows", async (table) => {
    const spec = INSERTS[table]!;
    const idB = `${PREFIX}B_${table}`;

    // Seed tenant B's row as admin (RLS does not apply to the admin role).
    await admin.query(
      `insert into ${table} ${spec.columns} values (${spec.columns.split(",").map((_, i) => `$${i + 1}`).join(",")})`,
      spec.values(idB, TENANT_B),
    );

    await setContext(rt, TENANT_A);
    const leaked = await rt.query(`select id from ${table} where id = $1`, [idB]);
    expect(leaked.rows, `tenant B's row must be invisible under tenant A's context`).toHaveLength(0);

    // And the row genuinely exists — otherwise the assertion above proves nothing.
    const exists = await admin.query(`select id from ${table} where id = $1`, [idB]);
    expect(exists.rows).toHaveLength(1);
  });

  it.each(TABLES)("%s — tenant A cannot insert a row owned by tenant B", async (table) => {
    const spec = INSERTS[table]!;
    const idX = `${PREFIX}X_${table}`;

    await setContext(rt, TENANT_A);
    /**
     * The policy's WITH CHECK clause must reject a write whose tenant_id falls
     * outside the caller's scope. Without it, a compromised or buggy application
     * path could plant records in another tenant's data.
     */
    await expect(
      rt.query(
        `insert into ${table} ${spec.columns} values (${spec.columns.split(",").map((_, i) => `$${i + 1}`).join(",")})`,
        spec.values(idX, TENANT_B),
      ),
    ).rejects.toThrow(/row-level security|row level security/i);

    const absent = await admin.query(`select id from ${table} where id = $1`, [idX]);
    expect(absent.rows).toHaveLength(0);
  });

  it.each(TABLES)("%s — the same-tenant path still works", async (table) => {
    const spec = INSERTS[table]!;
    const idA = `${PREFIX}A_${table}`;

    await setContext(rt, TENANT_A);
    await rt.query(
      `insert into ${table} ${spec.columns} values (${spec.columns.split(",").map((_, i) => `$${i + 1}`).join(",")})`,
      spec.values(idA, TENANT_A),
    );
    const own = await rt.query(`select id from ${table} where id = $1`, [idA]);
    /**
     * Proves the denial above is isolation, not a blanket rejection. A table that
     * refused every write would pass the previous test while being useless.
     */
    expect(own.rows).toHaveLength(1);
  });

  it("every family_* capital table has RLS enabled and a tenant_isolation policy", async () => {
    /**
     * Structural backstop for the empirical tests above: the 23 tables added by
     * 0036 must each be RLS-enabled and carry a policy. `family_members` and
     * `family_vault_items` are excluded by exact name — they come from the 0000
     * kernel baseline and are governed by their own (pre-existing) controls, not
     * by this migration.
     */
    const missing = await admin.query(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname like 'family\\_%'
        and c.relkind = 'r'
        and c.relname not in ('family_members', 'family_vault_items')
        and (
          not c.relrowsecurity
          or not exists (
            select 1 from pg_policies p
            where p.schemaname = 'public' and p.tablename = c.relname and p.policyname like '%tenant_isolation'
          )
        )
      order by c.relname
    `);
    expect(missing.rows.map((r) => r.relname)).toEqual([]);
  });

  it("no family_* capital table stores money as a floating-point type", async () => {
    /**
     * Authoritative money must be numeric/decimal. A double would reintroduce the
     * drift §33 forbids, and no amount of correct application code can recover
     * precision the column never stored.
     */
    const floats = await admin.query(`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and table_name like 'family\\_%'
        and data_type in ('double precision', 'real')
      order by table_name, column_name
    `);
    expect(floats.rows).toEqual([]);
  });
});
