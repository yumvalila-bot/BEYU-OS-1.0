import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "../../src/db";

async function expectRolledBackFailure(statement: ReturnType<typeof sql>, constraint: string) {
  let error: unknown;
  await db.transaction(async (tx) => {
    try {
      await tx.execute(statement);
    } catch (caught) {
      error = caught;
    }
  });
  expect(error).toBeDefined();
  const cause = (error as { cause?: { constraint?: string; message?: string } })?.cause;
  expect(`${cause?.constraint ?? ""} ${cause?.message ?? ""}`).toContain(constraint);
}

afterAll(async () => {
  await pool.end();
});

describe("Noelia PostgreSQL security boundary", () => {
  it("enables RLS on scoped memory and action evidence", async () => {
    const result = await db.execute<{ relname: string }>(sql`
      select relname from pg_class
      where relname in ('knowledge_sources', 'noelia_action_requests') and relrowsecurity
      order by relname
    `);
    expect(result.rows.map((row) => row.relname)).toEqual(["knowledge_sources", "noelia_action_requests"]);
  });

  it("installs explicit tenant policies for both tables", async () => {
    const result = await db.execute<{ tablename: string; policyname: string }>(sql`
      select tablename, policyname from pg_policies
      where tablename in ('knowledge_sources', 'noelia_action_requests')
      order by tablename
    `);
    expect(result.rows).toEqual([
      { tablename: "knowledge_sources", policyname: "knowledge_sources_scope_isolation" },
      { tablename: "noelia_action_requests", policyname: "noelia_action_tenant_isolation" },
    ]);
  });

  it("database rejects enterprise memory without an owning tenant", async () => {
    await expectRolledBackFailure(sql`
      insert into knowledge_sources
        (id, code, title, domain, owner_role, scope_type, authority_status, provenance,
         classification, effective_from, review_date, content)
      values
        ('KNW_BAD_ENTERPRISE', 'BAD_ENTERPRISE', 'bad', 'TEST', 'TEST', 'ENTERPRISE',
         'AUTHORITATIVE', 'test', 'INTERNAL', '2026-01-01', '2027-01-01', 'bad')
    `, "knowledge_sources_scope_shape_ck");
  });

  it("database rejects a GLOBAL source carrying tenant scope", async () => {
    const tenant = await db.execute<{ id: string }>(sql`select id from tenants limit 1`);
    await expectRolledBackFailure(sql`
      insert into knowledge_sources
        (id, code, title, domain, owner_role, scope_type, tenant_id, authority_status, provenance,
         classification, effective_from, review_date, content)
      values
        ('KNW_BAD_GLOBAL', 'BAD_GLOBAL', 'bad', 'TEST', 'TEST', 'GLOBAL', ${tenant.rows[0].id},
         'AUTHORITATIVE', 'test', 'INTERNAL', '2026-01-01', '2027-01-01', 'bad')
    `, "knowledge_sources_scope_shape_ck");
  });

  it("database binds every action request to the NOELIA AI identity", async () => {
    const tenant = await db.execute<{ id: string }>(sql`select id from tenants limit 1`);
    const user = await db.execute<{ id: string }>(sql`select id from users limit 1`);
    await expectRolledBackFailure(sql`
      insert into noelia_action_requests
        (id, tenant_id, requesting_human_id, executing_ai, tool_name, target_tenant_id,
         risk, status, reason)
      values
        ('NAR_BAD_AI', ${tenant.rows[0].id}, ${user.rows[0].id}, 'UNBOUNDED_AGENT', 'bad.tool',
         ${tenant.rows[0].id}, 'HIGH', 'DENIED', 'test')
    `, "noelia_action_identity_ck");
  });
});
