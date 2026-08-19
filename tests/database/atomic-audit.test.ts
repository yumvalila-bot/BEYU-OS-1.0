import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { notifications } from "../../src/db/schema";
import { withAuditTransaction, verifyAuditChain } from "../../src/lib/audit";

async function reset() {
  await db.execute(sql`truncate table notifications`);
  await db.execute(sql`truncate table audit_log`);
  await db.execute(sql`insert into audit_chain_heads(chain_name,current_hash) values ('AUDIT_LOG', null) on conflict(chain_name) do update set current_hash = null, updated_at = now()`);
}

async function notifCount(id: string) {
  const r = await db.select().from(notifications).where(eq(notifications.id, id));
  return r.length;
}

describe("C-06 atomic business + audit transaction", () => {
  beforeEach(async () => reset());

  it("commits domain mutation and audit together", async () => {
    await withAuditTransaction(
      async (tx) => {
        await tx.insert(notifications).values({
          id: "NTF_ATOMIC_OK",
          tenantId: "TEN_BEYU_GROUP",
          subject: "Atomic test",
          body: "normal commit",
          updatedBy: undefined as never,
        } as never);
        return { id: "NTF_ATOMIC_OK" };
      },
      (r) => ({ tenantId: "TEN_BEYU_GROUP", action: "test.notification.create", objectType: "NOTIFICATION", objectId: r.id }),
    );
    expect(await notifCount("NTF_ATOMIC_OK")).toBe(1);
    expect((await verifyAuditChain()).records).toBe(1);
  });

  it("rolls back audit when domain mutation fails", async () => {
    await expect(
      withAuditTransaction(
        async () => {
          throw new Error("domain failure");
        },
        () => ({ tenantId: "TEN_BEYU_GROUP", action: "test.should_not_exist", objectType: "X", objectId: "X" }),
      ),
    ).rejects.toThrow("domain failure");
    expect((await verifyAuditChain()).records).toBe(0);
  });

  it("rolls back domain mutation when audit persistence fails", async () => {
    await expect(
      withAuditTransaction(
        async (tx) => {
          await tx.insert(notifications).values({ id: "NTF_ATOMIC_FAIL", tenantId: "TEN_BEYU_GROUP", subject: "Atomic test", body: "audit failure" });
          return { id: "NTF_ATOMIC_FAIL" };
        },
        (r) => ({ tenantId: "TEN_BEYU_GROUP", action: null as never, objectType: "NOTIFICATION", objectId: r.id }),
      ),
    ).rejects.toThrow();
    expect(await notifCount("NTF_ATOMIC_FAIL")).toBe(0);
    expect((await verifyAuditChain()).records).toBe(0);
  });
});
