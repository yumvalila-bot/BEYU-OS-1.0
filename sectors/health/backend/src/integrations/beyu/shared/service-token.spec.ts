/**
 * Service token minting — contract tests for the Health → BEYU service
 * identity. Mirrors the verifier (BEYU OS src/lib/internal/service-auth.ts)
 * and proves the minted tokens satisfy every registered-claim constraint the
 * control plane enforces, and NOTHING a human token would carry.
 */
import { createHmac } from "crypto";
import {
  signServiceToken,
  SERVICE_ISSUER,
  SERVICE_AUDIENCE,
  SERVICE_TOKEN_LIFETIME_S,
  type ServiceTokenAct,
} from "./service-token";

const SECRET = "spec-secret-0123456789abcdef0123456789";

function decode(seg: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(seg.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    ),
  );
}

describe("signServiceToken (service identity contract)", () => {
  it("mints an HS256 JWT with the exact registered-claim contract", () => {
    const tok = signServiceToken(SECRET);
    const parts = tok.split(".");
    expect(parts).toHaveLength(3);
    const header = decode(parts[0]);
    expect(header).toEqual({ alg: "HS256", typ: "JWT" });
    const claims = decode(parts[1]);
    expect(claims.iss).toBe(SERVICE_ISSUER);
    expect(claims.aud).toBe(SERVICE_AUDIENCE);
    expect(claims.sub).toBe(`service:${SERVICE_ISSUER}`);
    expect(typeof claims.iat).toBe("number");
    expect(typeof claims.jti).toBe("string");
  });

  it("caps the token lifetime at the configured bound (≤ 300s control-plane cap)", () => {
    const claims = decode(signServiceToken(SECRET).split(".")[1]);
    expect(claims.exp).toBe((claims.iat as number) + SERVICE_TOKEN_LIFETIME_S);
    expect(SERVICE_TOKEN_LIFETIME_S).toBeLessThanOrEqual(300);
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("signs with the shared secret (verifiable HMAC-SHA256, deterministic header.payload)", () => {
    const [h, p, s] = signServiceToken(SECRET).split(".");
    const expected = createHmac("sha256", SECRET).update(`${h}.${p}`).digest();
    const provided = Buffer.from(
      s.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    );
    expect(expected.equals(provided)).toBe(true);
    // A different secret must NOT verify.
    const wrong = createHmac("sha256", "other-secret")
      .update(`${h}.${p}`)
      .digest();
    expect(wrong.equals(provided)).toBe(false);
  });

  it("carries the acting HUMAN context in act, separate from the service subject", () => {
    const act: ServiceTokenAct = {
      globalUserId: "USR_123",
      tenantId: "TEN_1",
      entityCode: "HOSP-1",
      countryCode: "TZ",
      role: "doctor",
    };
    const claims = decode(signServiceToken(SECRET, act).split(".")[1]);
    expect(claims.sub).toBe("service:HEALTH_OS"); // service identity unchanged
    expect(claims.act).toEqual(act); // human context is a claim, not the subject
  });

  it("never embeds the secret or credential material in the token itself", () => {
    const tok = signServiceToken(SECRET);
    expect(tok).not.toContain(SECRET);
  });

  it("mints a fresh jti per call (no replayable static token)", () => {
    const a = decode(signServiceToken(SECRET).split(".")[1]);
    const b = decode(signServiceToken(SECRET).split(".")[1]);
    expect(a.jti).not.toBe(b.jti);
  });
});
