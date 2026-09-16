import type { ReactNode } from "react";

/**
 * BEYU OS capability icon set.
 *
 * The repository ships no icon library and the mandate is to reuse what exists
 * rather than add dependencies. These are self-drawn, stroke-only 24px glyphs
 * (heroicon-style primitives) defined ONCE here so navigation, the capability
 * map and every future surface share a single source of truth.
 *
 * They are semantic UI icons — deliberately NOT the BEYU brand mark, whose
 * geometry lives exclusively in /public/brand/* via <BeyuLogo /> (pinned by
 * tests/frontend/brand-identity.test.ts).
 *
 * Accessibility: icons are decorative by default (`aria-hidden`) — every use
 * site renders a visible text label next to the icon, so the icon never
 * carries meaning alone. Pass `decorative={false}` + `title` only where an
 * icon genuinely stands without a text label.
 */

export type IconName =
  | "command"
  | "registry"
  | "hierarchy"
  | "identity"
  | "accessibility"
  | "org"
  | "ownership"
  | "governance"
  | "constitution"
  | "compliance"
  | "risk"
  | "audit"
  | "documents"
  | "workflow"
  | "bell"
  | "events"
  | "security"
  | "settings"
  | "legal"
  | "tax"
  | "contracts"
  | "blockchain"
  | "government"
  | "payments"
  | "hcm"
  | "hive"
  | "assurance"
  | "health"
  | "finance"
  | "capital"
  | "waterfall"
  | "agriculture"
  | "foundation"
  | "family"
  | "protection";

