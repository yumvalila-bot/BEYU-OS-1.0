/**
 * BEYU OS — Mobile Logout Endpoint
 *
 * Accepts bearer token for mobile clients. Revokes the session.
 * Consumes the SAME canonical session infrastructure as web logout.
 */

import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { apiOk } from "@/lib/api";
import { newId, ID_PREFIX } from "@/lib/ids";
import { revokeSession } from "@/lib/session";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sha256 } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const traceId = newId(ID_PREFIX.event);
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return apiOk({ authenticated: false }, traceId);
  }

  const token = authHeader.slice(7);

  // Find session by token hash
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, sha256(token)))
    .limit(1);

  if (!session) {
    return apiOk({ authenticated: false }, traceId);
  }

  // Build a minimal principal for tenant context
  const principal = {
    userId: session.userId,
    tenantId: session.tenantId,
    sessionId: session.id,
  };

  await withTenantDatabaseContext(principal as any, async () => {
    await revokeSession(token);
    await recordAudit({
      tenantId: session.tenantId,
      actorUserId: session.userId,
      action: "identity.mobile.logout",
      objectType: "SESSION",
      objectId: session.id,
      traceId,
    });
  });

  return apiOk({ authenticated: false }, traceId);
}
