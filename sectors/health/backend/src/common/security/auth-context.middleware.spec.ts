/**
 * Phase 1B — DB-driven authorization freshness. Proves that revoked
 * authorization (membership removal, disablement, security-version change)
 * takes effect on the next authenticated request, and that role/permissions are
 * loaded from the database (not trusted from token claims).
 */
import { describe, it, expect, beforeAll, afterAll, jest } from "@jest/globals";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import {
  createTestDbConnection,
  TestDbConnection,
} from "../../modules/identity/test-connection";
import { IdentityRepository } from "../../modules/identity/identity.repository";
import { AuditService } from "../../modules/identity/audit.service";
import { TenantContext, ActorContext } from "./tenant-context";
import { AuthContextMiddleware } from "./auth-context.middleware";
import { BeyuIdentityBridge } from "../../modules/identity/beyu-bridge";
import * as bcrypt from "bcryptjs";

jest.setTimeout(60_000);

function makeRequest(token: string | null): any {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: {},
  };
}

describe("AuthContextMiddleware (DB-driven authorization freshness)", () => {
  let conn: TestDbConnection;
  let repo: IdentityRepository;
  let audit: AuditService;
  let tenant: TenantContext;
  let jwt: JwtService;
  let bridge: BeyuIdentityBridge;
  let middleware: AuthContextMiddleware;

  let tenantAId: string;
  const SECRET = "test-secret";
  const PASSWORD = "password123";

  const enter = (token: string | null, onNext?: () => void) =>
    middleware.use(makeRequest(token), {} as any, () => onNext?.());

  const signToken = (
    sub: string,
    sv: number,
    tenantId: string | null,
    role = "doctor",
  ) =>
    jwt.sign(
      { sub, email: "doc@a.example", role, tenantId, sv },
      { secret: SECRET },
    );

  /** Fresh user + membership per test so tests never mutate shared state. */
  const freshDoctor = async () => {
    const hash = await bcrypt.hash(PASSWORD, 10);
    const user = await repo.createUser({
      email: `doc-${Math.random().toString(36).slice(2)}@a.example`,
      displayName: "Doc",
      passwordHash: hash,
    });
    await repo.ensureMembership({
      globalUserId: user.global_user_id,
      tenantId: tenantAId,
      role: "doctor",
    });
    // Canonical link (registration would create this in the API path).
    await bridge.linkUser({
      globalUserId: user.global_user_id,
      beyuUserId: `BEYU-TEST-${user.global_user_id}`,
      linkedBy: "spec-fixture",
    });
    return user.global_user_id;
  };

  beforeAll(async () => {
    conn = await createTestDbConnection();
    repo = new IdentityRepository(conn);
    await repo.ensureSchema();
    audit = new AuditService(repo);
    tenant = new TenantContext();
    jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: "15m" } });
    // Canonical identity bridge: the middleware requires every authenticated
    // actor to hold a canonical link. Fixture users are linked through the
    // REAL bridge machinery (synthetic canonical reference — the same
    // mechanism the identity test harness uses).
    bridge = new BeyuIdentityBridge(conn as never);
    await bridge.ensureBridgeSchema();
    middleware = new AuthContextMiddleware(
      jwt,
      repo,
      audit,
      tenant,
      new ConfigService({}),
      bridge,
    );
    const ta = await repo.createTenant({ code: "TENANT-A", name: "A" });
    tenantAId = ta.tenant_id;
  });

  afterAll(async () => {
    await conn.close();
  });

  it("enters a DB-derived actor for a valid, current token", async () => {
    const doctorId = await freshDoctor();
    const token = signToken(
      doctorId,
      await repo.getSecurityVersion(doctorId),
      tenantAId,
    );
    // The actor is scoped to the request's async chain, so capture it inside `next`.
    let actor: ActorContext | null = null;
    await enter(token, () => {
      actor = tenant.current();
    });
    expect(actor).not.toBeNull();
    expect(actor!.userId).toBe(doctorId);
    expect(actor!.role).toBe("doctor");
    expect(actor!.permissions).toContain("rx:write"); // from DB, not claims
    expect(actor!.tenantId).toBe(tenantAId);
    // run() scoping means the actor does NOT leak outside the request chain.
    expect(tenant.current()).toBeNull();
  });

  it("rejects a stale token after a security-version bump (role change)", async () => {
    const doctorId = await freshDoctor();
    const oldSv = await repo.getSecurityVersion(doctorId);
    const token = signToken(doctorId, oldSv, tenantAId);
    // Role change bumps security_version → old token must now be rejected.
    await repo.setMembershipRole(doctorId, tenantAId, "nurse");
    await expect(enter(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a disabled account even with a valid token", async () => {
    const doctorId = await freshDoctor();
    const token = signToken(
      doctorId,
      await repo.getSecurityVersion(doctorId),
      tenantAId,
    );
    await repo.setAccountStatus(doctorId, "disabled");
    await repo.bumpSecurityVersion(doctorId);
    await expect(enter(token)).rejects.toThrow("ACCOUNT_DISABLED");
  });

  it("rejects a token after tenant membership is revoked", async () => {
    const doctorId = await freshDoctor();
    // revokeMembership bumps security_version; sign the token with the CURRENT
    // (post-revoke) sv so the freshness check passes and the missing-membership
    // denial is reached.
    await repo.revokeMembership(doctorId, tenantAId);
    const token = signToken(
      doctorId,
      await repo.getSecurityVersion(doctorId),
      tenantAId,
    );
    await expect(enter(token)).rejects.toThrow("NO_TENANT_MEMBERSHIP");
  });

  it("rejects a valid token whose user has NO canonical identity link (federation gate)", async () => {
    const hash = await bcrypt.hash(PASSWORD, 10);
    const user = await repo.createUser({
      email: `unlinked-${Math.random().toString(36).slice(2)}@a.example`,
      displayName: "Unlinked",
      passwordHash: hash,
    });
    await repo.ensureMembership({
      globalUserId: user.global_user_id,
      tenantId: tenantAId,
      role: "doctor",
    });
    // NOTE: no canonical link created — exactly the unlinked-sector-user case.
    const token = signToken(
      user.global_user_id,
      await repo.getSecurityVersion(user.global_user_id),
      tenantAId,
    );
    await expect(enter(token)).rejects.toThrow("NO_CANONICAL_IDENTITY_LINK");
  });

  it("does not enter an actor for a request without a token", async () => {
    await enter(null);
    // No actor should have been established for this (fresh) async chain.
    expect(tenant.current()).toBeNull();
  });

  it("enforces configured issuer/audience on the access token", async () => {
    const doctorId = await freshDoctor();
    const sv = await repo.getSecurityVersion(doctorId);
    const cfg = new ConfigService({
      JWT_ISSUER: "beyu",
      JWT_AUDIENCE: "beyu-api",
    });
    const mw = new AuthContextMiddleware(
      jwt,
      repo,
      audit,
      new TenantContext(),
      cfg,
      bridge,
    );

    // Token signed WITHOUT issuer/audience → rejected (no actor established).
    const plain = signToken(doctorId, sv, tenantAId);
    let actorPlain: ActorContext | null = "sentinel" as any;
    await mw.use(makeRequest(plain), {} as any, () => {
      actorPlain = tenant.current();
    });
    expect(actorPlain).toBeNull();

    // Token signed WITH matching issuer/audience → accepted.
    const good = jwt.sign(
      {
        sub: doctorId,
        email: "doc@a.example",
        role: "doctor",
        tenantId: tenantAId,
        sv,
      },
      { secret: SECRET, issuer: "beyu", audience: "beyu-api" },
    );
    let actor: ActorContext | null = null;
    await mw.use(makeRequest(good), {} as any, () => {
      actor = tenant.current();
    });
    expect(actor).not.toBeNull();
    expect(actor!.userId).toBe(doctorId);
  });

  it("rejects alg:none / non-HS256 tokens (algorithm confusion)", async () => {
    const doctorId = await freshDoctor();
    const sv = await repo.getSecurityVersion(doctorId);
    const mw = new AuthContextMiddleware(
      jwt,
      repo,
      audit,
      new TenantContext(),
      new ConfigService({}),
      bridge,
    );

    // Craft an unsigned alg:none token. The middleware must NOT accept it.
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: doctorId,
        email: "doc@a.example",
        role: "doctor",
        tenantId: tenantAId,
        sv,
        iat: now,
        exp: now + 3600,
      }),
    ).toString("base64url");
    const noneToken = `${header}.${payload}.`;

    let actor: ActorContext | null = "sentinel" as any;
    await mw.use(makeRequest(noneToken), {} as any, () => {
      actor = tenant.current();
    });
    // alg:none must never establish an actor.
    expect(actor).toBeNull();

    // A token signed with a non-HS256 algorithm must also be rejected.
    const rs256Token = jwt.sign(
      { sub: doctorId, role: "doctor" },
      { secret: SECRET, algorithm: "HS384" },
    );
    let actor2: ActorContext | null = "sentinel" as any;
    await mw.use(makeRequest(rs256Token), {} as any, () => {
      actor2 = tenant.current();
    });
    expect(actor2).toBeNull();
  });
});
