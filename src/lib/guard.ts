import { redirect } from "next/navigation";
import { can, type Principal } from "./authz";
import { resolvePrincipal } from "./session";
import { setDatabaseTenantContext } from "./tenant-scope";
import type { PermissionCode } from "./constants";

export type PageAccess =
  | { principal: Principal; allowed: true }
  | { principal: Principal; allowed: false; reason: string };

/** Server-component guard. Unauthenticated users are returned to sign-in. */
export async function requirePrincipal(): Promise<Principal> {
  const principal = await resolvePrincipal();
  if (!principal) redirect("/");
  await setDatabaseTenantContext(principal);
  return principal;
}

export async function requireAccess(permission: PermissionCode): Promise<PageAccess> {
  const principal = await requirePrincipal();
  const decision = can(principal, permission);
  return decision.allowed
    ? { principal, allowed: true }
    : { principal, allowed: false, reason: decision.reason };
}
