import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { TenantContext } from "./tenant-context";
import { REQUIRED_PERMISSIONS_KEY } from "./require-permission.decorator";
import { Permission, effectivePermissions } from "./permissions";

/**
 * RBAC/ABAC enforcement at the API boundary. Reads the permission(s) declared on
 * a route via @RequirePermission(...) and checks them against the authenticated
 * actor's effective permission set. Denies by default.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContext,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const actor = this.tenantContext.current();
    if (!actor) {
      throw new ForbiddenException("AUTH_REQUIRED");
    }

    const effective = effectivePermissions(
      actor.role,
      actor.permissions as Permission[],
    );
    for (const permission of required) {
      if (!effective.has(permission)) {
        throw new ForbiddenException(
          `FORBIDDEN: missing permission '${permission}' for role '${actor.role}'`,
        );
      }
    }
    return true;
  }
}
