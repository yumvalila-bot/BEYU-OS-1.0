import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import { LoginDto, RegisterDto, RefreshTokenDto } from "./dto";
import {
  IdentityRepository,
  StoredUser,
} from "../identity/identity.repository";
import { SessionService } from "../identity/session.service";
import { AuditService } from "../identity/audit.service";
import { MfaService } from "../identity/mfa.service";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    globalUserId: string;
    email: string;
    displayName: string;
    role: string;
    tenantId: string | null;
  };
}

export interface LoginContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly repo: IdentityRepository,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly mfa: MfaService,
  ) {}

  // ── Registration ───────────────────────────────────────────────────────────
  async register(registerDto: RegisterDto) {
    const existing = await this.repo.findUserByEmail(registerDto.email);
    if (existing) {
      throw new ConflictException("A user with this email already exists");
    }
    const passwordHash = await bcrypt.hash(registerDto.password, 12);
    const user = await this.repo.createUser({
      email: registerDto.email,
      displayName: registerDto.full_name,
      passwordHash,
      accountStatus: "active",
    });

    // Membership (role + tenant) is derived server-side, never from the client.
    // Only a curated set of roles may be SELF-assigned at registration (today:
    // "patient"). The role is clamped BEFORE any membership is created so a
    // caller can never grant themselves an elevated role via the registration
    // body — this is an authorization boundary, not just a display concern.
    const SAFE_SELF_REGISTER_ROLES = new Set(["patient"]);
    const requestedRole = registerDto.role ?? "patient";
    const role = SAFE_SELF_REGISTER_ROLES.has(requestedRole)
      ? requestedRole
      : "patient";
    let tenantId: string | null = null;
    if (registerDto.tenantCode) {
      const tenant = await this.repo.findTenantByCode(registerDto.tenantCode);
      if (tenant) {
        await this.repo.ensureMembership({
          globalUserId: user.global_user_id,
          tenantId: tenant.tenant_id,
          role,
        });
        tenantId = tenant.tenant_id;
      }
    }
    if (!tenantId) {
      await this.repo.recordAuthEvent({
        globalUserId: user.global_user_id,
        eventType: "user_registered",
        result: "SUCCESS",
      });
      return {
        message:
          "User registered successfully. Awaiting tenant membership assignment.",
        user: this.publicUser(user),
      };
    }

    await this.repo.recordAuthEvent({
      globalUserId: user.global_user_id,
      tenantId,
      eventType: "user_registered",
      result: "SUCCESS",
      context: { role },
    });
    return {
      message: "User registered successfully",
      user: this.publicUser(user),
    };
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  async login(loginDto: LoginDto, ctx: LoginContext = {}): Promise<AuthTokens> {
    const user = await this.repo.findUserByEmail(loginDto.email);
    // Generic failure to avoid account enumeration / sensitive leakage.
    if (!user) {
      await this.audit.record({
        eventType: "login_failure",
        result: "FAILURE",
        context: { reason: "unknown_user", ...ctx },
      });
      throw new UnauthorizedException("INVALID_CREDENTIALS");
    }
    if (user.account_status !== "active") {
      await this.audit.record({
        globalUserId: user.global_user_id,
        eventType: "login_denied",
        result: "DENIED",
        context: {
          reason: "account_disabled",
          status: user.account_status,
          ...ctx,
        },
      });
      throw new UnauthorizedException("ACCOUNT_DISABLED");
    }
    const valid = await bcrypt.compare(loginDto.password, user.password_hash);
    if (!valid) {
      await this.audit.record({
        globalUserId: user.global_user_id,
        eventType: "login_failure",
        result: "FAILURE",
        context: { reason: "bad_password", ...ctx },
      });
      throw new UnauthorizedException("INVALID_CREDENTIALS");
    }

    // Tenant resolution server-side (never from client body).
    const tenant = loginDto.tenantCode
      ? await this.repo.findTenantByCode(loginDto.tenantCode)
      : null;
    const tenantId = tenant ? tenant.tenant_id : null;

    const { role } = await this.resolveActor(user, tenantId);

    await this.repo.recordLastAuthenticated(user.global_user_id);
    await this.audit.record({
      globalUserId: user.global_user_id,
      tenantId,
      eventType: "login_success",
      result: "SUCCESS",
      context: { ...ctx, role },
    });
    return this.issueTokens(user, role, tenantId, ctx);
  }
  async refreshToken(refreshTokenDto: RefreshTokenDto, ctx: LoginContext = {}) {
    const presented = refreshTokenDto.refreshToken;
    const issuedRefresh = this.sessions.newJti(); // used as new raw refresh token
    const accessJti = this.sessions.newJti();
    const expiresAt = new Date(Date.now() + this.refreshTtlMs());

    const { session } = await this.sessions.rotateSession(
      presented,
      issuedRefresh,
      accessJti,
      expiresAt,
    );
    const user = await this.repo.findUserById(session.global_user_id);
    if (!user || user.account_status !== "active") {
      throw new UnauthorizedException("ACCOUNT_DISABLED");
    }
    const { role } = await this.resolveActor(user, session.tenant_id);

    await this.audit.record({
      globalUserId: user.global_user_id,
      tenantId: session.tenant_id,
      eventType: "token_refresh",
      result: "SUCCESS",
      context: { ...ctx, jti: accessJti },
    });

    return {
      accessToken: this.signAccessToken(
        user,
        role,
        session.tenant_id,
        accessJti,
      ),
      refreshToken: issuedRefresh,
    };
  }

  // ── Session restoration ────────────────────────────────────────────────────
  async restoreSession(refreshToken: string) {
    const session = await this.sessions.assertSessionActive(refreshToken);
    const user = await this.repo.findUserById(session.global_user_id);
    if (!user || user.account_status !== "active") {
      throw new UnauthorizedException("ACCOUNT_DISABLED");
    }
    const { role } = await this.resolveActor(user, session.tenant_id);
    const accessJti = this.sessions.newJti();
    await this.sessions.updateJti(session.session_id, accessJti);
    return {
      accessToken: this.signAccessToken(
        user,
        role,
        session.tenant_id,
        accessJti,
      ),
      user: { ...this.publicUser(user), role, tenantId: session.tenant_id },
    };
  }

  // ── Logout / revocation ────────────────────────────────────────────────────
  async logout(refreshToken: string): Promise<{ message: string }> {
    await this.sessions.revokeSession(refreshToken);
    return { message: "Logged out successfully" };
  }

  async logoutAll(globalUserId: string): Promise<{ message: string }> {
    await this.sessions.revokeAllSessions(globalUserId);
    return { message: "All sessions revoked" };
  }

  // ── Profile ────────────────────────────────────────────────────────────────
  async getProfile(globalUserId: string) {
    const user = await this.repo.findUserById(globalUserId);
    if (!user) {
      throw new UnauthorizedException("USER_NOT_FOUND");
    }
    const roles = await this.repo.allRoles();
    return {
      ...this.publicUser(user),
      roles,
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────────
  private async resolveActor(
    user: StoredUser,
    tenantId: string | null,
  ): Promise<{ role: string; permissions: string[] }> {
    if (!tenantId) {
      return { role: "patient", permissions: [] };
    }
    const membership = await this.repo.findActiveMembership(
      user.global_user_id,
      tenantId,
    );
    if (!membership) {
      throw new UnauthorizedException("NO_TENANT_MEMBERSHIP");
    }
    const permissions = await this.repo.permissionsForRole(membership.role);
    return { role: membership.role, permissions: permissions as string[] };
  }

  private async issueTokens(
    user: StoredUser,
    role: string,
    tenantId: string | null,
    _ctx: LoginContext = {},
  ): Promise<AuthTokens> {
    const accessJti = this.sessions.newJti();
    const rawRefresh = this.sessions.newJti();
    const expiresAt = new Date(Date.now() + this.refreshTtlMs());
    // Persist the session with a hash of the refresh token BEFORE returning,
    // so a returned refresh token is always revocable.
    await this.sessions.createSession({
      globalUserId: user.global_user_id,
      tenantId,
      refreshToken: rawRefresh,
      jti: accessJti,
      expiresAt,
    });

    return {
      accessToken: this.signAccessToken(user, role, tenantId, accessJti),
      refreshToken: rawRefresh,
      user: {
        globalUserId: user.global_user_id,
        email: user.email,
        displayName: user.display_name,
        role,
        tenantId,
      },
    };
  }

  private signAccessToken(
    user: StoredUser,
    role: string,
    tenantId: string | null,
    jti: string,
  ): string {
    return this.jwtService.sign(
      {
        email: user.email,
        role,
        tenantId,
        jti,
        // Security version: bumped on disable / role / membership / permission
        // change; the server rejects any access token with a stale version.
        sv: user.security_version,
      },
      {
        subject: user.global_user_id,
        expiresIn: this.configService.get("JWT_EXPIRATION", "15m"),
      },
    );
  }

  private refreshTtlMs(): number {
    return Number(this.configService.get("JWT_REFRESH_TTL_MS", "604800000")); // 7 days
  }

  private publicUser(user: StoredUser) {
    return {
      globalUserId: user.global_user_id,
      email: user.email,
      displayName: user.display_name,
    };
  }
}
