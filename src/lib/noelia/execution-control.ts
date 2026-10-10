import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { noeliaAiIdentity, noeliaKillSwitch, parties, sessions, users } from "@/db/schema";
import {
  activeDelegatedAuthorityGrants,
  activeEmergencyAuthorityGrants,
  can,
  loadGrants,
  roleAuthorityGrants,
  type Principal,
} from "@/lib/authz";
import type { PermissionCode } from "@/lib/constants";
import { NOELIA_IDENTITY } from "@/lib/constants";
import { recordAuditTx, type Tx } from "@/lib/audit";
import { ID_PREFIX, newId } from "@/lib/ids";
import type { NoeliaTargetContext } from "./types";
import { verifyHumanControlCommand } from "./human-approval";

export type NoeliaControlTargetType = "ALL" | "MODEL" | "PROVIDER" | "TOOL" | "OS" | "TENANT" | "CAPABILITY" | "AI_IDENTITY";

export class ExecutionStoppedError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ExecutionStoppedError";
  }
}

function requireContext(): void {
  if (!hasDatabaseTransactionContext()) throw new Error("Noelia execution control requires canonical transaction-scoped context");
}

async function assertLiveRequestingAuthority(input: {
  principal: Principal;
  permission: PermissionCode;
  target: NoeliaTargetContext;
}): Promise<void> {
  const [identity] = await db.select({
    userStatus: users.status,
    service: users.isServiceAccount,
    partyStatus: parties.status,
    partyType: parties.type,
  }).from(users).innerJoin(parties, eq(parties.id, users.partyId)).where(eq(users.id, input.principal.userId)).limit(1);
  if (!identity || identity.userStatus !== "ACTIVE" || identity.partyStatus !== "ACTIVE" || identity.service || identity.partyType !== "PERSON") {
    throw new ExecutionStoppedError("REQUESTER_REVOKED", "The requesting human identity is no longer active.");
  }
  if (input.principal.sessionId !== "HIVE" && !input.principal.sessionId.startsWith("SYSTEM/")) {
    const [session] = await db.select({ id: sessions.id }).from(sessions).where(and(
      eq(sessions.id, input.principal.sessionId),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, new Date()),
    )).limit(1);
    if (!session) throw new ExecutionStoppedError("SESSION_REVOKED", "The requesting session was revoked or expired.");
  }

  const roleRows = await loadGrants(input.principal.userId, input.target.tenantId);
  const emergency = await activeEmergencyAuthorityGrants(input.principal.userId, input.target.tenantId);
  const delegated = await activeDelegatedAuthorityGrants(input.principal.userId);
  const livePrincipal: Principal = {
    ...input.principal,
    roles: [...new Set(roleRows.map((row) => row.code))],
    authorityGrants: [...roleAuthorityGrants(roleRows), ...emergency, ...delegated],
  };
  const decision = can(livePrincipal, input.permission, {
    tenantId: input.target.tenantId,
    entityId: input.target.legalEntityId,
    countryCode: input.target.countryCode,
  });
  if (!decision.allowed) throw new ExecutionStoppedError("AUTHORITY_REVOKED", decision.reason);
}

