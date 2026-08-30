import { SetMetadata } from "@nestjs/common";
import { Permission } from "./permissions";

export const REQUIRED_PERMISSIONS_KEY = "beyu:required-permissions";

/**
 * Declare the permission(s) required to access a route.
 * Usage: @RequirePermission('phi:read') or @RequirePermission('phi:read', 'note:write')
 * (multiple permissions are ANDed by the PermissionsGuard).
 */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
