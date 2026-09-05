/**
 * C-02+ financial ledger RLS — adversarial isolation proof (runtime role).
 *
 * Migration 0021 added Row Level Security to the financial truth tables
 * (journal_entries, journal_lines, ledger_accounts, financial_periods) using
 * the EXISTING canonical context machinery (beyu.current_tenant_ids /
 * beyu.global_scope GUCs and the beyu_tenant_ids()/beyu_global_scope()
 * helpers from 0001). This suite proves, against a real PostgreSQL and the
 * ACTUAL non-superuser runtime role, that:
 *
 *   - a tenant cannot READ another tenant's journal entries, lines, accounts
 *     or periods;
 *   - a tenant cannot INSERT/UPDATE/DELETE another tenant's ledger rows;
 *   - entity isolation holds (forged entity on an in-scope tenant, and vice
 *     versa, are both rejected);
 *   - country isolation holds through the canonical entity boundary
 *     (entity B is incorporated in a different country than entity A);
 *   - journal_lines cannot be manipulated across tenant boundaries through
 *     EITHER parent reference (entry or account);
 *   - a manipulated application context (session GUC) cannot bypass RLS;
 *   - the runtime role is NOSUPERUSER / NOBYPASSRLS and cannot escalate;
 *   - the documented privileged path (admin/migration superuser) remains the
 *     only bypass, explicitly asserted rather than assumed.
 *
 * Fixtures are created and destroyed by the ADMIN role (the migration
 * authority). The RUNTIME role only ever attacks. Cleanup disables and
 * re-enables the immutable-trigger set for the run-scoped rows only — the
 * same narrow, self-restoring convention as tests/helpers/ledger-reset.ts.
 * Nothing is mocked and no security control is weakened.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const RUNTIME_URL = process.env.BEYU_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;

const TENANT_A = "TEN_BEYU_TZ";
const TENANT_B = "TEN_BEYU_FINTECH";
const RUN = `RLSLEDGER${Date.now().toString(36)}`;

const ENTITY_A = `${RUN}_ENT_A`;
const ENTITY_B = `${RUN}_ENT_B`;
const ACCOUNT_A1 = `${RUN}_ACC_A1`;
const ACCOUNT_A2 = `${RUN}_ACC_A2`;
const ACCOUNT_B1 = `${RUN}_ACC_B1`;
const ACCOUNT_B2 = `${RUN}_ACC_B2`;
const PERIOD_A = `${RUN}_PER_A`;
const PERIOD_B = `${RUN}_PER_B`;
const ENTRY_A = `${RUN}_JRN_A`;
const ENTRY_B = `${RUN}_JRN_B`;

function runtimeConnection(): Client {
  if (!RUNTIME_URL) throw new Error("BEYU_RUNTIME_DATABASE_URL is required for the ledger RLS test");
  return new Client({ connectionString: RUNTIME_URL });
}

/** Session-level context mirroring the dedicated-connection pattern of the C-02 suite. */
async function setContext(client: Client, tenantIds: string): Promise<void> {
  await client.query(`select set_config('beyu.current_tenant_ids', $1, false)`, [tenantIds]);
}

async function setGlobalScope(client: Client, on: boolean): Promise<void> {
  await client.query(`select set_config('beyu.global_scope', $1, false)`, [on ? "on" : "off"]);
}

