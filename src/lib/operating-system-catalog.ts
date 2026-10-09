import type { IconName } from "@/components/icons";
import type { PermissionCode } from "@/lib/constants";

/**
 * PRESENTATION / ROUTING CATALOGUE — the one registry of canonical
 * destinations. Authorization remains in operating-systems.ts.
 *
 * The distinction between destination classes is constitutional, not cosmetic:
 * BEYU is the single control plane; Finance, Health, Agriculture and Ujenzi are
 * exactly the four Sector OSs; Foundation is a separately governed nonprofit
 * sister organization; Family Office is a shared capability; and NOELIA_AI is
 * the single governed AI identity over HIVE.
 *
 * A canonical hostname identifies presentation context only. It never grants a
 * tenant, role, permission, entity, country, classification, or OS scope. Every
 * destination re-runs its own server-side authorization on every request.
 */

/** A destination independently addressable on a canonical host. */
export type CanonicalHostedDestination = {
  href: string;
  /** Canonical host label — `<label>.<deployment apex>`. */
  subdomain?: string;
};

/** Exactly one label for each constitutionally recognised Sector OS. */
export type SectorSubdomainLabel = "health" | "finance" | "agriculture" | "ujenzi";

/** Canonical labels for non-OS destination surfaces. */
export type SurfaceHostLabel = "familyoffice" | "noelia";
export type OrganizationHostLabel = "foundation";

/** Global destination state; never a statement about an identity's access. */
export type CanonicalDestinationStatus = "ACTIVE" | "DRAFT" | "RETIRED";

/**
 * Destination class. `SECTOR_OS` is constitutionally closed at four entries.
 * `NONPROFIT` is Foundation, a separate sister organization—not a Sector LLC,
 * subsidiary, Sector OS, or independently invented OS-suffixed authority.
 */
export type DestinationType =
  | "CORE"
  | "SECTOR_OS"
  | "NONPROFIT"
  | "CAPABILITY"
  | "AI_INTERFACE";

/** Facts rendered by a destination's own first-class frontend. */
export type CanonicalDestinationPresentation = {
  /** Canonical registry/capability identity used for documentation and UI. */
  registryCode: string;
  destinationType: DestinationType;
  /** Global operating state, separate from user-specific authorization. */
  status: CanonicalDestinationStatus;
  headline: string;
  accent: string;
  /** Honest highlights; they must not claim an ungoverned capability. */
  highlights: readonly string[];
};

export type OperatingSystemDestination = CanonicalHostedDestination &
  CanonicalDestinationPresentation & {
    code: "BEYU" | "FINANCE" | "HEALTH" | "AGRICULTURE" | "UJENZI";
    name: string;
    level: "CONTROL_PLANE" | "SECTOR_OS";
    description: string;
    href: string;
    icon: IconName;
    subdomain?: SectorSubdomainLabel;
  };

/**
 * Foundation's presentation context. Its live tenant, legal-entity,
 * classification, RBAC/ABAC, and RLS facts remain authoritative; this record
 * grants nothing and deliberately does not place Foundation in the OS hierarchy.
 */
export type OrganizationalContextDestination = CanonicalHostedDestination &
  CanonicalDestinationPresentation & {
    code: "FOUNDATION";
    name: string;
    level: "SISTER_ORGANIZATION";
    kind: "NONPROFIT_SISTER_ORGANIZATION";
    description: string;
    href: string;
    icon: IconName;
    subdomain: OrganizationHostLabel;
  };

/**
 * A canonical shared surface, never an operating system. `entryPermission` is
 * the same guard declared by the target page; it is descriptive and grants
 * nothing. Foundation is not in this type because its gate is the conjunction
 * of live target-tenant scope and one of its governed read grants, not a single
 * flattened permission.
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

export type CanonicalNonOSDestination =
  | OrganizationalContextDestination
  | CanonicalSurfaceDestination;

/** Launchable governed destinations; shared preview surfaces are resolved separately. */
export type GovernedDestination =
  | OperatingSystemDestination
  | OrganizationalContextDestination;

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

