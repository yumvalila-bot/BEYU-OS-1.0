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
import { IdentityRepository, type StoredUser } from "./identity.repository";

type AssertionClaims = {
  iss: string;
  aud: string;
  sub: string;
  sid: string;
  tenant_id: string;
  tenant_code?: string;
  iat: number;
  exp: number;
  jti: string;
};

export type ResolvedBeyuActor = {
  user: StoredUser;
  tenantId: string;
  role: string;
  permissions: string[];
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
    private readonly repo: IdentityRepository,
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

    const links = await this.conn.query<{ global_user_id: string; status: string }>(
      `SELECT global_user_id, status
         FROM beyu_identity.beyu_identity_links
        WHERE beyu_user_id = $1`,
      [claims.sub],
    );
    const link = links[0];
    if (!link || link.status !== "active") {
      throw new ForbiddenException("HEALTH_IDENTITY_LINK_NOT_ACTIVE");
    }

    const tenantRows = await this.conn.query<{ tenant_id: string; status: string }>(
      `SELECT tenant_id, status
         FROM beyu_identity.tenants
        WHERE beyu_tenant_id = $1`,
      [claims.tenant_id],
    );
    const localTenant = tenantRows[0];
    if (!localTenant || localTenant.status !== "active") {
      throw new ForbiddenException("HEALTH_TENANT_NOT_ACTIVE_OR_LINKED");
    }

    const user = await this.repo.findUserById(link.global_user_id);
    if (!user || user.account_status !== "active") {
      throw new ForbiddenException("HEALTH_LOCAL_ACCOUNT_NOT_ACTIVE");
    }
    const membership = await this.repo.findActiveMembership(user.global_user_id, localTenant.tenant_id);
    if (!membership) {
      throw new ForbiddenException("HEALTH_LOCAL_MEMBERSHIP_NOT_ACTIVE");
    }
    const permissions = await this.repo.permissionsForRole(membership.role);
    return {
      user,
      tenantId: localTenant.tenant_id,
      role: membership.role,
      permissions: permissions as string[],
      canonicalUserId: claims.sub,
    };
  }
}
