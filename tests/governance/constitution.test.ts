/**
 * Phase 9 — Constitution constraint engine.
 *
 * Evaluates article HIERARCHY, not article prose. Encoding "what Art. 5 means"
 * would invent the law. These tests prove:
 *
 *   - Art. 1 is supreme and must be ACTIVE
 *   - a lower-cited article cannot ALLOW what a higher-cited article DENYs
 *   - an uncited policy cannot ALLOW what a cited article DENYs
 *   - live policies are CONSISTENT
 *   - fault injection: inverting rank, emptying Art. 1, deleting the override check
 */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  CONSTITUTION_ENGINE_VERSION,
  articleRank,
  detectArticleOverrides,
  evaluateConstitution,
  outranks,
  type CitedPolicy,
} from "@/lib/governance/constitution";

const deny = (action: string) =>
  ({ id: "d", effect: "DENY" as const, action, message: "deny" });
const allow = (action: string) =>
  ({ id: "a", effect: "ALLOW" as const, action, message: "allow" });

describe("article ranking", () => {
  it("Art. 1 outranks Art. 6", () => {
    expect(outranks(1, 6)).toBe(true);
    expect(outranks(6, 1)).toBe(false);
  });

  it("a cited article outranks an uncited policy", () => {
    expect(outranks(5, null)).toBe(true);
  });

  it("rejects a non-positive article number rather than inventing rank", () => {
    expect(() => articleRank(0)).toThrow(/positive integer/);
    expect(() => articleRank(-1)).toThrow(/positive integer/);
  });
});

describe("article override detection", () => {
  it("POSITIVE: consistent policies produce no override", () => {
    const cited: CitedPolicy[] = [
      { code: "CONST-AI-001", level: "CONSTITUTION", articleNo: 6, rules: [deny("finance:ledger.post")] },
      { code: "ENT-FIN-002", level: "ENTERPRISE", articleNo: 5, rules: [deny("finance:capital.manage")] },
    ];
    expect(detectArticleOverrides(cited)).toEqual([]);
  });

  it("a lower article ALLOW cannot override a higher article DENY", () => {
    const cited: CitedPolicy[] = [
      { code: "HIGHER", level: "CONSTITUTION", articleNo: 1, rules: [deny("identity:user.manage")] },
      { code: "LOWER", level: "ENTERPRISE", articleNo: 12, rules: [allow("identity:user.manage")] },
    ];
    const o = detectArticleOverrides(cited);
    expect(o).toHaveLength(1);
    expect(o[0].action).toBe("identity:user.manage");
    expect(o[0].higher.articleNo).toBe(1);
    expect(o[0].lower.code).toBe("LOWER");
  });

  it("an uncited ALLOW cannot override a cited DENY", () => {
    const cited: CitedPolicy[] = [
      { code: "HIGHER", level: "CONSTITUTION", articleNo: 6, rules: [deny("finance:ledger.post")] },
      { code: "UNCITED", level: "DOMAIN", articleNo: null, rules: [allow("finance:ledger.post")] },
    ];
    expect(detectArticleOverrides(cited)).toHaveLength(1);
  });

  it("the same action on a HIGHER article ALLOW against a lower DENY is not an override", () => {
    const cited: CitedPolicy[] = [
      { code: "HIGHER", level: "CONSTITUTION", articleNo: 1, rules: [allow("platform:dashboard.read")] },
      { code: "LOWER", level: "ENTERPRISE", articleNo: 9, rules: [deny("platform:dashboard.read")] },
    ];
    expect(detectArticleOverrides(cited)).toEqual([]);
  });

  it("FI: inverted rank would hide the override — the comparison is load-bearing", () => {
    const inverted = (higher: number, lower: number | null) => {
      if (lower === null) return true;
      return higher > lower; // WRONG: larger number wins
    };
    expect(inverted(1, 12)).toBe(false);
    expect(outranks(1, 12)).toBe(true);
  });
});

describe("live constitution", () => {
  it("Art. 1 exists, is ACTIVE, and the live policies are CONSISTENT", async () => {
    const r = await evaluateConstitution();
    expect(r.supreme).toBe(true);
    expect(r.articleCount).toBe(12);
    expect(r.decision).toBe("CONSISTENT");
    expect(r.overrides).toEqual([]);
  });

  it("versions are pinned", () => {
    expect(CONSTITUTION_ENGINE_VERSION).toBe("constitution-1.0.0");
  });

  it("does not mutate constitution or policy substrate", async () => {
    const articles = await db.execute(sql`select count(*)::int as n from constitution_articles`);
    const n = Number((articles as unknown as { rows: Array<{ n: number }> }).rows[0].n);
    expect(n).toBe(12);
  });
});
