import Link from "next/link";
import { BeyuLogo } from "./beyu-logo";
import { NoeliaAvatar, NoeliaStatus, type NoeliaAvatarState } from "./noelia-avatar";

/**
 * <NoeliaPanel /> — Noelia AI identity presentation.
 *
 * Visually encodes the brand hierarchy:
 *
 *   BEYU (institution) → BEYU OS (operating & governance environment)
 *   → HIVE (governed AI runtime) → NOELIA (unified governed AI identity)
 *
 * The BEYU mark anchors the top-left (institution), "NOELIA AI" is labelled
 * as a governed assistant of the HIVE runtime (top-right), and the footer
 * states the accountability boundary in plain language. Noelia is presented
 * as BEYU's governed AI INTERFACE — never as constitutional or governance
 * authority, and never visually above BEYU.
 *
 * The CTA is a plain link: whether the principal may actually query Noelia is
 * decided by the ai:noelia.query guard on /os/noelia (and by HIVE policy on
 * every request). This component grants nothing.
 */

export interface NoeliaPanelProps {
  /** Avatar state (idle by default). */
  state?: NoeliaAvatarState;
  /** CTA destination. Default /os/noelia (gated by requireAccess). */
  href?: string;
  greeting?: string;
  capabilities?: string[];
  ctaLabel?: string;
  className?: string;
}

export function NoeliaPanel({
  state = "idle",
  href = "/os/noelia",
  greeting = "How can I assist you?",
  capabilities = ["Governance", "Finance", "Operations"],
  ctaLabel = "Ask Noelia",
  className = "",
}: NoeliaPanelProps) {
  return (
    <section
      aria-label="Noelia AI — BEYU's governed assistant"
      className={`beyu-panel overflow-hidden ${className}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--beyu-line)] px-5 py-3">
        {/* BEYU anchors the identity: institution first */}
        <div className="flex items-center gap-2.5">
          <BeyuLogo variant="mark" size={26} ariaLabel="BEYU" />
          <div className="leading-none">
            <div className="text-[12px] font-semibold tracking-[0.3em]">BEYU OS</div>
            <div className="beyu-kicker mt-1.5 beyu-muted">HIVE · governed AI runtime</div>
          </div>
        </div>
        {/* Noelia is labelled as the governed interface, subordinate in hierarchy */}
        <div className="flex items-center gap-2.5">
          <span
            title="Noelia operates within your authorization. She is an interface, not an authority."
            className="inline-flex items-center gap-1.5 rounded-full border border-[#d4af37]/45 bg-[#d4af37]/10 px-2.5 py-[3px] text-[10px] font-semibold tracking-wide text-[#8a6d10] dark:text-[#efd98f]"
          >
            <ShieldIcon />
            Governed assistant
          </span>
          <NoeliaStatus state={state} className="beyu-muted" />
        </div>
      </header>

      <div className="flex flex-col items-center px-6 py-8 text-center">
        <NoeliaAvatar size="lg" state={state} />
        <h2 className="mt-4 text-[19px] font-semibold tracking-tight">Noelia AI</h2>
        <p className="mt-1 text-[13px] beyu-muted">{greeting}</p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
          {capabilities.map((c) => (
            <span
              key={c}
              className="rounded-md border border-[color:var(--beyu-line)] px-2.5 py-1 text-[10.5px] tracking-wide beyu-muted"
            >
              {c}
            </span>
          ))}
        </div>

        <Link
          href={href}
          className="mt-5 rounded-lg bg-[#d4af37] px-5 py-2.5 text-[12.5px] font-semibold text-[#0b1d3a] transition hover:bg-[#e2c25f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37]"
        >
          {ctaLabel}
        </Link>

        <p className="mt-4 max-w-md text-[10.5px] leading-relaxed beyu-muted">
          Noelia inherits your identity, roles, tenant and clearance — and can never exceed them.
          Advisory only: material decisions require human accountability.
        </p>
      </div>
    </section>
  );
}

/** Small governance indicator (shield + check). An icon, not a brand mark. */
function ShieldIcon() {
  return (
    <svg width="11" height="12" viewBox="0 0 11 12" fill="none" aria-hidden="true">
      <path
        d="M5.5 0.8 10 2.6v3.1c0 3-1.9 5.2-4.5 6C2.9 10.9 1 8.7 1 5.7V2.6L5.5 0.8Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="m3.4 5.6 1.5 1.5 2.7-2.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
