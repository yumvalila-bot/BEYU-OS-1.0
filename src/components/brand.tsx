import type { ReactNode } from "react";
import { BeyuLogo } from "./beyu-logo";

/**
 * BEYU shared primitives.
 *
 * Brand mark presentation lives in <BeyuLogo /> (central registry
 * /public/brand/*) — this module never embeds the logo SVG, so there is
 * exactly one implementation of the mark in the product.
 */

const TONES: Record<string, string> = {
  gold: "bg-[#d4af37]/15 text-[#8a6d10] border-[#d4af37]/40 dark:text-[#efd98f]",
  navy: "bg-[#0b1d3a]/8 text-[#0b1d3a] border-[#0b1d3a]/20 dark:bg-white/10 dark:text-white dark:border-white/20",
  green: "bg-emerald-500/12 text-emerald-800 border-emerald-600/30 dark:text-emerald-300",
  red: "bg-rose-500/12 text-rose-800 border-rose-600/30 dark:text-rose-300",
  amber: "bg-amber-500/14 text-amber-800 border-amber-600/30 dark:text-amber-300",
  slate: "bg-slate-500/10 text-slate-700 border-slate-500/25 dark:text-slate-300",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: keyof typeof TONES | string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-[3px] text-[10.5px] font-semibold tracking-wide ${
        TONES[tone] ?? TONES.slate
      }`}
    >
      {children}
    </span>
  );
}

/** Maps canonical enum values to a consistent tone across the whole product. */
export function stateTone(value: string | null | undefined): string {
  const v = (value ?? "").toUpperCase();
  if (["ACTIVE", "APPROVED", "COMPLIANT", "ELIGIBLE", "VERIFIED", "EFFECTIVE", "PASSED", "COMMITTED", "SUCCESS", "ON_TRACK", "AUTHORITATIVE"].includes(v)) return "green";
  if (["NON_COMPLIANT", "REJECTED", "DENIED", "ESCALATED", "INELIGIBLE", "FAILED", "PROHIBITED_EVASION", "CRITICAL"].includes(v)) return "red";
  if (["UNDER_REVIEW", "REQUIRES_HUMAN_REVIEW", "PARTIALLY_COMPLIANT", "CONDITIONAL", "TABLED", "AT_RISK", "IN_REVIEW", "AGGRESSIVE_UNCERTAIN", "SUBMITTED", "SIMULATED", "DRAFT"].includes(v)) return "amber";
  if (["HIGHLY_RESTRICTED", "RESTRICTED"].includes(v)) return "gold";
  return "slate";
}

export function Panel({
  title,
  kicker,
  action,
  children,
  className = "",
}: {
  title?: string;
  kicker?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`beyu-panel overflow-hidden ${className}`}>
      {(title || kicker) && (
        <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div>
            {kicker && <div className="beyu-kicker text-[#b08d1c]">{kicker}</div>}
            {title && <h2 className="mt-1 text-[15px] font-semibold tracking-tight">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}

export function Metric({
  label,
  value,
  sub,
  tone = "navy",
}: {
  label: ReactNode;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="beyu-panel px-4 py-4">
      <div className="beyu-kicker beyu-muted">{label}</div>
      <div className={`mt-2 text-[22px] font-semibold tracking-tight ${tone === "gold" ? "text-[#a8830f] dark:text-[#efd98f]" : ""}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11.5px] beyu-muted">{sub}</div>}
    </div>
  );
}

/**
 * Branded loading state — the BEYU mark on a calm pulse.
 * Reduced-motion users get a static mark (motion-safe guard).
 */
export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="beyu-panel flex flex-col items-center px-6 py-10 text-center">
      <BeyuLogo variant="mark" size={40} ariaLabel="BEYU" className="motion-safe:animate-beyu-pulse" />
      <div className="mt-4 beyu-kicker beyu-muted">{label}</div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function Denied({ reason, capability }: { reason: string; capability: string }) {
  return (
    <div className="beyu-panel mx-auto max-w-2xl px-6 py-8">
      <div className="flex items-center gap-3">
        <BeyuLogo variant="mark" size={30} ariaLabel="BEYU" />
        <div className="beyu-kicker text-[#b08d1c]">Access decision recorded</div>
      </div>
      <h1 className="mt-3 text-[20px] font-semibold tracking-tight">Authorisation denied</h1>
      <p className="mt-3 text-[13px] beyu-muted">{reason}</p>
      <div className="mt-4 rounded-lg border border-[color:var(--beyu-line)] px-4 py-3 text-[12px]">
        <div className="beyu-kicker beyu-muted">Required capability</div>
        <div className="mt-1 font-mono text-[12px]">{capability}</div>
      </div>
      <p className="mt-4 text-[11.5px] beyu-muted">
        BEYU OS enforces least privilege. Request a governed grant through Identity &amp; Access; the
        denial has been written to the immutable audit ledger.
      </p>
    </div>
  );
}

export function EmptyState({ message, mark = true }: { message: string; mark?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-lg border border-dashed border-[color:var(--beyu-line)] px-4 py-6 text-center text-[12.5px] beyu-muted">
      {mark && <BeyuLogo variant="mark" size={22} ariaLabel="BEYU" decorative className="opacity-60" />}
      <span>{message}</span>
    </div>
  );
}

export function money(value: number | string | null | undefined, currency = "USD", digits = 0) {
  const n = Number(value ?? 0);
  return `${currency} ${n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}
