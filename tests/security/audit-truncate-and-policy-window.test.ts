/**
 * Phase 5Q — hostile audit remediation.
 *
 * Two policy-independent defects found by attacking the governance substrate directly:
 *
 *  1. The append-only controls on audit_log / enterprise_events were FOR EACH ROW triggers
 *     on UPDATE OR DELETE. Row-level triggers never fire for TRUNCATE, so the whole audit
 *     and event history could be erased in one statement. Constitution Art. 8 states
 *     verbatim: "No component may alter or delete audit history."
 *
 *  2. policies accepted effective_to < effective_from, creating a policy that is nominally
 *     ACTIVE but can never be in force, while financial_periods already enforced the
 *     equivalent ordering rule. Inconsistent enforcement of the same idea.
 *
 * Every destructive probe runs inside a transaction that ALWAYS rolls back, and then
 * asserts the target data survived. This is mandatory after the Phase 5P incident in which
 * an unwrapped DELETE destroyed a real seeded resolution during a fault-injection window.
 *
 * These are behavioural tests: they exercise the running database, never source text.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { publishEvent } from "@/lib/audit";
import { withDatabaseRlsContext } from "@/lib/tenant-scope";

const ROLLBACK = "__ROLLBACK__";

/** Runs `fn` inside a transaction that always rolls back, and reports whether it was blocked. */
async function inRolledBackTx<T>(fn: (tx: never) => Promise<T>): Promise<{ blocked: boolean; message: string }> {
  let blocked = false;
  let message = "";
  try {
    await db.transaction(async (tx) => {
      try {
        await fn(tx as never);
      } catch (error) {
        blocked = true;
        const err = error as { message?: string; cause?: { message?: string } };
        message = String(err.cause?.message ?? err.message ?? "");
      }
      throw new Error(ROLLBACK);
    });
  } catch (error) {
    if (!String((error as Error)?.message).includes(ROLLBACK)) throw error;
  }
  return { blocked, message };
}

async function scalar(query: Parameters<typeof db.execute>[0]): Promise<number> {
  const result = (await db.execute(query)) as unknown as { rows?: Array<{ n: number }> };
  const rows = result.rows ?? (result as unknown as Array<{ n: number }>);
  return Number(rows[0].n);
}

beforeAll(async () => {
  // The canonical seed intentionally creates no operational event. Establish a
  // real append through the production writer so destructive probes are never
  // vacuous when this file runs first in an isolated suite.
  if (await scalar(sql`select count(*)::int n from enterprise_events`)) return;
  await withDatabaseRlsContext([], true, () => publishEvent({
    type: "SECURITY_TEST_LEDGER_INITIALIZED",
    source: "beyu-os/security-test",
    domain: "AUDIT",
    operation: "INITIALIZE_APPEND_ONLY_PROBE",
    destinationDomain: null,
    tenantId: null,
    legalEntityId: null,
    subjectType: "SECURITY_TEST",
    subjectId: "AUDIT_TRUNCATE_PROBE",
    actorType: "SERVICE",
    classification: "INTERNAL",
    payload: { purpose: "non-vacuous append-only test" },
    traceId: "SECURITY_TEST_AUDIT_TRUNCATE",
    correlationId: "SECURITY_TEST_AUDIT_TRUNCATE",
    causationId: null,
    authorityContext: null,
    policyVersion: null,
  }));
});

describe("audit ledger is append-only against TRUNCATE (Constitution Art. 8)", () => {
  it("blocks TRUNCATE on enterprise_events and leaves the ledger intact", async () => {
    const before = await scalar(sql`select count(*)::int n from enterprise_events`);
    expect(before).toBeGreaterThan(0); // guards against a vacuous pass on an empty ledger

    const { blocked, message } = await inRolledBackTx(async (tx) => {
      await (tx as unknown as typeof db).execute(sql`truncate enterprise_events cascade`);
    });

    expect(blocked).toBe(true);
    expect(message).toMatch(/append-only|TRUNCATE is not allowed/i);
    expect(await scalar(sql`select count(*)::int n from enterprise_events`)).toBe(before);
  });

  it("blocks TRUNCATE on audit_log", async () => {
    const before = await scalar(sql`select count(*)::int n from audit_log`);

    const { blocked, message } = await inRolledBackTx(async (tx) => {
      await (tx as unknown as typeof db).execute(sql`truncate audit_log cascade`);
    });

    expect(blocked).toBe(true);
    expect(message).toMatch(/append-only|TRUNCATE is not allowed/i);
    expect(await scalar(sql`select count(*)::int n from audit_log`)).toBe(before);
  });

  it("still blocks row-level UPDATE and DELETE on enterprise_events", async () => {
    const before = await scalar(sql`select count(*)::int n from enterprise_events`);
    expect(before).toBeGreaterThan(0);

    const update = await inRolledBackTx(async (tx) => {
      await (tx as unknown as typeof db).execute(
        sql`update enterprise_events set type = 'TAMPERED' where id = (select id from enterprise_events limit 1)`,
      );
    });
    expect(update.blocked).toBe(true);

    const remove = await inRolledBackTx(async (tx) => {
      await (tx as unknown as typeof db).execute(
        sql`delete from enterprise_events where id = (select id from enterprise_events limit 1)`,
      );
    });
    expect(remove.blocked).toBe(true);

    expect(await scalar(sql`select count(*)::int n from enterprise_events`)).toBe(before);
  });

  it("keeps the event sequence high-water mark unchanged after every attack", async () => {
    const maxSequence = await scalar(sql`select coalesce(max(sequence), 0)::int n from enterprise_events`);

    await inRolledBackTx(async (tx) => {
      await (tx as unknown as typeof db).execute(
        sql`update enterprise_events set sequence = 999999 where id = (select id from enterprise_events limit 1)`,
      );
    });

    expect(await scalar(sql`select coalesce(max(sequence), 0)::int n from enterprise_events`)).toBe(maxSequence);
  });
});

describe("policy effective window must be coherent", () => {
  const id = `TEST-WINDOW-${Date.now()}`;

  async function insertPolicy(effectiveFrom: string, effectiveTo: string | null) {
    return inRolledBackTx(async (tx) => {
      await (tx as unknown as typeof db).execute(sql`
        insert into policies (id, tenant_id, code, title, level, domain, version, status,
                              effective_from, effective_to, body, rules, owner_role, classification)
        values (${id}, null, ${id}, 'phase 5q window probe', 'ENTERPRISE', 'FINANCE', '1', 'DRAFT',
                ${effectiveFrom}::date, ${effectiveTo}::date, 'probe', '[]'::jsonb, 'GROUP_CFO', 'RESTRICTED')
      `);
    });
  }

  it("rejects a policy whose effective_to precedes its effective_from", async () => {
    const { blocked, message } = await insertPolicy("2030-01-01", "2020-01-01");
    expect(blocked).toBe(true);
    expect(message).toMatch(/policy_effective_window_ordered/i);
  });

  it("accepts an open-ended window and a window that starts and ends on the same day", async () => {
    expect((await insertPolicy("2020-01-01", null)).blocked).toBe(false);
    expect((await insertPolicy("2020-01-01", "2020-01-01")).blocked).toBe(false);
  });

  it("leaves no probe rows behind and no existing policy violating the constraint", async () => {
    expect(await scalar(sql`select count(*)::int n from policies where code like 'TEST-WINDOW-%'`)).toBe(0);
    expect(
      await scalar(
        sql`select count(*)::int n from policies where effective_to is not null and effective_to < effective_from`,
      ),
    ).toBe(0);
  });
});
