import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { SECURITY_FINGERPRINT_SQL } from "../../src/lib/release/security-fingerprint";

const dsn = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
function isDisposableLocalDatabase(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1") && url.pathname !== "/postgres";
  } catch {
    return false;
  }
}

const localOnly = isDisposableLocalDatabase(dsn);
const suite = localOnly ? describe : describe.skip;

suite("security catalog fingerprint drift (disposable PostgreSQL only)", () => {
  const suffix = randomBytes(5).toString("hex");
  const table = `fp_security_${suffix}`;
  const policy = `fp_policy_${suffix}`;
  const fn = `fp_function_${suffix}`;
  const owner = `fp_owner_${suffix}`;
  let client: Client;
  let baseline = "";

  async function fingerprint(): Promise<string> {
    const result = await client.query<{ fingerprint: string }>(SECURITY_FINGERPRINT_SQL);
    return result.rows[0].fingerprint;
  }

  async function expectMutationChangesFingerprint(label: string, sql: string): Promise<void> {
    await client.query("savepoint fingerprint_mutation");
    await client.query(sql);
    expect(await fingerprint(), label).not.toBe(baseline);
    await client.query("rollback to savepoint fingerprint_mutation");
    expect(await fingerprint(), `${label} rollback`).toBe(baseline);
    await client.query("release savepoint fingerprint_mutation");
  }

  beforeAll(async () => {
    client = new Client({ connectionString: dsn });
    await client.connect();
    await client.query("begin");
    await client.query(`create role ${owner} nologin nosuperuser nobypassrls`);
    await client.query(`create table public.${table} (id text primary key, tenant_id text not null)`);
    await client.query(`alter table public.${table} enable row level security`);
    await client.query(`create policy ${policy} on public.${table} using (tenant_id = 'TEN_A') with check (tenant_id = 'TEN_A')`);
    await client.query(`create function public.${fn}(value text) returns text language sql as $$ select value || ':v1' $$`);
    baseline = await fingerprint();
  });

  afterAll(async () => {
    if (!client) return;
    await client.query("rollback");
    await client.end();
  });

  it("changes for policy expressions and commands", async () => {
    await expectMutationChangesFingerprint(
      "policy expression",
      `alter policy ${policy} on public.${table} using (tenant_id = 'TEN_B') with check (tenant_id = 'TEN_B')`,
    );
    await expectMutationChangesFingerprint(
      "policy command",
      `drop policy ${policy} on public.${table}; create policy ${policy} on public.${table} for select using (tenant_id = 'TEN_A')`,
    );
  });

  it("changes for FORCE RLS, ACL, and owner drift", async () => {
    await expectMutationChangesFingerprint("FORCE RLS", `alter table public.${table} force row level security`);
    await expectMutationChangesFingerprint("relation ACL", `grant select on public.${table} to public`);
    await expectMutationChangesFingerprint("relation owner", `alter table public.${table} owner to ${owner}`);
  });

  it("changes for function body, SECURITY DEFINER, and fixed search_path drift", async () => {
    await expectMutationChangesFingerprint(
      "function body",
      `create or replace function public.${fn}(value text) returns text language sql as $$ select value || ':v2' $$`,
    );
    await expectMutationChangesFingerprint("SECURITY DEFINER", `alter function public.${fn}(text) security definer`);
    await expectMutationChangesFingerprint("function search_path", `alter function public.${fn}(text) set search_path = pg_catalog`);
  });

  it("changes for default privilege drift", async () => {
    await expectMutationChangesFingerprint(
      "default privileges",
      "alter default privileges in schema public grant select on tables to public",
    );
  });
});
