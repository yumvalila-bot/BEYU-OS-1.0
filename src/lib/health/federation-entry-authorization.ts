import { can, type Principal } from "@/lib/authz";
import type { Classification } from "@/lib/constants";
import { checkHealthOSAuthorization } from "@/lib/health-os-authorization";

/**
 * Unwired prerequisite for a future Health federation exchange. This function
 * does not issue an assertion, create a Health session, or authorize a clinical
 * operation. Its caller MUST first resolve the live session and the active
 * tenant/entity/country/classification facts server-side and independently
 * enforce destination lifecycle, tenant domain and operation-specific policy.
 * Never populate `scope` from an unvalidated request or a client-side claim.
 */
export type HealthFederationScope = {
  tenantId: string;
  entityId: string;
  countryCode: string;
  classification: Classification;
};

export type HealthFederationEntryDecision =
  | { allowed: true; sectorUserId: string }
  | { allowed: false; reason: "DENIED" | "UNAVAILABLE" };

export async function authorizeHealthFederationEntry(
  principal: Principal | null,
  scope: HealthFederationScope,
): Promise<HealthFederationEntryDecision> {
  // Principal comes from the canonical live session resolver, not request data.
  // Do not infer account state, personhood, session identity or scoped facts.
  if (
    !principal ||
    principal.accountStatus !== "ACTIVE" ||
    principal.isServiceAccount !== false ||
    !principal.userId ||
    !principal.sessionId ||
    !scope.tenantId ||
    scope.tenantId !== principal.tenantId ||
    !scope.entityId ||
    !scope.countryCode ||
    !scope.classification
  ) return { allowed: false, reason: "DENIED" };

  // Existing `can()` matches ONE live authority tuple over all dimensions;
  // neither a client-side permission summary nor an identity link is a grant.
  if (!can(principal, "health:federation.exchange", scope).allowed) {
    return { allowed: false, reason: "DENIED" };
  }

  try {
    const link = await checkHealthOSAuthorization(principal.userId);
    if (!link.authorized) {
      return {
        allowed: false,
        reason: link.reason === "AUTHORIZATION_SERVICE_UNAVAILABLE" ? "UNAVAILABLE" : "DENIED",
      };
    }
    if (!link.sectorUserId) return { allowed: false, reason: "UNAVAILABLE" };
    return { allowed: true, sectorUserId: link.sectorUserId };
  } catch {
    return { allowed: false, reason: "UNAVAILABLE" };
  }
}
