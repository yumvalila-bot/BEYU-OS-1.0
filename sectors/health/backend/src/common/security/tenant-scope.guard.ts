import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { TenantContext } from "./tenant-context";
import { hasPermission } from "./permissions";

/**
 * Tenant isolation guard. Enforces that a request cannot read or write data
 * belonging to a tenant the actor is not authorized to act within.
 *
 * It resolves the target tenant from (in priority order):
 *   1. the `X-Tenant-Id` request header, or
 *   2. a `tenantId` path parameter, or
 *   3. a `tenantId` query parameter.
 *
 * The actor's own tenant (from the JWT/context) is always allowed. Cross-tenant
 * access is only permitted when the actor holds `tenant:switch` permission, in
 * which case the guard simply records the requested scope. In either case the
 * actor context tenant is set to the resolved scope for downstream services.
 */
@Injectable()
export class TenantScopeGuard implements CanActivate {
  constructor(private readonly tenantContext: TenantContext) {}

  canActivate(context: ExecutionContext): boolean {
    const actor = this.tenantContext.require();
    const req = context.switchToHttp().getRequest();
    const requestedTenant =
      req.headers?.["x-tenant-id"] ||
      req.params?.tenantId ||
      req.query?.tenantId ||
      undefined;

    if (!requestedTenant) {
      // No explicit target: default to the actor's own tenant scope.
      return true;
    }

    if (requestedTenant === actor.tenantId) {
      return true;
    }

    // Cross-tenant request: must hold tenant:switch authority.
    if (!hasPermission(actor.role, "tenant:switch")) {
      throw new ForbiddenException(
        `FORBIDDEN: tenant '${requestedTenant}' is outside your authorized scope`,
      );
    }

    // Authorized switch: rebind actor context to the requested tenant.
    const nextCtx = { ...actor, tenantId: String(requestedTenant) };
    this.tenantContext.enterWith(nextCtx);
    return true;
  }
}
