/**
 * BEYU OS — secure first-administrator bootstrap service.
 *
 * This is the single state machine for the one-time administrator enrollment
 * ceremony. It reuses the CANONICAL identity, MFA, crypto and audit primitives;
 * it introduces NO competing identity model. The administrator is the canonical
 * `parties`/`users` record; their PLATFORM_ADMIN authority is a governed
 * `role_assignments` grant created at PREPARE time with the admin/migration DSN
 * (respecting control F-01: the runtime role can never grant roles).
 *
 * The ceremony (runtime role, owner-driven) only:
 *   - verifies the owner-controlled bootstrap secret (env, never in Git),
 *   - lets the owner set THEIR OWN password (hashed, never stored plaintext),
 *   - enrolls + verifies THEIR OWN TOTP (secret encrypted, shown once),
 *   - issues recovery codes (shown once, stored hashed),
 *   - activates the account and SEALS the bootstrap forever.
 *
 * Every transition locks the singleton `admin_bootstrap_state` row FOR UPDATE,
 * so concurrent begins/completions serialize and exactly one enrollment can
 * succeed. The seal is additionally made terminal by a database trigger.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminBootstrapState, adminEnrollmentSessions, users } from "@/db/schema";
import { hashPassword, newSecret, sha256 } from "@/lib/crypto";
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotp,
} from "@/lib/mfa";
import { recordAuditTx } from "@/lib/audit";
import { withDatabaseRlsContext } from "@/lib/tenant-scope";
import { newId, ID_PREFIX } from "@/lib/ids";
import { evaluateAdminPassword } from "./password-policy";
import { verifyBootstrapSecret, bootstrapSecretFingerprint, isBootstrapSecretConfigured } from "./secret";

export const BOOTSTRAP_STATE_ID = "SINGLETON";
export const ENROLLMENT_TTL_MS = 15 * 60_000; // 15 minutes to complete the ceremony
export const ENROLLMENT_MFA_MAX_ATTEMPTS = 5;
export const ENROLLMENT_MFA_LOCK_MS = 10 * 60_000;
/** Issuer label shown in the operator's authenticator app. */
export const TOTP_ISSUER = "BEYU OS";

export type BootstrapPublicStatus = {
  /** NOT_PREPARED = no canonical admin provisioned yet; enrollment cannot start. */
  state: "NOT_PREPARED" | "AVAILABLE" | "IN_PROGRESS" | "SEALED";
  secretConfigured: boolean;
  /** True only when a fresh enrollment can be started right now. */
  enrollable: boolean;
};

