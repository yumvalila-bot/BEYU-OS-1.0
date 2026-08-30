import { Inject, Injectable } from "@nestjs/common";
import { DB_CONNECTION, type DbConnection } from "./db-connection";
import { ensureIdentitySchema } from "./identity-schema";
import { Permission } from "../../common/security/permissions";

export type AccountStatus = "active" | "disabled" | "suspended";
export type AuthStatus =
  "none" | "mfa_enrolled" | "mfa_verified" | "step_up_required";
export type SessionStatus = "active" | "rotated" | "revoked" | "expired";

export interface StoredUser {
  global_user_id: string;
  email: string;
  display_name: string;
  password_hash: string;
  account_status: AccountStatus;
  auth_status: AuthStatus;
  security_version: number;
  created_at: Date;
  updated_at: Date;
  last_authenticated_at: Date | null;
}

export interface StoredTenant {
  tenant_id: string;
  tenant_code: string;
  name: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface StoredMembership {
  membership_id: string;
  global_user_id: string;
  tenant_id: string;
  role: string;
  status: string;
}

export interface StoredSession {
  session_id: string;
  global_user_id: string;
  tenant_id: string | null;
  refresh_token_hash: string;
  jti: string | null;
  status: SessionStatus;
  expires_at: Date;
  rotated_from: string | null;
  created_at: Date;
}

export interface AuthEventInput {
  globalUserId?: string | null;
  tenantId?: string | null;
  eventType: string;
  result: "SUCCESS" | "FAILURE" | "DENIED";
  context?: Record<string, unknown>;
}

/** Converts a snake_case row into a typed object. */
function mapUser(row: Record<string, unknown>): StoredUser {
  return {
    global_user_id: String(row.global_user_id),
    email: String(row.email),
    display_name: String(row.display_name),
    password_hash: String(row.password_hash),
    account_status: row.account_status as AccountStatus,
    auth_status: row.auth_status as AuthStatus,
    security_version: Number(row.security_version ?? 0),
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
    last_authenticated_at: row.last_authenticated_at
      ? new Date(row.last_authenticated_at as string)
      : null,
  };
}

function mapSession(row: Record<string, unknown>): StoredSession {
  return {
    session_id: String(row.session_id),
    global_user_id: String(row.global_user_id),
    tenant_id: row.tenant_id ? String(row.tenant_id) : null,
    refresh_token_hash: String(row.refresh_token_hash),
    jti: row.jti ? String(row.jti) : null,
    status: row.status as SessionStatus,
    expires_at: new Date(row.expires_at as string),
    rotated_from: row.rotated_from ? String(row.rotated_from) : null,
    created_at: new Date(row.created_at as string),
  };
}

/**
 * SQL-backed persistent identity repository. Works against real PostgreSQL (pg)
 * or the in-process PostgreSQL engine used in integration tests, via DbConnection.
 */
@Injectable()
export class IdentityRepository {
  constructor(@Inject(DB_CONNECTION) private readonly conn: DbConnection) {}

  async ensureSchema(): Promise<void> {
    await ensureIdentitySchema(this.conn);
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const rows = await this.conn.query(
      `SELECT * FROM beyu_identity.users WHERE email = $1`,
      [email.trim().toLowerCase()],
    );
    return rows.length ? mapUser(rows[0]) : null;
  }

  async findUserById(globalUserId: string): Promise<StoredUser | null> {
    const rows = await this.conn.query(
      `SELECT * FROM beyu_identity.users WHERE global_user_id = $1`,
      [globalUserId],
    );
    return rows.length ? mapUser(rows[0]) : null;
  }

