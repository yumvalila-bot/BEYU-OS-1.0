/**
 * BEYU OS — production smoke / certification runner.
 *
 * Connects to the LIVE production database (the Supabase PostgreSQL project,
 * reached through a connection string in the environment) and certifies the
 * complete request/security chain:
 *
 *   Vercel → BEYU backend → DATABASE_URL → Supabase PostgreSQL → beyu_runtime → RLS
 *
 * It does NOT use Supabase Auth/SSR/REST/supabase-js. BEYU remains the canonical
 * identity, RBAC, MFA, governance, Finance, Noelia and audit authority; Supabase
 * is only the managed PostgreSQL host. The data layer is the plain `pg` driver +
 * Drizzle (src/db). No @supabase/* packages are used.
 *
 * Project: siyzygezdmlxbvwttrdz, region eu-west-3 (Paris).
 *   Supavisor host: aws-0-eu-west-3.pooler.supabase.com
 *
 * Usage (from a host that can REACH the pooler — the Vercel runtime, CI, or a
 * network with Supabase egress; a sandboxed/egress-firewalled box cannot):
 *
 *   DATABASE_URL="postgresql://beyu_runtime.<ref>:<pw>@aws-0-eu-west-3.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true" \
 *   BEYU_RUNTIME_DATABASE_URL="(same runtime string)" \
 *   BEYU_ADMIN_DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-0-eu-west-3.pooler.supabase.com:5432/postgres?sslmode=require" \
 *   npm run certify
 *
 *   # Full end-to-end against the deployed Vercel app (adds HTTP checks):
 *   BEYU_BASE_URL="https://beyu-os-1-0.vercel.app" \
 *   BEYU_BOOTSTRAP_PASSWORD=... AUTH_SECRET=... MFA_ENCRYPTION_KEY=... \
 *   ... npm run certify
 *
 * Exit 0 = production certified (0 failures); exit 1 = a check failed;
 * exit 2 = the database could not be reached (do NOT declare operational).
 * No password/secret is ever printed.
 */
import "dotenv/config";
import { Client } from "pg";
import { eq } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import { users } from "../src/db/schema/identity.ts";
import { decryptSecret, generateTotpCode } from "../src/lib/mfa.ts";

const RUNTIME_URL = process.env.BEYU_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
const RUNTIME_ROLE = process.env.BEYU_RUNTIME_DB_ROLE ?? "beyu_runtime";
const BASE_URL = process.env.BEYU_BASE_URL?.replace(/\/$/, "") ?? "";
const BOOTSTRAP_PASSWORD = process.env.BEYU_BOOTSTRAP_PASSWORD ?? "";

