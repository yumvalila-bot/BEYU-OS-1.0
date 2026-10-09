import type { IconName } from "@/components/icons";
import type { PermissionCode } from "@/lib/constants";

/**
 * PRESENTATION / ROUTING CATALOGUE — ONE registry of what the platform's
 * canonical destinations are. Authorization stays in operating-systems.ts.
 *
 * Two kinds of destination are declared here, and the distinction is
 * architectural, not cosmetic:
 *
 *   1. OPERATING SYSTEMS (`BEYU_CONTROL_PLANE` + `SECTOR_OPERATING_SYSTEMS`)
 *      — the constitutional control plane and the FIVE Sector OSs. Identity is
 *      `os_registry.kind` (`CONTROL_PLANE` / `SECTOR_OS`); this catalogue
 *      mirrors it for presentation.
 *   2. CANONICAL SHARED SURFACES (`CANONICAL_SURFACES`)
 *      — shared capabilities and the governed AI interface. They are NOT
 *      operating systems, they have no `*_OS` code, and they never belong in
 *      `SECTOR_OPERATING_SYSTEMS`: Family Office is `SHARED_FAMILY_OFFICE`
 *      (`kind = SHARED_CAPABILITY`) and Noelia is the single canonical AI
 *      identity `NOELIA_AI` (runtime `HIVE_RUNTIME`).
 *
 * A destination's `subdomain` is PRESENTATION/ROUTING identity only. It is
 * turned into a hostname by `src/lib/canonical-hosts.ts` (catalogue label +
 * deployment apex), and it selects a HOME. It never selects a tenant, role,
 * permission, entity, country or classification, and it never grants access:
 * every route re-runs its own server-side gate on every request, on every host.
 *
 * DESTINATION PRESENTATION (added for the first-class canonical frontends)
 *   Each entry also carries the facts its OWN frontend needs — constitutional
 *   registry code, destination class, global operating status, entry headline,
 *   contextual accent and three honest highlights — so the eight canonical
 *   entry surfaces are driven by ONE registry instead of eight copies. See
 *   `docs/architecture/CANONICAL_DESTINATION_FRONTENDS.md`.
 *
 *   `status` is the GLOBAL operating state of the destination itself. It is
 *   never a statement about any individual identity: whether a signed-in user
 *   may enter is answered only by the pre-existing server-side authorization
 *   (`authorizedOperatingSystems()` in `src/lib/operating-systems.ts` for a
 *   Sector OS, the destination's own declared guard for a shared surface,
 *   `checkBeyuOSAuthorization()` for the control plane). An ACTIVE destination
 *   and a user who does not hold access to it are both true at the same time.
 */

/** A destination that is independently addressable on its own canonical host. */
export type CanonicalHostedDestination = {
  href: string;
  /** Canonical host LABEL — `<label>.<apex>` (see src/lib/canonical-hosts.ts). */
  subdomain?: string;
};

/** The canonical OS subdomain labels — one per independently addressable OS. */
export type SectorSubdomainLabel = "health" | "finance" | "agriculture" | "ujenzi" | "foundation";

/** The canonical host labels of the SHARED surfaces (never OS labels). */
export type SurfaceHostLabel = "familyoffice" | "noelia";

/**
 * The GLOBAL operating state of a canonical destination.
 *
 * Mirrors the constitutional charter column `os_registry.lifecycle`, whose
 * canonical seed already reads `ACTIVE` for `BEYU_OS`, `FINANCE_OS`,
 * `HEALTH_OS`, `AGRICULTURE_OS`, `FOUNDATION_OS` and `UJENZI_OS`
 * (`src/db/seed.ts`) — the only `DRAFT` charter in that seed is the proposed
 * mining OS, which is deliberately absent from this catalogue because it has no
 * host, no frontend and no entry point. Nothing here was flipped to make a
 * destination look live.
 */
export type CanonicalDestinationStatus = "ACTIVE" | "DRAFT" | "RETIRED";

