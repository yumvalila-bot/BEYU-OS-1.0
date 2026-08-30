import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * Route-level authentication guard. Verifies the Bearer access token signature
 * via the JWT strategy and attaches `req.user`.
 *
 * NOTE: entering the request-scoped TenantContext is performed by the global
 * AuthContextMiddleware (which also does the DB-driven freshness + authorization
 * lookup), so this guard does NOT overwrite that context with token claims.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}
