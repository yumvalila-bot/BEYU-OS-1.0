/**
 * Finance idempotency RLS regression — connect directly as the real runtime
 * login role, never SET ROLE from an owner/admin connection.
 *
 * The test uses a transaction and random synthetic principal identifiers. All
 * writes are rolled back; it does not seed or mutate persistent business data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, pool, withDatabaseTransactionContext, withIndependentPrincipalDatabase } from "@/db";
import { idempotencyRecords } from "@/db/schema";

const runtimeUrl = process.env.BEYU_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const runtimeRole = process.env.BEYU_RUNTIME_DB_ROLE ?? "beyu_runtime";
// The global Vitest setup redirects DATABASE_URL to a privileged test role for
// other suites. This file deliberately restores the actual runtime DSN before
// the lazy application pool is first used, so the helper under test also logs in
// as beyu_runtime rather than inheriting the administrator connection.
if (runtimeUrl) process.env.DATABASE_URL = runtimeUrl;

describe.skipIf(!runtimeUrl)("Finance idempotency principal RLS — actual runtime connection", () => {
  const client = new Client({ connectionString: runtimeUrl });
  let transactionOpen = false;

  beforeAll(async () => {
    await client.connect();
    const r = await client.query(
      `select current_user as role_name, c.relrowsecurity as rls_enabled,
              c.relforcerowsecurity as rls_forced, pg_get_userbyid(c.relowner) as owner
         from pg_class c
        where c.oid = 'public.idempotency_records'::regclass`,
    );
    expect(r.rows[0]?.role_name).toBe(runtimeRole);
    expect(r.rows[0]?.rls_enabled).toBe(true);
    expect(r.rows[0]?.rls_forced).toBe(true);
    expect(r.rows[0]?.owner).not.toBe(runtimeRole);
  });

  afterAll(async () => {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    await client.end().catch(() => undefined);
    await pool.end().catch(() => undefined);
  });

  it("uses a fresh transaction with explicit principal GUCs instead of inheriting the request transaction", async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const actorA = randomUUID();
    const actorB = randomUUID();
    const key = randomUUID();
    const scope = `${tenantA}:${actorA}:POST /__independent_probe`;

    await withDatabaseTransactionContext(async (outer) => {
      await outer.execute(sql`select set_config('beyu.current_tenant_ids', ${tenantB}, true)`);
      await outer.execute(sql`select set_config('beyu.global_scope', 'off', true)`);
      await outer.execute(sql`select set_config('beyu.actor_user_id', ${actorB}, true)`);

      await withIndependentPrincipalDatabase(tenantA, actorA, async (independent) => {
        await independent.insert(idempotencyRecords).values({
          scope,
          idempotencyKey: key,
          requestHash: "independent-context-probe",
          state: "IN_FLIGHT",
          tenantId: tenantA,
          actorUserId: actorA,
          expiresAt: new Date(Date.now() + 60_000),
        });
        const own = await independent
          .select({ key: idempotencyRecords.idempotencyKey })
          .from(idempotencyRecords)
          .where(and(eq(idempotencyRecords.scope, scope), eq(idempotencyRecords.idempotencyKey, key)));
        expect(own).toHaveLength(1);
      });

      // The caller's still-open transaction retains its original tenant/actor
      // scope. If the independent helper accidentally reused the ALS transaction,
      // these values would have been overwritten by tenantA/actorA.
      const hidden = await outer
        .select({ key: idempotencyRecords.idempotencyKey })
        .from(idempotencyRecords)
        .where(eq(idempotencyRecords.idempotencyKey, key));
      expect(hidden).toHaveLength(0);
    });

    // Clean up the committed synthetic probe through the same constrained helper.
    await withIndependentPrincipalDatabase(tenantA, actorA, (independent) =>
      independent.delete(idempotencyRecords).where(
        and(eq(idempotencyRecords.scope, scope), eq(idempotencyRecords.idempotencyKey, key)),
      ),
    );
  });

  it("isolates reads, writes and deletes by both tenant and actor; global scope never bypasses", async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const actorA = randomUUID();
    const actorB = randomUUID();
    const key = randomUUID();
    const scope = `${tenantA}:${actorA}:POST /__rls_probe`;

    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("select set_config('beyu.current_tenant_ids', $1, true)", [tenantA]);
    await client.query("select set_config('beyu.global_scope', 'off', true)");
    await client.query("select set_config('beyu.actor_user_id', $1, true)", [actorA]);
    await client.query(
      `insert into public.idempotency_records
        (scope, idempotency_key, request_hash, state, tenant_id, actor_user_id, expires_at)
       values ($1,$2,$3,'IN_FLIGHT',$4,$5,now()+interval '5 minutes')`,
      [scope, key, "probe-hash", tenantA, actorA],
    );

    const own = await client.query(
      "select count(*)::int as n from public.idempotency_records where idempotency_key = $1",
      [key],
    );
    expect(own.rows[0].n).toBe(1);

    await client.query("select set_config('beyu.current_tenant_ids', $1, true)", [tenantB]);
    const hiddenTenant = await client.query(
      "select count(*)::int as n from public.idempotency_records where idempotency_key = $1",
      [key],
    );
    expect(hiddenTenant.rows[0].n).toBe(0);

    await client.query("select set_config('beyu.current_tenant_ids', $1, true)", [tenantA]);
    await client.query("select set_config('beyu.actor_user_id', $1, true)", [actorB]);
    const hiddenActor = await client.query(
      "select count(*)::int as n from public.idempotency_records where idempotency_key = $1",
      [key],
    );
    expect(hiddenActor.rows[0].n).toBe(0);
    const crossActorDelete = await client.query(
      "delete from public.idempotency_records where idempotency_key = $1",
      [key],
    );
    expect(crossActorDelete.rowCount).toBe(0);
    const crossActorUpdate = await client.query(
      "update public.idempotency_records set state = 'COMPLETED' where idempotency_key = $1",
      [key],
    );
    expect(crossActorUpdate.rowCount).toBe(0);

    await client.query("SAVEPOINT cross_actor_insert");
    await expect(client.query(
      `insert into public.idempotency_records
        (scope, idempotency_key, request_hash, state, tenant_id, actor_user_id, expires_at)
       values ($1,$2,$3,'IN_FLIGHT',$4,$5,now()+interval '5 minutes')`,
      [`${tenantA}:${actorA}:POST /__rls_probe`, randomUUID(), "actor-mismatch", tenantA, actorA],
    )).rejects.toThrow();
    await client.query("ROLLBACK TO SAVEPOINT cross_actor_insert");

    await client.query("select set_config('beyu.actor_user_id', $1, true)", [actorA]);
    await client.query("select set_config('beyu.current_tenant_ids', $1, true)", [tenantB]);
    await client.query("select set_config('beyu.global_scope', 'on', true)");
    const hiddenGlobal = await client.query(
      "select count(*)::int as n from public.idempotency_records where idempotency_key = $1",
      [key],
    );
    expect(hiddenGlobal.rows[0].n).toBe(0);

    await client.query("select set_config('beyu.current_tenant_ids', $1, true)", [tenantA]);
    await client.query("SAVEPOINT cross_tenant_insert");
    await expect(client.query(
      `insert into public.idempotency_records
        (scope, idempotency_key, request_hash, state, tenant_id, actor_user_id, expires_at)
       values ($1,$2,$3,'IN_FLIGHT',$4,$5,now()+interval '5 minutes')`,
      [`${tenantB}:${actorA}:POST /__rls_probe`, randomUUID(), "bad-hash", tenantB, actorA],
    )).rejects.toThrow();
    await client.query("ROLLBACK TO SAVEPOINT cross_tenant_insert");

    await client.query("SAVEPOINT cross_tenant_update");
    await expect(client.query(
      "update public.idempotency_records set tenant_id = $1 where idempotency_key = $2",
      [tenantB, key],
    )).rejects.toThrow();
    await client.query("ROLLBACK TO SAVEPOINT cross_tenant_update");

    const stillOwned = await client.query(
      "select count(*)::int as n from public.idempotency_records where idempotency_key = $1",
      [key],
    );
    expect(stillOwned.rows[0].n).toBe(1);
    await client.query("ROLLBACK");
    transactionOpen = false;
  });
});