function totpProvisioningUri(email: string, secret: string): string {
  const label = encodeURIComponent(`${TOTP_ISSUER}:${email}`);
  const issuer = encodeURIComponent(TOTP_ISSUER);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Read the current bootstrap status for an UNAUTHENTICATED caller.
 *
 * Deliberately non-enumerating: it never reveals the admin email, whether a
 * ceremony's token is valid, or any credential state — only the coarse lifecycle
 * needed to render the enrollment page and to let an owner confirm readiness.
 */
export async function getBootstrapStatus(): Promise<BootstrapPublicStatus> {
  const secretConfigured = isBootstrapSecretConfigured();
  const [row] = await db.select().from(adminBootstrapState).where(eq(adminBootstrapState.id, BOOTSTRAP_STATE_ID)).limit(1);
  if (!row) return { state: "NOT_PREPARED", secretConfigured, enrollable: false };

  // An IN_PROGRESS state whose ceremony has expired is re-openable.
  let effective = row.status as BootstrapPublicStatus["state"];
  if (row.status === "IN_PROGRESS") {
    const active = await hasLiveEnrollmentSession(row.adminUserId);
    if (!active) effective = "AVAILABLE";
  }
  const enrollable = secretConfigured && (effective === "AVAILABLE");
  return { state: effective, secretConfigured, enrollable };
}

async function hasLiveEnrollmentSession(adminUserId: string | null): Promise<boolean> {
  if (!adminUserId) return false;
  const [row] = await db
    .select({ id: adminEnrollmentSessions.id })
    .from(adminEnrollmentSessions)
    .where(
      and(
        eq(adminEnrollmentSessions.adminUserId, adminUserId),
        eq(adminEnrollmentSessions.status, "ACTIVE"),
        sql`${adminEnrollmentSessions.expiresAt} > now()`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

export type BeginResult =
  | { ok: false; code: "SECRET_NOT_CONFIGURED" | "INVALID_SECRET" | "NOT_PREPARED" | "ALREADY_SEALED" | "IN_PROGRESS" | "WEAK_PASSWORD"; reasons?: string[] }
  | {
      ok: true;
      enrollmentToken: string;
      email: string;
      mfaSecret: string;
      otpauthUri: string;
      recoveryCodes: string[];
      expiresAt: Date;
    };

/**
 * Begin the enrollment ceremony: authorize with the bootstrap secret, stage the
 * owner's chosen password and a freshly generated MFA secret + recovery codes.
 *
 * The MFA secret and recovery codes are returned ONCE here (for the operator to
 * capture) and are stored only in encrypted/hashed form. The raw enrollment
 * token is returned for the caller to set as an httpOnly cookie; only its hash
 * is persisted.
 */
export async function beginEnrollment(input: {
  secret: string;
  password: string;
  ip: string | null;
  userAgent: string | null;
  traceId: string;
}): Promise<BeginResult> {
  if (!isBootstrapSecretConfigured()) return { ok: false, code: "SECRET_NOT_CONFIGURED" };

  if (!verifyBootstrapSecret(input.secret)) {
    // Audit the failed authorization without a tenant (no identity is trusted yet).
    await withDatabaseRlsContext([], true, async () =>
      db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as typeof db;
        await recordAuditTx(tx, {
          action: "bootstrap.authorization",
          objectType: "BOOTSTRAP",
          objectId: BOOTSTRAP_STATE_ID,
          outcome: "DENIED",
          reason: "Invalid bootstrap secret",
          ipAddress: input.ip,
          userAgent: input.userAgent,
          traceId: input.traceId,
        });
      }),
    );
    return { ok: false, code: "INVALID_SECRET" };
  }

  // Serialize on the singleton state row for the whole ceremony start.
  return withDatabaseRlsContext([], true, async () =>
    db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as typeof db;
      const [state] = await tx
        .select()
        .from(adminBootstrapState)
        .where(eq(adminBootstrapState.id, BOOTSTRAP_STATE_ID))
        .for("update")
        .limit(1);

      if (!state || !state.adminUserId) return { ok: false as const, code: "NOT_PREPARED" as const };
      if (state.status === "SEALED") return { ok: false as const, code: "ALREADY_SEALED" as const };

      const [admin] = await tx.select().from(users).where(eq(users.id, state.adminUserId)).for("update").limit(1);
      if (!admin) return { ok: false as const, code: "NOT_PREPARED" as const };

      // Reject a genuinely live ceremony; reclaim an expired/abandoned one.
      const live = await tx
        .select({ id: adminEnrollmentSessions.id })
        .from(adminEnrollmentSessions)
        .where(
          and(
            eq(adminEnrollmentSessions.adminUserId, admin.id),
            eq(adminEnrollmentSessions.status, "ACTIVE"),
            sql`${adminEnrollmentSessions.expiresAt} > now()`,
          ),
        )
        .limit(1);
      if (live.length > 0) return { ok: false as const, code: "IN_PROGRESS" as const };

      const policy = evaluateAdminPassword(input.password, admin.email);
      if (!policy.ok) return { ok: false as const, code: "WEAK_PASSWORD" as const, reasons: policy.reasons };

      // Expire any stale sessions for this admin so only one ceremony is ACTIVE.
      await tx
        .update(adminEnrollmentSessions)
        .set({ status: "EXPIRED" })
        .where(and(eq(adminEnrollmentSessions.adminUserId, admin.id), eq(adminEnrollmentSessions.status, "ACTIVE")));

      const rawToken = newSecret(32);
      const mfaSecret = generateTotpSecret();
      const recoveryCodes = generateRecoveryCodes();
      const expiresAt = new Date(Date.now() + ENROLLMENT_TTL_MS);
      const sessionId = newId(ID_PREFIX.session);

      await tx.insert(adminEnrollmentSessions).values({
        id: sessionId,
        tokenHash: sha256(rawToken),
        adminUserId: admin.id,
        email: admin.email,
        step: "MFA_PENDING",
        status: "ACTIVE",
        passwordHash: hashPassword(input.password),
        passwordAlgo: "scrypt",
        mfaSecretEncrypted: encryptSecret(mfaSecret),
        mfaRecoveryCodesHash: recoveryCodes.map(hashRecoveryCode),
        ipAddress: input.ip,
        userAgent: input.userAgent,
        expiresAt,
      });

      await tx
        .update(adminBootstrapState)
        .set({ status: "IN_PROGRESS", enrollmentStartedAt: new Date(), updatedAt: new Date() })
        .where(eq(adminBootstrapState.id, BOOTSTRAP_STATE_ID));

      await recordAuditTx(tx, {
        tenantId: admin.primaryTenantId,
        actorUserId: admin.id,
        action: "bootstrap.enrollment.started",
        objectType: "USER",
        objectId: admin.id,
        outcome: "SUCCESS",
        reason: "Bootstrap authorized; password staged; MFA secret issued",
        authority: `BOOTSTRAP_SECRET/${bootstrapSecretFingerprint() ?? "unknown"}`,
        newValue: { enrollmentSessionId: sessionId, mfaMethod: "TOTP" },
        ipAddress: input.ip,
        userAgent: input.userAgent,
        traceId: input.traceId,
      });

      return {
        ok: true as const,
        enrollmentToken: rawToken,
        email: admin.email,
        mfaSecret,
        otpauthUri: totpProvisioningUri(admin.email, mfaSecret),
        recoveryCodes,
        expiresAt,
      };
    }),
  );
}

