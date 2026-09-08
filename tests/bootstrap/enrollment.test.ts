import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { adminBootstrapState, adminEnrollmentSessions, users } from "../../src/db/schema";
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
} from "../../src/lib/mfa";
import { hashPassword, verifyPassword as verifyPw } from "../../src/lib/crypto";
import {
  beginEnrollment,
  completeEnrollment,
  getBootstrapStatus,
  verifyEnrollmentMfa,
} from "../../src/lib/bootstrap/service";
import { currentTotp, forceSealed, makeEnrollableOnly, resetBootstrap } from "./helpers";

const ADMIN_USER_ID = "USR_PLATFORM_ADMIN";
const STRONG_SECRET = "z8Q!".repeat(10); // 40 chars
const STRONG_PASSWORD = "Tr0ub4dour&3xplorer-Vault-2026";

async function begin() {
  return beginEnrollment({
    secret: STRONG_SECRET,
    password: STRONG_PASSWORD,
    ip: "203.0.113.9",
    userAgent: "vitest",
    traceId: "EVT_TEST_" + Math.random().toString(36).slice(2),
  });
}

describe("secure first-administrator enrollment ceremony", () => {
  const savedSecret = process.env.BEYU_BOOTSTRAP_SECRET;

  beforeEach(async () => {
    process.env.BEYU_BOOTSTRAP_SECRET = STRONG_SECRET;
    await makeEnrollableOnly(ADMIN_USER_ID);
    await resetBootstrap(ADMIN_USER_ID);
  });

  afterEach(async () => {
    // Restore an enrollable, unsealed state so later suites are unaffected.
    await makeEnrollableOnly(ADMIN_USER_ID);
    await resetBootstrap(ADMIN_USER_ID);
    if (savedSecret === undefined) delete process.env.BEYU_BOOTSTRAP_SECRET;
    else process.env.BEYU_BOOTSTRAP_SECRET = savedSecret;
  });

  afterAll(async () => {
    // Leave the shared admin credential in LOGIN-CAPABLE seeded state.
    // Every test above re-establishes enrollable-only preconditions in
    // beforeEach, so no test in this file depends on the leftover. Without
    // this restore, later suites that authenticate as admin@beyu.os fail
    // depending on file execution order (order-dependent contamination).
    const password = process.env.BEYU_BOOTSTRAP_PASSWORD;
    if (password) {
      const totp = generateTotpSecret();
      const recovery = generateRecoveryCodes();
      await db
        .update(users)
        .set({
          passwordHash: hashPassword(password),
          passwordAlgo: "scrypt",
          passwordMustChange: true,
          mfaEnrolled: true,
          mfaMethod: "TOTP",
          mfaSecretEncrypted: encryptSecret(totp),
          mfaRecoveryCodesHash: recovery.map(hashRecoveryCode),
          mfaLastAcceptedStep: null,
          mfaFailedAttempts: 0,
          mfaLockedUntil: null,
          failedAttempts: 0,
          lockedUntil: null,
        })
        .where(eq(users.id, ADMIN_USER_ID));
    }
    await resetBootstrap(ADMIN_USER_ID);
    await pool.end();
  });

  it("reports AVAILABLE + enrollable when prepared and secret configured", async () => {
    const status = await getBootstrapStatus();
    expect(status.state).toBe("AVAILABLE");
    expect(status.secretConfigured).toBe(true);
    expect(status.enrollable).toBe(true);
  });

  it("refuses to begin without a configured secret", async () => {
    delete process.env.BEYU_BOOTSTRAP_SECRET;
    const r = await begin();
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("SECRET_NOT_CONFIGURED");
  });

  it("rejects an invalid bootstrap secret", async () => {
    const r = await beginEnrollment({
      secret: "wrong-secret-value-wrong-secret-value",
      password: STRONG_PASSWORD,
      ip: null,
      userAgent: null,
      traceId: "EVT_BAD",
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("INVALID_SECRET");
  });

  it("rejects a weak password before staging anything", async () => {
    const r = await beginEnrollment({
      secret: STRONG_SECRET,
      password: "admin",
      ip: null,
      userAgent: null,
      traceId: "EVT_WEAK",
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("WEAK_PASSWORD");
    const sessions = await db.select().from(adminEnrollmentSessions);
    expect(sessions.length).toBe(0);
  });

  it("completes the full ceremony and seals the bootstrap", async () => {
    const b = await begin();
    expect(b.ok).toBe(true);
    if (!b.ok) throw new Error("unreachable");
    expect(b.mfaSecret).toBeTruthy();
    expect(b.recoveryCodes.length).toBeGreaterThanOrEqual(8);
    expect(b.otpauthUri).toContain("otpauth://totp/");

    const status = await getBootstrapStatus();
    expect(status.state).toBe("IN_PROGRESS");

    const code = currentTotp(b.mfaSecret);
    const v = await verifyEnrollmentMfa({ token: b.enrollmentToken, code, ip: null, userAgent: null, traceId: "EVT_V" });
    expect(v.ok).toBe(true);

    const c = await completeEnrollment({ token: b.enrollmentToken, ip: null, userAgent: null, traceId: "EVT_C" });
    expect(c.ok).toBe(true);

    // The admin now has a usable, self-chosen credential.
    const [admin] = await db.select().from(users).where(eq(users.id, ADMIN_USER_ID)).limit(1);
    expect(admin.mfaEnrolled).toBe(true);
    expect(verifyPw(STRONG_PASSWORD, admin.passwordHash)).toBe(true);
    expect(admin.mfaSecretEncrypted).toBeTruthy();
    // The activated MFA secret matches what was issued during begin.
    expect(decryptSecret(admin.mfaSecretEncrypted as string)).toBe(b.mfaSecret);

    const sealed = await getBootstrapStatus();
    expect(sealed.state).toBe("SEALED");
    expect(sealed.enrollable).toBe(false);
  });

  it("never stores the password or MFA secret in plaintext in the ceremony row", async () => {
    const b = await begin();
    if (!b.ok) throw new Error("unreachable");
    const [session] = await db.select().from(adminEnrollmentSessions).limit(1);
    expect(session.passwordHash).not.toContain(STRONG_PASSWORD);
    expect(session.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(session.mfaSecretEncrypted).not.toContain(b.mfaSecret);
  });

  it("rejects completion before MFA is verified", async () => {
    const b = await begin();
    if (!b.ok) throw new Error("unreachable");
    const c = await completeEnrollment({ token: b.enrollmentToken, ip: null, userAgent: null, traceId: "EVT" });
    expect(c.ok).toBe(false);
    if (c.ok) throw new Error("unreachable");
    expect(c.code).toBe("MFA_NOT_VERIFIED");
  });

  it("rejects a wrong MFA code and eventually locks", async () => {
    const b = await begin();
    if (!b.ok) throw new Error("unreachable");
    for (let i = 0; i < 5; i++) {
      const r = await verifyEnrollmentMfa({ token: b.enrollmentToken, code: "000000", ip: null, userAgent: null, traceId: "EVT" });
      expect(r.ok).toBe(false);
    }
    const locked = await verifyEnrollmentMfa({ token: b.enrollmentToken, code: "000000", ip: null, userAgent: null, traceId: "EVT" });
    expect(locked.ok).toBe(false);
    if (locked.ok) throw new Error("unreachable");
    expect(locked.code).toBe("LOCKED");
  });

  it("prevents TOTP replay within the ceremony", async () => {
    const b = await begin();
    if (!b.ok) throw new Error("unreachable");
    const at = Date.now();
    const code = currentTotp(b.mfaSecret, at);
    const first = await verifyEnrollmentMfa({ token: b.enrollmentToken, code, ip: null, userAgent: null, traceId: "EVT" });
    expect(first.ok).toBe(true);
    // Same step reused: verify step is now MFA_VERIFIED, replay of the same code
    // must not regress it or be accepted as a fresh verification.
    const replay = await verifyEnrollmentMfa({ token: b.enrollmentToken, code, ip: null, userAgent: null, traceId: "EVT" });
    expect(replay.ok).toBe(false);
  });

  it("rejects a second concurrent enrollment while one is live", async () => {
    const b = await begin();
    expect(b.ok).toBe(true);
    const second = await begin();
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("unreachable");
    expect(second.code).toBe("IN_PROGRESS");
  });

  it("cannot be enrolled after the bootstrap is sealed", async () => {
    await forceSealed(ADMIN_USER_ID);
    const status = await getBootstrapStatus();
    expect(status.state).toBe("SEALED");
    const r = await begin();
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.code).toBe("ALREADY_SEALED");
  });

  it("only ONE of two racing completions can seal (race safety)", async () => {
    const b = await begin();
    if (!b.ok) throw new Error("unreachable");
    const v = await verifyEnrollmentMfa({
      token: b.enrollmentToken,
      code: currentTotp(b.mfaSecret),
      ip: null,
      userAgent: null,
      traceId: "EVT",
    });
    expect(v.ok).toBe(true);

    const [r1, r2] = await Promise.all([
      completeEnrollment({ token: b.enrollmentToken, ip: null, userAgent: null, traceId: "EVT1" }),
      completeEnrollment({ token: b.enrollmentToken, ip: null, userAgent: null, traceId: "EVT2" }),
    ]);
    const successes = [r1, r2].filter((r) => r.ok).length;
    expect(successes).toBe(1);

    const [state] = await db.select().from(adminBootstrapState).where(eq(adminBootstrapState.id, "SINGLETON")).limit(1);
    expect(state.status).toBe("SEALED");
  });

  it("expires an abandoned ceremony and makes the state enrollable again", async () => {
    const b = await begin();
    if (!b.ok) throw new Error("unreachable");
    // Force the ceremony to be expired.
    await db.execute(sql`update admin_enrollment_sessions set expires_at = now() - interval '1 minute'`);
    const status = await getBootstrapStatus();
    expect(status.state).toBe("AVAILABLE");
    expect(status.enrollable).toBe(true);
    // A fresh begin should now succeed.
    const b2 = await begin();
    expect(b2.ok).toBe(true);
  });

  it("writes an immutable audit trail for the ceremony", async () => {
    const b = await begin();
    if (!b.ok) throw new Error("unreachable");
    await verifyEnrollmentMfa({ token: b.enrollmentToken, code: currentTotp(b.mfaSecret), ip: null, userAgent: null, traceId: "EVT" });
    await completeEnrollment({ token: b.enrollmentToken, ip: null, userAgent: null, traceId: "EVT" });
    const rows = await db.execute<{ action: string }>(
      sql`select action from audit_log where action in ('bootstrap.enrollment.started','bootstrap.mfa.enrollment.completed','administrator.activated','bootstrap.sealed')`,
    );
    const actions = rows.rows.map((r) => r.action);
    expect(actions).toContain("bootstrap.enrollment.started");
    expect(actions).toContain("administrator.activated");
    expect(actions).toContain("bootstrap.sealed");
  });
});
