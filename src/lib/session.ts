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
import { LOGIN_RATE_LIMIT, loginRateLimitKeys, trustedClientIp } from "./auth-limits";

export type SessionOptions = {
  userId: string;
  tenantId: string;
  ip?: string | null;
  userAgent?: string | null;
  mfaSatisfied: boolean;
  riskScore: number;
};

export type IssuedSession = { token: string; sessionId: string; expiresAt: Date };

/** Step-up window during which a satisfied MFA remains valid for high-risk actions. */
export const MFA_STEP_UP_WINDOW_MS = 15 * 60_000;

/**
 * Build the canonical session row without inserting it.
 *
 * The login handler must create the session, update the user and append the audit
 * and event records in ONE transaction, so it cannot call a function that inserts
 * on its own connection. This factory is therefore the single definition of what
 * a BEYU OS session row is; both the transactional login path and the standalone
 * `createSession()` below derive from it, so the two can never drift apart.
 */
export function newSessionValues(opts: SessionOptions) {
  const token = newSecret(32);
  const sessionId = newId(ID_PREFIX.session);
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000);
  const now = new Date();
  return {
    token,
    sessionId,
    expiresAt,
    values: {
      id: sessionId,
      userId: opts.userId,
      tokenHash: sha256(token),
      tenantId: opts.tenantId,
      expiresAt,
      ipAddress: opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
      deviceTrust: "UNMANAGED" as const,
      riskScore: opts.riskScore,
      mfaSatisfied: opts.mfaSatisfied,
      mfaSatisfiedAt: opts.mfaSatisfied ? now : null,
      mfaExpiresAt: opts.mfaSatisfied ? new Date(now.getTime() + MFA_STEP_UP_WINDOW_MS) : null,
    },
  };
}

/** Establishes a governed session. Returns the raw token (never persisted). */
export async function createSession(opts: SessionOptions): Promise<IssuedSession> {
  const { token, sessionId, expiresAt, values } = newSessionValues(opts);
  await db.insert(sessions).values(values);
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
  const emergencyPermissions = await activeEmergencyPermissions(row.userId, row.tenantId);

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

// Re-exported for callers that imported from session.ts; the canonical
// definitions now live in auth-limits.ts.
export { LOGIN_RATE_LIMIT, loginRateLimitKeys, trustedClientIp } from "./auth-limits";

export async function requestMeta() {
  const h = await headers();
  // Incoming trace headers are untrusted input. A caller may supply an external
  // correlation identifier separately, but it must not be able to forge or
  // collide with the BEYU internal trace used for audit/security decisions.
  const traceId = newId(ID_PREFIX.event);
  return {
    ip: trustedClientIp(h),
    userAgent: h.get("user-agent"),
    traceId,
    correlationId: traceId,
    causationId: null,
  };
}
