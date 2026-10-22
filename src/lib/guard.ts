import { redirect } from "next/navigation";
import { can, type Principal } from "./authz";
import { foundationTargetScopeDenial } from "./foundation/target-scope";
import { isSchemaCompatibilityError, SCHEMA_RELEASE_PATH } from "./schema-compatibility";
import { resolvePrincipal } from "./session";

import type { Classification, PermissionCode } from "./constants";

export type PageAccess =
  | { principal: Principal; allowed: true }
  | { principal: Principal; allowed: false; reason: string };

/**
 * Server-component guard. Unauthenticated users are returned to sign-in.
 *
 * A database that is missing an object this release reads is NOT an
 * authentication outcome. It used to surface here as an uncaught failure, so
 * every authenticated view rendered the route error boundary — a screen that
 * (rightly) says it is not an access decision, but that leaves a deployment
 * state looking like a broken permission. That request is now routed to the
 * governed release screen instead: still denied, still no data read, but named
 * for what it is. Every other failure (unreachable database, permission
 * refused, RLS violation) keeps failing closed as an error.
 */
export async function requirePrincipal(): Promise<Principal> {
  let principal: Principal | null;
  try {
    principal = await resolvePrincipal();
  } catch (error) {
    if (isSchemaCompatibilityError(error)) redirect(SCHEMA_RELEASE_PATH);
    throw error;
  }
  if (!principal) redirect("/");
  return principal;
}

/**
 * The same guard for pages that legitimately render for a signed-out visitor
 * (the sign-in page, the launcher, a sector entry). They must still reach the
 * release screen when a session exists and the database cannot answer for it —
 * otherwise they would redirect the visitor straight back into the failure.
 */
export async function resolvePrincipalForPage(): Promise<Principal | null> {
  try {
    return await resolvePrincipal();
  } catch (error) {
    if (isSchemaCompatibilityError(error)) redirect(SCHEMA_RELEASE_PATH);
    throw error;
  }
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
   * Foundation organization target scope, enforced per page as well as per layout.
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
