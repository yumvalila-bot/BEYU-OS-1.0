import { Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { IdentityRepository, AuthStatus } from "./identity.repository";

/**
 * Step-up / multi-factor authentication abstraction.
 *
 * IMPORTANT — honest status: no external MFA provider is connected, so no code
 * path ever claims a factor was verified. This service provides:
 *   - an explicit state model (auth_status on the user): none / mfa_enrolled /
 *     mfa_verified / step_up_required,
 *   - provider abstraction for a future TOTP/WebAuthn/SMS factor,
 *   - a `requireStepUp` gate that sensitive actions can call.
 *
 * The gate FAILS CLOSED: until a provider is connected, step-up verification is
 * always denied, so it can never weaken authorization.
 */
export interface MfaProvider {
  readonly id: string;
  /** Create an enrollment (returns a challenge/secret handle). */
  enroll(userId: string): Promise<{ challengeId: string; secret: string }>;
  /** Verify a factor assertion. Returns true only if genuinely verified. */
  verify(
    userId: string,
    challengeId: string,
    assertion: string,
  ): Promise<boolean>;
}

export class UnavailableMfaProvider implements MfaProvider {
  readonly id = "unavailable";
  async enroll(): Promise<never> {
    throw new Error("MFA_PROVIDER_NOT_CONNECTED");
  }
  async verify(): Promise<boolean> {
    return false;
  }
}

@Injectable()
export class MfaService {
  constructor(
    private readonly repo: IdentityRepository,
    @Optional()
    private readonly provider: MfaProvider = new UnavailableMfaProvider(),
  ) {}

  providerId(): string {
    return this.provider.id;
  }

  /** True when an external factor provider is actually connected. */
  providerConnected(): boolean {
    return this.provider.id !== "unavailable";
  }

  /** Mark a user as enrolled (post genuine enrollment). */
  async markEnrolled(globalUserId: string): Promise<void> {
    await this.repo.setAuthStatus(globalUserId, "mfa_enrolled");
  }

  async enroll(
    globalUserId: string,
  ): Promise<{ challengeId: string; secret: string }> {
    const result = await this.provider.enroll(globalUserId);
    await this.repo.setAuthStatus(globalUserId, "mfa_enrolled");
    return result;
  }

  /**
   * Verify a step-up factor. Fails closed: without a connected provider it always
   * throws UnauthorizedException, never grants access.
   */
  async verifyStepUp(
    globalUserId: string,
    challengeId: string,
    assertion: string,
  ): Promise<void> {
    const user = await this.repo.findUserById(globalUserId);
    if (!user) {
      throw new UnauthorizedException("USER_NOT_FOUND");
    }
    const ok = await this.provider.verify(globalUserId, challengeId, assertion);
    if (!ok) {
      await this.repo.recordAuthEvent({
        globalUserId,
        eventType: "mfa_failed",
        result: "FAILURE",
      });
      throw new UnauthorizedException("MFA_VERIFICATION_FAILED");
    }
    await this.repo.setAuthStatus(globalUserId, "mfa_verified");
    await this.repo.recordAuthEvent({
      globalUserId,
      eventType: "mfa_verified",
      result: "SUCCESS",
      context: { provider: this.provider.id },
    });
  }

  /** Assert a sensitive action is permitted given current auth_status. */
  async requireStepUp(globalUserId: string): Promise<void> {
    const user = await this.repo.findUserById(globalUserId);
    if (!user) {
      throw new UnauthorizedException("USER_NOT_FOUND");
    }
    // Fails closed unless the user has genuinely verified a factor.
    if (user.auth_status !== "mfa_verified") {
      await this.repo.recordAuthEvent({
        globalUserId,
        eventType: "step_up_denied",
        result: "DENIED",
        context: {
          reason: "step-up not verified",
          current: user.auth_status as AuthStatus,
        },
      });
      throw new UnauthorizedException("STEP_UP_REQUIRED");
    }
  }
}
