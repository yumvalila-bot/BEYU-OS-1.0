import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from "@nestjs/common";
import { NextFunction, Request } from "express";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { TenantContext, ActorContext } from "./tenant-context";
import { IdentityRepository } from "../../modules/identity/identity.repository";
import { AuditService } from "../../modules/identity/audit.service";

interface TokenClaims {
  sub: string;
  email: string;
  role: string;
  tenantId?: string | null;
  sv?: number;
  permissions?: string[];
}

/**
 * Global authentication + authorization-context middleware.
 *
 * Runs BEFORE all guards (middleware always precedes guards), so it removes any
 * dependence on NestJS guard execution order. For every request:
 *   1. Parses the Bearer access token (missing/invalid → no actor; guards deny
 *      protected routes).
 *   2. Verifies signature + expiry via JwtService.
 *   3. Performs a SERVER-SIDE, DB-driven freshness/authorization lookup:
 *        - account must be active,
 *        - token security version (sv) must equal the user's current
 *          `security_version` (bumped on disable / role / membership /
 *          permission change),
 *        - tenant membership must be active, and the role/permissions are loaded
 *          from the DATABASE (not from token claims).
 *   4. Enters the actor's TenantContext for downstream guards/services.
 *
 * This ensures revoked authorization (disabled account, membership removal,
 * role/permission change) takes effect on the next request — no stale claims.
 * A valid but stale/disabled token is rejected with 401.
 */
@Injectable()
export class AuthContextMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly repo: IdentityRepository,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
    private readonly config: ConfigService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = this.extractToken(req);
    if (!token) {
      next();
      return;
    }

    let claims: TokenClaims;
    try {
      claims = this.jwtService.verify<TokenClaims>(token, {
        issuer: this.config.get<string>("JWT_ISSUER") || undefined,
        audience: this.config.get<string>("JWT_AUDIENCE") || undefined,
        // Constrain to HS256 to prevent algorithm-confusion / alg:none attacks.
        algorithms: ["HS256"],
      });
    } catch {
      // Invalid/expired/forged token (or wrong issuer/audience when configured):
      // leave unauthenticated; guards will deny.
      next();
      return;
    }

    const userId = claims.sub;
    const user = await this.repo.findUserById(userId);
    if (!user) {
      next();
      return;
    }

    if (user.account_status !== "active") {
      await this.audit.record({
        globalUserId: userId,
        eventType: "token_rejected",
        result: "DENIED",
        context: { reason: "account_disabled", status: user.account_status },
      });
      throw new UnauthorizedException("ACCOUNT_DISABLED");
    }

    // Authorization changed after the token was issued → reject stale claims.
    const tokenSv = claims.sv ?? 0;
    if (tokenSv !== user.security_version) {
      await this.audit.record({
        globalUserId: userId,
        eventType: "token_rejected",
        result: "DENIED",
        context: {
          reason: "security_version_stale",
          tokenSv,
          currentSv: user.security_version,
        },
      });
      throw new UnauthorizedException("AUTHORIZATION_CHANGED");
    }

    // Resolve tenant + role + permissions from the DATABASE (never token claims).
    const tenantId = claims.tenantId ?? null;
    let role = claims.role ?? "patient";
    if (tenantId) {
      const membership = await this.repo.findActiveMembership(userId, tenantId);
      if (!membership) {
        await this.audit.record({
          globalUserId: userId,
          tenantId,
          eventType: "token_rejected",
          result: "DENIED",
          context: { reason: "no_active_membership" },
        });
        throw new UnauthorizedException("NO_TENANT_MEMBERSHIP");
      }
      role = membership.role;
    }
    const permissions = await this.repo.permissionsForRole(role);

    const actor: ActorContext = {
      userId: user.global_user_id,
      email: user.email,
      role,
      permissions: permissions as string[],
      tenantId: tenantId ?? "default",
    };
    // Scope the actor to this request's async chain; cleared when next() completes.
    this.tenantContext.run(actor, () => next());
  }

  private extractToken(req: Request): string | null {
    const header = req.headers.authorization;
    if (!header) return null;
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) return null;
    return token;
  }
}