export type VerifyMfaResult =
  | { ok: true }
  | { ok: false; code: "NO_SESSION" | "EXPIRED" | "LOCKED" | "INVALID_MFA" | "WRONG_STEP" };

/** Verify the operator's first TOTP code against the staged secret (replay-safe). */
export async function verifyEnrollmentMfa(input: {
  token: string | undefined;
  code: string;
  ip: string | null;
  userAgent: string | null;
  traceId: string;
}): Promise<VerifyMfaResult> {
  if (!input.token) return { ok: false, code: "NO_SESSION" };
  const tokenHash = sha256(input.token);

  return withDatabaseRlsContext([], true, async () =>
    db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as typeof db;
      const [session] = await tx
        .select()
        .from(adminEnrollmentSessions)
        .where(eq(adminEnrollmentSessions.tokenHash, tokenHash))
        .for("update")
        .limit(1);

      if (!session || session.status !== "ACTIVE") return { ok: false as const, code: "NO_SESSION" as const };
      if (session.expiresAt <= new Date()) {
        await tx.update(adminEnrollmentSessions).set({ status: "EXPIRED" }).where(eq(adminEnrollmentSessions.id, session.id));
        return { ok: false as const, code: "EXPIRED" as const };
      }
      if (session.step === "CONSUMED") return { ok: false as const, code: "WRONG_STEP" as const };
      if (session.mfaLockedUntil && session.mfaLockedUntil > new Date()) {
        return { ok: false as const, code: "LOCKED" as const };
      }

      const secret = decryptSecret(session.mfaSecretEncrypted);
      const result = verifyTotp({ secret, code: input.code, lastAcceptedStep: session.mfaLastAcceptedStep });
      if (!result.ok) {
        const attempts = session.mfaFailedAttempts + 1;
        await tx
          .update(adminEnrollmentSessions)
          .set({
            mfaFailedAttempts: attempts,
            mfaLockedUntil: attempts >= ENROLLMENT_MFA_MAX_ATTEMPTS ? new Date(Date.now() + ENROLLMENT_MFA_LOCK_MS) : null,
          })
          .where(eq(adminEnrollmentSessions.id, session.id));
        await recordAuditTx(tx, {
          tenantId: null,
          actorUserId: session.adminUserId,
          action: "bootstrap.mfa.verify",
          objectType: "USER",
          objectId: session.adminUserId,
          outcome: "DENIED",
          reason: result.reason,
          ipAddress: input.ip,
          userAgent: input.userAgent,
          traceId: input.traceId,
        });
        return { ok: false as const, code: "INVALID_MFA" as const };
      }

      await tx
        .update(adminEnrollmentSessions)
        .set({ step: "MFA_VERIFIED", mfaLastAcceptedStep: result.step, mfaFailedAttempts: 0, mfaLockedUntil: null })
        .where(eq(adminEnrollmentSessions.id, session.id));

      await recordAuditTx(tx, {
        tenantId: null,
        actorUserId: session.adminUserId,
        action: "bootstrap.mfa.enrollment.completed",
        objectType: "USER",
        objectId: session.adminUserId,
        outcome: "SUCCESS",
        ipAddress: input.ip,
        userAgent: input.userAgent,
        traceId: input.traceId,
      });
      return { ok: true as const };
    }),
  );
}

export type CompleteResult =
  | { ok: true; email: string; adminUserId: string }
  | { ok: false; code: "NO_SESSION" | "EXPIRED" | "MFA_NOT_VERIFIED" | "ALREADY_SEALED" | "STATE_CONFLICT" };

