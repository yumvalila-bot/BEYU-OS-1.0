import { z } from "zod";
import {
  apiError,
  apiOk,
  normalizeApplicationBoundaryError,
  parseBody,
  rateLimit,
  schemaReleasePending,
} from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import type { Principal } from "@/lib/authz";
import { isSchemaCompatibilityError } from "@/lib/schema-compatibility";
import { requestMeta, resolvePrincipal } from "@/lib/session";
import {
  SESSION_TENANT_CONTEXT_ACTION,
  changeSessionTenantContext,
  listSessionTenantContexts,
} from "@/lib/session-tenant-context";
import { withDatabaseRlsContext } from "@/lib/tenant-scope";

export const dynamic = "force-dynamic";

const TenantContextSchema = z
  .object({ tenantCode: z.string().trim().min(2).max(50).toUpperCase() })
  .strict();

async function auditDenial(
  principal: Principal,
  tenantCode: string,
  reason: string,
  traceId: string,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<void> {
  await withDatabaseRlsContext([principal.tenantId], false, () =>
    recordAudit({
      tenantId: principal.tenantId,
      actorUserId: principal.userId,
      action: SESSION_TENANT_CONTEXT_ACTION,
      objectType: "SESSION",
      objectId: principal.sessionId,
      outcome: "DENIED",
      reason,
      oldValue: { tenantId: principal.tenantId, tenantCode: principal.tenantCode },
      newValue: { requestedTenantCode: tenantCode },
      ipAddress,
      userAgent,
      traceId,
    }),
  );
}

/**
 * Select an already-authorized tenant context for the current session.
 * This creates no identity, membership, role, permission or global scope.
 * MFA step-up and a direct effective capability grant are mandatory.
 */
export async function POST(request: Request) {
  const meta = await requestMeta();
  const { traceId } = meta;
  let principal: Principal | null = null;
  let requestedTenantCode = "UNKNOWN";
  try {
    try {
      principal = await resolvePrincipal();
    } catch (error) {
      if (isSchemaCompatibilityError(error)) {
        return schemaReleasePending(traceId, meta.correlationId);
      }
      throw error;
    }
    if (!principal) {
      return apiError("UNAUTHENTICATED", "A valid BEYU OS session is required.", 401, traceId);
    }

    const limited = rateLimit(`${principal.userId}:identity.session.tenant_context`, 20, 60_000);
    if (!limited.ok) {
      return apiError("RATE_LIMITED", "Tenant-context change rate exceeded.", 429, traceId);
    }

    const body = await parseBody(request, TenantContextSchema);
    requestedTenantCode = body.tenantCode;

    if (!principal.mfaSatisfied) {
      await auditDenial(principal, requestedTenantCode, "MFA_REQUIRED", traceId, meta.ip, meta.userAgent);
      return apiError(
        "MFA_REQUIRED",
        "Step-up authentication is required to change tenant context. Sign in again with MFA.",
        428,
        traceId,
      );
    }

    if (requestedTenantCode === principal.tenantCode) {
      return apiOk({ tenantCode: principal.tenantCode, changed: false }, traceId);
    }

    const contexts = await listSessionTenantContexts(principal);
    if (!contexts.some((context) => context.code === requestedTenantCode)) {
      await auditDenial(principal, requestedTenantCode, "NO_DIRECT_ACTIVE_GRANT", traceId, meta.ip, meta.userAgent);
      return apiError(
        "TENANT_CONTEXT_NOT_AUTHORIZED",
        "No direct active capability grant authorizes the requested tenant context.",
        403,
        traceId,
      );
    }

    const result = await changeSessionTenantContext({
      principal,
      tenantCode: requestedTenantCode,
      traceId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    if (result === "NOT_ELIGIBLE") {
      await auditDenial(principal, requestedTenantCode, "GRANT_CHANGED_DURING_SELECTION", traceId, meta.ip, meta.userAgent);
      return apiError(
        "TENANT_CONTEXT_NOT_AUTHORIZED",
        "The requested tenant context is no longer authorized. No session context was changed.",
        403,
        traceId,
      );
    }
    if (result === "STALE") {
      await auditDenial(principal, requestedTenantCode, "STALE_SESSION_CONTEXT", traceId, meta.ip, meta.userAgent);
      return apiError(
        "SESSION_CONTEXT_CHANGED",
        "The session context changed concurrently. Review the current context and retry.",
        409,
        traceId,
      );
    }

    return apiOk({ tenantCode: requestedTenantCode, changed: true }, traceId);
  } catch (error) {
    const applicationError = normalizeApplicationBoundaryError(error);
    if (applicationError) {
      return apiError(
        applicationError.code,
        applicationError.message,
        applicationError.status,
        traceId,
        applicationError.details,
      );
    }
    console.error(JSON.stringify({
      level: "error",
      traceId,
      action: SESSION_TENANT_CONTEXT_ACTION,
      message: String(error),
    }));
    return apiError("INTERNAL_ERROR", "The tenant context could not be changed. No authority was granted.", 500, traceId);
  }
}