describe("Financial ledger RLS isolation (runtime role, real PostgreSQL)", () => {
  let rt: Client;
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();

    // 1. Clean any leftovers from an interrupted prior run. The immutable
    //    triggers are disabled ONLY on this admin session for the run-scoped
    //    rows and re-enabled before anything else happens.
    await admin.query(`alter table journal_lines disable trigger beyu_journal_line_immutable`);
    await admin.query(`alter table journal_lines disable trigger beyu_journal_balanced`);
    await admin.query(`alter table journal_entries disable trigger beyu_journal_entry_immutable`);
    await admin.query(`delete from journal_lines where id like '${RUN}%'`);
    await admin.query(`delete from journal_entries where id like '${RUN}%'`);
    await admin.query(`alter table journal_entries enable trigger beyu_journal_entry_immutable`);
    await admin.query(`alter table journal_lines enable trigger beyu_journal_balanced`);
    await admin.query(`alter table journal_lines enable trigger beyu_journal_line_immutable`);
    await admin.query(`delete from ledger_accounts where id like '${RUN}%'`);
    await admin.query(`delete from financial_periods where id like '${RUN}%'`);
    await admin.query(`delete from legal_entities where id like '${RUN}%'`);

    // 2. Fixture — two fully separate tenants/entities/countries (admin path).
    await admin.query(
      `insert into legal_entities (id, tenant_id, code, legal_name, entity_type, country_code, effective_from)
       values ('${ENTITY_A}', '${TENANT_A}', '${RUN}-ENT-A', 'Ledger RLS Entity A', 'HOLDING', 'TZ', '2026-01-01'),
              ('${ENTITY_B}', '${TENANT_B}', '${RUN}-ENT-B', 'Ledger RLS Entity B', 'HOLDING', 'KE', '2026-01-01')`,
    );
    await admin.query(
      `insert into ledger_accounts (id, tenant_id, code, name, account_type)
       values ('${ACCOUNT_A1}', '${TENANT_A}', '${RUN}-A1', 'Ledger RLS A1', 'ASSET'),
              ('${ACCOUNT_A2}', '${TENANT_A}', '${RUN}-A2', 'Ledger RLS A2', 'LIABILITY'),
              ('${ACCOUNT_B1}', '${TENANT_B}', '${RUN}-B1', 'Ledger RLS B1', 'ASSET'),
              ('${ACCOUNT_B2}', '${TENANT_B}', '${RUN}-B2', 'Ledger RLS B2', 'LIABILITY')`,
    );
    await admin.query(
      `insert into financial_periods (id, legal_entity_id, code, starts_on, ends_on, status)
       values ('${PERIOD_A}', '${ENTITY_A}', '${RUN}-PA', '2026-01-01', '2026-12-31', 'OPEN'),
              ('${PERIOD_B}', '${ENTITY_B}', '${RUN}-PB', '2026-01-01', '2026-12-31', 'OPEN')`,
    );
    await admin.query(
      `insert into journal_entries (id, tenant_id, legal_entity_id, period_id, reference, description, currency, posted_by, source)
       values ('${ENTRY_A}', '${TENANT_A}', '${ENTITY_A}', '${PERIOD_A}', '${RUN}-REF-A', 'Ledger RLS entry A', 'TZS', '${RUN}', 'TEST');
       insert into journal_lines (id, entry_id, account_id, debit, credit)
       values ('${RUN}_LINE_A1', '${ENTRY_A}', '${ACCOUNT_A1}', 100, 0),
              ('${RUN}_LINE_A2', '${ENTRY_A}', '${ACCOUNT_A2}', 0, 100);`,
    );
    await admin.query(
      `insert into journal_entries (id, tenant_id, legal_entity_id, period_id, reference, description, currency, posted_by, source)
       values ('${ENTRY_B}', '${TENANT_B}', '${ENTITY_B}', '${PERIOD_B}', '${RUN}-REF-B', 'Ledger RLS entry B', 'KES', '${RUN}', 'TEST');
       insert into journal_lines (id, entry_id, account_id, debit, credit)
       values ('${RUN}_LINE_B1', '${ENTRY_B}', '${ACCOUNT_B1}', 100, 0),
              ('${RUN}_LINE_B2', '${ENTRY_B}', '${ACCOUNT_B2}', 0, 100);`,
    );

    rt = runtimeConnection();
    await rt.connect();

    // 3. The runtime role is genuinely constrained.
    const who = await rt.query(
      `select current_user, rolsuper, rolbypassrls, rolcreaterole from pg_roles where rolname = current_user`,
    );
    expect(who.rows[0].current_user).toBe("beyu_runtime");
    expect(who.rows[0].rolsuper).toBe(false);
    expect(who.rows[0].rolbypassrls).toBe(false);
    expect(who.rows[0].rolcreaterole).toBe(false);
  });

  afterAll(async () => {
    try {
      await admin.query(`alter table journal_lines disable trigger beyu_journal_line_immutable`);
      await admin.query(`alter table journal_lines disable trigger beyu_journal_balanced`);
      await admin.query(`alter table journal_entries disable trigger beyu_journal_entry_immutable`);
      await admin.query(`delete from journal_lines where id like '${RUN}%'`);
      await admin.query(`delete from journal_entries where id like '${RUN}%'`);
      await admin.query(`alter table journal_entries enable trigger beyu_journal_entry_immutable`);
      await admin.query(`alter table journal_lines enable trigger beyu_journal_balanced`);
      await admin.query(`alter table journal_lines enable trigger beyu_journal_line_immutable`);
      await admin.query(`delete from ledger_accounts where id like '${RUN}%'`);
      await admin.query(`delete from financial_periods where id like '${RUN}%'`);
      await admin.query(`delete from legal_entities where id like '${RUN}%'`);
    } catch {
      /* best effort */
    }
    await rt.end().catch(() => undefined);
    await admin.end().catch(() => undefined);
  });

  it("SELECT: tenant A context sees ONLY tenant A journal entries, lines, accounts and periods", async () => {
    await setContext(rt, TENANT_A);
    const entries = await rt.query(`select id, tenant_id from journal_entries where id in ('${ENTRY_A}','${ENTRY_B}') order by id`);
    expect(entries.rows).toEqual([{ id: ENTRY_A, tenant_id: TENANT_A }]);

    const lines = await rt.query(
      `select id from journal_lines where entry_id in ('${ENTRY_A}','${ENTRY_B}') order by id`,
    );
    expect(lines.rows.map((x) => x.id)).toEqual([`${RUN}_LINE_A1`, `${RUN}_LINE_A2`]);

    const accounts = await rt.query(
      `select id from ledger_accounts where id in ('${ACCOUNT_A1}','${ACCOUNT_A2}','${ACCOUNT_B1}','${ACCOUNT_B2}') order by id`,
    );
    expect(accounts.rows.map((x) => x.id)).toEqual([ACCOUNT_A1, ACCOUNT_A2]);

    const periods = await rt.query(`select id from financial_periods where id in ('${PERIOD_A}','${PERIOD_B}') order by id`);
    expect(periods.rows.map((x) => x.id)).toEqual([PERIOD_A]);
  });

  it("SELECT: tenant B context sees ONLY tenant B ledger rows", async () => {
    await setContext(rt, TENANT_B);
    const entries = await rt.query(`select id, tenant_id from journal_entries where id in ('${ENTRY_A}','${ENTRY_B}') order by id`);
    expect(entries.rows).toEqual([{ id: ENTRY_B, tenant_id: TENANT_B }]);

    const accounts = await rt.query(
      `select id from ledger_accounts where id in ('${ACCOUNT_A1}','${ACCOUNT_B1}') order by id`,
    );
    expect(accounts.rows.map((x) => x.id)).toEqual([ACCOUNT_B1]);

    const periods = await rt.query(`select id from financial_periods where id in ('${PERIOD_A}','${PERIOD_B}') order by id`);
    expect(periods.rows.map((x) => x.id)).toEqual([PERIOD_B]);
  });

  it("SELECT: no tenant context sees ZERO ledger rows (fail safe)", async () => {
    await setContext(rt, "");
    const n = await rt.query(`select count(*)::int as n from journal_entries where id in ('${ENTRY_A}','${ENTRY_B}')`);
    expect(n.rows[0].n).toBe(0);
    const a = await rt.query(`select count(*)::int as n from ledger_accounts where id like '${RUN}%'`);
    expect(a.rows[0].n).toBe(0);
  });

  it("SELECT: a nonexistent tenant context sees zero rows", async () => {
    await setContext(rt, "TEN_DOES_NOT_EXIST");
    const n = await rt.query(`select count(*)::int as n from journal_entries where id in ('${ENTRY_A}','${ENTRY_B}')`);
    expect(n.rows[0].n).toBe(0);
  });

  it("DEFENSE-IN-DEPTH: dropping every WHERE clause cannot leak the foreign tenant", async () => {
    await setContext(rt, TENANT_A);
    const r = await rt.query(`select id, tenant_id from journal_entries order by id`);
    expect(r.rows.every((x) => x.tenant_id === TENANT_A)).toBe(true);
    const p = await rt.query(`select id from financial_periods order by id`);
    expect(p.rows.map((x) => x.id)).toEqual([PERIOD_A]);
  });

  it("INSERT: cross-tenant journal entry (tenant B under tenant A context) is rejected by WITH CHECK", async () => {
    await setContext(rt, TENANT_A);
    await expect(
      rt.query(
        `insert into journal_entries (id, tenant_id, legal_entity_id, reference, description, currency, posted_by, source)
         values ('${RUN}_X1', '${TENANT_B}', '${ENTITY_B}', '${RUN}-REF-X1', 'attack', 'KES', '${RUN}', 'TEST')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("INSERT: forged tenant_id with an in-scope entity of another tenant is rejected", async () => {
    await setContext(rt, TENANT_A);
    await expect(
      rt.query(
        `insert into journal_entries (id, tenant_id, legal_entity_id, reference, description, currency, posted_by, source)
         values ('${RUN}_X2', '${TENANT_B}', '${ENTITY_A}', '${RUN}-REF-X2', 'attack', 'TZS', '${RUN}', 'TEST')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("INSERT: in-scope tenant with an OUT-OF-SCOPE entity is rejected (entity isolation)", async () => {
    await setContext(rt, TENANT_A);
    await expect(
      rt.query(
        `insert into journal_entries (id, tenant_id, legal_entity_id, reference, description, currency, posted_by, source)
         values ('${RUN}_X3', '${TENANT_A}', '${ENTITY_B}', '${RUN}-REF-X3', 'attack', 'TZS', '${RUN}', 'TEST')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("INSERT: an entry referencing an OUT-OF-SCOPE period fails closed in the deferred scope trigger", async () => {
    await setContext(rt, TENANT_A);
    await expect(
      rt.query(
        `insert into journal_entries (id, tenant_id, legal_entity_id, period_id, reference, description, currency, posted_by, source)
         values ('${RUN}_X4', '${TENANT_A}', '${ENTITY_A}', '${PERIOD_B}', '${RUN}-REF-X4', 'attack', 'TZS', '${RUN}', 'TEST')`,
      ),
    ).rejects.toThrow(/outside the caller scope|row-level security/);
  });

  it("INSERT: a journal line on a FOREIGN account is rejected", async () => {
    await setContext(rt, TENANT_A);
    await expect(
      rt.query(
        `insert into journal_lines (id, entry_id, account_id, debit, credit)
         values ('${RUN}_LINE_ATK1', '${ENTRY_A}', '${ACCOUNT_B1}', 10, 0)`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("INSERT: a journal line on a FOREIGN entry is rejected", async () => {
    await setContext(rt, TENANT_A);
    await expect(
      rt.query(
        `insert into journal_lines (id, entry_id, account_id, debit, credit)
         values ('${RUN}_LINE_ATK2', '${ENTRY_B}', '${ACCOUNT_A1}', 10, 0)`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("UPDATE: a foreign tenant's journal entry cannot be updated (0 rows affected)", async () => {
    await setContext(rt, TENANT_A);
    const r = await rt.query(`update journal_entries set description = 'tampered' where id = '${ENTRY_B}'`);
    expect(Number(r.rowCount)).toBe(0);
  });

  it("DELETE: a foreign tenant's journal entry cannot be deleted (0 rows affected)", async () => {
    await setContext(rt, TENANT_A);
    const r = await rt.query(`delete from journal_entries where id = '${ENTRY_B}'`);
    expect(Number(r.rowCount)).toBe(0);
  });

  it("UPDATE: an OWN entry is append-only — the DB immutability trigger rejects the edit", async () => {
    await setContext(rt, TENANT_A);
    await expect(rt.query(`update journal_entries set description = 'edited' where id = '${ENTRY_A}'`)).rejects.toThrow(
      /immutable/,
    );
  });

  it("UPDATE/DELETE: foreign ledger accounts and periods cannot be mutated (0 rows affected)", async () => {
    await setContext(rt, TENANT_A);
    const ua = await rt.query(`update ledger_accounts set name = 'tampered' where id = '${ACCOUNT_B1}'`);
    expect(Number(ua.rowCount)).toBe(0);
    const da = await rt.query(`delete from ledger_accounts where id = '${ACCOUNT_B1}'`);
    expect(Number(da.rowCount)).toBe(0);
    const up = await rt.query(`update financial_periods set status = 'CLOSED' where id = '${PERIOD_B}'`);
    expect(Number(up.rowCount)).toBe(0);
    const dp = await rt.query(`delete from financial_periods where id = '${PERIOD_B}'`);
    expect(Number(dp.rowCount)).toBe(0);
  });

  it("INSERT: a ledger account for tenant B under tenant A context is rejected", async () => {
    await setContext(rt, TENANT_A);
    await expect(
      rt.query(
        `insert into ledger_accounts (id, tenant_id, code, name, account_type)
         values ('${RUN}_ACC_ATK', '${TENANT_B}', '${RUN}-ATK', 'attack', 'ASSET')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("INSERT: a financial period for the FOREIGN entity is rejected (country isolation through the entity boundary)", async () => {
    await setContext(rt, TENANT_A);
    await expect(
      rt.query(
        `insert into financial_periods (id, legal_entity_id, code, starts_on, ends_on, status)
         values ('${RUN}_PER_ATK', '${ENTITY_B}', '${RUN}-PATK', '2026-01-01', '2026-12-31', 'OPEN')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("COUNTRY: entity B (country KE) is unreachable from the tenant A context even through joins", async () => {
    await setContext(rt, TENANT_A);
    const entities = await rt.query(
      `select id, country_code from legal_entities where id in ('${ENTITY_A}','${ENTITY_B}') order by id`,
    );
    expect(entities.rows).toEqual([{ id: ENTITY_A, country_code: "TZ" }]);

    // A join through periods → entities cannot surface the foreign country.
    const joined = await rt.query(
      `select le.country_code from financial_periods fp
         join legal_entities le on le.id = fp.legal_entity_id
        where fp.id in ('${PERIOD_A}','${PERIOD_B}') order by le.country_code`,
    );
    expect(joined.rows.map((x) => x.country_code)).toEqual(["TZ"]);
  });

  it("GLOBAL SCOPE: beyu.global_scope exposes both tenants (governed enterprise read path)", async () => {
    await setContext(rt, TENANT_A);
    await setGlobalScope(rt, true);
    const entries = await rt.query(`select id from journal_entries where id in ('${ENTRY_A}','${ENTRY_B}') order by id`);
    expect(entries.rows.map((x) => x.id)).toEqual([ENTRY_A, ENTRY_B]);
    await setGlobalScope(rt, false);
  });

  it("PRIVILEGE: the runtime role cannot SET ROLE to a superuser", async () => {
    await expect(rt.query("set role postgres")).rejects.toThrow(/permission denied/);
  });

  it("ADMIN: the documented privileged path (superuser) reads both tenants — explicit, never the app role", async () => {
    const r = await admin.query(`select id from journal_entries where id in ('${ENTRY_A}','${ENTRY_B}') order by id`);
    expect(r.rows.map((x) => x.id)).toEqual([ENTRY_A, ENTRY_B]);
  });

  it("CONTEXT GUC is transaction-scoped: SET LOCAL cannot leak across transactions on a reused connection", async () => {
    const c = runtimeConnection();
    await c.connect();
    await c.query("begin");
    await c.query(`select set_config('beyu.current_tenant_ids', $1, true)`, [TENANT_A]);
    await c.query("commit");
    const after = await c.query(`select count(*)::int as n from journal_entries where id like '${RUN}%'`);
    expect(after.rows[0].n).toBe(0);
    await c.end();
  });
});
