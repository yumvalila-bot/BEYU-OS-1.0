/**
 * BEYU Foundation OS — timely notification scheduling (pure, deterministic).
 *
 * For every open deadline the engine derives which reminder offsets are DUE
 * as of today. Delivery itself is recorded in `foundation_notification_log`
 * with a stable idempotency key so a retry can never double-notify.
 */
import { daysBetweenUtc } from "./deadlines";
import { DEFAULT_REMINDER_SCHEDULE, type NotificationChannel } from "./types";

export type DueReminder = {
  offsetDays: number;
  /** 0 for the due-date reminder itself; negative once overdue. */
  daysRemaining: number;
  overdue: boolean;
  escalation: boolean;
};

/**
 * Which reminders for a deadline (due `dueIso`) must exist no later than
 * `todayIso`. Offsets count down: an offset is due once daysRemaining <=
 * offset. Overdue deadlines additionally demand an OVERDUE + ESCALATION
 * signal every sweep until resolved.
 */
export function dueReminders(
  dueIso: string,
  todayIso: string,
  schedule: readonly number[] = DEFAULT_REMINDER_SCHEDULE,
): DueReminder[] {
  const daysRemaining = daysBetweenUtc(todayIso, dueIso);
  const due: DueReminder[] = [];
  const ordered = [...schedule].sort((a, b) => b - a);
  for (const offset of ordered) {
    if (daysRemaining <= offset) {
      due.push({ offsetDays: offset, daysRemaining, overdue: daysRemaining < 0, escalation: false });
    }
  }
  if (daysRemaining < 0) {
    due.push({ offsetDays: -1, daysRemaining, overdue: true, escalation: true });
  }
  return due;
}

/**
 * Stable scheduling key. The uniqueness constraint
 * (tenant_id, idempotency_key) makes double-scheduling a structural
 * impossibility, and the key's human-readable shape keeps operations legible.
 */
export function reminderKey(deadlineId: string, offsetDays: number, channel: NotificationChannel): string {
  return `FNDL:${deadlineId}:${offsetDays}:${channel}`;
}

export function escalationKey(deadlineId: string, level: number, channel: NotificationChannel): string {
  return `FNESC:${deadlineId}:L${level}:${channel}`;
}

export type NotificationContent = {
  subject: string;
  body: string;
  linkHref: string;
};

export function reminderContent(input: {
  foundationName: string;
  obligationTitle: string;
  authority: string;
  jurisdiction: string;
  dueDate: string;
  daysRemaining: number;
  ownerRole: string;
  evidenceRequired: boolean;
  riskRating: string;
  deadlineId: string;
}): NotificationContent {
  const when =
    input.daysRemaining < 0
      ? `OVERDUE by ${Math.abs(input.daysRemaining)} day(s)`
      : input.daysRemaining === 0
        ? "due TODAY"
        : `due in ${input.daysRemaining} day(s)`;
  return {
    subject: `[Foundation Compliance] ${input.obligationTitle} — ${when}`,
    body: [
      `Foundation: ${input.foundationName}`,
      `Obligation: ${input.obligationTitle}`,
      `Authority: ${input.authority} (${input.jurisdiction})`,
      `Deadline: ${input.dueDate} — ${when}`,
      `Owner: ${input.ownerRole}`,
      `Risk: ${input.riskRating}`,
      `Evidence required: ${input.evidenceRequired ? "YES — completion without evidence is blocked" : "no"}`,
      `Next action: open the compliance task, submit evidence, and request verification.`,
    ].join("\n"),
    linkHref: `/os/foundation/compliance?deadline=${input.deadlineId}`,
  };
}
