/**
 * BEYU OS — internal service-to-service authentication.
 *
 * Sector OSs (Health today; Agriculture, Finance-adjacent and Foundation
 * domains later) authenticate to BEYU OS internal endpoints with short-lived
 * HS256-signed service tokens. This is SEPARATE from human authentication:
 *
 *   - Human sessions: opaque session tokens in cookies (src/lib/session.ts).
 *   - Service calls:  short-lived signed JWTs minted per request by the
 *                     sector using the shared secret held in
 *                     BEYU_INTERNAL_SERVICE_TOKEN.
 *
 * Token contract (every field mandatory unless noted):
 *   header  : { alg: "HS256", typ: "JWT" }
 *   payload : {
 *     iss: source OS identifier (allowlisted below),
 *     aud: "BEYU_OS" (fixed — a sector token can never target another sector),
 *     sub: "service:<iss>",
 *     iat, exp                       — lifetime capped at 300 seconds,
 *     jti                            — unique request id,
 *     act?                           — acting USER context when the call is
 *                                     made on behalf of a human:
 *                                     { globalUserId, tenantId, entityCode?,
 *                                       countryCode?, role?, permissions? }
 *   }
 *
 * Fail-closed rules:
 *   - No BEYU_INTERNAL_SERVICE_TOKEN configured → every call is refused
 *     (503 INTERNAL_AUTH_NOT_CONFIGURED). Internal endpoints are DISABLED,
 *     never open.
 *   - Any other algorithm (alg:none, RS256, …) is rejected before signature
 *     verification — algorithm confusion is structurally impossible.
 *   - exp/iat/iss/aud/sub are all enforced; signature comparison is
 *     constant-time.
 *   - A service token NEVER carries BEYU permissions. It authenticates the
 *     CALLING SERVICE only; authorization for the requested operation is
 *     evaluated inside the endpoint against canonical BEYU data. A sector
 *     cannot mint itself constitutional authority.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const INTERNAL_SERVICE_TOKEN_ENV = "BEYU_INTERNAL_SERVICE_TOKEN";
export const INTERNAL_AUDIENCE = "BEYU_OS";
export const MAX_SERVICE_TOKEN_LIFETIME_S = 300;
export const CLOCK_SKEW_S = 60;

/** Canonical sector/service identifiers that may call BEYU internal APIs. */
export const INTERNAL_SERVICE_ISSUERS = [
  "HEALTH_OS",
  "AGRICULTURE_OS",
  "FINANCE_OS",
  "FOUNDATION_OS",
  "BEYU_OS",
] as const;

export type InternalIssuer = (typeof INTERNAL_SERVICE_ISSUERS)[number];

export type ActingUserContext = {
  globalUserId: string;
  tenantId: string | null;
  entityCode?: string | null;
  countryCode?: string | null;
  role?: string | null;
  permissions?: string[];
};

export type InternalServiceTokenPayload = {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  jti: string;
  act?: ActingUserContext;
};

export type ServiceAuthResult =
  | { ok: true; payload: InternalServiceTokenPayload }
  | { ok: false; code: "INTERNAL_AUTH_NOT_CONFIGURED" | "INVALID_SERVICE_TOKEN"; reason: string };

