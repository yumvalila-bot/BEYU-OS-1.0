/**
 * BEYU OS — Operating-system authorization check.
 *
 * BEYU OS is the constitutional control plane. A valid session alone is NOT
 * authorization to enter it. A principal may enter BEYU OS only when the
 * identity graph and role grants actually yield at least one control-plane
 * capability (i.e. at least one effective permission).
 *
 * This keeps frontend routing aligned with the backend-authoritative guard
 * (`requireAccess`): users who can still be authenticated but have no BEYU
 * capability are not shown BEYU OS. They can still be routed to a Sector OS
 * (e.g. Health) when that sector grants access, but never to a control-plane
 * capability they cannot exercise.
 *
 * This check grants REACHABILITY only, never CREDENTIALS. The actual pages still
 * call `requireAccess(<permission>)`; the launcher only avoids promising access
 * that the backend would deny.
 */
import type { Principal } from "./authz";

export interface OsAuthorization {
  authorized: boolean;
  reason: string;
}

/**
 * A principal is BEYU OS authorized when their resolved role grants contain at
 * least one effective control-plane permission. If no permission is present,
 * deny (fail-closed).
 */
export function checkBeyuOSAuthorization(principal: Principal): OsAuthorization {
  if (!principal || principal.permissions.size === 0) {
    return {
      authorized: false,
      reason: "NO_CONTROL_PLANE_PERMISSION",
    };
  }
  return {
    authorized: true,
    reason: "CONTROL_PLANE_PERMISSION_PRESENT",
  };
}
