import { NOELIA_ASSETS } from "./brand-assets";

/**
 * Noelia AI — identity + state system.
 *
 * <NoeliaAvatar /> presents the ONE canonical Noelia face (from the central
 * registry) at every size and state. The face is never re-drawn per state —
 * only a small status indicator (dot / badge) changes. That is what keeps her
 * the same recognizable identity on every screen.
 *
 * Identity cues (fixed in /noelia/noelia-avatar.svg):
 *   · calm attentive gaze, warm composed smile
 *   · espresso hair, centre part, low bun
 *   · BEYU-navy blazer, ivory field, gold ring — quiet BEYU lineage
 *
 * Governance note: this is presentation only. Whether a principal may see or
 * query Noelia is decided by the existing ai:noelia.query guard and HIVE
 * policy checks — nothing in this component grants or alters authority.
 */

export type NoeliaAvatarState =
  | "idle"
  | "thinking"
  | "processing"
  | "speaking"
  | "success"
  | "warning"
  | "error"
  | "offline";

export type NoeliaAvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "hero";

/** Rendered diameter in px. xs/sm use the identity MARK (recognizable, never distorted). */
export const NOELIA_SIZE_PX: Record<NoeliaAvatarSize, number> = {
  xs: 20,
  sm: 32,
  md: 48,
  lg: 72,
  xl: 112,
  hero: 168,
};

/** Sizes at which the mark (not the portrait) is presented. */
const MARK_SIZES: readonly NoeliaAvatarSize[] = ["xs", "sm"];

/**
 * State → visual language. Colors follow the BEYU palette (sage / gold /
 * semantic) so the indicator never feels like a separate design system.
 */
export const NOELIA_STATE_META: Record<
  NoeliaAvatarState,
  {
    label: string;
    description: string;
    dotClass: string;
    /** motion-safe guarded Tailwind animation (reduced-motion → static). */
    animationClass?: string;
    badge?: "check" | "alert" | "cross";
  }
> = {
  idle: {
    label: "Idle",
    description: "Noelia AI is available",
    dotClass: "bg-[#4c6f4e]",
  },
  thinking: {
    label: "Thinking",
    description: "Noelia AI is reasoning",
    dotClass: "bg-[#d4af37]",
    animationClass: "motion-safe:animate-noelia-think",
  },
  processing: {
    label: "Processing",
    description: "Noelia AI is working",
    dotClass: "bg-[#d4af37]",
    animationClass: "motion-safe:animate-noelia-process",
  },
  speaking: {
    label: "Speaking",
    description: "Noelia AI is responding",
    dotClass: "bg-sky-500",
    animationClass: "motion-safe:animate-noelia-speak",
  },
  success: {
    label: "Success",
    description: "Noelia AI completed successfully",
    dotClass: "bg-emerald-600",
    badge: "check",
  },
  warning: {
    label: "Warning",
    description: "Noelia AI requires attention",
    dotClass: "bg-amber-500",
    badge: "alert",
  },
  error: {
    label: "Error",
    description: "Noelia AI encountered an error",
    dotClass: "bg-rose-600",
    badge: "cross",
  },
  offline: {
    label: "Offline",
    description: "Noelia AI is offline",
    dotClass: "bg-slate-400",
  },
};

const BADGE_GLYPH: Record<"check" | "alert" | "cross", string> = {
  check: "✓",
  alert: "!",
  cross: "✕",
};

export interface NoeliaAvatarProps {
  size?: NoeliaAvatarSize;
  state?: NoeliaAvatarState;
  /** Hide the status dot entirely. */
  showIndicator?: boolean;
  /** Decorative: alt="" and no state announcement (e.g. beside a visible label). */
  decorative?: boolean;
  /** Accessible name for the portrait. Defaults to "Noelia AI". */
  ariaLabel?: string;
  className?: string;
}

export function NoeliaAvatar({
  size = "md",
  state = "idle",
  showIndicator = true,
  decorative = false,
  ariaLabel,
  className = "",
}: NoeliaAvatarProps) {
  const px = NOELIA_SIZE_PX[size];
  const useMark = MARK_SIZES.includes(size);
  const src = useMark ? NOELIA_ASSETS.icon : NOELIA_ASSETS.avatar;
  const meta = NOELIA_STATE_META[state];
  const dotSize = Math.max(9, Math.round(px * 0.24));

  // Plain <img> on purpose: fixed-dimension identity assets from the central
  // registry — no optimization pipeline needed, assets replaceable in place.
  const portrait = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={decorative ? "" : (ariaLabel ?? "Noelia AI")}
      width={px}
      height={px}
      style={{ width: px, height: px }}
      className={`rounded-full object-cover ${state === "offline" ? "opacity-60 saturate-[0.55]" : ""}`}
      draggable={false}
    />
  );

  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: px, height: px }}>
      {portrait}
      {showIndicator && (
        <span
          role={decorative ? undefined : "status"}
          className={`absolute bottom-0 right-0 flex items-center justify-center rounded-full border-2 border-[color:var(--beyu-card)] ${meta.dotClass} ${meta.animationClass ?? ""}`.trim()}
          style={{ width: dotSize, height: dotSize }}
        >
          {meta.badge && (
            <span aria-hidden="true" className="text-[0.6em] font-bold leading-none text-white">
              {BADGE_GLYPH[meta.badge]}
            </span>
          )}
          {/* live-region text: state changes are announced to assistive tech */}
          <span className="sr-only">{meta.description}</span>
        </span>
      )}
    </span>
  );
}

/**
 * Compact status line: state dot + kicker label.
 * For headers where the avatar sits beside text (Noelia console, panels).
 */
export function NoeliaStatus({
  state = "idle",
  className = "",
}: {
  state?: NoeliaAvatarState;
  className?: string;
}) {
  const meta = NOELIA_STATE_META[state];
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        role="status"
        className={`h-2 w-2 rounded-full ${meta.dotClass} ${meta.animationClass ?? ""}`.trim()}
      >
        <span className="sr-only">{meta.description}</span>
      </span>
      <span className="beyu-kicker">{meta.label}</span>
    </span>
  );
}
