import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import { publishEvent, recordAudit, verifyAuditChain, verifyEventChain } from "../../src/lib/audit";
import { resetAuditLedgers } from "../helpers/ledger-reset";

async function resetAuditLedger() {
  await resetAuditLedgers();
  await db.execute(sql`insert into audit_chain_heads(chain_name,current_hash) values ('AUDIT_LOG', null) on conflict(chain_name) do update set current_hash = null, updated_at = now()`);
}

async function duplicateParents() {
  const r = await db.execute<{ count: string }>(sql`
    select count(*)::text as count
    from (
      select prev_hash from audit_log where prev_hash is not null group by prev_hash having count(*) > 1
    ) forks
  `);
  return Number(r.rows[0]?.count ?? 0);
}

async function writeConcurrent(n: number) {
  await Promise.all(
    Array.from({ length: n }, (_, i) =>
      recordAudit({
        tenantId: "TEN_BEYU_GROUP",
        actorUserId: "USR_TEST",
        action: "test.audit.concurrent",
        objectType: "AUDIT_TEST",
        objectId: `OBJ_${n}_${i}`,
        reason: `concurrent append ${i}`,
        traceId: `TRACE_${n}_${i}`,
      }),
    ),
  );
}

describe("C-01 audit chain serialized append", () => {
  beforeEach(async () => resetAuditLedger());

  it.each([10, 50, 100])("creates zero forks under %i concurrent writes", async (n) => {
    await writeConcurrent(n);
    const chain = await verifyAuditChain();
    expect(chain.verified).toBe(true);
    expect(chain.records).toBe(n);
    expect(chain.duplicateParents).toBe(0);
    expect(chain.headMatches).toBe(true);
    expect(await duplicateParents()).toBe(0);
  }, 30_000);

  it("does not produce a false tamper alarm after sequential serialized writes", async () => {
    await recordAudit({ action: "test.audit.one", objectType: "SEQ", objectId: "1" });
    await recordAudit({ action: "test.audit.two", objectType: "SEQ", objectId: "2" });
    const chain = await verifyAuditChain();
    expect(chain.verified).toBe(true);
    expect(chain.records).toBe(2);
  });

  it("rejects duplicate parent forks at storage level", async () => {
    const first = await recordAudit({ action: "test.audit.first", objectType: "X", objectId: "1" });
    await recordAudit({ action: "test.audit.second", objectType: "X", objectId: "2" });
    const [row] = (await db.execute<{ hash: string }>(sql`select hash from audit_log where id=${first}`)).rows;
    await expect(
      db.execute(sql`
        insert into audit_log(id, actor_type, action, object_type, object_id, outcome, system_version, occurred_at, prev_hash, hash)
        values('AUD_DUPLICATE_PARENT','HUMAN','test.audit.fork','X','3','SUCCESS','test',now(),${row.hash},'bad')
      `),
    ).rejects.toThrow();
  });

  it("verifies the v2 interoperability event chain", async () => {
    await publishEvent({
      type: "TEST_EVENT",
      source: "tests/audit",
      domain: "AUDIT",
      operation: "TEST_EVENT",
      destinationDomain: null,
      tenantId: "TEN_BEYU_GROUP",
      legalEntityId: null,
      subjectType: "AUDIT_TEST",
      subjectId: "EVENT_1",
      actorUserId: "USR_TEST",
      classification: "INTERNAL",
      payload: { ok: true },
      traceId: "TRACE_EVENT_1",
      correlationId: "TRACE_EVENT_1",
      causationId: null,
      authorityContext: null,
      policyVersion: null,
    });
    const chain = await verifyEventChain();
    expect(chain.verified).toBe(true);
    expect(chain.records).toBe(1);
    expect(chain.headMatches).toBe(true);
  });
});
