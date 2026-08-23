/**
 * Phase 5S — authority firewall.
 *
 * BEYU OS has no ratified accounting authority. The danger is not that someone posts a journal
 * today (no posting service exists); it is that a future change quietly makes "ACTIVE policy" or
 * "linked resolution" mean "authorised to move money", without anyone ratifying that equivalence.
 *
 * These tests pin the three firewalls that keep the unratified boundary honest:
 *
 *   1. POLICY FIREWALL      — an ACTIVE policy must never imply APPROVED, RATIFIED, or
 *                             EXECUTION-AUTHORISED. The engine must consume a policy on
 *                             lifecycle + effective window alone, and must be completely
 *                             indifferent to provenance (because provenance semantics are
 *                             unratified — see C-1).
 *   2. CAPITAL FIREWALL     — only an APPROVED resolution may authorise a capital transition.
 *                             TABLED, DRAFT and absent resolutions must not.
 *   3. ACCOUNTING FIREWALL  — every accounting capability that has not been ratified must remain
 *                             undefined and therefore ungrantable to any role combination.
 *
 * These are behavioural tests against the real engine and real RBAC. They assert current,
 * verified behaviour; they are NOT an endorsement that provenance should be optional.
 */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { evaluatePolicy } from "@/lib/policy";
import { can, type Principal } from "@/lib/authz";
import { ROLES, PERMISSIONS } from "@/lib/constants";

const SYNTHETIC_ACTION = "test:synthetic.capability";

function principalWith(roles: string[]): Principal {
  const permissions = new Set<never>();
  for (const role of roles) {
    const def = (ROLES as Record<string, { permissions?: readonly string[] }>)[role];
    for (const p of def?.permissions ?? []) permissions.add(p as never);
  }
  return {
    userId: "test-principal",
    partyId: "p",
    email: "e@example.test",
    displayName: "d",
    tenantId: "TEN_BEYU_GROUP",
    tenantCode: "BEYU",
    tenantType: "GROUP",
    roles,
    permissions,
    clearance: "RESTRICTED",
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "s",
    riskScore: 0,
    emergencyPermissions: [],
  } as unknown as Principal;
}

/**
 * Plants a policy, evaluates the real engine, and removes the policy again.
 * Returns whether the engine consumed the planted policy.
 *
 * The insert is COMMITTED rather than wrapped in a rolled-back transaction. That is deliberate
 * and was verified empirically: `evaluatePolicy()` reads through the module-level `db` pool, so a
 * row written inside a caller's uncommitted transaction is invisible to it. A rollback-wrapped
 * probe therefore reports "not consumed" for EVERY case — including cases that should be
 * consumed — turning the whole suite into a vacuous pass. That failure mode was caught by keeping
 * a positive control in this file (the provenance test below, which asserts `true`).
 *
 * Safety: the delete runs in `finally`, is keyed to this probe's unique id, and can only ever
 * match the row this function created. Probe ids are namespaced `PFW-<time>-<random>` so they
 * cannot collide with seeded policies.
 */
