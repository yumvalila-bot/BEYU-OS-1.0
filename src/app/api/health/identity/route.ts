/**
 * BEYU OS — P3 Runtime Identity Endpoint (canonical)
 *
 * GET /api/health/identity
 *
 * Purpose: PVG must prove from inside production that:
 * "the production runtime is actually running the artifact we tested"
 *
 * Non-secret tuple per RUNTIME_IDENTITY_CONTRACT.md:
 * releaseId, gitSha, buildId, deploymentId, environment, applicationVersion, runtimeVersion, schemaVersion
 *
 * Binding rules:
 * - Never expose secrets, tokens, credentials, private keys, database URLs
 * - Never return data that requires authorization; unauthenticated, information-free
 * - No database dependency at request time
 * - force-dynamic
 */

import { SYSTEM_VERSION } from "@/lib/constants";
import { getRuntimeIdentityResponse, isSecretLike } from "@/lib/release/identity";

export const dynamic = "force-dynamic";

export async function GET() {
  const identity = getRuntimeIdentityResponse();

  // Safety: ensure no secret-like values are being exposed
  for (const [k, v] of Object.entries(identity)) {
    if (v && typeof v === "string" && isSecretLike(k, v)) {
      // Fail closed rather than leak
      console.error(`Blocked secret-like exposure in identity endpoint: ${k}`);
      return Response.json(
        { ok: false, error: "IDENTITY_SANITIZATION_FAILED", traceId: "identity-sanitize" },
        { status: 500 },
      );
    }
  }

  return Response.json({
    ok: true,
    system: SYSTEM_VERSION,
    identity,
    at: new Date().toISOString(),
  });
}