  async createUser(input: {
    email: string;
    displayName: string;
    passwordHash: string;
    accountStatus?: AccountStatus;
  }): Promise<StoredUser> {
    const rows = await this.conn.query(
      `INSERT INTO beyu_identity.users (email, display_name, password_hash, account_status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        input.email.trim().toLowerCase(),
        input.displayName,
        input.passwordHash,
        input.accountStatus ?? "active",
      ],
    );
    return mapUser(rows[0]);
  }

  async setPasswordHash(
    globalUserId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.conn.query(
      `UPDATE beyu_identity.users SET password_hash = $2, updated_at = now() WHERE global_user_id = $1`,
      [globalUserId, passwordHash],
    );
  }

  async setAccountStatus(
    globalUserId: string,
    status: AccountStatus,
  ): Promise<void> {
    await this.conn.query(
      `UPDATE beyu_identity.users SET account_status = $2, updated_at = now() WHERE global_user_id = $1`,
      [globalUserId, status],
    );
  }

  async setAuthStatus(globalUserId: string, status: AuthStatus): Promise<void> {
    await this.conn.query(
      `UPDATE beyu_identity.users SET auth_status = $2, updated_at = now() WHERE global_user_id = $1`,
      [globalUserId, status],
    );
  }

  async getSecurityVersion(globalUserId: string): Promise<number> {
    const rows = await this.conn.query(
      `SELECT security_version FROM beyu_identity.users WHERE global_user_id = $1`,
      [globalUserId],
    );
    return rows.length ? Number(rows[0].security_version ?? 0) : -1;
  }

  /** Bump the user's security version — invalidates outstanding access tokens. */
  async bumpSecurityVersion(globalUserId: string): Promise<void> {
    await this.conn.query(
      `UPDATE beyu_identity.users SET security_version = security_version + 1, updated_at = now() WHERE global_user_id = $1`,
      [globalUserId],
    );
  }

  /** Revoke a tenant membership (role/power removal) and invalidate outstanding tokens. */
  async revokeMembership(
    globalUserId: string,
    tenantId: string,
  ): Promise<void> {
    await this.conn.transaction(async (tx) => {
      await tx.query(
        `UPDATE beyu_identity.tenant_memberships SET status = 'revoked', updated_at = now()
          WHERE global_user_id = $1 AND tenant_id = $2`,
        [globalUserId, tenantId],
      );
      await tx.query(
        `UPDATE beyu_identity.users SET security_version = security_version + 1, updated_at = now()
          WHERE global_user_id = $1`,
        [globalUserId],
      );
    });
  }

  /** Change a tenant membership role and invalidate outstanding tokens. */
  async setMembershipRole(
    globalUserId: string,
    tenantId: string,
    role: string,
  ): Promise<void> {
    await this.conn.transaction(async (tx) => {
      await tx.query(
        `UPDATE beyu_identity.tenant_memberships SET role = $3, status = 'active', updated_at = now()
          WHERE global_user_id = $1 AND tenant_id = $2`,
        [globalUserId, tenantId, role],
      );
      await tx.query(
        `UPDATE beyu_identity.users SET security_version = security_version + 1, updated_at = now()
          WHERE global_user_id = $1`,
        [globalUserId],
      );
    });
  }

  async recordLastAuthenticated(globalUserId: string): Promise<void> {
    await this.conn.query(
      `UPDATE beyu_identity.users SET last_authenticated_at = now() WHERE global_user_id = $1`,
      [globalUserId],
    );
  }

  // ── Tenants ────────────────────────────────────────────────────────────────
  async createTenant(input: {
    code: string;
    name: string;
    metadata?: Record<string, unknown>;
  }): Promise<StoredTenant> {
    const rows = await this.conn.query(
      `INSERT INTO beyu_identity.tenants (tenant_code, name, metadata)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.code, input.name, JSON.stringify(input.metadata ?? {})],
    );
    return {
      tenant_id: String(rows[0].tenant_id),
      tenant_code: String(rows[0].tenant_code),
      name: String(rows[0].name),
      status: String(rows[0].status),
      metadata: (rows[0].metadata as Record<string, unknown>) ?? {},
      created_at: new Date(rows[0].created_at as string),
      updated_at: new Date(rows[0].updated_at as string),
    };
  }

  async findTenantByCode(code: string): Promise<StoredTenant | null> {
    const rows = await this.conn.query(
      `SELECT * FROM beyu_identity.tenants WHERE tenant_code = $1`,
      [code],
    );
    return rows.length ? this.mapTenant(rows[0]) : null;
  }

  async findTenantById(tenantId: string): Promise<StoredTenant | null> {
    const rows = await this.conn.query(
      `SELECT * FROM beyu_identity.tenants WHERE tenant_id = $1`,
      [tenantId],
    );
    return rows.length ? this.mapTenant(rows[0]) : null;
  }

  private mapTenant(row: Record<string, unknown>): StoredTenant {
    return {
      tenant_id: String(row.tenant_id),
      tenant_code: String(row.tenant_code),
      name: String(row.name),
      status: String(row.status),
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      created_at: new Date(row.created_at as string),
      updated_at: new Date(row.updated_at as string),
    };
  }

  // ── Memberships ────────────────────────────────────────────────────────────
  async ensureMembership(input: {
    globalUserId: string;
    tenantId: string;
    role: string;
  }): Promise<StoredMembership> {
    const rows = await this.conn.query(
      `INSERT INTO beyu_identity.tenant_memberships (global_user_id, tenant_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (global_user_id, tenant_id)
       DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = now()
       RETURNING *`,
      [input.globalUserId, input.tenantId, input.role],
    );
    return this.mapMembership(rows[0]);
  }

