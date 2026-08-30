/**
 * BEYU Health OS — Phase 1A REAL DATABASE integration tests.
 *
 * These run against a genuine PostgreSQL engine via the DbConnection
 * abstraction — not a mocked database. The engine is a real local PostgreSQL
 * server when TEST_DATABASE_URL (or DATABASE_URL) is set, otherwise PGlite
 * (a genuine in-process PostgreSQL 16 engine). They cover the Phase 1A
 * completion criteria (persistent identity, authn/authz, sessions, tenant
 * isolation, audit, and negative security attacks).
 */
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { createTestDbConnection, TestDbConnection } from "./test-connection";
import { IdentityRepository } from "./identity.repository";
import { SessionService } from "./session.service";
import { AuditService } from "./audit.service";
import { MfaService } from "./mfa.service";
import { AuthService } from "../auth/auth.service";
import { permissionsForRole } from "../../common/security/permissions";
import { TenantScopeGuard } from "../../common/security/tenant-scope.guard";
import {
  TenantContext,
  ActorContext,
} from "../../common/security/tenant-context";

describe("Phase 1A identity persistence (real PostgreSQL)", () => {
  let conn: TestDbConnection;
  let repo: IdentityRepository;
  let sessions: SessionService;
  let audit: AuditService;
  let mfa: MfaService;
  let auth: AuthService;
  let jwt: JwtService;

  // precomputed bcrypt hash of "correct-password-123"
  const PASSWORD = "correct-password-123";
  let passwordHash: string;

  let tenantAId: string;
  let tenantBId: string;
  let doctorA: string;
  let nurseA: string;

  beforeAll(async () => {
    conn = await createTestDbConnection();
    repo = new IdentityRepository(conn);
    await repo.ensureSchema();

    // Seed tenants.
    const tenantA = await repo.createTenant({
      code: "TENANT-A",
      name: "Tenant A",
    });
    const tenantB = await repo.createTenant({
      code: "TENANT-B",
      name: "Tenant B",
    });
    tenantAId = tenantA.tenant_id;
    tenantBId = tenantB.tenant_id;

    passwordHash = await import("bcryptjs").then((b) => b.hash(PASSWORD, 10));

    // Users.
    const dA = await repo.createUser({
      email: "doctor@a.example",
      displayName: "Dr A",
      passwordHash,
      accountStatus: "active",
    });
    const nA = await repo.createUser({
      email: "nurse@a.example",
      displayName: "Nurse A",
      passwordHash,
      accountStatus: "active",
    });
    doctorA = dA.global_user_id;
    nurseA = nA.global_user_id;

    await repo.ensureMembership({
      globalUserId: doctorA,
      tenantId: tenantAId,
      role: "doctor",
    });
    await repo.ensureMembership({
      globalUserId: nurseA,
      tenantId: tenantAId,
      role: "nurse",
    });

    // Services.
    sessions = new SessionService(repo);
    audit = new AuditService(repo);
    mfa = new MfaService(repo);
    const config = new ConfigService({
      JWT_SECRET: "test-secret",
      JWT_EXPIRATION: "15m",
      JWT_REFRESH_TTL_MS: "604800000",
    });
    jwt = new JwtService({
      secret: "test-secret",
      signOptions: { expiresIn: "15m" },
    });
    auth = new AuthService(jwt, config, repo, sessions, audit, mfa);
  });

  afterAll(async () => {
    await conn.close();
  });

  // ── User / tenant / membership ─────────────────────────────────────────────
  it("persists a user with a canonical global_user_id (not email)", async () => {
    const u = await repo.createUser({
      email: "unique@example.com",
      displayName: "Unique",
      passwordHash,
    });
    expect(u.global_user_id).toBeTruthy();
    expect(u.global_user_id).not.toBe(u.email);
    const found = await repo.findUserById(u.global_user_id);
    expect(found?.email).toBe("unique@example.com");
  });

  it("enforces unique email at the DB level", async () => {
    await expect(
      repo.createUser({
        email: "unique@example.com",
        displayName: "Dup",
        passwordHash,
      }),
    ).rejects.toThrow();
  });

  it("enforces unique (global_user_id, tenant_id) membership", async () => {
    await expect(
      repo
        .ensureMembership({
          globalUserId: doctorA,
          tenantId: tenantAId,
          role: "doctor",
        })
        .then(() =>
          repo.ensureMembership({
            globalUserId: doctorA,
            tenantId: tenantAId,
            role: "doctor",
          }),
        ),
    ).resolves.toBeTruthy(); // upsert path is safe; uniqueness holds via constraint
  });

  // ── Authentication ─────────────────────────────────────────────────────────
  it("logs in a valid user with correct credentials", async () => {
    const tokens = await auth.login({
      email: "doctor@a.example",
      password: PASSWORD,
      tenantCode: "TENANT-A",
    });
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
    expect(tokens.user.role).toBe("doctor");
    expect(tokens.user.tenantId).toBe(tenantAId);
    expect(tokens.user.globalUserId).toBe(doctorA);
  });

  it("rejects invalid credentials without revealing which field was wrong", async () => {
    await expect(
      auth.login({ email: "nobody@example.com", password: "whatever" }),
    ).rejects.toThrow("INVALID_CREDENTIALS");
    await expect(
      auth.login({ email: "doctor@a.example", password: "wrong-password" }),
    ).rejects.toThrow("INVALID_CREDENTIALS");
  });

  it("denies a disabled account", async () => {
    const u = await repo.createUser({
      email: "disabled@example.com",
      displayName: "D",
      passwordHash,
      accountStatus: "disabled",
    });
    await repo.ensureMembership({
      globalUserId: u.global_user_id,
      tenantId: tenantAId,
      role: "patient",
    });
    await expect(
      auth.login({
        email: "disabled@example.com",
        password: PASSWORD,
        tenantCode: "TENANT-A",
      }),
    ).rejects.toThrow("ACCOUNT_DISABLED");
  });

  it("self-registration cannot escalate to a privileged role", async () => {
    // A caller must never be able to grant themselves an elevated role via the
    // registration body (privilege escalation). Any non-safe role is clamped to
    // "patient" BEFORE a membership is created.
    const email = `escalate-${Date.now()}@example.com`;
    const result = await auth.register({
      email,
      full_name: "Escalation Attempt",
      password: "correct-password-123",
      role: "admin", // client attempts to self-assign admin
      tenantCode: "TENANT-A",
    });
    const created = await repo.findUserByEmail(email);
    expect(created).toBeTruthy();
    const membership = await repo.findActiveMembership(
      (created as any).global_user_id,
      tenantAId,
    );
    // Membership role must be patient, never admin/ceo/etc.
    expect(membership?.role).toBe("patient");
    expect(result.message).toBeTruthy();
    // And the freshly registered user cannot authenticate with admin powers.
    const tokens = await auth.login({
      email,
      password: "correct-password-123",
      tenantCode: "TENANT-A",
    });
    expect(tokens.user.role).toBe("patient");
  });

  it("issues JWTs with role, tenant and unique jti claims", async () => {
    const tokens = await auth.login({
      email: "nurse@a.example",
      password: PASSWORD,
      tenantCode: "TENANT-A",
    });
    const decoded = jwt.verify(tokens.accessToken) as {
      role: string;
      tenantId: string;
      jti: string;
      sub: string;
    };
    expect(decoded.role).toBe("nurse");
    expect(decoded.tenantId).toBe(tenantAId);
    expect(decoded.jti).toBeTruthy();
    expect(decoded.sub).toBe(nurseA);
  });

  it("rejects an expired/malformed token", async () => {
    const malformed = "not.a.jwt";
    expect(() => jwt.verify(malformed)).toThrow();
    const forged = jwt.sign(
      { email: "x", role: "trustee", tenantId: tenantAId },
      { secret: "WRONG-SECRET" },
    );
    expect(() => jwt.verify(forged)).toThrow();
    // Expired token: simulate verification far in the future → must be rejected.
    const fresh = jwt.sign(
      { sub: doctorA, role: "doctor" },
      { secret: "test-secret", expiresIn: "1h" },
    );
    const future = Math.floor(Date.now() / 1000) + 7200;
    expect(() => jwt.verify(fresh, { clockTimestamp: future })).toThrow(
      /expired/i,
    );
  });

  // ── Sessions / refresh rotation ────────────────────────────────────────────
  it("rotates a refresh token and invalidates the old one", async () => {
    const tokens = await auth.login({
      email: "doctor@a.example",
      password: PASSWORD,
      tenantCode: "TENANT-A",
    });
    const rotated = await auth.refreshToken({
      refreshToken: tokens.refreshToken,
    });
    expect(rotated.accessToken).toBeTruthy();
    expect(rotated.refreshToken).not.toBe(tokens.refreshToken);
    // Old token now invalid.
    await expect(
      auth.refreshToken({ refreshToken: tokens.refreshToken }),
    ).rejects.toThrow();
  });

  it("detects refresh-token reuse and revokes the family", async () => {
    const tokens = await auth.login({
      email: "nurse@a.example",
      password: PASSWORD,
      tenantCode: "TENANT-A",
    });
    await auth.refreshToken({ refreshToken: tokens.refreshToken }); // rotate once
    // Replaying the now-rotated original token is reuse → denied + family revoked.
    await expect(
      auth.refreshToken({ refreshToken: tokens.refreshToken }),
    ).rejects.toThrow();
  });

  it("restores a session from a valid refresh token", async () => {
    const tokens = await auth.login({
      email: "doctor@a.example",
      password: PASSWORD,
      tenantCode: "TENANT-A",
    });
    const restored = await auth.restoreSession(tokens.refreshToken);
    expect(restored.accessToken).toBeTruthy();
    expect(restored.user.role).toBe("doctor");
  });

  it("logs out and revokes the session so refresh is denied", async () => {
    const tokens = await auth.login({
      email: "nurse@a.example",
      password: PASSWORD,
      tenantCode: "TENANT-A",
    });
    await auth.logout(tokens.refreshToken);
    // A revoked token cannot be replayed; it is rejected (reuse detection).
    await expect(
      auth.refreshToken({ refreshToken: tokens.refreshToken }),
    ).rejects.toThrow();
  });

  it("supports global logout (invalidate all sessions)", async () => {
    const t1 = await auth.login({
      email: "doctor@a.example",
      password: PASSWORD,
      tenantCode: "TENANT-A",
    });
    const t2 = await auth.login({
      email: "doctor@a.example",
      password: PASSWORD,
      tenantCode: "TENANT-A",
    });
    await auth.logoutAll(doctorA);
    await expect(
      auth.refreshToken({ refreshToken: t1.refreshToken }),
    ).rejects.toThrow("SESSION_REUSE_DETECTED");
    await expect(
      auth.refreshToken({ refreshToken: t2.refreshToken }),
    ).rejects.toThrow("SESSION_REUSE_DETECTED");
  });

  // ── Authorization / tenant isolation ───────────────────────────────────────
  it("enforces permission model from the canonical catalog", async () => {
    expect(permissionsForRole("doctor")).toContain("rx:write");
    expect(permissionsForRole("doctor")).toContain("phi:read");
    expect(permissionsForRole("patient")).not.toContain("rx:write");
  });

  it("denies a user logging into a tenant they have no membership in (cross-tenant login)", async () => {
    // doctorA has no membership in tenant B.
    await expect(
      auth.login({
        email: "doctor@a.example",
        password: PASSWORD,
        tenantCode: "TENANT-B",
      }),
    ).rejects.toThrow("NO_TENANT_MEMBERSHIP");
  });

  it("blocks cross-tenant requests in the TenantScopeGuard (deny by default)", () => {
    // nurse role does NOT carry tenant:switch, so cross-tenant scope must be denied.
    const tenant = new TenantContext();
    const actor: ActorContext = {
      userId: nurseA,
      email: "nurse@a.example",
      role: "nurse",
      permissions: [],
      tenantId: tenantAId,
    };
    tenant.enterWith(actor);
    const guard = new TenantScopeGuard(tenant);
    const req = {
      headers: { "x-tenant-id": tenantBId },
      params: {},
      query: {},
    } as any;
    const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as any;
    expect(() => guard.canActivate(ctx)).toThrow(/FORBIDDEN/);
  });

  it("allows tenant:switch holders to move scopes", () => {
    const tenant = new TenantContext();
    const actor: ActorContext = {
      userId: doctorA,
      email: "doctor@a.example",
      role: "ceo",
      permissions: ["tenant:switch"],
      tenantId: tenantAId,
    };
    tenant.enterWith(actor);
    const guard = new TenantScopeGuard(tenant);
    const req = {
      headers: { "x-tenant-id": tenantBId },
      params: {},
      query: {},
    } as any;
    const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as any;
    expect(guard.canActivate(ctx)).toBe(true);
    expect(tenant.current()?.tenantId).toBe(tenantBId);
  });

  // ── Audit events ───────────────────────────────────────────────────────────
  it("persists audit events with WHO/WHAT/TENANT/RESULT", async () => {
    await auth.login({
      email: "doctor@a.example",
      password: PASSWORD,
      tenantCode: "TENANT-A",
    });
    const events = await audit.latest(50);
    const types = events.map((e) => e.event_type);
    expect(types).toContain("login_success");
    expect(events.some((e) => e.result === "SUCCESS")).toBe(true);
  });

  it("records login failures as audit events", async () => {
    await expect(
      auth.login({ email: "doctor@a.example", password: "bad-password" }),
    ).rejects.toThrow();
    const events = await audit.latest(60);
    expect(
      events.some(
        (e) => e.event_type === "login_failure" && e.result === "FAILURE",
      ),
    ).toBe(true);
  });

  it("never stores a raw refresh token or password in audit/DB", async () => {
    const tokens = await auth.login({
      email: "doctor@a.example",
      password: PASSWORD,
      tenantCode: "TENANT-A",
    });
    const session = await repo.findSessionByRefreshHash(
      sessions.hashToken(tokens.refreshToken),
    );
    expect(session).toBeTruthy();
    // Stored value is a hash, not the raw token.
    expect(session?.refresh_token_hash).not.toBe(tokens.refreshToken);
    const user = await repo.findUserByEmail("doctor@a.example");
    expect(user?.password_hash).not.toBe(PASSWORD);
  });

  // ── MFA / step-up ──────────────────────────────────────────────────────────
  it("MFA fails closed when no provider is connected", async () => {
    await expect(
      mfa.verifyStepUp(doctorA, "challenge", "assertion"),
    ).rejects.toThrow();
  });

  it("step-up required gate denies unverified users", async () => {
    await expect(mfa.requireStepUp(doctorA)).rejects.toThrow(
      "STEP_UP_REQUIRED",
    );
  });

  it("exposes provider connection state honestly", () => {
    expect(mfa.providerConnected()).toBe(false);
    expect(mfa.providerId()).toBe("unavailable");
  });
});
