import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { policies, type PolicyRule } from "@/db/schema";
import { classificationRank, type Classification } from "./constants";

/**
 * BEYU OS Policy Engine.
 *
 * Hierarchy (highest wins, lower levels may never weaken a higher level):
 *   CONSTITUTION > ENTERPRISE > DOMAIN > SECTOR > ENTITY > TENANT > WORKFLOW_RULE > TRANSACTION_CONTROL
 *
 * Evaluation semantics:
 *   - Any DENY at any level is final.
 *   - REQUIRE_APPROVAL / REQUIRE_HUMAN_REVIEW accumulate as obligations.
 *   - Absence of an explicit ALLOW does not grant access; RBAC/ABAC is evaluated
 *     independently in authz.ts (both must pass — defence in depth).
 */

export const POLICY_LEVEL_ORDER = [
  "CONSTITUTION",
  "ENTERPRISE",
  "DOMAIN",
  "SECTOR",
  "ENTITY",
  "TENANT",
  "WORKFLOW_RULE",
  "TRANSACTION_CONTROL",
] as const;

export type PolicyRequest = {
  action: string;
  tenantId?: string | null;
  jurisdictionCode?: string | null;
  entityCode?: string | null;
  roles: string[];
  classification?: Classification;
  amount?: number;
  riskScore?: number;
  aiInitiated?: boolean;
};

export type PolicyObligation = {
  type: "APPROVAL" | "HUMAN_REVIEW";
  approverRole?: string;
  policyCode: string;
  policyVersion: string;
  message: string;
};

export type PolicyEvaluation = {
  effect: "ALLOW" | "DENY";
  obligations: PolicyObligation[];
  denials: { policyCode: string; message: string }[];
  appliedPolicies: { code: string; version: string; level: string }[];
};

function ruleMatches(rule: PolicyRule, req: PolicyRequest): boolean {
  if (rule.action !== "*" && rule.action !== req.action) {
    // support prefix wildcards e.g. "finance:*"
    if (!(rule.action.endsWith("*") && req.action.startsWith(rule.action.slice(0, -1)))) return false;
  }
  const w = rule.when;
  if (!w) return true;
  if (w.classificationAtOrAbove && req.classification) {
    if (classificationRank(req.classification) < classificationRank(w.classificationAtOrAbove)) return false;
  }
  if (w.amountAtOrAbove !== undefined) {
    if ((req.amount ?? 0) < w.amountAtOrAbove) return false;
  }
  if (w.jurisdictionIn && req.jurisdictionCode) {
    if (!w.jurisdictionIn.includes(req.jurisdictionCode)) return false;
  }
  if (w.roleIn) {
    if (!req.roles.some((r) => w.roleIn?.includes(r))) return false;
  }
  if (w.aiInitiated !== undefined) {
    if (Boolean(req.aiInitiated) !== w.aiInitiated) return false;
  }
  if (w.riskAtOrAbove !== undefined) {
    if ((req.riskScore ?? 0) < w.riskAtOrAbove) return false;
  }
  return true;
}

