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
    if (user.mfaLockedUntil && user.mfaLockedUntil > new Date()) {
      await recordAudit({ actorUserId: user.id, action: "identity.mfa.verify", objectType: "USER", objectId: user.id, outcome: "DENIED", reason: "MFA locked", ipAddress: ip, traceId });
      return apiError("MFA_LOCKED", "MFA verification is temporarily locked.", 423, traceId);
    }
    if (!body.mfaCode || !user.mfaSecretEncrypted) {
      await recordAudit({ actorUserId: user.id, action: "identity.mfa.verify", objectType: "USER", objectId: user.id, outcome: "DENIED", reason: "MFA code required", ipAddress: ip, traceId });
      return apiError("MFA_REQUIRED", "A valid MFA code is required.", 428, traceId);
    }

    const secret = decryptSecret(user.mfaSecretEncrypted);
    const totp = verifyTotp({ secret, code: body.mfaCode, lastAcceptedStep: user.mfaLastAcceptedStep });
    let mfaOk = false;
    let acceptedStep: number | null = null;
    let recoveryHashes = user.mfaRecoveryCodesHash;

    if (totp.ok) {
      mfaOk = true;
      acceptedStep = totp.step;
    } else {
      const recoveryHash = hashRecoveryCode(body.mfaCode);
      if (recoveryHashes.includes(recoveryHash)) {
        mfaOk = true;
        recoveryHashes = recoveryHashes.filter((h) => h !== recoveryHash);
      }
    }

    if (!mfaOk) {
      const attempts = user.mfaFailedAttempts + 1;
      await db
        .update(users)
        .set({
          mfaFailedAttempts: attempts,
          mfaLockedUntil: attempts >= 5 ? new Date(Date.now() + 10 * 60_000) : null,
        })
        .where(eq(users.id, user.id));
      await recordAudit({ actorUserId: user.id, action: "identity.mfa.verify", objectType: "USER", objectId: user.id, outcome: "DENIED", reason: totp.ok ? "Invalid MFA" : totp.reason, ipAddress: ip, traceId });
      return apiError("INVALID_MFA", "MFA verification failed.", 401, traceId);
    }

    await db.update(users).set({ mfaLastAcceptedStep: acceptedStep ?? user.mfaLastAcceptedStep, mfaRecoveryCodesHash: recoveryHashes, mfaFailedAttempts: 0, mfaLockedUntil: null }).where(eq(users.id, user.id));
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
