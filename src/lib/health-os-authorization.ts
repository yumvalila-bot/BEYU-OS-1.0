/**
 * BEYU-side Health authorization is intentionally non-authoritative.
 *
 * Health owns its identity links, local account state, tenant mapping and
 * memberships in its own database. BEYU must never query those tables through
 * the BEYU connection. A signed, one-use assertion is exchanged with the
 * Health backend, which performs the complete local authorization decision.
 *
 * This compatibility helper remains fail-closed for legacy callers. It does
 * not query a database and must not be used to grant Health access.
 */
export async function checkHealthOSAuthorization(_beyuUserId: string): Promise<{
  authorized: false;
  reason: "AUTHORIZATION_SERVICE_UNAVAILABLE";
}> {
  return { authorized: false, reason: "AUTHORIZATION_SERVICE_UNAVAILABLE" };
}
