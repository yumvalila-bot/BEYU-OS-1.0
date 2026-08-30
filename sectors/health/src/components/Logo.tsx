// BEYU Family Trust official logo

type Props = {
  variant?: "full" | "mark" | "stacked" | "white";
  size?: number;
  className?: string;
  showTagline?: boolean;
};

/**
 * BEYU Family Trust official logo (SVG reproduction).
 * - Gold circle
 * - Serif "B" with stylized tree of leaves inside
 * - "BEYU" wordmark + star divider + "FAMILY TRUST"
 */
export function Logo({ variant = "full", size = 56, className = "", showTagline = false }: Props) {
  const isDark = variant === "white";
  const navy = isDark ? "#ffffff" : "#0B1D3A";
  const gold = "#D4AF37";
  const leaf = isDark ? "#B7C9A2" : "#5E7A48";

  const Mark = (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-label="BEYU logo mark">
      {/* outer gold circle (3/4 arc style) */}
      <circle cx="60" cy="60" r="52" fill="none" stroke={gold} strokeWidth="3" />
      {/* serif B */}
      <text
        x="60"
        y="84"
        textAnchor="middle"
        fontFamily="Playfair Display, Georgia, serif"
        fontWeight={700}
        fontSize="78"
        fill={navy}
      >
        B
      </text>
      {/* stylized tree of leaves inside B */}
      <g transform="translate(60 36)">
        <path d="M0 22 L0 4" stroke={navy} strokeWidth="2" strokeLinecap="round" />
        {/* leaves */}
        <ellipse cx="-6" cy="6" rx="5" ry="3" fill={leaf} transform="rotate(-30 -6 6)" />
        <ellipse cx="6" cy="6" rx="5" ry="3" fill={leaf} transform="rotate(30 6 6)" />
        <ellipse cx="-9" cy="0" rx="5" ry="3" fill={leaf} transform="rotate(-45 -9 0)" />
        <ellipse cx="9" cy="0" rx="5" ry="3" fill={leaf} transform="rotate(45 9 0)" />
        <ellipse cx="-5" cy="-5" rx="4" ry="2.5" fill={leaf} transform="rotate(-20 -5 -5)" />
        <ellipse cx="5" cy="-5" rx="4" ry="2.5" fill={leaf} transform="rotate(20 5 -5)" />
        <ellipse cx="0" cy="-9" rx="4.5" ry="3" fill={leaf} />
      </g>
    </svg>
  );

  if (variant === "mark") {
    return <span className={className}>{Mark}</span>;
  }

  return (
    <div className={`inline-flex ${variant === "stacked" ? "flex-col items-center gap-1" : "items-center gap-3"} ${className}`}>
      {Mark}
      <div className={`${variant === "stacked" ? "text-center" : ""} leading-none`}>
        <div
          className="font-display tracking-[0.22em]"
          style={{ color: navy, fontSize: size * 0.42, fontWeight: 600 }}
        >
          BEYU
        </div>
        <div className="flex items-center gap-1 justify-center mt-1">
          <span style={{ width: size * 0.25, height: 1, background: gold }} />
          <span style={{ color: gold, fontSize: size * 0.18 }}>✦</span>
          <span style={{ width: size * 0.25, height: 1, background: gold }} />
        </div>
        <div
          className="font-display tracking-[0.3em] mt-1"
          style={{ color: navy, fontSize: size * 0.16, opacity: 0.85 }}
        >
          FAMILY&nbsp;&nbsp;TRUST
        </div>
        {showTagline && (
          <div className="mt-2 text-[10px] tracking-[0.25em]" style={{ color: isDark ? "#cbd5e1" : "#4a6390" }}>
            HEALTHIER LIVES · STRONGER FUTURES
          </div>
        )}
      </div>
    </div>
  );
}