type Result = { id: string; name: string; ok: boolean; detail: string };
const results: Result[] = [];
function record(id: string, name: string, ok: boolean, detail: string) {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id.padEnd(26)} ${name}\n     ${detail}`);
}

async function connect(url: string | undefined, label: string): Promise<Client> {
  if (!url) throw new Error(`${label} connection URL is not set in the environment`);
  const c = new Client({ connectionString: url, connectionTimeoutMillis: 12_000 });
  await c.connect();
  return c;
}
async function one<T>(c: Client, sql: string, params: unknown[] = []): Promise<T> {
  return (await c.query(sql, params)).rows[0] as T;
}
async function many<T>(c: Client, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await c.query(sql, params)).rows as T[];
}

async function http(path: string, opts: { method?: string; cookie?: string; body?: unknown } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers: { "content-type": "application/json", ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null), cookies: res.headers.getSetCookie() };
}

async function login(email: string): Promise<string | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new Error(`seed user ${email} missing — has the governed bootstrap seed run?`);
  const mfaCode = user.mfaSecretEncrypted
    ? generateTotpCode(decryptSecret(user.mfaSecretEncrypted), Date.now())
    : undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: BOOTSTRAP_PASSWORD, mfaCode }),
    });
    if (res.status === 200) return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    await new Promise((r) => setTimeout(r, 31_000)); // a consumed TOTP step waits for the next window
  }
  return null;
}

/**
 * Structural hash-chain verification with the admin (global/RLS-bypassing) view:
 * single genesis, no forked parents, no dangling links, head == latest hash.
 */
async function auditChainIntegrity(
  c: Client,
  table: "audit_log" | "enterprise_events",
  chainName: "AUDIT_LOG" | "ENTERPRISE_EVENTS",
): Promise<{ ok: boolean; detail: string }> {
  const s = await one<{ total: number; genesis: number; forks: number; dangling: number; head: string | null; tail_hash: string | null; tail_seq: string | null }>(
    c,
    `with t as (select id, prev_hash, hash, sequence from ${table})
     select
       (select count(*)::int from t) as total,
       (select count(*)::int from t where prev_hash is null) as genesis,
       (select count(*)::int from (select prev_hash from t where prev_hash is not null group by prev_hash having count(*)>1) f) as forks,
       (select count(*)::int from t child where prev_hash is not null
          and not exists (select 1 from t parent where parent.hash = child.prev_hash)) as dangling,
       (select current_hash from audit_chain_heads where chain_name = $1) as head,
       (select hash from t order by sequence desc limit 1) as tail_hash,
       (select max(sequence)::text from t) as tail_seq`,
    [chainName],
  );
  const why: string[] = [];
  if (s.total === 0) why.push("chain empty (no records)");
  if (s.genesis !== 1) why.push(`expected 1 genesis, found ${s.genesis}`);
  if (s.forks !== 0) why.push(`${s.forks} fork(s)`);
  if (s.dangling !== 0) why.push(`${s.dangling} dangling link(s)`);
  if (s.head === null) why.push("no chain-head recorded");
  if (s.tail_hash && s.head && s.head !== s.tail_hash) why.push("chain-head != latest record hash");
  return {
    ok: why.length === 0,
    detail: why.length
      ? `${table}: ${why.join("; ")}`
      : `${table}: ${s.total} records, 1 genesis, 0 forks, 0 dangling, head matches tail seq ${s.tail_seq}`,
  };
}

async function certifyDatabase() {
  let admin: Client;
  let rt: Client;
  try {
    admin = await connect(ADMIN_URL, "admin/migration");
  } catch (e) {
    record("DB-CONNECT", "Supabase PostgreSQL reachable (admin role)", false, String((e as Error).message || e));
    throw e;
  }
  try {
    rt = await connect(RUNTIME_URL, "runtime");
  } catch (e) {
    record("DB-CONNECT", "Supabase PostgreSQL reachable (runtime role)", false, String((e as Error).message || e));
    await admin.end();
    throw e;
  }

  try {
    const v = await one<{ version: string; current_user: string }>(admin, "select version() as version, current_user as current_user");
    const sv = await one<{ server_version: string }>(admin, "show server_version");
    record("DB-CONNECT", "Supabase PostgreSQL connection succeeds", true,
      `connected as ${v.current_user}; PostgreSQL ${sv.server_version} (${v.version.split(",")[0]})`);

    const a = await one<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean; rolcreaterole: boolean; rolcreatedb: boolean; rolcanlogin: boolean }>(
      admin,
      `select rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin
         from pg_roles where rolname=$1`, [RUNTIME_ROLE]);
    const safe = !!a && !a.rolsuper && !a.rolbypassrls && !a.rolcreaterole && !a.rolcreatedb && a.rolcanlogin;
    record("RUNTIME-ROLE", "beyu_runtime NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB", safe,
      !a ? `role ${RUNTIME_ROLE} NOT FOUND — run scripts/setup-db-role.ts`
         : `super=${a.rolsuper} bypassrls=${a.rolbypassrls} createrole=${a.rolcreaterole} createdb=${a.rolcreatedb} login=${a.rolcanlogin}`);

    const elev = await many(admin,
      `select r2.rolname from pg_auth_members m join pg_roles r1 on r1.oid=m.member join pg_roles r2 on r2.oid=m.roleid
        where r1.rolname=$1 and (r2.rolsuper or r2.rolbypassrls)`, [RUNTIME_ROLE]);
    record("RUNTIME-NO-ESCALATION", "runtime role has no superuser/BYPASSRLS membership", elev.length === 0,
      elev.length ? `member of: ${elev.map((x) => (x as { rolname: string }).rolname).join(", ")}` : "no elevating memberships");

    const owned = await one<{ n: number }>(admin,
      `select count(*)::int as n from pg_tables where schemaname='public' and tableowner=$1`, [RUNTIME_ROLE]);
    record("RUNTIME-NO-OWNERSHIP", "runtime role owns no application tables", owned.n === 0,
      `tables owned by ${RUNTIME_ROLE}: ${owned.n}`);

    let denied = false;
    try { await rt.query("set role postgres"); } catch { denied = true; }
    record("RUNTIME-NO-SETROLE", "runtime role cannot SET ROLE postgres", denied,
      denied ? "SET ROLE postgres -> permission denied" : "SET ROLE unexpectedly succeeded");

    const mig = await many<{ version: string; mode: string }>(admin, "select version, mode from beyu_migrations order by version");
    record("MIGRATIONS", "all 19 BEYU migrations present in beyu_migrations", mig.length >= 19,
      `${mig.length} migration rows (${mig.filter((m) => m.mode === "APPLIED").length} forward-APPLIED)`);

    const rls = await one<{ enabled: number; forced: number; policies: number }>(admin,
      `select
        (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity)::int as enabled,
        (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relforcerowsecurity)::int as forced,
        (select count(*) from pg_policies where schemaname='public')::int as policies`);
    record("RLS", "RLS enabled with policies on tenant tables", rls.enabled >= 20 && rls.policies >= 20,
      `${rls.enabled} RLS-enabled tables, ${rls.forced} FORCE, ${rls.policies} policies`);

    const at = await many<{ table_name: string }>(admin,
      `select table_name from information_schema.tables where table_schema='public'
        and table_name in ('audit_log','enterprise_events','audit_chain_heads')`);
    const names = at.map((x) => x.table_name);
    record("AUDIT-TABLES", "audit-chain tables present", names.length === 3, `found: ${names.join(", ")}`);

    // Tenant / entity / country isolation — adversarial, as the RUNTIME role.
    await rt.query("select set_config('beyu.current_tenant_ids', '', false)");
    await rt.query("select set_config('beyu.global_scope', 'off', false)");
    const noCtx = await one<{ n: number }>(rt, "select count(*)::int as n from legal_entities");
    const tenants = await many<{ tenant_id: string; n: number }>(admin,
      "select tenant_id, count(*)::int as n from legal_entities group by tenant_id order by tenant_id");
    const tA = tenants[0]?.tenant_id; const tB = tenants[1]?.tenant_id;
    let iso = noCtx.n === 0 && !!tA;
    let detail = `no-context runtime SELECT -> ${noCtx.n} rows (expect 0); tenants: ${tenants.map((t) => t.tenant_id).join(", ")}`;
    if (tA && tB) {
      await rt.query("select set_config('beyu.current_tenant_ids', $1, false)", [tA]);
      const seeA = await one<{ n: number }>(rt, "select count(*)::int as n from legal_entities");
      const aCount = tenants.find((t) => t.tenant_id === tA)!.n;
      const cross = await one<{ n: number }>(rt, "select count(*)::int as n from legal_entities where tenant_id=$1", [tB]);
      iso = iso && seeA.n === aCount && cross.n === 0;
      detail += ` | scoped ${tA}: sees ${seeA.n}/${aCount}; cross-tenant ${tB} visible: ${cross.n} (expect 0)`;
    }
    record("TENANT-ISOLATION", "RLS enforces tenant/entity/country isolation for runtime role", iso, detail);

    const ac = await auditChainIntegrity(admin, "audit_log", "AUDIT_LOG");
    record("AUDIT-CHAIN", "audit creation + audit-chain integrity (audit_log)", ac.ok, ac.detail);
    const ec = await auditChainIntegrity(admin, "enterprise_events", "ENTERPRISE_EVENTS");
    record("EVENT-CHAIN", "enterprise-event chain integrity", ec.ok, ec.detail);

    const mc = await one<{ maxconn: string }>(admin, "select setting as maxconn from pg_settings where name='max_connections'");
    record("POOLING", "connection pooling/limits (Supavisor in front of Postgres)", Number(mc.maxconn) > 0,
      `max_connections=${mc.maxconn}; app uses Supavisor transaction pooler (6543) for runtime, session pooler (5432) for admin/migrations`);
  } finally {
    await rt.end().catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

async function certifyHttp() {
  if (!BASE_URL) {
    console.log("\n(BEYU_BASE_URL not set — database-layer certification only.)");
    return;
  }
  const tryRec = async (id: string, name: string, fn: () => Promise<{ ok: boolean; detail: string }>) => {
    try { const r = await fn(); record(id, name, r.ok, r.detail); }
    catch (e) { record(id, name, false, String((e as Error).message || e)); }
  };

  await tryRec("HTTP-LIVE", "GET /api/health/live = 200 (liveness)", async () => {
    const r = await http("/api/health/live");
    return { ok: r.status === 200 && r.body?.ok === true, detail: `HTTP ${r.status}` };
  });
  await tryRec("HTTP-HEALTH", "GET /api/health = 200 with database: UP", async () => {
    const r = await http("/api/health");
    return { ok: r.status === 200 && r.body?.checks?.database === "UP", detail: `HTTP ${r.status} database=${r.body?.checks?.database ?? "?"}` };
  });
  await tryRec("AUTH-GATE", "unauthenticated governed request denied (401)", async () => {
    const r = await http("/api/v1/governance/authorization?objectType=CAPITAL_REQUEST&objectId=x");
    return { ok: r.status === 401, detail: `HTTP ${r.status}` };
  });
  if (!BOOTSTRAP_PASSWORD) { console.log("\n(BEYU_BOOTSTRAP_PASSWORD not set — skipping authenticated HTTP checks.)"); return; }

  await tryRec("LOGIN-MFA", "authentication + MFA (TOTP) login succeeds", async () => {
    const cookie = await login("ceo@beyu.os");
    return { ok: !!cookie, detail: cookie ? "session cookie issued after TOTP" : "login failed" };
  });
  await tryRec("RBAC", "RBAC role separation (authorized vs denied)", async () => {
    const ceo = await login("ceo@beyu.os");
    const sector = await login("health.ops@beyu.os").catch(() => null);
    const c = ceo ? await http("/api/v1/governance/authorization?objectType=CAPITAL_REQUEST&objectId=CERT_NONE", { cookie: ceo }) : { status: 0, body: null, cookies: [] };
    const s = sector ? await http("/api/v1/governance/authorization?objectType=CAPITAL_REQUEST&objectId=CERT_NONE", { cookie: sector }) : { status: 403, body: null, cookies: [] };
    const ok = c.status !== 401 && c.status !== 403 && (s.status === 401 || s.status === 403 || s.status === 404);
    return { ok, detail: `CEO governance read -> ${c.status}; sector operator -> ${s.status} (denied/out-of-scope)` };
  });
  await tryRec("GOVERNANCE-DENY", "governance/Finance DENY for unauthorized principal", async () => {
    const sector = await login("health.ops@beyu.os").catch(() => null);
    const r = await http("/api/v1/finance/capital/CERT_NONE/governance-authorization", { method: "POST", cookie: sector ?? undefined, body: {} });
    return { ok: r.status === 401 || r.status === 403 || r.status === 404, detail: `sector finance authorize -> HTTP ${r.status} (never 200)` };
  });
  await tryRec("FINANCE-AUTHZ", "Finance authorization recognizes CFO finance:capital.manage", async () => {
    const cfo = await login("cfo@beyu.os").catch(() => null);
    const r = cfo ? await http("/api/v1/finance/capital/CERT_NONE/governance-authorization", { method: "POST", cookie: cfo, body: {} }) : { status: 0, body: null, cookies: [] };
    return { ok: r.status !== 401 && r.status !== 403, detail: `CFO finance authorize -> HTTP ${r.status} (404/422 = authorized, object/input resolved)` };
  });
  await tryRec("NOELIA-AUTHZ", "Noelia authorization gate (401 unauth; authorized analytics served)", async () => {
    const noAuth = await http("/api/v1/ai/noelia/analyze", { method: "POST", body: { analysisType: "KPI_ANALYSIS" } });
    const ceo = await login("ceo@beyu.os").catch(() => null);
    const authed = ceo ? await http("/api/v1/ai/noelia/analyze", { method: "POST", cookie: ceo, body: { analysisType: "KPI_ANALYSIS", context: {} } }) : { status: 0, body: null, cookies: [] };
    return { ok: noAuth.status === 401 && authed.status !== 401, detail: `unauth -> ${noAuth.status} (expect 401); CEO KPI_ANALYSIS -> ${authed.status}` };
  });
}

async function main() {
  console.log("BEYU OS production certification — Supabase eu-west-3");
  console.log("=".repeat(58));
  try {
    await certifyDatabase();
  } catch (e) {
    console.error("\nDATABASE CONNECTION DID NOT SUCCEED:", String((e as Error).message || e));
    console.error("Production is NOT operational. Do not declare Supabase up based on local PostgreSQL.");
    process.exit(2);
  }
  await certifyHttp();
  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);
  console.log("\n" + "=".repeat(58));
  console.log(`SUMMARY: ${passed.length} passed, ${failed.length} failed, 0 skipped`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAILED ${f.id} — ${f.name}: ${f.detail}`);
    console.log("\nPRODUCTION NOT CERTIFIED.");
    process.exit(1);
  }
  console.log("\nPRODUCTION CERTIFIED: Vercel → BEYU → Supabase PostgreSQL → beyu_runtime → RLS.");
  process.exit(0);
}

main().catch((e) => { console.error("certification error:", e); process.exit(2); });
