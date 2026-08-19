import { cookies, headers } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { parties, sessions, tenants, users } from "@/db/schema";
import { newId, ID_PREFIX } from "./ids";
import { newSecret, sha256 } from "./crypto";
import { SESSION_COOKIE, SESSION_TTL_HOURS, type Classification } from "./constants";
import {
  activeEmergencyPermissions,
  clearanceForRoles,
  loadGrants,
  permissionsForRoles,
  type Principal,
} from "./authz";

/** Establishes a governed session. Returns the raw token (never persisted). */
export async function createSession(opts: {
  userId: string;
  tenantId: string;
  ip?: string | null;
  userAgent?: string | null;
  mfaSatisfied: boolean;
  riskScore: number;
}): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const token = newSecret(32);
  const sessionId = newId(ID_PREFIX.session);
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000);
  await db.insert(sessions).values({
    id: sessionId,
    userId: opts.userId,
    tokenHash: sha256(token),
    tenantId: opts.tenantId,
    expiresAt,
    ipAddress: opts.ip ?? null,
    userAgent: opts.userAgent ?? null,
    deviceTrust: "UNMANAGED",
    riskScore: opts.riskScore,
    mfaSatisfied: opts.mfaSatisfied,
    mfaSatisfiedAt: opts.mfaSatisfied ? new Date() : null,
    mfaExpiresAt: opts.mfaSatisfied ? new Date(Date.now() + 15 * 60_000) : null,
  });
  return { token, sessionId, expiresAt };
}

export async function revokeSession(token: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, sha256(token)));
}

/**
 * Resolve the full request principal: IDENTITY → TENANT → ROLE → PERMISSION → SCOPE.
 * Returns null when unauthenticated; never throws to the caller.
 */
export async function resolvePrincipal(): Promise<Principal | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      sessionId: sessions.id,
      tenantId: sessions.tenantId,
      mfaSatisfied: sessions.mfaSatisfied,
      mfaExpiresAt: sessions.mfaExpiresAt,
      riskScore: sessions.riskScore,
      userId: users.id,
      email: users.email,
      status: users.status,
      partyId: parties.id,
      displayName: parties.displayName,
      tenantCode: tenants.code,
      tenantType: tenants.type,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(parties, eq(parties.id, users.partyId))
    .innerJoin(tenants, eq(tenants.id, sessions.tenantId))
    .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row || row.status !== "ACTIVE") return null;

  const grants = await loadGrants(row.userId, row.tenantId);
  const roleCodes = [...new Set(grants.map((g) => g.code))];
  const entityScope = [...new Set(grants.map((g) => g.entityId).filter((v): v is string => Boolean(v)))];
  const emergencyPermissions = await activeEmergencyPermissions(row.userId);

  return {
    userId: row.userId,
    partyId: row.partyId,
    email: row.email,
    displayName: row.displayName,
    tenantId: row.tenantId,
    tenantCode: row.tenantCode,
    tenantType: row.tenantType,
    roles: roleCodes,
    permissions: permissionsForRoles(roleCodes),
    clearance: clearanceForRoles(roleCodes) as Classification,
    entityScope,
    mfaSatisfied: row.mfaSatisfied && Boolean(row.mfaExpiresAt && row.mfaExpiresAt > new Date()),
    sessionId: row.sessionId,
    riskScore: row.riskScore,
    emergencyPermissions,
  };
}

export async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    traceId: h.get("x-trace-id") ?? newId(ID_PREFIX.event),
  };
}
