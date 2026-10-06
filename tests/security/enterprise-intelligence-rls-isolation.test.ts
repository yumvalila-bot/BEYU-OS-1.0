/**
 * BEYU OS — Enterprise Intelligence Expansion (migration 0074): database-level RLS.
 *
 * URL is not authentication and a client-side check is not a security boundary. These tests therefore
 * connect as the ACTUAL runtime role (`beyu_runtime`, NOSUPERUSER NOBYPASSRLS) and ask the DATABASE,
 * with the tenant GUC pinned to tenant A, whether it will return tenant B's rows.
 *
 * They also prove the two constraints the migration is built around:
 *
 *   1. every new table is tenant-isolated by a policy — no new table is a hole in the perimeter;
 *   2. the markup/margin relationship is enforced by the DATABASE, so a mislabelled rate cannot be
 *      stored even by a caller that bypasses the engine entirely.
 *
 * A superuser connection is used ONLY to arrange fixtures and to clean them up; every assertion about
 * isolation is made on the runtime role.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const RUNTIME_URL = process.env.BEYU_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;

const TENANT_A = "TEN_BEYU_GROUP";
const TENANT_B = "TEN_BEYU_HEALTH";
const RUN = `EI${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

let admin: Client;
let runtime: Client;
let userId: string;
let legalEntityId: string;
let employeeId: string;

type Probe = { table: string; insert: (id: string, tenantId: string) => { sql: string; params: unknown[] } };

const probes: Probe[] = [
  {
    table: "private_funds",
    insert: (id, tenantId) => ({
      sql: `insert into private_funds (id, tenant_id, code, name, strategy, vintage_year, currency, created_by)
            values ($1,$2,$3,$4,'BUYOUT',2026,'USD',$5)`,
      params: [id, tenantId, `${RUN}_${id}`, `RLS probe ${id}`, userId],
    }),
  },
  {
    table: "price_lists",
    insert: (id, tenantId) => ({
      sql: `insert into price_lists (id, tenant_id, code, name, channel, currency, effective_from, created_by)
            values ($1,$2,$3,$4,'RETAIL','USD','2026-01-01',$5)`,
      params: [id, tenantId, `${RUN}_${id}`, `RLS probe ${id}`, userId],
    }),
  },
  {
    table: "price_list_items",
    insert: (id, tenantId) => ({
      // 100 cost / 125 price = 2500 bps markup, 2000 bps margin — the correct pair, enforced by CHECK.
      sql: `insert into price_list_items
              (id, tenant_id, price_list_id, subject_type, subject_id, unit_of_measure, currency,
               cost_minor, price_minor, markup_bps, margin_bps, pricing_basis, effective_from)
            values ($1,$2,$3,'PRODUCT',$4,'UNIT','USD',100,125,2500,2000,'COST_PLUS_MARKUP','2026-01-01')`,
      params: [id, tenantId, `${RUN}_price_lists_${tenantId}`, `${RUN}_SKU`],
    }),
  },
  {
    table: "financial_metric_observations",
    insert: (id, tenantId) => ({
      sql: `insert into financial_metric_observations
              (id, tenant_id, metric_code, subject_type, subject_id, value, data_state, method,
               calculation_version, source, recorded_by)
            values ($1,$2,'FIN.MARKET.MARKET_CAP','SECURITY',$3,5000000000,'CALCULATED','Share price x shares outstanding','finance-intelligence-1.0.0','test fixture',$4)`,
      params: [id, tenantId, `${RUN}_SEC`, userId],
    }),
  },
  {
    table: "valuation_models",
    insert: (id, tenantId) => ({
      sql: `insert into valuation_models (id, tenant_id, subject_type, subject_id, name, method, currency, created_by)
            values ($1,$2,'COMPANY',$3,$4,'DCF','USD',$5)`,
      params: [id, tenantId, `${RUN}_SUBJ`, `RLS probe ${id}`, userId],
    }),
  },
  {
    table: "lbo_models",
    insert: (id, tenantId) => ({
      sql: `insert into lbo_models
              (id, tenant_id, assumption_set_id, name, currency, purchase_price_minor, entry_multiple_scaled,
               entry_ebitda_minor, sponsor_equity_minor, exit_method, exit_multiple_scaled, holding_period_years,
               operating_assumptions, created_by)
            values ($1,$2,$3,$4,'USD',500000000,5000000,100000000,200000000,'MULTIPLE',5000000,5,'{}'::jsonb,$5)`,
      params: [id, tenantId, lboAssumptionSetId(tenantId), `RLS probe ${id}`, userId],
    }),
  },
  {
    table: "compensation_entitlements",
    insert: (id, tenantId) => ({
      sql: `insert into compensation_entitlements
              (id, tenant_id, legal_entity_id, employee_id, kind, currency, amount_minor, financial_treatment,
               eligibility, reason, policy_ref, effective_date, raised_by)
            values ($1,$2,$3,$4,'PERFORMANCE_BONUS','USD',250000,'PAYROLL','12 months service','FY2025 award','POL_RLS','2026-01-31',$5)`,
      params: [id, tenantId, legalEntityId, employeeId, userId],
    }),
  },
];

const assumptionSetIdFor: Record<string, string> = {};
function lboAssumptionSetId(tenantId: string): string {
  return assumptionSetIdFor[tenantId];
}

describe("migration 0074 — runtime-role RLS isolation", () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: ADMIN_URL });
    runtime = new Client({ connectionString: RUNTIME_URL });
    await admin.connect();
    await runtime.connect();

    const user = await admin.query<{ id: string }>("select id from users limit 1");
    const entity = await admin.query<{ id: string }>("select id from legal_entities where tenant_id = $1 limit 1", [TENANT_A]);
    const employee = await admin.query<{ id: string }>("select id from employees limit 1");
    if (user.rowCount === 0 || entity.rowCount === 0 || employee.rowCount === 0) {
      throw new Error("RLS probe fixtures require a seeded user, legal entity and employee");
    }
    userId = user.rows[0].id;
    legalEntityId = entity.rows[0].id;
    employeeId = employee.rows[0].id;

    // One valuation model + assumption set per tenant so lbo_models can satisfy its FK.
    for (const tenantId of [TENANT_A, TENANT_B]) {
      const modelId = `${RUN}_VM_${tenantId}`;
      await admin.query(
        `insert into valuation_models (id, tenant_id, subject_type, subject_id, name, method, currency, created_by)
         values ($1,$2,'DEAL',$3,'LBO assumption host','EBITDA_MULTIPLES','USD',$4)`,
        [modelId, tenantId, `${RUN}_DEAL`, userId],
      );
      const setId = `${RUN}_AS_${tenantId}`;
      await admin.query(
        `insert into valuation_assumption_sets (id, tenant_id, model_id, version, scenario_kind, fingerprint, assumptions, authored_by)
         values ($1,$2,$3,1,'BASE','vf1_rlsprobe','[]'::jsonb,$4)`,
        [setId, tenantId, modelId, userId],
      );
      assumptionSetIdFor[tenantId] = setId;
    }

    for (const probe of probes) {
      for (const tenantId of [TENANT_A, TENANT_B]) {
        const statement = probe.insert(`${RUN}_${probe.table}_${tenantId}`, tenantId);
        await admin.query(statement.sql, statement.params);
      }
    }
  }, 60_000);

  afterAll(async () => {
    if (admin) {
      await admin.query(`delete from price_list_items where id like $1`, [`${RUN}%`]).catch(() => undefined);
      for (const table of [
        "financial_metric_observations",
        "compensation_entitlements",
        "lbo_models",
        "valuation_assumption_sets",
        "valuation_models",
        "private_funds",
        "price_lists",
      ]) {
        await admin.query(`delete from ${table} where id like $1`, [`${RUN}%`]).catch(() => undefined);
      }
      await admin.end().catch(() => undefined);
    }
    await runtime?.end().catch(() => undefined);
  }, 60_000);

  async function setTenant(tenantId: string): Promise<void> {
    await runtime.query("select set_config('beyu.current_tenant_ids', $1, false)", [tenantId]);
  }

  it.each(probes)("$table: tenant B's row is invisible to tenant A at the database layer", async (probe) => {
    await setTenant(TENANT_A);

    const leaked = await runtime.query<{ n: number }>(`select count(*)::int n from ${probe.table} where tenant_id = $1`, [TENANT_B]);
    expect(leaked.rows[0].n).toBe(0);

    // Even with NO predicate at all, the table returns only the pinned tenant's rows.
    const unscoped = await runtime.query<{ n: number }>(`select count(*)::int n from ${probe.table}`);
    const pinned = await runtime.query<{ n: number }>(`select count(*)::int n from ${probe.table} where tenant_id = $1`, [TENANT_A]);
    expect(unscoped.rows[0].n).toBe(pinned.rows[0].n);
    expect(pinned.rows[0].n).toBeGreaterThan(0);
  });

  it("refuses a write into another tenant through the WITH CHECK clause", async () => {
    await setTenant(TENANT_A);
    await expect(
      runtime.query(
        `insert into private_funds (id, tenant_id, code, name, strategy, vintage_year, currency, created_by)
         values ($1,$2,$3,'cross-tenant write attempt','BUYOUT',2026,'USD',$4)`,
        [`${RUN}_CROSS`, TENANT_B, `${RUN}_CROSS`, userId],
      ),
    ).rejects.toThrow(/row-level security|policy/i);
  });

  it("enforces the markup/margin relationship in the database, not only in the engine", async () => {
    // 100 cost / 125 price: margin is 2000 bps. Asserting 2500 must be refused by the CHECK constraint.
    await expect(
      admin.query(
        `insert into price_list_items
           (id, tenant_id, price_list_id, subject_type, subject_id, unit_of_measure, currency,
            cost_minor, price_minor, markup_bps, margin_bps, pricing_basis, effective_from)
         values ($1,$2,$3,'PRODUCT',$4,'UNIT','USD',100,125,2500,2500,'COST_PLUS_MARKUP','2026-02-01')`,
        [`${RUN}_BAD_MARGIN`, TENANT_A, `${RUN}_price_lists_${TENANT_A}`, `${RUN}_BAD_SKU`],
      ),
    ).rejects.toThrow(/price_list_items_margin_check|check constraint/i);
  });

  it("allows an undefined markup on a zero-cost line, storing NULL rather than zero", async () => {
    const id = `${RUN}_ZEROCOST`;
    const inserted = await admin.query<{ markup_bps: number | null; margin_bps: number | null }>(
      `insert into price_list_items
         (id, tenant_id, price_list_id, subject_type, subject_id, unit_of_measure, currency,
          cost_minor, price_minor, markup_bps, margin_bps, pricing_basis, effective_from)
       values ($1,$2,$3,'PRODUCT',$4,'UNIT','USD',0,125,NULL,10000,'COST_PLUS_MARKUP','2026-02-01')
       returning markup_bps, margin_bps`,
      [id, TENANT_A, `${RUN}_price_lists_${TENANT_A}`, `${RUN}_ZERO_SKU`],
    );
    expect(inserted.rows[0].markup_bps).toBeNull();
    expect(Number(inserted.rows[0].margin_bps)).toBe(10000);
  });
});