/**
 * Destination CLASS — kept explicit in code and documentation so the ecosystem
 * is never flattened into "OS". Exactly four destinations are `SECTOR_OS`.
 *
 *   CORE          the one constitutional control plane (BEYU OS).
 *   SECTOR_OS     HEALTH_OS, FINANCE_OS, AGRICULTURE_OS, UJENZI_OS.
 *   NONPROFIT     Foundation — a separate nonprofit SISTER ORGANISATION to the
 *                 BEYU Holding Company, strategically governed through BEYU OS.
 *                 It is not a Sector LLC. It keeps its already-registered
 *                 constitutional identity (`FOUNDATION_OS`, `os_registry.kind =
 *                 SECTOR_OS`, authority scope `NONPROFIT_OPERATIONS`); this
 *                 class records the organisational distinction that the
 *                 registry `kind` cannot express, and invents nothing.
 *   CAPABILITY    Family Office — a shared capability/domain, never an OS. It is
 *                 given no OS-suffixed identity of its own, here or anywhere.
 *   AI_INTERFACE  NOELIA_AI — the single governed AI identity on the HIVE
 *                 runtime. No sector-specific Noelia exists.
 */
export type DestinationType = "CORE" | "SECTOR_OS" | "NONPROFIT" | "CAPABILITY" | "AI_INTERFACE";

/** The facts a destination's OWN first-class frontend renders. */
export type CanonicalDestinationPresentation = {
  /** Constitutional charter code in `os_registry` (documentation/UI identity). */
  registryCode: string;
  /** Destination class — see `DestinationType`. */
  destinationType: DestinationType;
  /** GLOBAL operating state. Never a statement about any individual identity. */
  status: CanonicalDestinationStatus;
  /** Headline of the destination's own entry surface. */
  headline: string;
  /**
   * Contextual accent for the destination's own surface. The canonical BEYU
   * identity is preserved regardless: navy `#0B1F4D`, gold `#D4A017`, the
   * shared `BeyuOsLogo`, the motto "Bridging Care. Building Trust." and the
   * pillars Trust · Care · Integrity · Innovation · Impact. No destination- or
   * tenant-specific BEYU logo exists or may be created.
   */
  accent: string;
  /** Three honest highlights. They must not claim ungoverned capability. */
  highlights: readonly string[];
};

export type OperatingSystemDestination = CanonicalDestinationPresentation & {
  code: "BEYU" | "FINANCE" | "HEALTH" | "AGRICULTURE" | "FOUNDATION" | "UJENZI";
  name: string;
  level: "CONTROL_PLANE" | "SECTOR_OS";
  description: string;
  href: string;
  icon: IconName;
  /**
   * Canonical OS host LABEL (`health` → `health.<apex>`), present on every OS
   * that is independently addressable as a user entry point. The apex is
   * deployment configuration (`BEYU_CANONICAL_DOMAIN`), resolved by
   * `src/lib/canonical-hosts.ts`. Presentation/routing identity only.
   */
  subdomain?: SectorSubdomainLabel;
};

/**
 * A canonical SHARED SURFACE: independently addressable on its own canonical
 * host, never an operating system.
 *
 * `entryPermission` is the destination's OWN server-side guard, declared here so
 * routing and navigation never promise a surface the backend would deny (the
 * same honesty rule the capability IA follows with `visible()`). It is NOT an
 * authorization mechanism and it grants nothing: the page still calls
 * `requireAccess(<entryPermission>)` itself, and a test pins that the declared
 * code and the page's guard are identical.
 */
export type CanonicalSurfaceDestination = CanonicalHostedDestination &
  CanonicalDestinationPresentation & {
    code: "FAMILY_OFFICE" | "NOELIA_AI";
    name: string;
    kind: "SHARED_CAPABILITY" | "GOVERNED_AI_INTERFACE";
    description: string;
    href: string;
    icon: IconName;
    subdomain: SurfaceHostLabel;
    entryPermission: PermissionCode;
  };

export const BEYU_CONTROL_PLANE: OperatingSystemDestination = {
  code: "BEYU",
  name: "BEYU OS",
  level: "CONTROL_PLANE",
  description: "Global constitutional control plane, enterprise kernel and governed intelligence layer.",
  href: "/os",
  icon: "command",
  registryCode: "BEYU_OS",
  destinationType: "CORE",
  status: "ACTIVE",
  headline: "The constitutional control plane of the BEYU ecosystem.",
  accent: "#d4af37",
  highlights: [
    "One constitution, one authority model, one audit truth.",
    "Identity, governance, risk, capital, workforce and AI governed once.",
    "Least privilege, hash-chained audit, human accountability.",
  ],
};

