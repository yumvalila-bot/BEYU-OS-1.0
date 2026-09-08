/**
 * BEYU Foundation OS — compliance escalation policy (pure, deterministic).
 *
 * RESPONSIBLE OFFICER → SUPERVISOR → COMPLIANCE OFFICER → EXECUTIVE →
 * BOARD / COMMITTEE → AUTHORIZED GOVERNANCE AUTHORITY.
 *
 * Escalation is a function of (days overdue, risk rating, repeat offence).
 * It never skips levels and never de-escalates automatically.
 */
import { ESCALATION_LADDER } from "./types";

export type RiskRating = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const ESCALATION_THRESHOLDS: Record<RiskRating, { overdueDays: number; minLevel: number }> = {
  LOW: { overdueDays: 7, minLevel: 0 },
  MEDIUM: { overdueDays: 3, minLevel: 1 },
  HIGH: { overdueDays: 1, minLevel: 2 },
  CRITICAL: { overdueDays: 0, minLevel: 3 },
};

export type EscalationVerdict =
  | { escalate: false; reason: string }
  | { escalate: true; level: number; fromRole: string; toRole: string; reason: string };

/**
 * @param daysOverdue 0 when due today / upcoming; positive when overdue.
 * @param currentLevel highest escalation level already raised (-1 = none).
 */
export function evaluateEscalation(input: {
  daysOverdue: number;
  risk: RiskRating;
  currentLevel: number;
  repeatOffence: boolean;
}): EscalationVerdict {
  const { daysOverdue, risk, currentLevel, repeatOffence } = input;
  const policy = ESCALATION_THRESHOLDS[risk] ?? ESCALATION_THRESHOLDS.MEDIUM;
  if (daysOverdue < 0) return { escalate: false, reason: "Deadline is still in the future; no escalation" };
  const overdueTrigger = repeatOffence ? 0 : policy.overdueDays;
  if (daysOverdue < overdueTrigger) {
    return { escalate: false, reason: `Overdue ${daysOverdue}d below the ${overdueTrigger}d threshold for ${risk} risk` };
  }
  // Target level rises with lateness: +1 level per threshold multiple, capped.
  const latenessSteps = overdueTrigger === 0 ? 1 : Math.floor(daysOverdue / Math.max(1, overdueTrigger));
  const targetLevel = Math.min(ESCALATION_LADDER.length - 1, policy.minLevel + Math.max(0, latenessSteps - 1) + (repeatOffence ? 1 : 0));
  if (targetLevel <= currentLevel) {
    return { escalate: false, reason: `Already escalated to level ${currentLevel}; target level ${targetLevel} reached` };
  }
  const nextLevel = currentLevel + 1;
  const fromRole = currentLevel < 0 ? "RESPONSIBLE_OFFICER" : ESCALATION_LADDER[currentLevel];
  const toRole = ESCALATION_LADDER[nextLevel];
  return {
    escalate: true,
    level: nextLevel,
    fromRole,
    toRole,
    reason: `Overdue ${daysOverdue}d at ${risk} risk → escalate to ${toRole} (level ${nextLevel})`,
  };
}

export function ladderRole(level: number): string {
  if (level < 0 || level >= ESCALATION_LADDER.length) throw new Error(`Escalation level ${level} is outside the ladder`);
  return ESCALATION_LADDER[level];
}