const GLYPHS: Record<IconName, ReactNode> = {
  /* Executive Control Centre — command grid with focal point */
  command: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <circle cx="17" cy="17" r="3.5" />
    </>
  ),
  /* OS & Source-of-Truth Registry — governed database */
  registry: (
    <>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
      <path d="M4.5 5.5v6.2c0 1.6 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V5.5" />
      <path d="M4.5 11.7v6.2c0 1.6 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-6.2" />
    </>
  ),
  /* Organisation & Ownership — control hierarchy */
  hierarchy: (
    <>
      <rect x="9" y="3" width="6" height="4.4" rx="1.2" />
      <rect x="3" y="16.6" width="6" height="4.4" rx="1.2" />
      <rect x="15" y="16.6" width="6" height="4.4" rx="1.2" />
      <path d="M12 7.4v4.2M6 16.6v-2.4c0-1.4 1-2.6 2.6-2.6h6.8c1.6 0 2.6 1.2 2.6 2.6v2.4" />
    </>
  ),
  /* Identity — credential / GlobalUserID */
  identity: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9.2" cy="11" r="2.4" />
      <path d="M6.4 16.4c.5-1.7 1.5-2.6 2.8-2.6s2.3.9 2.8 2.6M15 9.6h3.4M15 13.2h3.4" />
    </>
  ),
  /* Accessibility — person with inclusive reach */
  accessibility: (
    <>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M4.5 8.5c4.6 1.6 10.4 1.6 15 0M12 9.8v5.1M8.6 21l3.4-6.1 3.4 6.1M8.2 11.2l-2.5 4.2M15.8 11.2l2.5 4.2" />
    </>
  ),
  /* Organisation (shared capability) — institution building */
  org: (
    <>
      <path d="M4 20.5V9.2L12 3.8l8 5.4v11.3" />
      <path d="M2.8 20.5h18.4" />
      <path d="M9 20.5v-6h6v6" />
      <path d="M12 8.2v.1" />
    </>
  ),
  /* Ownership — linked share certificate / controlled interest */
  ownership: (
    <>
      <rect x="3.5" y="5" width="11" height="14" rx="2" />
      <path d="M7 9h4M7 12.4h4M7 15.8h2.4" />
      <circle cx="18" cy="9" r="2.6" />
      <circle cx="18" cy="17" r="2.6" />
      <path d="M14.5 10.4l1.2-.6M14.5 15.6l1.2.6" />
    </>
  ),
  /* Governance — scales of accountable decision */
  governance: (
    <>
      <path d="M12 3.6v16.8M8.4 20.4h7.2" />
      <path d="M5 7.4h14" />
      <path d="M7 7.4l-2.8 5.4c.7 1 1.7 1.6 2.8 1.6s2.1-.6 2.8-1.6L7 7.4Z" />
      <path d="M17 7.4l-2.8 5.4c.7 1 1.7 1.6 2.8 1.6s2.1-.6 2.8-1.6L17 7.4Z" />
    </>
  ),
  /* Constitution & Policy — bound constitutional record */
  constitution: (
    <>
      <path d="M6.2 4.4c2.2-.7 4-.3 5.8 1v14c-1.8-1.3-3.6-1.7-5.8-1V4.4Z" />
      <path d="M17.8 4.4c-2.2-.7-4-.3-5.8 1v14c1.8-1.3 3.6-1.7 5.8-1V4.4Z" />
    </>
  ),
  /* Compliance — assessed checklist */
  compliance: (
    <>
      <rect x="5" y="3.6" width="14" height="17" rx="2" />
      <path d="M9 9.2l1.4 1.4 2.6-2.8M9 14.4l1.4 1.4 2.6-2.8M15.6 9.6h1.2M15.6 14.8h1.2" />
    </>
  ),
  /* Risk — shield with alert */
  risk: (
    <>
      <path d="M12 3.2l7.4 2.8v5.6c0 4.6-3 7.8-7.4 9.2-4.4-1.4-7.4-4.6-7.4-9.2V6L12 3.2Z" />
      <path d="M12 8.4v4.4M12 15.8v.1" />
    </>
  ),
  /* Audit — inspected record */
  audit: (
    <>
      <rect x="4.5" y="3.5" width="12" height="17" rx="2" />
      <path d="M8 8h5.5M8 11.4h5.5" />
      <circle cx="15.5" cy="16" r="3.1" />
      <path d="M17.9 18.4l2.1 2.1" />
    </>
  ),
  /* Documents — versioned files */
  documents: (
    <>
      <path d="M8 3.5h6.4L19 8v11a1.6 1.6 0 0 1-1.6 1.6H8A1.6 1.6 0 0 1 6.4 19V5.1A1.6 1.6 0 0 1 8 3.5Z" />
      <path d="M14.2 3.5V8H19" />
      <path d="M9.4 12h5.4M9.4 15.2h5.4" />
    </>
  ),
  /* Workflow — governed approval chain */
  workflow: (
    <>
      <circle cx="5" cy="6" r="2.2" />
      <circle cx="19" cy="6" r="2.2" />
      <circle cx="12" cy="18" r="2.2" />
      <path d="M7 7l3.4 8.8M17 7l-3.4 8.8M7.2 6h9.6" />
    </>
  ),
  /* Notifications — governed alerts */
  bell: (
    <>
      <path d="M12 4a6 6 0 0 0-6 6c0 4.6-1.8 6.2-2.6 6.8h17.2c-.8-.6-2.6-2.2-2.6-6.8a6 6 0 0 0-6-6Z" />
      <path d="M9.8 19.8a2.2 2.2 0 0 0 4.4 0" />
    </>
  ),
  /* Events — dated enterprise stream */
  events: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.6h17M8 3v3.4M16 3v3.4" />
      <path d="M8 13.4h2.6M13.4 13.4H16M8 17h2.6M13.4 17H16" />
    </>
  ),
  /* Security — shield with keyhole */
  security: (
    <>
      <path d="M12 3.2l7.4 2.8v5.6c0 4.6-3 7.8-7.4 9.2-4.4-1.4-7.4-4.6-7.4-9.2V6L12 3.2Z" />
      <circle cx="12" cy="10.4" r="1.8" />
      <path d="M12 12.2v3" />
    </>
  ),
  /* Settings — governed system and device preferences */
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  /* Legal & Liability — sealed instrument */
  legal: (
    <>
      <path d="M7.5 3.5h7L19 8v11a1.6 1.6 0 0 1-1.6 1.6H7.5A1.6 1.6 0 0 1 5.9 19V5.1a1.6 1.6 0 0 1 1.6-1.6Z" />
      <path d="M14.3 3.5V8H19" />
      <path d="M8.8 11.2h2.6" />
      <circle cx="13.6" cy="15.4" r="2.2" />
    </>
  ),
  /* Tax Governance — fiscal receipt */
  tax: (
    <>
      <path d="M6 3.5h12v16.2l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3V3.5Z" />
      <path d="M9.4 8.2h5.2M9.4 11.4h5.2" />
      <path d="M10.2 15.6l3.6-3.6M10.3 12.2v.1M13.7 15.5v.1" />
    </>
  ),
  /* Governed contracts — signed lifecycle record */
  contracts: (
    <>
      <path d="M6 3.5h8l4 4v13H6z" />
      <path d="M14 3.5v4h4M8.7 12h6.6M8.7 15h4.4" />
      <path d="M9 18.2c1.1-1.2 2.2 1 3.3-.2 1-.9 1.7.3 2.7-.2" />
    </>
  ),
  /* Governed blockchain — evidence links, never an authority symbol */
  blockchain: (
    <>
      <path d="M9.2 14.8 7 17a3 3 0 0 1-4.2-4.2l3.1-3.1A3 3 0 0 1 10 9.6" />
      <path d="m14.8 9.2 2.2-2.2a3 3 0 1 1 4.2 4.2l-3.1 3.1a3 3 0 0 1-4.1.1" />
      <path d="m8.5 15.5 7-7" />
    </>
  ),
  /* Government integration gateway — public institution */
  government: (
    <>
      <path d="M3.5 9 12 3.8 20.5 9M5 9h14M6.2 9.5v7M10 9.5v7M14 9.5v7M17.8 9.5v7M4 19.5h16M5 16.5h14" />
    </>
  ),
  /* Payments — governed transaction and settlement rail */
  payments: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.2" />
      <path d="M3 9.5h18M7 15h3.5M16.5 13.2v3.6M14.7 15h3.6" />
    </>
  ),
  /* HCM — governed workforce */
  hcm: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.6 19.6c.7-3 2.7-4.6 5.4-4.6s4.7 1.6 5.4 4.6" />
      <circle cx="16.8" cy="9.2" r="2.5" />
      <path d="M16.4 14.7c2.2.2 3.6 1.6 4 3.9" />
    </>
  ),
  /* Noelia / HIVE — governed intelligence network */
  hive: (
    <>
      <path d="M12 3.4l6 3.4v6.9l-6 3.4-6-3.4V6.8l6-3.4Z" />
      <circle cx="12" cy="10.2" r="1.9" />
      <path d="M12 12.1v2.6M10.1 8.9L8.4 7.6M13.9 8.9l1.7-1.3" />
    </>
  ),
  /* Assurance — verified shield */
  assurance: (
    <>
      <path d="M12 3.2l7.4 2.8v5.6c0 4.6-3 7.8-7.4 9.2-4.4-1.4-7.4-4.6-7.4-9.2V6L12 3.2Z" />
      <path d="M8.8 11.6l2.2 2.2 4.2-4.4" />
    </>
  ),
  /* Health OS — clinical pulse */
  health: (
    <>
      <path d="M12 20.4S4 15.3 4 9.9A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.9c0 5.4-8 10.5-8 10.5Z" />
      <path d="M7.6 12h2.4l1.4-2.6 1.8 4.2 1.2-1.6h2" />
    </>
  ),
  /* Finance OS — ledger institution */
  finance: (
    <>
      <path d="M3.6 9.2L12 3.8l8.4 5.4" />
      <path d="M5 9.2h14" />
      <path d="M6.4 9.6v7.2M10.5 9.6v7.2M13.5 9.6v7.2M17.6 9.6v7.2" />
      <path d="M3.6 19.8h16.8M4.8 16.8h14.4" />
    </>
  ),
  /* Capital & Treasury — governed reserves */
  capital: (
    <>
      <ellipse cx="12" cy="6.4" rx="6.6" ry="2.6" />
      <path d="M5.4 6.4v5c0 1.4 3 2.6 6.6 2.6s6.6-1.2 6.6-2.6v-5" />
      <path d="M5.4 11.4v5c0 1.5 3 2.6 6.6 2.6s6.6-1.1 6.6-2.6v-5" />
    </>
  ),
  /* Waterfall Engine — tiered distribution */
  waterfall: (
    <>
      <path d="M3.5 4.5h4v4h-4z" />
      <path d="M9.5 10h4v4h-4z" />
      <path d="M15.5 15.5h4v4h-4z" />
      <path d="M7.5 6.5h4.5v3.5M13.5 12h4v3.5" />
    </>
  ),
  /* Agriculture OS — cultivated growth */
  agriculture: (
    <>
      <path d="M12 20.6v-8.2" />
      <path d="M12 12.4C12 8.6 9.2 6.2 4.6 6c0 4.9 3 7.4 7.4 6.4Z" />
      <path d="M12 12.4c0-3.8 2.8-6.2 7.4-6.4 0 4.9-3 7.4-7.4 6.4Z" />
      <path d="M7.5 20.6h9" />
    </>
  ),
  /* Foundation OS — community institution */
  foundation: (
    <>
      <path d="M4 9.4L12 4l8 5.4" />
      <path d="M5.6 9.6v7.4M18.4 9.6v7.4" />
      <path d="M3.4 19.8h17.2M4.6 17h14.8" />
      <path d="M12 14.8s-2.1-1.4-2.1-2.8a1.15 1.15 0 0 1 2.1-.7 1.15 1.15 0 0 1 2.1.7c0 1.4-2.1 2.8-2.1 2.8Z" />
    </>
  ),
  /* Family Office — lineage and care */
  family: (
    <>
      <circle cx="8" cy="7.4" r="2.9" />
      <circle cx="16.4" cy="9" r="2.2" />
      <path d="M3.2 19.8c.6-2.7 2.4-4.2 4.8-4.2 1.9 0 3.3.8 4.1 2.2" />
      <path d="M13.9 15.4c.6-.4 1.5-.7 2.5-.7 2.3 0 4 1.4 4.5 3.9" />
    </>
  ),
  /* Protection & Insurance — protective cover */
  protection: (
    <>
      <path d="M12 3.6c3.5 2 5.7 2.2 8.4 2-.3 7.6-3 12.2-8.4 15-5.4-2.8-8.1-7.4-8.4-15 2.7.2 4.9 0 8.4-2Z" />
      <path d="M12 8.6a4.6 4.6 0 0 1 4.6 4.6H7.4A4.6 4.6 0 0 1 12 8.6Z" />
    </>
  ),
};

export function Icon({
  name,
  className = "h-4 w-4",
  decorative = true,
  title,
}: {
  name: IconName;
  className?: string;
  decorative?: boolean;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
      className={className}
    >
      {decorative ? null : <title>{title ?? name}</title>}
      {GLYPHS[name]}
    </svg>
  );
}
