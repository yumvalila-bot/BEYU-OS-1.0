import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import { IdentityRepository, StoredSession } from "./identity.repository";

/**
 * Persistent session management with:
 *  - hashed refresh tokens (raw tokens are never stored),
 *  - refresh-token rotation (each refresh issues a new session + token),
 *  - reuse detection (presenting an already-rotated token revokes the family),
 *  - per-session access-token jti tracking,
 *  - logout/global-logout (invalidate all sessions).
 */
@Injectable()
export class SessionService {
  constructor(private readonly repo: IdentityRepository) {}

  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async createSession(input: {
    globalUserId: string;
    tenantId: string | null;
    refreshToken: string;
    jti: string;
    expiresAt: Date;
  }): Promise<StoredSession> {
    return this.repo.createSession({
      globalUserId: input.globalUserId,
      tenantId: input.tenantId,
      refreshTokenHash: this.hashToken(input.refreshToken),
      jti: input.jti,
      expiresAt: input.expiresAt,
    });
  }

  /**
   * Rotate a session given the presented (rotating) refresh token.
   * Returns the new session alongside its new refresh token.
   */
  async rotateSession(
    presentedRefreshToken: string,
    issuedRefreshToken: string,
    jti: string,
    expiresAt: Date,
  ): Promise<{ session: StoredSession; newRefreshToken: string }> {
    const presentedHash = this.hashToken(presentedRefreshToken);
    const session = await this.repo.findSessionByRefreshHash(presentedHash);

    // Reuse detection: no active session matches the presented token.
    if (!session) {
      throw new UnauthorizedException("INVALID_SESSION");
    }
    if (session.status !== "active") {
      // A previously rotated/revoked token was replayed → revoke the family.
      await this.repo.revokeSessionFamily(session.session_id);
      await this.repo.recordAuthEvent({
        globalUserId: session.global_user_id,
        tenantId: session.tenant_id,
        eventType: "session_reuse_detected",
        result: "DENIED",
        context: {
          reason: "refresh token reuse",
          sessionId: session.session_id,
        },
      });
      throw new UnauthorizedException("SESSION_REUSE_DETECTED");
    }
    if (new Date(session.expires_at).getTime() < Date.now()) {
      await this.repo.updateSessionStatus(session.session_id, "expired");
      throw new UnauthorizedException("SESSION_EXPIRED");
    }

    // Mark old session as rotated and insert the new session (chained).
    await this.repo.updateSessionStatus(session.session_id, "rotated");
    const created = await this.repo.createSession({
      globalUserId: session.global_user_id,
      tenantId: session.tenant_id,
      refreshTokenHash: this.hashToken(issuedRefreshToken),
      jti,
      expiresAt,
    });
    await this.repo.recordAuthEvent({
      globalUserId: session.global_user_id,
      tenantId: session.tenant_id,
      eventType: "token_rotation",
      result: "SUCCESS",
      context: {
        fromSession: session.session_id,
        toSession: created.session_id,
        jti,
      },
    });
    return { session: created, newRefreshToken: issuedRefreshToken };
  }

  /** Revoke a specific session (logout). */
  async revokeSession(refreshToken: string, _userId?: string): Promise<void> {
    const hash = this.hashToken(refreshToken);
    const session = await this.repo.findSessionByRefreshHash(hash);
    if (session) {
      await this.repo.updateSessionStatus(session.session_id, "revoked");
      await this.repo.recordAuthEvent({
        globalUserId: session.global_user_id,
        tenantId: session.tenant_id,
        eventType: "session_revoked",
        result: "SUCCESS",
        context: { reason: "logout", sessionId: session.session_id },
      });
    }
  }

  /** Global logout — invalidate all sessions for a user. */
  async revokeAllSessions(globalUserId: string): Promise<void> {
    await this.repo.revokeAllUserSessions(globalUserId);
    await this.repo.recordAuthEvent({
      globalUserId,
      eventType: "global_logout",
      result: "SUCCESS",
    });
  }

  /** Ensure the session referenced by a refresh token is active (session restoration check). */
  async assertSessionActive(refreshToken: string): Promise<StoredSession> {
    const hash = this.hashToken(refreshToken);
    const session = await this.repo.findSessionByRefreshHash(hash);
    if (!session || session.status !== "active") {
      throw new UnauthorizedException("SESSION_INVALID");
    }
    if (new Date(session.expires_at).getTime() < Date.now()) {
      await this.repo.updateSessionStatus(session.session_id, "expired");
      throw new UnauthorizedException("SESSION_EXPIRED");
    }
    return session;
  }

  newJti(): string {
    return randomUUID();
  }

  async updateJti(sessionId: string, jti: string): Promise<void> {
    await this.repo.updateSessionJti(sessionId, jti);
  }
}