/** Canonical Sector OS order. This list is constitutionally closed at four. */
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
      "CAP_POSTING stays separately governed—an ACTIVE Finance OS does not enable posting.",
    ],
  },
  {
    code: "HEALTH",
    name: "Health OS",
    level: "SECTOR_OS",
    description: "Federated healthcare operations under canonical BEYU identity and Health authorization.",
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
 * BEYU Foundation is a separately governed nonprofit sister organization. Its
 * canonical host is an independent entry point, not evidence of OS status.
 */
export const FOUNDATION_ORGANIZATION: OrganizationalContextDestination = {
  code: "FOUNDATION",
  name: "BEYU Foundation",
  level: "SISTER_ORGANIZATION",
  kind: "NONPROFIT_SISTER_ORGANIZATION",
  description: "Separate nonprofit sister organization: formation, grants, programs, safeguarding and impact under its own governed scope.",
  href: "/os/foundation",
  icon: "foundation",
  subdomain: "foundation",
  registryCode: "SHARED_FOUNDATION_OPERATIONS",
  destinationType: "NONPROFIT",
  status: "ACTIVE",
  headline: "Foundation — the nonprofit sister organization governed alongside the BEYU ecosystem.",
  accent: "#9aa7f0",
  highlights: [
    "A nonprofit sister organization—not a subsidiary, Sector LLC, or Sector OS.",
    "Formation, structures, governance, donors, funds, grants and programs.",
    "Safeguarding, beneficiaries and impact under shared BEYU controls.",
  ],
};

/** Canonical shared surfaces—independently addressable and never OSs. */
export const CANONICAL_SURFACES: CanonicalSurfaceDestination[] = [
  {
    code: "FAMILY_OFFICE",
    name: "Family Office",
    kind: "SHARED_CAPABILITY",
    description: "Family governance, lineage, beneficiaries, wealth and protection inside BEYU OS under highly restricted grants—a shared capability/domain, never an OS.",
    href: "/os/family",
    icon: "family",
    subdomain: "familyoffice",
    entryPermission: "family:member.read",
    registryCode: "SHARED_FAMILY_OFFICE",
    destinationType: "CAPABILITY",
    status: "ACTIVE",
    headline: "Family Office — the shared family governance and wealth capability.",
    accent: "#e7c45c",
    highlights: [
      "A shared capability/domain inside BEYU OS—never an OS.",
      "Family governance, lineage, beneficiaries and succession.",
      "Wealth, capital and protection under highly restricted grants.",
    ],
  },
  {
    code: "NOELIA_AI",
    name: "Noelia AI",
    kind: "GOVERNED_AI_INTERFACE",
    description: "The single governed BEYU AI identity (NOELIA_AI) over HIVE: policy-bound, audited, never self-authorizing and never sector-specific.",
    href: "/os/noelia",
    icon: "hive",
    subdomain: "noelia",
    entryPermission: "ai:noelia.query",
    registryCode: "NOELIA_AI",
    destinationType: "AI_INTERFACE",
    status: "ACTIVE",
    headline: "Noelia — the single governed BEYU AI identity on the HIVE runtime.",
    accent: "#7ee0f5",
    highlights: [
      "One governed AI identity—never a sector-specific manifestation.",
      "Policy-bound on HIVE and audited end to end.",
      "Advisory by design: material decisions retain human accountability.",
    ],
  },
];

/** Every canonical non-OS host, kept separate from the four-OS catalogue. */
export const CANONICAL_NON_OS_DESTINATIONS: CanonicalNonOSDestination[] = [
  FOUNDATION_ORGANIZATION,
  ...CANONICAL_SURFACES,
];

/** Governed organization/OS routes used by navigation and launch resolution. */
export const GOVERNED_ROUTE_DESTINATIONS: GovernedDestination[] = [
  ...SECTOR_OPERATING_SYSTEMS,
  FOUNDATION_ORGANIZATION,
];

export function canonicalSurface(
  code: CanonicalSurfaceDestination["code"],
): CanonicalSurfaceDestination {
  const surface = CANONICAL_SURFACES.find((entry) => entry.code === code);
  if (!surface) throw new Error(`unknown canonical surface: ${code}`);
  return surface;
}

/** Shared sign-in subtitle; presentation only. */
export function destinationSignInSubtitle(destination: { name: string }): string {
  return `Sign in to ${destination.name} — governed by BEYU OS`;
}

export const DESTINATION_TYPE_LABEL: Record<DestinationType, string> = {
  CORE: "Constitutional control plane",
  SECTOR_OS: "Sector operating system",
  NONPROFIT: "Nonprofit sister organization",
  CAPABILITY: "Shared capability / domain",
  AI_INTERFACE: "Governed AI interface",
};
