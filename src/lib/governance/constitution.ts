/**
 * BEYU OS — Constitution constraint engine (Phase 9).
 *
 * THE GAP THIS CLOSES. Twelve articles are stored and cited by policies. Nothing evaluated
 * article hierarchy. A lower-cited article could ALLOW what a higher-cited article DENIES,
 * and the only check that existed compared policy LEVEL (CONSTITUTION > ENTERPRISE), not
 * article number.
 *
 * WHAT THIS DOES NOT DO. It does not interpret article prose. Encoding "what Article 5 means"
 * as executable rules would invent constitutional content. The engine evaluates STRUCTURE:
 *
 *   - article number is rank (Art. 1 is supreme — that ranking is the stored article_no)
 *   - a policy citing a lower article cannot ALLOW an action a higher-cited policy DENIES
 *   - a policy with no article citation cannot ALLOW what any cited article DENIES
 *   - Art. 1 must exist and be ACTIVE or the hierarchy is incomplete
 *   - amending the constitution is a reserved matter (POLICY_CONSTITUTION), delegated to
 *     the reserved-matters engine rather than re-derived
 *
 * NO ARTICLE TEXT IS COMPILED INTO RULES.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { constitutionArticles, policies, type PolicyRule } from "@/db/schema";

export const CONSTITUTION_ENGINE_VERSION = "constitution-1.0.0";

export type CitedPolicy = {
  code: string;
  level: string;
  articleNo: number | null;
  rules: PolicyRule[];
};

export type ConstitutionOverride = {
  action: string;
  higher: { code: string; articleNo: number };
  lower: { code: string; articleNo: number | null };
  reason: string;
};

export type ConstitutionEvaluation = {
  supreme: boolean;
  articleCount: number;
  overrides: ConstitutionOverride[];
  decision: "CONSISTENT" | "ARTICLE_OVERRIDE" | "SUPREMACY_INCOMPLETE";
  reason: string;
};

/** Lower article number = higher authority. Art. 1 is supreme. */
export function articleRank(articleNo: number): number {
  if (!Number.isInteger(articleNo) || articleNo < 1) {
    throw new Error(`articleNo must be a positive integer, got ${articleNo}`);
  }
  return articleNo;
}

/** Art. A outranks Art. B when A has a smaller number. */
export function outranks(higherArticleNo: number, lowerArticleNo: number | null): boolean {
  if (lowerArticleNo === null) return true;
  return articleRank(higherArticleNo) < articleRank(lowerArticleNo);
}

/**
 * Detects ALLOW rules that would override a higher article's DENY.
 *
 * Pure: takes already-joined policy+article records so the ranking is independently
 * testable without a database. Does not nominate a winner — it reports the override.
 */
export function detectArticleOverrides(cited: CitedPolicy[]): ConstitutionOverride[] {
  const overrides: ConstitutionOverride[] = [];
  const denies = cited.flatMap((p) =>
    (p.rules ?? [])
      .filter((r) => r.effect === "DENY")
      .map((r) => ({ policy: p, action: r.action })),
  );

  for (const p of cited) {
    for (const rule of p.rules ?? []) {
      if (rule.effect !== "ALLOW") continue;
      for (const d of denies) {
        if (d.policy.articleNo === null) continue;
        if (d.action !== rule.action) continue;
        if (!outranks(d.policy.articleNo, p.articleNo)) continue;
        if (d.policy.code === p.code) continue;
        overrides.push({
          action: rule.action,
          higher: { code: d.policy.code, articleNo: d.policy.articleNo },
          lower: { code: p.code, articleNo: p.articleNo },
          reason:
            `${p.code} (Art. ${p.articleNo ?? "uncited"}) ALLOWs '${rule.action}', but ` +
            `${d.policy.code} (Art. ${d.policy.articleNo}) DENYs it. A lower article ` +
            `cannot override a higher constitutional constraint.`,
        });
      }
    }
  }
  return overrides;
}

export async function loadCitedPolicies(): Promise<CitedPolicy[]> {
  const rows = await db
    .select({
      code: policies.code,
      level: policies.level,
      articleId: policies.constitutionArticleId,
      rules: policies.rules,
    })
    .from(policies);

  const articles = await db
    .select({ id: constitutionArticles.id, articleNo: constitutionArticles.articleNo })
    .from(constitutionArticles);
  const byId = new Map(articles.map((a) => [a.id, a.articleNo]));

  return rows.map((r) => ({
    code: r.code,
    level: r.level,
    articleNo: r.articleId ? (byId.get(r.articleId) ?? null) : null,
    rules: r.rules ?? [],
  }));
}

/**
 * Evaluates the live constitution.
 *
 * SUPREMACY_INCOMPLETE if Art. 1 is missing or not ACTIVE — without supremacy
 * the hierarchy has no apex and cannot be trusted.
 * ARTICLE_OVERRIDE if any cited lower article would weaken a higher DENY.
 */
export async function evaluateConstitution(): Promise<ConstitutionEvaluation> {
  const articles = await db.select().from(constitutionArticles);
  const art1 = articles.find((a) => a.articleNo === 1 && a.status === "ACTIVE");
  if (!art1) {
    return {
      supreme: false,
      articleCount: articles.length,
      overrides: [],
      decision: "SUPREMACY_INCOMPLETE",
      reason:
        "Article 1 (Supremacy of the Constitution) is missing or not ACTIVE. " +
        "The hierarchy has no apex and cannot be evaluated.",
    };
  }

  const cited = await loadCitedPolicies();
  const overrides = detectArticleOverrides(cited);
  if (overrides.length > 0) {
    return {
      supreme: true,
      articleCount: articles.length,
      overrides,
      decision: "ARTICLE_OVERRIDE",
      reason: `${overrides.length} lower-article ALLOW(s) contradict a higher-article DENY.`,
    };
  }

  return {
    supreme: true,
    articleCount: articles.length,
    overrides: [],
    decision: "CONSISTENT",
    reason: `${articles.length} articles present; Art. 1 is ACTIVE; no lower article overrides a higher DENY.`,
  };
}

/** A single article, for callers that need to prove a citation exists. */
export async function articleByNumber(articleNo: number): Promise<{
  id: string;
  articleNo: number;
  title: string;
  status: string;
} | null> {
  const [row] = await db
    .select({
      id: constitutionArticles.id,
      articleNo: constitutionArticles.articleNo,
      title: constitutionArticles.title,
      status: constitutionArticles.status,
    })
    .from(constitutionArticles)
    .where(eq(constitutionArticles.articleNo, articleNo))
    .limit(1);
  return row ?? null;
}
