/**
 * BEYU OS — Authorization Context API
 *
 * Resolves the complete authorization context for the authenticated principal:
 * - Which OSs the user is authorized to access
 * - Tenant, entity, country scope
 * - Roles and permissions per OS
 *
 * This endpoint enables smart OS routing:
 * - 1 authorized OS → direct routing
 * - Multiple authorized OSs → BEYU OS Launcher
 * - No authorization → deny/fail-closed
 *
 * Security: Server-side resolution only. Never trust client.
 */

import { NextResponse } from "next/server";
import { resolvePrincipal, requestMeta } from "@/lib/session";
import { recordAudit, publishEvent } from "@/lib/audit";
import { checkHealthOSAuthorization } from "@/lib/health-os-authorization";

/**
 * Resolve complete authorization context for the authenticated principal
 */
export async function GET() {
  try {
    // Resolve the authenticated principal
    const principal = await resolvePrincipal();
    if (!principal) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const meta = await requestMeta();

    // Resolve OS authorizations
    const healthAuth = await checkHealthOSAuthorization(principal.userId);

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
      tenantId: principal.tenantId,
      tenantCode: principal.tenantCode,
      entityScope: principal.entityScope,
      roles: principal.roles,
      permissions: Array.from(principal.permissions),
    });

    // Health OS: Authorized if user has canonical identity link
    if (healthAuth.authorized) {
      authorizedOSs.push({
        osCode: "HEALTH",
        osName: "Health OS (Sector)",
        authorized: true,
        sectorUserId: healthAuth.sectorUserId,
        linkedAt: healthAuth.linkedAt,
        // Health OS has its own roles/permissions managed by Health backend
        // Client will need to call Health backend /auth/me for full Health context
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
      userId: principal.userId,
      partyId: principal.partyId,
      email: principal.email,
      displayName: principal.displayName,
      authorizedOSs,
      authorizedCount,
      routingRecommendation,
      resolvedAt: new Date().toISOString(),
    };

    // Audit the authorization context resolution
    await recordAudit({
      actorUserId: principal.userId,
      action: "AUTHORIZATION_CONTEXT_RESOLVED",
      objectType: "USER",
      objectId: principal.userId,
      outcome: "SUCCESS",
      reason: `Resolved authorization context: ${authorizedCount} OSs authorized`,
      tenantId: principal.tenantId,
      ipAddress: meta.ip,
    });

    // Record event
    await publishEvent({
      type: "authorization.context.resolved",
      source: "beyu-os",
      domain: "identity",
      operation: "authorization.context.resolve",
      destinationDomain: null,
      tenantId: principal.tenantId,
      legalEntityId: null,
      subjectType: "USER",
      subjectId: principal.userId,
      actorUserId: principal.userId,
      actorType: "HUMAN",
      classification: "INTERNAL",
      payload: {
        authorizedCount,
        authorizedOSs: authorizedOSs.map((os) => os.osCode),
        routingRecommendation,
      },
      traceId: meta.traceId,
      correlationId: meta.correlationId,
      causationId: null,
      authorityContext: null,
      policyVersion: null,
    });

    return NextResponse.json(context);
  } catch (error) {
    console.error("Authorization context resolution failed:", error);
    return NextResponse.json(
      { error: "Internal server error", message: "Failed to resolve authorization context" },
      { status: 500 }
    );
  }
}
