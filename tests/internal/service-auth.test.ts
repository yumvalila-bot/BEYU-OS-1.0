/**
 * Internal service authentication — token verification matrix.
 *
 * Proves the fail-closed contract of src/lib/internal/service-auth.ts:
 *   - no configured secret → every call refused (endpoints disabled),
 *   - algorithm pinned to HS256 (alg:none / RS256 rejected pre-verification),
 *   - aud/iss/sub/exp/iat/jti all enforced,
 *   - lifetime capped at 300s,
 *   - signature compared in constant time (tamper → reject).
 */

import { describe, expect, it } from "vitest";
import {
  INTERNAL_SERVICE_TOKEN_ENV,
  INTERNAL_AUDIENCE,
  signInternalServiceTokenForTests,
  verifyInternalServiceToken,
  authenticateInternalService,
} from "../../src/lib/internal/service-auth";

const SECRET = "test-internal-secret-0123456789abcdef0123456789";
const now = Math.floor(Date.now() / 1000);

function makeRequest(token?: string): Request {
  return new Request("http://localhost/api/v1/internal/identity/lookup", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function baseToken(overrides: Record<string, unknown> = {}): string {
  return signInternalServiceTokenForTests(SECRET, {
    iss: "HEALTH_OS",
    iat: now - 10,
    exp: now + 60,
    jti: "test-jti-0001",
    ...overrides,
  } as never);
}

describe("internal service token verification", () => {
  it("accepts a valid HS256 token with the full claim contract", () => {
    process.env[INTERNAL_SERVICE_TOKEN_ENV] = SECRET;
    const r = verifyInternalServiceToken(baseToken());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.iss).toBe("HEALTH_OS");
      expect(r.payload.aud).toBe(INTERNAL_AUDIENCE);
      expect(r.payload.sub).toBe("service:HEALTH_OS");
    }
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
  });

  it("fail closed: refuses everything when the shared secret is unset", () => {
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
    const r = verifyInternalServiceToken(baseToken());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INTERNAL_AUTH_NOT_CONFIGURED");
  });

  it("refuses a short secret (<32 chars) as not-configured", () => {
    process.env[INTERNAL_SERVICE_TOKEN_ENV] = "too-short";
    const r = verifyInternalServiceToken(signInternalServiceTokenForTests("too-short", {
      iss: "HEALTH_OS",
      iat: now - 10,
      exp: now + 60,
      jti: "test-jti-0002",
    } as never));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INTERNAL_AUTH_NOT_CONFIGURED");
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
  });

  it("rejects alg:none (unsigned token)", () => {
    process.env[INTERNAL_SERVICE_TOKEN_ENV] = SECRET;
    const b64 = (s: string) => Buffer.from(s).toString("base64url");
    const header = b64(JSON.stringify({ alg: "none", typ: "JWT" }));
    const payload = b64(JSON.stringify({ iss: "HEALTH_OS", aud: INTERNAL_AUDIENCE, iat: now - 10, exp: now + 60, jti: "noalg-0001" }));
    const r = verifyInternalServiceToken(`${header}.${payload}.`);
    expect(r.ok).toBe(false);
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
  });

  it("rejects an RS256-signed header (algorithm confusion)", () => {
    process.env[INTERNAL_SERVICE_TOKEN_ENV] = SECRET;
    const b64 = (s: string) => Buffer.from(s).toString("base64url");
    const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = b64(JSON.stringify({ iss: "HEALTH_OS", aud: INTERNAL_AUDIENCE, iat: now - 10, exp: now + 60, jti: "rs-0001" }));
    const r = verifyInternalServiceToken(`${header}.${payload}.bogus`);
    expect(r.ok).toBe(false);
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
  });

  it("rejects a tampered payload (signature mismatch)", () => {
    process.env[INTERNAL_SERVICE_TOKEN_ENV] = SECRET;
    const valid = baseToken();
    const [h, p, s] = valid.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ iss: "BEYU_OS", aud: INTERNAL_AUDIENCE, sub: "service:BEYU_OS", iat: now - 10, exp: now + 60, jti: "tamper-0001" }),
    ).toString("base64url");
    const r = verifyInternalServiceToken(`${h}.${tamperedPayload}.${s}`);
    expect(r.ok).toBe(false);
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
  });

  it("rejects a wrong signing secret", () => {
    process.env[INTERNAL_SERVICE_TOKEN_ENV] = SECRET;
    const other = signInternalServiceTokenForTests("another-secret-0123456789abcdef0123456", {
      iss: "HEALTH_OS",
      iat: now - 10,
      exp: now + 60,
      jti: "wrongkey-0001",
    } as never);
    const r = verifyInternalServiceToken(other);
    expect(r.ok).toBe(false);
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
  });

  it("rejects wrong audience", () => {
    process.env[INTERNAL_SERVICE_TOKEN_ENV] = SECRET;
    const r = verifyInternalServiceToken(baseToken({ aud: "HEALTH_OS" }));
    expect(r.ok).toBe(false);
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
  });

  it("rejects a non-allowlisted issuer", () => {
    process.env[INTERNAL_SERVICE_TOKEN_ENV] = SECRET;
    const r = verifyInternalServiceToken(baseToken({ iss: "SHADOW_OS", sub: "service:SHADOW_OS" }));
    expect(r.ok).toBe(false);
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
  });

  it("rejects sub not matching service:<iss>", () => {
    process.env[INTERNAL_SERVICE_TOKEN_ENV] = SECRET;
    const r = verifyInternalServiceToken(baseToken({ sub: "service:BEYU_OS" }));
    expect(r.ok).toBe(false);
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
  });

  it("rejects an expired token", () => {
    process.env[INTERNAL_SERVICE_TOKEN_ENV] = SECRET;
    const r = verifyInternalServiceToken(baseToken({ iat: now - 400, exp: now - 10 }));
    expect(r.ok).toBe(false);
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
  });

  it("rejects a token whose lifetime exceeds the 300s cap", () => {
    process.env[INTERNAL_SERVICE_TOKEN_ENV] = SECRET;
    const r = verifyInternalServiceToken(baseToken({ iat: now - 10, exp: now + 600 }));
    expect(r.ok).toBe(false);
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
  });

  it("rejects a missing jti", () => {
    process.env[INTERNAL_SERVICE_TOKEN_ENV] = SECRET;
    const r = verifyInternalServiceToken(baseToken({ jti: "" }));
    expect(r.ok).toBe(false);
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
  });

  it("rejects act without globalUserId (a service token cannot act as a vague human)", () => {
    process.env[INTERNAL_SERVICE_TOKEN_ENV] = SECRET;
    const r = verifyInternalServiceToken(baseToken({ act: { tenantId: "TEN-X" } }));
    expect(r.ok).toBe(false);
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
  });

  it("accepts act with a concrete globalUserId", () => {
    process.env[INTERNAL_SERVICE_TOKEN_ENV] = SECRET;
    const r = verifyInternalServiceToken(
      baseToken({ act: { globalUserId: "USR-123", tenantId: "TEN-1", role: "doctor" } }),
    );
    expect(r.ok).toBe(true);
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
  });
});

describe("authenticateInternalService (request header extraction)", () => {
  it("rejects a request without an Authorization header", () => {
    process.env[INTERNAL_SERVICE_TOKEN_ENV] = SECRET;
    const r = authenticateInternalService(makeRequest());
    expect(r.ok).toBe(false);
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
  });

  it("rejects a non-Bearer Authorization header", () => {
    process.env[INTERNAL_SERVICE_TOKEN_ENV] = SECRET;
    const req = new Request("http://localhost/x", {
      method: "POST",
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });
    const r = authenticateInternalService(req);
    expect(r.ok).toBe(false);
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
  });

  it("extracts and verifies a valid bearer token", () => {
    process.env[INTERNAL_SERVICE_TOKEN_ENV] = SECRET;
    const r = authenticateInternalService(makeRequest(baseToken()));
    expect(r.ok).toBe(true);
    delete process.env[INTERNAL_SERVICE_TOKEN_ENV];
  });
});
