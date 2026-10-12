/**
 * BEYU LOGIN SURFACE — the ONE presentation layer of the canonical sign-in.
 *
 * WHAT THIS FILE IS
 *   Presentation ONLY. It renders the BEYU brand composition taken from the
 *   authoritative reference (`BEYU LOGIN PAGE .png`, repository root): the
 *   emblem + wordmark, the brand descriptor, the mission statement, the navy
 *   motto banner, the five canonical brand pillars, the white sign-in card
 *   shell, the hospital-campus band, the six-capability feature strip and the
 *   navy footer.
 *
 * WHAT THIS FILE IS NOT
 *   It resolves NO identity, NO session, NO hostname and NO authorization. It
 *   reads no credential, sets no cookie, and posts nothing. The form that DOES
 *   authenticate is the single shared `SignInForm`
 *   (`src/app/sign-in-form.tsx`, posting to the single `/api/v1/auth/login`).
 *   Neither `src/app/page.tsx` (control plane) nor
 *   `src/app/governed-sign-in.tsx` (canonical destinations) may grow a second
 *   form: they compose this layer around the SAME form component.
 *
 * CANONICAL IDENTITY, NEVER A REDRAW
 *   The emblem is the authoritative BEYU OS mark (`BeyuOsLogo` →
 *   `/brand/beyu-os-logo.png`, byte-exact, never recoloured, cropped or
 *   re-encoded) presented on a white plate because the source carries a white
 *   studio matte. The remaining artwork here is decorative background
 *   illustration (aria-hidden, no accessible name, no authority): the medical
 *   motif field, the luminous network, the campus skyline and the capability
 *   glyphs. No new logo, no second brand, no substitute symbol is introduced.
 *
 * PALETTE
 *   Institutional NAVY `#0B1F4D` and GOLD `#D4A017` (already declared as
 *   `--beyu-institutional-navy` / `--beyu-institutional-gold` in globals.css).
 *   Gold is used for graphics, rules and on-navy text (6.7:1 against navy).
 *   Where gold must carry SMALL TEXT ON A LIGHT SURFACE the accessible
 *   `--beyu-gold-ink` (#8A6A12, 4.6:1 on the page background) is used instead,
 *   because #D4A017 on a light surface is only 2.2:1 — the one deviation, and
 *   it is a contrast correction, not a palette change.
 */
import type { ReactNode } from "react";
import { BeyuOsLogo } from "@/components/beyu-os-logo";

/* -------------------------------------------------------------------------- */
/* Canonical copy — the five pillars and the six capabilities, exactly as the  */
/* reference renders them. Text, not configuration: nothing here is a guard.   */
/* -------------------------------------------------------------------------- */

export const BEYU_LOGIN_PILLARS = [
  { key: "trust", title: "Trust", copy: "The foundation of everything we do." },
  { key: "care", title: "Care", copy: "Compassion across communities." },
  { key: "integrity", title: "Integrity", copy: "Honesty and transparency in all actions." },
  { key: "innovation", title: "Innovation", copy: "Technology for a healthier tomorrow." },
  { key: "impact", title: "Impact", copy: "Shaping a healthier environment." },
] as const;

export type PillarKey = (typeof BEYU_LOGIN_PILLARS)[number]["key"];

/** The capability strip, split into the reference's two display lines. */
export const BEYU_LOGIN_FEATURES = [
  { key: "secure", lines: ["Secure", "& Trusted"] },
  { key: "patient", lines: ["Patient", "Centered"] },
  { key: "ai", lines: ["AI Powered", "Insights"] },
  { key: "cloud", lines: ["Cloud", "Native"] },
  { key: "connected", lines: ["Connected", "Ecosystem"] },
  { key: "outcomes", lines: ["Better", "Outcomes"] },
] as const;

export type FeatureKey = (typeof BEYU_LOGIN_FEATURES)[number]["key"];

/* -------------------------------------------------------------------------- */
/* Glyphs (decorative, currentColor, no accessible name)                       */
/* -------------------------------------------------------------------------- */

const glyphProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: "false" as const,
};

