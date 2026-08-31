import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY } from "../../../common/security/public.decorator";

/**
 * Global JWT authentication guard. Verifies the Bearer access token signature
 * via the JWT strategy and attaches `req.user`. Routes decorated with @Public()
 * (from common/security/public.decorator) are exempt.
 *
 * NOTE: populating the request-scoped TenantContext is performed by the global
 * AuthContextMiddleware (which does a DB-driven freshness + authorization
 * lookup), so this guard does NOT overwrite that context with raw token claims.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}
