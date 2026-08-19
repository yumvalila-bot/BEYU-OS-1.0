import type { ReactNode } from "react";

/** Canonical BEYU mark: gold ring, navy serif "B", sage family tree. */
export function BeyuMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="BEYU" role="img">
      <circle cx="50" cy="50" r="44" fill="none" stroke="#d4af37" strokeWidth="2.4" />
      <path
        d="M38 22h20c9.4 0 15.5 5.2 15.5 13.1 0 5.4-2.9 9.6-7.6 11.6 6 1.7 9.8 6.4 9.8 12.8 0 9.1-6.9 14.9-17.6 14.9H38z"
        fill="#0b1d3a"
      />
      <path d="M33 78V30" stroke="#0b1d3a" strokeWidth="5.5" strokeLinecap="round" />
      <g fill="#4c6f4e">
        <ellipse cx="24" cy="41" rx="6.2" ry="4" transform="rotate(-28 24 41)" />
        <ellipse cx="27" cy="52" rx="6" ry="3.8" transform="rotate(18 27 52)" />
        <ellipse cx="42" cy="38" rx="6" ry="3.8" transform="rotate(28 42 38)" />
        <ellipse cx="44" cy="50" rx="5.6" ry="3.6" transform="rotate(-14 44 50)" />
        <ellipse cx="34" cy="33" rx="5.4" ry="3.4" transform="rotate(-6 34 33)" />
      </g>
      <path d="M33 60c-4-6-7-9-11-11M33 48c3.5-5 6.5-8 10-10" stroke="#0b1d3a" strokeWidth="1.6" fill="none" />
    </svg>
  );
}

export function BeyuWordmark({ tagline = "CONTROL PLANE" }: { tagline?: string }) {
  return (
    <div className="flex items-center gap-3">
      <BeyuMark size={38} />
      <div className="leading-none">
        <div className="text-[19px] font-semibold tracking-[0.32em] text-white">BEYU OS</div>
        <div className="mt-1 text-[9px] font-medium tracking-[0.34em] text-[#d4af37]">{tagline}</div>
      </div>
    </div>
  );
}

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
  label: string;
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

export function Denied({ reason, capability }: { reason: string; capability: string }) {
  return (
    <div className="beyu-panel mx-auto max-w-2xl px-6 py-8">
      <div className="beyu-kicker text-[#b08d1c]">Access decision recorded</div>
      <h1 className="mt-2 text-[20px] font-semibold tracking-tight">Authorisation denied</h1>
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

export function EmptyState({ message }: { message: string }) {
  return <div className="rounded-lg border border-dashed border-[color:var(--beyu-line)] px-4 py-6 text-center text-[12.5px] beyu-muted">{message}</div>;
}

export function money(value: number | string | null | undefined, currency = "USD", digits = 0) {
  const n = Number(value ?? 0);
  return `${currency} ${n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}
