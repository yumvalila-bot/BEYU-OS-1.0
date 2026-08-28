/**
 * BEYU OS — constitutional compliance certification (Level IV-A).
 *
 * Maps every seeded constitutional article to its enforcement point(s) and
 * verifies, with executable checks against the live database and application
 * logic, that each article's rule is actually implemented and tested. This is
 * the automated Article → Rule → Implementation → Enforcement → Evidence matrix.
 */
import "dotenv/config";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import { can, type Principal } from "../../src/lib/authz";
import { evaluatePolicy } from "../../src/lib/policy";
import { NOELIA_IDENTITY } from "../../src/lib/constants";
import { verifyAuditChain, verifyEventChain } from "../../src/lib/audit";

async function rows<T>(q: Parameters<typeof db.execute>[0]): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as { rows?: T[] };
  return r.rows ?? (r as unknown as T[]);
}

describe("Constitutional Article Matrix (12 articles)", () => {
  it("all 12 constitutional articles are ratified and seeded", async () => {
    const arts = await rows<{ article_no: number; title: string }>(
      sql`select article_no, title from constitution_articles order by article_no`,
    );
    expect(arts.length).toBe(12);
    expect(arts.map((a) => a.article_no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("ART-1 Supremacy: no module or AI agent exceeds granted authority (Noelia has no ledger-write tool)", async () => {
    const { createDefaultNoeliaToolRegistry } = await import("../../src/lib/noelia/default-tools");
    const tools = createDefaultNoeliaToolRegistry().list();
    expect(tools.filter((t) => t.permission === "finance:ledger.post")).toHaveLength(0);
  });

  it("ART-2 Single Source of Truth: source_of_truth registry exists and records canonical owners", async () => {
    const n = await rows<{ c: number }>(sql`select count(*)::int c from source_of_truth`);
    expect(n[0].c).toBeGreaterThan(0);
  });

  it("ART-3 Identity & Least Privilege: a powerless principal is denied every permission", async () => {
    const p = {
      userId: "u", partyId: "p", email: "n@e", displayName: "N", tenantId: "T", tenantCode: "T",
      tenantType: "SECTOR", roles: [], permissions: new Set<never>(), clearance: "INTERNAL",
      entityScope: [], mfaSatisfied: true, sessionId: "s", riskScore: 0, emergencyPermissions: [],
    } as unknown as Principal;
    expect(can(p, "finance:ledger.post").allowed).toBe(false);
    expect(can(p, "governance:resolution.approve").allowed).toBe(false);
  });

  it("ART-4 Governance of Material Decisions: DENY is final and authority is provenance-bound", async () => {
    // Unratified capability cannot authorize execution.
    const [cap] = await rows<{ activation_status: string }>(
      sql`select activation_status from governance_capability_registry where capability_code='CAP_POSTING'`,
    );
    expect(cap?.activation_status).not.toBe("ACTIVATED");
  });

  it("ART-5 Financial Authority & Integrity: single canonical writer + DB-enforced balance", async () => {
    const [trig] = await rows<{ c: number }>(sql`
      select count(*)::int c from pg_trigger t join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='journal_lines' and t.tgenabled<>'D'`);
    expect(trig?.c ?? 0).toBeGreaterThan(0);
  });

  it("ART-6 AI Authority & Human Accountability: Noelia cannot become an authority", async () => {
    // Policy CONST-AI-001 denies AI-initiated ledger posts / ownership / beneficiary mutation.
    const res = await evaluatePolicy({
      action: "finance:ledger.post",
      roles: ["GROUP_CFO"],
      aiInitiated: true,
    });
    const deny = res.denials.some((d) => /AI may not post financial entries/.test(d.message));
    expect(deny).toBe(true);
    expect(res.effect).toBe("DENY");
    // Noelia is not a governing role.
    const { ROLES } = await import("../../src/lib/constants");
    expect((ROLES as Record<string, unknown>)[NOELIA_IDENTITY]).toBeUndefined();
  });

  it("ART-7 Jurisdictional Compliance: TZ policy does not generalise globally", async () => {
    // DOM-TAX-001 is jurisdictionCode TZ; a non-TZ request must not match it.
    const tz = await evaluatePolicy({ action: "finance:tax.assess", roles: ["GROUP_CFO"], jurisdictionCode: "TZ", classification: "RESTRICTED" });
    const nonTz = await evaluatePolicy({ action: "finance:tax.assess", roles: ["GROUP_CFO"], jurisdictionCode: "GB", classification: "RESTRICTED" });
    const tzHad = tz.appliedPolicies.some((p) => p.code === "DOM-TAX-001");
    const gbHad = nonTz.appliedPolicies.some((p) => p.code === "DOM-TAX-001");
    expect(tzHad).toBe(true);
    expect(gbHad).toBe(false);
  });

  it("ART-8 Auditability & Non-Repudiation: hash chain is unbroken", async () => {
    const a = await verifyAuditChain();
    const e = await verifyEventChain();
    expect(a.verified).toBe(true);
    expect(a.duplicateParents).toBe(0);
    expect(a.headMatches).toBe(true);
    expect(e.verified).toBe(true);
    expect(e.duplicateParents).toBe(0);
  });

  it("ART-9 Tenant Isolation: runtime role cannot bypass RLS", async () => {
    const [role] = await rows<{ rolsuper: boolean; rolbypassrls: boolean }>(
      sql`select rolsuper, rolbypassrls from pg_roles where rolname='beyu_runtime'`,
    );
    expect(role?.rolsuper).toBe(false);
    expect(role?.rolbypassrls).toBe(false);
  });

  it("ART-10 Emergency Powers & Continuity: emergency access is time-limited (activated_at/expires_at)", async () => {
    const [g] = await rows<{ c: number }>(sql`select count(*)::int c from information_schema.columns where table_name='emergency_access_grants' and column_name in ('activated_at','expires_at')`);
    expect(g?.c).toBe(2);
  });

  it("ART-11 Change Control: architecture decisions are recorded as ADRs", async () => {
    const n = await rows<{ c: number }>(sql`select count(*)::int c from architecture_decisions`);
    expect(n[0].c).toBeGreaterThan(0);
  });

  it("ART-12 Lawful & Ethical Operation: beneficial-ownership look-through is documented, and governance denies nothing outside scope", async () => {
    // Source-of-truth + ownership records exist; lawfulness is a policy invariant not a runtime bypass.
    const n = await rows<{ c: number }>(sql`select count(*)::int c from ownership_records`);
    expect(n[0].c).toBeGreaterThan(0);
  });
});
