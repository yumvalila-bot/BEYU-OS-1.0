import { and, eq, gte, gt, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { roleAssignments, roles, sessions, tenants } from "@/db/schema";
import { recordAuditTx } from "@/lib/audit";
import { clearanceForRoles, type Principal } from "@/lib/authz";
import { ROLES, classificationsAtOrBelow } from "@/lib/constants";
import { withDatabaseRlsContext } from "@/lib/tenant-scope";

export const SESSION_TENANT_CONTEXT_ACTION = "identity.session.tenant_context.changed";

export type SessionTenantContextChoice = {
  id: string;
  code: string;
  name: string;
  current: boolean;
};

type ContextIdentity = Pick<Principal, "userId" | "tenantId" | "tenantCode">;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function directCapabilityRows(
  userId: string,
  tenantCode?: string,
  executor: typeof db = db,
) {
  return executor
    .select({
      roleCode: roles.code,
      tenantId: tenants.id,
      tenantCode: tenants.code,
      tenantName: tenants.name,
      tenantClassification: tenants.classification,
    })
    .from(roleAssignments)
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .innerJoin(tenants, eq(tenants.id, roleAssignments.tenantId))
    .where(
      and(
        eq(roleAssignments.userId, userId),
        eq(roleAssignments.globalScope, false),
        isNull(roleAssignments.legalEntityId),
        eq(tenants.status, "ACTIVE"),
        ...(tenantCode ? [eq(tenants.code, tenantCode)] : []),
        lte(roleAssignments.effectiveFrom, today()),
        or(isNull(roleAssignments.effectiveTo), gte(roleAssignments.effectiveTo, today())),
      ),
    );
}

function rowHasContextCapability(row: Awaited<ReturnType<typeof directCapabilityRows>>[number]): boolean {
  // TENANT_MEMBER and unknown/catalogue-less roles are inert here. Membership
  // is not authorization, and a database row cannot mint a permission that is
  // absent from the canonical TypeScript catalogue.
  if ((ROLES[row.roleCode]?.permissions.length ?? 0) === 0) return false;
  return classificationsAtOrBelow(clearanceForRoles([row.roleCode])).includes(row.tenantClassification);
}

/**
 * List only contexts supported by a direct, effective capability assignment.
 * The current context is always offered so the caller can return to it. No
 * ancestor, display-name, hostname or request-parameter inference is used.
 */
export async function listSessionTenantContexts(
  principal: ContextIdentity,
): Promise<SessionTenantContextChoice[]> {
  const [current] = await db
    .select({ id: tenants.id, code: tenants.code, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, principal.tenantId))
    .limit(1);
  if (!current || current.code !== principal.tenantCode) {
    throw new Error("Current session tenant context is inconsistent");
  }

  const choices = new Map<string, SessionTenantContextChoice>([
    [current.code, { ...current, current: true }],
  ]);
  const rows = await directCapabilityRows(principal.userId);
  for (const row of rows) {
    if (row.tenantCode === current.code || !rowHasContextCapability(row)) continue;
    choices.set(row.tenantCode, {
      id: row.tenantId,
      code: row.tenantCode,
      name: row.tenantName,
      current: false,
    });
  }
  return [...choices.values()].sort((a, b) =>
    a.current ? -1 : b.current ? 1 : a.code.localeCompare(b.code),
  );
}

export type SessionTenantContextChange = "CHANGED" | "NOT_ELIGIBLE" | "STALE";

/**
 * Change only the caller's existing session row. The canonical user, home
 * tenant, credentials, MFA window, session token and every role assignment are
 * unchanged. Eligibility is re-checked inside the same transaction, and the
 * session update plus old/new-tenant audit appends commit or roll back together.
 */
export async function changeSessionTenantContext(params: {
  principal: Principal;
  tenantCode: string;
  traceId: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<SessionTenantContextChange> {
  const { principal, tenantCode, traceId, ipAddress, userAgent } = params;
  if (tenantCode === principal.tenantCode) return "STALE";

  return withDatabaseRlsContext([principal.tenantId], false, async () =>
    db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as typeof db;
      const eligibleRows = await directCapabilityRows(principal.userId, tenantCode, tx);
      const eligible = eligibleRows.find(rowHasContextCapability);
      if (!eligible) return "NOT_ELIGIBLE" as const;

      const updated = await tx
        .update(sessions)
        .set({ tenantId: eligible.tenantId })
        .where(
          and(
            eq(sessions.id, principal.sessionId),
            eq(sessions.userId, principal.userId),
            eq(sessions.tenantId, principal.tenantId),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, new Date()),
            eq(sessions.mfaSatisfied, true),
            gt(sessions.mfaExpiresAt, new Date()),
          ),
        )
        .returning({ id: sessions.id });
      if (updated.length !== 1) return "STALE" as const;

      // The target audit ledger is appended in the same transaction. Its RLS
      // scope is established only after the direct grant has been revalidated;
      // no client-supplied tenant ID is ever used as an authorization fact.
      await tx.execute(
        sql`select set_config('beyu.current_tenant_ids', ${[principal.tenantId, eligible.tenantId].join(",")}, true)`,
      );
      const audit = {
        actorUserId: principal.userId,
        action: SESSION_TENANT_CONTEXT_ACTION,
        objectType: "SESSION",
        objectId: principal.sessionId,
        outcome: "SUCCESS",
        reason: "Explicit session-context selection after MFA and direct effective grant revalidation.",
        oldValue: { tenantId: principal.tenantId, tenantCode: principal.tenantCode },
        newValue: { tenantId: eligible.tenantId, tenantCode: eligible.tenantCode },
        ipAddress,
        userAgent,
        traceId,
      } as const;
      await recordAuditTx(tx, { ...audit, tenantId: principal.tenantId });
      await recordAuditTx(tx, { ...audit, tenantId: eligible.tenantId });
      return "CHANGED" as const;
    }),
  );
}
