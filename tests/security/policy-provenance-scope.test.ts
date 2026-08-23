import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import { evaluatePolicy } from "../../src/lib/policy";

/**
 * AUTHORITY FIREWALL — provenance and tenant scope.
 *
 * POLICY-INDEPENDENT. Selects no accounting treatment. Asserts only that a
 * policy's approval reference is real and that a tenant-scoped policy cannot
 * escape its tenant.
 *
 * TWO DEFECTS FOUND BY HOSTILE AUDIT (Phase 5P):
 *
 *  1. NO FOREIGN KEY on `policies.approved_by_resolution_id`. A policy could
 *     claim approval by a resolution that does not exist — 'RES_TOTALLY_FAKE'
 *     was inserted and persisted. Approval provenance was unverifiable, and
 *     deleting a resolution silently orphaned every policy citing it.
 *     Fixed by migration 0007 (FK, ON DELETE RESTRICT).
 *
 *  2. TENANT SCOPE FAILED OPEN. `evaluatePolicy()` admitted a tenant-scoped
 *     policy whenever the REQUEST carried no tenant, so an unscoped evaluation
 *     inherited another tenant's rules. A BEYU-AGRI policy was applied to a
 *     request with no tenant at all. Fixed in src/lib/policy.ts.
 *
 * Both fixes rest on already-ratified authority: Art. 4 (a decision must be
 * traceable to the approvals it claims) and Art. 9 (tenant isolation). Neither
 * decides an accounting question.
 *
 * DELIBERATELY NOT ENFORCED HERE — recorded as open governance findings:
 * whether an approving resolution is MANDATORY, and whether it must be
 * APPROVED rather than DRAFT/TABLED. All five seeded ACTIVE policies have
 * `approved_by_resolution_id` NULL, so enforcing either would disable the live
 * policy engine including CONST-AI-001. That is a Board / Chief Governance
 * Officer decision, not an engineering one. The current permissive behaviour is
 * pinned below as documentation, not endorsement.
 */

const RUN = `PPS-${Date.now()}`;
const ACTION = "finance:ledger.post";
const rows = <T>(res: unknown): T[] => ((res as { rows?: T[] }).rows ?? (res as T[]));

async function seed(code: string, o: { tenant?: string | null; resolution?: string | null } = {}) {
  await db.execute(sql`
    insert into policies (id, tenant_id, code, title, level, domain, version, status,
                          effective_from, effective_to, body, rules, owner_role,
                          approved_by_resolution_id, classification)
    values (${`${RUN}-${code}`}, ${o.tenant ?? null}, ${`${RUN}-${code}`}, 'provenance fixture',
            'ENTERPRISE', 'FINANCE', '1.0.0', 'ACTIVE', '2020-01-01', null,
            'fixture', ${JSON.stringify([{ id: "r1", action: ACTION, effect: "DENY", message: code }])}::jsonb,
            'GROUP_CFO', ${o.resolution ?? null}, 'RESTRICTED')`);
}

async function applied(code: string, req: Record<string, unknown> = {}): Promise<boolean> {
  const e = await evaluatePolicy({ action: ACTION, ...req } as Parameters<typeof evaluatePolicy>[0]);
  return e.appliedPolicies.some((p) => p.code === `${RUN}-${code}`);
}

afterEach(async () => {
  await db.execute(sql`delete from policies where code like ${`${RUN}%`}`);
});