export async function evaluatePolicy(req: PolicyRequest): Promise<PolicyEvaluation> {
  /**
   * Authority firewall — effective dating.
   *
   * `status = 'ACTIVE'` alone is NOT sufficient to treat a policy as current
   * authority. `policies` carries `effective_from` (NOT NULL) and
   * `effective_to`, so a row may be ACTIVE while its effective window has not
   * opened or has already closed. Hostile testing confirmed both cases were
   * enforced as live authority:
   *   - a policy with effective_to 2020-12-31 still produced a DENY;
   *   - a policy with effective_from 2099-01-01 still produced a DENY.
   *
   * A superseded policy that keeps deciding, or a future policy that decides
   * early, is an authority defect: the engine would be applying a rule the
   * organisation is not currently bound by. The window is filtered in SQL so
   * out-of-window rows never reach evaluation.
   *
   * This is NOT an accounting judgement. Effective dating is existing ratified
   * schema (Constitution Art. 4 requires decisions to be traceable to *when*
   * they applied); no accounting treatment is selected here.
   */
  const today = new Date().toISOString().slice(0, 10);

  const active = await db
    .select()
    .from(policies)
    .where(
      and(
        eq(policies.status, "ACTIVE"),
        inArray(policies.level, [...POLICY_LEVEL_ORDER]),
        lte(policies.effectiveFrom, today),
        or(isNull(policies.effectiveTo), gte(policies.effectiveTo, today)),
      ),
    );

  const scoped = active
    /**
     * Tenant scope — fail closed.
     *
     * A tenant-scoped policy belongs to exactly one tenant. The previous
     * predicate (`!p.tenantId || !req.tenantId || p.tenantId === req.tenantId`)
     * also admitted a tenant-scoped policy whenever the REQUEST had no tenant,
     * so an unscoped evaluation inherited another tenant's rules. Hostile
     * testing confirmed a BEYU-AGRI policy was applied to a request carrying no
     * tenant at all.
     *
     * Global policies (`tenantId` NULL) still apply to everyone — that is their
     * purpose, and CONST-AI-001 relies on it. But a policy that names a tenant
     * now requires a request that names the SAME tenant.
     *
     * Constitution Art. 9 (Tenant Isolation) already requires every request to
     * resolve its tenant scope, so this is isolation enforcement, not an
     * accounting judgement.
     */
    .filter((p) => !p.tenantId || p.tenantId === req.tenantId)
    .filter((p) => !p.jurisdictionCode || p.jurisdictionCode === req.jurisdictionCode)
    .filter((p) => !p.entityScope || p.entityScope === "*" || p.entityScope === req.entityCode)
    .sort(
      (a, b) => POLICY_LEVEL_ORDER.indexOf(a.level) - POLICY_LEVEL_ORDER.indexOf(b.level),
    );

  const evaluation: PolicyEvaluation = {
    effect: "ALLOW",
    obligations: [],
    denials: [],
    appliedPolicies: [],
  };

  for (const policy of scoped) {
    for (const rule of policy.rules ?? []) {
      if (!ruleMatches(rule, req)) continue;
      evaluation.appliedPolicies.push({ code: policy.code, version: policy.version, level: policy.level });
      if (rule.effect === "DENY") {
        evaluation.effect = "DENY";
        evaluation.denials.push({ policyCode: policy.code, message: rule.message });
      } else if (rule.effect === "REQUIRE_APPROVAL") {
        evaluation.obligations.push({
          type: "APPROVAL",
          approverRole: rule.approverRole,
          policyCode: policy.code,
          policyVersion: policy.version,
          message: rule.message,
        });
      } else if (rule.effect === "REQUIRE_HUMAN_REVIEW") {
        evaluation.obligations.push({
          type: "HUMAN_REVIEW",
          approverRole: rule.approverRole,
          policyCode: policy.code,
          policyVersion: policy.version,
          message: rule.message,
        });
      }
    }
  }
  return evaluation;
}

/**
 * Structural integrity check: a lower-level policy may not ALLOW an action that a
 * higher-level policy DENIES. Run in CI and by the governance self-test.
 */
export function detectHierarchyConflicts(
  all: { code: string; level: string; rules: PolicyRule[] }[],
): { lower: string; higher: string; action: string }[] {
  const conflicts: { lower: string; higher: string; action: string }[] = [];
  const denies = all.flatMap((p) =>
    (p.rules ?? []).filter((r) => r.effect === "DENY").map((r) => ({ policy: p, rule: r })),
  );
  for (const p of all) {
    for (const rule of p.rules ?? []) {
      if (rule.effect !== "ALLOW") continue;
      for (const d of denies) {
        const higher =
          POLICY_LEVEL_ORDER.indexOf(d.policy.level as (typeof POLICY_LEVEL_ORDER)[number]) <
          POLICY_LEVEL_ORDER.indexOf(p.level as (typeof POLICY_LEVEL_ORDER)[number]);
        if (higher && d.rule.action === rule.action) {
          conflicts.push({ lower: p.code, higher: d.policy.code, action: rule.action });
        }
      }
    }
  }
  return conflicts;
}
