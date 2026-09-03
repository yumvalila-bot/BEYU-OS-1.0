/**
 * Human access-token matrix (Phase 7 / Phase 9 of the identity federation
 * program).
 *
 * Deterministic expected outcome for every token case against the REAL
 * AuthContextMiddleware + REAL database (PGlite) + REAL canonical link
 * machinery. Service-token cases are covered by the root verification matrix
 * (tests/internal/service-auth.test.ts), service-token.spec.ts, and the
 * stub-verified LIVE federation spec.
 *
 *   VALID                        → actor established
 *   EXPIRED                      → no actor (jwt verify fails)
 *   WRONG_SIGNATURE              → no actor
 *   WRONG_ALGORITHM (alg:none)   → no actor
 *   WRONG_AUDIENCE               → no actor
 *   WRONG_ISSUER                 → no actor
 *   MISSING_SUBJECT              → no actor
 *   MALFORMED_TOKEN              → no actor
 *   STALE_SECURITY_VERSION       → 401 AUTHORIZATION_CHANGED
 *   REVOKED (disabled account)   → 401 ACCOUNT_DISABLED
 *   NO_CANONICAL_LINK            → 401 NO_CANONICAL_IDENTITY_LINK
 *   WRONG_TENANT (no membership) → 401 NO_TENANT_MEMBERSHIP
 *
 * REPLAYED_REQUEST (idempotency) and CSRF replay are covered by the
 * idempotency + CSRF suites; WRONG_SERVICE/INSUFFICIENT_SCOPE are
 * service-token concerns (see root matrix). MISSING_TENANT is the
 * tenantless-login case (role falls back to patient; still requires link).
 */
import { describe, it, expect, beforeAll, afterAll, jest } from "@jest/globals";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import {
  createTestDbConnection,
  TestDbConnection,
} from "../../modules/identity/test-connection";
import { IdentityRepository } from "../../modules/identity/identity.repository";
import { AuditService } from "../../modules/identity/audit.service";
import { BeyuIdentityBridge } from "../../modules/identity/beyu-bridge";
import { TenantContext, ActorContext } from "./tenant-context";
import { AuthContextMiddleware } from "./auth-context.middleware";

jest.setTimeout(60_000);

function makeRequest(token: string | null): any {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: {},
  };
}