const PILLAR_GLYPHS: Record<PillarKey, ReactNode> = {
  /* Trust — shield with a check. */
  trust: (
    <>
      <path d="M12 2.6 4.9 5.3v5.9c0 4.3 2.9 8 7.1 9.3 4.2-1.3 7.1-5 7.1-9.3V5.3L12 2.6Z" />
      <path d="m8.9 12.1 2.2 2.2 4-4.5" />
    </>
  ),
  /* Care — a heart held in open hands. */
  care: (
    <>
      <path d="M12 8.4c1-1.7 3.4-1.6 4.2.2.7 1.5-.4 3-1.9 4.2L12 14.9l-2.3-2.1c-1.5-1.2-2.6-2.7-1.9-4.2.8-1.8 3.2-1.9 4.2-.2Z" />
      <path d="M2.6 14.9c1.9-1.5 3.5-1.1 5.4.4" />
      <path d="M21.4 14.9c-1.9-1.5-3.5-1.1-5.4.4" />
      <path d="M4.6 19.6h14.8" />
    </>
  ),
  /* Integrity — the scales. */
  integrity: (
    <>
      <path d="M12 3.4v16.9M8.4 20.6h7.2M6.4 7.2h11.2" />
      <path d="M4.4 13.1h4.8a2.4 2.4 0 0 1-4.8 0ZM14.8 13.1h4.8a2.4 2.4 0 0 1-4.8 0Z" />
    </>
  ),
  /* Innovation — a lamp of ideas. */
  innovation: (
    <>
      <path d="M12 4.4a5.5 5.5 0 0 0-3.2 9.9v2.3h6.4v-2.3A5.5 5.5 0 0 0 12 4.4Z" />
      <path d="M9.8 19.1h4.4M12 1.6v1.2M4.4 5.2l1 1M19.6 5.2l-1 1" />
    </>
  ),
  /* Impact — the world. */
  impact: (
    <>
      <circle cx="12" cy="12" r="7.4" />
      <path d="M12 4.6c2.5 1.6 3.7 4.4 3.7 7.4S14.5 17.8 12 19.4c-2.5-1.6-3.7-4.4-3.7-7.4S9.5 6.2 12 4.6ZM4.9 10.4h14.2M4.9 13.9h14.2" />
    </>
  ),
};

const FEATURE_GLYPHS: Record<FeatureKey, ReactNode> = {
  secure: (
    <>
      <path d="M12 2.7 5.2 5.4v5.5c0 4.2 2.8 7.8 6.8 9 4-1.2 6.8-4.8 6.8-9V5.4L12 2.7Z" />
      <path d="M12 9.4a1.7 1.7 0 0 1 1 3.1v2.1h-2v-2.1a1.7 1.7 0 0 1 1-3.1Z" />
    </>
  ),
  patient: (
    <>
      <circle cx="8.8" cy="8.4" r="2.5" />
      <path d="M3.8 19.6c0-2.8 2.2-5.1 5-5.1s5 2.3 5 5.1M17.6 12.3c.7-1.2 2.4-1.1 2.9.2.4 1-.3 2-1.4 2.9l-1.5 1.2-1.5-1.2c-1.1-.9-1.8-1.9-1.4-2.9.5-1.3 2.2-1.4 2.9-.2Z" />
    </>
  ),
  ai: (
    <>
      <path d="M12 3.6a6.3 6.3 0 0 0-3.5 11.5v2.2h7v-2.2A6.3 6.3 0 0 0 12 3.6ZM9.7 19.4h4.6" />
      <circle cx="10.2" cy="10.4" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="13.8" cy="10.4" r="0.9" fill="currentColor" stroke="none" />
      <path d="M17.4 6.4h2.4M19.8 6.4v2.2M6.6 8.6H4.2M4.2 8.6v2.2" />
    </>
  ),
  cloud: (
    <>
      <path d="M7.6 18.2h9a3.7 3.7 0 0 0 .6-7.3 5 5 0 0 0-9.6-1.3 4 4 0 0 0 0 8.6Z" />
      <path d="M12 20.8v-6.4M9.6 16.6 12 14.2l2.4 2.4" />
    </>
  ),
  connected: (
    <>
      <circle cx="12" cy="12" r="7.4" />
      <path d="M4.9 12h14.2M12 4.8c2.5 1.6 3.7 4.4 3.7 7.2s-1.2 5.6-3.7 7.2c-2.5-1.6-3.7-4.4-3.7-7.2S9.5 6.4 12 4.8Z" />
      <circle cx="9.4" cy="9.6" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14.6" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  outcomes: (
    <>
      <path d="M4.4 4.4v15.2h15.2" />
      <path d="M8.4 19.6v-4.4M12.4 19.6v-7.2M16.4 19.6v-10" />
      <path d="m7.4 11.6 3.4-2.8 2.6 2.2 4.2-4.4" />
    </>
  ),
};

