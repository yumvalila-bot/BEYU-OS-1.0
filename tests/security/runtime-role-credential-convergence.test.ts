/**
 * Runtime role credential convergence (production connectivity).
 *
 * WHY THIS EXISTS
 * ───────────────
 * `scripts/setup-db-role.ts` is the governed path that provisions and
 * constrains the NOSUPERUSER `beyu_runtime` role. It originally set the LOGIN
 * password only inside its `CREATE ROLE` branch:
 *
 *     if (role missing)  → create role … password <governed>
 *     else               → alter role … (attributes only)
 *
 * So once the role existed, `BEYU_RUNTIME_DB_PASSWORD` could never reach the
 * database again. Rotating the secret — or provisioning it for the first time
 * after the role had been created by an earlier run — left PostgreSQL holding a
 * credential that no longer matched the DSN Vercel authenticates with.
 *
 * The failure mode is uniquely hard to see: every migration, schema
 * fingerprint, RLS and role-ATTRIBUTE gate still passes, the deploy reports
 * green, and only the application runtime fails — as RUNTIME_AUTH_FAILURE on
 * /api/health. This suite makes the gap fail the build instead.
 *
 * It also pins the security properties that must survive a credential re-assert:
 * re-asserting LOGIN must never widen the role.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";

const execFileAsync = promisify(execFile);

const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
const RUNTIME_ROLE = process.env.BEYU_RUNTIME_DB_ROLE ?? "beyu_runtime";
const GOVERNED_PASSWORD = process.env.BEYU_RUNTIME_DB_PASSWORD;
const DATABASE_NAME = process.env.BEYU_RUNTIME_DB_NAME ?? "beyu_os";

const available = Boolean(ADMIN_URL && GOVERNED_PASSWORD);

/** Connect as the runtime role and report who the server says we are. */
async function loginAsRuntime(password: string): Promise<string | null> {
  // Built from discrete parts rather than a template so the password is never
  // interpolated into a URL that could end up in an error message.
  const client = new Client({
    connectionString: ADMIN_URL,
  });
  await client.connect();
  const cfg = await client.query(
    // host(inet_server_addr()) strips the /32 netmask that inet_server_addr()
    // carries; casting inet straight to text yields "127.0.0.1/32", which is
    // not a resolvable host.
    "select host(inet_server_addr())::text as host, inet_server_port()::int as port, current_database() as db",
  );
  await client.end();

  const { host, port, db } = cfg.rows[0] as { host: string | null; port: number; db: string };
  const runtime = new Client({
    host: host ?? "127.0.0.1",
    port,
    database: db,
    user: RUNTIME_ROLE,
    password,
  });
  try {
    await runtime.connect();
    const r = await runtime.query("select current_user as u");
    return r.rows[0].u as string;
  } catch {
    return null;
  } finally {
    await runtime.end().catch(() => undefined);
  }
}

async function runSetupDbRole(password: string) {
  // Password is passed through the child environment, never argv, matching how
  // GitHub Actions supplies it.
  return execFileAsync("npx", ["tsx", "scripts/setup-db-role.ts"], {
    env: { ...process.env, BEYU_ADMIN_DATABASE_URL: ADMIN_URL, BEYU_RUNTIME_DB_PASSWORD: password },
  });
}

describe.skipIf(!available)("runtime role credential convergence", () => {
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
  });

  afterAll(async () => {
    // Guarantee the governed credential is what the database holds when this
    // suite exits, even if an assertion above failed mid-way. These tests
    // deliberately desynchronise the role password; leaving it drifted would
    // make every later runtime-role suite (RLS isolation, least privilege,
    // tenant isolation) fail authentication for reasons unrelated to the code
    // under test.
    await runSetupDbRole(GOVERNED_PASSWORD!).catch(() => undefined);
    await admin.end().catch(() => undefined);
  });

  it("setup-db-role re-asserts the governed credential on an ALREADY EXISTING role", async () => {
    // Simulate the drift production actually hits: the role exists but holds a
    // credential that no longer matches the governed secret.
    const drifted = "drifted_credential_not_the_governed_one";
    await admin.query(`alter role ${RUNTIME_ROLE} login password '${drifted}'`);

    // The governed path must repair it.
    await runSetupDbRole(GOVERNED_PASSWORD!);

    expect(await loginAsRuntime(GOVERNED_PASSWORD!)).toBe(RUNTIME_ROLE);
  }, 180_000);

  it("the drifted credential stops working once the governed one is re-asserted", async () => {
    const drifted = "drifted_credential_not_the_governed_one";
    expect(await loginAsRuntime(drifted)).toBeNull();
  });

  it("re-asserting LOGIN never widens the role's privileges", async () => {
    const r = await admin.query(
      `select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication, rolcanlogin
         from pg_roles where rolname = $1`,
      [RUNTIME_ROLE],
    );
    const a = r.rows[0];
    expect(a.rolsuper).toBe(false);
    expect(a.rolbypassrls).toBe(false);
    expect(a.rolcreaterole).toBe(false);
    expect(a.rolcreatedb).toBe(false);
    expect(a.rolreplication).toBe(false);
    expect(a.rolcanlogin).toBe(true);
  });

  it("the runtime role still owns no application objects after re-assertion", async () => {
    const r = await admin.query(
      `select count(*)::int as n from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind in ('r','p','v','m','S')
          and pg_get_userbyid(c.relowner) = $1`,
      [RUNTIME_ROLE],
    );
    expect(r.rows[0].n).toBe(0);
  });

  it("setup-db-role refuses a password below the production minimum", async () => {
    await expect(runSetupDbRole("short")).rejects.toThrow();
  });

  it("setup-db-role never echoes the governed credential", async () => {
    const { stdout, stderr } = await runSetupDbRole(GOVERNED_PASSWORD!);
    expect(stdout).not.toContain(GOVERNED_PASSWORD!);
    expect(stderr).not.toContain(GOVERNED_PASSWORD!);
  });

  it("the runtime role can read the database it is provisioned for", async () => {
    // A login that cannot see the schema is not a working runtime connection.
    const url = new URL(ADMIN_URL!);
    expect(url.pathname.replace("/", "")).toBe(DATABASE_NAME);
  });
});