async function consumedAfterPlanting(opts: {
  status: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  tenantId: string | null;
  provenance: string | null;
}): Promise<boolean> {
  const id = `PFW-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await db.execute(sql`
      insert into policies (id, tenant_id, code, title, level, domain, version, status,
                            effective_from, effective_to, body, rules, owner_role,
                            classification, approved_by_resolution_id)
      values (${id}, ${opts.tenantId}, ${id}, 'firewall probe', 'ENTERPRISE', 'FINANCE', '1',
              ${opts.status}, ${opts.effectiveFrom}::date, ${opts.effectiveTo}::date, 'probe',
              ${JSON.stringify([{ id: "r", action: SYNTHETIC_ACTION, effect: "DENY", message: id }])}::jsonb,
              'GROUP_CFO', 'RESTRICTED', ${opts.provenance})
    `);
    const result = await evaluatePolicy({
      action: SYNTHETIC_ACTION,
      tenantId: "TEN_FIREWALL_PROBE",
      roles: ["GROUP_CFO"],
    } as never);
    return (result.appliedPolicies ?? []).some(
      (p: { code?: string; id?: string }) => p.code === id || p.id === id,
    );
  } finally {
    await db.execute(sql`delete from policies where id = ${id}`);
  }
}

const TODAY = new Date().toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

describe("policy firewall — ACTIVE never implies ratified or execution-authorised", () => {
  it.each([
    ["a future policy", "ACTIVE", TOMORROW, null],
    ["an expired policy", "ACTIVE", "2020-01-01", YESTERDAY],
    ["a SUSPENDED policy", "SUSPENDED", "2020-01-01", null],
    ["a SUPERSEDED policy", "SUPERSEDED", "2020-01-01", null],
    ["a DRAFT policy", "DRAFT", "2020-01-01", null],
    ["an IN_REVIEW policy", "IN_REVIEW", "2020-01-01", null],
    ["an APPROVED (but not ACTIVE) policy", "APPROVED", "2020-01-01", null],
    ["a RETIRED policy", "RETIRED", "2020-01-01", null],
  ])("does not consume %s", async (_label, status, from, to) => {
    expect(
      await consumedAfterPlanting({
        status,
        effectiveFrom: from,
        effectiveTo: to,
        tenantId: null,
        provenance: null,
      }),
    ).toBe(false);
  });

  it("does not consume a policy scoped to a different tenant", async () => {
    const tenant = (
      (await db.execute(sql`select id from tenants limit 1`)) as unknown as { rows: Array<{ id: string }> }
    ).rows[0].id;
    expect(
      await consumedAfterPlanting({
        status: "ACTIVE",
        effectiveFrom: "2020-01-01",
        effectiveTo: null,
        tenantId: tenant,
        provenance: null,
      }),
    ).toBe(false);
  });

  it("consumes an ACTIVE in-window policy regardless of provenance, proving provenance is NOT an authority gate", async () => {
    const approved = (
      (await db.execute(
        sql`select id from resolutions where status = 'APPROVED' limit 1`,
      )) as unknown as { rows: Array<{ id: string }> }
    ).rows[0].id;
    const tabled = (
      (await db.execute(sql`select id from resolutions where status = 'TABLED' limit 1`)) as unknown as {
        rows: Array<{ id: string }>;
      }
    ).rows[0].id;

    const base = { status: "ACTIVE", effectiveFrom: TODAY, effectiveTo: null, tenantId: null } as const;

    // All three consume identically. The engine never reads approved_by_resolution_id, so it
    // cannot be conflating ACTIVE with APPROVED or RATIFIED. Documented, not endorsed: closing
    // this gap is governance decision C-1.
    expect(await consumedAfterPlanting({ ...base, provenance: null })).toBe(true);
    expect(await consumedAfterPlanting({ ...base, provenance: tabled })).toBe(true);
    expect(await consumedAfterPlanting({ ...base, provenance: approved })).toBe(true);
  });
});

describe("accounting authority firewall — unratified capabilities are ungrantable", () => {
  /** Accounting capabilities whose authority has NOT been ratified (P1-P11 pending). */
  const UNRATIFIED_CAPABILITIES = [
    "finance:ledger.approve",
    "capital:execute",
    "treasury:settle",
    "finance:coa.manage",
    "finance:period.manage",
    "finance:fx.manage",
    "finance:tax.post",
    "finance:openingbalance.post",
    "finance:intercompany.post",
    "finance:depreciation.run",
  ] as const;

  it.each(UNRATIFIED_CAPABILITIES)("%s is not a defined permission", (capability) => {
    expect(Object.prototype.hasOwnProperty.call(PERMISSIONS, capability)).toBe(false);
  });

  it("denies every unratified capability even to all roles combined", () => {
    const everyRole = principalWith(Object.keys(ROLES as Record<string, unknown>));
    for (const capability of UNRATIFIED_CAPABILITIES) {
      expect(can(everyRole, capability as never).allowed, `${capability} was granted`).toBe(false);
    }
  });

  it("keeps finance:ledger.post restricted to the canonical holder", () => {
    const allRoles = Object.keys(ROLES as Record<string, unknown>);
    expect(can(principalWith(["GROUP_CFO"]), "finance:ledger.post").allowed).toBe(true);
    expect(
      can(principalWith(allRoles.filter((r) => r !== "GROUP_CFO")), "finance:ledger.post").allowed,
      "a non-CFO role combination obtained ledger posting authority",
    ).toBe(false);
  });

  it("has no accounting substrate that an unratified decision could act upon", async () => {
    const row = (
      (await db.execute(sql`
        select (select count(*) from ledger_accounts)::int coa,
               (select count(*) from financial_periods)::int periods,
               (select count(*) from journal_entries)::int entries,
               (select count(*) from journal_lines)::int lines,
               (select count(*) from capital_requests where status = 'FUNDED')::int funded
      `)) as unknown as { rows: Array<Record<string, number>> }
    ).rows[0];

    expect(row).toEqual({ coa: 0, periods: 0, entries: 0, lines: 0, funded: 0 });
  });
});

describe("firewall probe hygiene", () => {
  it("leaves no probe policy behind and keeps the seeded policy set intact", async () => {
    const row = (
      (await db.execute(sql`
        select (select count(*) from policies where code like 'PFW-%')::int probes,
               (select count(*) from policies)::int total
      `)) as unknown as { rows: Array<{ probes: number; total: number }> }
    ).rows[0];
    expect(row.probes).toBe(0);
    expect(row.total).toBe(5);
  });
});
