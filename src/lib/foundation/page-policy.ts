/**
 * Foundation page pre-render requirements. These are refusals only: the page,
 * layout, service and API still independently check their own authority.
 * Keep the individual page checks in sync when adding a page or changing its
 * permissions; a pre-render pass never grants access to a Foundation record.
 */
import { can, type Principal } from "@/lib/authz";
import type { Classification, PermissionCode } from "@/lib/constants";

type Requirement = { permission: PermissionCode; classification: Classification };
const requirement = (permission: PermissionCode, classification: Classification): Requirement => ({ permission, classification });

export const FOUNDATION_PAGE_REQUIREMENTS: Readonly<Record<string, readonly Requirement[]>> = {
  registry: [requirement("foundation:registry.read", "CONFIDENTIAL")],
  formation: [requirement("foundation:formation.read", "CONFIDENTIAL")],
  structures: [requirement("foundation:structure.read", "CONFIDENTIAL")],
  governance: [requirement("foundation:governance.read", "RESTRICTED")],
  tax: [requirement("foundation:tax.read", "RESTRICTED")],
  compliance: [requirement("foundation:compliance.read", "CONFIDENTIAL")],
  donors: [requirement("foundation:donor.read", "RESTRICTED")],
  funds: [requirement("foundation:fund.read", "RESTRICTED")],
  grants: [requirement("foundation:grant.read", "RESTRICTED")],
  programs: [requirement("foundation:program.read", "CONFIDENTIAL"), requirement("foundation:impact.read", "CONFIDENTIAL")],
  beneficiaries: [requirement("foundation:beneficiary.read", "RESTRICTED")],
  operations: [requirement("foundation:procurement.read", "CONFIDENTIAL"), requirement("foundation:asset.read", "CONFIDENTIAL"), requirement("foundation:investment.read", "RESTRICTED"), requirement("foundation:assignment.read", "CONFIDENTIAL")],
  safeguarding: [requirement("foundation:safeguarding.read", "HIGHLY_RESTRICTED")],
};

/** null means an unregistered route is left to the framework's normal 404. */
export function foundationPageRequirements(pathname: string): readonly Requirement[] | null {
  const normalized = pathname.replace(/\/+$/, "");
  if (normalized === "/os/foundation") return Object.values(FOUNDATION_PAGE_REQUIREMENTS).flat();
  const prefix = "/os/foundation/";
  if (!normalized.startsWith(prefix)) return null;
  const segment = normalized.slice(prefix.length);
  return Object.prototype.hasOwnProperty.call(FOUNDATION_PAGE_REQUIREMENTS, segment)
    ? FOUNDATION_PAGE_REQUIREMENTS[segment]
    : null;
}

export function foundationPagePermissionAllowed(principal: Principal, requirements: readonly Requirement[]): boolean {
  return requirements.some(({ permission, classification }) => can(principal, permission, { classification }).allowed);
}
