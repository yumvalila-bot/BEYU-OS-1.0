import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { ConfigService } from "@nestjs/config";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { createTestDbConnection } from "./test-connection";
import type { DbConnection } from "./db-connection";
import { IdentityRepository } from "./identity.repository";
import { ensureBoundarySchema, ensureBridgeSchema } from "./boundary-schema";
import { BeyuAuthorizationAssertionService } from "./beyu-authorization-assertion.service";

jest.setTimeout(30000);

describe("BEYU signed assertion → Health-local authorization", () => {
  let conn: DbConnection;
  let repo: IdentityRepository;
  let service: BeyuAuthorizationAssertionService;
  let localUserId: string;
  let localTenantId: string;
  let privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"];

  const issuer = "https://www.beyu.co.tz";
  const audience = "beyu-health-os";
  const kid = "health-test-ed25519";

  function assertion(overrides: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: issuer,
      aud: audience,
      sub: "BEYU_USER_TEST_01",
      sid: "BEYU_SESSION_TEST_01",
      tenant_id: "BEYU_TENANT_TEST_01",
      iat: now,
      exp: now + 60,
      jti: randomUUID(),
      ...overrides,
    })).toString("base64url");
    const input = `${header}.${payload}`;
    return `${input}.${sign(null, Buffer.from(input), privateKey).toString("base64url")}`;
  }

  beforeAll(async () => {
    conn = await createTestDbConnection() as DbConnection;
    repo = new IdentityRepository(conn as never);
    await repo.ensureSchema();
    await ensureBridgeSchema(conn);
    await ensureBoundarySchema(conn);

    const user = await repo.createUser({
      email: "local-health-user@example.test",
      displayName: "Local Health User",
      passwordHash: "test-only-hash",
      accountStatus: "active",
    });
    localUserId = user.global_user_id;
    const tenant = await repo.createTenant({ code: "HEALTH-LOCAL", name: "Health Local Tenant" });
    localTenantId = tenant.tenant_id;
    await repo.ensureMembership({ globalUserId: localUserId, tenantId: localTenantId, role: "doctor" });
    await conn.query(
      "UPDATE beyu_identity.tenants SET beyu_tenant_id = $2 WHERE tenant_id = $1",
      [localTenantId, "BEYU_TENANT_TEST_01"],
    );
    await conn.query(
      `INSERT INTO beyu_identity.beyu_identity_links
        (global_user_id, beyu_user_id, linked_by, status, source)
       VALUES ($1, $2, $3, 'active', 'test')`,
      [localUserId, "BEYU_USER_TEST_01", "integration-test"],
    );

    const keys = generateKeyPairSync("ed25519");
    privateKey = keys.privateKey;
    const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
    const config = new ConfigService({
      BEYU_AUTH_ASSERTION_KID: kid,
      BEYU_AUTH_ASSERTION_PUBLIC_KEY: publicKey,
      BEYU_AUTH_ASSERTION_ISSUER: issuer,
      BEYU_AUTH_ASSERTION_AUDIENCE: audience,
    } as never);
    service = new BeyuAuthorizationAssertionService(config, conn, repo);
  });

  afterAll(async () => {
    await conn.close();
  });

  it("verifies BEYU signature and resolves account, tenant, role and permissions locally", async () => {
    const actor = await service.verifyAndResolve(assertion());
    expect(actor.user.global_user_id).toBe(localUserId);
    expect(actor.tenantId).toBe(localTenantId);
    expect(actor.role).toBe("doctor");
    expect(actor.canonicalUserId).toBe("BEYU_USER_TEST_01");
  });

  it("rejects replay of a consumed assertion jti", async () => {
    const token = assertion();
    await service.verifyAndResolve(token);
    await expect(service.verifyAndResolve(token)).rejects.toThrow("BEYU_ASSERTION_REPLAYED");
  });

  it("rejects an assertion for a different issuer or audience", async () => {
    await expect(service.verifyAndResolve(assertion({ iss: "https://attacker.invalid" })))
      .rejects.toThrow("BEYU_ASSERTION_CLAIMS_INVALID");
    await expect(service.verifyAndResolve(assertion({ aud: "finance-os" })))
      .rejects.toThrow("BEYU_ASSERTION_CLAIMS_INVALID");
  });

  it("rejects expired and overlong assertions", async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(service.verifyAndResolve(assertion({ iat: now - 120, exp: now - 60 })))
      .rejects.toThrow("BEYU_ASSERTION_CLAIMS_INVALID");
    await expect(service.verifyAndResolve(assertion({ iat: now, exp: now + 3600 })))
      .rejects.toThrow("BEYU_ASSERTION_CLAIMS_INVALID");
  });

  it("denies a revoked local identity link", async () => {
    await conn.query(
      "UPDATE beyu_identity.beyu_identity_links SET status = 'revoked' WHERE global_user_id = $1",
      [localUserId],
    );
    await expect(service.verifyAndResolve(assertion())).rejects.toThrow("HEALTH_IDENTITY_LINK_NOT_ACTIVE");
    await conn.query(
      "UPDATE beyu_identity.beyu_identity_links SET status = 'active' WHERE global_user_id = $1",
      [localUserId],
    );
  });

  it("denies a missing local membership even when the signed BEYU identity is valid", async () => {
    await conn.query(
      "UPDATE beyu_identity.tenant_memberships SET status = 'revoked' WHERE global_user_id = $1 AND tenant_id = $2",
      [localUserId, localTenantId],
    );
    await expect(service.verifyAndResolve(assertion())).rejects.toThrow("HEALTH_LOCAL_MEMBERSHIP_NOT_ACTIVE");
  });
});
