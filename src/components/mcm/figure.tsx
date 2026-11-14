import type { ReactNode } from "react";
import { Badge } from "@/components/brand";
import {
  MCM_DATA_STATE_LABEL,
  MCM_DATA_STATE_MEANING,
  type McmDataState,
  type McmFigure,
} from "@/lib/mcm/model";

/**
 * Presentation of an MCM figure.
 *
 * THE RULE THIS COMPONENT EXISTS TO ENFORCE: an unavailable or restricted figure
 * is rendered as an explicit state with a reason, never as a zero, a dash or an
 * empty cell. A dashboard where "no data" and "zero" look the same is a dashboard
 * that lies.
 *
 * The amount, its currency, its period, its source and its data state are always
 * shown together, because a number without those four facts is not a figure.
 */

const STATE_TONE: Record<McmDataState, string> = {
  ACTUAL: "green",
  CONSOLIDATED: "green",
  ESTIMATED: "amber",
  FORECAST: "amber",
  PENDING: "slate",
  RESTRICTED: "red",
  UNAVAILABLE: "slate",
};

/** Format integer minor units for display without losing the currency. */
export function formatMinor(amountMinor: string | null, currency: string | null): string {
  if (amountMinor === null) return "—";
  const negative = amountMinor.startsWith("-");
  const digits = (negative ? amountMinor.slice(1) : amountMinor).padStart(3, "0");
  const whole = digits.slice(0, -2);
  const cents = digits.slice(-2);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${currency ?? ""} ${grouped}.${cents}`.trim();
}

export function DataStateBadge({ state }: { state: McmDataState }) {
  return (
    <span title={MCM_DATA_STATE_MEANING[state]} className="inline-flex">
      <Badge tone={STATE_TONE[state]}>{MCM_DATA_STATE_LABEL[state]}</Badge>
    </span>
  );
}

/**
 * A single governed figure.
 *
 * `compact` is used inside tables, where consecutive provenance lines would make
 * the row unreadable; the tooltip and the footer line still carry the facts.
 */
export function Figure({
  figure,
  label,
  compact = false,
}: {
  figure: McmFigure;
  label?: string;
  compact?: boolean;
}) {
  const isAbsent = figure.amountMinor === null || figure.dataState === "UNAVAILABLE" || figure.dataState === "RESTRICTED";
  return (
    <div className="min-w-0">
      {label && <div className="beyu-kicker beyu-muted">{label}</div>}
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <span
          className={`font-mono text-[13px] tabular-nums ${isAbsent ? "beyu-muted italic" : "font-semibold"}`}
          title={figure.reason ?? MCM_DATA_STATE_MEANING[figure.dataState]}
        >
          {isAbsent ? MCM_DATA_STATE_LABEL[figure.dataState] : formatMinor(figure.amountMinor, figure.currency)}
        </span>
        <DataStateBadge state={figure.dataState} />
      </div>
      {!compact && (
        <div className="mt-1 text-[11px] beyu-muted">
          {figure.currency ?? "no currency"} · {figure.period ?? "no period"} · {figure.source}
        </div>
      )}
      {!compact && figure.reason && <div className="mt-0.5 text-[11px] beyu-muted">{figure.reason}</div>}
    </div>
  );
}

/** A small, non-alarming empty state that names the reason rather than hiding it. */
export function McmEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-[color:var(--beyu-line)] px-4 py-5 text-center text-[12.5px] beyu-muted">
      {children}
    </div>
  );
}

/** A neutral note used to state what this surface deliberately does NOT do. */
export function BoundaryNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[color:var(--beyu-line)] bg-[color:var(--beyu-line)]/25 px-4 py-3">
      <div className="beyu-kicker text-[#b08d1c]">{title}</div>
      <div className="mt-1 text-[12px] leading-relaxed beyu-muted">{children}</div>
    </div>
  );
}