/** One mandatory pre-effect gate used by every registered tool invocation. */
export async function assertNoeliaExecutionAllowed(input: {
  principal: Principal;
  permission: PermissionCode;
  target: NoeliaTargetContext;
  toolName: string;
  capability: string;
  modelId?: string | null;
  providerId?: string | null;
  osId?: string | null;
}): Promise<void> {
  requireContext();
  await assertLiveRequestingAuthority(input);
  const [identity] = await db.select({ status: noeliaAiIdentity.status })
    .from(noeliaAiIdentity).where(eq(noeliaAiIdentity.canonicalName, NOELIA_IDENTITY)).limit(1);
  if (identity && identity.status !== "ACTIVE") {
    throw new ExecutionStoppedError("AI_IDENTITY_SUSPENDED", "Canonical NOELIA_AI identity is suspended or retired.");
  }
  const switches = await db.select().from(noeliaKillSwitch).where(and(
    eq(noeliaKillSwitch.enabled, true),
    or(isNull(noeliaKillSwitch.expiresAt), gt(noeliaKillSwitch.expiresAt, new Date())),
    or(isNull(noeliaKillSwitch.tenantId), eq(noeliaKillSwitch.tenantId, input.target.tenantId)),
    inArray(noeliaKillSwitch.targetType, ["ALL", "MODEL", "PROVIDER", "TOOL", "OS", "TENANT", "CAPABILITY", "AI_IDENTITY"]),
  ));
  const stopped = switches.find((row) => {
    switch (row.targetType) {
      case "ALL": return row.targetRef === "*" || row.targetRef === NOELIA_IDENTITY;
      case "AI_IDENTITY": return row.targetRef === NOELIA_IDENTITY;
      case "TENANT": return row.targetRef === input.target.tenantId;
      case "TOOL": return row.targetRef === input.toolName;
      case "CAPABILITY": return row.targetRef === input.capability || row.targetRef === input.permission;
      case "MODEL": return Boolean(input.modelId && row.targetRef === input.modelId);
      case "PROVIDER": return Boolean(input.providerId && row.targetRef === input.providerId);
      case "OS": return Boolean(input.osId && row.targetRef === input.osId);
      default: return false;
    }
  });
  if (stopped) {
    throw new ExecutionStoppedError("HUMAN_STOP_ACTIVE", `Human stop is active for ${stopped.targetType}:${stopped.targetRef}; execution is fail-closed.`);
  }
}

export async function setNoeliaExecutionControl(input: {
  principal: Principal;
  command: "STOP" | "RESUME";
  targetType: NoeliaControlTargetType;
  targetRef: string;
  targetTenantId?: string | null;
  reason: string;
  traceId: string;
  expiresAt?: Date | null;
}): Promise<{ id: string; enabled: boolean }> {
  requireContext();
  const authorityTarget = {
    tenantId: input.targetTenantId ?? (input.targetType === "ALL" || input.targetType === "AI_IDENTITY" ? null : input.principal.tenantId),
    legalEntityId: null,
    countryCode: null,
  };
  await verifyHumanControlCommand(input.principal, "ai:killswitch.manage", authorityTarget);
  const tenantId = authorityTarget.tenantId;
  const [existing] = await db.select().from(noeliaKillSwitch).where(and(
    eq(noeliaKillSwitch.targetType, input.targetType),
    eq(noeliaKillSwitch.targetRef, input.targetRef),
  )).limit(1);
  const id = existing?.id ?? newId(ID_PREFIX.killSwitch);
  if (input.command === "STOP") {
    const values = {
      enabled: true,
      reason: input.reason,
      activatedBy: input.principal.userId,
      activatedAt: new Date(),
      expiresAt: input.expiresAt ?? null,
      deactivatedAt: null,
      deactivatedBy: null,
      tenantId,
    };
    if (existing) await db.update(noeliaKillSwitch).set(values).where(eq(noeliaKillSwitch.id, existing.id));
    else await db.insert(noeliaKillSwitch).values({ id, targetType: input.targetType, targetRef: input.targetRef, ...values });
  } else {
    if (!existing?.enabled) throw new ExecutionStoppedError("STOP_NOT_ACTIVE", "No active stop exists for this exact target.");
    await db.update(noeliaKillSwitch).set({
      enabled: false,
      deactivatedAt: new Date(),
      deactivatedBy: input.principal.userId,
    }).where(eq(noeliaKillSwitch.id, existing.id));
  }
  await recordAuditTx(db as unknown as Tx, {
    tenantId,
    actorUserId: input.principal.userId,
    actorType: "HUMAN",
    action: input.command === "STOP" ? "ai.noelia.control.stop" : "ai.noelia.control.resume",
    objectType: "NOELIA_KILL_SWITCH",
    objectId: id,
    reason: input.reason,
    traceId: input.traceId,
    newValue: { targetType: input.targetType, targetRef: input.targetRef, enabled: input.command === "STOP", tenantId },
  });
  return { id, enabled: input.command === "STOP" };
}
