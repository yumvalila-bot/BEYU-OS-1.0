/**
 * Phase 5R — governance provenance referential integrity.
 *
 * Phase 5P proved a policy could cite a fabricated resolution id and added ONE foreign key.
 * Phase 5R re-ran that attack across the whole schema and found the defect was systemic: seven
 * further columns claimed governance provenance with no referential integrity. A capital request
 * for USD 999,999 was persisted citing 'RES_DOES_NOT_EXIST_AT_ALL'.
 *
 * Constitution Art. 4: "Every material decision must be traceable to ... under which authority
 * ... with which approvals". A citation pointing at nothing is not traceability.
 *
 * These tests assert ONLY that a cited resolution must exist, and that governance evidence
 * cannot be deleted while something still cites it. They deliberately do NOT assert that
 * provenance is mandatory or that the resolution be APPROVED — both are unratified governance
 * decisions (CAP-2025-004 currently cites a TABLED resolution, and that is recorded as a finding,
 * not silently "fixed" here).
 *
 * Every destructive probe runs inside a transaction that ALWAYS rolls back and then asserts the
 * target row survived, per the mandatory rule established after the Phase 5P deletion incident.
 */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";

const ROLLBACK = "__ROLLBACK__";

async function inRolledBackTx(fn: (tx: typeof db) => Promise<void>): Promise<{ blocked: boolean; message: string }> {
  let blocked = false;
  let message = "";
  try {
    await db.transaction(async (tx) => {
      try {
        await fn(tx as unknown as typeof db);
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

/** Every column in the schema that claims "this object was authorised by that resolution". */
const PROVENANCE_COLUMNS: ReadonlyArray<readonly [table: string, column: string]> = [
  ["beneficiaries", "approved_by_resolution_id"],
  ["capital_requests", "resolution_id"],
  ["foundation_programs", "funding_resolution_id"],
  ["policies", "approved_by_resolution_id"],
  ["regulatory_changes", "adoption_resolution_id"],
  ["tax_strategy_assessments", "approved_by_resolution_id"],
  ["waterfall_configs", "approved_by_resolution_id"],
  ["waterfall_runs", "approved_by_resolution_id"],
];

describe("governance provenance cannot reference a nonexistent resolution", () => {
  it.each(PROVENANCE_COLUMNS)("%s.%s is protected by a foreign key to resolutions", async (table, column) => {
    const constrained = await scalar(sql`
      select count(*)::int n
      from pg_constraint
      where contype = 'f'
        and conrelid = ${table}::regclass
        and confrelid = 'resolutions'::regclass
        and pg_get_constraintdef(oid) like ${"%" + column + "%"}
    `);
    expect(constrained).toBe(1);
  });

  it("rejects a capital request citing a fabricated resolution id", async () => {
    const { blocked, message } = await inRolledBackTx(async (tx) => {
      await tx.execute(sql`
        insert into capital_requests (id, tenant_id, legal_entity_id, code, title, request_type,
                                      amount, currency, status, requested_by, resolution_id)
        select 'TEST-5R-FORGED', t.id, e.id, 'TEST-5R-FORGED', 'forged provenance probe', 'GROWTH',
               999999, 'USD', 'APPROVED', 'probe', 'RES_DOES_NOT_EXIST_AT_ALL'
        from (select id from tenants limit 1) t, (select id from legal_entities limit 1) e
      `);
    });

    expect(blocked).toBe(true);
    expect(message).toMatch(/foreign key|capital_requests_resolution_id/i);
    expect(await scalar(sql`select count(*)::int n from capital_requests where id = 'TEST-5R-FORGED'`)).toBe(0);
  });

  it("refuses to delete a resolution while a capital request still cites it, and the resolution survives", async () => {
    const cited = await scalar(sql`
      select count(*)::int n from capital_requests where resolution_id is not null
    `);
    expect(cited).toBeGreaterThan(0); // guards against a vacuous pass

    const before = await scalar(sql`select count(*)::int n from resolutions`);

    const { blocked, message } = await inRolledBackTx(async (tx) => {
      await tx.execute(
        sql`delete from resolutions where id in (select resolution_id from capital_requests where resolution_id is not null)`,
      );
    });

    expect(blocked).toBe(true);
    expect(message).toMatch(/violates foreign key|RESTRICT/i);
    expect(await scalar(sql`select count(*)::int n from resolutions`)).toBe(before);
  });

  it("leaves no orphaned governance citation anywhere in the schema", async () => {
    for (const [table, column] of PROVENANCE_COLUMNS) {
      const orphans = await scalar(sql`
        select count(*)::int n
        from ${sql.identifier(table)} x
        left join resolutions r on r.id = x.${sql.identifier(column)}
        where x.${sql.identifier(column)} is not null and r.id is null
      `);
      expect(orphans, `${table}.${column} has orphaned governance citations`).toBe(0);
    }
  });

  it("still permits a null citation, because mandatory provenance is an unratified governance decision", async () => {
    const { blocked } = await inRolledBackTx(async (tx) => {
      await tx.execute(sql`
        insert into capital_requests (id, tenant_id, legal_entity_id, code, title, request_type,
                                      amount, currency, status, requested_by, resolution_id)
        select 'TEST-5R-NULLPROV', t.id, e.id, 'TEST-5R-NULLPROV', 'null provenance probe', 'GROWTH',
               1000, 'USD', 'DRAFT', 'probe', null
        from (select id from tenants limit 1) t, (select id from legal_entities limit 1) e
      `);
    });

    // Documents current behaviour. This is NOT an endorsement that provenance should be optional;
    // making it mandatory requires a ratified governance decision.
    expect(blocked).toBe(false);
    expect(await scalar(sql`select count(*)::int n from capital_requests where id = 'TEST-5R-NULLPROV'`)).toBe(0);
  });
});