export function PillarGlyph({ name, className }: { name: PillarKey; className?: string }) {
  return (
    <svg {...glyphProps} className={className}>
      {PILLAR_GLYPHS[name]}
    </svg>
  );
}

export function FeatureGlyph({ name, className }: { name: FeatureKey; className?: string }) {
  return (
    <svg {...glyphProps} strokeWidth={1.6} className={className}>
      {FEATURE_GLYPHS[name]}
    </svg>
  );
}

/** The padlock of the sign-in card badge. */
export function PadlockGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps} className={className}>
      <rect x="4.6" y="10.3" width="14.8" height="10.3" rx="2.6" />
      <path d="M8.3 10.3V7.7a3.7 3.7 0 0 1 7.4 0v2.6" />
      <circle cx="12" cy="14.6" r="1.1" fill="currentColor" stroke="none" />
      <path d="M12 15.7v2" />
    </svg>
  );
}

/** Field adornments (inside the inputs — decorative, the label carries the name). */
export function PersonGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps} className={className}>
      <circle cx="12" cy="8.6" r="3.4" />
      <path d="M5.4 19.6c0-3.2 3-5.6 6.6-5.6s6.6 2.4 6.6 5.6" />
    </svg>
  );
}

export function LockGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps} strokeWidth={1.6} className={className}>
      <rect x="5.2" y="10.6" width="13.6" height="9.4" rx="2.4" />
      <path d="M8.6 10.6V8.2a3.4 3.4 0 0 1 6.8 0v2.4" />
    </svg>
  );
}

export function EyeGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps} strokeWidth={1.6} className={className}>
      <path d="M2.6 12S6 5.9 12 5.9 21.4 12 21.4 12 18 18.1 12 18.1 2.6 12 2.6 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

export function EyeOffGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps} strokeWidth={1.6} className={className}>
      <path d="M3.4 9.2C2.9 9.9 2.6 12 2.6 12s3.4 6.1 9.4 6.1c1 0 1.9-.2 2.7-.4M9.1 6.4A9.9 9.9 0 0 1 12 5.9c6 0 9.4 6.1 9.4 6.1a15.5 15.5 0 0 1-3 3.7" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3.4 3.4l17.2 17.2" />
    </svg>
  );
}