/** Canonical Sector OS order. Shared capabilities never belong in this list. */
export const SECTOR_OPERATING_SYSTEMS: OperatingSystemDestination[] = [
  {
    code: "FINANCE",
    name: "Finance OS",
    level: "SECTOR_OS",
    description: "Canonical financial authority for ledger, periods, treasury, tax and reconciliation.",
    href: "/os/finance",
    icon: "finance",
    subdomain: "finance",
    registryCode: "FINANCE_OS",
    destinationType: "SECTOR_OS",
    status: "ACTIVE",
    headline: "Finance OS — the canonical financial authority of the BEYU ecosystem.",
    accent: "#e0b64c",
    highlights: [
      "Ledger, periods, treasury, capital, waterfall, tax and reconciliation.",
      "Financial history is never overwritten.",
      "CAP_POSTING stays a separately governed capability — an ACTIVE Finance OS does not enable posting.",
    ],
  },
  {
    code: "HEALTH",
    name: "Health OS",
    level: "SECTOR_OS",
    description: "Federated healthcare operations under canonical BEYU identity and Health authorization.",
    // Canonical Sector OS route. The Health OS implementation itself is the
    // EXISTING federated sector SPA; `/os/health` mounts it behind the same
    // server-side session + federation gate as before. `/health` (entry/denial
    // surface) and `/health/os` (the original mount URL) remain functional
    // aliases — no second implementation, no second shell.
    href: "/os/health",
    icon: "health",
    subdomain: "health",
    registryCode: "HEALTH_OS",
    destinationType: "SECTOR_OS",
    status: "ACTIVE",
    headline: "Health OS — federated care operations under canonical BEYU identity.",
    accent: "#5ec8b4",
    highlights: [
      "Care delivery, clinical operations and health federation.",
      "The highest data tier, safeguarding and evidence trails.",
      "Health federation is resolved server-side on every request.",
    ],
  },
  {
    code: "AGRICULTURE",
    name: "Agriculture OS",
    level: "SECTOR_OS",
    description: "Farms, crops, livestock, traceability and export operations under BEYU governance.",
    href: "/os/agriculture",
    icon: "agriculture",
    subdomain: "agriculture",
    registryCode: "AGRICULTURE_OS",
    destinationType: "SECTOR_OS",
    status: "ACTIVE",
    headline: "Agriculture OS — farms, crops, livestock, traceability and export operations.",
    accent: "#8dc63f",
    highlights: [
      "Land, crop cycles, inputs, livestock, harvests and field tasks.",
      "Traceability and export compliance, end to end.",
      "The canonical Agriculture scope is resolved server-side on every request.",
    ],
  },
  {
    code: "FOUNDATION",
    name: "Foundation OS",
    level: "SECTOR_OS",
    description: "Foundation formation, grants, programs, safeguarding and impact under shared controls.",
    // The nonprofit sister organisation's canonical operating system
    // (`os_registry.code = FOUNDATION_OS`, `kind = SECTOR_OS`, authority scope
    // NONPROFIT_OPERATIONS). It is a Sector OS EXACTLY as already registered —
    // no new identity, no Sector LLC, no rename — and its public entry point is
    // `foundation.<apex>`, governed by the same identity, tenant, role,
    // safeguarding and authorization model as the existing `/os/foundation`.
    href: "/os/foundation",
    icon: "foundation",
    subdomain: "foundation",
    registryCode: "FOUNDATION_OS",
    // NONPROFIT, not SECTOR_OS: the Foundation is a separate nonprofit SISTER
    // ORGANISATION to the BEYU Holding Company, strategically governed through
    // BEYU OS. Its constitutional identity above is unchanged.
    destinationType: "NONPROFIT",
    status: "ACTIVE",
    headline: "Foundation — the nonprofit sister organisation of the BEYU Holding Company.",
    accent: "#9aa7f0",
    highlights: [
      "A nonprofit sister organisation — not a Sector LLC.",
      "Formation, structures, governance, donors, funds, grants and programs.",
      "Safeguarding, beneficiaries and impact under shared controls.",
    ],
  },
  {
    code: "UJENZI",
    name: "Ujenzi OS",
    level: "SECTOR_OS",
    description: "Construction operations: projects, sites, BOQ and cost control, procurement, materials, equipment, site operations, quality, HSE, variations, claims, payment certificates and handover.",
    href: "/os/ujenzi",
    icon: "ujenzi",
    subdomain: "ujenzi",
    registryCode: "UJENZI_OS",
    destinationType: "SECTOR_OS",
    status: "ACTIVE",
    headline: "Ujenzi OS — the governed engineering and construction operating system.",
    accent: "#f0913a",
    highlights: [
      "Projects, sites, phases, milestones and governed BOQ versions.",
      "Cost control, procurement, materials, equipment, quality and HSE.",
      "An ACTIVE Ujenzi OS does not certify every capability: BIM, engineering calculations and government links keep their own governed state.",
    ],
  },
];

