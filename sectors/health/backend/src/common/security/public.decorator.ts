/**
 * @Public() decorator — marks a route (or controller) as exempt from the global
 * JwtAuthGuard. Unauthenticated access is permitted; CSRF/other guards still
 * apply where configured.
 *
 * Use sparingly and ONLY for endpoints that must be reachable without a JWT
 * (e.g. /auth/register, /auth/login, /health/live, /health/ready).
 *
 * Any @Public() mutating endpoint is inventory-scanned by
 * csrf-route-inventory.spec.ts and endpoint-security-matrix.spec.ts, which
 * CI-fails if a new unlisted @Public() POST/PUT/PATCH/DELETE is introduced
 * without explicit justification.
 */
import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