/** Gold rule broken by the reference's centre diamond. */
export function GoldRule({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`} aria-hidden="true">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#d4a017]" />
      <span className="h-1.5 w-1.5 rotate-45 bg-[#d4a017]" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#d4a017]" />
    </div>
  );
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path
        d="M12 1.4c0 7 3.6 10.6 10.6 10.6C15.6 12 12 15.6 12 22.6 12 15.6 8.4 12 1.4 12 8.4 12 12 8.4 12 1.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Laurel({ className, mirrored = false }: { className?: string; mirrored?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 48"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={mirrored ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M19 3C9.5 11 5.5 22.5 7 41" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {[
        [16.4, 8, -34],
        [11.6, 14.5, -26],
        [8.4, 22, -18],
        [7, 30, -10],
        [7.2, 38, -4],
      ].map(([cx, cy, angle]) => (
        <ellipse
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          rx="3.3"
          ry="1.8"
          fill="currentColor"
          transform={`rotate(${angle} ${cx} ${cy})`}
        />
      ))}
    </svg>
  );
}

function AfricaGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false">
      <path
        d="M46 8 58 10 68 12 76 16 80 22 86 26 92 30 84 36 78 42 76 50 74 58 72 66 68 74 62 82 54 90 46 88 40 82 36 72 34 62 30 54 26 48 22 44 18 40 12 34 8 28 6 22 10 16 16 12 26 9 36 7Z"
        fill="currentColor"
      />
      <path d="M78 70 84 70 82 78 77 76Z" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Decorative background: medical motif field, luminous network, ECG line      */
/* -------------------------------------------------------------------------- */

const hexPoints = (cx: number, cy: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
  }).join(" ");

/** The pale hexagon field with healthcare glyphs (reference: upper-left). */
function HexField({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 520" className={className} aria-hidden="true" focusable="false">
      <g stroke="#9fc4e8" strokeWidth="1.2" fill="#ffffff" fillOpacity="0.35">
        <polygon points={hexPoints(78, 96, 62)} />
        <polygon points={hexPoints(196, 58, 48)} />
        <polygon points={hexPoints(62, 258, 70)} />
        <polygon points={hexPoints(212, 220, 52)} />
        <polygon points={hexPoints(120, 420, 58)} />
      </g>
      {/* Medical cross */}
      <path d="M70 74h16v22h22v16H86v22H70V112H48V96h22Z" fill="#7fb2e0" opacity="0.55" />
      {/* Capsule */}
      <g transform="rotate(-30 196 58)" opacity="0.55">
        <rect x="176" y="44" width="40" height="22" rx="11" fill="#a9cbe8" />
        <path d="M196 44h9a11 11 0 0 1 0 22h-9Z" fill="#7fb2e0" />
      </g>
      {/* Heart with pulse */}
      <path
        d="M62 214c6-10 20-9 25 1 4 8-2 17-11 24l-14 11-14-11c-9-7-15-16-11-24 5-10 19-11 25-1Z"
        fill="#8dbde6"
        opacity="0.5"
      />
      <path d="M30 262h18l6-12 7 22 7-16 5 6h17" stroke="#5f96c9" strokeWidth="2" fill="none" opacity="0.5" />
      {/* DNA helix */}
      <g stroke="#8dbde6" strokeWidth="2.4" fill="none" opacity="0.5">
        <path d="M84 372c26 12 26 34 0 46M132 372c-26 12-26 34 0 46" />
        <path d="M90 382h36M86 395h44M90 408h36" strokeWidth="1.6" />
      </g>
      <circle cx="330" cy="120" r="3" fill="#9fc4e8" opacity="0.5" />
      <circle cx="356" cy="330" r="3" fill="#9fc4e8" opacity="0.5" />
      <circle cx="286" cy="440" r="3" fill="#9fc4e8" opacity="0.5" />
    </svg>
  );
}

/** The luminous connected-continent network (reference: upper-right). */
function NetworkAfrica({ className }: { className?: string }) {
  const nodes: Array<[number, number, number]> = [
    [22, 26, 0.9], [34, 20, 0.7], [47, 15, 1], [60, 19, 0.8], [71, 24, 1.2], [82, 29, 0.8],
    [29, 34, 0.9], [42, 31, 0.8], [56, 33, 1], [69, 38, 0.9], [78, 44, 1.1],
    [25, 44, 0.8], [38, 42, 1], [52, 46, 0.9], [65, 50, 1.3], [73, 57, 0.9],
    [31, 55, 0.9], [45, 57, 1.1], [58, 60, 0.8], [66, 66, 1],
    [37, 66, 0.8], [49, 70, 1.2], [58, 75, 0.8], [45, 79, 1], [52, 84, 0.9],
    [16, 32, 0.7], [62, 27, 0.7],
  ];
  const edges: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [0, 6], [6, 7], [7, 8], [8, 9], [9, 10],
    [1, 7], [2, 8], [3, 9], [4, 10], [6, 11], [7, 12], [8, 13], [9, 14], [10, 15],
    [11, 12], [12, 13], [13, 14], [14, 15], [11, 16], [12, 17], [13, 18], [14, 19],
    [16, 17], [17, 18], [18, 19], [16, 20], [17, 21], [18, 22], [19, 23], [20, 21],
    [21, 22], [22, 23], [21, 24], [20, 24], [24, 23], [26, 11], [25, 6], [26, 8],
  ];
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="beyuLoginNode" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#bcdcff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#bcdcff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g fill="#cfe4fb" opacity="0.5">
        <path
          d="M46 8 58 10 68 12 76 16 80 22 86 26 92 30 84 36 78 42 76 50 74 58 72 66 68 74 62 82 54 90 46 88 40 82 36 72 34 62 30 54 26 48 22 44 18 40 12 34 8 28 6 22 10 16 16 12 26 9 36 7Z"
          fillOpacity="0.35"
        />
        <path d="M78 70 84 70 82 78 77 76Z" fillOpacity="0.35" />
      </g>
      <g stroke="#cfe4fb" strokeWidth="0.25" opacity="0.55">
        {edges.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} />
        ))}
      </g>
      <g>
        {nodes.map(([x, y, r], index) => (
          <g key={`${x}-${y}-${index}`}>
            <circle cx={x} cy={y} r={r * 4.2} fill="url(#beyuLoginNode)" opacity={index % 5 === 0 ? 0.9 : 0.5} />
            <circle cx={x} cy={y} r={r * 0.7} fill="#ffffff" opacity="0.9" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** The vital-sign trace (reference: right of the descriptor). */
function EcgLine({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 60" className={className} aria-hidden="true" focusable="false">
      <path
        d="M0 34h120l10-6 8 12 10-26 10 34 9-16 8 4h225"
        fill="none"
        stroke="#9ec6ea"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.8"
      />
    </svg>
  );
}

/**
 * The page backdrop. Purely decorative: no accessible name, no interactive
 * element, no authority. It is hidden from assistive technology in full.
 */
export function LoginBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden="true">
      <div className="beyu-login-bg absolute inset-0" />
      <HexField className="absolute -left-20 top-2 hidden h-[520px] w-[420px] opacity-70 md:block" />
      <NetworkAfrica className="absolute -right-14 -top-4 h-[300px] w-[380px] opacity-90 sm:h-[360px] sm:w-[460px]" />
      <EcgLine className="absolute right-0 top-[26%] hidden h-[60px] w-[400px] opacity-70 lg:block" />
      <div className="beyu-login-glow absolute -bottom-40 left-1/2 h-[520px] w-[1100px] -translate-x-1/2" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page shell + brand hero                                                     */
/* -------------------------------------------------------------------------- */

export function LoginShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-[#eef5fd] text-[#0B1F4D]">
      <LoginBackdrop />
      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-4 sm:px-6">{children}</div>
    </main>
  );
}

/**
 * The brand composition of the reference: emblem, wordmark, descriptor,
 * headline, navy motto banner and mission statement. It carries NO page heading
 * (each surface owns its own `h1`), so the document outline stays honest.
 */
export function LoginHero() {
  return (
    <header className="pt-8 text-center sm:pt-12">
      <span className="inline-flex items-center justify-center rounded-full bg-white p-3 shadow-[0_18px_40px_-24px_rgba(11,31,77,0.55)] ring-1 ring-[#d4a017]/40 sm:p-4">
        <BeyuOsLogo size={112} ariaLabel="BEYU — official emblem" />
      </span>

      <p className="mt-4 font-serif text-[40px] leading-none font-semibold tracking-[0.26em] text-[#0B1F4D] sm:text-[54px]">
        BEYU
      </p>

      <Sparkle className="mx-auto mt-3 h-5 w-5 text-[#d4a017]" />

      <GoldRule className="mx-auto mt-5 max-w-[520px]" />

      <p className="mt-5 text-[10.5px] font-semibold tracking-[0.16em] text-[#0B1F4D] sm:text-[12px]">
        HEALTHCARE <span className="text-[#8A6A12]">&#9679;</span> GOVERNANCE{" "}
        <span className="text-[#8A6A12]">&#9679;</span> TRUST <span className="text-[#8A6A12]">&#9679;</span> INNOVATION
      </p>

      <p className="mx-auto mt-6 max-w-[860px] font-serif text-[24px] leading-[1.25] font-semibold text-[#0B1F4D] sm:text-[32px] lg:text-[38px]">
        Bridging Care. Building Trust.
        <br />
        Transforming Healthcare for <span className="beyu-gold-ink">Generations.</span>
      </p>

      <p className="mx-auto mt-7 flex max-w-[860px] items-center justify-center gap-2 rounded-xl bg-[#0B1F4D] px-4 py-3.5 text-[13.5px] font-medium text-[#e2c25f] shadow-[0_20px_45px_-30px_rgba(11,31,77,0.9)] sm:gap-4 sm:px-6 sm:text-[17px]">
        <Laurel className="h-7 w-3.5 shrink-0 sm:h-8 sm:w-4" />
        <span>&ldquo;A legacy of trust. A future of better health.&rdquo;</span>
        <Laurel className="h-7 w-3.5 shrink-0 sm:h-8 sm:w-4" mirrored />
      </p>

      <div className="mx-auto mt-6 flex max-w-[640px] items-center gap-4 text-left sm:mt-7">
        <AfricaGlyph className="h-11 w-11 shrink-0 text-[#c99a2e] sm:h-14 sm:w-14" />
        <span className="border-l border-[#d4a017]/60 pl-4 text-[13px] leading-snug text-[#0B1F4D] sm:text-[15px]">
          Building a great Africa through
          <br />
          technology, compassion and excellence
        </span>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Pillars, sign-in card shell, campus band                                    */
/* -------------------------------------------------------------------------- */

export type Pillar = { title: string; copy: string; key: PillarKey };

/**
 * The canonical brand pillars. `extra` lets a surface add its own governed
 * foundations underneath without changing the canonical five.
 */
export function LoginPillars({ extra, className }: { extra?: ReactNode; className?: string }) {
  return (
    <section aria-labelledby="beyu-pillars-heading" className={className}>
      <h2 id="beyu-pillars-heading" className="beyu-gold-ink text-[13px] font-bold tracking-[0.2em] sm:text-[15px]">
        OUR PILLARS
      </h2>
      <ul className="mt-4 list-none space-y-0 p-0">
        {BEYU_LOGIN_PILLARS.map((pillar) => (
          <li
            key={pillar.key}
            className="flex items-start gap-3 border-b border-[#d4a017]/30 py-3 last:border-b-0 sm:gap-4"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0B1F4D] text-[#e2c25f] sm:h-12 sm:w-12">
              <PillarGlyph name={pillar.key} className="h-6 w-6" />
            </span>
            <div className="min-w-0 pt-0.5">
              <div className="flex items-center gap-2 text-[14.5px] font-semibold text-[#0B1F4D] sm:text-[15.5px]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#8A6A12]" aria-hidden="true" />
                {pillar.title}
              </div>
              <p className="mt-0.5 text-[12.5px] leading-snug text-[#5b6b85]">{pillar.copy}</p>
            </div>
          </li>
        ))}
      </ul>
      {extra}
    </section>
  );
}

/**
 * The white sign-in card shell of the reference: padlock badge, "Welcome",
 * "Log in to access your account", the surface's own canonical sub-line and the
 * gold rule — then the ONE shared form as its only child.
 */
export function LoginCard({
  titleId,
  signInSubtitle,
  heading = "Welcome",
  headingLevel = "h2",
  subline = "Log in to access your account",
  children,
  className,
}: {
  titleId: string;
  signInSubtitle: string;
  /** Card heading. The sign-in surfaces use the reference's "Welcome". */
  heading?: string;
  /** `h2` under a page `h1` (the sign-in surfaces); `h1` when the card IS the page. */
  headingLevel?: "h1" | "h2";
  /** The reference's sub-line; `null` for surfaces that must not claim it. */
  subline?: string | null;
  children: ReactNode;
  className?: string;
}) {
  const Heading = headingLevel;
  return (
    <section
      aria-labelledby={titleId}
      className={`beyu-login-card rounded-[26px] bg-white p-5 ring-1 ring-[#0B1F4D]/[0.07] sm:p-7 ${className ?? ""}`}
    >
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#e9f2fc] text-[#0B1F4D] sm:h-16 sm:w-16">
          <PadlockGlyph className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <Heading id={titleId} className="text-[24px] leading-tight font-semibold text-[#0B1F4D] sm:text-[27px]">
            {heading}
          </Heading>
          {subline ? (
            <p className="text-[12.5px] text-[#5b6b85] sm:text-[13.5px]">{subline}</p>
          ) : null}
        </div>
      </div>

      <GoldRule className="my-5" />

      <p className="mb-4 text-[11.5px] font-medium text-[#0B1F4D]/80">{signInSubtitle}</p>

      {children}
    </section>
  );
}

/** The dusk hospital campus of the reference, drawn — no photograph is shipped. */
function CampusArtwork({ className }: { className?: string }) {
  const windows = (x: number, y: number, cols: number, rows: number, w = 22, h = 18) =>
    Array.from({ length: cols * rows }, (_, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const px = x + col * w + 4;
      const py = y + row * h + 5;
      // Deterministic "lit window" pattern: ~62% of panes are lit.
      const lit = (col * 7 + row * 13 + x) % 8 < 5;
      return (
        <rect
          key={`${px}-${py}`}
          x={px}
          y={py}
          width={w - 9}
          height={h - 8}
          rx="1"
          fill={lit ? "#ffd79a" : "#1c3f6b"}
          opacity={lit ? 0.75 : 0.55}
        />
      );
    });

  return (
    <svg
      viewBox="0 0 1200 420"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="beyuCampusSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16457f" />
          <stop offset="55%" stopColor="#0c2a57" />
          <stop offset="100%" stopColor="#071733" />
        </linearGradient>
        <linearGradient id="beyuCampusGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7fb6ff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#7fb6ff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="1200" height="420" fill="url(#beyuCampusSky)" />
      <ellipse cx="700" cy="150" rx="620" ry="180" fill="url(#beyuCampusGlow)" opacity="0.6" />
      <g fill="#ffffff" opacity="0.7">
        <circle cx="120" cy="46" r="1.4" />
        <circle cx="300" cy="30" r="1.1" />
        <circle cx="520" cy="54" r="1.3" />
        <circle cx="880" cy="34" r="1.2" />
        <circle cx="1040" cy="62" r="1.4" />
        <circle cx="980" cy="18" r="1" />
        <circle cx="210" cy="86" r="1" />
        <circle cx="660" cy="26" r="1" />
      </g>

      {/* Left block — the CARE | TRUST | INNOVATION wing. */}
      <g>
        <rect x="40" y="150" width="330" height="200" fill="#0d2a52" />
        <rect x="40" y="150" width="330" height="200" fill="#123563" opacity="0.7" />
        <g>{windows(52, 162, 12, 5)}</g>
        <rect x="40" y="146" width="330" height="12" fill="#1d4a7d" />
        <rect x="56" y="272" width="300" height="36" rx="2" fill="#06203f" />
        <text x="72" y="296" fill="#dbe9f8" fontSize="20" letterSpacing="1.4">
          CARE | TRUST | INNOVATION
        </text>
        <rect x="40" y="350" width="330" height="10" fill="#0a2144" />
      </g>

      {/* Centre block — taller glazed atrium. */}
      <g>
        <rect x="430" y="120" width="300" height="230" fill="#0f2f5c" />
        <g>{windows(444, 132, 11, 6, 26, 22)}</g>
        <g stroke="#2a5b93" strokeWidth="3" fill="none" opacity="0.8">
          <path d="M430 120h300" />
          <path d="M580 120v230" />
          <path d="M430 236h300" />
        </g>
        <rect x="430" y="350" width="300" height="10" fill="#0a2144" />
      </g>

      {/* Right block — the BEYU entrance. */}
      <g>
        <rect x="790" y="164" width="370" height="186" fill="#0d2a52" />
        <g>{windows(802, 176, 14, 5)}</g>
        <rect x="790" y="160" width="370" height="12" fill="#1d4a7d" />
        {/* Entrance canopy */}
        <rect x="900" y="300" width="150" height="50" fill="#12315c" />
        <rect x="900" y="300" width="150" height="8" fill="#e6eefb" opacity="0.75" />
        {/* BEYU sign with the clinical cross badge */}
        <rect x="968" y="200" width="130" height="64" rx="5" fill="#0a3568" stroke="#2a5b93" strokeWidth="1.5" />
        <circle cx="1002" cy="224" r="17" fill="#1d6fc4" />
        <path d="M1002 214v20M992 224h20" stroke="#ffffff" strokeWidth="6.5" strokeLinecap="round" />
        <text x="1000" y="252" fill="#ffffff" fontSize="21" letterSpacing="2.2" fontWeight="600">
          BEYU
        </text>
        <rect x="790" y="350" width="370" height="10" fill="#0a2144" />
      </g>

      {/* Ground, walkway and landscape. */}
      <rect y="358" width="1200" height="62" fill="#081d3a" />
      <path d="M0 392c220-16 420-14 640 2s380 14 560-4v30H0Z" fill="#0a2144" />
      <g fill="#123f2f">
        {[
          [160, 300, 34],
          [332, 314, 26],
          [742, 306, 30],
          [1130, 312, 28],
        ].map(([x, y, r]) => (
          <g key={`tree-${x}`}>
            <rect x={x - 3} y={y + r * 0.6} width="6" height={r * 1.2} fill="#0f2b47" />
            <ellipse cx={x} cy={y} rx={r} ry={r * 0.78} />
            <ellipse cx={x - r * 0.5} cy={y + r * 0.32} rx={r * 0.66} ry={r * 0.5} fill="#164e39" />
            <ellipse cx={x + r * 0.55} cy={y + r * 0.28} rx={r * 0.6} ry={r * 0.46} fill="#164e39" />
          </g>
        ))}
      </g>
      <g fill="#164e39" opacity="0.9">
        {Array.from({ length: 26 }, (_, index) => (
          <ellipse key={`bush-${index}`} cx={24 + index * 47} cy={382 - (index % 3) * 4} rx="22" ry="9" />
        ))}
      </g>
      <g stroke="#2a5b93" strokeWidth="2.4" opacity="0.8">
        {[240, 520, 860, 1080].map((x) => (
          <path key={`lamp-${x}`} d={`M${x} 392v-52`} />
        ))}
      </g>
      <g fill="#ffd79a" opacity="0.85">
        {[240, 520, 860, 1080].map((x) => (
          <circle key={`lampglow-${x}`} cx={x} cy="336" r="3.4" />
        ))}
      </g>
    </svg>
  );
}

/**
 * The lower band: hospital campus, the six-capability strip and the navy
 * footer carrying the BEYU wordmark. `notices` renders the governed notes the
 * surface supplies (least-privilege statement, first-time enrolment link) — the
 * band itself decides nothing.
 */
export function LoginCampusBand({ notices }: { notices?: ReactNode }) {
  return (
    <section
      aria-label="BEYU platform capabilities"
      className="mt-10 overflow-hidden rounded-[26px] shadow-[0_30px_70px_-45px_rgba(11,31,77,0.8)] lg:mt-14"
    >
      <div className="relative">
        <CampusArtwork className="absolute inset-0 h-full w-full" />
        <div className="beyu-login-band absolute inset-0" aria-hidden="true" />
        <div className="relative px-4 pt-[46%] sm:px-6 sm:pt-[34%] lg:pt-[26%]">
          <ul className="grid list-none grid-cols-2 gap-y-6 border-t border-white/15 p-0 pt-6 sm:grid-cols-3 lg:grid-cols-6">
            {BEYU_LOGIN_FEATURES.map((feature) => (
              <li
                key={feature.key}
                className="flex flex-col items-center gap-2 px-2 text-center lg:border-l lg:border-white/15 lg:first:border-l-0"
              >
                <FeatureGlyph name={feature.key} className="h-8 w-8 text-[#e2c25f]" />
                <span className="text-[12.5px] leading-tight text-white/95">
                  {feature.lines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>

          {notices ? <div className="mx-auto mt-7 max-w-[860px] text-center text-white/70">{notices}</div> : null}

          <p className="pt-6 pb-5 text-center text-[15px] font-semibold tracking-[0.62em] text-[#d4a017] sm:text-[17px]">
            BEYU
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * One destination fact, rendered identically on the control plane and on every
 * canonical destination host so neither can drift from the other.
 */
export function LoginTrustStrip({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-6 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-[10px] font-semibold tracking-[0.14em] text-[#0B1F4D]/75">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
