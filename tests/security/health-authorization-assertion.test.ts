import { afterEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, createPublicKey, verify } from "node:crypto";
import type { Principal } from "@/lib/authz";
import {
  signHealthAuthorizationAssertion,
  HEALTH_AUTH_ASSERTION_AUDIENCE,
  HEALTH_AUTH_ASSERTION_ISSUER,
  HEALTH_AUTH_ASSERTION_TTL_SECONDS,
} from "@/lib/health-authorization-assertion";

const oldPrivate = process.env.HEALTH_AUTH_ASSERTION_PRIVATE_KEY;
const oldKid = process.env.HEALTH_AUTH_ASSERTION_KID;
const pair = generateKeyPairSync("ed25519");
const privatePem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();

const principal = {
  userId: "USR_TEST_01",
  partyId: "PTY_TEST_01",
  email: "person@example.test",
  displayName: "Test Person",
  tenantId: "TEN_TEST_01",
  tenantCode: "BEYU-HEALTH",
  tenantType: "SECTOR",
  roles: ["DOCTOR"],
  permissions: new Set(["patient:read"]),
  clearance: "CONFIDENTIAL",
  entityScope: [],
  mfaSatisfied: true,
  sessionId: "SES_TEST_01",
  riskScore: 0,
  emergencyPermissions: [],
} as unknown as Principal;

afterEach(() => {
  if (oldPrivate === undefined) delete process.env.HEALTH_AUTH_ASSERTION_PRIVATE_KEY;
  else process.env.HEALTH_AUTH_ASSERTION_PRIVATE_KEY = oldPrivate;
  if (oldKid === undefined) delete process.env.HEALTH_AUTH_ASSERTION_KID;
  else process.env.HEALTH_AUTH_ASSERTION_KID = oldKid;
});

describe("BEYU Health Ed25519 assertion", () => {
  it("signs a 60-second identity-only assertion verifiable by Health's public key", () => {
    process.env.HEALTH_AUTH_ASSERTION_PRIVATE_KEY = privatePem;
    process.env.HEALTH_AUTH_ASSERTION_KID = "health-key-2026-01";
    const result = signHealthAuthorizationAssertion(principal);
    const [headerPart, payloadPart, signaturePart] = result.assertion.split(".");
    const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8"));
    const claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
    expect(header).toEqual({ alg: "EdDSA", typ: "JWT", kid: "health-key-2026-01" });
    expect(verify(null, Buffer.from(`${headerPart}.${payloadPart}`), createPublicKey(publicPem), Buffer.from(signaturePart, "base64url"))).toBe(true);
    expect(claims.iss).toBe(HEALTH_AUTH_ASSERTION_ISSUER);
    expect(claims.aud).toBe(HEALTH_AUTH_ASSERTION_AUDIENCE);
    expect(claims.sub).toBe(principal.userId);
    expect(claims.sid).toBe(principal.sessionId);
    expect(claims.tenant_id).toBe(principal.tenantId);
    expect(claims.exp - claims.iat).toBe(HEALTH_AUTH_ASSERTION_TTL_SECONDS);
    expect(claims.jti).toBeTruthy();
    expect(claims).not.toHaveProperty("permissions");
    expect(claims).not.toHaveProperty("roles");
    expect(claims).not.toHaveProperty("tenant_code");
    expect(claims).not.toHaveProperty("mfa_satisfied");
  });

  it("refuses to mint if the private signing key or session context is missing", () => {
    delete process.env.HEALTH_AUTH_ASSERTION_PRIVATE_KEY;
    process.env.HEALTH_AUTH_ASSERTION_KID = "health-key-2026-01";
    expect(() => signHealthAuthorizationAssertion(principal)).toThrow(/PRIVATE_KEY is required/);
    process.env.HEALTH_AUTH_ASSERTION_PRIVATE_KEY = privatePem;
    expect(() => signHealthAuthorizationAssertion({ ...principal, sessionId: "" })).toThrow(/complete authenticated BEYU session/);
  });
});
