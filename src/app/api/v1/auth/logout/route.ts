import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { recordAudit } from "@/lib/audit";
import { apiOk, schemaReleasePending } from "@/lib/api";
import type { Principal } from "@/lib/authz";
import { isSchemaCompatibilityError } from "@/lib/schema-compatibility";
import { SESSION_COOKIE } from "@/lib/constants";
import { sessionCookieClearTargets } from "@/lib/session-cookie";
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
  let principal: Principal | null = null;
  try {
    principal = token ? await resolvePrincipal() : null;
  } catch (error) {
    /**
     * A pending database release cannot revoke the session durably, so this
     * route does NOT half-log-out the caller (no cookie clear, no audit row):
     * it reports the release state and leaves the governed session intact for
     * the release screen to explain.
     */
    if (isSchemaCompatibilityError(error)) return schemaReleasePending(traceId);
    throw error;
  }

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

  // Clear EVERY variant the cookie may have been issued with for this host —
  // host-only always, plus the canonical-domain variant when session sharing
  // is configured — so sign-out works on www and on every Sector OS subdomain.
  const h = await headers();
  for (const target of sessionCookieClearTargets(h.get("host"))) {
    jar.delete(target);
  }
  return apiOk({ authenticated: false }, traceId);
}
