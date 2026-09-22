import type { IconName } from "@/components/icons";

/** Presentation catalogue only. Authorization stays in operating-systems.ts. */
export type OperatingSystemDestination = {
  code: "BEYU" | "FINANCE" | "HEALTH" | "AGRICULTURE" | "FOUNDATION" | "UJENZI";
  name: string;
  level: "CONTROL_PLANE" | "SECTOR_OS";
  description: string;
  href: string;
  icon: IconName;
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
  },
  {
    code: "AGRICULTURE",
    name: "Agriculture OS",
    level: "SECTOR_OS",
    description: "Farms, crops, livestock, traceability and export operations under BEYU governance.",
    href: "/os/agriculture",
    icon: "agriculture",
  },
  {
    code: "FOUNDATION",
    name: "Foundation OS",
    level: "SECTOR_OS",
    description: "Foundation formation, grants, programs, safeguarding and impact under shared controls.",
    href: "/os/foundation",
    icon: "foundation",
  },
  {
    code: "UJENZI",
    name: "Ujenzi OS",
    level: "SECTOR_OS",
    description: "Construction operations: projects, sites, BOQ and cost control, procurement, materials, equipment, site operations, quality, HSE, variations, claims, payment certificates and handover.",
    href: "/os/ujenzi",
    icon: "ujenzi",
  },
];
