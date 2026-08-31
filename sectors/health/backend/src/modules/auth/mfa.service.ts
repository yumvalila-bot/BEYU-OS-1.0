import {
  Inject,
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { DbConnection, DB_CONNECTION } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { JsonLogger } from "../../common/observability/json-logger";
import {
  aes256gcmDecrypt,
  aes256gcmEncrypt,
  randomToken,
} from "../../common/crypto/crypto";
import {
  generateTotpSecret,
  base32Encode,
  base32Decode,
  totpToken,
  totpUri,
  totpVerify,
} from "../../common/crypto/totp";
import { AuditService } from "../audit/audit.service";

export interface EnrollTotpResult {
  factorId: string;
  secretBase32: string;
  otpauthUri: string;
  recoveryCodes: string[];
  challengeId: string;
}

export interface MfaVerifyResult {
  verified: boolean;
  factorType: "totp" | "recovery";
}

// 32-byte test-only key. Production must supply MFA_ENCRYPTION_KEY (also 32 bytes hex).
const TEST_KEY_HEX = "6d6661746573745f746573745f6b65795f33325f62797465735f6e6565646564";
const MAX_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 15 * 60 * 1000;
const CHALLENGE_TTL_S = 5 * 60;

@Injectable()
export class MfaService {
  private readonly logger = new JsonLogger(MfaService.name);
  private readonly encryptionKeyHex: string;

  constructor(
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly tenantCtx: TenantContext,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {
    const k = this.config.get<string>("MFA_ENCRYPTION_KEY") ?? "";
    if (process.env.NODE_ENV === "production") {
      if (!k || k.length !== 64 || /^0+$/.test(k) || k === TEST_KEY_HEX) {
        throw new Error(
          "MISCONFIGURATION: MFA_ENCRYPTION_KEY must be a 64-hex-char (32-byte) key in production",
        );
      }
      this.encryptionKeyHex = k;
    } else {
      this.encryptionKeyHex = k || TEST_KEY_HEX;
    }
  }

  async enrollTotp(ctx: {
    globalUserId: string;
    tenantId: string;
    label?: string;
    issuer?: string;
  }): Promise<EnrollTotpResult> {
    return this.db.transaction(async (tx) => {
      const existing = await tx.query(
        `SELECT factor_id FROM health.mfa_factors
          WHERE tenant_id=$1::uuid AND user_id=$2::uuid AND factor_type='totp' AND status='active'`,
        [ctx.tenantId, ctx.globalUserId],
      );
      if (existing.length > 0) throw new ConflictException("MFA_ENROLLMENT_EXISTS");

      const secret = generateTotpSecret();
      const secretBase32 = base32Encode(secret);
      const enc = aes256gcmEncrypt(
        this.encryptionKeyHex,
        secretBase32,
        `${ctx.tenantId}:${ctx.globalUserId}:totp`,
      );
      const recoveryCodes = Array.from({ length: 8 }, () =>
        randomToken(6).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10).padEnd(10, "X"),
      );
      const factorId = randomUUID();
      const challengeId = randomUUID();
      const nonce = randomToken(16);

      await tx.query(
        `INSERT INTO health.mfa_factors
           (factor_id, tenant_id, user_id, factor_type, totp_secret_enc, status, metadata)
         VALUES ($1::uuid,$2::uuid,$3::uuid,'totp',$4::bytea,'pending',$5::jsonb)`,
        [factorId, ctx.tenantId, ctx.globalUserId, Buffer.from(enc.enc, "utf8"),
         JSON.stringify({ alg: "aes-256-gcm", digits: 6, period: 30 })]);

      for (const code of recoveryCodes) {
        const hash = await bcrypt.hash(this.normalizeRecovery(code), 10);
        await tx.query(
          `INSERT INTO health.mfa_recovery_codes (tenant_id,user_id,code_hash)
           VALUES ($1::uuid,$2::uuid,$3)`,
          [ctx.tenantId, ctx.globalUserId, hash]);
      }

      await tx.query(
        `INSERT INTO health.mfa_challenges
           (challenge_id, tenant_id, user_id, factor_id, challenge_type, nonce,
            expires_at, max_attempts)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'enroll',$5,
                 now() + ($6 || ' seconds')::interval, $7)`,
        [challengeId, ctx.tenantId, ctx.globalUserId, factorId, nonce,
         String(CHALLENGE_TTL_S), MAX_ATTEMPTS]);

      await this.audit.record(tx, {
        operation: "mfa.totp.enroll.begin",
        resourceType: "mfa_factor",
        resourceId: factorId,
        metadata: { factorType: "totp" },
      });

      return {
        factorId,
        secretBase32,
        otpauthUri: totpUri({
          secretBase32,
          label: ctx.label ?? `user:${ctx.globalUserId.slice(0, 8)}`,
          issuer: ctx.issuer ?? "BEYU Health OS",
        }),
        recoveryCodes,
        challengeId,
      };
    });
  }

  async activateTotp(args: {
    globalUserId: string;
    tenantId: string;
    challengeId: string;
    otp: string;
  }): Promise<void> {
    await this.assertLockout(args.tenantId, args.globalUserId);
    await this.db.transaction(async (tx) => {
      const ch = await this.consumeChallengeTx(tx, args, "enroll");
      const secretBase32 = await this.loadSecretBase32(tx, ch.factorId, args.tenantId, args.globalUserId);
      const v = totpVerify(base32Decode(secretBase32), args.otp);
      if (!v.ok) {
        await this.recordFailureTx(tx, args.tenantId, args.globalUserId);
        throw new UnauthorizedException("MFA_OTP_INVALID");
      }
      await tx.query(
        `UPDATE health.mfa_factors SET status='active', activated_at=now()
          WHERE factor_id=$1::uuid AND status='pending'`,
        [ch.factorId]);
      await tx.query(
        `UPDATE health.mfa_factors SET status='revoked', revoked_at=now()
          WHERE tenant_id=$1::uuid AND user_id=$2::uuid
            AND factor_type='totp' AND status='active' AND factor_id<>$3::uuid`,
        [args.tenantId, args.globalUserId, ch.factorId]);
      await this.clearFailuresTx(tx, args.tenantId, args.globalUserId);
      await this.markChallengeUsedTx(tx, ch.challengeId, "otp");
      await this.audit.record(tx, {
        operation: "mfa.totp.enroll.activate",
        resourceType: "mfa_factor",
        resourceId: ch.factorId,
      });
    });
  }

  async createChallenge(args: {
    globalUserId: string;
    tenantId: string;
    type: "verify" | "step_up";
    ip?: string;
    userAgent?: string;
  }): Promise<{ challengeId: string; nonce: string; expiresAt: Date }> {
    await this.assertLockout(args.tenantId, args.globalUserId);
    const factor = await this.db.query<any>(
      `SELECT factor_id FROM health.mfa_factors
        WHERE tenant_id=$1::uuid AND user_id=$2::uuid AND factor_type='totp' AND status='active'
        ORDER BY activated_at DESC LIMIT 1`,
      [args.tenantId, args.globalUserId]);
    if (factor.length === 0) throw new ForbiddenException("MFA_NOT_ENROLLED");
    const challengeId = randomUUID();
    const nonce = randomToken(16);
    await this.db.query(
      `INSERT INTO health.mfa_challenges
         (challenge_id, tenant_id, user_id, factor_id, challenge_type, nonce,
          expires_at, max_attempts, ip_address, user_agent)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,
               now() + ($7 || ' seconds')::interval, $8, $9::inet, $10)`,
      [challengeId, args.tenantId, args.globalUserId, factor[0].factor_id, args.type, nonce,
       String(CHALLENGE_TTL_S), MAX_ATTEMPTS, args.ip ?? null, args.userAgent ?? null]);
    return { challengeId, nonce, expiresAt: new Date(Date.now() + CHALLENGE_TTL_S * 1000) };
  }

  async verify(args: {
    globalUserId: string;
    tenantId: string;
    challengeId: string;
    otp: string;
    ip?: string;
  }): Promise<MfaVerifyResult> {
    await this.assertLockout(args.tenantId, args.globalUserId);
    return this.db.transaction(async (tx) => {
      const ch = await this.consumeChallengeTx(tx, args, "verify", "step_up");
      const secretBase32 = await this.loadSecretBase32(tx, ch.factorId, args.tenantId, args.globalUserId);
      const v = totpVerify(base32Decode(secretBase32), args.otp);
      if (!v.ok) {
        await this.recordFailureTx(tx, args.tenantId, args.globalUserId);
        throw new UnauthorizedException("MFA_OTP_INVALID");
      }
      const lastRows = await tx.query<{ last_counter?: string | null }>(
        `SELECT metadata->>'last_counter' AS last_counter FROM health.mfa_factors
          WHERE factor_id=$1::uuid FOR UPDATE`,
        [ch.factorId]);
      const lastCounter = BigInt(lastRows[0]?.last_counter ?? "-1");
      if (v.matchedCounter != null && v.matchedCounter <= lastCounter) {
        await this.recordFailureTx(tx, args.tenantId, args.globalUserId);
        throw new UnauthorizedException("MFA_OTP_REPLAY");
      }
      await tx.query(
        `UPDATE health.mfa_factors
            SET metadata = jsonb_set(COALESCE(metadata,'{}'::jsonb),'{last_counter}', to_jsonb($1::text)),
                last_used_at = now()
          WHERE factor_id=$2::uuid`,
        [String(v.matchedCounter), ch.factorId]);
      await this.clearFailuresTx(tx, args.tenantId, args.globalUserId);
      await this.markChallengeUsedTx(tx, ch.challengeId, "otp");
      await this.audit.record(tx, {
        operation: "mfa.totp.verify",
        resourceType: "mfa_factor",
        resourceId: ch.factorId,
        metadata: { ip: args.ip ?? null },
      });
      return { verified: true, factorType: "totp" };
    });
  }

  async redeemRecoveryCode(args: {
    globalUserId: string;
    tenantId: string;
    code: string;
    ip?: string;
  }): Promise<{ verified: true; requiresFactorReset: true }> {
    await this.assertLockout(args.tenantId, args.globalUserId);
    return this.db.transaction(async (tx) => {
      const norm = this.normalizeRecovery(args.code);
      const codes = await tx.query<{ code_id: string; code_hash: string }>(
        `SELECT code_id, code_hash FROM health.mfa_recovery_codes
          WHERE tenant_id=$1::uuid AND user_id=$2::uuid AND used_at IS NULL`,
        [args.tenantId, args.globalUserId]);
      let matched: string | null = null;
      for (const row of codes) {
        if (await bcrypt.compare(norm, row.code_hash)) { matched = row.code_id; break; }
      }
      if (!matched) {
        await this.recordFailureTx(tx, args.tenantId, args.globalUserId);
        throw new UnauthorizedException("MFA_RECOVERY_INVALID");
      }
      // Atomically claim the code (only if not already used). Use a RETURNING
      // check rather than driver-level rowCount so this works on PGlite too.
      const claimed = await tx.query<{ code_id: string }>(
        `UPDATE health.mfa_recovery_codes SET used_at=now()
          WHERE code_id=$1::uuid AND used_at IS NULL
          RETURNING code_id`,
        [matched]);
      if (claimed.length !== 1) {
        throw new UnauthorizedException("MFA_RECOVERY_ALREADY_USED");
      }
      await this.clearFailuresTx(tx, args.tenantId, args.globalUserId);
      await this.audit.record(tx, {
        operation: "mfa.recovery.redeem",
        resourceType: "mfa_recovery_code",
        resourceId: matched,
        metadata: { ip: args.ip ?? null },
      });
      return { verified: true, requiresFactorReset: true };
    });
  }

  async adminReset(args: {
    targetGlobalUserId: string;
    tenantId: string;
    reason: string;
  }): Promise<void> {
    const actor = this.tenantCtx.current();
    if (!actor) throw new UnauthorizedException("NO_ACTOR_CONTEXT");
    await this.db.transaction(async (tx) => {
      await tx.query(
        `UPDATE health.mfa_factors SET status='revoked', revoked_at=now()
          WHERE tenant_id=$1::uuid AND user_id=$2::uuid`,
        [args.tenantId, args.targetGlobalUserId]);
      await tx.query(
        `DELETE FROM health.mfa_recovery_codes WHERE tenant_id=$1::uuid AND user_id=$2::uuid`,
        [args.tenantId, args.targetGlobalUserId]);
      await tx.query(
        `DELETE FROM health.mfa_challenges WHERE tenant_id=$1::uuid AND user_id=$2::uuid AND used_at IS NULL`,
        [args.tenantId, args.targetGlobalUserId]);
      await tx.query(
        `DELETE FROM health.mfa_lockouts WHERE tenant_id=$1::uuid AND user_id=$2::uuid`,
        [args.tenantId, args.targetGlobalUserId]);
      await this.audit.record(tx, {
        operation: "mfa.admin.reset",
        resourceType: "user",
        resourceId: args.targetGlobalUserId,
        metadata: { reason: args.reason, resetBy: actor.userId },
        authDecision: "allowed",
      });
    });
  }

  async enrollWebAuthn(): Promise<never> {
    throw new BadRequestException({
      code: "MFA_WEBAUTHN_NOT_IMPLEMENTED",
      state: "PARTIALLY_IMPLEMENTED",
    });
  }

  // ---- internal helpers (tx-scoped) -----------------------------------------

  private async assertLockout(tenantId: string, userId: string): Promise<void> {
    const rows = await this.db.query<{ locked_until: string }>(
      `SELECT locked_until FROM health.mfa_lockouts
        WHERE tenant_id=$1::uuid AND user_id=$2::uuid AND locked_until IS NOT NULL
          AND locked_until > now()`,
      [tenantId, userId]);
    if (rows.length > 0) {
      throw new UnauthorizedException(
        `MFA_LOCKED_UNTIL:${new Date(rows[0].locked_until).toISOString()}`,
      );
    }
  }

  private async recordFailureTx(tx: DbConnection, tenantId: string, userId: string): Promise<void> {
    // Simpler exponential backoff: first MAX_ATTEMPTS failures → BASE_LOCKOUT.
    // Each subsequent burst doubles (capped at 4h).
    const existing = await tx.query<{ failed_count: number }>(
      `SELECT failed_count FROM health.mfa_lockouts WHERE user_id=$2::uuid AND tenant_id=$1::uuid`,
      [tenantId, userId]);
    const prevCount = existing[0]?.failed_count ?? 0;
    const newCount = prevCount + 1;
    let lockedUntil: string | null = null;
    if (newCount >= MAX_ATTEMPTS) {
      const mult = Math.pow(2, Math.min(Math.floor(prevCount / MAX_ATTEMPTS), 4));
      const seconds = Math.min((BASE_LOCKOUT_MS / 1000) * mult, 4 * 60 * 60);
      lockedUntil = new Date(Date.now() + seconds * 1000).toISOString();
    }
    await tx.query(
      `INSERT INTO health.mfa_lockouts (user_id, tenant_id, failed_count, last_failure, locked_until, updated_at)
       VALUES ($2::uuid,$1::uuid,$3,now(),CASE WHEN $4::timestamptz IS NULL THEN NULL ELSE $4::timestamptz END,now())
       ON CONFLICT (user_id) DO UPDATE SET
         failed_count = $3,
         last_failure = now(),
         locked_until = CASE WHEN $4::timestamptz IS NULL THEN health.mfa_lockouts.locked_until ELSE $4::timestamptz END,
         updated_at = now()`,
      [tenantId, userId, newCount, lockedUntil]);
  }

  private async clearFailuresTx(tx: DbConnection, tenantId: string, userId: string): Promise<void> {
    await tx.query(
      `DELETE FROM health.mfa_lockouts WHERE tenant_id=$1::uuid AND user_id=$2::uuid`,
      [tenantId, userId]);
  }

  private async consumeChallengeTx(
    tx: DbConnection,
    args: { globalUserId: string; tenantId: string; challengeId: string },
    ...allowedTypes: Array<"enroll" | "verify" | "step_up" | "recovery">
  ): Promise<{ factorId: string; challengeId: string }> {
    const rows = await tx.query<any>(
      `SELECT challenge_id, factor_id, attempts, max_attempts, expires_at, used_at, challenge_type
         FROM health.mfa_challenges
        WHERE challenge_id=$1::uuid AND tenant_id=$2::uuid AND user_id=$3::uuid
        FOR UPDATE`,
      [args.challengeId, args.tenantId, args.globalUserId]);
    const ch = rows[0];
    if (!ch) throw new UnauthorizedException("MFA_CHALLENGE_NOT_FOUND");
    if (ch.used_at) throw new UnauthorizedException("MFA_CHALLENGE_ALREADY_USED");
    if (new Date(ch.expires_at).getTime() < Date.now()) throw new UnauthorizedException("MFA_CHALLENGE_EXPIRED");
    if (!allowedTypes.includes(ch.challenge_type)) throw new UnauthorizedException("MFA_CHALLENGE_TYPE_MISMATCH");
    if (ch.attempts >= ch.max_attempts) {
      await tx.query(`DELETE FROM health.mfa_challenges WHERE challenge_id=$1::uuid`, [args.challengeId]);
      throw new UnauthorizedException("MFA_CHALLENGE_MAX_ATTEMPTS");
    }
    await tx.query(
      `UPDATE health.mfa_challenges SET attempts = attempts + 1 WHERE challenge_id=$1::uuid`,
      [args.challengeId]);
    return { factorId: ch.factor_id, challengeId: ch.challenge_id };
  }

  private async markChallengeUsedTx(tx: DbConnection, challengeId: string, consumedBy: string): Promise<void> {
    await tx.query(
      `UPDATE health.mfa_challenges SET used_at=now(), consumed_by=$2 WHERE challenge_id=$1::uuid`,
      [challengeId, consumedBy]);
  }

  private async loadSecretBase32(tx: DbConnection, factorId: string, tenantId: string, userId: string): Promise<string> {
    const rows = await tx.query<{ totp_secret_enc: any }>(
      `SELECT totp_secret_enc FROM health.mfa_factors
        WHERE factor_id=$1::uuid AND tenant_id=$2::uuid AND user_id=$3::uuid`,
      [factorId, tenantId, userId]);
    const enc = rows[0]?.totp_secret_enc;
    if (!enc) throw new UnauthorizedException("MFA_FACTOR_NOT_FOUND");
    const buf = Buffer.isBuffer(enc) ? enc : Buffer.from(enc);
    return aes256gcmDecrypt(
      this.encryptionKeyHex,
      { enc: buf.toString("utf8") },
      `${tenantId}:${userId}:totp`,
    );
  }

  private normalizeRecovery(code: string): string {
    return code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  }
}
