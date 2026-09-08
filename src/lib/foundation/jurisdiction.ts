/**
 * BEYU Foundation OS — jurisdiction rule governance (pure, deterministic).
 *
 * Rules are versioned, sourced and effective-dated. This module answers two
 * questions only: (1) is a rule usable on a given date, and (2) what changed
 * between rule versions so the regulatory-change engine can scope impact.
 * It never invents law: an unknown jurisdiction yields NO_RULE, never a guess.
 */

export type JurisdictionRule = {
  id: string;
  code: string;
  jurisdictionId: string | null;
  countryCode: string;
  authority: string;
  source: string;
  ruleVersion: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  supersededBy: string | null;
  verificationDate: string | null;
  status: string;
};

export type RuleUsability =
  | { usable: true; warnings: string[] }
  | { usable: false; reasons: string[] };

export function evaluateRuleUsability(rule: JurisdictionRule, todayIso: string): RuleUsability {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (rule.status === "SUPERSEDED" || rule.supersededBy) {
    blockers.push(`Rule ${rule.code} v${rule.ruleVersion} is superseded${rule.supersededBy ? ` by ${rule.supersededBy}` : ""}`);
  }
  if (rule.status === "RETIRED" || rule.status === "EXPIRED") {
    blockers.push(`Rule ${rule.code} v${rule.ruleVersion} is ${rule.status}`);
  }
  if (todayIso < rule.effectiveFrom) blockers.push(`Rule not yet effective (from ${rule.effectiveFrom})`);
  if (rule.effectiveTo && todayIso > rule.effectiveTo) blockers.push(`Rule expired on ${rule.effectiveTo}`);
  if (!rule.authority || !rule.source) blockers.push("Rule lacks authority/source citation");
  if (!rule.verificationDate) {
    warnings.push("Rule has never been verified against its source");
  }
  return blockers.length > 0 ? { usable: false, reasons: blockers } : { usable: true, warnings };
}

export type RuleChangeImpact = {
  affectedDimensions: string[];
  requiresObligationReview: boolean;
  requiresDeadlineRecalculation: boolean;
  requiresNotification: boolean;
  summary: string;
};

/**
 * Scope the blast radius of a rule version change. Any body change forces
 * obligation review; deadline-affecting keys force recalculation.
 */
export function scopeRuleChange(oldBody: Record<string, unknown>, newBody: Record<string, unknown>): RuleChangeImpact {
  const oldKeys = new Set(Object.keys(oldBody));
  const newKeys = new Set(Object.keys(newBody));
  const changed: string[] = [];
  for (const k of new Set([...oldKeys, ...newKeys])) {
    if (JSON.stringify(oldBody[k]) !== JSON.stringify(newBody[k])) changed.push(k);
  }
  const deadlineKeys = changed.filter((k) => /deadline|due|offset|frequency|filing|period/i.test(k));
  const affectedDimensions = changed.length === 0 ? [] : ["COMPLIANCE", "TAX", "REPORTING"];
  return {
    affectedDimensions,
    requiresObligationReview: changed.length > 0,
    requiresDeadlineRecalculation: deadlineKeys.length > 0,
    requiresNotification: changed.length > 0,
    summary:
      changed.length === 0
        ? "No material change between rule versions."
        : `Rule body changed in ${changed.length} field(s) (${changed.slice(0, 5).join(", ")}${changed.length > 5 ? "…" : ""}).` +
          (deadlineKeys.length > 0 ? " Deadline-affecting fields changed: recalculation required." : " No deadline-affecting fields changed."),
  };
}
