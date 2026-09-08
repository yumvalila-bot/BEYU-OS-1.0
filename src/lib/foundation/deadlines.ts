/**
 * BEYU Foundation OS — deadline calculation engine (pure, deterministic).
 *
 * All computation is UTC calendar-date based. Business-day arithmetic skips
 * Saturday/Sunday plus an explicit caller-supplied holiday list (ISO dates).
 * The engine never invents holidays: a jurisdiction with no holiday calendar
 * supplied is computed on calendar days and flagged as APPROXIMATE.
 */

export type DeadlineBasis =
  | "CALENDAR_DAYS"
  | "BUSINESS_DAYS"
  | "MONTHS"
  | "YEARS"
  | "FISCAL_YEAR_END"
  | "FIXED_DATE";

export type DeadlineRule = {
  basis: DeadlineBasis;
  /** Offset applied to the trigger date (days, or months/years per basis). */
  offset?: number;
  /** Fixed month/day (MM-DD) for FIXED_DATE basis. */
  fixedMonthDay?: string;
  /** IANA timezone label for display; computation stays UTC. */
  timezone?: string;
};

export type DeadlineComputation =
  | { ok: true; dueDate: string; approximate: boolean; explanation: string }
  | { ok: false; reason: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysUtc(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return toIsoDate(dt);
}

export function addMonthsUtc(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  // Clamp end-of-month overflow (Jan 31 + 1 month → Feb 28/29, not Mar 2/3).
  const expectedMonth = (((m - 1 + months) % 12) + 12) % 12;
  while (dt.getUTCMonth() !== expectedMonth) dt.setUTCDate(dt.getUTCDate() - 1);
  return toIsoDate(dt);
}

function isWeekendUtc(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

export function addBusinessDaysUtc(iso: string, days: number, holidays: string[]): string {
  if (!Number.isInteger(days) || days < 0) throw new Error("business-day offset must be a non-negative integer");
  const holidaySet = new Set(holidays);
  let current = iso;
  let remaining = days;
  let guard = 0;
  while (remaining > 0) {
    guard += 1;
    if (guard > 3660) throw new Error("business-day computation exceeded safety bound");
    current = addDaysUtc(current, 1);
    if (!isWeekendUtc(current) && !holidaySet.has(current)) remaining -= 1;
  }
  return current;
}

/**
 * Whole days from `from` until `to` (positive = future, negative = overdue).
 */
export function daysBetweenUtc(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}

export function computeDueDate(
  triggerIso: string,
  rule: DeadlineRule,
  holidays: string[] = [],
): DeadlineComputation {
  if (!isIsoDate(triggerIso)) return { ok: false, reason: `Invalid trigger date ${triggerIso}; expected YYYY-MM-DD` };
  for (const h of holidays) {
    if (!isIsoDate(h)) return { ok: false, reason: `Invalid holiday date ${h}; expected YYYY-MM-DD` };
  }
  const offset = rule.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0) {
    return { ok: false, reason: `Invalid offset ${rule.offset}; expected a non-negative integer` };
  }
  switch (rule.basis) {
    case "CALENDAR_DAYS":
      return {
        ok: true,
        dueDate: addDaysUtc(triggerIso, offset),
        approximate: false,
        explanation: `${offset} calendar days after ${triggerIso}`,
      };
    case "BUSINESS_DAYS":
      return {
        ok: true,
        dueDate: addBusinessDaysUtc(triggerIso, offset, holidays),
        approximate: holidays.length === 0,
        explanation:
          holidays.length === 0
            ? `${offset} business days after ${triggerIso} (weekends only; no holiday calendar supplied — APPROXIMATE)`
            : `${offset} business days after ${triggerIso} excluding ${holidays.length} supplied holiday(s)`,
      };
    case "MONTHS":
      return {
        ok: true,
        dueDate: addMonthsUtc(triggerIso, offset),
        approximate: false,
        explanation: `${offset} calendar months after ${triggerIso}`,
      };
    case "YEARS":
      return {
        ok: true,
        dueDate: addMonthsUtc(triggerIso, offset * 12),
        approximate: false,
        explanation: `${offset} calendar years after ${triggerIso}`,
      };
    case "FISCAL_YEAR_END": {
      // Fiscal year end supplied as trigger; the rule offset counts months after it.
      return {
        ok: true,
        dueDate: addMonthsUtc(triggerIso, offset),
        approximate: false,
        explanation: `${offset} months after fiscal year end ${triggerIso}`,
      };
    }
    case "FIXED_DATE": {
      if (!rule.fixedMonthDay || !/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(rule.fixedMonthDay)) {
        return { ok: false, reason: "FIXED_DATE basis requires fixedMonthDay as MM-DD" };
      }
      const year = Number(triggerIso.slice(0, 4));
      const candidate = `${year}-${rule.fixedMonthDay}`;
      const due = candidate >= triggerIso ? candidate : `${year + 1}-${rule.fixedMonthDay}`;
      if (!isIsoDate(due)) return { ok: false, reason: `Fixed date ${due} is not a real calendar date` };
      return { ok: true, dueDate: due, approximate: false, explanation: `Next occurrence of ${rule.fixedMonthDay} on/after ${triggerIso}` };
    }
    default:
      return { ok: false, reason: `Unknown deadline basis ${(rule as DeadlineRule).basis}` };
  }
}

export type DeadlineHealth = "COMPLETED" | "OVERDUE" | "DUE_TODAY" | "AT_RISK" | "ON_TRACK";

/**
 * Health of an open deadline relative to `todayIso`.
 * AT_RISK = due within the warning window (default 14 days).
 */
export function deadlineHealth(dueIso: string, todayIso: string, warningDays = 14): DeadlineHealth {
  const remaining = daysBetweenUtc(todayIso, dueIso);
  if (remaining < 0) return "OVERDUE";
  if (remaining === 0) return "DUE_TODAY";
  if (remaining <= warningDays) return "AT_RISK";
  return "ON_TRACK";
}
