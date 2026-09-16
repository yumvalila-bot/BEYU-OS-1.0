import type { IconName } from "@/components/icons";
import { can, type Principal } from "@/lib/authz";
import type { PermissionCode } from "@/lib/constants";
import { checkHealthOSAuthorization } from "@/lib/health-os-authorization";
import { checkBeyuOSAuthorization } from "@/lib/os-authorization";

export type OperatingSystemDestination = {
  code: "BEYU" | "FINANCE" | "HEALTH" | "AGRICULTURE" | "FOUNDATION";
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
    href: "/health",
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
];

export const FINANCE_OS_READ_PERMISSIONS: PermissionCode[] = [
  "finance:ledger.read",
  "finance:treasury.read",
  "finance:capital.read",
  "finance:waterfall.read",
  "finance:tax.read",
  "finance:payments.read",
];

export const FOUNDATION_OS_READ_PERMISSIONS: PermissionCode[] = [
  "foundation:registry.read",
  "foundation:formation.read",
  "foundation:structure.read",
  "foundation:governance.read",
  "foundation:tax.read",
  "foundation:compliance.read",
  "foundation:donor.read",
  "foundation:fund.read",
  "foundation:grant.read",
  "foundation:program.read",
  "foundation:beneficiary.read",
  "foundation:procurement.read",
  "foundation:asset.read",
  "foundation:investment.read",
  "foundation:safeguarding.read",
  "foundation:impact.read",
  "foundation:assignment.read",
];

/**
 * Resolve launchable operating systems from governed authorization facts.
 *
 * BEYU is the one constitutional control plane. Finance, Health, Agriculture
 * and Foundation are Sector OSs beneath it. A destination returned here is a
 * discoverable launch target, never an authorization token: its route performs
 * the same server-side check again, and every nested capability retains its own
 * RBAC/ABAC/RLS boundary.
 */
export async function authorizedOperatingSystems(
  principal: Principal,
): Promise<OperatingSystemDestination[]> {
  const health = await checkHealthOSAuthorization(principal.userId);
  const allowed = new Set<OperatingSystemDestination["code"]>();

  if (checkBeyuOSAuthorization(principal).authorized) allowed.add("BEYU");
  if (FINANCE_OS_READ_PERMISSIONS.some((permission) => can(principal, permission).allowed)) {
    allowed.add("FINANCE");
  }
  if (health.authorized) allowed.add("HEALTH");
  if (can(principal, "agriculture:data.read").allowed) allowed.add("AGRICULTURE");
  if (FOUNDATION_OS_READ_PERMISSIONS.some((permission) => can(principal, permission).allowed)) {
    allowed.add("FOUNDATION");
  }

  return [BEYU_CONTROL_PLANE, ...SECTOR_OPERATING_SYSTEMS].filter((destination) =>
    allowed.has(destination.code),
  );
}
