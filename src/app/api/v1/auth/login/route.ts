import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { sha256, verifyPassword } from "@/lib/crypto";
import { decryptSecret, hashRecoveryCode, verifyTotp } from "@/lib/mfa";
import { recordAudit, recordAuditTx, publishEventTx } from "@/lib/audit";
import { apiError, apiOk, rateLimit } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/constants";
import { newId, ID_PREFIX } from "@/lib/ids";
import { newSessionValues } from "@/lib/session";

export const dynamic = "force-dynamic";

const LoginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  mfaCode: z.string().min(6).max(16).optional(),
});

function productionMode() {
  return process.env.NODE_ENV === "production" || process.env.BEYU_ENV === "production";
}

/** Credential authentication with real TOTP step-up, replay prevention, lockout and atomic audit. */
export async function POST(request: Request): Promise<NextResponse> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent");
  const traceId = newId(ID_PREFIX.event);

  const limited = rateLimit(`login:${ip ?? "unknown"}`, 10, 60_000);
  if (!limited.ok) return apiError("RATE_LIMITED", "Too many attempts. Try again shortly.", 429, traceId);

  let body: z.infer<typeof LoginSchema>;
  try {
    body = LoginSchema.parse(await request.json());
  } catch {
    return apiError("VALIDATION_FAILED", "A valid email, password and MFA code are required.", 422, traceId);
  }

  const [user] = await db.select().from(users).where(eq(users.email, body.email.toLowerCase())).limit(1);

  const fail = () => apiError("INVALID_CREDENTIALS", "Authentication failed.", 401, traceId);

  // Uniform response; still audit the denial without revealing account existence.
  if (!user || user.status !== "ACTIVE") {
    await recordAudit({ action: "identity.login", objectType: "USER", objectId: body.email, outcome: "DENIED", reason: "Unknown or inactive identity", ipAddress: ip, traceId });
    // Roughly equalise timing to reduce enumeration signal.
    verifyPassword(body.password, "scrypt$00000000000000000000000000000000$" + "0".repeat(128));
    return fail();
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordAudit({ actorUserId: user.id, action: "identity.login", objectType: "USER", objectId: user.id, outcome: "DENIED", reason: "Account temporarily locked", ipAddress: ip, traceId });
    return apiError("ACCOUNT_LOCKED", "This identity is temporarily locked.", 423, traceId);
  }

  if (!verifyPassword(body.password, user.passwordHash)) {
    const attempts = user.failedAttempts + 1;
    await db
      .update(users)
      .set({
        failedAttempts: attempts,
        lockedUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null,
      })
      .where(eq(users.id, user.id));
    await recordAudit({ actorUserId: user.id, action: "identity.login", objectType: "USER", objectId: user.id, outcome: "DENIED", reason: "Invalid credential", ipAddress: ip, traceId });
    return fail();
  }

  if (user.mfaEnrolled) {
    /**
     * MFA is a one-time credential claim. The read, verification and state update
     * must be serialized on the user row; otherwise two parallel requests can
     * both observe the same mfaLastAcceptedStep/recovery-code set and both create
     * sessions. This is deliberately a transaction inside the existing identity
     * path, not a second authentication system.
     */
    const mfaResult = await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as typeof db;
      const [current] = await tx
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .for("update")
        .limit(1);

      if (!current || (current.mfaLockedUntil && current.mfaLockedUntil > new Date())) {
        await recordAuditTx(tx, {
          actorUserId: user.id,
          action: "identity.mfa.verify",
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
          actorUserId: user.id,
          action: "identity.mfa.verify",
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
            actorUserId: user.id,
            action: "identity.mfa.verify",
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

      // The row lock makes both TOTP step and recovery-code consumption atomic
      // with respect to competing requests for this identity.
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
    });

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

  // Single canonical definition of a BEYU OS session row (lib/session.ts). The
  // values are built here and inserted inside the transaction below so session
  // creation, the user update, the audit record and the event stay atomic.
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

  await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    await tx.insert(sessions).values(sessionValues);
    await tx.update(users).set({ failedAttempts: 0, lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await recordAuditTx(tx, {
      tenantId: user.primaryTenantId,
      actorUserId: user.id,
      action: "identity.login",
      objectType: "SESSION",
      objectId: sessionId,
      newValue: { mfaSatisfied, riskScore, passwordMustChange: user.passwordMustChange },
      ipAddress: ip,
      userAgent,
      traceId,
    });
    await publishEventTx(tx, {
      type: "USER_AUTHENTICATED",
      source: "beyu-os/identity",
      tenantId: user.primaryTenantId,
      subjectType: "USER",
      subjectId: user.id,
      actorUserId: user.id,
      payload: { mfaSatisfied, passwordMustChange: user.passwordMustChange },
      traceId,
    });
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: productionMode(),
    path: "/",
    expires: expiresAt,
  });

  return apiOk({ authenticated: true, mfaSatisfied, passwordMustChange: user.passwordMustChange, expiresAt }, traceId);
}
