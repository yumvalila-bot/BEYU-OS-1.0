import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createPublicKey, verify as verifySignature } from "node:crypto";
import { DB_CONNECTION, type DbConnection } from "./db-connection";
import { Inject } from "@nestjs/common";


type AssertionClaims = {
  iss: string;
  aud: string;
  sub: string;
  sid: string;
  tenant_id: string;
  iat: number;
  exp: number;
  jti: string;
};

export type ResolvedBeyuActor = {
  user: {
    global_user_id: string;
    email: string;
    display_name: string;
    security_version: number;
  };
  tenantId: string;
  role: string;
  canonicalUserId: string;
};

/**
 * Verifies BEYU's asymmetric assertion, consumes its one-use jti in Health's
 * own database, then resolves identity, tenant and authority exclusively from
 * Health-local records. No BEYU database connection or permission claims exist.
 */
@Injectable()
export class BeyuAuthorizationAssertionService {
  constructor(
    private readonly config: ConfigService,
    @Inject(DB_CONNECTION) private readonly conn: DbConnection,
  ) {}

  private decodePart(part: string): Record<string, unknown> {
    const value = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new UnauthorizedException("INVALID_BEYU_ASSERTION");
    }
    return value as Record<string, unknown>;
  }

  private verify(token: string): AssertionClaims {
    if (typeof token !== "string" || token.length > 8192) {
      throw new UnauthorizedException("INVALID_BEYU_ASSERTION");
    }
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((part) => !part)) {
      throw new UnauthorizedException("INVALID_BEYU_ASSERTION");
    }
    const [encodedHeader, encodedClaims, encodedSignature] = parts;
    const header = this.decodePart(encodedHeader);
    const claims = this.decodePart(encodedClaims);
    if (header.alg !== "EdDSA" || header.typ !== "JWT" || typeof header.kid !== "string") {
      throw new UnauthorizedException("INVALID_BEYU_ASSERTION_HEADER");
    }

    const issuer = this.config.get<string>("BEYU_AUTH_ASSERTION_ISSUER", "https://www.beyu.co.tz");
    const audience = this.config.get<string>("BEYU_AUTH_ASSERTION_AUDIENCE", "beyu-health-os");
    const now = Math.floor(Date.now() / 1000);
    if (
      claims.iss !== issuer ||
      claims.aud !== audience ||
      typeof claims.sub !== "string" ||
      !claims.sub ||
      typeof claims.sid !== "string" ||
      !claims.sid ||
      typeof claims.tenant_id !== "string" ||
      !claims.tenant_id ||
      typeof claims.iat !== "number" ||
      typeof claims.exp !== "number" ||
      typeof claims.jti !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(claims.jti) ||
      claims.iat > now + 30 ||
      claims.exp <= now ||
      claims.exp <= claims.iat ||
      claims.exp - claims.iat > 90
    ) {
      throw new UnauthorizedException("BEYU_ASSERTION_CLAIMS_INVALID");
    }

    const configuredKid = this.config.get<string>("BEYU_AUTH_ASSERTION_KID");
    let publicPem: string | undefined;
    const keySetRaw = this.config.get<string>("BEYU_AUTH_ASSERTION_PUBLIC_KEYS");
    if (keySetRaw) {
      try {
        const keySet = JSON.parse(keySetRaw) as Record<string, string>;
        publicPem = keySet[header.kid];
      } catch {
        throw new ServiceUnavailableException("BEYU_ASSERTION_KEYSET_INVALID");
      }
    } else if (configuredKid === header.kid) {
      publicPem = this.config.get<string>("BEYU_AUTH_ASSERTION_PUBLIC_KEY");
    }
    if (!keySetRaw && (!configuredKid || !this.config.get<string>("BEYU_AUTH_ASSERTION_PUBLIC_KEY"))) {
      throw new ServiceUnavailableException("BEYU_ASSERTION_VERIFIER_NOT_CONFIGURED");
    }
    if (!publicPem) throw new UnauthorizedException("BEYU_ASSERTION_KEY_UNKNOWN");

    try {
      const key = createPublicKey(publicPem.replace(/\\n/g, "\n"));
      if (key.asymmetricKeyType !== "ed25519") {
        throw new Error("Expected Ed25519 public key");
      }
      const valid = verifySignature(
        null,
        Buffer.from(`${encodedHeader}.${encodedClaims}`),
        key,
        Buffer.from(encodedSignature, "base64url"),
      );
      if (!valid) throw new UnauthorizedException("BEYU_ASSERTION_SIGNATURE_INVALID");
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new ServiceUnavailableException("BEYU_ASSERTION_KEY_INVALID");
    }
    return claims as AssertionClaims;
  }

  async verifyAndResolve(token: string): Promise<ResolvedBeyuActor> {
    const claims = this.verify(token);

    // Consume before any authorization lookup. A denied exchange cannot be
    // retried with the same assertion after a local account/membership change.
    await this.conn.query(
      `DELETE FROM beyu_identity.authorization_assertion_replays WHERE expires_at <= now()`,
    );
    const consumed = await this.conn.query(
      `INSERT INTO beyu_identity.authorization_assertion_replays (jti, canonical_user_id, expires_at)
       VALUES ($1, $2, to_timestamp($3))
       ON CONFLICT (jti) DO NOTHING
       RETURNING jti`,
      [claims.jti, claims.sub, claims.exp],
    );
    if (consumed.length !== 1) {
      throw new UnauthorizedException("BEYU_ASSERTION_REPLAYED");
    }

    const resolved = await this.conn.query<{
      decision_code: string;
      global_user_id: string | null;
      email: string | null;
      display_name: string | null;
      security_version: number | null;
      tenant_id: string | null;
      role: string | null;
    }>(
      `SELECT * FROM beyu_identity.resolve_beyu_authorization($1, $2)`,
      [claims.sub, claims.tenant_id],
    );
    const actor = resolved[0];
    if (!actor) {
      throw new ServiceUnavailableException("HEALTH_AUTHORIZATION_RESOLVER_UNAVAILABLE");
    }
    if (
      actor.decision_code !== "AUTHORIZED" ||
      !actor.global_user_id ||
      !actor.email ||
      !actor.display_name ||
      actor.security_version === null ||
      !actor.tenant_id ||
      !actor.role
    ) {
      throw new ForbiddenException(actor.decision_code);
    }
    return {
      user: {
        global_user_id: actor.global_user_id,
        email: actor.email,
        display_name: actor.display_name,
        security_version: actor.security_version,
      },
      tenantId: actor.tenant_id,
      role: actor.role,
      canonicalUserId: claims.sub,
    };
  }
}
