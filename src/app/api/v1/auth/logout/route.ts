import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { recordAudit } from "@/lib/audit";
import { apiOk } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/constants";
import { newId, ID_PREFIX } from "@/lib/ids";
import { resolvePrincipal, revokeSession } from "@/lib/session";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";

export const dynamic = "force-dynamic";

/**
 * Revoke the caller's session and append its audit record in the same
 * tenant-scoped transaction. Invalid/expired cookies are simply cleared; they
 * do not authorize a tenant-less audit write or reveal session state.
 */
export async function POST(): Promise<NextResponse> {
  const traceId = newId(ID_PREFIX.event);
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const principal = token ? await resolvePrincipal() : null;

  if (token && principal) {
    await withTenantDatabaseContext(principal, async () => {
      await revokeSession(token);
      await recordAudit({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        action: "identity.logout",
        objectType: "SESSION",
        objectId: principal.sessionId,
        traceId,
      });
    });
  }

  jar.delete(SESSION_COOKIE);
  return apiOk({ authenticated: false }, traceId);
}
