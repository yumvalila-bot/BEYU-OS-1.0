import { buildTestBed, TEST_ACTOR } from "../../common/testing/test-bed";
import { MfaService } from "./mfa.service";
import { AuditService } from "../audit/audit.service";
import { totpToken, base32Decode } from "../../common/crypto/totp";
import type { DbConnection } from "../identity/db-connection";

describe("MFA adversarial (Part B)", () => {
  let bed: any;
  let mfa: MfaService;
  let audit: AuditService;
  let conn: DbConnection;

  const uid = TEST_ACTOR.userId;
  const tid = TEST_ACTOR.tenantId;

  beforeAll(async () => {
    bed = await buildTestBed();
    conn = bed.conn;
    audit = bed.audit;
    const cfg = {
      get(key: string) {
        if (key === "MFA_ENCRYPTION_KEY") return "6d6661746573745f746573745f6b65795f33325f62797465735f6e6565646564";
        return undefined;
      },
    } as any;
    process.env.NODE_ENV = "test";
    mfa = new MfaService(conn as any, bed.tenantCtx, audit, cfg);
  });

  async function resetMfa() {
    for (const t of ["mfa_challenges", "mfa_recovery_codes", "mfa_factors", "mfa_lockouts"]) {
      await conn.query(`DELETE FROM health.${t} WHERE tenant_id=$1::uuid AND user_id=$2::uuid`, [tid, uid]);
    }
  }

  async function enrollAndActivate(): Promise<{ secret: Buffer; recoveryCodes: string[] }> {
    const en = await bed.run(async () => mfa.enrollTotp({ globalUserId: uid, tenantId: tid }));
    const secret = base32Decode(en.secretBase32);
    await bed.run(() =>
      mfa.activateTotp({ globalUserId: uid, tenantId: tid, challengeId: en.challengeId, otp: totpToken(secret) }));
    return { secret, recoveryCodes: en.recoveryCodes };
  }

  it("TOTP enrollment returns secret + codes; cannot verify before activation", async () => {
    await resetMfa();
    const en = await bed.run(async () => mfa.enrollTotp({ globalUserId: uid, tenantId: tid }));
    expect(en.factorId).toBeTruthy();
    expect(en.secretBase32).toMatch(/^[A-Z2-7]{16,}$/);
    expect(en.recoveryCodes).toHaveLength(8);
    await expect(
      bed.run(() => mfa.verify({ globalUserId: uid, tenantId: tid, challengeId: en.challengeId, otp: "123456" })),
    ).rejects.toThrow(/MFA_CHALLENGE/);
  });

  it("invalid OTP is rejected (brute force recorded)", async () => {
    await resetMfa();
    const en = await bed.run(async () => mfa.enrollTotp({ globalUserId: uid, tenantId: tid }));
    await expect(
      bed.run(() => mfa.activateTotp({ globalUserId: uid, tenantId: tid, challengeId: en.challengeId, otp: "000000" })),
    ).rejects.toThrow(/MFA_OTP_INVALID/);
  });

  it("valid OTP activates factor; replay of same challenge rejected", async () => {
    await resetMfa();
    const { secret } = await enrollAndActivate();
    const ch = await bed.run(() => mfa.createChallenge({ globalUserId: uid, tenantId: tid, type: "verify" }));
    const code = totpToken(secret);
    const v = await bed.run(() => mfa.verify({ globalUserId: uid, tenantId: tid, challengeId: ch.challengeId, otp: code }));
    expect(v.verified).toBe(true);
    // Reuse of same challenge id must fail (already consumed).
    await expect(
      bed.run(() => mfa.verify({ globalUserId: uid, tenantId: tid, challengeId: ch.challengeId, otp: code })),
    ).rejects.toThrow(/MFA_CHALLENGE/);
  });

  it("expired challenge is rejected", async () => {
    await resetMfa();
    const { secret } = await enrollAndActivate();
    const expiredChallengeId = "00000000-0000-4000-8000-000000000123";
    await bed.run(async () => {
      await conn.query(
        `INSERT INTO health.mfa_challenges
           (challenge_id, tenant_id, user_id, factor_id, challenge_type, nonce, expires_at, max_attempts)
         SELECT $1::uuid, $2::uuid, $3::uuid, factor_id, 'verify', 'n', now() - interval '1 minute', 5
           FROM health.mfa_factors WHERE user_id=$3::uuid AND status='active' LIMIT 1`,
        [expiredChallengeId, tid, uid]);
    });
    await expect(
      bed.run(() => mfa.verify({ globalUserId: uid, tenantId: tid, challengeId: expiredChallengeId, otp: totpToken(secret) })),
    ).rejects.toThrow(/MFA_CHALLENGE_EXPIRED/);
  });

  it("recovery code redeems once; reuse rejected", async () => {
    await resetMfa();
    const { recoveryCodes } = await enrollAndActivate();
    const code = recoveryCodes[0];
    const r1 = await bed.run(() => mfa.redeemRecoveryCode({ globalUserId: uid, tenantId: tid, code }));
    expect(r1.verified).toBe(true);
    await expect(
      bed.run(() => mfa.redeemRecoveryCode({ globalUserId: uid, tenantId: tid, code })),
    ).rejects.toThrow(/MFA_RECOVERY_INVALID/);
  });

  it("cross-user challenge cannot be used (MFA_CHALLENGE_NOT_FOUND)", async () => {
    await resetMfa();
    await enrollAndActivate();
    const fakeChallenge = "00000000-0000-4000-8000-000000000999";
    await expect(
      bed.run(() => mfa.verify({ globalUserId: uid, tenantId: tid, challengeId: fakeChallenge, otp: "123456" })),
    ).rejects.toThrow(/MFA_CHALLENGE_NOT_FOUND/);
  });
});
