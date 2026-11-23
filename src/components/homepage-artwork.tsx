import type { ReactNode } from "react";

/**
 * Self-contained, CSP-safe institutional artwork for the BEYU public homepage.
 * All illustrations are pure inline SVG (zero external URLs, zero raster bloat,
 * crisp at any DPI, and honoring `prefers-reduced-motion`).
 */

export function HeroEcosystemGlobe() {
  return (
    <div className="beyu-hero-visual" aria-label="BEYU Ecosystem connecting HEALTH_OS, FINANCE_OS, AGRICULTURE_OS, and UJENZI_OS">
      <svg viewBox="0 0 560 440" role="img" aria-hidden="true" className="beyu-hero-globe-svg">
        <defs>
          <radialGradient id="beyuGlobeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.45" />
            <stop offset="55%" stopColor="#1d4ed8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#081433" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="beyuSphere" cx="42%" cy="38%" r="58%">
            <stop offset="0%" stopColor="#1e4b9e" />
            <stop offset="52%" stopColor="#0d255b" />
            <stop offset="100%" stopColor="#06122e" />
          </radialGradient>
          <linearGradient id="beyuGoldRing" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f5d061" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#d4a017" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="beyuArcGold" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#d4a017" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#f5d061" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#d4a017" stopOpacity="0.2" />
          </linearGradient>
          <clipPath id="beyuGlobeClip">
            <circle cx="280" cy="220" r="118" />
          </clipPath>
        </defs>

        {/* Ambient aura */}
        <circle cx="280" cy="220" r="190" fill="url(#beyuGlobeGlow)" />

        {/* Orbital rings */}
        <ellipse cx="280" cy="220" rx="205" ry="74" transform="rotate(-17 280 220)" fill="none" stroke="url(#beyuGoldRing)" strokeWidth="1.8" strokeOpacity="0.72" />
        <ellipse cx="280" cy="220" rx="194" ry="86" transform="rotate(19 280 220)" fill="none" stroke="#60a5fa" strokeWidth="1.2" strokeOpacity="0.45" strokeDasharray="4 6" />
        <circle cx="280" cy="220" r="154" fill="none" stroke="#d4a017" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="2 7" />

        {/* Connector filaments from globe to the four Sector OS hubs */}
        <path d="M192 162 Q 145 128 108 118" fill="none" stroke="url(#beyuArcGold)" strokeWidth="1.6" />
        <path d="M368 162 Q 415 128 452 118" fill="none" stroke="url(#beyuArcGold)" strokeWidth="1.6" />
        <path d="M192 278 Q 145 312 108 322" fill="none" stroke="url(#beyuArcGold)" strokeWidth="1.6" />
        <path d="M368 278 Q 415 312 452 322" fill="none" stroke="url(#beyuArcGold)" strokeWidth="1.6" />

        {/* Core digital globe */}
        <circle cx="280" cy="220" r="118" fill="url(#beyuSphere)" stroke="#60a5fa" strokeOpacity="0.55" strokeWidth="1.5" />

        <g clipPath="url(#beyuGlobeClip)">
          {/* Latitude & longitude meridian grid */}
          <ellipse cx="280" cy="220" rx="118" ry="34" fill="none" stroke="#93c5fd" strokeOpacity="0.22" strokeWidth="1" />
          <ellipse cx="280" cy="220" rx="118" ry="72" fill="none" stroke="#93c5fd" strokeOpacity="0.18" strokeWidth="1" />
          <ellipse cx="280" cy="220" rx="46" ry="118" fill="none" stroke="#93c5fd" strokeOpacity="0.22" strokeWidth="1" />
          <ellipse cx="280" cy="220" rx="88" ry="118" fill="none" stroke="#93c5fd" strokeOpacity="0.16" strokeWidth="1" />
          <line x1="162" y1="220" x2="398" y2="220" stroke="#93c5fd" strokeOpacity="0.24" strokeWidth="1" />

          {/* Stylized Africa & East Africa luminous landmass */}
          <path
            d="M250 132 L292 134 L318 156 L332 184 L322 204 L334 222 L322 248 L304 282 L292 312 L274 316 L266 286 L252 252 L236 226 L224 202 L230 168 Z"
            fill="#1e56b5"
            fillOpacity="0.55"
            stroke="#f5d061"
            strokeOpacity="0.6"
            strokeWidth="1.4"
          />
          {/* East Africa / Tanzania highlight node */}
          <circle cx="312" cy="238" r="16" fill="#d4a017" fillOpacity="0.25" />
          <circle cx="312" cy="238" r="5" fill="#f5d061" />
          <circle cx="284" cy="186" r="3" fill="#93c5fd" />
          <circle cx="264" cy="242" r="3" fill="#93c5fd" />
          <circle cx="294" cy="276" r="3" fill="#f5d061" />
          <path d="M284 186 L312 238 L294 276 L264 242 Z" fill="none" stroke="#f5d061" strokeOpacity="0.5" strokeWidth="1" />
        </g>

        {/* Central BEYU Ecosystem medallion */}
        <rect x="206" y="191" width="148" height="58" rx="14" fill="#071636" fillOpacity="0.92" stroke="#d4a017" strokeWidth="1.5" />
        <text x="280" y="216" textAnchor="middle" fill="#ffffff" fontSize="19" fontWeight="800" letterSpacing="2">
          BEYU
        </text>
        <text x="280" y="236" textAnchor="middle" fill="#f5d061" fontSize="11.5" fontWeight="600" letterSpacing="1.2">
          ECOSYSTEM
        </text>

        {/* Four Sector OS Orbit Medallions */}
        {/* HEALTH_OS — Top Left */}
        <g transform="translate(30, 74)">
          <rect x="0" y="0" width="146" height="64" rx="14" fill="#0b2152" fillOpacity="0.94" stroke="#d4a017" strokeOpacity="0.7" strokeWidth="1.4" />
          <circle cx="30" cy="32" r="17" fill="#133478" stroke="#f5d061" strokeWidth="1.4" />
          <path d="M30 23 V41 M21 32 H39" stroke="#f5d061" strokeWidth="3" strokeLinecap="round" />
          <text x="56" y="29" fill="#ffffff" fontSize="11.5" fontWeight="800" letterSpacing="0.5">
            HEALTH_OS
          </text>
          <text x="56" y="45" fill="#bfd3f7" fontSize="9.5">
            Care &amp; Clinical
          </text>
        </g>

        {/* AGRICULTURE_OS — Top Right */}
        <g transform="translate(384, 74)">
          <rect x="0" y="0" width="150" height="64" rx="14" fill="#0b2152" fillOpacity="0.94" stroke="#d4a017" strokeOpacity="0.7" strokeWidth="1.4" />
          <circle cx="30" cy="32" r="17" fill="#133478" stroke="#f5d061" strokeWidth="1.4" />
          <path d="M30 42 V24 M30 34 C23 32 22 25 27 22 C31 24 31 30 30 34 Z M30 31 C37 29 39 23 34 20 C30 22 29 27 30 31 Z" fill="none" stroke="#f5d061" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <text x="54" y="29" fill="#ffffff" fontSize="10.5" fontWeight="800" letterSpacing="0.3">
            AGRICULTURE_OS
          </text>
          <text x="54" y="45" fill="#bfd3f7" fontSize="9.5">
            Agribusiness
          </text>
        </g>

        {/* FINANCE_OS — Bottom Left */}
        <g transform="translate(30, 302)">
          <rect x="0" y="0" width="146" height="64" rx="14" fill="#0b2152" fillOpacity="0.94" stroke="#d4a017" strokeOpacity="0.7" strokeWidth="1.4" />
          <circle cx="30" cy="32" r="17" fill="#133478" stroke="#f5d061" strokeWidth="1.4" />
          <path d="M21 38 L27 31 L32 34 L39 24 M34 24 H39 V29" fill="none" stroke="#f5d061" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          <text x="56" y="29" fill="#ffffff" fontSize="11.5" fontWeight="800" letterSpacing="0.5">
            FINANCE_OS
          </text>
          <text x="56" y="45" fill="#bfd3f7" fontSize="9.5">
            Ledger &amp; Treasury
          </text>
        </g>

        {/* UJENZI_OS — Bottom Right */}
        <g transform="translate(384, 302)">
          <rect x="0" y="0" width="150" height="64" rx="14" fill="#0b2152" fillOpacity="0.94" stroke="#d4a017" strokeOpacity="0.7" strokeWidth="1.4" />
          <circle cx="30" cy="32" r="17" fill="#133478" stroke="#f5d061" strokeWidth="1.4" />
          <path d="M21 40 H39 M24 40 V26 L30 22 L36 26 V40 M28 31 H32" fill="none" stroke="#f5d061" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          <text x="56" y="29" fill="#ffffff" fontSize="11.5" fontWeight="800" letterSpacing="0.5">
            UJENZI_OS
          </text>
          <text x="56" y="45" fill="#bfd3f7" fontSize="9.5">
            Infrastructure
          </text>
        </g>

        {/* Ambient stars/particles */}
        <circle cx="154" cy="214" r="2.2" fill="#f5d061" fillOpacity="0.8" />
        <circle cx="408" cy="204" r="2.2" fill="#60a5fa" fillOpacity="0.85" />
        <circle cx="280" cy="68" r="2.5" fill="#f5d061" fillOpacity="0.7" />
        <circle cx="280" cy="374" r="2.5" fill="#60a5fa" fillOpacity="0.7" />
      </svg>
    </div>
  );
}

