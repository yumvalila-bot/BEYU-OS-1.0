import { createPrivateKey, sign, randomUUID } from "node:crypto";
import type { Principal } from "./authz";

export const HEALTH_AUTH_ASSERTION_ISSUER = "https://www.beyu.co.tz";
export const HEALTH_AUTH_ASSERTION_AUDIENCE = "beyu-health-os";
export const HEALTH_AUTH_ASSERTION_TTL_SECONDS = 60;

function requiredEnv(name: string): string {
  const value = process.env[name]?.replace(/\\n/g, "\n").trim();
  if (!value) throw new Error(`${name} is required for Health federation.`);
  return value;
}

/**
 * Mint a one-use, short-lived BEYU identity assertion for Health OS.
 * It contains identity and tenant context only: never Health roles,
 * permissions, clinical attributes, or a BEYU bearer/session credential.
 */
export function signHealthAuthorizationAssertion(principal: Principal): {
  assertion: string;
  expiresAt: number;
} {
  if (!principal.userId || !principal.tenantId || !principal.sessionId) {
    throw new Error("A complete authenticated BEYU session is required.");
  }
  const kid = requiredEnv("HEALTH_AUTH_ASSERTION_KID");
  const privateKey = createPrivateKey(requiredEnv("HEALTH_AUTH_ASSERTION_PRIVATE_KEY"));
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("Health assertion signing key must be Ed25519.");
  }
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + HEALTH_AUTH_ASSERTION_TTL_SECONDS;
  const header = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: HEALTH_AUTH_ASSERTION_ISSUER,
    aud: HEALTH_AUTH_ASSERTION_AUDIENCE,
    sub: principal.userId,
    sid: principal.sessionId,
    tenant_id: principal.tenantId,
    tenant_code: principal.tenantCode,
    mfa_satisfied: Boolean(principal.mfaSatisfied),
    iat: now,
    exp: expiresAt,
    jti: randomUUID(),
  })).toString("base64url");
  const signingInput = `${header}.${payload}`;
  const signature = sign(null, Buffer.from(signingInput), privateKey).toString("base64url");
  return { assertion: `${signingInput}.${signature}`, expiresAt };
}
