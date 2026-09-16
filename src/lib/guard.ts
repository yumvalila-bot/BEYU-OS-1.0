import { redirect } from "next/navigation";
import { can, type Principal } from "./authz";
import { resolvePrincipal } from "./session";

import type { Classification, PermissionCode } from "./constants";

export type PageAccess =
  | { principal: Principal; allowed: true }
  | { principal: Principal; allowed: false; reason: string };

/** Server-component guard. Unauthenticated users are returned to sign-in. */
export async function requirePrincipal(): Promise<Principal> {
  const principal = await resolvePrincipal();
  if (!principal) redirect("/");
  return principal;
}

export async function requireAccess(
  permission: PermissionCode,
  context?: { classification?: Classification; tenantId?: string; entityId?: string },
): Promise<PageAccess> {
  const principal = await requirePrincipal();
  const decision = can(principal, permission, context);
  return decision.allowed
    ? { principal, allowed: true }
    : { principal, allowed: false, reason: decision.reason };
}