/**
 * Complete the ceremony: atomically activate the administrator with their
 * established password + MFA and SEAL the bootstrap. This is the one transaction
 * that makes "exactly one canonical bootstrap can succeed" true — it locks both
 * the ceremony row and the singleton state row, and the seal is terminal.
 */
export async function completeEnrollment(input: {
  token: string | undefined;
  ip: string | null;
  userAgent: string | null;
  traceId: string;
}): Promise<CompleteResult> {
  if (!input.token) return { ok: false, code: "NO_SESSION" };
  const tokenHash = sha256(input.token);

  return withDatabaseRlsContext([], true, async () =>
    db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as typeof db;

      // Lock the singleton state FIRST to serialize with any competing complete.
      const [state] = await tx
        .select()
        .from(adminBootstrapState)
        .where(eq(adminBootstrapState.id, BOOTSTRAP_STATE_ID))
        .for("update")
        .limit(1);
      if (!state) return { ok: false as const, code: "STATE_CONFLICT" as const };
      if (state.status === "SEALED") return { ok: false as const, code: "ALREADY_SEALED" as const };

      const [session] = await tx
        .select()
        .from(adminEnrollmentSessions)
        .where(eq(adminEnrollmentSessions.tokenHash, tokenHash))
        .for("update")
        .limit(1);
      if (!session || session.status !== "ACTIVE") return { ok: false as const, code: "NO_SESSION" as const };
      if (session.expiresAt <= new Date()) {
        await tx.update(adminEnrollmentSessions).set({ status: "EXPIRED" }).where(eq(adminEnrollmentSessions.id, session.id));
        return { ok: false as const, code: "EXPIRED" as const };
      }
      if (session.step !== "MFA_VERIFIED") return { ok: false as const, code: "MFA_NOT_VERIFIED" as const };
      if (state.adminUserId && state.adminUserId !== session.adminUserId) {
        return { ok: false as const, code: "STATE_CONFLICT" as const };
      }

      const [admin] = await tx.select().from(users).where(eq(users.id, session.adminUserId)).for("update").limit(1);
      if (!admin) return { ok: false as const, code: "STATE_CONFLICT" as const };

      const now = new Date();

      // Activate the canonical administrator with THEIR OWN credentials.
      await tx
        .update(users)
        .set({
          passwordHash: session.passwordHash,
          passwordAlgo: session.passwordAlgo,
          passwordMustChange: false,
          mfaEnrolled: true,
          mfaMethod: "TOTP",
          mfaSecretEncrypted: session.mfaSecretEncrypted,
          mfaRecoveryCodesHash: session.mfaRecoveryCodesHash,
          mfaLastAcceptedStep: session.mfaLastAcceptedStep,
          mfaFailedAttempts: 0,
          mfaLockedUntil: null,
          failedAttempts: 0,
          lockedUntil: null,
          status: "ACTIVE",
        })
        .where(eq(users.id, admin.id));

      await tx
        .update(adminEnrollmentSessions)
        .set({ step: "CONSUMED", status: "CONSUMED", consumedAt: now })
        .where(eq(adminEnrollmentSessions.id, session.id));

      // SEAL — terminal.
      await tx
        .update(adminBootstrapState)
        .set({ status: "SEALED", sealedAt: now, sealedByUserId: admin.id, adminUserId: admin.id, updatedAt: now })
        .where(eq(adminBootstrapState.id, BOOTSTRAP_STATE_ID));

      await recordAuditTx(tx, {
        tenantId: admin.primaryTenantId,
        actorUserId: admin.id,
        action: "administrator.activated",
        objectType: "USER",
        objectId: admin.id,
        outcome: "SUCCESS",
        reason: "First administrator activated via one-time enrollment",
        authority: `BOOTSTRAP_SECRET/${bootstrapSecretFingerprint() ?? "unknown"}`,
        ipAddress: input.ip,
        userAgent: input.userAgent,
        traceId: input.traceId,
      });
      await recordAuditTx(tx, {
        tenantId: admin.primaryTenantId,
        actorUserId: admin.id,
        action: "bootstrap.sealed",
        objectType: "BOOTSTRAP",
        objectId: BOOTSTRAP_STATE_ID,
        outcome: "SUCCESS",
        reason: "Administrator enrollment sealed; bootstrap permanently closed",
        ipAddress: input.ip,
        userAgent: input.userAgent,
        traceId: input.traceId,
      });

      return { ok: true as const, email: admin.email, adminUserId: admin.id };
    }),
  );
}
