/**
 * Service-to-service token minting for BEYU OS internal endpoints.
 *
 * Health OS signs a short-lived HS256 service token per outbound call using
 * the adapter's credential (e.g. BEYU_IDENTITY_TOKEN) as the shared secret.
 * BEYU OS verifies the same contract (see BEYU OS src/lib/internal/service-auth.ts):
 *
 *   header  : { alg: "HS256", typ: "JWT" }
 *   payload : { iss: "HEALTH_OS", aud: "BEYU_OS", sub: "service:HEALTH_OS",
 *               iat, exp (≤ 300s), jti, act? }
 *
 * `act` carries the acting HUMAN context (canonical GlobalUserId, tenant,
 * entity, country, role) when the call is made on behalf of a user — the
 * service identity (sub) stays separate from the human identity (act).
 *
 * Implemented with node:crypto directly (no new dependencies; mirrors the
 * verifier byte-for-byte). The secret NEVER appears in logs or outbox rows.
 */

import { createHmac, randomUUID } from "crypto";

export const SERVICE_ISSUER = "HEALTH_OS";
export const SERVICE_AUDIENCE = "BEYU_OS";
export const SERVICE_TOKEN_LIFETIME_S = 60;

export interface ServiceTokenAct {
  globalUserId: string;
  tenantId: string | null;
  entityCode?: string | null;
  countryCode?: string | null;
  role?: string | null;
}

export function signServiceToken(
  secret: string,
  act?: ServiceTokenAct,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: SERVICE_ISSUER,
    aud: SERVICE_AUDIENCE,
    sub: `service:${SERVICE_ISSUER}`,
    iat: now,
    exp: now + SERVICE_TOKEN_LIFETIME_S,
    jti: randomUUID(),
    ...(act ? { act } : {}),
  };
  const b64url = (input: string) =>
    Buffer.from(input, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest();
  const sigB64 = signature
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${signingInput}.${sigB64}`;
}
