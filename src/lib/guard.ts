import { redirect } from "next/navigation";
import { can, type Principal } from "./authz";
import { foundationTargetScopeDenial } from "./foundation/target-scope";
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
  if (!decision.allowed) {
    return { principal, allowed: false, reason: decision.reason };
  }

  /**
   * Foundation OS target scope, enforced per page as well as per layout.
   *
   * The Foundation layout refuses a deep link whose canonical Foundation target
   * tenant is outside the principal's resolved tenant/classification scope, and
   * the API boundary enforces the same rule for every `foundation:*` route. This
   * check makes each Foundation PAGE deny on its own authority too: it runs
   * before the page loads a single Foundation row and before any domain service
   * is reached, so a page that renders outside its layout (for example during a
   * concurrent server render that is later discarded) still fails closed with
   * the governed denial panel instead of attempting a read it is not entitled to.
   *
   * It is the same boundary, resolved by the same canonical resolver — not a
   * second authorization model.
   */
  if (permission.startsWith("foundation:")) {
    const reason = await foundationTargetScopeDenial(principal);
    if (reason) return { principal, allowed: false, reason };
  }

  return { principal, allowed: true };
}