function b64urlDecode(segment: string): Buffer {
  return Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Verify an internal service token. Reads the shared secret from the
 * environment on every call so configuration changes (and tests) take
 * effect immediately. NEVER throws — all failures return ok:false.
 */
export function verifyInternalServiceToken(token: string): ServiceAuthResult {
  const secret = process.env[INTERNAL_SERVICE_TOKEN_ENV];
  if (!secret || secret.length < 32) {
    return {
      ok: false,
      code: "INTERNAL_AUTH_NOT_CONFIGURED",
      reason:
        "BEYU_INTERNAL_SERVICE_TOKEN is not configured (min 32 chars); internal service endpoints are disabled. Fail closed.",
    };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, code: "INVALID_SERVICE_TOKEN", reason: "Malformed token" };
  }
  const [headerSeg, payloadSeg, signatureSeg] = parts;

  let header: { alg?: unknown; typ?: unknown };
  let payload: InternalServiceTokenPayload;
  try {
    header = JSON.parse(b64urlDecode(headerSeg).toString("utf8"));
    payload = JSON.parse(b64urlDecode(payloadSeg).toString("utf8"));
  } catch {
    return { ok: false, code: "INVALID_SERVICE_TOKEN", reason: "Unparseable token" };
  }

  // Algorithm is pinned BEFORE any signature work. `alg:none` and asymmetric
  // algorithms are rejected outright: the only accepted construction is an
  // HMAC-SHA256 signature under the shared secret.
  if (header.alg !== "HS256") {
    return { ok: false, code: "INVALID_SERVICE_TOKEN", reason: "Only HS256 is accepted" };
  }

  // Signature: constant-time comparison over the exact signing input.
  const expected = createHmac("sha256", secret).update(`${headerSeg}.${payloadSeg}`).digest();
  const provided = b64urlDecode(signatureSeg);
  if (!constantTimeEqual(expected, provided)) {
    return { ok: false, code: "INVALID_SERVICE_TOKEN", reason: "Bad signature" };
  }

  // Registered claims.
  if (payload.aud !== INTERNAL_AUDIENCE) {
    return { ok: false, code: "INVALID_SERVICE_TOKEN", reason: `aud must be ${INTERNAL_AUDIENCE}` };
  }
  if (!(INTERNAL_SERVICE_ISSUERS as readonly string[]).includes(payload.iss)) {
    return { ok: false, code: "INVALID_SERVICE_TOKEN", reason: "iss is not an allowlisted service" };
  }
  if (payload.sub !== `service:${payload.iss}`) {
    return { ok: false, code: "INVALID_SERVICE_TOKEN", reason: "sub must be service:<iss>" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || payload.exp <= now) {
    return { ok: false, code: "INVALID_SERVICE_TOKEN", reason: "Token expired or exp missing" };
  }
  if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat) || payload.iat > now + CLOCK_SKEW_S) {
    return { ok: false, code: "INVALID_SERVICE_TOKEN", reason: "iat invalid or in the future" };
  }
  if (payload.exp - payload.iat > MAX_SERVICE_TOKEN_LIFETIME_S) {
    return { ok: false, code: "INVALID_SERVICE_TOKEN", reason: "Token lifetime exceeds the 300s cap" };
  }
  if (typeof payload.jti !== "string" || payload.jti.length < 8) {
    return { ok: false, code: "INVALID_SERVICE_TOKEN", reason: "jti missing" };
  }
  if (payload.act !== undefined) {
    if (typeof payload.act !== "object" || payload.act === null || typeof payload.act.globalUserId !== "string") {
      return { ok: false, code: "INVALID_SERVICE_TOKEN", reason: "act.globalUserId required when act present" };
    }
  }

  return { ok: true, payload };
}

/** Extract + verify the bearer token from an internal request. */
export function authenticateInternalService(request: Request): ServiceAuthResult {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/.exec(header);
  if (!match) {
    return { ok: false, code: "INVALID_SERVICE_TOKEN", reason: "Missing bearer token" };
  }
  return verifyInternalServiceToken(match[1].trim());
}

/**
 * Sign an internal service token — EXPORTED FOR TESTS ONLY. Sectors mint
 * their own tokens with their own JWT libraries; BEYU OS never issues
 * service tokens on the request path.
 */
export function signInternalServiceTokenForTests(
  secret: string,
  payload: Omit<InternalServiceTokenPayload, "aud" | "sub"> & { aud?: string; sub?: string },
): string {
  const full = {
    ...payload,
    aud: payload.aud ?? INTERNAL_AUDIENCE,
    sub: payload.sub ?? `service:${payload.iss}`,
  };
  const b64url = (buf: Buffer | string) =>
    Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const headerSeg = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadSeg = b64url(JSON.stringify(full));
  const signature = createHmac("sha256", secret).update(`${headerSeg}.${payloadSeg}`).digest();
  return `${headerSeg}.${payloadSeg}.${b64url(signature)}`;
}
