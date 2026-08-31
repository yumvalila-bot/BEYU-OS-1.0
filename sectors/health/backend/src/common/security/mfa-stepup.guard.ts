import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DbConnection, DB_CONNECTION } from "../../modules/identity/db-connection";
import { timingSafeEqual } from "../crypto/crypto";

/**
 * MFA step-up guard.
 *
 * Routes decorated @RequiresMfaStepUp("action:purpose") require a recent
 * MFA challenge that is:
 *   - bound to the same userId + sessionId,
 *   - bound to the same security_version (so password change / privilege
 *     change / MFA reset invalidates prior step-ups),
 *   - bound to the same purpose/action string (prevents token reuse across
 *     sensitive actions),
 *   - not expired (default 15 minutes),
 *   - not consumed yet.
 *
 * Production login may satisfy this guard via a completed mfa_challenges row
 * whose purpose matches; otherwise caller must POST /auth/mfa/step-up first.
 */

export const MFA_STEP_UP_KEY = "mfa:step-up-action";
export const RequiresMfaStepUp = (action: string) =>
  SetMetadata(MFA_STEP_UP_KEY, action);
export const MFA_STEP_UP_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class MfaStepUpGuard implements CanActivate {
  constructor(
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<string>(MFA_STEP_UP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!action) return true;

    const req = context.switchToHttp().getRequest();
    if (!req.user?.userId) throw new ForbiddenException("NO_ACTOR");

    const userId = String(req.user.userId);
    const sessionId = String(req.user.sessionId ?? req.user.jti ?? "");

    const rows = await this.db.query<any>(
      `SELECT u.security_version, c.challenge_id, c.purpose, c.verified_at,
              c.expires_at, c.consumed_at, c.session_id, c.security_version AS c_sv
         FROM beyu_identity.users u
    LEFT JOIN health.mfa_challenges c
           ON c.user_id = u.global_user_id
          AND c.consumed_at IS NULL
          AND c.verified_at IS NOT NULL
          AND c.purpose = $2
          AND c.expires_at > now()
          AND ($3::text = '' OR c.session_id::text = $3)
        WHERE u.global_user_id = $1::uuid
     ORDER BY c.verified_at DESC NULLS LAST
        LIMIT 1`,
      [userId, action, sessionId],
    );
    const row = rows[0];
    if (!row) throw new ForbiddenException("MFA_REQUIRED");
    if (!row.verified_at) throw new ForbiddenException("MFA_REQUIRED");
    if (row.c_sv !== row.security_version) throw new ForbiddenException("MFA_STALE_SECURITY_VERSION");
    if (sessionId && row.session_id && !timingSafeEqual(String(row.session_id), sessionId)) {
      throw new ForbiddenException("MFA_SESSION_CROSSOVER");
    }
    return true;
  }
}
