/**
 * BEYU OS — Mobile Authorization Context Endpoint
 *
 * Accepts bearer token for mobile clients.
 * Returns the SAME authorization context as the web endpoint.
 * Consumes the SAME canonical authorization infrastructure.
 */

import { NextResponse } from "next/server";
import { recordAudit, publishEvent } from "@/lib/audit";
import { newId, ID_PREFIX } from "@/lib/ids";
import { apiOk, apiError } from "@/lib/api";
import { db } from "@/db";
import { sessions, users, parties, tenants } from "@/db/schema";
import { eq, and, gt, isNull } from "drizzle-orm";
import { sha256 } from "@/lib/crypto";
import { loadGrants, permissionsForRoles } from "@/lib/authz";
import { checkHealthOSAuthorization } from "@/lib/health-os-authorization";

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

  // Resolve OS authorizations (same as web)
  const healthAuth = await checkHealthOSAuthorization(session.userId);

  // Build authorization context
  const authorizedOSs: Array<{
    osCode: string;
    osName: string;
    authorized: boolean;
    tenantId?: string;
    tenantCode?: string;
    entityScope?: string[];
    roles?: string[];
    permissions?: string[];
    sectorUserId?: string;
    linkedAt?: string;
  }> = [];

  // BEYU OS: Always authorized if user has a valid session
  authorizedOSs.push({
    osCode: "BEYU",
    osName: "BEYU OS (Control Plane)",
    authorized: true,
    tenantId: session.tenantId,
    tenantCode: session.tenantCode,
    entityScope,
    roles: roleCodes,
    permissions: Array.from(permissionsForRoles(roleCodes)),
  });

  // Health OS: Authorized if user has canonical identity link
  if (healthAuth.authorized) {
    authorizedOSs.push({
      osCode: "HEALTH",
      osName: "Health OS (Sector)",
      authorized: true,
      sectorUserId: healthAuth.sectorUserId,
      linkedAt: healthAuth.linkedAt,
    });
  }

  // Determine routing recommendation
  const authorizedCount = authorizedOSs.filter((os) => os.authorized).length;
  let routingRecommendation: "DIRECT" | "LAUNCHER" | "DENY";

  if (authorizedCount === 0) {
    routingRecommendation = "DENY";
  } else if (authorizedCount === 1) {
    routingRecommendation = "DIRECT";
  } else {
    routingRecommendation = "LAUNCHER";
  }

  const context = {
    userId: session.userId,
    partyId: session.partyId,
    email: session.userEmail,
    displayName: session.displayName,
    tenantId: session.tenantId,
    tenantCode: session.tenantCode,
    tenantType: session.tenantType,
    roles: roleCodes,
    permissions: Array.from(permissionsForRoles(roleCodes)),
    entityScope,
    mfaSatisfied: session.mfaSatisfied,
    sessionId: session.sessionId,
    riskScore: session.riskScore,
    expiresAt: session.expiresAt.toISOString(),
    authorizedOSs,
    authorizedCount,
    routingRecommendation,
    resolvedAt: new Date().toISOString(),
  };

  // Audit the authorization context resolution
  await recordAudit({
    actorUserId: session.userId,
    action: "AUTHORIZATION_CONTEXT_RESOLVED_MOBILE",
    objectType: "USER",
    objectId: session.userId,
    outcome: "SUCCESS",
    reason: `Resolved authorization context (mobile): ${authorizedCount} OSs authorized`,
    tenantId: session.tenantId,
    traceId,
  });

  // Record event
  await publishEvent({
    type: "authorization.context.resolved.mobile",
    source: "beyu-os/identity/mobile",
    domain: "identity",
    operation: "authorization.context.resolve.mobile",
    destinationDomain: null,
    tenantId: session.tenantId,
    legalEntityId: null,
    subjectType: "USER",
    subjectId: session.userId,
    actorUserId: session.userId,
    actorType: "HUMAN",
    classification: "INTERNAL",
    payload: {
      authorizedCount,
      authorizedOSs: authorizedOSs.map((os) => os.osCode),
      routingRecommendation,
      clientType: "MOBILE",
    },
    traceId,
    correlationId: traceId,
    causationId: null,
    authorityContext: null,
    policyVersion: null,
  });

  return apiOk(context, traceId);
}