/**
 * Canonical SHARED SURFACES — independently addressable, never operating
 * systems, never in `SECTOR_OPERATING_SYSTEMS`, never given an `*_OS` code.
 *
 * Both are control-plane surfaces served in place on EVERY canonical host
 * (exactly as `/os/hcm`, `/os/governance` and the rest of the shared capability
 * set are): the hostname only decides which one is the DEFAULT entry point.
 */
export const CANONICAL_SURFACES: CanonicalSurfaceDestination[] = [
  {
    code: "FAMILY_OFFICE",
    name: "Family Office",
    kind: "SHARED_CAPABILITY",
    description: "Family governance, lineage, beneficiaries, wealth and protection inside BEYU OS under highly restricted grants — a shared capability/domain, never an OS.",
    href: "/os/family",
    icon: "family",
    subdomain: "familyoffice",
    // The Family Office page's own guard (`src/app/os/family/page.tsx`).
    entryPermission: "family:member.read",
    registryCode: "SHARED_FAMILY_OFFICE",
    destinationType: "CAPABILITY",
    status: "ACTIVE",
    headline: "Family Office — the shared family governance and wealth capability.",
    accent: "#e7c45c",
    highlights: [
      "A shared capability/domain inside BEYU OS — never an OS.",
      "Family governance, lineage, beneficiaries and succession.",
      "Wealth, capital and protection under highly restricted grants.",
    ],
  },
  {
    code: "NOELIA_AI",
    name: "Noelia AI",
    kind: "GOVERNED_AI_INTERFACE",
    description: "The single governed BEYU AI identity (NOELIA_AI) over the HIVE runtime: policy-bound, audited, never self-authorizing and never a sector-specific identity.",
    href: "/os/noelia",
    icon: "hive",
    subdomain: "noelia",
    // The Noelia page's own guard (`src/app/os/noelia/page.tsx`).
    entryPermission: "ai:noelia.query",
    registryCode: "NOELIA_AI",
    destinationType: "AI_INTERFACE",
    status: "ACTIVE",
    headline: "Noelia — the single governed BEYU AI identity on the HIVE runtime.",
    accent: "#7ee0f5",
    highlights: [
      "ONE governed AI identity — never a sector-specific manifestation.",
      "Policy-bound on the HIVE runtime, audited end to end.",
      "Advisory by design: material decisions keep human accountability.",
    ],
  },
];

export function canonicalSurface(code: CanonicalSurfaceDestination["code"]): CanonicalSurfaceDestination {
  const surface = CANONICAL_SURFACES.find((entry) => entry.code === code);
  if (!surface) throw new Error(`unknown canonical surface: ${code}`);
  return surface;
}

/**
 * The ONE sign-in sub-line for a canonical destination:
 * `Sign in to Health OS — governed by BEYU OS`.
 *
 * Authentication is shared; only the presentation names the destination that
 * asked for it. Defined once here so the root entry surface, the `/sign-in`
 * route and any future destination surface cannot drift apart.
 */
export function destinationSignInSubtitle(destination: Pick<OperatingSystemDestination, "name">): string {
  return `Sign in to ${destination.name} — governed by BEYU OS`;
}

/** The destination class label shown on a destination's own entry surface. */
export const DESTINATION_TYPE_LABEL: Record<DestinationType, string> = {
  CORE: "Constitutional control plane",
  SECTOR_OS: "Sector operating system",
  NONPROFIT: "Nonprofit sister organisation",
  CAPABILITY: "Shared capability / domain",
  AI_INTERFACE: "Governed AI interface",
};
