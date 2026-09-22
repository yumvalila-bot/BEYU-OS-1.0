/**
 * BEYU OS — 5D QUANTITY / COST / RESOURCE ENGINE (shared capability, §11).
 *
 * Visualization of quantities, resources, budgets, costs, schedules and
 * financial relationships through authorized READ paths ONLY.
 *
 * ══════════════════ FINANCE BOUNDARY — CONSTITUTIONAL ══════════════════
 * This module MUST NOT and DOES NOT:
 *   • import the Finance posting engine, the waterfall engine or any journal
 *     writer (enforced by tests/viz/regression.test.ts static scan);
 *   • create authorization to post financial transactions;
 *   • write, alter or approve any financial record;
 *   • bypass Finance authorization, approval workflows, RLS or policy.
 * CAP_POSTING REMAINS LOCKED. Only authorized Finance functionality posts.
 * Ujenzi OS, Health OS and Agriculture OS never create cost journals — their
 * cost/quantity records are sector operational truth that this engine READS
 * and aggregates for display, exactly as their own dashboards do.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Values are minor-unit-safe: amounts travel as strings (the repository's
 * integer/minor-unit accounting convention) and are only formatted at the
 * presentation edge. Unknown amounts stay UNAVAILABLE — never zero.
 */
import { derived, observed, unavailable, type VizValue } from "../provenance";

/** Canonical cost/quantity kinds — aligned with the Ujenzi cost model, which
 * is the repository's existing ESTIMATE/BUDGET/COMMITTED/ACTUAL/FORECAST
 * distinction. Other sectors map into the same kinds through their adapters. */
export const QUANTITY_KINDS = ["ESTIMATE", "BUDGET", "COMMITTED", "ACTUAL", "FORECAST", "QUANTITY", "RESOURCE"] as const;
export type QuantityKind = (typeof QUANTITY_KINDS)[number];

export type QuantityPoint = {
  /** Stable object key the quantity belongs to (project, field, account…). */
  subjectKey: string;
  kind: QuantityKind;
  /** Amount as a string in the record's unit (minor units or natural units).
   * Honest null: a missing/unavailable amount is VizValue<string|null> with
   * status UNAVAILABLE — never fabricated as "0". */
  amount: VizValue<string | null>;
  currency?: string | null;
  unit?: string | null;
  at?: string | null;
  label?: string;
};

/** Sum stringified decimal amounts without floating-point drift beyond the
 * presentation edge. Non-numeric contributions mark the result UNVERIFIED. */
function sumAmounts(values: Array<{ value: string | null; status: string }>): { sum: string; status: "OBSERVED" | "UNVERIFIED" | "UNAVAILABLE" } {
  let total = 0;
  let sawValue = false;
  let degraded = false;
  for (const v of values) {
    if (v.value === null || v.value === undefined || v.value === "") {
      if (v.status !== "UNAVAILABLE") degraded = true;
      continue;
    }
    const n = Number(v.value);
    if (!Number.isFinite(n)) {
      degraded = true;
      continue;
    }
    total += n;
    sawValue = true;
  }
  if (!sawValue) return { sum: "0", status: "UNAVAILABLE" };
  // Fixed(2) mirrors NUMERIC(18,2) money columns; aggregation for DISPLAY only.
  return { sum: total.toFixed(2), status: degraded ? "UNVERIFIED" : "OBSERVED" };
}

/** Aggregate quantity points by kind (and optionally by subject). */
export function aggregateByKind(points: QuantityPoint[]): Array<{ kind: QuantityKind; total: VizValue<string | null>; currency: string | null; count: number }> {
  const byKind = new Map<QuantityKind, QuantityPoint[]>();
  for (const p of points) {
    const list = byKind.get(p.kind) ?? [];
    list.push(p);
    byKind.set(p.kind, list);
  }
  return QUANTITY_KINDS.filter((k) => byKind.has(k)).map((kind) => {
    const rows = byKind.get(kind)!;
    const { sum, status } = sumAmounts(rows.map((r) => ({ value: r.amount.value, status: r.amount.status })));
    const currencies = [...new Set(rows.map((r) => r.currency).filter((c): c is string => Boolean(c)))];
    return {
      kind,
      total: status === "UNAVAILABLE" ? unavailable() : status === "UNVERIFIED" ? { value: sum, status: "UNVERIFIED", unit: currencies[0] ?? null, observedAt: null } : observed(sum, currencies[0] ?? null),
      // Mixed currencies are never silently summed into one number.
      currency: currencies.length === 1 ? currencies[0] : currencies.length > 1 ? "MIXED" : null,
      count: rows.length,
    };
  });
}

/** Budget vs actual comparison — the classic 5D sector view. A missing side
 * is UNAVAILABLE, never zero. */
export function budgetVsActual(points: QuantityPoint[]): Array<{ subjectKey: string; budget: VizValue<string | null>; actual: VizValue<string | null>; variance: VizValue<string | null> }> {
  const subjects = [...new Set(points.map((p) => p.subjectKey))];
  return subjects.map((subjectKey) => {
    const budgetRows = points.filter((p) => p.subjectKey === subjectKey && p.kind === "BUDGET");
    const actualRows = points.filter((p) => p.subjectKey === subjectKey && p.kind === "ACTUAL");
    const b = sumAmounts(budgetRows.map((r) => ({ value: r.amount.value, status: r.amount.status })));
    const a = sumAmounts(actualRows.map((r) => ({ value: r.amount.value, status: r.amount.status })));
    const budget = b.status === "UNAVAILABLE" ? unavailable() : observed(b.sum);
    const actual = a.status === "UNAVAILABLE" ? unavailable() : observed(a.sum);
    const variance =
      b.status === "UNAVAILABLE" || a.status === "UNAVAILABLE"
        ? unavailable()
        : derived((Number(a.sum) - Number(b.sum)).toFixed(2));
    return { subjectKey, budget, actual, variance };
  });
}

/** Resource allocation view: how a resource/quantity distributes over subjects. */
export function allocationShare(points: QuantityPoint[], kind: QuantityKind): Array<{ subjectKey: string; share: VizValue<string> }> {
  const rows = points.filter((p) => p.kind === kind);
  const totals = new Map<string, number>();
  let grand = 0;
  for (const r of rows) {
    const n = Number(r.amount.value ?? NaN);
    if (!Number.isFinite(n)) continue;
    totals.set(r.subjectKey, (totals.get(r.subjectKey) ?? 0) + n);
    grand += n;
  }
  if (grand <= 0) return [];
  return [...totals.entries()].map(([subjectKey, value]) => ({
    subjectKey,
    share: derived(((value / grand) * 100).toFixed(1), "%"),
  }));
}
