/**
 * BEYU OS — Mobile Session Check Endpoint
 *
 * Accepts bearer token for mobile clients. Returns session validity and principal.
 * Consumes the SAME canonical session infrastructure as web session resolution.
 */

import { NextResponse } from "next/server";
import { newId, ID_PREFIX } from "@/lib/ids";
import { apiOk, apiError } from "@/lib/api";
import { db } from "@/db";
import { sessions, users, parties, tenants } from "@/db/schema";
import { eq, and, gt, isNull } from "drizzle-orm";
import { sha256 } from "@/lib/crypto";
import { loadGrants, permissionsForRoles, clearanceForRoles } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const traceId = newId(ID_PREFIX.event);
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return apiError("UNAUTHORIZED", "Authentication required", 401, traceId);
  }

  const token = authHeader.slice(7);

  // Find and validate session
  const [session] = await db
    .select({
      sessionId: sessions.id,
      userId: sessions.userId,
      tenantId: sessions.tenantId,
      mfaSatisfied: sessions.mfaSatisfied,
      riskScore: sessions.riskScore,
      expiresAt: sessions.expiresAt,
      userStatus: users.status,
      userEmail: users.email,
      partyId: parties.id,
      displayName: parties.displayName,
      tenantCode: tenants.code,
      tenantType: tenants.type,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(parties, eq(parties.id, users.partyId))
    .innerJoin(tenants, eq(tenants.id, sessions.tenantId))
    .where(
      and(
        eq(sessions.tokenHash, sha256(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!session || session.userStatus !== "ACTIVE") {
    return apiError("UNAUTHORIZED", "Invalid or expired session", 401, traceId);
  }

  // Load grants
  const grants = await loadGrants(session.userId, session.tenantId);
  const roleCodes = [...new Set(grants.map((g) => g.code))];
  const entityScope = [...new Set(grants.map((g) => g.entityId).filter((v): v is string => Boolean(v)))];

  return apiOk({
    authenticated: true,
    userId: session.userId,
    partyId: session.partyId,
    email: session.userEmail,
    displayName: session.displayName,
    tenantId: session.tenantId,
    tenantCode: session.tenantCode,
    tenantType: session.tenantType,
    roles: roleCodes,
    permissions: Array.from(permissionsForRoles(roleCodes)),
    clearance: clearanceForRoles(roleCodes),
    entityScope,
    mfaSatisfied: session.mfaSatisfied,
    sessionId: session.sessionId,
    riskScore: session.riskScore,
    expiresAt: session.expiresAt.toISOString(),
  }, traceId);
}