describe("Human access-token matrix (AuthContextMiddleware, real DB)", () => {
  let conn: TestDbConnection;
  let repo: IdentityRepository;
  let audit: AuditService;
  let tenant: TenantContext;
  let jwt: JwtService;
  let bridge: BeyuIdentityBridge;
  let middleware: AuthContextMiddleware;
  let tenantAId: string;
  const SECRET = "matrix-secret";

  const enter = (token: string | null) =>
    middleware.use(makeRequest(token), {} as any, () => undefined);

  const sign = (payload: Record<string, unknown>, opts: Record<string, unknown> = {}) =>
    jwt.sign(payload, { secret: SECRET, ...opts });

  /** Create a user + membership + canonical link; return its id + current sv. */
  async function linkedUser(tenantId: string, role = "doctor") {
    const user = await repo.createUser({
      email: `mx-${Math.random().toString(36).slice(2)}@a.example`,
      displayName: "Matrix",
      passwordHash: "x",
      accountStatus: "active",
    });
    if (tenantId) {
      await repo.ensureMembership({ globalUserId: user.global_user_id, tenantId, role });
    }
    await bridge.linkUser({
      globalUserId: user.global_user_id,
      beyuUserId: `BEYU-TEST-${user.global_user_id}`,
      linkedBy: "spec-fixture",
    });
    return { id: user.global_user_id, sv: await repo.getSecurityVersion(user.global_user_id) };
  }

  beforeAll(async () => {
    conn = await createTestDbConnection();
    repo = new IdentityRepository(conn);
    await repo.ensureSchema();
    audit = new AuditService(repo);
    tenant = new TenantContext();
    jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: "15m" } });
    bridge = new BeyuIdentityBridge(conn as never);
    await bridge.ensureBridgeSchema();
    middleware = new AuthContextMiddleware(
      jwt,
      repo,
      audit,
      tenant,
      new ConfigService({ JWT_ISSUER: "beyu", JWT_AUDIENCE: "beyu-api" }),
      bridge,
    );
    const ta = await repo.createTenant({ code: "MATRIX-A", name: "A" });
    tenantAId = ta.tenant_id;
  });

  afterAll(async () => {
    await conn.close();
  });

  it("VALID token → actor established with canonical link present", async () => {
    const u = await linkedUser(tenantAId);
    const token = sign(
      { sub: u.id, email: "m@a.example", role: "doctor", tenantId: tenantAId, sv: u.sv },
      { issuer: "beyu", audience: "beyu-api" },
    );
    let actor: ActorContext | null = null;
    await middleware.use(makeRequest(token), {} as any, () => {
      actor = tenant.current();
    });
    expect(actor).not.toBeNull();
    expect((actor as unknown as ActorContext).userId).toBe(u.id);
  });

  it("EXPIRED token → no actor", async () => {
    const u = await linkedUser(tenantAId);
    const token = sign(
      { sub: u.id, email: "m@a.example", role: "doctor", tenantId: tenantAId, sv: u.sv },
      { issuer: "beyu", audience: "beyu-api", expiresIn: "-1s" },
    );
    let actor: ActorContext | null = "sentinel" as any;
    await middleware.use(makeRequest(token), {} as any, () => {
      actor = tenant.current();
    });
    expect(actor).toBeNull();
  });

  it("WRONG_SIGNATURE token → no actor", async () => {
    const u = await linkedUser(tenantAId);
    const forged = new JwtService({ secret: "other-secret" });
    const token = forged.sign(
      { sub: u.id, email: "m@a.example", role: "doctor", tenantId: tenantAId, sv: u.sv },
      { issuer: "beyu", audience: "beyu-api" },
    );
    let actor: ActorContext | null = "sentinel" as any;
    await middleware.use(makeRequest(token), {} as any, () => {
      actor = tenant.current();
    });
    expect(actor).toBeNull();
  });

  it("WRONG_ALGORITHM (alg:none) token → no actor", async () => {
    const u = await linkedUser(tenantAId);
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: u.id, email: "m@a.example", role: "doctor", tenantId: tenantAId, sv: u.sv, exp: Math.floor(Date.now() / 1000) + 600 }),
    ).toString("base64url");
    let actor: ActorContext | null = "sentinel" as any;
    await middleware.use(makeRequest(`${header}.${payload}.`), {} as any, () => {
      actor = tenant.current();
    });
    expect(actor).toBeNull();
  });

  it("WRONG_AUDIENCE token → no actor", async () => {
    const u = await linkedUser(tenantAId);
    const token = sign(
      { sub: u.id, email: "m@a.example", role: "doctor", tenantId: tenantAId, sv: u.sv },
      { issuer: "beyu", audience: "somebody-else" },
    );
    let actor: ActorContext | null = "sentinel" as any;
    await middleware.use(makeRequest(token), {} as any, () => {
      actor = tenant.current();
    });
    expect(actor).toBeNull();
  });

  it("WRONG_ISSUER token → no actor", async () => {
    const u = await linkedUser(tenantAId);
    const token = sign(
      { sub: u.id, email: "m@a.example", role: "doctor", tenantId: tenantAId, sv: u.sv },
      { issuer: "evil", audience: "beyu-api" },
    );
    let actor: ActorContext | null = "sentinel" as any;
    await middleware.use(makeRequest(token), {} as any, () => {
      actor = tenant.current();
    });
    expect(actor).toBeNull();
  });

  it("MISSING_SUBJECT token → no actor", async () => {
    const token = sign(
      { email: "m@a.example", role: "doctor", tenantId: tenantAId, sv: 0 },
      { issuer: "beyu", audience: "beyu-api" },
    );
    let actor: ActorContext | null = "sentinel" as any;
    await middleware.use(makeRequest(token), {} as any, () => {
      actor = tenant.current();
    });
    expect(actor).toBeNull();
  });

  it("MALFORMED token → no actor", async () => {
    let actor: ActorContext | null = "sentinel" as any;
    await middleware.use(makeRequest("not-a-jwt"), {} as any, () => {
      actor = tenant.current();
    });
    expect(actor).toBeNull();
  });

  it("STALE_SECURITY_VERSION → 401 AUTHORIZATION_CHANGED", async () => {
    const u = await linkedUser(tenantAId);
    const token = sign(
      { sub: u.id, email: "m@a.example", role: "doctor", tenantId: tenantAId, sv: u.sv },
      { issuer: "beyu", audience: "beyu-api" },
    );
    // Role change bumps security_version AFTER the token was issued.
    await repo.setMembershipRole(u.id, tenantAId, "nurse");
    await expect(enter(token)).rejects.toThrow("AUTHORIZATION_CHANGED");
  });

  it("REVOKED (disabled account) → 401 ACCOUNT_DISABLED", async () => {
    const u = await linkedUser(tenantAId);
    await repo.setAccountStatus(u.id, "disabled");
    const token = sign(
      { sub: u.id, email: "m@a.example", role: "doctor", tenantId: tenantAId, sv: await repo.getSecurityVersion(u.id) },
      { issuer: "beyu", audience: "beyu-api" },
    );
    await expect(enter(token)).rejects.toThrow("ACCOUNT_DISABLED");
  });

  it("NO_CANONICAL_LINK → 401 NO_CANONICAL_IDENTITY_LINK (federation gate)", async () => {
    const user = await repo.createUser({
      email: `mx-unlinked-${Math.random().toString(36).slice(2)}@a.example`,
      displayName: "Unlinked",
      passwordHash: "x",
      accountStatus: "active",
    });
    await repo.ensureMembership({ globalUserId: user.global_user_id, tenantId: tenantAId, role: "doctor" });
    const token = sign(
      {
        sub: user.global_user_id,
        email: "m@a.example",
        role: "doctor",
        tenantId: tenantAId,
        sv: await repo.getSecurityVersion(user.global_user_id),
      },
      { issuer: "beyu", audience: "beyu-api" },
    );
    await expect(enter(token)).rejects.toThrow("NO_CANONICAL_IDENTITY_LINK");
  });

  it("WRONG_TENANT (no membership) → 401 NO_TENANT_MEMBERSHIP", async () => {
    const u = await linkedUser(tenantAId);
    const other = await repo.createTenant({ code: `MATRIX-B-${Math.random().toString(36).slice(2, 6)}`, name: "B" });
    const token = sign(
      { sub: u.id, email: "m@a.example", role: "doctor", tenantId: other.tenant_id, sv: u.sv },
      { issuer: "beyu", audience: "beyu-api" },
    );
    await expect(enter(token)).rejects.toThrow("NO_TENANT_MEMBERSHIP");
  });

  it("MISSING_TENANT (tenantless) still requires the canonical link", async () => {
    const user = await repo.createUser({
      email: `mx-notenant-${Math.random().toString(36).slice(2)}@a.example`,
      displayName: "NoTenant",
      passwordHash: "x",
      accountStatus: "active",
    });
    // No membership, no link.
    const token = sign(
      { sub: user.global_user_id, email: "m@a.example", role: "patient", sv: 0 },
      { issuer: "beyu", audience: "beyu-api" },
    );
    await expect(enter(token)).rejects.toThrow("NO_CANONICAL_IDENTITY_LINK");
    // With a link, the tenantless token is accepted (patient default role).
    await bridge.linkUser({
      globalUserId: user.global_user_id,
      beyuUserId: `BEYU-TEST-${user.global_user_id}`,
      linkedBy: "spec-fixture",
    });
    const sv = await repo.getSecurityVersion(user.global_user_id);
    const token2 = sign(
      { sub: user.global_user_id, email: "m@a.example", role: "patient", sv },
      { issuer: "beyu", audience: "beyu-api" },
    );
    let actor: ActorContext | null = null;
    await middleware.use(makeRequest(token2), {} as any, () => {
      actor = tenant.current();
    });
    expect(actor).not.toBeNull();
  });
});