describe("policy provenance integrity (migration 0007)", () => {
  it("rejects a policy claiming approval by a nonexistent resolution", async () => {
    let inserted = false;
    try {
      await seed("FAKE", { resolution: "RES_TOTALLY_FAKE" });
      inserted = true;
    } catch (err) {
      const e = err as { message?: string; cause?: { message?: string } };
      expect(`${e.cause?.message ?? ""} ${e.message ?? ""}`).toMatch(/foreign key/i);
    }
    expect(inserted).toBe(false);
  });

  it("accepts a policy citing a resolution that genuinely exists", async () => {
    // Control: the FK must not block legitimate provenance.
    const [res] = rows<{ id: string }>(await db.execute(sql`select id from resolutions limit 1`));
    await seed("REAL", { resolution: res.id });
    const [row] = rows<{ n: number }>(
      await db.execute(sql`select count(*)::int as n from policies where code = ${`${RUN}-REAL`}`),
    );
    expect(row.n).toBe(1);
  });

  it("refuses to delete a resolution while a policy cites it as approval", async () => {
    // ON DELETE RESTRICT: governance history must not be silently orphaned.
    //
    // Executed inside a transaction that is ALWAYS rolled back. During fault
    // injection (FK dropped) the delete genuinely succeeds, and an unwrapped
    // delete destroyed a seeded board resolution. A security test must never be
    // able to damage governance data even when the control it guards is absent.
    const [res] = rows<{ id: string }>(await db.execute(sql`select id from resolutions limit 1`));
    let deleted = false;
    await db
      .transaction(async (tx) => {
        await tx.execute(sql`
          insert into policies (id, tenant_id, code, title, level, domain, version, status,
                                effective_from, body, rules, owner_role,
                                approved_by_resolution_id, classification)
          values (${`${RUN}-CITED`}, null, ${`${RUN}-CITED`}, 'cited fixture', 'ENTERPRISE',
                  'FINANCE', '1.0.0', 'ACTIVE', '2020-01-01', 'fixture', '[]'::jsonb,
                  'GROUP_CFO', ${res.id}, 'RESTRICTED')`);
        try {
          await tx.execute(sql`delete from resolutions where id = ${res.id}`);
          deleted = true;
        } catch (err) {
          const e = err as { message?: string; cause?: { message?: string } };
          expect(`${e.cause?.message ?? ""} ${e.message ?? ""}`).toMatch(/foreign key|violates/i);
        }
        throw new Error("__ROLLBACK__");
      })
      .catch((e: unknown) => {
        if (!String((e as Error)?.message).includes("__ROLLBACK__")) throw e;
      });
    expect(deleted).toBe(false);

    // Prove the rollback held: the resolution is still present.
    const [still] = rows<{ n: number }>(
      await db.execute(sql`select count(*)::int as n from resolutions where id = ${res.id}`),
    );
    expect(still.n).toBe(1);
  });
});

describe("policy tenant scope — fails closed", () => {
  it("does not apply a tenant-scoped policy to a request carrying no tenant", async () => {
    const [other] = rows<{ id: string }>(await db.execute(sql`select id from tenants where code = 'BEYU-AGRI'`));
    await seed("SCOPED", { tenant: other.id });
    expect(await applied("SCOPED", { tenantId: null })).toBe(false);
  });

  it("does not apply one tenant's policy to another tenant's request", async () => {
    const [a] = rows<{ id: string }>(await db.execute(sql`select id from tenants where code = 'BEYU-AGRI'`));
    const [b] = rows<{ id: string }>(await db.execute(sql`select id from tenants where code = 'BEYU-GROUP'`));
    await seed("XTEN", { tenant: a.id });
    expect(await applied("XTEN", { tenantId: b.id })).toBe(false);
  });

  it("DOES apply a tenant-scoped policy to its own tenant", async () => {
    // Control: scoping must not have become universally closed.
    const [a] = rows<{ id: string }>(await db.execute(sql`select id from tenants where code = 'BEYU-AGRI'`));
    await seed("OWN", { tenant: a.id });
    expect(await applied("OWN", { tenantId: a.id })).toBe(true);
  });

  it("still applies a global (tenant-null) policy to every request", async () => {
    // Control: global policies such as CONST-AI-001 must keep applying, with or
    // without a tenant on the request.
    await seed("GLOBAL", { tenant: null });
    expect(await applied("GLOBAL", { tenantId: null })).toBe(true);
    const [b] = rows<{ id: string }>(await db.execute(sql`select id from tenants where code = 'BEYU-GROUP'`));
    expect(await applied("GLOBAL", { tenantId: b.id })).toBe(true);
  });
});

describe("open governance findings (documented, not enforced)", () => {
  it("a policy with NO approving resolution is still consumed as authority", async () => {
    // NOT an endorsement. Enforcing mandatory approval linkage would disable
    // all five seeded ACTIVE policies, including CONST-AI-001 which denies AI
    // financial posting. Whether approval is mandatory is a Board / CGO
    // decision. Pinned so the behaviour is visible and cannot change silently.
    await seed("NOAPPROVAL", { resolution: null });
    expect(await applied("NOAPPROVAL", { tenantId: null })).toBe(true);

    const [seeded] = rows<{ n: number }>(
      await db.execute(sql`select count(*)::int as n from policies
        where status = 'ACTIVE' and approved_by_resolution_id is null and code not like ${`${RUN}%`}`),
    );
    expect(seeded.n).toBe(5);
  });

  it("a policy approved by a TABLED resolution is still consumed as authority", async () => {
    // Same governance question: the FK proves the resolution EXISTS, not that
    // it was APPROVED. Requiring APPROVED status is reserved to governance.
    const [tabled] = rows<{ id: string }>(
      await db.execute(sql`select id from resolutions where status = 'TABLED' limit 1`),
    );
    await seed("VIATABLED", { resolution: tabled.id });
    expect(await applied("VIATABLED", { tenantId: null })).toBe(true);
  });
});
