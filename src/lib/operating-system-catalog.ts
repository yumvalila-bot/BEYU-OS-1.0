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

export type OperatingSystemDestination = {
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
export type CanonicalSurfaceDestination = CanonicalHostedDestination & {
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
  },
  {
    code: "AGRICULTURE",
    name: "Agriculture OS",
    level: "SECTOR_OS",
    description: "Farms, crops, livestock, traceability and export operations under BEYU governance.",
    href: "/os/agriculture",
    icon: "agriculture",
    subdomain: "agriculture",
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
  },
  {
    code: "UJENZI",
    name: "Ujenzi OS",
    level: "SECTOR_OS",
    description: "Construction operations: projects, sites, BOQ and cost control, procurement, materials, equipment, site operations, quality, HSE, variations, claims, payment certificates and handover.",
    href: "/os/ujenzi",
    icon: "ujenzi",
    subdomain: "ujenzi",
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
  },
];

export function canonicalSurface(code: CanonicalSurfaceDestination["code"]): CanonicalSurfaceDestination {
  const surface = CANONICAL_SURFACES.find((entry) => entry.code === code);
  if (!surface) throw new Error(`unknown canonical surface: ${code}`);
  return surface;
}
