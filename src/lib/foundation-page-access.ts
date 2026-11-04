/** Foundation page authorization: each page checks independently of its layout. */
import type { Principal } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { ID_PREFIX, newId } from "@/lib/ids";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { resolveFoundationTargetScope } from "./foundation/target-scope";

/** Audit failures cannot turn a denial into an authorization. */
export async function auditFoundationPageDenial(principal: Principal, resource: string, reason: string): Promise<void> {
  const traceId = newId(ID_PREFIX.event);
  try {
    await withTenantDatabaseContext(principal, () => recordAudit({
      tenantId: principal.tenantId,
      actorUserId: principal.userId,
      action: "foundation.page.access",
      objectType: "FOUNDATION_PAGE",
      objectId: resource,
      outcome: "DENIED",
      reason,
      traceId,
      newValue: { entityScope: principal.entityScope },
    }));
  } catch {
    // A failing audit backend is a technical failure, not an authorization.
    // Avoid emitting request data or credentials into the application log.
    console.error(JSON.stringify({ event: "foundation_page_denial_audit_failed", traceId }));
  }
}

export async function foundationPageScopeAllowed(principal: Principal, resource: string): Promise<boolean> {
  let result;
  try {
    result = await resolveFoundationTargetScope(principal);
  } catch {
    // Infrastructure failure is deliberately not labelled an access denial.
    console.error(JSON.stringify({ event: "foundation_page_authorization_unavailable" }));
    return false;
  }
  if (result.ok) return true;
  await auditFoundationPageDenial(principal, resource, "FOUNDATION_SCOPE_DENIED");
  return false;
}