export function AboutHeadquartersIllustration() {
  return (
    <div className="beyu-about-art" aria-hidden="true">
      <svg viewBox="0 0 540 340" className="beyu-about-svg" role="img">
        <defs>
          <linearGradient id="hqSky" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#dbeafe" />
            <stop offset="55%" stopColor="#eff6ff" />
            <stop offset="100%" stopColor="#fef3c7" />
          </linearGradient>
          <linearGradient id="hqGlassMain" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e3a8a" />
            <stop offset="50%" stopColor="#0f2964" />
            <stop offset="100%" stopColor="#08173b" />
          </linearGradient>
          <linearGradient id="hqGlassLight" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="hqSun" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fde68a" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        <rect width="540" height="340" rx="16" fill="url(#hqSky)" />
        {/* Sunlight glow */}
        <circle cx="445" cy="72" r="56" fill="url(#hqSun)" />

        {/* Soft architectural clouds */}
        <path d="M55 78 Q82 58 118 72 Q144 62 164 82 Z" fill="#ffffff" fillOpacity="0.75" />
        <path d="M312 58 Q336 44 366 56 Q388 48 408 64 Z" fill="#ffffff" fillOpacity="0.65" />

        {/* Secondary left wing */}
        <polygon points="94,152 214,126 214,274 94,274" fill="#1e40af" />
        <polygon points="104,164 204,142 204,270 104,270" fill="url(#hqGlassLight)" fillOpacity="0.45" />
        {[178, 198, 218, 238, 256].map((y) => (
          <line key={y} x1="102" y1={y} x2="206" y2={y - 18} stroke="#dbeafe" strokeOpacity="0.45" strokeWidth="1.4" />
        ))}

        {/* Primary central BEYU glass tower */}
        <polygon points="198,64 342,36 342,276 198,276" fill="url(#hqGlassMain)" />
        <polygon points="342,36 436,78 436,276 342,276" fill="#0b1f4d" />
        {/* Facade architectural mullions */}
        {[226, 254, 282, 310].map((x) => (
          <line key={x} x1={x} y1="60" x2={x} y2="274" stroke="#93c5fd" strokeOpacity="0.28" strokeWidth="1.3" />
        ))}
        {[92, 118, 144, 170, 196, 222, 248].map((y) => (
          <line key={y} x1="200" y1={y} x2="342" y2={y - 22} stroke="#93c5fd" strokeOpacity="0.32" strokeWidth="1.3" />
        ))}
        {[104, 130, 156, 182, 208, 234, 258].map((y) => (
          <line key={y} x1="342" y1={y - 22} x2="434" y2={y + 6} stroke="#60a5fa" strokeOpacity="0.24" strokeWidth="1.2" />
        ))}

        {/* Gold cornice and facade crest */}
        <polyline points="198,64 342,36 436,78" fill="none" stroke="#d4a017" strokeWidth="3.5" />
        <rect x="240" y="218" width="90" height="30" rx="6" fill="#071636" stroke="#d4a017" strokeWidth="1.5" />
        <text x="285" y="238" textAnchor="middle" fill="#f5d061" fontSize="14" fontWeight="800" letterSpacing="2.5">
          BEYU
        </text>

        {/* Sunlit landscaped campus foreground */}
        <path d="M0 272 Q180 256 360 268 T540 264 L540 340 L0 340 Z" fill="#1e3a5f" />
        <path d="M0 286 Q190 272 370 286 T540 280 L540 340 L0 340 Z" fill="#0f274d" />
        <path d="M170 278 L272 278 L314 340 L122 340 Z" fill="#cbd5e1" fillOpacity="0.22" />
        <circle cx="76" cy="264" r="24" fill="#15803d" />
        <circle cx="104" cy="270" r="18" fill="#166534" />
        <circle cx="468" cy="262" r="26" fill="#15803d" />
        <circle cx="438" cy="270" r="18" fill="#166534" />
      </svg>
    </div>
  );
}

export function SectorBannerArtwork({ sector }: { sector: "HEALTH_OS" | "FINANCE_OS" | "AGRICULTURE_OS" | "UJENZI_OS" }) {
  if (sector === "HEALTH_OS") {
    return (
      <svg viewBox="0 0 360 156" className="beyu-sector-banner-svg" aria-hidden="true">
        <defs>
          <linearGradient id="secHealthBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0e3a6e" />
            <stop offset="100%" stopColor="#1e6ba8" />
          </linearGradient>
        </defs>
        <rect width="360" height="156" fill="url(#secHealthBg)" />
        <circle cx="290" cy="40" r="64" fill="#38bdf8" fillOpacity="0.18" />
        <circle cx="64" cy="136" r="56" fill="#d4a017" fillOpacity="0.14" />
        {/* Clinical telemetry grid */}
        <path d="M18 112 H96 L112 82 L126 126 L142 64 L158 112 H242 L258 94 L272 112 H342" fill="none" stroke="#f5d061" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        {/* Clinical sanctuary emblem */}
        <rect x="26" y="24" width="66" height="66" rx="16" fill="#081d45" fillOpacity="0.82" stroke="#f5d061" strokeWidth="1.5" />
        <path d="M59 40 V74 M42 57 H76" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
        {/* Precision diagnostics cards */}
        <rect x="114" y="26" width="128" height="20" rx="6" fill="#ffffff" fillOpacity="0.14" />
        <rect x="114" y="54" width="92" height="12" rx="4" fill="#bae6fd" fillOpacity="0.4" />
        <rect x="266" y="24" width="68" height="58" rx="12" fill="#0b2250" fillOpacity="0.72" stroke="#93c5fd" strokeOpacity="0.45" />
        <circle cx="300" cy="53" r="16" fill="none" stroke="#f5d061" strokeWidth="2.2" />
        <circle cx="300" cy="53" r="6" fill="#38bdf8" />
      </svg>
    );
  }

  if (sector === "FINANCE_OS") {
    return (
      <svg viewBox="0 0 360 156" className="beyu-sector-banner-svg" aria-hidden="true">
        <defs>
          <linearGradient id="secFinBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0a1f4a" />
            <stop offset="100%" stopColor="#1b3f82" />
          </linearGradient>
        </defs>
        <rect width="360" height="156" fill="url(#secFinBg)" />
        <circle cx="300" cy="34" r="62" fill="#d4a017" fillOpacity="0.22" />
        {/* Ledger bars */}
        <rect x="34" y="96" width="24" height="44" rx="4" fill="#60a5fa" fillOpacity="0.55" />
        <rect x="70" y="78" width="24" height="62" rx="4" fill="#60a5fa" fillOpacity="0.7" />
        <rect x="106" y="60" width="24" height="80" rx="4" fill="#d4a017" fillOpacity="0.85" />
        <rect x="142" y="44" width="24" height="96" rx="4" fill="#f5d061" />
        {/* Upward treasury trend line */}
        <path d="M32 90 L82 70 L122 54 L164 34 L224 48 L322 22" fill="none" stroke="#fde68a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="322" cy="22" r="5" fill="#fde68a" />
        {/* Institutional ledger card */}
        <rect x="210" y="64" width="124" height="72" rx="12" fill="#081736" fillOpacity="0.84" stroke="#d4a017" strokeOpacity="0.65" />
        <line x1="226" y1="86" x2="294" y2="86" stroke="#f5d061" strokeWidth="3" strokeLinecap="round" />
        <line x1="226" y1="104" x2="318" y2="104" stroke="#93c5fd" strokeOpacity="0.55" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="226" y1="118" x2="282" y2="118" stroke="#93c5fd" strokeOpacity="0.38" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (sector === "AGRICULTURE_OS") {
    return (
      <svg viewBox="0 0 360 156" className="beyu-sector-banner-svg" aria-hidden="true">
        <defs>
          <linearGradient id="secAgriSky" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0f3d3e" />
            <stop offset="100%" stopColor="#1e6b52" />
          </linearGradient>
        </defs>
        <rect width="360" height="156" fill="url(#secAgriSky)" />
        <circle cx="292" cy="42" r="36" fill="#fde68a" fillOpacity="0.38" />
        {/* Terraced fertile hills */}
        <path d="M0 104 Q90 66 196 96 T360 88 L360 156 L0 156 Z" fill="#14532d" />
        <path d="M0 120 Q120 88 232 118 T360 108 L360 156 L0 156 Z" fill="#166534" />
        <path d="M0 134 Q140 112 260 134 T360 126 L360 156 L0 156 Z" fill="#0d3b26" />
        {/* Precision crop arcs */}
        <path d="M24 140 Q120 118 220 140" fill="none" stroke="#f5d061" strokeOpacity="0.65" strokeWidth="1.6" strokeDasharray="5 5" />
        {/* Botanical seal */}
        <circle cx="64" cy="56" r="28" fill="#082422" fillOpacity="0.78" stroke="#f5d061" strokeWidth="1.5" />
        <path d="M64 74 V42 M64 60 C52 58 50 48 58 43 C64 46 65 54 64 60 Z M64 55 C76 53 79 44 71 39 C65 42 63 49 64 55 Z" fill="none" stroke="#f5d061" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 360 156" className="beyu-sector-banner-svg" aria-hidden="true">
      <defs>
        <linearGradient id="secUjenziBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1b2c4e" />
          <stop offset="60%" stopColor="#2c446e" />
          <stop offset="100%" stopColor="#855814" />
        </linearGradient>
      </defs>
      <rect width="360" height="156" fill="url(#secUjenziBg)" />
      {/* Blueprint grid */}
      <path d="M0 40 H360 M0 80 H360 M0 120 H360 M60 0 V156 M140 0 V156 M220 0 V156 M300 0 V156" stroke="#ffffff" strokeOpacity="0.09" strokeWidth="1" />
      {/* Rising towers & crane silhouette */}
      <rect x="42" y="70" width="44" height="86" fill="#0b1f4d" stroke="#f5d061" strokeOpacity="0.5" />
      <rect x="98" y="48" width="54" height="108" fill="#0f2b66" stroke="#93c5fd" strokeOpacity="0.5" />
      <rect x="244" y="64" width="64" height="92" fill="#0b1f4d" stroke="#f5d061" strokeOpacity="0.5" />
      {/* Engineering tower crane */}
      <path d="M196 156 V32 H316 M196 32 L156 48 M196 52 L248 32 M288 32 V72" fill="none" stroke="#f5d061" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="278" y="72" width="20" height="12" rx="2" fill="#f5d061" />
    </svg>
  );
}

export function CapabilityIcon({
  kind,
}: {
  kind: "governance" | "hcm" | "family-office" | "risk" | "knowledge" | "audit";
}): ReactNode {
  const common = {
    viewBox: "0 0 28 28",
    className: "beyu-cap-icon-svg",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (kind) {
    case "governance":
      return (
        <svg {...common}>
          <path d="M4 11 H24 L14 5 Z" />
          <path d="M7 11 V20 M12 11 V20 M16 11 V20 M21 11 V20 M4 22 H24" />
        </svg>
      );
    case "hcm":
      return (
        <svg {...common}>
          <circle cx="14" cy="9.5" r="3.2" />
          <path d="M8.5 20.5 C8.5 17 11 15 14 15 C17 15 19.5 17 19.5 20.5" />
          <circle cx="7" cy="11.5" r="2.2" />
          <circle cx="21" cy="11.5" r="2.2" />
        </svg>
      );
    case "family-office":
      return (
        <svg {...common}>
          <path d="M14 4 L22 7.5 V14 C22 18.8 18.4 22.3 14 24 C9.6 22.3 6 18.8 6 14 V7.5 Z" />
          <path d="M10.5 14.5 L14 11 L17.5 14.5 M11.5 14 V18 H16.5 V14" />
        </svg>
      );
    case "risk":
      return (
        <svg {...common}>
          <path d="M14 4 L22 7.5 V13.8 C22 18.5 18.4 22 14 23.8 C9.6 22 6 18.5 6 13.8 V7.5 Z" />
          <path d="M10.5 14 L13 16.5 L18 11" />
        </svg>
      );
    case "knowledge":
      return (
        <svg {...common}>
          <path d="M5 7.5 C7.5 6.5 11.5 6.5 14 8.5 C16.5 6.5 20.5 6.5 23 7.5 V20.5 C20.5 19.5 16.5 19.5 14 21.5 C11.5 19.5 7.5 19.5 5 20.5 Z" />
          <path d="M14 8.5 V21.5" />
        </svg>
      );
    case "audit":
      return (
        <svg {...common}>
          <rect x="6" y="4.5" width="13" height="18.5" rx="2" />
          <path d="M9.5 9.5 H15.5 M9.5 13.5 H14.5" />
          <circle cx="19" cy="18.5" r="3.2" />
          <path d="M21.4 20.9 L23.5 23" />
        </svg>
      );
  }
}

export function VisionSavannaArtwork() {
  return (
    <svg viewBox="0 0 640 300" preserveAspectRatio="xMidYMid slice" className="beyu-vision-bg-svg" aria-hidden="true">
      <defs>
        <linearGradient id="savannaSky" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1b2b4a" />
          <stop offset="38%" stopColor="#92400e" />
          <stop offset="72%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <radialGradient id="savannaSun" cx="76%" cy="54%" r="36%">
          <stop offset="0%" stopColor="#fef3c7" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#f59e0b" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="640" height="300" fill="url(#savannaSky)" />
      <rect width="640" height="300" fill="url(#savannaSun)" />
      <circle cx="486" cy="162" r="36" fill="#fef3c7" fillOpacity="0.88" />
      {/* Distant Kilimanjaro / ridge silhouette */}
      <path d="M0 218 L120 184 L218 202 L340 162 L448 196 L560 174 L640 198 L640 300 L0 300 Z" fill="#451a03" fillOpacity="0.52" />
      {/* Savanna horizon */}
      <path d="M0 236 Q180 220 360 238 T640 228 L640 300 L0 300 Z" fill="#1c1108" />
      {/* Iconic East African acacia tree silhouette */}
      <g fill="#140c06">
        <path d="M472 246 L468 188 L434 156 L442 152 L472 178 L480 150 L488 152 L482 182 L524 156 L530 162 L484 194 L486 246 Z" />
        <ellipse cx="480" cy="146" rx="84" ry="18" />
        <ellipse cx="436" cy="154" rx="44" ry="11" />
        <ellipse cx="526" cy="156" rx="42" ry="11" />
      </g>
      {/* Left readability scrim */}
      <rect width="420" height="300" fill="url(#savannaScrim)" />
      <defs>
        <linearGradient id="savannaScrim" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#081433" stopOpacity="0.9" />
          <stop offset="72%" stopColor="#081433" stopOpacity="0.48" />
          <stop offset="100%" stopColor="#081433" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function SignInLockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="beyu-signin-lock"
      aria-hidden="true"
    >
      <rect x="4" y="9" width="12" height="8.5" rx="2" />
      <path d="M6.8 9V6.6a3.2 3.2 0 0 1 6.4 0V9" />
    </svg>
  );
}

export function QuickAccessIcon({
  kind,
}: {
  kind: "services" | "announcements" | "calendar" | "directory" | "partner";
}) {
  const common = {
    viewBox: "0 0 24 24",
    width: 18,
    height: 18,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.85,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "beyu-quick-icon",
    "aria-hidden": true as const,
  };

  switch (kind) {
    case "services":
      return (
        <svg {...common}>
          <rect x="3.5" y="7" width="17" height="12.5" rx="2.2" />
          <path d="M8.5 7V5.4A1.9 1.9 0 0 1 10.4 3.5h3.2a1.9 1.9 0 0 1 1.9 1.9V7" />
          <path d="M3.5 12h17" />
        </svg>
      );
    case "announcements":
      return (
        <svg {...common}>
          <path d="M4 13.5v-3a1.5 1.5 0 0 1 1.5-1.5H9l8-4v14l-8-4H5.5A1.5 1.5 0 0 1 4 13.5Z" />
          <path d="M9 15l1.3 4.2" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
          <path d="M8 3.5v3.5M16 3.5v3.5M3.5 10h17M8.5 14h2M13.5 14h2" />
        </svg>
      );
    case "directory":
      return (
        <svg {...common}>
          <path d="M4.5 20.5V5.5L12 3l7.5 2.5v15" />
          <path d="M3 20.5h18M9 9h2M13 9h2M9 13h2M13 13h2M11 20.5V17h2v3.5" />
        </svg>
      );
    case "partner":
      return (
        <svg {...common}>
          <circle cx="9" cy="8.5" r="2.8" />
          <path d="M4 19c0-2.6 2.2-4.6 5-4.6s5 2 5 4.6" />
          <circle cx="16.8" cy="9.8" r="2.1" />
          <path d="M16.2 14.8c2 .3 3.8 1.8 3.8 4.2" />
        </svg>
      );
  }
}

export function NewsMegaphoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="beyu-news-megaphone"
      aria-hidden="true"
    >
      <path d="M3.5 13.5v-3A1.5 1.5 0 0 1 5 9h3.8L17.5 4.5v15L8.8 15H5a1.5 1.5 0 0 1-1.5-1.5Z" />
      <path d="M8.5 15l1.5 4.5M20 9.5a4 4 0 0 1 0 5" />
    </svg>
  );
}

export function JourneyHandshakeBadge() {
  return (
    <span className="beyu-journey-badge" aria-hidden="true">
      <svg
        viewBox="0 0 40 40"
        width="36"
        height="36"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 19l5.5-5.5a3.5 3.5 0 0 1 5 0l1.5 1.5" />
        <path d="M31 19l-5.5-5.5a3.5 3.5 0 0 0-5 0l-3.2 3.2a2.2 2.2 0 0 0 3.1 3.1l2.2-2.2" />
        <path d="M13 24l4.5 4.2a2.4 2.4 0 0 0 3.4-.1l6.6-6.6" />
        <path d="M9 19l4 5M31 19l-3.5 3.5" />
      </svg>
    </span>
  );
}

export function FooterWaveAccent() {
  return (
    <svg viewBox="0 0 1440 110" preserveAspectRatio="none" className="beyu-footer-wave" aria-hidden="true">
      <path d="M0,78 C360,12 720,108 1120,42 C1260,18 1365,24 1440,36 L1440,110 L0,110 Z" fill="#163a84" fillOpacity="0.58" />
      <path d="M0,92 C320,44 760,112 1180,52 C1305,34 1388,42 1440,52 L1440,110 L0,110 Z" fill="#d4a017" fillOpacity="0.82" />
      <path d="M0,100 C390,68 820,114 1230,68 C1330,57 1396,62 1440,68 L1440,110 L0,110 Z" fill="#071535" />
    </svg>
  );
}
