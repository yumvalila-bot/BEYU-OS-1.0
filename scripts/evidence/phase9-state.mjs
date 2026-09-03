import { Client } from "pg";

const c = new Client({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres@127.0.0.1:5432/beyu_os",
});
await c.connect();
const one = async (sql) => (await c.query(sql)).rows[0];

const fingerprint = (
  await one(`
    select md5(string_agg(item, E'\\n' order by item)) as fingerprint
    from (
      select 'table:'||table_name as item from information_schema.tables where table_schema='public'
      union all
      select 'column:'||table_name||'.'||column_name||':'||data_type||':'||is_nullable
        from information_schema.columns where table_schema='public'
      union all
      select 'constraint:'||conname||':'||contype::text
        from pg_constraint c
        join pg_class t on t.oid=c.conrelid
        join pg_namespace n on n.oid=t.relnamespace
        where n.nspname='public'
      union all
      select 'index:'||indexname||':'||indexdef from pg_indexes where schemaname='public'

      union all
      select 'rls:'||c.relname||':'||c.relrowsecurity::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
          ) s
  `)
).fingerprint;

const state = {
  fingerprint,
  migrations: Number((await one(`select count(*)::int as n from beyu_migrations`)).n),
  tables: Number((await one(`select count(*)::int as n from information_schema.tables where table_schema='public'`)).n),
  triggers: Number((await one(`select count(*)::int as n from pg_trigger where not tgisinternal`)).n),
  disabled_triggers: Number((await one(`select count(*)::int as n from pg_trigger where not tgisinternal and tgenabled = 'D'`)).n),
  roles: Number((await one(`select count(*)::int as n from roles`)).n),
  permissions: Number((await one(`select count(*)::int as n from permissions`)).n),
  role_permissions: Number((await one(`select count(*)::int as n from role_permissions`)).n),
  tenants: Number((await one(`select count(*)::int as n from tenants`)).n),
  entities: Number((await one(`select count(*)::int as n from legal_entities`)).n),
  users: Number((await one(`select count(*)::int as n from users`)).n),
  articles: Number((await one(`select count(*)::int as n from constitution_articles`)).n),
  bodies: Number((await one(`select count(*)::int as n from governance_bodies`)).n),
  members: Number((await one(`select count(*)::int as n from governance_members`)).n),
  policies: Number((await one(`select count(*)::int as n from policies`)).n),
  policies_active: Number((await one(`select count(*)::int as n from policies where status='ACTIVE'`)).n),
  policies_no_prov: Number((await one(`select count(*)::int as n from policies where approved_by_resolution_id is null`)).n),
  resolutions: Number((await one(`select count(*)::int as n from resolutions`)).n),
  delegations: Number((await one(`select count(*)::int as n from delegations`)).n),
  approvals: Number((await one(`select count(*)::int as n from approvals`)).n),
  decisions: Number((await one(`select count(*)::int as n from governance_decision_registry`)).n),
  decisions_pending: Number((await one(`select count(*)::int as n from governance_decision_registry where status='PENDING'`)).n),
  capabilities: Number((await one(`select count(*)::int as n from governance_capability_registry`)).n),
  capabilities_locked: Number((await one(`select count(*)::int as n from governance_capability_registry where activation_status='LOCKED'`)).n),
  je: Number((await one(`select count(*)::int as n from journal_entries`)).n),
  jl: Number((await one(`select count(*)::int as n from journal_lines`)).n),
  la: Number((await one(`select count(*)::int as n from ledger_accounts`)).n),
  periods: Number((await one(`select count(*)::int as n from financial_periods`)).n),
  tp: Number((await one(`select count(*)::int as n from treasury_positions`)).n),
  tsum: (await one(`select coalesce(sum(base_currency_balance),0)::text as n from treasury_positions`)).n,
  cap: Number((await one(`select count(*)::int as n from capital_requests`)).n),
  funded: Number((await one(`select count(*)::int as n from capital_requests where status='FUNDED'`)).n),
  employees: Number((await one(`select count(*)::int as n from employees`)).n),
  audit: Number((await one(`select count(*)::int as n from audit_log`)).n),
  events: Number((await one(`select count(*)::int as n from enterprise_events`)).n),
  risks: Number((await one(`select count(*)::int as n from risks`)).n),
  obligations: Number((await one(`select count(*)::int as n from compliance_obligations`)).n),
};

console.log(JSON.stringify(state, null, 2));
await c.end();