  async findActiveMembership(
    globalUserId: string,
    tenantId: string,
  ): Promise<StoredMembership | null> {
    const rows = await this.conn.query(
      `SELECT * FROM beyu_identity.tenant_memberships
       WHERE global_user_id = $1 AND tenant_id = $2 AND status = 'active'`,
      [globalUserId, tenantId],
    );
    return rows.length ? this.mapMembership(rows[0]) : null;
  }

  private mapMembership(row: Record<string, unknown>): StoredMembership {
    return {
      membership_id: String(row.membership_id),
      global_user_id: String(row.global_user_id),
      tenant_id: String(row.tenant_id),
      role: String(row.role),
      status: String(row.status),
    };
  }

  // ── Roles / Permissions ────────────────────────────────────────────────────
  async permissionsForRole(role: string): Promise<Permission[]> {
    const rows = await this.conn.query(
      `SELECT rp.permission_id
         FROM beyu_identity.role_permissions rp
         JOIN beyu_identity.roles r ON r.role_id = rp.role_id
        WHERE rp.role_id = $1`,
      [role],
    );
    return rows.map((r) => String(r.permission_id) as Permission);
  }

  async allRoles(): Promise<
    Array<{ role_id: string; label: string; cadre: string | null }>
  > {
    const rows = await this.conn.query(
      `SELECT role_id, label, cadre FROM beyu_identity.roles ORDER BY role_id`,
    );
    return rows.map((r) => ({
      role_id: String(r.role_id),
      label: String(r.label),
      cadre: r.cadre ? String(r.cadre) : null,
    }));
  }

  // ── Sessions / refresh tokens (hash only) ─────────────────────────────────
  async createSession(input: {
    globalUserId: string;
    tenantId: string | null;
    refreshTokenHash: string;
    jti: string | null;
    expiresAt: Date;
  }): Promise<StoredSession> {
    const rows = await this.conn.query(
      `INSERT INTO beyu_identity.sessions (global_user_id, tenant_id, refresh_token_hash, jti, status, expires_at)
       VALUES ($1, $2, $3, $4, 'active', $5)
       RETURNING *`,
      [
        input.globalUserId,
        input.tenantId,
        input.refreshTokenHash,
        input.jti,
        input.expiresAt,
      ],
    );
    return mapSession(rows[0]);
  }

  async findSessionByRefreshHash(
    refreshTokenHash: string,
  ): Promise<StoredSession | null> {
    const rows = await this.conn.query(
      `SELECT * FROM beyu_identity.sessions WHERE refresh_token_hash = $1`,
      [refreshTokenHash],
    );
    return rows.length ? mapSession(rows[0]) : null;
  }

  async updateSessionStatus(
    sessionId: string,
    status: SessionStatus,
  ): Promise<void> {
    await this.conn.query(
      `UPDATE beyu_identity.sessions SET status = $2, updated_at = now() WHERE session_id = $1`,
      [sessionId, status],
    );
  }

  async updateSessionJti(sessionId: string, jti: string): Promise<void> {
    await this.conn.query(
      `UPDATE beyu_identity.sessions SET jti = $2, updated_at = now(), last_used_at = now() WHERE session_id = $1`,
      [sessionId, jti],
    );
  }

  async revokeSessionFamily(seedSessionId: string): Promise<void> {
    // Revoke the seed session and any sessions derived from it (rotation chain).
    await this.conn.query(
      `UPDATE beyu_identity.sessions
          SET status = 'revoked', updated_at = now()
        WHERE session_id = $1
           OR rotated_from = $1
           OR rotated_from IN (SELECT session_id FROM beyu_identity.sessions WHERE rotated_from = $1)`,
      [seedSessionId],
    );
  }

  async revokeAllUserSessions(globalUserId: string): Promise<void> {
    await this.conn.query(
      `UPDATE beyu_identity.sessions SET status = 'revoked', updated_at = now()
        WHERE global_user_id = $1 AND status = 'active'`,
      [globalUserId],
    );
  }

  // ── Audit events ───────────────────────────────────────────────────────────
  async recordAuthEvent(input: AuthEventInput): Promise<string> {
    const rows = await this.conn.query(
      `INSERT INTO beyu_identity.auth_events (global_user_id, tenant_id, event_type, result, context)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING event_id`,
      [
        input.globalUserId ?? null,
        input.tenantId ?? null,
        input.eventType,
        input.result,
        JSON.stringify(input.context ?? {}),
      ],
    );
    return String(rows[0].event_id);
  }

  async latestAuthEvents(limit = 50): Promise<Array<Record<string, unknown>>> {
    const rows = await this.conn.query(
      `SELECT event_id, global_user_id, tenant_id, event_type, result, context, created_at
         FROM beyu_identity.auth_events ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return rows;
  }
}
