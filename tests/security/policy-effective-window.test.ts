import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import { evaluatePolicy } from "../../src/lib/policy";

/**
 * AUTHORITY FIREWALL — policy effective window.
 *
 * POLICY-INDEPENDENT. Selects no accounting treatment. Asserts only that the
 * policy engine treats a policy as authority during, and only during, the
 * effective window the organisation gave it.
 *
 * DEFECT FOUND BY HOSTILE TESTING (Phase 5O), fixed in src/lib/policy.ts:
 * `evaluatePolicy()` filtered on `status = 'ACTIVE'` alone and ignored
 * `effective_from` / `effective_to`, which the schema has always carried. Both
 * of the following were enforced as live authority:
 *
 *   - a policy whose window CLOSED in 2020 still produced a DENY;
 *   - a policy whose window OPENS in 2099 still produced a DENY.
 *
 * That is an authority defect rather than a bug in a rule: the engine applied a
 * rule the organisation is not currently bound by. It matters most for the
 * pending accounting ratifications — a superseded accounting policy that keeps
 * deciding, or a future one that decides early, would silently misstate what
 * authority exists. Constitution Art. 4 requires a decision to be traceable to
 * the authority and data in force *at the time*.
 *
 * Fixtures are namespaced per run and removed in afterEach; no seeded policy is
 * modified and no financial data is created.
 */

const RUN = `PEW-${Date.now()}`;
const ACTION = "finance:ledger.post";

type Window = { from: string; to: string | null };

/** Insert a throwaway ACTIVE policy carrying a single DENY rule for ACTION. */
async function seedPolicy(code: string, { from, to }: Window): Promise<void> {
  await db.execute(sql`
    insert into policies (id, tenant_id, code, title, level, domain, version, status,
                          effective_from, effective_to, body, rules, owner_role, classification)
    values (${`${RUN}-${code}`}, null, ${`${RUN}-${code}`}, 'authority window fixture',
            'ENTERPRISE', 'FINANCE', '1.0.0', 'ACTIVE',
            ${from}, ${to}, 'Fixture policy for effective-window testing.',
            ${JSON.stringify([{ id: "r1", action: ACTION, effect: "DENY", message: `${code} applied` }])}::jsonb,
            'GROUP_CFO', 'RESTRICTED')`);
}

async function applied(code: string): Promise<boolean> {
  const evaluation = await evaluatePolicy({ action: ACTION } as Parameters<typeof evaluatePolicy>[0]);
  return evaluation.appliedPolicies.some((p) => p.code === `${RUN}-${code}`);
}

afterEach(async () => {
  await db.execute(sql`delete from policies where code like ${`${RUN}%`}`);
});

describe("policy authority firewall — effective window", () => {
  it("does not apply a policy whose effective window has closed", async () => {
    await seedPolicy("EXPIRED", { from: "2020-01-01", to: "2020-12-31" });
    expect(await applied("EXPIRED")).toBe(false);
  });

  it("does not apply a policy whose effective window has not opened", async () => {
    await seedPolicy("FUTURE", { from: "2099-01-01", to: null });
    expect(await applied("FUTURE")).toBe(false);
  });

  it("DOES apply a policy that is currently in force", async () => {
    // Control case. Without this, the two tests above could pass simply because
    // the engine stopped applying policies at all.
    await seedPolicy("CURRENT", { from: "2020-01-01", to: null });
    expect(await applied("CURRENT")).toBe(true);
  });

  it("applies a policy on the first day of its window", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await seedPolicy("OPENS-TODAY", { from: today, to: null });
    expect(await applied("OPENS-TODAY")).toBe(true);
  });

  it("still applies a policy on the last day of its window", async () => {
    // The window is inclusive at both ends: a policy expiring today is still
    // binding today.
    const today = new Date().toISOString().slice(0, 10);
    await seedPolicy("CLOSES-TODAY", { from: "2020-01-01", to: today });
    expect(await applied("CLOSES-TODAY")).toBe(true);
  });

  it("an expired policy cannot override a policy that is in force", async () => {
    // The real risk: a superseded rule continuing to decide alongside the
    // current one. Only the in-force policy may contribute to the outcome.
    await seedPolicy("STALE", { from: "2019-01-01", to: "2019-12-31" });
    await seedPolicy("LIVE", { from: "2020-01-01", to: null });
    const evaluation = await evaluatePolicy({ action: ACTION } as Parameters<typeof evaluatePolicy>[0]);
    const codes = evaluation.appliedPolicies.map((p) => p.code);
    expect(codes).toContain(`${RUN}-LIVE`);
    expect(codes).not.toContain(`${RUN}-STALE`);
  });

  it("non-ACTIVE policies remain excluded regardless of window", async () => {
    // Status and window are independent gates; both must hold.
    await db.execute(sql`
      insert into policies (id, tenant_id, code, title, level, domain, version, status,
                            effective_from, effective_to, body, rules, owner_role, classification)
      values (${`${RUN}-DRAFT`}, null, ${`${RUN}-DRAFT`}, 'draft fixture', 'ENTERPRISE', 'FINANCE',
              '1.0.0', 'DRAFT', '2020-01-01', null, 'Draft policy must never be authority.',
              ${JSON.stringify([{ id: "r1", action: ACTION, effect: "DENY", message: "draft applied" }])}::jsonb,
              'GROUP_CFO', 'RESTRICTED')`);
    expect(await applied("DRAFT")).toBe(false);
  });
});
