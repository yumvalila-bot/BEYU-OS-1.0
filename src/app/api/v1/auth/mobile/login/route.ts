/**
 * BEYU OS — Mobile Authentication Endpoint
 *
 * Mobile-safe authentication that returns bearer tokens instead of cookies.
 * Consumes the SAME canonical identity, authorization, and session infrastructure.
 *
 * SECURITY PROPERTIES:
 * - Uses the same credential verification as web login
 * - Returns bearer token for mobile clients (not httpOnly cookie)
 * - Token is a session token (stored in sessions table)
 * - All security controls preserved: rate limiting, MFA, account status, etc.
 * - Does NOT create a second identity system
 * - Does NOT bypass any authorization
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { verifyPassword } from "@/lib/crypto";
import { decryptSecret, hashRecoveryCode, verifyTotp } from "@/lib/mfa";
import { recordAudit, recordAuditTx, publishEventTx } from "@/lib/audit";
import { apiError, apiOk, rateLimit } from "@/lib/api";
import { newId, ID_PREFIX } from "@/lib/ids";
import { LOGIN_RATE_LIMIT, loginRateLimitKeys, newSessionValues, trustedClientIp } from "@/lib/session";
import { withDatabaseRlsContext } from "@/lib/tenant-scope";

export const dynamic = "force-dynamic";

const MobileLoginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  mfaCode: z.string().min(6).max(16).optional(),
});

/**
 * Mobile authentication: returns bearer token instead of cookie.
 * All other security controls identical to web login.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const h = await headers();
  const ip = trustedClientIp(h);
  const userAgent = h.get("user-agent");
  const traceId = newId(ID_PREFIX.event);

  let body: z.infer<typeof MobileLoginSchema>;
  try {
    body = MobileLoginSchema.parse(await request.json());
  } catch {
    if (ip) {
      const limited = rateLimit(`mobile-login:ip:${ip}`, LOGIN_RATE_LIMIT.perIpAccount, LOGIN_RATE_LIMIT.windowMs);
      if (!limited.ok) return apiError("RATE_LIMITED", "Too many attempts. Try again shortly.", 429, traceId);
    }
    return apiError("VALIDATION_FAILED", "A valid email, password and MFA code are required.", 422, traceId);
  }

  // Rate limiting (same as web)
  for (const key of loginRateLimitKeys(ip, body.email)) {
    const limit = key.startsWith("login:ipacct:") ? LOGIN_RATE_LIMIT.perIpAccount : LOGIN_RATE_LIMIT.perAccount;
    const limited = rateLimit(key, limit, LOGIN_RATE_LIMIT.windowMs);
    if (!limited.ok) return apiError("RATE_LIMITED", "Too many attempts. Try again shortly.", 429, traceId);
  }

  const [user] = await db.select().from(users).where(eq(users.email, body.email.toLowerCase())).limit(1);

  const fail = () => apiError("INVALID_CREDENTIALS", "Authentication failed.", 401, traceId);

  if (!user || user.status !== "ACTIVE") {
    await withDatabaseRlsContext([], true, async () => {
      await recordAudit({
        action: "identity.mobile.login",
        objectType: "USER",
        objectId: body.email,
        outcome: "DENIED",
        reason: "Unknown or inactive identity",
        ipAddress: ip,
        userAgent,
        traceId,
      });
    });
    verifyPassword(body.password, "scrypt$00000000000000000000000000000000$" + "0".repeat(128));
    return fail();
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await withDatabaseRlsContext([user.primaryTenantId], false, async () => {
      await recordAudit({
        tenantId: user.primaryTenantId,
        actorUserId: user.id,
        action: "identity.mobile.login",
        objectType: "USER",
        objectId: user.id,
        outcome: "DENIED",
        reason: "Account temporarily locked",
        ipAddress: ip,
        userAgent,
        traceId,
      });
    });
    return apiError("ACCOUNT_LOCKED", "This identity is temporarily locked.", 423, traceId);
  }

  if (!verifyPassword(body.password, user.passwordHash)) {
    await withDatabaseRlsContext([user.primaryTenantId], false, async () => {
      await db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as typeof db;
        const [current] = await tx
          .select({ failedAttempts: users.failedAttempts, lockedUntil: users.lockedUntil })
          .from(users)
          .where(eq(users.id, user.id))
          .for("update")
          .limit(1);
        if (!current) return;
        const attempts = current.failedAttempts + 1;
        await tx
          .update(users)
          .set({
            failedAttempts: attempts,
            lockedUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null,
          })
          .where(eq(users.id, user.id));
        await recordAuditTx(tx, {
          tenantId: user.primaryTenantId,
          actorUserId: user.id,
          action: "identity.mobile.login",
          objectType: "USER",
          objectId: user.id,
          outcome: "DENIED",
          reason: "Invalid credential",
          ipAddress: ip,
          userAgent,
          traceId,
        });
      });
    });
    return fail();
  }

  // MFA verification (same as web)
  if (user.mfaEnrolled) {
    const mfaResult = await withDatabaseRlsContext([user.primaryTenantId], false, async () =>
      db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as typeof db;
        const [current] = await tx
          .select()
          .from(users)
          .where(eq(users.id, user.id))
          .for("update")
          .limit(1);

        if (!current || (current.mfaLockedUntil && current.mfaLockedUntil > new Date())) {
          await recordAuditTx(tx, {
            tenantId: user.primaryTenantId,
            actorUserId: user.id,
            action: "identity.mobile.mfa.verify",
            objectType: "USER",
            objectId: user.id,
            outcome: "DENIED",
            reason: "MFA locked",
            ipAddress: ip,
            traceId,
          });
          return { ok: false as const, code: "MFA_LOCKED" as const };
        }

        if (!body.mfaCode || !current.mfaSecretEncrypted) {
          await recordAuditTx(tx, {
            tenantId: user.primaryTenantId,
            actorUserId: user.id,
            action: "identity.mobile.mfa.verify",
            objectType: "USER",
            objectId: user.id,
            outcome: "DENIED",
            reason: "MFA code required",
            ipAddress: ip,
            traceId,
          });
          return { ok: false as const, code: "MFA_REQUIRED" as const };
        }

        const secret = decryptSecret(current.mfaSecretEncrypted);
        const totp = verifyTotp({ secret, code: body.mfaCode, lastAcceptedStep: current.mfaLastAcceptedStep });
        let acceptedStep: number | null = null;
        let recoveryHashes = current.mfaRecoveryCodesHash;

        if (totp.ok) {
          acceptedStep = totp.step;
        } else {
          const recoveryHash = hashRecoveryCode(body.mfaCode);
          if (recoveryHashes.includes(recoveryHash)) {
            recoveryHashes = recoveryHashes.filter((h) => h !== recoveryHash);
          } else {
            const attempts = current.mfaFailedAttempts + 1;
            await tx
              .update(users)
              .set({
                mfaFailedAttempts: attempts,
                mfaLockedUntil: attempts >= 5 ? new Date(Date.now() + 10 * 60_000) : null,
              })
              .where(eq(users.id, user.id));
            await recordAuditTx(tx, {
              tenantId: user.primaryTenantId,
              actorUserId: user.id,
              action: "identity.mobile.mfa.verify",
              objectType: "USER",
              objectId: user.id,
              outcome: "DENIED",
              reason: totp.reason,
              ipAddress: ip,
              traceId,
            });
            return { ok: false as const, code: "INVALID_MFA" as const };
          }
        }

        await tx
          .update(users)
          .set({
            mfaLastAcceptedStep: acceptedStep ?? current.mfaLastAcceptedStep,
            mfaRecoveryCodesHash: recoveryHashes,
            mfaFailedAttempts: 0,
            mfaLockedUntil: null,
          })
          .where(eq(users.id, user.id));
        return { ok: true as const };
      }),
    );

    if (!mfaResult.ok) {
      if (mfaResult.code === "MFA_LOCKED") {
        return apiError("MFA_LOCKED", "MFA verification is temporarily locked.", 423, traceId);
      }
      if (mfaResult.code === "MFA_REQUIRED") {
        return apiError("MFA_REQUIRED", "A valid MFA code is required.", 428, traceId);
      }
      return apiError("INVALID_MFA", "MFA verification failed.", 401, traceId);
    }
  }

  const mfaSatisfied = user.mfaEnrolled;
  const riskScore = ip ? 10 : 25;

  // Create session (same as web)
  const {
    token: rawToken,
    sessionId,
    expiresAt,
    values: sessionValues,
  } = newSessionValues({
    userId: user.id,
    tenantId: user.primaryTenantId,
    ip,
    userAgent,
    mfaSatisfied,
    riskScore,
  });

  await withDatabaseRlsContext([user.primaryTenantId], false, async () =>
    db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as typeof db;
      await tx.insert(sessions).values(sessionValues);
      await tx.update(users).set({ failedAttempts: 0, lastLoginAt: new Date() }).where(eq(users.id, user.id));
      await recordAuditTx(tx, {
        tenantId: user.primaryTenantId,
        actorUserId: user.id,
        action: "identity.mobile.login",
        objectType: "SESSION",
        objectId: sessionId,
        newValue: { mfaSatisfied, riskScore, passwordMustChange: user.passwordMustChange, clientType: "MOBILE" },
        ipAddress: ip,
        userAgent,
        traceId,
      });
      await publishEventTx(tx, {
        type: "USER_AUTHENTICATED",
        source: "beyu-os/identity/mobile",
        domain: "IDENTITY",
        operation: "MOBILE_LOGIN",
        destinationDomain: null,
        tenantId: user.primaryTenantId,
        legalEntityId: null,
        subjectType: "USER",
        subjectId: user.id,
        actorUserId: user.id,
        classification: "INTERNAL",
        payload: { mfaSatisfied, passwordMustChange: user.passwordMustChange, clientType: "MOBILE" },
        traceId,
        correlationId: traceId,
        causationId: null,
        authorityContext: null,
        policyVersion: null,
      });
    }),
  );

  // Return token in response body (NOT cookie) for mobile clients
  return apiOk({
    authenticated: true,
    token: rawToken,
    sessionId,
    expiresAt: expiresAt.toISOString(),
    mfaSatisfied,
    passwordMustChange: user.passwordMustChange,
  }, traceId);
}
